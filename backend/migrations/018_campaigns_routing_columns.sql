-- Direct routing columns on campaigns. Previously these relationships lived
-- only in the junction tables (campaign_schedule_templates,
-- campaign_holiday_calendars, campaign_dnc_groups). The UI now binds a
-- single template / calendar / DNC group per campaign, so we keep one FK
-- column on campaigns for fast reads and simpler edit forms while leaving
-- the junction tables in place for existing readers.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS schedule_template_id UUID REFERENCES schedule_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS holiday_calendar_id  UUID REFERENCES holiday_calendars(id)  ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dnc_group_id         UUID REFERENCES dnc_groups(id)         ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_schedule_template ON campaigns(schedule_template_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_holiday_calendar  ON campaigns(holiday_calendar_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_dnc_group         ON campaigns(dnc_group_id);

-- Backfill the new columns from existing junction rows; pick the earliest
-- linked entry so the result is deterministic. NULL stays NULL when no
-- junction row exists.
UPDATE campaigns c
SET schedule_template_id = sub.schedule_template_id
FROM (
  SELECT DISTINCT ON (campaign_id) campaign_id, schedule_template_id
  FROM campaign_schedule_templates
  ORDER BY campaign_id, linked_at ASC
) sub
WHERE sub.campaign_id = c.id AND c.schedule_template_id IS NULL;

UPDATE campaigns c
SET holiday_calendar_id = sub.holiday_calendar_id
FROM (
  SELECT DISTINCT ON (campaign_id) campaign_id, holiday_calendar_id
  FROM campaign_holiday_calendars
  ORDER BY campaign_id, holiday_calendar_id ASC
) sub
WHERE sub.campaign_id = c.id AND c.holiday_calendar_id IS NULL;

UPDATE campaigns c
SET dnc_group_id = sub.dnc_group_id
FROM (
  SELECT DISTINCT ON (campaign_id) campaign_id, dnc_group_id
  FROM campaign_dnc_groups
  ORDER BY campaign_id, dnc_group_id ASC
) sub
WHERE sub.campaign_id = c.id AND c.dnc_group_id IS NULL;
