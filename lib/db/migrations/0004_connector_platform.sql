-- Provider-neutral connector operations with owner-scoped RLS and isolated credentials.

DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'lighthouse_connector_worker') THEN
    CREATE ROLE lighthouse_connector_worker
      NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
END
$role$;

ALTER ROLE lighthouse_connector_worker
  NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

CREATE TABLE connector_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_key text NOT NULL,
  connector_version text NOT NULL,
  provider text NOT NULL,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_passport_id text NOT NULL REFERENCES users(lighthouse_passport_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  provider_account_id text,
  provider_account_label text,
  state text NOT NULL DEFAULT 'pending_authorization',
  granted_scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  selected_capabilities text[] NOT NULL DEFAULT ARRAY[]::text[],
  schedule_enabled boolean NOT NULL DEFAULT true,
  active_consent_id uuid,
  knowledge_source_id uuid REFERENCES knowledge_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  data_source_id integer REFERENCES data_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  last_successful_sync_at timestamp with time zone,
  last_attempted_sync_at timestamp with time zone,
  reconnect_required_at timestamp with time zone,
  revoked_at timestamp with time zone,
  archived_at timestamp with time zone,
  sync_lease_id uuid,
  sync_lease_expires_at timestamp with time zone,
  state_version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_connections_key_ck CHECK (connector_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$'),
  CONSTRAINT connector_connections_state_ck CHECK (state IN (
    'pending_authorization', 'active', 'syncing', 'paused', 'degraded',
    'reconnect_required', 'revoked', 'archived', 'failed'
  )),
  CONSTRAINT connector_connections_owner_scope_ck CHECK (owner_passport_id <> ''),
  CONSTRAINT connector_connections_version_ck CHECK (state_version > 0),
  CONSTRAINT connector_connections_revoked_ck CHECK (state <> 'revoked' OR revoked_at IS NOT NULL),
  CONSTRAINT connector_connections_archived_ck CHECK (state <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT connector_connections_reconnect_ck CHECK (
    state <> 'reconnect_required' OR reconnect_required_at IS NOT NULL
  ),
  CONSTRAINT connector_connections_lease_ck CHECK (
    (sync_lease_id IS NULL AND sync_lease_expires_at IS NULL)
    OR (sync_lease_id IS NOT NULL AND sync_lease_expires_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX connector_connections_active_account_uq
  ON connector_connections (owner_user_id, connector_key, provider_account_id)
  WHERE provider_account_id IS NOT NULL AND state NOT IN ('revoked', 'archived');
CREATE INDEX connector_connections_owner_state_idx
  ON connector_connections (owner_user_id, state, updated_at DESC);
CREATE INDEX connector_connections_sync_due_idx
  ON connector_connections (state, schedule_enabled, last_successful_sync_at)
  WHERE state IN ('active', 'degraded') AND schedule_enabled;
CREATE INDEX connector_connections_lease_idx
  ON connector_connections (sync_lease_expires_at)
  WHERE sync_lease_id IS NOT NULL;

CREATE TABLE connector_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_passport_id text NOT NULL REFERENCES users(lighthouse_passport_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  connector_key text NOT NULL,
  provider_account_id text NOT NULL,
  requested_scopes text[] NOT NULL,
  granted_scopes text[] NOT NULL,
  selected_capabilities text[] NOT NULL,
  selected_resource_ids text[] NOT NULL,
  purpose text NOT NULL,
  consent_text_version text NOT NULL,
  material_version text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  consented_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_consents_status_ck CHECK (status IN ('active', 'superseded', 'revoked')),
  CONSTRAINT connector_consents_revoked_ck CHECK (status <> 'revoked' OR revoked_at IS NOT NULL),
  CONSTRAINT connector_consents_resources_ck CHECK (cardinality(selected_resource_ids) > 0)
);

CREATE UNIQUE INDEX connector_consents_active_connection_uq
  ON connector_consents (connection_id)
  WHERE status = 'active';
CREATE INDEX connector_consents_owner_idx
  ON connector_consents (owner_user_id, connection_id, consented_at DESC);

ALTER TABLE connector_connections
  ADD CONSTRAINT connector_connections_active_consent_fk
  FOREIGN KEY (active_consent_id) REFERENCES connector_consents(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

CREATE TABLE connector_resource_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  provider_resource_id text NOT NULL,
  resource_type text NOT NULL,
  display_name text NOT NULL,
  display_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  selected boolean NOT NULL DEFAULT false,
  selected_at timestamp with time zone,
  last_observed_at timestamp with time zone NOT NULL DEFAULT now(),
  access_status text NOT NULL DEFAULT 'available',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_resource_selections_type_ck CHECK (resource_type IN ('calendar')),
  CONSTRAINT connector_resource_selections_access_ck CHECK (access_status IN ('available', 'permission_lost', 'removed')),
  CONSTRAINT connector_resource_selections_selected_ck CHECK (NOT selected OR selected_at IS NOT NULL),
  CONSTRAINT connector_resource_selections_connection_resource_uq
    UNIQUE (connection_id, resource_type, provider_resource_id)
);

CREATE INDEX connector_resource_selections_selected_idx
  ON connector_resource_selections (connection_id, selected, access_status);

CREATE TABLE connector_sync_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  resource_selection_id uuid NOT NULL REFERENCES connector_resource_selections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  cursor text,
  next_page_token text,
  high_water_mark timestamp with time zone,
  backfill_state text NOT NULL DEFAULT 'pending',
  last_successful_page integer NOT NULL DEFAULT 0,
  last_completed_sync_at timestamp with time zone,
  cursor_invalidated_at timestamp with time zone,
  connector_version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_sync_checkpoints_backfill_ck CHECK (backfill_state IN (
    'pending', 'in_progress', 'complete', 'recovery_required', 'recovering'
  )),
  CONSTRAINT connector_sync_checkpoints_page_ck CHECK (last_successful_page >= 0),
  CONSTRAINT connector_sync_checkpoints_connection_resource_uq
    UNIQUE (connection_id, resource_selection_id)
);

CREATE INDEX connector_sync_checkpoints_connection_idx
  ON connector_sync_checkpoints (connection_id, backfill_state);

CREATE TABLE connector_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  trigger_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  resource_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  fetched_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  unchanged_count integer NOT NULL DEFAULT 0,
  tombstoned_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  retry_count integer NOT NULL DEFAULT 0,
  cursor_recovery_count integer NOT NULL DEFAULT 0,
  error_category text,
  error_summary text,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_sync_runs_trigger_ck CHECK (trigger_type IN ('initial', 'scheduled', 'manual', 'webhook', 'recovery')),
  CONSTRAINT connector_sync_runs_status_ck CHECK (status IN ('queued', 'running', 'completed', 'partially_failed', 'failed', 'cancelled')),
  CONSTRAINT connector_sync_runs_counts_ck CHECK (
    fetched_count >= 0 AND created_count >= 0 AND updated_count >= 0
    AND unchanged_count >= 0 AND tombstoned_count >= 0 AND skipped_count >= 0
    AND failed_count >= 0 AND retry_count >= 0 AND cursor_recovery_count >= 0
  ),
  CONSTRAINT connector_sync_runs_finished_ck CHECK (
    status IN ('queued', 'running') OR finished_at IS NOT NULL
  )
);

CREATE INDEX connector_sync_runs_connection_created_idx
  ON connector_sync_runs (connection_id, created_at DESC);
CREATE INDEX connector_sync_runs_stale_idx
  ON connector_sync_runs (started_at)
  WHERE status = 'running';

CREATE TABLE connector_source_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  resource_selection_id uuid NOT NULL REFERENCES connector_resource_selections(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  provider text NOT NULL,
  external_object_type text NOT NULL,
  external_object_id text NOT NULL,
  external_version text,
  source_created_at timestamp with time zone,
  source_updated_at timestamp with time zone,
  normalized_checksum text NOT NULL,
  normalized_payload jsonb NOT NULL,
  source_deleted boolean NOT NULL DEFAULT false,
  raw_payload_retention_policy text NOT NULL DEFAULT 'not_stored',
  imported_at timestamp with time zone NOT NULL DEFAULT now(),
  parser_version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_source_objects_payload_ck CHECK (jsonb_typeof(normalized_payload) = 'object'),
  CONSTRAINT connector_source_objects_raw_ck CHECK (raw_payload_retention_policy = 'not_stored'),
  CONSTRAINT connector_source_objects_external_uq
    UNIQUE (connection_id, resource_selection_id, external_object_type, external_object_id)
);

CREATE INDEX connector_source_objects_lookup_idx
  ON connector_source_objects (connection_id, resource_selection_id, external_object_id);
CREATE INDEX connector_source_objects_owner_state_idx
  ON connector_source_objects (owner_user_id, source_deleted, updated_at DESC);

CREATE TABLE connector_source_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_object_id uuid NOT NULL UNIQUE REFERENCES connector_source_objects(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  target_entity_id uuid REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  target_library_item_id integer REFERENCES library_items(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  mapping_version text NOT NULL,
  transformation_version text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  user_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_provider_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  last_reconciled_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_source_mappings_target_ck CHECK (
    target_entity_id IS NOT NULL OR target_library_item_id IS NOT NULL
  ),
  CONSTRAINT connector_source_mappings_state_ck CHECK (state IN ('active', 'replaced', 'detached', 'deleted')),
  CONSTRAINT connector_source_mappings_overrides_ck CHECK (jsonb_typeof(user_overrides) = 'object'),
  CONSTRAINT connector_source_mappings_provider_ck CHECK (jsonb_typeof(last_provider_values) = 'object')
);

CREATE INDEX connector_source_mappings_entity_idx
  ON connector_source_mappings (target_entity_id) WHERE target_entity_id IS NOT NULL;
CREATE INDEX connector_source_mappings_library_idx
  ON connector_source_mappings (target_library_item_id) WHERE target_library_item_id IS NOT NULL;

CREATE TABLE connector_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_hash text NOT NULL UNIQUE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_passport_id text NOT NULL REFERENCES users(lighthouse_passport_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  connector_key text NOT NULL,
  redirect_path text NOT NULL,
  encrypted_pkce_verifier bytea NOT NULL,
  encryption_nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  encryption_key_version text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  consumed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_oauth_states_redirect_ck CHECK (redirect_path ~ '^/[A-Za-z0-9/_?=&.-]*$'),
  CONSTRAINT connector_oauth_states_expiry_ck CHECK (expires_at > created_at)
);

CREATE INDEX connector_oauth_states_expiry_idx
  ON connector_oauth_states (expires_at) WHERE consumed_at IS NULL;

CREATE TABLE connector_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  credential_type text NOT NULL,
  encrypted_payload bytea NOT NULL,
  encryption_nonce bytea NOT NULL,
  authentication_tag bytea NOT NULL,
  encryption_key_version text NOT NULL,
  expires_at timestamp with time zone,
  rotated_at timestamp with time zone,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_credentials_type_ck CHECK (credential_type IN ('oauth_token_set')),
  CONSTRAINT connector_credentials_payload_ck CHECK (
    octet_length(encrypted_payload) > 0
    AND octet_length(encryption_nonce) = 12
    AND octet_length(authentication_tag) = 16
  ),
  UNIQUE (connection_id, credential_type)
);

CREATE TABLE connector_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  connection_id uuid REFERENCES connector_connections(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  connector_key text NOT NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT connector_audit_events_type_ck CHECK (event_type IN (
    'authorization_initiated', 'authorization_completed', 'authorization_denied',
    'authorization_failed', 'consent_granted', 'consent_changed',
    'resource_selected', 'resource_deselected', 'sync_started', 'sync_completed',
    'sync_partially_failed', 'sync_failed', 'connection_paused', 'connection_resumed',
    'reconnect_required', 'connection_revoked', 'imported_records_retained',
    'imported_records_archived', 'imported_records_deleted'
  )),
  CONSTRAINT connector_audit_events_metadata_ck CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX connector_audit_events_connection_idx
  ON connector_audit_events (connection_id, created_at DESC);
CREATE INDEX connector_audit_events_owner_idx
  ON connector_audit_events (owner_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION lighthouse_validate_connector_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF OLD.state = NEW.state THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.state = 'pending_authorization' AND NEW.state IN ('active', 'failed', 'reconnect_required', 'revoked', 'archived'))
    OR (OLD.state = 'active' AND NEW.state IN ('syncing', 'paused', 'degraded', 'reconnect_required', 'failed', 'revoked', 'archived'))
    OR (OLD.state = 'syncing' AND NEW.state IN ('active', 'degraded', 'reconnect_required', 'failed', 'revoked'))
    OR (OLD.state = 'paused' AND NEW.state IN ('active', 'revoked', 'archived'))
    OR (OLD.state = 'degraded' AND NEW.state IN ('active', 'syncing', 'paused', 'reconnect_required', 'failed', 'revoked'))
    OR (OLD.state = 'reconnect_required' AND NEW.state IN ('pending_authorization', 'revoked', 'archived'))
    OR (OLD.state = 'failed' AND NEW.state IN ('pending_authorization', 'revoked', 'archived'))
    OR (OLD.state = 'revoked' AND NEW.state = 'archived')
  ) THEN
    RAISE EXCEPTION 'Unsafe connector state transition from % to %', OLD.state, NEW.state
      USING ERRCODE = '23514';
  END IF;

  NEW.state_version := OLD.state_version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

CREATE TRIGGER connector_connections_validate_transition
  BEFORE UPDATE OF state ON connector_connections
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_connector_transition();

GRANT SELECT, INSERT, UPDATE, DELETE ON
  connector_connections,
  connector_consents,
  connector_resource_selections,
  connector_sync_checkpoints,
  connector_sync_runs,
  connector_source_objects,
  connector_source_mappings,
  connector_oauth_states,
  connector_audit_events
TO lighthouse_runtime;

REVOKE ALL ON connector_credentials FROM PUBLIC;
REVOKE ALL ON connector_credentials FROM lighthouse_runtime;

ALTER TABLE connector_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_resource_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_source_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_source_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY connector_connections_owner ON connector_connections
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
      SELECT 1 FROM users actor
      WHERE actor.id = lighthouse_actor_user_id()
        AND actor.household_id = lighthouse_actor_household_id()
        AND actor.lighthouse_passport_id = connector_connections.owner_passport_id
        AND actor.role = 'adult'
    )
  );

CREATE POLICY connector_consents_owner ON connector_consents
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_connections connection
      WHERE connection.id = connector_consents.connection_id
        AND connection.owner_user_id = lighthouse_actor_user_id()
        AND connection.household_id = lighthouse_actor_household_id()
        AND connection.owner_passport_id = connector_consents.owner_passport_id
        AND connection.connector_key = connector_consents.connector_key
        AND connection.provider_account_id = connector_consents.provider_account_id
    )
  );

