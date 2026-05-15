-- Backfill: attach every existing system code to every existing disposition
-- group via the junction.
--
-- Background
-- ──────────
-- Migration 024 introduced disposition_group_codes but kept system codes
-- implicit (they were auto-returned for every group by the GET handler).
-- The UI now treats the junction as the sole source of truth so users can
-- add or remove any disposition — including system ones — from a group.
--
-- Without this backfill, every group created before this change would
-- suddenly appear empty in the new Manage Dispositions screen, and any
-- campaign relying on a pre-existing group would lose its default codes.
--
-- The INSERT is idempotent (ON CONFLICT DO NOTHING) so re-running the
-- migration is a no-op.

INSERT INTO disposition_group_codes (disposition_group_id, disposition_code_id)
SELECT dg.id, dc.id
  FROM disposition_groups dg
  JOIN disposition_codes dc
    ON dc.org_id = dg.org_id
   AND dc.type = 'system'
   AND dc.campaign_id IS NULL
ON CONFLICT DO NOTHING;
