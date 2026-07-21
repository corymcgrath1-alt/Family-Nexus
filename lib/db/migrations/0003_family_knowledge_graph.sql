-- Canonical, actor-owned Family Knowledge Graph foundation.
-- Runtime access remains subordinate to transaction-scoped Lighthouse actor context.

CREATE TABLE IF NOT EXISTS knowledge_entity_types (
  entity_type text PRIMARY KEY,
  display_name text NOT NULL,
  domain text NOT NULL,
  default_privacy_level text NOT NULL,
  default_sensitivity text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_entity_types_status_ck
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT knowledge_entity_types_privacy_ck
    CHECK (default_privacy_level IN ('internal', 'household', 'personal_private', 'sensitive_personal', 'restricted_third_party')),
  CONSTRAINT knowledge_entity_types_sensitivity_ck
    CHECK (default_sensitivity IN ('standard', 'personal', 'sensitive', 'restricted'))
);

INSERT INTO knowledge_entity_types
  (entity_type, display_name, domain, default_privacy_level, default_sensitivity)
VALUES
  ('person', 'Person', 'identity', 'personal_private', 'personal'),
  ('household', 'Household', 'household', 'household', 'personal'),
  ('pet', 'Pet', 'household', 'household', 'personal'),
  ('vehicle', 'Vehicle', 'asset', 'household', 'personal'),
  ('home', 'Home', 'asset', 'household', 'sensitive'),
  ('room', 'Room', 'asset', 'household', 'personal'),
  ('organization', 'Organization', 'organization', 'personal_private', 'personal'),
  ('employer', 'Employer', 'career', 'personal_private', 'personal'),
  ('school', 'School', 'education', 'personal_private', 'personal'),
  ('doctor', 'Doctor', 'health', 'sensitive_personal', 'sensitive'),
  ('medication', 'Medication', 'health', 'sensitive_personal', 'restricted'),
  ('appointment', 'Appointment', 'planning', 'personal_private', 'personal'),
  ('task', 'Task', 'planning', 'personal_private', 'personal'),
  ('project', 'Project', 'planning', 'personal_private', 'personal'),
  ('conversation', 'Conversation', 'communication', 'sensitive_personal', 'sensitive'),
  ('relationship', 'Relationship', 'relationship', 'sensitive_personal', 'sensitive'),
  ('event', 'Event', 'timeline', 'personal_private', 'personal'),
  ('memory', 'Memory', 'memory', 'personal_private', 'personal'),
  ('observation', 'Observation', 'observation', 'personal_private', 'sensitive'),
  ('document', 'Document', 'media', 'personal_private', 'personal'),
  ('photo', 'Photo', 'media', 'personal_private', 'personal'),
  ('video', 'Video', 'media', 'personal_private', 'personal'),
  ('financial_account', 'Financial Account', 'finance', 'sensitive_personal', 'restricted'),
  ('investment', 'Investment', 'finance', 'sensitive_personal', 'restricted'),
  ('expense', 'Expense', 'finance', 'sensitive_personal', 'restricted'),
  ('income', 'Income', 'finance', 'sensitive_personal', 'restricted'),
  ('subscription', 'Subscription', 'finance', 'personal_private', 'sensitive'),
  ('insurance', 'Insurance', 'finance', 'sensitive_personal', 'restricted'),
  ('property', 'Property', 'asset', 'sensitive_personal', 'sensitive'),
  ('warranty', 'Warranty', 'asset', 'personal_private', 'personal'),
  ('inspection', 'Inspection', 'asset', 'personal_private', 'personal'),
  ('maintenance_record', 'Maintenance Record', 'asset', 'household', 'personal'),
  ('health_metric', 'Health Metric', 'health', 'sensitive_personal', 'restricted'),
  ('mood_entry', 'Mood Entry', 'health', 'sensitive_personal', 'restricted'),
  ('sleep_session', 'Sleep Session', 'health', 'sensitive_personal', 'restricted'),
  ('workout', 'Workout', 'health', 'sensitive_personal', 'sensitive'),
  ('meal', 'Meal', 'health', 'personal_private', 'personal'),
  ('trip', 'Trip', 'travel', 'personal_private', 'sensitive'),
  ('place', 'Place', 'travel', 'personal_private', 'sensitive'),
  ('calendar_event', 'Calendar Event', 'planning', 'personal_private', 'personal'),
  ('goal', 'Goal', 'growth', 'personal_private', 'personal'),
  ('habit', 'Habit', 'growth', 'personal_private', 'personal'),
  ('skill', 'Skill', 'growth', 'personal_private', 'personal'),
  ('certification', 'Certification', 'growth', 'personal_private', 'personal'),
  ('device', 'Device', 'technology', 'sensitive_personal', 'sensitive'),
  ('connector', 'Connector', 'governance', 'personal_private', 'sensitive'),
  ('permission', 'Permission', 'governance', 'personal_private', 'sensitive'),
  ('consent', 'Consent', 'governance', 'sensitive_personal', 'restricted'),
  ('source', 'Source', 'governance', 'personal_private', 'sensitive'),
  ('ai_insight', 'AI Insight', 'intelligence', 'personal_private', 'sensitive'),
  ('recommendation', 'Recommendation', 'action', 'personal_private', 'personal'),
  ('risk', 'Risk', 'risk', 'sensitive_personal', 'restricted'),
  ('notification', 'Notification', 'notification', 'personal_private', 'personal')
ON CONFLICT (entity_type) DO NOTHING;

CREATE TABLE IF NOT EXISTS knowledge_relationship_types (
  relationship_type text PRIMARY KEY,
  display_name text NOT NULL,
  inverse_relationship_type text,
  is_symmetric boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_relationship_types_status_ck
    CHECK (status IN ('active', 'disabled'))
);

INSERT INTO knowledge_relationship_types
  (relationship_type, display_name, inverse_relationship_type, is_symmetric)
