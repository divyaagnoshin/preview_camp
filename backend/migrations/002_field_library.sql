-- ── ORG FIELD LIBRARY ─────────────────────────────────────
-- Per-org dictionary of columns available for CSV upload.
-- org_id NULL = global ("Allowed To All"), visible to every org but immutable.
CREATE TABLE IF NOT EXISTS org_field_library (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        REFERENCES organizations(id),       -- NULL = global
  name                TEXT        NOT NULL,                            -- "First Name"
  field_key           TEXT        NOT NULL,                            -- "first_name"
  field_type          TEXT        NOT NULL DEFAULT 'predefined',       -- predefined | custom
  data_type           TEXT        NOT NULL,                            -- STRING | LONG | INTEGER | PHONE | EMAIL | TIMESTAMP | BOOLEAN
  is_private          BOOLEAN     NOT NULL DEFAULT FALSE,
  is_read_only_agent  BOOLEAN     NOT NULL DEFAULT FALSE,
  is_masked_agent     BOOLEAN     NOT NULL DEFAULT FALSE,
  is_masked_reports   BOOLEAN     NOT NULL DEFAULT FALSE,
  display_order       INT         NOT NULL DEFAULT 99,
  created_by          UUID        REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique field_key within an org, and globally for org_id IS NULL rows
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_library_org_key
  ON org_field_library (org_id, field_key)
  WHERE org_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_field_library_global_key
  ON org_field_library (field_key)
  WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_field_library_org ON org_field_library(org_id);

-- Seed the predefined columns as global rows (org_id IS NULL → "Allowed To All").
-- ON CONFLICT skips re-inserts on subsequent migration runs.
INSERT INTO org_field_library
  (org_id, name, field_key, field_type, data_type,
   is_private, is_read_only_agent, is_masked_agent, is_masked_reports, display_order)
VALUES
  (NULL, 'System Contact ID',           'system_contact_id',           'predefined', 'LONG',      FALSE, TRUE,  FALSE, FALSE, 1),
  (NULL, 'ID',                          'id',                          'predefined', 'STRING',    FALSE, TRUE,  FALSE, FALSE, 2),
  (NULL, 'Title Predefined',            'title_predefined',            'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 3),
  (NULL, 'First Name',                  'first_name',                  'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 4),
  (NULL, 'Last Name',                   'last_name',                   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 5),
  (NULL, 'Address Line 1 Predefined',   'address_line_1_predefined',   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 6),
  (NULL, 'Address Line 2 Predefined',   'address_line_2_predefined',   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 7),
  (NULL, 'Address Line 3 Predefined',   'address_line_3_predefined',   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 8),
  (NULL, 'Address Line 4 Predefined',   'address_line_4_predefined',   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 9),
  (NULL, 'Address Line 5 Predefined',   'address_line_5_predefined',   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 10),
  (NULL, 'Phone 1',                     'phone_1',                     'predefined', 'PHONE',     FALSE, FALSE, FALSE, FALSE, 11),
  (NULL, 'Phone 1 Country Code',        'phone_1_country_code',        'predefined', 'INTEGER',   FALSE, FALSE, FALSE, FALSE, 12),
  (NULL, 'Time Zone',                   'time_zone',                   'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 13),
  (NULL, 'Phone 2',                     'phone_2',                     'predefined', 'PHONE',     FALSE, FALSE, FALSE, FALSE, 14),
  (NULL, 'Phone 2 Country Code',        'phone_2_country_code',        'predefined', 'INTEGER',   FALSE, FALSE, FALSE, FALSE, 15),
  (NULL, 'Phone 2 Time Zone',           'phone_2_time_zone',           'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 16),
  (NULL, 'E-Mail',                      'email',                       'predefined', 'EMAIL',     FALSE, FALSE, FALSE, FALSE, 17),
  (NULL, 'Language',                    'language',                    'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 18),
  (NULL, 'Last Attempt Time',           'last_attempt_time',           'predefined', 'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 19),
  (NULL, 'Last Successful Attempt Time','last_successful_attempt_time','predefined', 'TIMESTAMP', FALSE, FALSE, FALSE, FALSE, 20),
  (NULL, 'Last Completion Code',        'last_completion_code',        'predefined', 'STRING',    FALSE, FALSE, FALSE, FALSE, 21)
ON CONFLICT DO NOTHING;
