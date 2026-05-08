-- The /sessions/ready upsert uses ON CONFLICT (agent_id) DO UPDATE so each
-- agent has exactly one session row that is mutated as they go ready /
-- offline / pick up contacts. Without a unique constraint on agent_id the
-- upsert errors with "no unique or exclusion constraint matching the
-- ON CONFLICT specification" and the Go Ready button silently fails.
ALTER TABLE agent_sessions
  ADD CONSTRAINT agent_sessions_agent_id_unique UNIQUE (agent_id);
