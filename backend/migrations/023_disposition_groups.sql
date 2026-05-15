-- Disposition groups: an admin-managed bucket of custom disposition codes,
-- shown alongside the seeded org-wide "system" codes (those still have
-- disposition_group_id IS NULL AND campaign_id IS NULL).

CREATE TABLE IF NOT EXISTS disposition_groups (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id),
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE disposition_codes
  ADD COLUMN IF NOT EXISTS disposition_group_id UUID
    REFERENCES disposition_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_disposition_codes_group
  ON disposition_codes(disposition_group_id)
  WHERE disposition_group_id IS NOT NULL;
