DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lighthouse_runtime') THEN
    CREATE ROLE lighthouse_runtime
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END
$role$;

ALTER ROLE lighthouse_runtime
  NOLOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO lighthouse_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lighthouse_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lighthouse_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM lighthouse_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM lighthouse_runtime;

-- Signal definitions are global reference metadata, not person-owned runtime data.
REVOKE INSERT, UPDATE, DELETE ON signal_definitions FROM lighthouse_runtime;

CREATE OR REPLACE FUNCTION lighthouse_actor_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('lighthouse.actor_user_id', true), '')::integer
$function$;

CREATE OR REPLACE FUNCTION lighthouse_actor_household_id()
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $function$
  SELECT NULLIF(current_setting('lighthouse.actor_household_id', true), '')::integer
$function$;

REVOKE ALL ON FUNCTION lighthouse_actor_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_actor_household_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lighthouse_actor_user_id() TO lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_actor_household_id() TO lighthouse_runtime;

ALTER TABLE personal_vaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE sharing_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE library_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS personal_vaults_owner ON personal_vaults;
CREATE POLICY personal_vaults_owner ON personal_vaults
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
  );

DROP POLICY IF EXISTS data_sources_owner ON data_sources;
CREATE POLICY data_sources_owner ON data_sources
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
  );

DROP POLICY IF EXISTS data_records_owner ON data_records;
CREATE POLICY data_records_owner ON data_records
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
  );

DROP POLICY IF EXISTS consent_grants_owner ON consent_grants;
CREATE POLICY consent_grants_owner ON consent_grants
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
  );

DROP POLICY IF EXISTS signal_observations_owner ON signal_observations;
CREATE POLICY signal_observations_owner ON signal_observations
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
  );

DROP POLICY IF EXISTS shared_spaces_household_read ON shared_spaces;
CREATE POLICY shared_spaces_household_read ON shared_spaces
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
  );

DROP POLICY IF EXISTS shared_spaces_creator_insert ON shared_spaces;
CREATE POLICY shared_spaces_creator_insert ON shared_spaces
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND created_by_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
  );

DROP POLICY IF EXISTS shared_spaces_creator_update ON shared_spaces;
CREATE POLICY shared_spaces_creator_update ON shared_spaces
  FOR UPDATE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND created_by_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
  )
  WITH CHECK (
    created_by_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
  );

DROP POLICY IF EXISTS shared_spaces_creator_delete ON shared_spaces;
CREATE POLICY shared_spaces_creator_delete ON shared_spaces
  FOR DELETE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND created_by_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
  );

DROP POLICY IF EXISTS sharing_grants_read ON sharing_grants;
CREATE POLICY sharing_grants_read ON sharing_grants
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND (
      grantor_user_id = lighthouse_actor_user_id()
      OR (
        grantee_user_id = lighthouse_actor_user_id()
        AND permission = 'read'
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      )
    )
  );

DROP POLICY IF EXISTS sharing_grants_owner_insert ON sharing_grants;
CREATE POLICY sharing_grants_owner_insert ON sharing_grants
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND grantor_user_id = lighthouse_actor_user_id()
    AND grantee_user_id <> lighthouse_actor_user_id()
    AND resource_type = 'library_item'
    AND permission = 'read'
    AND revoked_at IS NULL
    AND revoked_by_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM library_items item
      WHERE item.id = resource_id
        AND item.household_id = lighthouse_actor_household_id()
        AND item.owner_user_id = lighthouse_actor_user_id()
        AND item.status <> 'deleted'
        AND item.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS sharing_grants_owner_update ON sharing_grants;
CREATE POLICY sharing_grants_owner_update ON sharing_grants
  FOR UPDATE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND grantor_user_id = lighthouse_actor_user_id()
  )
  WITH CHECK (
    household_id = lighthouse_actor_household_id()
    AND grantor_user_id = lighthouse_actor_user_id()
    AND grantee_user_id <> lighthouse_actor_user_id()
    AND resource_type = 'library_item'
    AND permission = 'read'
    AND (revoked_by_id IS NULL OR revoked_by_id = lighthouse_actor_user_id())
    AND EXISTS (
      SELECT 1
      FROM library_items item
      WHERE item.id = resource_id
        AND item.household_id = lighthouse_actor_household_id()
        AND item.owner_user_id = lighthouse_actor_user_id()
        AND item.status <> 'deleted'
        AND item.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS sharing_grants_owner_delete ON sharing_grants;
CREATE POLICY sharing_grants_owner_delete ON sharing_grants
  FOR DELETE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND grantor_user_id = lighthouse_actor_user_id()
  );

DROP POLICY IF EXISTS library_items_read ON library_items;
CREATE POLICY library_items_read ON library_items
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND (
      owner_user_id = lighthouse_actor_user_id()
      OR (
        status <> 'deleted'
        AND deleted_at IS NULL
        AND (
          visibility = 'household'
          OR (
            visibility = 'shared'
            AND EXISTS (
              SELECT 1
              FROM sharing_grants grant_row
              WHERE grant_row.resource_type = 'library_item'
                AND grant_row.resource_id = library_items.id
                AND grant_row.household_id = library_items.household_id
                AND grant_row.grantee_user_id = lighthouse_actor_user_id()
                AND grant_row.permission = 'read'
                AND grant_row.revoked_at IS NULL
                AND (grant_row.expires_at IS NULL OR grant_row.expires_at > CURRENT_TIMESTAMP)
            )
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS library_items_owner_insert ON library_items;
CREATE POLICY library_items_owner_insert ON library_items
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
  );

DROP POLICY IF EXISTS library_items_owner_update ON library_items;
CREATE POLICY library_items_owner_update ON library_items
  FOR UPDATE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND status <> 'deleted'
    AND deleted_at IS NULL
  )
  WITH CHECK (
    household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
  );

DROP POLICY IF EXISTS library_items_owner_delete ON library_items;
CREATE POLICY library_items_owner_delete ON library_items
  FOR DELETE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
  );

DROP POLICY IF EXISTS audit_events_read ON audit_events;
CREATE POLICY audit_events_read ON audit_events
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND target_type = 'library_item'
    AND EXISTS (
      SELECT 1
      FROM library_items item
      WHERE item.id = target_id
        AND item.household_id = lighthouse_actor_household_id()
        AND (
          item.owner_user_id = lighthouse_actor_user_id()
          OR item.visibility = 'household'
        )
    )
  );

DROP POLICY IF EXISTS audit_events_actor_insert ON audit_events;
CREATE POLICY audit_events_actor_insert ON audit_events
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND actor_user_id = lighthouse_actor_user_id()
    AND target_type = 'library_item'
    AND EXISTS (
      SELECT 1
      FROM library_items item
      WHERE item.id = target_id
        AND item.household_id = lighthouse_actor_household_id()
    )
  );
