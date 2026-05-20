-- ============================================================
-- Preview Campaign System — Database Schema v19
-- Run via: npm run migrate
-- ============================================================

-- Enable uuid generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ORGANIZATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── USERS (AGENTS & ADMINS) ───────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL REFERENCES organizations(id),
  email        TEXT        NOT NULL,
  password_hash TEXT       NOT NULL,
  first_name   TEXT        NOT NULL,
  last_name    TEXT        NOT NULL,
  role         TEXT        NOT NULL DEFAULT 'agent', -- agent | admin | supervisor
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

-- ── CONTACT LISTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_lists (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONTACT LIST FIELD DEFINITIONS ───────────────────────
CREATE TABLE IF NOT EXISTS contact_list_field_definitions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id       UUID        NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  field_key             TEXT        NOT NULL,
  field_label           TEXT        NOT NULL,
  field_type            TEXT        NOT NULL DEFAULT 'text', -- text | number | date | boolean | url
  is_required           BOOLEAN     NOT NULL DEFAULT FALSE,
  display_order         INT         NOT NULL DEFAULT 99,
  is_visible_to_agent   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_list_id, field_key),
  -- Prevent system-reserved keys
  CHECK (field_key NOT IN (
    'phone_number','first_name','last_name','email',
    'timezone','assigned_agent_id','priority'
  ))
);

