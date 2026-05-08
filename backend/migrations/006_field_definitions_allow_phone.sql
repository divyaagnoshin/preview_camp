-- Allow `phone_number` to live in contact_list_field_definitions so it can
-- be surfaced in the unified attributes UI alongside library / custom fields.
-- The other reserved system columns (first_name, email, …) remain blocked
-- since they are not part of the user-managed attribute flow.
ALTER TABLE contact_list_field_definitions
  DROP CONSTRAINT IF EXISTS contact_list_field_definitions_field_key_check;

ALTER TABLE contact_list_field_definitions
  ADD CONSTRAINT contact_list_field_definitions_field_key_check
  CHECK (field_key NOT IN (
    'first_name','last_name','email',
    'timezone','assigned_agent_id','priority'
  ));