VALUES
  ('parent_of', 'Parent of', 'child_of', false),
  ('child_of', 'Child of', 'parent_of', false),
  ('sibling_of', 'Sibling of', 'sibling_of', true),
  ('spouse_of', 'Spouse of', 'spouse_of', true),
  ('friend_of', 'Friend of', 'friend_of', true),
  ('works_at', 'Works at', NULL, false),
  ('lives_in', 'Lives in', NULL, false),
  ('owns', 'Owns', NULL, false),
  ('maintains', 'Maintains', NULL, false),
  ('created', 'Created', NULL, false),
  ('modified', 'Modified', NULL, false),
  ('attended', 'Attended', NULL, false),
  ('purchased', 'Purchased', NULL, false),
  ('viewed', 'Viewed', NULL, false),
  ('mentioned', 'Mentioned', NULL, false),
  ('related_to', 'Related to', 'related_to', true),
  ('duplicate_of', 'Duplicate of', NULL, false),
  ('derived_from', 'Derived from', NULL, false),
  ('supports', 'Supports', NULL, false),
  ('requires', 'Requires', NULL, false),
  ('depends_on', 'Depends on', NULL, false)
ON CONFLICT (relationship_type) DO NOTHING;

ALTER TABLE knowledge_relationship_types
  DROP CONSTRAINT IF EXISTS knowledge_relationship_types_inverse_fk;
ALTER TABLE knowledge_relationship_types
  ADD CONSTRAINT knowledge_relationship_types_inverse_fk
  FOREIGN KEY (inverse_relationship_type)
  REFERENCES knowledge_relationship_types (relationship_type)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS knowledge_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_kind text NOT NULL,
  provider text NOT NULL,
  connector_key text,
  connector_version text,
  source_label text,
  external_reference text,
  confidence_score numeric(5,4) NOT NULL DEFAULT 1,
  verification_state text NOT NULL DEFAULT 'unverified',
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  privacy_level text NOT NULL DEFAULT 'personal_private',
  sensitivity text NOT NULL DEFAULT 'personal',
  status text NOT NULL DEFAULT 'active',
  retention_policy text NOT NULL DEFAULT 'user_controlled',
  retention_delete_after timestamp with time zone,
  legal_hold boolean NOT NULL DEFAULT false,
  collected_at timestamp with time zone,
  imported_at timestamp with time zone,
  archived_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_sources_kind_ck CHECK (source_kind IN (
    'manual_entry', 'imported_json', 'external_api', 'data_portability_export',
    'platform_collector', 'local_device', 'user_correction', 'ai_generated',
    'derived', 'other'
  )),
  CONSTRAINT knowledge_sources_confidence_ck CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT knowledge_sources_verification_ck CHECK (verification_state IN (
    'unverified', 'self_asserted', 'source_verified', 'user_verified', 'disputed', 'rejected'
  )),
  CONSTRAINT knowledge_sources_privacy_ck CHECK (privacy_level IN (
    'internal', 'household', 'personal_private', 'sensitive_personal', 'restricted_third_party'
  )),
  CONSTRAINT knowledge_sources_sensitivity_ck CHECK (sensitivity IN ('standard', 'personal', 'sensitive', 'restricted')),
  CONSTRAINT knowledge_sources_status_ck CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT knowledge_sources_legal_hold_ck CHECK (NOT (legal_hold AND status = 'deleted')),
  CONSTRAINT knowledge_sources_archived_ck CHECK (status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT knowledge_sources_deleted_ck CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS knowledge_sources_household_owner_idx
  ON knowledge_sources (household_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS knowledge_sources_connector_idx
  ON knowledge_sources (connector_key, connector_version)
  WHERE connector_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL REFERENCES knowledge_entity_types(entity_type) ON UPDATE RESTRICT ON DELETE RESTRICT,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  subject_user_id integer REFERENCES users(id) ON UPDATE RESTRICT ON DELETE SET NULL,
  primary_source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  canonical_label text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  privacy_level text NOT NULL DEFAULT 'personal_private',
  visibility text NOT NULL DEFAULT 'private',
  sensitivity text NOT NULL DEFAULT 'personal',
  confidence_score numeric(5,4) NOT NULL DEFAULT 1,
  verification_state text NOT NULL DEFAULT 'unverified',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  search_text text NOT NULL DEFAULT '',
  search_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  structured_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  duration_seconds bigint,
  expected_at timestamp with time zone,
  actual_at timestamp with time zone,
  recurrence_rule text,
  temporal_state text NOT NULL DEFAULT 'current',
  retention_policy text NOT NULL DEFAULT 'user_controlled',
  retention_delete_after timestamp with time zone,
  legal_hold boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  updated_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  archived_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(canonical_label, '') || ' ' || coalesce(search_text, ''))
  ) STORED,
  CONSTRAINT knowledge_entities_status_ck CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT knowledge_entities_privacy_ck CHECK (privacy_level IN (
    'internal', 'household', 'personal_private', 'sensitive_personal', 'restricted_third_party'
  )),
  CONSTRAINT knowledge_entities_visibility_ck CHECK (visibility IN ('private', 'household', 'shared')),
  CONSTRAINT knowledge_entities_sensitivity_ck CHECK (sensitivity IN ('standard', 'personal', 'sensitive', 'restricted')),
  CONSTRAINT knowledge_entities_confidence_ck CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT knowledge_entities_verification_ck CHECK (verification_state IN (
    'unverified', 'self_asserted', 'source_verified', 'user_verified', 'disputed', 'rejected'
  )),
  CONSTRAINT knowledge_entities_temporal_ck CHECK (temporal_state IN ('historical', 'current', 'future', 'predicted')),
  CONSTRAINT knowledge_entities_duration_ck CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  CONSTRAINT knowledge_entities_time_range_ck CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),
  CONSTRAINT knowledge_entities_subject_owner_ck CHECK (
    subject_user_id IS NULL OR subject_user_id = owner_user_id
  ),
  CONSTRAINT knowledge_entities_household_privacy_ck CHECK (
    visibility <> 'household' OR privacy_level = 'household'
  ),
  CONSTRAINT knowledge_entities_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_entities_legal_hold_ck CHECK (NOT (legal_hold AND status = 'deleted')),
  CONSTRAINT knowledge_entities_archived_ck CHECK (status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT knowledge_entities_deleted_ck CHECK (status <> 'deleted' OR deleted_at IS NOT NULL),
  CONSTRAINT knowledge_entities_private_domains_ck CHECK (
    entity_type NOT IN ('observation', 'ai_insight', 'recommendation') OR visibility <> 'household'
  ),
  CONSTRAINT knowledge_entities_passport_private_ck CHECK (
    entity_type <> 'person' OR privacy_level <> 'internal'
  )
);

