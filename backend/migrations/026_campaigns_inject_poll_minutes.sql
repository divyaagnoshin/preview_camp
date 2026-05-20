-- Infinite-campaign contact injector knobs.
--
-- NOTE — Superseded by migration 027, which moves these columns onto the
-- per-org `system_config` table. This file is preserved unchanged so that
-- environments that already ran it remain idempotent; the DROP COLUMN
-- statements in 027 are what ultimately retire the columns added here.
--
-- Background
-- ──────────
-- Infinite campaigns (schedule_type = 'infinite') keep running until an
-- admin stops them. New contacts can land in their backing contact_lists
-- at any time (manual upload, cloud import, agent-disposition DNC removal,
-- etc.) and need to be auto-registered into the campaign_contact_status
-- queue so agents see them on Workspace.
--
-- The new `backend-injector` service polls these columns:
--   * inject_poll_minutes — how often (per campaign) the injector should
--     scan for newly-eligible contacts. Lower = fresher queue, higher DB
--     load. Default 5 minutes matches our existing scheduler cadence.
--   * last_injected_at — claim marker. The injector advances this column
--     in the same UPDATE that wins the row, which serialises concurrent
--     ticks (two instances can't double-inject the same campaign).
--
-- Finite campaigns ignore both columns — the one-shot CCS registration on
-- POST /v1/campaigns/:id/run keeps owning that path.

ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS inject_poll_minutes INT         NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS last_injected_at    TIMESTAMPTZ;

-- Partial index speeds up the injector's top-level scan. Tiny table in
-- practice (campaigns are O(100s)) but the predicate keeps it tight.
CREATE INDEX IF NOT EXISTS idx_campaigns_infinite_due
  ON campaigns (last_injected_at NULLS FIRST)
  WHERE schedule_type = 'infinite' AND status = 'active';
