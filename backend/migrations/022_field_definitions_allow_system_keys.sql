-- Allow system-column field_keys (first_name, last_name, email, timezone,
-- assigned_agent_id, priority) to live in contact_list_field_definitions so
-- that selecting them in the unified "Manage Attributes" flow persists them
-- here alongside library and custom fields. Downstream consumers
-- (validateContact, validateCsvHeader, importCsvStream, the frontend list
-- view) already special-case these keys — they read from real `contacts`
-- columns instead of custom_fields JSONB.
ALTER TABLE contact_list_field_definitions
  DROP CONSTRAINT IF EXISTS contact_list_field_definitions_field_key_check;