CREATE INDEX IF NOT EXISTS knowledge_entities_household_owner_status_idx
  ON knowledge_entities (household_id, owner_user_id, status);
CREATE INDEX IF NOT EXISTS knowledge_entities_type_status_idx
  ON knowledge_entities (entity_type, status);
CREATE INDEX IF NOT EXISTS knowledge_entities_timeline_idx
  ON knowledge_entities (household_id, occurred_at DESC)
  WHERE status <> 'deleted';
CREATE INDEX IF NOT EXISTS knowledge_entities_search_idx
  ON knowledge_entities USING gin (search_vector);
CREATE INDEX IF NOT EXISTS knowledge_entities_tags_idx
  ON knowledge_entities USING gin (tags);
CREATE INDEX IF NOT EXISTS knowledge_entities_metadata_idx
  ON knowledge_entities USING gin (structured_metadata jsonb_path_ops);

CREATE TABLE IF NOT EXISTS knowledge_entity_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  grantor_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  grantee_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  permission text NOT NULL DEFAULT 'read',
  purpose text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by_id integer REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT knowledge_entity_grants_permission_ck CHECK (permission = 'read'),
  CONSTRAINT knowledge_entity_grants_distinct_users_ck CHECK (grantor_user_id <> grantee_user_id),
  CONSTRAINT knowledge_entity_grants_revocation_ck CHECK (
    (revoked_at IS NULL AND revoked_by_id IS NULL) OR (revoked_at IS NOT NULL AND revoked_by_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entity_grants_active_uq
  ON knowledge_entity_grants (entity_id, grantee_user_id, permission)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS knowledge_entity_grants_grantee_idx
  ON knowledge_entity_grants (household_id, grantee_user_id, entity_id);

CREATE TABLE IF NOT EXISTS knowledge_entity_sources (
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_role text NOT NULL,
  source_record_ref text,
  evidence_note text,
  created_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, source_id, source_role),
  CONSTRAINT knowledge_entity_sources_role_ck CHECK (source_role IN ('primary', 'supporting', 'derived', 'correction'))
);

CREATE INDEX IF NOT EXISTS knowledge_entity_sources_source_idx
  ON knowledge_entity_sources (source_id, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entity_sources_record_uq
  ON knowledge_entity_sources (source_id, source_record_ref)
  WHERE source_record_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS knowledge_entity_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version integer NOT NULL,
  change_kind text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_entity_versions_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_entity_versions_change_ck CHECK (change_kind IN ('created', 'corrected', 'archived', 'restored', 'deleted')),
  UNIQUE (entity_id, version)
);

CREATE INDEX IF NOT EXISTS knowledge_entity_versions_entity_idx
  ON knowledge_entity_versions (entity_id, version DESC);

CREATE TABLE IF NOT EXISTS knowledge_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  target_entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  relationship_type text NOT NULL REFERENCES knowledge_relationship_types(relationship_type) ON UPDATE RESTRICT ON DELETE RESTRICT,
  direction text NOT NULL DEFAULT 'directed',
  strength numeric(5,4),
  confidence_score numeric(5,4) NOT NULL DEFAULT 1,
  verification_state text NOT NULL DEFAULT 'unverified',
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_source_id uuid NOT NULL REFERENCES knowledge_sources(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  source_record_ref text,
  privacy_inheritance text NOT NULL DEFAULT 'most_restrictive',
  privacy_level text NOT NULL DEFAULT 'personal_private',
  visibility text NOT NULL DEFAULT 'private',
  status text NOT NULL DEFAULT 'active',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  structured_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  expected_at timestamp with time zone,
  actual_at timestamp with time zone,
  recurrence_rule text,
  temporal_state text NOT NULL DEFAULT 'current',
  retention_policy text NOT NULL DEFAULT 'user_controlled',
  retention_delete_after timestamp with time zone,
  legal_hold boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  updated_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  archived_at timestamp with time zone,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_relationships_distinct_entities_ck CHECK (source_entity_id <> target_entity_id OR relationship_type = 'related_to'),
  CONSTRAINT knowledge_relationships_direction_ck CHECK (direction IN ('directed', 'undirected', 'bidirectional')),
  CONSTRAINT knowledge_relationships_strength_ck CHECK (strength IS NULL OR (strength >= 0 AND strength <= 1)),
  CONSTRAINT knowledge_relationships_confidence_ck CHECK (confidence_score >= 0 AND confidence_score <= 1),
  CONSTRAINT knowledge_relationships_verification_ck CHECK (verification_state IN (
    'unverified', 'self_asserted', 'source_verified', 'user_verified', 'disputed', 'rejected'
  )),
  CONSTRAINT knowledge_relationships_inheritance_ck CHECK (privacy_inheritance IN (
    'most_restrictive', 'source', 'target', 'explicit'
  )),
  CONSTRAINT knowledge_relationships_privacy_ck CHECK (privacy_level IN (
    'internal', 'household', 'personal_private', 'sensitive_personal', 'restricted_third_party'
  )),
  CONSTRAINT knowledge_relationships_visibility_ck CHECK (visibility IN ('private', 'household', 'shared')),
  CONSTRAINT knowledge_relationships_status_ck CHECK (status IN ('active', 'archived', 'deleted')),
  CONSTRAINT knowledge_relationships_temporal_ck CHECK (temporal_state IN ('historical', 'current', 'future', 'predicted')),
  CONSTRAINT knowledge_relationships_time_range_ck CHECK (ended_at IS NULL OR started_at IS NULL OR ended_at >= started_at),
  CONSTRAINT knowledge_relationships_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_relationships_legal_hold_ck CHECK (NOT (legal_hold AND status = 'deleted')),
  CONSTRAINT knowledge_relationships_archived_ck CHECK (status <> 'archived' OR archived_at IS NOT NULL),
  CONSTRAINT knowledge_relationships_deleted_ck CHECK (status <> 'deleted' OR deleted_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS knowledge_relationships_source_idx
  ON knowledge_relationships (household_id, source_entity_id, relationship_type, status);
CREATE INDEX IF NOT EXISTS knowledge_relationships_target_idx
  ON knowledge_relationships (household_id, target_entity_id, relationship_type, status);
CREATE INDEX IF NOT EXISTS knowledge_relationships_owner_idx
  ON knowledge_relationships (owner_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_relationships_source_record_uq
  ON knowledge_relationships (primary_source_id, source_record_ref)
  WHERE source_record_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS knowledge_relationships_timeline_idx
  ON knowledge_relationships (household_id, occurred_at DESC)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS knowledge_relationship_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  relationship_id uuid NOT NULL REFERENCES knowledge_relationships(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version integer NOT NULL,
  change_kind text NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_relationship_versions_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_relationship_versions_change_ck CHECK (change_kind IN ('created', 'corrected', 'archived', 'restored', 'deleted')),
  UNIQUE (relationship_id, version)
);

CREATE INDEX IF NOT EXISTS knowledge_relationship_versions_relationship_idx
  ON knowledge_relationship_versions (relationship_id, version DESC);

CREATE TABLE IF NOT EXISTS knowledge_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  actor_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_audit_events_type_ck CHECK (event_type IN ('created', 'corrected', 'archived', 'restored', 'deleted', 'shared', 'revoked', 'verified', 'disputed')),
  CONSTRAINT knowledge_audit_events_redaction_ck CHECK (
    NOT (metadata ?| ARRAY['title', 'body', 'content', 'description', 'reasoning', 'source_text', 'external_reference'])
  )
);

CREATE INDEX IF NOT EXISTS knowledge_audit_events_entity_idx
  ON knowledge_audit_events (entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_memories (
  entity_id uuid PRIMARY KEY REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  title text NOT NULL,
  summary text,
  emotions text[] NOT NULL DEFAULT ARRAY[]::text[],
  importance smallint,
  timeline_position text,
  ai_summary text,
  follow_up_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_memories_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_memories_importance_ck CHECK (importance IS NULL OR (importance >= 1 AND importance <= 5))
);

CREATE TABLE IF NOT EXISTS knowledge_observations (
  entity_id uuid PRIMARY KEY REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  observation_text text NOT NULL,
  observation_kind text NOT NULL DEFAULT 'user_observation',
  observed_at timestamp with time zone NOT NULL,
  asserted_by_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_observations_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_observations_kind_ck CHECK (observation_kind IN ('user_observation', 'sensor_observation', 'imported_observation'))
);

CREATE TABLE IF NOT EXISTS knowledge_insights (
  entity_id uuid PRIMARY KEY REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  reasoning text NOT NULL,
  status text NOT NULL DEFAULT 'candidate',
  accepted_at timestamp with time zone,
  dismissed_at timestamp with time zone,
  expired_at timestamp with time zone,
  follow_up_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_insights_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_insights_status_ck CHECK (status IN ('candidate', 'accepted', 'dismissed', 'expired')),
  CONSTRAINT knowledge_insights_lifecycle_ck CHECK (
    (status <> 'accepted' OR accepted_at IS NOT NULL)
    AND (status <> 'dismissed' OR dismissed_at IS NOT NULL)
    AND (status <> 'expired' OR expired_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS knowledge_recommendations (
  entity_id uuid PRIMARY KEY REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  recommendation text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  urgency text NOT NULL DEFAULT 'not_urgent',
  estimated_benefit text,
  estimated_effort text,
  categories text[] NOT NULL DEFAULT ARRAY[]::text[],
  required_permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'proposed',
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_recommendations_version_ck CHECK (version > 0),
  CONSTRAINT knowledge_recommendations_priority_ck CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT knowledge_recommendations_urgency_ck CHECK (urgency IN ('not_urgent', 'soon', 'urgent', 'immediate')),
  CONSTRAINT knowledge_recommendations_status_ck CHECK (status IN ('proposed', 'accepted', 'dismissed', 'completed', 'expired'))
);

CREATE TABLE IF NOT EXISTS lighthouse_passports (
  entity_id uuid PRIMARY KEY REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  lighthouse_passport_id text NOT NULL,
  identity jsonb NOT NULL DEFAULT '{}'::jsonb,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  growth_areas jsonb NOT NULL DEFAULT '[]'::jsonb,
  communication_style jsonb NOT NULL DEFAULT '{}'::jsonb,
  career jsonb NOT NULL DEFAULT '{}'::jsonb,
  education jsonb NOT NULL DEFAULT '{}'::jsonb,
  medical jsonb NOT NULL DEFAULT '{}'::jsonb,
  family jsonb NOT NULL DEFAULT '{}'::jsonb,
  relationships jsonb NOT NULL DEFAULT '{}'::jsonb,
  important_memories jsonb NOT NULL DEFAULT '[]'::jsonb,
  goals jsonb NOT NULL DEFAULT '[]'::jsonb,
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  privacy_preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT lighthouse_passports_version_ck CHECK (version > 0),
  UNIQUE (user_id),
  UNIQUE (lighthouse_passport_id)
);

CREATE TABLE IF NOT EXISTS knowledge_extension_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES knowledge_entities(id) ON UPDATE RESTRICT ON DELETE CASCADE,
  household_id integer NOT NULL REFERENCES households(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  owner_user_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  extension_kind text NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by_id integer NOT NULL REFERENCES users(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_extension_versions_kind_ck CHECK (
    extension_kind IN ('memory', 'observation', 'insight', 'recommendation', 'passport')
  ),
  CONSTRAINT knowledge_extension_versions_version_ck CHECK (version > 0),
  UNIQUE (entity_id, extension_kind, version)
);

CREATE INDEX IF NOT EXISTS knowledge_extension_versions_entity_idx
  ON knowledge_extension_versions (entity_id, extension_kind, version DESC);

CREATE OR REPLACE FUNCTION lighthouse_guard_knowledge_entity_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.entity_type <> OLD.entity_type
    OR NEW.household_id <> OLD.household_id
    OR NEW.owner_user_id <> OLD.owner_user_id
    OR NEW.created_by_id <> OLD.created_by_id
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Knowledge entity identity and ownership fields are immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Knowledge entity version must increment by exactly one';
  END IF;

  IF NEW.entity_type = 'person' AND EXISTS (
    SELECT 1 FROM lighthouse_passports passport WHERE passport.entity_id = NEW.id
  ) AND NEW.visibility <> 'private' THEN
    RAISE EXCEPTION 'Lighthouse Passport entities must remain private';
  END IF;

  IF NEW.status = 'archived' AND OLD.status <> 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := clock_timestamp();
  ELSIF NEW.status = 'active' THEN
    NEW.archived_at := NULL;
  END IF;

  IF NEW.status = 'deleted' AND OLD.status <> 'deleted' AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := clock_timestamp();
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_guard_knowledge_entity_grant_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.household_id <> OLD.household_id
    OR NEW.entity_id <> OLD.entity_id
    OR NEW.grantor_user_id <> OLD.grantor_user_id
    OR NEW.grantee_user_id <> OLD.grantee_user_id
    OR NEW.permission <> OLD.permission
    OR NEW.purpose <> OLD.purpose
    OR NEW.created_at <> OLD.created_at
    OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Knowledge entity grant identity and scope fields are immutable';
  END IF;

  IF OLD.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Revoked knowledge entity grants are immutable';
  END IF;

  IF NEW.revoked_at IS NULL OR NEW.revoked_by_id IS NULL THEN
    RAISE EXCEPTION 'Knowledge entity grant updates may only revoke access';
  END IF;

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_capture_knowledge_entity_grant_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  entity_owner_user_id integer;
BEGIN
  SELECT entity.owner_user_id
    INTO STRICT entity_owner_user_id
    FROM knowledge_entities entity
   WHERE entity.id = NEW.entity_id;

  INSERT INTO knowledge_audit_events (
    household_id, owner_user_id, actor_user_id, entity_id, event_type, summary, metadata
  ) VALUES (
    NEW.household_id,
    entity_owner_user_id,
    CASE WHEN TG_OP = 'INSERT' THEN NEW.grantor_user_id ELSE NEW.revoked_by_id END,
    NEW.entity_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'shared' ELSE 'revoked' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'Knowledge entity shared' ELSE 'Knowledge entity access revoked' END,
    jsonb_build_object(
      'permission', NEW.permission,
      'grantState', CASE WHEN TG_OP = 'INSERT' THEN 'active' ELSE 'revoked' END
    )
  );

  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_capture_knowledge_entity_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  change_kind text;
BEGIN
  change_kind := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN NEW.status = 'deleted' AND OLD.status <> 'deleted' THEN 'deleted'
    WHEN NEW.status = 'archived' AND OLD.status <> 'archived' THEN 'archived'
    WHEN NEW.status = 'active' AND OLD.status = 'archived' THEN 'restored'
    ELSE 'corrected'
  END;

  INSERT INTO knowledge_entity_versions (
    entity_id, household_id, owner_user_id, version, change_kind, snapshot, changed_by_id
  ) VALUES (
    NEW.id, NEW.household_id, NEW.owner_user_id, NEW.version, change_kind,
    to_jsonb(NEW) - 'search_vector', NEW.updated_by_id
  );

  INSERT INTO knowledge_audit_events (
    household_id, owner_user_id, actor_user_id, entity_id, event_type, summary, metadata
  ) VALUES (
    NEW.household_id,
    NEW.owner_user_id,
    NEW.updated_by_id,
    NEW.id,
    change_kind,
    CASE change_kind
      WHEN 'created' THEN 'Knowledge entity created'
      WHEN 'archived' THEN 'Knowledge entity archived'
      WHEN 'restored' THEN 'Knowledge entity restored'
      WHEN 'deleted' THEN 'Knowledge entity deleted'
      ELSE 'Knowledge entity corrected'
    END,
    jsonb_build_object(
      'entityType', NEW.entity_type,
      'version', NEW.version,
      'status', NEW.status,
      'visibility', NEW.visibility,
      'verificationState', NEW.verification_state
    )
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS knowledge_entities_guard_update ON knowledge_entities;
CREATE TRIGGER knowledge_entities_guard_update
  BEFORE UPDATE ON knowledge_entities
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_entity_update();

DROP TRIGGER IF EXISTS knowledge_entities_capture_change ON knowledge_entities;
CREATE TRIGGER knowledge_entities_capture_change
  AFTER INSERT OR UPDATE ON knowledge_entities
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_entity_change();

DROP TRIGGER IF EXISTS knowledge_entity_grants_guard_update ON knowledge_entity_grants;
CREATE TRIGGER knowledge_entity_grants_guard_update
  BEFORE UPDATE ON knowledge_entity_grants
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_entity_grant_update();

DROP TRIGGER IF EXISTS knowledge_entity_grants_capture_change ON knowledge_entity_grants;
CREATE TRIGGER knowledge_entity_grants_capture_change
  AFTER INSERT OR UPDATE ON knowledge_entity_grants
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_entity_grant_change();

CREATE OR REPLACE FUNCTION lighthouse_guard_knowledge_relationship_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.id <> OLD.id
    OR NEW.household_id <> OLD.household_id
    OR NEW.owner_user_id <> OLD.owner_user_id
    OR NEW.source_entity_id <> OLD.source_entity_id
    OR NEW.target_entity_id <> OLD.target_entity_id
    OR NEW.relationship_type <> OLD.relationship_type
    OR NEW.created_by_id <> OLD.created_by_id
    OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Knowledge relationship identity and endpoint fields are immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Knowledge relationship version must increment by exactly one';
  END IF;

  IF NEW.status = 'archived' AND OLD.status <> 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at := clock_timestamp();
  ELSIF NEW.status = 'active' THEN
    NEW.archived_at := NULL;
  END IF;

  IF NEW.status = 'deleted' AND OLD.status <> 'deleted' AND NEW.deleted_at IS NULL THEN
    NEW.deleted_at := clock_timestamp();
  END IF;

  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_capture_knowledge_relationship_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  change_kind text;
BEGIN
  change_kind := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN NEW.status = 'deleted' AND OLD.status <> 'deleted' THEN 'deleted'
    WHEN NEW.status = 'archived' AND OLD.status <> 'archived' THEN 'archived'
    WHEN NEW.status = 'active' AND OLD.status = 'archived' THEN 'restored'
    ELSE 'corrected'
  END;

  INSERT INTO knowledge_relationship_versions (
    relationship_id, household_id, owner_user_id, version, change_kind, snapshot, changed_by_id
  ) VALUES (
    NEW.id, NEW.household_id, NEW.owner_user_id, NEW.version, change_kind,
    to_jsonb(NEW), NEW.updated_by_id
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS knowledge_relationships_guard_update ON knowledge_relationships;
CREATE TRIGGER knowledge_relationships_guard_update
  BEFORE UPDATE ON knowledge_relationships
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_relationship_update();

DROP TRIGGER IF EXISTS knowledge_relationships_capture_change ON knowledge_relationships;
CREATE TRIGGER knowledge_relationships_capture_change
  AFTER INSERT OR UPDATE ON knowledge_relationships
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_relationship_change();

CREATE OR REPLACE FUNCTION lighthouse_validate_knowledge_extension()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  expected_type text := TG_ARGV[0];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = NEW.entity_id AND entity.entity_type = expected_type
  ) THEN
    RAISE EXCEPTION 'Knowledge extension requires entity type %', expected_type;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_guard_knowledge_extension_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.entity_id <> OLD.entity_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Knowledge extension identity and creation fields are immutable';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'Knowledge extension version must increment by exactly one';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION lighthouse_capture_knowledge_extension_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
DECLARE
  extension_kind text := TG_ARGV[0];
  entity_household_id integer;
  entity_owner_user_id integer;
  entity_updated_by_id integer;
  actor_user_id integer;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.version <> 1 THEN
    RAISE EXCEPTION 'Initial knowledge extension version must be one';
  END IF;

  SELECT entity.household_id, entity.owner_user_id, entity.updated_by_id
    INTO STRICT entity_household_id, entity_owner_user_id, entity_updated_by_id
    FROM knowledge_entities entity
   WHERE entity.id = NEW.entity_id;

  actor_user_id := COALESCE(lighthouse_actor_user_id(), entity_updated_by_id);

  INSERT INTO knowledge_extension_versions (
    entity_id, household_id, owner_user_id, extension_kind, version, snapshot, changed_by_id
  ) VALUES (
    NEW.entity_id,
    entity_household_id,
    entity_owner_user_id,
    extension_kind,
    NEW.version,
    to_jsonb(NEW),
    actor_user_id
  );

  INSERT INTO knowledge_audit_events (
    household_id, owner_user_id, actor_user_id, entity_id, event_type, summary, metadata
  ) VALUES (
    entity_household_id,
    entity_owner_user_id,
    actor_user_id,
    NEW.entity_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'created' ELSE 'corrected' END,
    CASE WHEN TG_OP = 'INSERT' THEN 'Knowledge entity extension created' ELSE 'Knowledge entity extension corrected' END,
    jsonb_build_object('extensionKind', extension_kind, 'version', NEW.version)
  );

  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS knowledge_memories_validate_type ON knowledge_memories;
CREATE TRIGGER knowledge_memories_validate_type
  BEFORE INSERT OR UPDATE ON knowledge_memories
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_knowledge_extension('memory');

DROP TRIGGER IF EXISTS knowledge_observations_validate_type ON knowledge_observations;
CREATE TRIGGER knowledge_observations_validate_type
  BEFORE INSERT OR UPDATE ON knowledge_observations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_knowledge_extension('observation');

DROP TRIGGER IF EXISTS knowledge_insights_validate_type ON knowledge_insights;
CREATE TRIGGER knowledge_insights_validate_type
  BEFORE INSERT OR UPDATE ON knowledge_insights
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_knowledge_extension('ai_insight');

DROP TRIGGER IF EXISTS knowledge_recommendations_validate_type ON knowledge_recommendations;
CREATE TRIGGER knowledge_recommendations_validate_type
  BEFORE INSERT OR UPDATE ON knowledge_recommendations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_knowledge_extension('recommendation');

DROP TRIGGER IF EXISTS knowledge_memories_guard_update ON knowledge_memories;
CREATE TRIGGER knowledge_memories_guard_update
  BEFORE UPDATE ON knowledge_memories
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_extension_update();
DROP TRIGGER IF EXISTS knowledge_memories_capture_change ON knowledge_memories;
CREATE TRIGGER knowledge_memories_capture_change
  AFTER INSERT OR UPDATE ON knowledge_memories
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_extension_change('memory');

DROP TRIGGER IF EXISTS knowledge_observations_guard_update ON knowledge_observations;
CREATE TRIGGER knowledge_observations_guard_update
  BEFORE UPDATE ON knowledge_observations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_extension_update();
DROP TRIGGER IF EXISTS knowledge_observations_capture_change ON knowledge_observations;
CREATE TRIGGER knowledge_observations_capture_change
  AFTER INSERT OR UPDATE ON knowledge_observations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_extension_change('observation');

DROP TRIGGER IF EXISTS knowledge_insights_guard_update ON knowledge_insights;
CREATE TRIGGER knowledge_insights_guard_update
  BEFORE UPDATE ON knowledge_insights
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_extension_update();
DROP TRIGGER IF EXISTS knowledge_insights_capture_change ON knowledge_insights;
CREATE TRIGGER knowledge_insights_capture_change
  AFTER INSERT OR UPDATE ON knowledge_insights
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_extension_change('insight');

DROP TRIGGER IF EXISTS knowledge_recommendations_guard_update ON knowledge_recommendations;
CREATE TRIGGER knowledge_recommendations_guard_update
  BEFORE UPDATE ON knowledge_recommendations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_extension_update();
DROP TRIGGER IF EXISTS knowledge_recommendations_capture_change ON knowledge_recommendations;
CREATE TRIGGER knowledge_recommendations_capture_change
  AFTER INSERT OR UPDATE ON knowledge_recommendations
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_extension_change('recommendation');

CREATE OR REPLACE FUNCTION lighthouse_validate_passport()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM knowledge_entities entity
    JOIN users person ON person.id = NEW.user_id
    WHERE entity.id = NEW.entity_id
      AND entity.entity_type = 'person'
      AND entity.visibility = 'private'
      AND entity.household_id = NEW.household_id
      AND entity.owner_user_id = NEW.owner_user_id
      AND NEW.owner_user_id = NEW.user_id
      AND person.household_id = NEW.household_id
      AND person.lighthouse_passport_id = NEW.lighthouse_passport_id
  ) THEN
    RAISE EXCEPTION 'Passport must bind a private person entity to its owning user';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS lighthouse_passports_validate ON lighthouse_passports;
CREATE TRIGGER lighthouse_passports_validate
  BEFORE INSERT OR UPDATE ON lighthouse_passports
  FOR EACH ROW EXECUTE FUNCTION lighthouse_validate_passport();

DROP TRIGGER IF EXISTS lighthouse_passports_guard_update ON lighthouse_passports;
CREATE TRIGGER lighthouse_passports_guard_update
  BEFORE UPDATE ON lighthouse_passports
  FOR EACH ROW EXECUTE FUNCTION lighthouse_guard_knowledge_extension_update();
DROP TRIGGER IF EXISTS lighthouse_passports_capture_change ON lighthouse_passports;
CREATE TRIGGER lighthouse_passports_capture_change
  AFTER INSERT OR UPDATE ON lighthouse_passports
  FOR EACH ROW EXECUTE FUNCTION lighthouse_capture_knowledge_extension_change('passport');

GRANT SELECT ON knowledge_entity_types, knowledge_relationship_types TO lighthouse_runtime;
REVOKE INSERT, UPDATE, DELETE ON knowledge_entity_types, knowledge_relationship_types FROM lighthouse_runtime;

GRANT SELECT, INSERT, UPDATE ON
  knowledge_sources,
  knowledge_entities,
  knowledge_entity_grants,
  knowledge_entity_sources,
  knowledge_relationships,
  knowledge_memories,
  knowledge_observations,
  knowledge_insights,
  knowledge_recommendations,
  lighthouse_passports
TO lighthouse_runtime;

GRANT SELECT, INSERT ON
  knowledge_entity_versions,
  knowledge_relationship_versions,
  knowledge_extension_versions,
  knowledge_audit_events
TO lighthouse_runtime;

REVOKE DELETE ON
  knowledge_sources,
  knowledge_entities,
  knowledge_entity_grants,
  knowledge_entity_sources,
  knowledge_entity_versions,
  knowledge_extension_versions,
  knowledge_relationships,
  knowledge_relationship_versions,
  knowledge_audit_events,
  knowledge_memories,
  knowledge_observations,
  knowledge_insights,
  knowledge_recommendations,
  lighthouse_passports
FROM lighthouse_runtime;

REVOKE UPDATE ON
  knowledge_entity_versions,
  knowledge_extension_versions,
  knowledge_relationship_versions,
  knowledge_audit_events
FROM lighthouse_runtime;

ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entity_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entity_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_entity_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_extension_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationship_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighthouse_passports ENABLE ROW LEVEL SECURITY;

CREATE POLICY knowledge_sources_owner ON knowledge_sources
  FOR ALL TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
  )
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
  );

CREATE POLICY knowledge_entity_grants_read ON knowledge_entity_grants
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

CREATE POLICY knowledge_entity_grants_owner_insert ON knowledge_entity_grants
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND grantor_user_id = lighthouse_actor_user_id()
    AND grantee_user_id <> lighthouse_actor_user_id()
    AND permission = 'read'
    AND revoked_at IS NULL
    AND revoked_by_id IS NULL
    AND EXISTS (
      SELECT 1 FROM users grantee
      WHERE grantee.id = knowledge_entity_grants.grantee_user_id
        AND grantee.household_id = lighthouse_actor_household_id()
    )
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_grants.entity_id
        AND entity.household_id = lighthouse_actor_household_id()
        AND entity.owner_user_id = lighthouse_actor_user_id()
        AND entity.status <> 'deleted'
    )
  );

CREATE POLICY knowledge_entity_grants_owner_update ON knowledge_entity_grants
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
    AND permission = 'read'
    AND (revoked_by_id IS NULL OR revoked_by_id = lighthouse_actor_user_id())
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_grants.entity_id
        AND entity.household_id = lighthouse_actor_household_id()
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
    AND EXISTS (
      SELECT 1 FROM users grantee
      WHERE grantee.id = knowledge_entity_grants.grantee_user_id
        AND grantee.household_id = lighthouse_actor_household_id()
    )
  );

CREATE POLICY knowledge_entities_read ON knowledge_entities
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
              SELECT 1 FROM knowledge_entity_grants grant_row
              WHERE grant_row.entity_id = knowledge_entities.id
                AND grant_row.household_id = knowledge_entities.household_id
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

CREATE POLICY knowledge_entities_owner_insert ON knowledge_entities
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_sources source
      WHERE source.id = knowledge_entities.primary_source_id
        AND source.household_id = lighthouse_actor_household_id()
        AND source.owner_user_id = lighthouse_actor_user_id()
        AND source.status <> 'deleted'
    )
  );

CREATE POLICY knowledge_entities_owner_update ON knowledge_entities
  FOR UPDATE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND status <> 'deleted'
  )
  WITH CHECK (
    household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
  );

