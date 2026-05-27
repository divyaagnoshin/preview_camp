-- ── Migration 028: CCS cleanup — summary + archive ────────────────────────
--
-- Creates two tables:
--
-- 1. campaign_summary  — written BEFORE CCS rows are deleted so counts are
--    permanently preserved for reporting. One row per cleanup event.
--
-- 2. ccs_archive — stores only NON-COMPLETED contacts removed from live CCS
--    (exhausted, dnc for periodic infinite cleanup;
--     queued, exhausted, dnc for finite stop/complete).
--    Completed rows are discarded — contact_status_history has their trail.
--
-- NO columns added to system_config.
-- Cleanup timing for infinite campaigns is managed entirely inside
-- backend-injector process memory via CLEANUP_INTERVAL_HOURS env var.

-- ── 1. campaign_summary ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_summary (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  job_id              UUID        NOT NULL REFERENCES campaign_jobs(id) ON DELETE CASCADE,
  org_id              UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Counts snapshotted just before CCS rows are deleted
  total_in_ccs        INT         NOT NULL DEFAULT 0,
  completed_count     INT         NOT NULL DEFAULT 0,
  exhausted_count     INT         NOT NULL DEFAULT 0,
  dnc_count           INT         NOT NULL DEFAULT 0,
  queued_count        INT         NOT NULL DEFAULT 0,

  -- How cleanup was triggered
  trigger             TEXT        NOT NULL DEFAULT 'stop',
  -- stop | auto_complete | periodic_cleanup

  snapshot_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_summary_campaign
  ON campaign_summary(campaign_id, snapshot_at DESC);



-- ── 2. ccs_archive ───────────────────────────────────────────────────────────
-- Stores non-completed CCS rows evicted from the live table.
-- Only statuses: queued | exhausted | dnc  (never 'completed' or 'with_agent').
CREATE TABLE IF NOT EXISTS ccs_archive (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_ccs_id     UUID        NOT NULL,
  contact_id          UUID        NOT NULL REFERENCES contacts(id)       ON DELETE CASCADE,
  job_id              UUID        NOT NULL REFERENCES campaign_jobs(id)  ON DELETE CASCADE,
  campaign_id         UUID        NOT NULL REFERENCES campaigns(id)      ON DELETE CASCADE,
  org_id              UUID        NOT NULL REFERENCES organizations(id)  ON DELETE CASCADE,

  status              TEXT        NOT NULL,
  -- queued | exhausted | dnc

  priority            INT         NOT NULL DEFAULT 100,
  assigned_agent_id   UUID        REFERENCES users(id) ON DELETE SET NULL,
  attempts_made       INT         NOT NULL DEFAULT 0,
  last_attempted_at   TIMESTAMPTZ,
  next_attempt_at     TIMESTAMPTZ,

  archive_trigger     TEXT        NOT NULL DEFAULT 'stop',
  archived_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  original_created_at TIMESTAMPTZ,
  original_updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_ccs_archive_job
  ON ccs_archive(job_id);

CREATE INDEX IF NOT EXISTS idx_ccs_archive_campaign
  ON ccs_archive(campaign_id, archived_at DESC);

  ALTER TABLE system_config
  ADD COLUMN IF NOT EXISTS recheck_interval INTEGER NOT NULL DEFAULT 60
  
  #delete the dnc list source column

  ALTER TABLE dnc_lists DROP COLUMN IF EXISTS source;