CREATE POLICY connector_resource_selections_owner ON connector_resource_selections
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_connections connection
      WHERE connection.id = connector_resource_selections.connection_id
        AND connection.owner_user_id = lighthouse_actor_user_id()
        AND connection.household_id = lighthouse_actor_household_id()
    )
  );

CREATE POLICY connector_sync_checkpoints_owner ON connector_sync_checkpoints
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_resource_selections selection
      WHERE selection.id = connector_sync_checkpoints.resource_selection_id
        AND selection.connection_id = connector_sync_checkpoints.connection_id
        AND selection.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY connector_sync_runs_owner ON connector_sync_runs
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_connections connection
      WHERE connection.id = connector_sync_runs.connection_id
        AND connection.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY connector_source_objects_owner ON connector_source_objects
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_resource_selections selection
      WHERE selection.id = connector_source_objects.resource_selection_id
        AND selection.connection_id = connector_source_objects.connection_id
        AND selection.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY connector_source_mappings_owner ON connector_source_mappings
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM connector_source_objects source
      WHERE source.id = connector_source_mappings.source_object_id
        AND source.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY connector_oauth_states_owner ON connector_oauth_states
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM users actor
      WHERE actor.id = lighthouse_actor_user_id()
        AND actor.household_id = lighthouse_actor_household_id()
        AND actor.lighthouse_passport_id = connector_oauth_states.owner_passport_id
        AND actor.role = 'adult'
    )
  );

