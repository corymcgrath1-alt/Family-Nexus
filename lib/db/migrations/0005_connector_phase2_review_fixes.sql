-- Forward-only remediation for connector checkpoint recovery, stale leases, and mapping targets.

ALTER TABLE connector_sync_checkpoints
  ADD COLUMN backfill_time_min timestamp with time zone,
  ADD COLUMN backfill_time_max timestamp with time zone,
  ADD COLUMN backfill_query_version text,
  ADD COLUMN backfill_query_fingerprint text;

-- A legacy page token cannot safely be resumed without its exact Google query.
-- Retire it and use the existing bounded, idempotent recovery path.
UPDATE connector_sync_checkpoints
SET next_page_token = NULL,
    backfill_state = 'recovery_required',
    last_successful_page = 0,
    cursor_invalidated_at = coalesce(cursor_invalidated_at, now()),
    updated_at = now()
WHERE next_page_token IS NOT NULL;

ALTER TABLE connector_sync_checkpoints
  ADD CONSTRAINT connector_sync_checkpoints_backfill_query_ck CHECK (
    (
      next_page_token IS NULL
      AND backfill_time_min IS NULL
      AND backfill_time_max IS NULL
      AND backfill_query_version IS NULL
      AND backfill_query_fingerprint IS NULL
    )
    OR
    (
      next_page_token IS NOT NULL
      AND backfill_query_version IS NOT NULL
      AND backfill_query_version <> ''
      AND backfill_query_fingerprint IS NOT NULL
      AND backfill_query_fingerprint ~ '^[0-9a-f]{64}$'
      AND (
        (backfill_time_min IS NULL AND backfill_time_max IS NULL)
        OR (
          backfill_time_min IS NOT NULL
          AND backfill_time_max IS NOT NULL
          AND backfill_time_min < backfill_time_max
        )
      )
    )
  );

CREATE OR REPLACE FUNCTION lighthouse_claim_due_connector()
RETURNS TABLE (
  connection_id uuid,
  owner_user_id integer,
  household_id integer,
  lease_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH candidate AS (
    SELECT connection.id, connection.state = 'syncing' AS recovering_stale_sync
    FROM public.connector_connections connection
    WHERE connection.schedule_enabled
      AND connection.active_consent_id IS NOT NULL
      AND (
        (
          connection.state IN ('active', 'degraded')
          AND (connection.sync_lease_id IS NULL OR connection.sync_lease_expires_at < now())
          AND (
            connection.last_successful_sync_at IS NULL
            OR connection.last_successful_sync_at < now() - interval '15 minutes'
          )
        )
        OR
        (
          connection.state = 'syncing'
          AND (connection.sync_lease_id IS NULL OR connection.sync_lease_expires_at < now())
        )
      )
    ORDER BY
      (connection.state = 'syncing') DESC,
      connection.sync_lease_expires_at NULLS FIRST,
      connection.last_successful_sync_at NULLS FIRST,
      connection.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), stale_runs AS (
    UPDATE public.connector_sync_runs run
    SET status = 'failed',
        finished_at = now(),
        error_category = 'stale_run_recovered',
        error_summary = 'The previous synchronization lease expired before completion.'
    FROM candidate
    WHERE candidate.recovering_stale_sync
      AND run.connection_id = candidate.id
      AND run.status = 'running'
    RETURNING run.id
  ), claimed AS (
    UPDATE public.connector_connections connection
    SET sync_lease_id = gen_random_uuid(),
        sync_lease_expires_at = now() + interval '15 minutes',
        updated_at = now()
    FROM candidate
    WHERE connection.id = candidate.id
      AND (NOT candidate.recovering_stale_sync OR (SELECT count(*) FROM stale_runs) >= 0)
    RETURNING connection.id, connection.owner_user_id, connection.household_id, connection.sync_lease_id
  )
  SELECT claimed.id, claimed.owner_user_id, claimed.household_id, claimed.sync_lease_id
  FROM claimed
$function$;

REVOKE ALL ON FUNCTION lighthouse_claim_due_connector() FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_claim_due_connector() FROM lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_claim_due_connector() TO lighthouse_connector_worker;

DROP POLICY connector_source_mappings_owner ON connector_source_mappings;
CREATE POLICY connector_source_mappings_owner ON connector_source_mappings
  FOR ALL TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
  )
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_source_objects source
      WHERE source.id = connector_source_mappings.source_object_id
        AND source.owner_user_id = lighthouse_actor_user_id()
        AND source.household_id = lighthouse_actor_household_id()
    )
    AND (
      target_entity_id IS NULL
      OR EXISTS (
        SELECT 1 FROM knowledge_entities entity
        WHERE entity.id = connector_source_mappings.target_entity_id
          AND entity.owner_user_id = lighthouse_actor_user_id()
          AND entity.household_id = lighthouse_actor_household_id()
      )
    )
    AND (
      target_library_item_id IS NULL
      OR EXISTS (
        SELECT 1 FROM library_items item
        WHERE item.id = connector_source_mappings.target_library_item_id
          AND item.owner_user_id = lighthouse_actor_user_id()
          AND item.household_id = lighthouse_actor_household_id()
      )
    )
  );
