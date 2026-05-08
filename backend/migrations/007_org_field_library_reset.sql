-- Reset the org_field_library to only the canonical system fields.
-- Removing org_field_library rows cascades into contact_list_attributes
-- (FK ON DELETE CASCADE in migration 004), so any prior selections are
-- cleared. contact_list_field_definitions rows are not touched here; they
-- get rebuilt the next time syncFieldDefinitions runs for a list.

DELETE FROM org_field_library;

INSERT INTO org_field_library
  (org_id, name, field_key, field_type, data_type,
   is_private, is_read_only_agent, is_masked_agent, is_masked_reports, display_order)
VALUES
  (NULL, 'Phone Number',           'phone_number',           'predefined', 'PHONE',  FALSE, FALSE, FALSE, FALSE, 1),
  (NULL, 'First Name',              'first_name',             'predefined', 'STRING', FALSE, FALSE, FALSE, FALSE, 2),
  (NULL, 'Last Name',               'last_name',              'predefined', 'STRING', FALSE, FALSE, FALSE, FALSE, 3),
  (NULL, 'Email',                   'email',                  'predefined', 'EMAIL',  FALSE, FALSE, FALSE, FALSE, 4),
  (NULL, 'Timezone',                'timezone',               'predefined', 'STRING', FALSE, FALSE, FALSE, FALSE, 5),
  (NULL, 'Alternate Phone Number',  'alternate_phone_number', 'predefined', 'PHONE',  FALSE, FALSE, FALSE, FALSE, 6);