CREATE POLICY connector_audit_events_owner ON connector_audit_events
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND owner_user_id = lighthouse_actor_user_id() AND household_id = lighthouse_actor_household_id())
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND owner_user_id = lighthouse_actor_user_id()
    AND actor_user_id = lighthouse_actor_user_id()
    AND household_id = lighthouse_actor_household_id()
    AND (connection_id IS NULL OR EXISTS (
      SELECT 1 FROM connector_connections connection
      WHERE connection.id = connector_audit_events.connection_id
        AND connection.owner_user_id = lighthouse_actor_user_id()
    ))
  );

CREATE OR REPLACE FUNCTION lighthouse_put_connector_credential(
  p_connection_id uuid,
  p_credential_type text,
  p_encrypted_payload bytea,
  p_encryption_nonce bytea,
  p_authentication_tag bytea,
  p_encryption_key_version text,
  p_expires_at timestamp with time zone,
  p_provider_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  credential_id uuid;
BEGIN
  IF public.lighthouse_actor_user_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.connector_connections connection
    WHERE connection.id = p_connection_id
      AND connection.owner_user_id = public.lighthouse_actor_user_id()
      AND connection.household_id = public.lighthouse_actor_household_id()
      AND connection.state NOT IN ('revoked', 'archived')
  ) THEN
    RAISE EXCEPTION 'Connector credential access denied' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.connector_credentials (
    connection_id, credential_type, encrypted_payload, encryption_nonce,
    authentication_tag, encryption_key_version, expires_at, provider_metadata
  ) VALUES (
    p_connection_id, p_credential_type, p_encrypted_payload, p_encryption_nonce,
    p_authentication_tag, p_encryption_key_version, p_expires_at, coalesce(p_provider_metadata, '{}'::jsonb)
  )
  ON CONFLICT (connection_id, credential_type) DO UPDATE SET
    encrypted_payload = EXCLUDED.encrypted_payload,
    encryption_nonce = EXCLUDED.encryption_nonce,
    authentication_tag = EXCLUDED.authentication_tag,
    encryption_key_version = EXCLUDED.encryption_key_version,
    expires_at = EXCLUDED.expires_at,
    provider_metadata = EXCLUDED.provider_metadata,
    rotated_at = CASE
      WHEN public.connector_credentials.encryption_key_version <> EXCLUDED.encryption_key_version THEN now()
      ELSE public.connector_credentials.rotated_at
    END,
    updated_at = now()
  RETURNING id INTO credential_id;

  RETURN credential_id;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_get_connector_credential(p_connection_id uuid)
