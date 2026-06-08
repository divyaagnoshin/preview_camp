ALTER TABLE contact_upload_batches ADD COLUMN IF NOT EXISTS updated_rows INTEGER DEFAULT 0;
ALTER TABLE cloud_import_run_history ADD COLUMN IF NOT EXISTS updated_rows INTEGER DEFAULT 0;