-- ── CONTACT UPLOAD BATCHES ────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_upload_batches (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id  UUID        NOT NULL REFERENCES contact_lists(id),
  ingestion_method TEXT        NOT NULL, -- API_SINGLE | API_BATCH | CSV_UPLOAD | SOURCE_LOCATION
  source_ref       TEXT,                 -- filename, path, or API endpoint ref
  total_rows       INT         NOT NULL DEFAULT 0,
  imported_rows    INT         NOT NULL DEFAULT 0,
  failed_rows      INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'processing', -- processing | done | partial_failure | failed
  error_log        JSONB,                -- [{row, phone, error}]
  uploaded_by      UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- ── CONTACTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id     UUID        NOT NULL REFERENCES contact_lists(id),
  phone_number        TEXT        NOT NULL,
  first_name          TEXT,
  last_name           TEXT,
  email               TEXT,
  timezone            TEXT,
  -- System columns — not custom_fields
  priority            INT         NOT NULL DEFAULT 100,
  assigned_agent_id   UUID        REFERENCES users(id),
  -- Dynamic fields
  custom_fields       JSONB       NOT NULL DEFAULT '{}',
  upload_batch_id     UUID        REFERENCES contact_upload_batches(id),
  ingestion_method    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_list    ON contacts(contact_list_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone   ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_agent   ON contacts(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;

-- ── DNC GROUPS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dnc_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  description TEXT,
  source      TEXT        NOT NULL DEFAULT 'import',
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dnc_numbers (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dnc_group_id    UUID        NOT NULL REFERENCES dnc_groups(id) ON DELETE CASCADE,
  phone_number    TEXT        NOT NULL,
  added_reason    TEXT,
  added_by        UUID        REFERENCES users(id),
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE (dnc_group_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_dnc_numbers_phone ON dnc_numbers(phone_number);

-- ── SCHEDULE TEMPLATES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_templates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  timezone    TEXT        NOT NULL DEFAULT 'UTC',
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_windows (
  id                   UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_template_id UUID  NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  day_of_week          SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time           TIME  NOT NULL,
  end_time             TIME  NOT NULL,
  CHECK (end_time > start_time)
);

-- ── HOLIDAY CALENDARS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS holiday_calendars (
  id           UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID  NOT NULL REFERENCES organizations(id),
  name         TEXT  NOT NULL,
  country_code CHAR(2),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS holiday_dates (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id      UUID  NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
  holiday_date     DATE  NOT NULL,
  holiday_name     TEXT,
  is_full_day_block BOOLEAN NOT NULL DEFAULT TRUE,
  block_start      TIME,
  block_end        TIME
);

-- ── CONTACT STRATEGIES ────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_strategies (
  id            UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID  NOT NULL REFERENCES organizations(id),
  strategy_name TEXT  NOT NULL,
  strategy_text TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CAMPAIGNS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID        NOT NULL REFERENCES organizations(id),
  name                    TEXT        NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'draft', -- draft | active | completed | stopped
  schedule_type           TEXT        NOT NULL DEFAULT 'finite', -- finite | infinite
  contact_strategy_id     UUID        REFERENCES contact_strategies(id),
  max_attempts            INT,          -- NULL = unlimited
  wrapup_time_sec         INT         NOT NULL DEFAULT 90,
  auto_dial_delay_sec     INT         NOT NULL DEFAULT 8,
  caller_id               TEXT,
  start_date              DATE,
  end_date                DATE,
  -- Agent priority feature
  agent_priority_enabled  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by              UUID        REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_org    ON campaigns(org_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- ── SYSTEM CONFIG ─────────────────────────────────────────
-- Per-organisation singleton. Drives the backend-injector cadence and the
-- Time Guard that restricts schedule_windows to permitted hours.
CREATE TABLE IF NOT EXISTS system_config (
  org_id              UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  inject_poll_minutes INT         NOT NULL DEFAULT 5,
  last_injected_at    TIMESTAMPTZ,
  time_guard_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  time_guard_windows  JSONB       NOT NULL DEFAULT jsonb_build_object(
    '0', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '1', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '2', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '3', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '4', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '5', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '6', jsonb_build_object('start', '00:00', 'end', '23:00')
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_config_due
  ON system_config (last_injected_at NULLS FIRST);

-- ── CAMPAIGN JUNCTIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_contact_lists (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_list_id  UUID        NOT NULL REFERENCES contact_lists(id),
  priority         INT         NOT NULL DEFAULT 1,
  linked_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, contact_list_id)
);

CREATE TABLE IF NOT EXISTS campaign_schedule_templates (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  schedule_template_id UUID        NOT NULL REFERENCES schedule_templates(id),
  linked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, schedule_template_id)
);

CREATE TABLE IF NOT EXISTS campaign_holiday_calendars (
  campaign_id         UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  holiday_calendar_id UUID NOT NULL REFERENCES holiday_calendars(id),
  PRIMARY KEY (campaign_id, holiday_calendar_id)
);

CREATE TABLE IF NOT EXISTS campaign_dnc_groups (
  campaign_id   UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  dnc_group_id  UUID NOT NULL REFERENCES dnc_groups(id),
  linked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (campaign_id, dnc_group_id)
);

-- ── DISPOSITION GROUPS & CODES ────────────────────────────
-- A disposition_group is an admin-managed bucket of custom codes. The
-- seeded org-wide system codes live with disposition_group_id IS NULL
-- AND campaign_id IS NULL; custom codes carry a non-null group id.
CREATE TABLE IF NOT EXISTS disposition_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS disposition_codes (
  id                   UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID    NOT NULL REFERENCES organizations(id),
  campaign_id          UUID    REFERENCES campaigns(id), -- NULL = global
  disposition_group_id UUID    REFERENCES disposition_groups(id) ON DELETE CASCADE,
  code                 TEXT    NOT NULL,
  label                TEXT    NOT NULL,
  capability           TEXT    NOT NULL, -- CLOSED | NEXT_ATTEMPT | RESCHEDULE
  retry_delay_min      INT,
  notes_required       BOOLEAN NOT NULL DEFAULT FALSE,
  display_order        INT     NOT NULL DEFAULT 99,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disposition_codes_group
  ON disposition_codes(disposition_group_id)
  WHERE disposition_group_id IS NOT NULL;

-- ── CAMPAIGN JOBS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_jobs (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES campaigns(id),
  job_run_number      INT         NOT NULL DEFAULT 1,
  status              TEXT        NOT NULL DEFAULT 'active', -- preparing | active | completed | stopped
  start_time          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time            TIMESTAMPTZ,
  total_contacts      INT         NOT NULL DEFAULT 0,
  processed_contacts  INT         NOT NULL DEFAULT 0,
  excluded_contacts   INT         NOT NULL DEFAULT 0,
  prcnt_complete      FLOAT       NOT NULL DEFAULT 0.0,
  created_by          TEXT        NOT NULL DEFAULT 'system',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON campaign_jobs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status   ON campaign_jobs(status);

-- ── CAMPAIGN CONTACT STATUS (CCS) — THE QUEUE ─────────────
CREATE TABLE IF NOT EXISTS campaign_contact_status (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id          UUID        NOT NULL REFERENCES contacts(id),
  job_id              UUID        NOT NULL REFERENCES campaign_jobs(id),
  status              TEXT        NOT NULL DEFAULT 'queued',
  -- queued | with_agent | completed | exhausted | dnc
  -- System columns copied from contacts at registration
  priority            INT         NOT NULL DEFAULT 100,
  assigned_agent_id   UUID        REFERENCES users(id),
  -- Scheduling
  attempts_made       INT         NOT NULL DEFAULT 0,
  last_attempted_at   TIMESTAMPTZ,
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Lock (replaces next_attempt_queue table)
  locked_by_session   UUID,       -- FK to agent_sessions.id (soft ref)
  locked_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_id, job_id)
);

-- Partial index for fast fetch query — only unlocked queued rows
CREATE INDEX IF NOT EXISTS idx_ccs_fetch ON campaign_contact_status
  (job_id, priority ASC, next_attempt_at ASC)
  WHERE locked_by_session IS NULL AND status = 'queued';

CREATE INDEX IF NOT EXISTS idx_ccs_job_status ON campaign_contact_status(job_id, status);
CREATE INDEX IF NOT EXISTS idx_ccs_agent      ON campaign_contact_status(assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;

-- ── CONTACT STATUS HISTORY ────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_status_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID        NOT NULL REFERENCES contacts(id),
  job_id          UUID        NOT NULL REFERENCES campaign_jobs(id),
  from_status     TEXT,
  to_status       TEXT        NOT NULL,
  trigger_type    TEXT        NOT NULL DEFAULT 'system', -- system | disposition | agent | admin
  triggered_by    UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csh_contact ON contact_status_history(contact_id, job_id);

-- ── AGENT SESSIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            UUID        NOT NULL REFERENCES users(id),
  selected_job_ids    UUID[]      NOT NULL DEFAULT '{}',
  status              TEXT        NOT NULL DEFAULT 'offline',
  -- offline | available | with_agent
  current_contact_id  UUID        REFERENCES contacts(id),
  current_job_id      UUID        REFERENCES campaign_jobs(id),
  login_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logout_at           TIMESTAMPTZ,
  last_heartbeat_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_agent  ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON agent_sessions(status);

-- ── CONTACT INTERACTIONS ──────────────────────────────────
-- Merged contact_attempts + contact_assignments + call_dispositions
CREATE TABLE IF NOT EXISTS contact_interactions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id            UUID        NOT NULL REFERENCES contacts(id),
  job_id                UUID        NOT NULL REFERENCES campaign_jobs(id),
  agent_id              UUID        NOT NULL REFERENCES users(id),
  agent_session_id      UUID        REFERENCES agent_sessions(id), -- live link, cleared on close
  attempt_number        INT         NOT NULL DEFAULT 1,
  dial_mode             TEXT        NOT NULL DEFAULT 'auto', -- auto | manual
  -- ── Timeline (7 timestamps) ──────────────────────────────
  given_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- contact offered to agent
  auto_dial_fires_at    TIMESTAMPTZ,
  -- Single UPDATE on agent action:
  preview_action        TEXT        NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  rejected_at           TIMESTAMPTZ,
  rejection_reason      TEXT,       -- structured code: NOT_READY | NEED_BREAK | SKILL_MISMATCH | TECHNICAL_ISSUE | SUPERVISOR_HOLD
  accepted_at           TIMESTAMPTZ,
  dialed_at             TIMESTAMPTZ,
  answered_at           TIMESTAMPTZ,
  disconnected_at       TIMESTAMPTZ,
  wrapup_at             TIMESTAMPTZ,
  -- ── Durations (computed on wrapup) ───────────────────────
  preview_duration_sec  INT,
  talk_time_sec         INT,
  wrapup_duration_sec   INT,
  total_handling_sec    INT,
  -- ── Telephony ─────────────────────────────────────────────
  call_status           TEXT,       -- connected | no_answer | busy | voicemail | failed | agent_disconnected
  channel_type          TEXT        NOT NULL DEFAULT 'voice',
  telephony_call_sid    TEXT,
  recording_url         TEXT,
  -- ── Disposition (merged in) ───────────────────────────────
  disposition_code_id   UUID        REFERENCES disposition_codes(id),
  disposition_capability TEXT,      -- CLOSED | NEXT_ATTEMPT | RESCHEDULE (copied from code)
  reschedule_at         TIMESTAMPTZ,
  disposition_notes     TEXT,
  CONSTRAINT accept_reject_exclusive
    CHECK (accepted_at IS NULL OR rejected_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_interactions_contact ON contact_interactions(contact_id, job_id);
CREATE INDEX IF NOT EXISTS idx_interactions_agent   ON contact_interactions(agent_id);
CREATE INDEX IF NOT EXISTS idx_interactions_session ON contact_interactions(agent_session_id)
  WHERE agent_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interactions_dialed  ON contact_interactions(dialed_at)
  WHERE dialed_at IS NOT NULL;

-- ── SOURCE CONFIGS & MAPPERS ──────────────────────────────
CREATE TABLE IF NOT EXISTS contact_source_configs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id  UUID        NOT NULL REFERENCES contact_lists(id),
  name             TEXT        NOT NULL,
  source_type      TEXT        NOT NULL, -- S3 | FTP | SFTP
  source_path      TEXT        NOT NULL,
  credentials      JSONB       NOT NULL DEFAULT '{}', -- encrypted at app layer
  mapper_id        UUID,       -- FK added after mappers table
  schedule_cron    TEXT        NOT NULL,
  on_duplicate     TEXT        NOT NULL DEFAULT 'skip',
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_pulled_at   TIMESTAMPTZ,
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_field_mappers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID        NOT NULL REFERENCES organizations(id),
  contact_list_id  UUID        NOT NULL REFERENCES contact_lists(id),
  name             TEXT        NOT NULL,
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_field_mappings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  mapper_id        UUID        NOT NULL REFERENCES contact_field_mappers(id) ON DELETE CASCADE,
  source_column    TEXT        NOT NULL,
  target_field_key TEXT        NOT NULL,
  transform        TEXT        NOT NULL DEFAULT 'none',
  is_required      BOOLEAN     NOT NULL DEFAULT FALSE,
  default_value    TEXT,
  display_order    INT         NOT NULL DEFAULT 99
);

-- Add FK from source configs to mapper (after table exists)
ALTER TABLE contact_source_configs
  ADD CONSTRAINT fk_source_mapper
  FOREIGN KEY (mapper_id) REFERENCES contact_field_mappers(id);

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'organizations','users','contact_lists','contacts',
    'campaigns','campaign_contact_status','system_config'
  ]) LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl
    );
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