RETURNS TABLE (
  credential_type text,
  encrypted_payload bytea,
  encryption_nonce bytea,
  authentication_tag bytea,
  encryption_key_version text,
  expires_at timestamp with time zone,
  provider_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF public.lighthouse_actor_user_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.connector_connections connection
    WHERE connection.id = p_connection_id
      AND connection.owner_user_id = public.lighthouse_actor_user_id()
      AND connection.household_id = public.lighthouse_actor_household_id()
      AND connection.state NOT IN ('revoked', 'archived')
  ) THEN
    RAISE EXCEPTION 'Connector credential access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT credential.credential_type, credential.encrypted_payload,
      credential.encryption_nonce, credential.authentication_tag,
      credential.encryption_key_version, credential.expires_at,
      credential.provider_metadata
    FROM public.connector_credentials credential
    WHERE credential.connection_id = p_connection_id
      AND credential.credential_type = 'oauth_token_set';
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_delete_connector_credential(p_connection_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  deleted_count integer;
BEGIN
  IF public.lighthouse_actor_user_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.connector_connections connection
    WHERE connection.id = p_connection_id
      AND connection.owner_user_id = public.lighthouse_actor_user_id()
      AND connection.household_id = public.lighthouse_actor_household_id()
  ) THEN
    RAISE EXCEPTION 'Connector credential access denied' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.connector_credentials WHERE connection_id = p_connection_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END
