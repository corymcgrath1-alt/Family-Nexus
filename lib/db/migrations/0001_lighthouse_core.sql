ALTER TABLE users ADD COLUMN IF NOT EXISTS lighthouse_passport_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_lighthouse_passport_id_uq
  ON users (lighthouse_passport_id)
  WHERE lighthouse_passport_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS personal_vaults (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  lighthouse_passport_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS personal_vaults_household_owner_idx
  ON personal_vaults (household_id, owner_user_id);

CREATE TABLE IF NOT EXISTS shared_spaces (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  name text NOT NULL,
  context_type text NOT NULL DEFAULT 'household',
  created_by_id integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_spaces_household_idx
  ON shared_spaces (household_id);

CREATE TABLE IF NOT EXISTS data_sources (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  provider text NOT NULL,
  connector_mode text NOT NULL,
  data_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  collection_mode text NOT NULL DEFAULT 'manual_upload',
  refresh_limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_successful_sync_at timestamp with time zone,
  cursor text,
  revoked_at timestamp with time zone,
  retention_policy text NOT NULL DEFAULT 'user-controlled',
  allowed_purposes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity text NOT NULL DEFAULT 'personal',
  terms_review_status text NOT NULL DEFAULT 'not-reviewed',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_sources_owner_provider_idx
  ON data_sources (owner_user_id, provider);
CREATE INDEX IF NOT EXISTS data_sources_household_idx
  ON data_sources (household_id);

CREATE TABLE IF NOT EXISTS data_records (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  subject_user_id integer,
  shared_space_id integer,
  source_id integer,
  record_type text NOT NULL,
  fact_kind text NOT NULL DEFAULT 'recorded_fact',
  sensitivity text NOT NULL DEFAULT 'personal',
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_purposes jsonb NOT NULL DEFAULT '[]'::jsonb,
  retention_state text NOT NULL DEFAULT 'active',
  deletion_requested_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS data_records_household_owner_idx
  ON data_records (household_id, owner_user_id);
CREATE INDEX IF NOT EXISTS data_records_subject_idx
  ON data_records (subject_user_id);

CREATE TABLE IF NOT EXISTS consent_grants (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  subject_user_id integer,
  grantee_user_id integer,
  data_category text NOT NULL,
  purpose text NOT NULL,
  allowed_use text NOT NULL,
  prohibited_uses jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity text NOT NULL DEFAULT 'personal',
  status text NOT NULL DEFAULT 'active',
  revoked_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consent_grants_owner_idx
  ON consent_grants (owner_user_id);
CREATE INDEX IF NOT EXISTS consent_grants_household_idx
  ON consent_grants (household_id);

CREATE TABLE IF NOT EXISTS sharing_grants (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  resource_type text NOT NULL,
  resource_id integer NOT NULL,
  grantor_user_id integer NOT NULL,
  grantee_user_id integer NOT NULL,
  permission text NOT NULL DEFAULT 'read',
  purpose text NOT NULL DEFAULT 'user_share',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  revoked_at timestamp with time zone,
  revoked_by_id integer,
  expires_at timestamp with time zone
);
CREATE INDEX IF NOT EXISTS sharing_grants_resource_idx
  ON sharing_grants (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS sharing_grants_grantee_idx
  ON sharing_grants (household_id, grantee_user_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  actor_user_id integer NOT NULL,
  target_type text NOT NULL,
  target_id integer,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_events_target_idx
  ON audit_events (target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_events_household_created_idx
  ON audit_events (household_id, created_at);

CREATE TABLE IF NOT EXISTS signal_definitions (
  id serial PRIMARY KEY,
  name text NOT NULL,
  domain text NOT NULL,
  unit text NOT NULL,
  time_window text NOT NULL,
  formula_version text NOT NULL,
  definition text NOT NULL,
  input_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  allowed_uses jsonb NOT NULL DEFAULT '[]'::jsonb,
  prohibited_uses jsonb NOT NULL DEFAULT '[]'::jsonb,
  sensitivity text NOT NULL DEFAULT 'personal',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signal_definitions_domain_idx
  ON signal_definitions (domain);

CREATE TABLE IF NOT EXISTS signal_observations (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  subject_user_id integer NOT NULL,
  signal_definition_id integer NOT NULL,
  value text NOT NULL,
  confidence text NOT NULL DEFAULT 'unknown',
  missing_data_coverage text NOT NULL DEFAULT 'unknown',
  evidence_window text NOT NULL,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility text NOT NULL DEFAULT 'private',
  rejected_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signal_observations_subject_idx
  ON signal_observations (subject_user_id, signal_definition_id);
CREATE INDEX IF NOT EXISTS signal_observations_owner_idx
  ON signal_observations (owner_user_id);

CREATE TABLE IF NOT EXISTS library_items (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  owner_user_id integer NOT NULL,
  subject_user_id integer,
  owner_kind text NOT NULL DEFAULT 'person',
  visibility text NOT NULL DEFAULT 'private',
  category text NOT NULL DEFAULT 'note',
  title text NOT NULL,
  body text,
  source_type text NOT NULL DEFAULT 'manual',
  source_label text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  effective_date text,
  sensitivity text NOT NULL DEFAULT 'personal',
  retention_policy text NOT NULL DEFAULT 'keep-until-archived',
  retention_delete_after text,
  allowed_purposes jsonb NOT NULL DEFAULT '["remember", "search", "share"]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  version integer NOT NULL DEFAULT 1,
  created_by_id integer NOT NULL,
  updated_by_id integer NOT NULL,
  archived_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS library_items_household_status_idx
  ON library_items (household_id, status);
CREATE INDEX IF NOT EXISTS library_items_owner_idx
  ON library_items (owner_user_id);
CREATE INDEX IF NOT EXISTS library_items_visibility_idx
  ON library_items (visibility);