CREATE POLICY knowledge_entity_sources_read ON knowledge_entity_sources
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_sources.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_entity_sources_owner_insert ON knowledge_entity_sources
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND created_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_sources.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
    AND EXISTS (
      SELECT 1 FROM knowledge_sources source
      WHERE source.id = knowledge_entity_sources.source_id
        AND source.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_entity_versions_read ON knowledge_entity_versions
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_versions.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_entity_versions_owner_insert ON knowledge_entity_versions
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND changed_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_entity_versions.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_extension_versions_read ON knowledge_extension_versions
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_extension_versions.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_extension_versions_owner_insert ON knowledge_extension_versions
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND changed_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_extension_versions.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_relationships_read ON knowledge_relationships
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND (
      owner_user_id = lighthouse_actor_user_id()
      OR (
        status <> 'deleted'
        AND deleted_at IS NULL
        AND visibility IN ('household', 'shared')
        AND EXISTS (
          SELECT 1 FROM knowledge_entities source
          WHERE source.id = knowledge_relationships.source_entity_id
        )
        AND EXISTS (
          SELECT 1 FROM knowledge_entities target
          WHERE target.id = knowledge_relationships.target_entity_id
        )
      )
    )
  );

CREATE POLICY knowledge_relationships_owner_insert ON knowledge_relationships
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities source
      WHERE source.id = knowledge_relationships.source_entity_id
        AND source.household_id = lighthouse_actor_household_id()
        AND source.owner_user_id = lighthouse_actor_user_id()
        AND source.status <> 'deleted'
    )
    AND EXISTS (
      SELECT 1 FROM knowledge_entities target
      WHERE target.id = knowledge_relationships.target_entity_id
        AND target.household_id = lighthouse_actor_household_id()
        AND target.owner_user_id = lighthouse_actor_user_id()
        AND target.status <> 'deleted'
    )
    AND EXISTS (
      SELECT 1 FROM knowledge_sources source
      WHERE source.id = knowledge_relationships.primary_source_id
        AND source.owner_user_id = lighthouse_actor_user_id()
        AND source.household_id = lighthouse_actor_household_id()
    )
  );

