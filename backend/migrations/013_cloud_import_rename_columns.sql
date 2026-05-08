-- Renames the schedule-related columns on cloud_import_configs to match the
-- product vocabulary used in the UI: a saved profile "refreshes" itself on a
-- schedule, and the contact list it imports into is just its
-- contact_list_id. Backend SELECT/UPDATE statements and the frontend
-- CloudImportConfig type are updated in lock-step with this migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cloud_import_configs'
       AND column_name = 'target_contact_list_id'
  ) THEN
    ALTER TABLE cloud_import_configs
      RENAME COLUMN target_contact_list_id TO contact_list_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cloud_import_configs'
       AND column_name = 'next_run_at'
  ) THEN
    ALTER TABLE cloud_import_configs
      RENAME COLUMN next_run_at TO next_refresh;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cloud_import_configs'
       AND column_name = 'last_run_at'
  ) THEN
    ALTER TABLE cloud_import_configs
      RENAME COLUMN last_run_at TO last_refresh;
  END IF;
END $$;

-- Re-create the partial index used by the scheduler poll on the new column
-- name. DROP first because column-rename leaves the old index referencing
-- the new column under the old index name, which is confusing in pg_indexes.
DROP INDEX IF EXISTS idx_cloud_import_configs_due;
CREATE INDEX IF NOT EXISTS idx_cloud_import_configs_due
  ON cloud_import_configs (next_refresh)
  WHERE schedule_enabled = TRUE;