$function$;

REVOKE ALL ON FUNCTION lighthouse_put_connector_credential(uuid, text, bytea, bytea, bytea, text, timestamp with time zone, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_get_connector_credential(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_delete_connector_credential(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION lighthouse_put_connector_credential(uuid, text, bytea, bytea, bytea, text, timestamp with time zone, jsonb) TO lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_get_connector_credential(uuid) TO lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_delete_connector_credential(uuid) TO lighthouse_runtime;

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
    SELECT connection.id
    FROM public.connector_connections connection
    WHERE connection.state IN ('active', 'degraded')
      AND connection.schedule_enabled
      AND connection.active_consent_id IS NOT NULL
      AND (connection.sync_lease_id IS NULL OR connection.sync_lease_expires_at < now())
      AND (connection.last_successful_sync_at IS NULL OR connection.last_successful_sync_at < now() - interval '15 minutes')
    ORDER BY connection.last_successful_sync_at NULLS FIRST, connection.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), claimed AS (
    UPDATE public.connector_connections connection
    SET sync_lease_id = gen_random_uuid(),
        sync_lease_expires_at = now() + interval '15 minutes',
        updated_at = now()
    FROM candidate
    WHERE connection.id = candidate.id
    RETURNING connection.id, connection.owner_user_id, connection.household_id, connection.sync_lease_id
  )
  SELECT claimed.id, claimed.owner_user_id, claimed.household_id, claimed.sync_lease_id
  FROM claimed
$function$;

REVOKE ALL ON FUNCTION lighthouse_claim_due_connector() FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_claim_due_connector() FROM lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_claim_due_connector() TO lighthouse_connector_worker;

CREATE OR REPLACE FUNCTION lighthouse_purge_connector_operational_data(
  p_now timestamp with time zone DEFAULT now()
)
RETURNS TABLE (
  oauth_states_deleted integer,
  sync_runs_deleted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  oauth_count integer;
  run_count integer;
BEGIN
  DELETE FROM public.connector_oauth_states state
  WHERE state.expires_at < p_now - interval '24 hours'
     OR state.consumed_at < p_now - interval '24 hours';
  GET DIAGNOSTICS oauth_count = ROW_COUNT;

  DELETE FROM public.connector_sync_runs run
  WHERE run.status IN ('completed', 'partially_failed', 'failed', 'cancelled')
    AND coalesce(run.finished_at, run.created_at) < p_now - interval '90 days';
  GET DIAGNOSTICS run_count = ROW_COUNT;

  RETURN QUERY SELECT oauth_count, run_count;
END
$function$;

REVOKE ALL ON FUNCTION lighthouse_purge_connector_operational_data(timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION lighthouse_purge_connector_operational_data(timestamp with time zone) FROM lighthouse_runtime;
GRANT EXECUTE ON FUNCTION lighthouse_purge_connector_operational_data(timestamp with time zone) TO lighthouse_connector_worker;
