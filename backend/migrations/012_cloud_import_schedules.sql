-- Add cron-style scheduling to cloud_import_configs. A scheduled config
-- runs unattended against the contact_list captured in
-- target_contact_list_id; the backend scheduler service polls for rows
-- where schedule_enabled=TRUE and next_run_at <= NOW() and triggers a
-- normal cloud-import run for each.
ALTER TABLE cloud_import_configs
  ADD COLUMN IF NOT EXISTS schedule_enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cron_expression        TEXT,
  ADD COLUMN IF NOT EXISTS timezone               TEXT        NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS target_contact_list_id UUID        REFERENCES contact_lists(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_status        TEXT,
  ADD COLUMN IF NOT EXISTS last_run_error         TEXT;

-- Picks up only the small set of rows the scheduler needs to consider on
-- each poll, instead of full-scanning the table.
CREATE INDEX IF NOT EXISTS idx_cloud_import_configs_due
  ON cloud_import_configs (next_run_at)
  WHERE schedule_enabled = TRUE;
