-- ── CONTACT LIST ATTRIBUTES ───────────────────────────────
-- Many-to-many between contact_lists and org_field_library.
-- Each row marks a library field as "attached" to a specific contact list,
-- meaning that field is part of the list's CSV template / accepted columns.
CREATE TABLE IF NOT EXISTS contact_list_attributes (
  contact_list_id   UUID        NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  field_library_id  UUID        NOT NULL REFERENCES org_field_library(id) ON DELETE CASCADE,
  display_order     INT         NOT NULL DEFAULT 99,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contact_list_id, field_library_id)
);

CREATE INDEX IF NOT EXISTS idx_cla_list  ON contact_list_attributes(contact_list_id);
CREATE INDEX IF NOT EXISTS idx_cla_field ON contact_list_attributes(field_library_id);
