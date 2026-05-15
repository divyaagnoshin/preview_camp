-- Disposition codes: type column + many-to-many membership with disposition groups.
--
-- Background
-- ──────────
-- Until now `disposition_codes.disposition_group_id` carried two pieces of
-- information at once:
--   * NULL + campaign_id NULL  → org-wide "system" code, visible everywhere
--   * non-NULL                  → custom code, visible only inside one group
-- That meant a custom code created in Group A could not be reused by Group B.
--
-- New shape
-- ─────────
-- 1) A `type` column makes the system/custom distinction explicit so it no
--    longer has to be inferred from `disposition_group_id IS NULL`.
-- 2) A `disposition_group_codes` junction table tracks which codes are
--    attached to which groups, so a custom code can be selected into many
--    groups at once.
-- 3) New code paths INSERT custom codes with `disposition_group_id = NULL`
--    and add a junction row. The legacy column is left in place so any
--    existing reader keeps working; the data is backfilled below.

ALTER TABLE disposition_codes
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'custom';

-- Backfill: rows with no group and no campaign are the seeded system codes.
UPDATE disposition_codes
   SET type = 'system'
 WHERE disposition_group_id IS NULL
   AND campaign_id IS NULL
   AND type <> 'system';

UPDATE disposition_codes
   SET type = 'custom'
 WHERE (disposition_group_id IS NOT NULL OR campaign_id IS NOT NULL)
   AND type <> 'custom';

-- Enforce the two allowed values without breaking older rows during rollout.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'disposition_codes_type_check'
  ) THEN
    ALTER TABLE disposition_codes
      ADD CONSTRAINT disposition_codes_type_check
      CHECK (type IN ('system', 'custom'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS disposition_codes_type_idx
  ON disposition_codes (type);

-- ── disposition_group_codes ──────────────────────────────────────────────
-- Membership junction: a code can be attached to many groups.
-- System codes are NOT stored here — they are implicitly available to every
-- group via a `type = 'system'` lookup. Only custom codes appear here.
CREATE TABLE IF NOT EXISTS disposition_group_codes (
  disposition_group_id UUID NOT NULL REFERENCES disposition_groups(id) ON DELETE CASCADE,
  disposition_code_id  UUID NOT NULL REFERENCES disposition_codes(id)  ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (disposition_group_id, disposition_code_id)
);

CREATE INDEX IF NOT EXISTS disposition_group_codes_code_idx
  ON disposition_group_codes (disposition_code_id);

-- Backfill the junction from existing custom codes that already carry a
-- group id. After this, the legacy column is no longer the source of truth
-- for membership but stays in place so older read paths don't break.
INSERT INTO disposition_group_codes (disposition_group_id, disposition_code_id)
SELECT dc.disposition_group_id, dc.id
  FROM disposition_codes dc
 WHERE dc.disposition_group_id IS NOT NULL
   AND dc.type = 'custom'
ON CONFLICT DO NOTHING;

-- ── campaigns.disposition_group_id ──────────────────────────────────────
-- A campaign picks exactly one disposition group; its agents see the system
-- codes plus the codes attached to that group via the junction above.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS disposition_group_id UUID
    REFERENCES disposition_groups(id) ON DELETE SET NULL;
