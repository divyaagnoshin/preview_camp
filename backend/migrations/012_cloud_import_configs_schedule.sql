-- Adds optional cron-style scheduling to cloud_import_configs so a saved
-- connection can fire on its own (e.g. "every day at 09:00 UTC") instead of
-- only on a manual Run click. The scheduler service polls cloud_import_configs
-- where schedule_enabled = TRUE AND next_run_at <= NOW() and runs the import
-- against target_contact_list_id (set when the schedule is configured).
ALTER TABLE cloud_import_configs
  ADD COLUMN IF NOT EXISTS cron_expression       TEXT,
  ADD COLUMN IF NOT EXISTS timezone              TEXT       NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS schedule_enabled      BOOLEAN    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS target_contact_list_id UUID      REFERENCES contact_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status       TEXT,
  ADD COLUMN IF NOT EXISTS last_run_error        TEXT;

-- Index used by the scheduler tick to cheaply find due rows.
CREATE INDEX IF NOT EXISTS idx_cloud_import_configs_due
  ON cloud_import_configs (next_run_at)
  WHERE schedule_enabled = TRUE;
