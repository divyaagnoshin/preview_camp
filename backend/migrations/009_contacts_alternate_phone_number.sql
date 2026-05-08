-- Promote alternate_phone_number from contacts.custom_fields JSONB to a real
-- column. The library entry stays — selecting it on a list still drives the
-- CSV header / UI column / modal input — but storage moves to a real column
-- so it's visible in plain `SELECT * FROM contacts` queries.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS alternate_phone_number TEXT;

-- Backfill from existing JSONB values, then strip the key so it has a single
-- source of truth going forward.
UPDATE contacts
   SET alternate_phone_number = custom_fields->>'alternate_phone_number'
 WHERE alternate_phone_number IS NULL
   AND custom_fields ? 'alternate_phone_number';

UPDATE contacts
   SET custom_fields = custom_fields - 'alternate_phone_number'
 WHERE custom_fields ? 'alternate_phone_number';
