import pool from '../db/pool';

const STALE_SECONDS = parseInt(process.env.HEARTBEAT_STALE_SECONDS || '60');
const CHECK_INTERVAL =
  parseInt(process.env.HEARTBEAT_CHECK_INTERVAL_SECONDS || '30') * 1000;

export function startRecoveryLoop() {
  console.log(
    `Recovery loop started — heartbeat check every ${CHECK_INTERVAL / 1000}s ` +
      `(stale threshold ${STALE_SECONDS}s)`,
  );
  setInterval(() => {
    recoverStaleSessions().catch((err) =>
      console.error('Recovery loop error:', err),
    );
  }, CHECK_INTERVAL);
}

// Marks sessions whose heartbeat is older than STALE_SECONDS as offline,
// releases CCS locks they were holding (re-queued with a 5-minute cooldown
// so the next agent doesn't immediately re-grab a half-handled contact),
// and closes any orphaned open contact_interactions rows.
async function recoverStaleSessions() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: dead } = await client.query(
      `UPDATE agent_sessions SET status='offline', logout_at=NOW()
       WHERE last_heartbeat_at < NOW() - INTERVAL '${STALE_SECONDS} seconds'
         AND status != 'offline'
       RETURNING id, agent_id`,
    );

    if (!dead.length) {
      await client.query('COMMIT');
      return;
    }

    const deadIds = dead.map((d) => d.id);
    console.log(`Recovery: marking ${dead.length} stale session(s) offline`);

    await client.query(
      `UPDATE campaign_contact_status
       SET locked_by_session = NULL,
           locked_at = NULL,
           status = 'queued',
           next_attempt_at = NOW() + INTERVAL '5 minutes',
           updated_at = NOW()
       WHERE locked_by_session = ANY($1)`,
      [deadIds],
    );

    await client.query(
      `UPDATE contact_interactions
       SET call_status = 'agent_disconnected',
           wrapup_at = NOW(),
           agent_session_id = NULL
       WHERE agent_session_id = ANY($1)
         AND wrapup_at IS NULL`,
      [deadIds],
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
