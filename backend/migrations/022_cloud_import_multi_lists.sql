-- Converts cloud_import_configs to support multiple contact lists.
-- We add an array column, migrate the single IDs over, and drop the old column.
ALTER TABLE cloud_import_configs
  ADD COLUMN IF NOT EXISTS contact_list_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'cloud_import_configs'
       AND column_name = 'contact_list_id'
  ) THEN
    -- Migrate existing data
    UPDATE cloud_import_configs
       SET contact_list_ids = ARRAY[contact_list_id]
     WHERE contact_list_id IS NOT NULL;
    
    -- Drop old column
    ALTER TABLE cloud_import_configs DROP COLUMN contact_list_id;
  END IF;
END $$;