CREATE POLICY knowledge_relationships_owner_update ON knowledge_relationships
  FOR UPDATE TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND status <> 'deleted'
  )
  WITH CHECK (
    household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND created_by_id = lighthouse_actor_user_id()
    AND updated_by_id = lighthouse_actor_user_id()
  );

CREATE POLICY knowledge_relationship_versions_read ON knowledge_relationship_versions
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_relationships relationship
      WHERE relationship.id = knowledge_relationship_versions.relationship_id
        AND relationship.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_relationship_versions_owner_insert ON knowledge_relationship_versions
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND changed_by_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_relationships relationship
      WHERE relationship.id = knowledge_relationship_versions.relationship_id
        AND relationship.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_audit_events_read ON knowledge_audit_events
  FOR SELECT TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_audit_events.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_audit_events_owner_insert ON knowledge_audit_events
  FOR INSERT TO lighthouse_runtime
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND actor_user_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_audit_events.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
    )
  );

CREATE POLICY knowledge_memories_entity_access ON knowledge_memories
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_memories.entity_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_memories.entity_id
      AND entity.owner_user_id = lighthouse_actor_user_id()
  ));

CREATE POLICY knowledge_observations_entity_access ON knowledge_observations
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_observations.entity_id
  ))
  WITH CHECK (
    asserted_by_user_id = lighthouse_actor_user_id()
    AND EXISTS (
      SELECT 1 FROM knowledge_entities entity
      WHERE entity.id = knowledge_observations.entity_id
        AND entity.owner_user_id = lighthouse_actor_user_id()
        AND entity.verification_state NOT IN ('source_verified', 'user_verified')
    )
  );

CREATE POLICY knowledge_insights_entity_access ON knowledge_insights
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_insights.entity_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_insights.entity_id
      AND entity.owner_user_id = lighthouse_actor_user_id()
  ));

CREATE POLICY knowledge_recommendations_entity_access ON knowledge_recommendations
  FOR ALL TO lighthouse_runtime
  USING (lighthouse_actor_user_id() IS NOT NULL AND EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_recommendations.entity_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM knowledge_entities entity
    WHERE entity.id = knowledge_recommendations.entity_id
      AND entity.owner_user_id = lighthouse_actor_user_id()
  ));

CREATE POLICY lighthouse_passports_owner ON lighthouse_passports
  FOR ALL TO lighthouse_runtime
  USING (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND user_id = lighthouse_actor_user_id()
  )
  WITH CHECK (
    lighthouse_actor_user_id() IS NOT NULL
    AND household_id = lighthouse_actor_household_id()
    AND owner_user_id = lighthouse_actor_user_id()
    AND user_id = lighthouse_actor_user_id()
  );
