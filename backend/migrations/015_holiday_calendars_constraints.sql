-- Tightens holiday_dates so the UI can rely on simple data invariants:
--   * a calendar can't have two entries for the same date and block_start
--     (NULL block_start counted as equal so two full-day rows on the same
--     date also collide)
--   * a row is either a full-day block, or has a valid time range
--   * fast lookup by (calendar_id, year/date) for the year-filtered list
ALTER TABLE holiday_dates
  DROP CONSTRAINT IF EXISTS holiday_dates_block_check;
ALTER TABLE holiday_dates
  ADD CONSTRAINT holiday_dates_block_check
  CHECK (
    is_full_day_block
    OR (block_start IS NOT NULL AND block_end IS NOT NULL AND block_end > block_start)
  );

CREATE UNIQUE INDEX IF NOT EXISTS holiday_dates_calendar_date_block_uidx
  ON holiday_dates (calendar_id, holiday_date, COALESCE(block_start, '00:00'::time));

CREATE INDEX IF NOT EXISTS holiday_dates_calendar_date_idx
  ON holiday_dates (calendar_id, holiday_date);
