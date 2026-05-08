-- ── CONTACT LIST CUSTOM FIELDS ────────────────────────────
-- List-scoped custom field definitions. These do NOT live in org_field_library;
-- they exist only for the contact_list they were created on. Removing the list
-- (or removing the row) removes the definition. Values for these fields are
-- stored in contacts.custom_fields (JSONB) keyed by field_key, same as before.
CREATE TABLE IF NOT EXISTS contact_list_custom_fields (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id     UUID        NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  field_key           TEXT        NOT NULL,
  data_type           TEXT        NOT NULL,
  is_private          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_read_only_agent  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_masked_agent     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_masked_reports   BOOLEAN     NOT NULL DEFAULT FALSE,
  display_order       INT         NOT NULL DEFAULT 99,
  created_by          UUID        REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contact_list_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_clcf_list ON contact_list_custom_fields(contact_list_id);
