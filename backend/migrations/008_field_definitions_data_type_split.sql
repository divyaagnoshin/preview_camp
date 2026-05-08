-- Split contact_list_field_definitions.field_type into two columns:
--   • data_type  — input shape: text | number | date | boolean | url
--                  (renamed from the old field_type column)
--   • field_type — origin classification: predefined | custom
--
-- Existing rows preserve their old text/number/etc. value as data_type,
-- and default to 'predefined' for field_type. The sync logic in
-- syncFieldDefinitions then overwrites field_type per-row based on whether
-- the source is a library (predefined) or a list-scoped custom field (custom).

ALTER TABLE contact_list_field_definitions
  RENAME COLUMN field_type TO data_type;

ALTER TABLE contact_list_field_definitions
  ALTER COLUMN data_type SET DEFAULT 'text';

ALTER TABLE contact_list_field_definitions
  ADD COLUMN IF NOT EXISTS field_type TEXT NOT NULL DEFAULT 'predefined'
    CHECK (field_type IN ('predefined', 'custom'));
