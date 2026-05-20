-- Per-organisation system configuration singleton.
--
-- Replaces the per-campaign `inject_poll_minutes` / `last_injected_at`
-- columns added in migration 026 with one shared row per organisation, and
-- introduces a Time Guard window that constrains the hours during which
-- schedule_windows may be created.
--
-- Layout
-- ──────
--   * inject_poll_minutes      — how often the backend-injector should scan
--                                all infinite campaigns belonging to the org.
--   * last_injected_at         — claim marker advanced by the injector tick.
--                                Serialises concurrent ticks across instances.
--   * time_guard_enabled       — global on/off for the schedule-window guard.
--   * time_guard_windows JSONB — { "<day_of_week 0..6>": { "start": "HH:MM",
--                                                          "end":   "HH:MM" } }.
--                                A day's *absence* from the object means
--                                schedule windows are not allowed on that day
--                                while the guard is on.
--
-- One row per org. The application layer upserts on demand; defaults below
-- mirror the historical campaign-level defaults so the injector keeps working
-- without any UI interaction post-migration.

CREATE TABLE IF NOT EXISTS system_config (
  org_id              UUID        PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  inject_poll_minutes INT         NOT NULL DEFAULT 5,
  last_injected_at    TIMESTAMPTZ,
  time_guard_enabled  BOOLEAN     NOT NULL DEFAULT TRUE,
  time_guard_windows  JSONB       NOT NULL DEFAULT jsonb_build_object(
    '0', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '1', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '2', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '3', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '4', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '5', jsonb_build_object('start', '00:00', 'end', '23:00'),
    '6', jsonb_build_object('start', '00:00', 'end', '23:00')
  ),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed one row per existing organisation, carrying forward the latest
-- per-campaign poll cadence + last_injected_at so the injector behaviour
-- stays continuous across the migration boundary.
INSERT INTO system_config (org_id, inject_poll_minutes, last_injected_at)
SELECT o.id,
       COALESCE(MIN(c.inject_poll_minutes) FILTER (WHERE c.schedule_type = 'infinite'), 5),
       MAX(c.last_injected_at) FILTER (WHERE c.schedule_type = 'infinite')
  FROM organizations o
  LEFT JOIN campaigns c ON c.org_id = o.id
 GROUP BY o.id
ON CONFLICT (org_id) DO NOTHING;

-- One-shot refresh for rows seeded with the previous Mon–Fri 09:00–21:00
-- default. Matches the old value exactly so any user customisation is
-- preserved untouched.
UPDATE system_config
   SET time_guard_windows = jsonb_build_object(
         '0', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '1', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '2', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '3', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '4', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '5', jsonb_build_object('start', '00:00', 'end', '23:00'),
         '6', jsonb_build_object('start', '00:00', 'end', '23:00')
       )
 WHERE time_guard_windows = jsonb_build_object(
         '1', jsonb_build_object('start', '09:00', 'end', '21:00'),
         '2', jsonb_build_object('start', '09:00', 'end', '21:00'),
         '3', jsonb_build_object('start', '09:00', 'end', '21:00'),
         '4', jsonb_build_object('start', '09:00', 'end', '21:00'),
         '5', jsonb_build_object('start', '09:00', 'end', '21:00')
       );

-- Replace the previous per-campaign due-index with one that scans the new
-- singleton. Tiny table (one row per org) so an index isn't strictly needed,
-- but keeping the partial predicate makes the intent explicit and matches
-- the scheduler's WHERE clause shape for future planner hints.
DROP INDEX IF EXISTS idx_campaigns_infinite_due;

CREATE INDEX IF NOT EXISTS idx_system_config_due
  ON system_config (last_injected_at NULLS FIRST);

-- Drop the migrated columns. Doing this last means a partial failure above
-- leaves the old columns intact for retry.
ALTER TABLE campaigns
  DROP COLUMN IF EXISTS inject_poll_minutes,
  DROP COLUMN IF EXISTS last_injected_at;

-- Keep updated_at in sync for system_config so the UI can render a "Last
-- updated" line cheaply if needed later.
DO $$
BEGIN
  CREATE TRIGGER trg_updated_at BEFORE UPDATE ON system_config
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
