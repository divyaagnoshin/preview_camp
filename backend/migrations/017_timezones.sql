-- Catalog of IANA timezone identifiers used by the schedule-template editor's
-- searchable dropdown. The table is intentionally minimal — the canonical list
-- is sourced at runtime from Intl.supportedValuesOf('timeZone') and seeded
-- on backend startup if this table is empty.
CREATE TABLE IF NOT EXISTS timezones (
  name TEXT PRIMARY KEY
);
