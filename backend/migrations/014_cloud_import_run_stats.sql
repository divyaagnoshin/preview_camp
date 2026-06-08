-- Adds statistics columns to cloud_import_configs to track the number of
-- successfully uploaded and failed contacts on the last run.
ALTER TABLE cloud_import_configs
  ADD COLUMN IF NOT EXISTS last_run_imported_rows INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_run_failed_rows INTEGER DEFAULT 0;
