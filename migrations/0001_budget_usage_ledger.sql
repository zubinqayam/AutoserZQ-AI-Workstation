CREATE TABLE IF NOT EXISTS usage_ledger (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  uid varchar NOT NULL,
  usage_date date NOT NULL,
  usage_month varchar(7) NOT NULL,
  gemini_input_micros bigint NOT NULL DEFAULT 0,
  gemini_output_micros bigint NOT NULL DEFAULT 0,
  gemini_thinking_micros bigint NOT NULL DEFAULT 0,
  serp_micros bigint NOT NULL DEFAULT 0,
  reserved_micros bigint NOT NULL DEFAULT 0,
  gemini_calls integer NOT NULL DEFAULT 0,
  rer_launches integer NOT NULL DEFAULT 0,
  coa_calls integer NOT NULL DEFAULT 0,
  serp_searches integer NOT NULL DEFAULT 0,
  url_fetches integer NOT NULL DEFAULT 0,
  estimated_input_tokens integer NOT NULL DEFAULT 0,
  estimated_output_tokens integer NOT NULL DEFAULT 0,
  estimated_thinking_tokens integer NOT NULL DEFAULT 0,
  actual_input_tokens integer NOT NULL DEFAULT 0,
  actual_output_tokens integer NOT NULL DEFAULT 0,
  actual_thinking_tokens integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_ledger_uid_date_unique
  ON usage_ledger (uid, usage_date);

CREATE INDEX IF NOT EXISTS usage_ledger_uid_month_idx
  ON usage_ledger (uid, usage_month);

CREATE TABLE IF NOT EXISTS budget_reservations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  uid varchar NOT NULL,
  provider varchar NOT NULL,
  operation_type varchar NOT NULL,
  estimated_micros bigint NOT NULL,
  actual_micros bigint,
  status varchar NOT NULL DEFAULT 'active',
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  settled_at timestamp,
  released_at timestamp
);

CREATE INDEX IF NOT EXISTS budget_reservations_uid_status_idx
  ON budget_reservations (uid, status);

CREATE TABLE IF NOT EXISTS evidence_captures (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id varchar NOT NULL,
  mission_id varchar,
  panel_id varchar NOT NULL,
  source_url text NOT NULL,
  capture_timestamp timestamp NOT NULL,
  title text,
  label text,
  content_excerpt text,
  content_hash varchar,
  screenshot_ref text,
  created_by_uid varchar NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS evidence_captures_room_id_created_at_idx
  ON evidence_captures (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS evidence_captures_created_by_uid_idx
  ON evidence_captures (created_by_uid);
