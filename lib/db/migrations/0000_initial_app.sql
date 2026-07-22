CREATE TABLE IF NOT EXISTS "session" (
  sid varchar PRIMARY KEY,
  sess json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire"
  ON "session" (expire);

CREATE TABLE IF NOT EXISTS households (
  id serial PRIMARY KEY,
  name text NOT NULL DEFAULT 'Our Home',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  lighthouse_passport_id text UNIQUE,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL DEFAULT '',
  display_name text NOT NULL,
  role text NOT NULL DEFAULT 'adult',
  avatar_initials text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT '#888888',
  age integer,
  messages_last_seen_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS household_invites (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  inviter_user_id integer NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  sender_id integer NOT NULL,
  body text NOT NULL,
  message_type text NOT NULL DEFAULT 'message',
  has_experience_mention boolean NOT NULL DEFAULT false,
  experience_mention_text text,
  saved_as_memory_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_household_created_idx
  ON messages (household_id, created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  user_id integer NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  reference_id text,
  reference_type text,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_experiences (
  id serial PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  household_id integer NOT NULL,
  created_by_user_id integer NOT NULL,
  title text NOT NULL,
  description text,
  image_url text,
  category text NOT NULL DEFAULT 'custom',
  setting text NOT NULL DEFAULT 'any',
  duration_minutes integer,
  cost_estimate integer,
  energy_level text NOT NULL DEFAULT 'medium',
  participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  visibility text NOT NULL DEFAULT 'household',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experience_states (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  user_id integer NOT NULL,
  experience_id text NOT NULL,
  is_saved boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  is_shortlisted boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT uniq_exp_user UNIQUE (experience_id, user_id)
);

CREATE TABLE IF NOT EXISTS experience_profiles (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  user_id integer NOT NULL UNIQUE,
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  dislikes jsonb NOT NULL DEFAULT '[]'::jsonb,
  curiosity_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  food_preferences jsonb NOT NULL DEFAULT '[]'::jsonb,
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb,
  crowd_tolerance text NOT NULL DEFAULT 'medium',
  activity_level text NOT NULL DEFAULT 'medium',
  preferred_time_of_day jsonb NOT NULL DEFAULT '[]'::jsonb,
  travel_tolerance text NOT NULL DEFAULT 'regional',
  spending_comfort text NOT NULL DEFAULT 'moderate',
  surprise_comfort text NOT NULL DEFAULT 'some-ok',
  accessibility_needs jsonb NOT NULL DEFAULT '[]'::jsonb,
  favorites jsonb NOT NULL DEFAULT '[]'::jsonb,
  never_suggest jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invitations (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  slug text NOT NULL UNIQUE,
  inviter_id integer NOT NULL,
  invitee_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_id text NOT NULL,
  experience_title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  purpose text,
  proposed_date text,
  proposed_date_flexible boolean NOT NULL DEFAULT false,
  duration_minutes integer,
  detail_level text NOT NULL DEFAULT 'full',
  dress_guidance text,
  what_to_bring text,
  planning_responsibility text,
  payment_arrangement text,
  transportation_notes text,
  childcare_notes text,
  reservation_status text,
  accessibility_notes text,
  message text,
  is_surprise boolean NOT NULL DEFAULT false,
  surprise_revealed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  rsvp_response text,
  rsvp_note text,
  rsvp_at timestamp with time zone,
  calendar_event_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  date text NOT NULL,
  time text,
  duration_minutes integer,
  participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  experience_id text,
  invitation_id text,
  notes text,
  location text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS planning_tasks (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'other',
  completed boolean NOT NULL DEFAULT false,
  due_date text,
  calendar_event_id text,
  invitation_id text,
  assignee_id integer,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memories (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  source_type text NOT NULL DEFAULT 'manual',
  source_message text,
  mentioned_by_id integer,
  image_url text,
  link text,
  season text,
  budget_estimate numeric,
  participant_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  surprise_eligible boolean NOT NULL DEFAULT false,
  advance_planning_needed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reflections (
  id serial PRIMARY KEY,
  household_id integer NOT NULL,
  user_id integer NOT NULL,
  calendar_event_id text NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  enjoyment integer,
  would_repeat boolean,
  best_part text,
  cost_comfort text,
  duration_fit text,
  crowd_fit text,
  felt_considered boolean,
  planning_effort_felt text,
  tradition_worthy boolean,
  remember_for text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
