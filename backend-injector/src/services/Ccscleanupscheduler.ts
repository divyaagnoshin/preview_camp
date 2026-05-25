// backend-injector/src/services/ccsCleanupScheduler.ts
//
// Periodic CCS cleanup for infinite campaigns.
// Runs on its own interval — completely separate from the contact injector.
//
// What it does on each tick
// ──────────────────────────
// For every active infinite campaign job across all orgs:
//   1. Snapshot counts into campaign_summary (before any deletion).
//   2. Copy exhausted + dnc rows into ccs_archive.
//   3. Delete completed + exhausted + dnc rows from campaign_contact_status.
//
// queued rows are LEFT ALONE — the campaign is still running and agents
// need them. Only dead-end statuses (completed / exhausted / dnc) are removed.
//
// Why here and not in the main backend?
// ──────────────────────────────────────
// The main backend is already under load from contact uploads and call
// handling. This process (backend-injector) is a low-traffic singleton
// worker — the right home for background DB maintenance work.
//
// No system_config columns needed.
// Timing is controlled purely by CLEANUP_INTERVAL_HOURS env var.
// No DB-level claim/lock — this is a singleton process so setInterval
// is sufficient coordination.

import pool, { withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

const CLEANUP_INTERVAL_HOURS = parseFloat(
  process.env.CLEANUP_INTERVAL_HOURS || '24',
);

interface CleanupTarget {
  campaign_id: string;
  job_id: string;
  org_id: string;
}

// ── Entry point — called once from index.ts ───────────────────────────────────
export function startCleanupScheduler() {
  const intervalMs = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;
  console.log(
    `[ccs-cleanup] scheduler started — runs every ${CLEANUP_INTERVAL_HOURS}h` +
    ` (first run in ${CLEANUP_INTERVAL_HOURS}h)`,
  );
  // Delay first run by one full interval so it does not fire on boot
  // while the injector is doing its initial pass.
  setTimeout(() => {
    void cleanupTick();
    setInterval(() => void cleanupTick(), intervalMs);
  }, intervalMs);
}

// ── Tick ─────────────────────────────────────────────────────────────────────
async function cleanupTick() {
  console.log('[ccs-cleanup] tick started');

  let targets: CleanupTarget[] = [];
  try {
    targets = await findAllInfiniteActiveJobs();
  } catch (err) {
    console.error('[ccs-cleanup] findAllInfiniteActiveJobs failed:', err);
    return;
  }

  if (!targets.length) {
    console.log('[ccs-cleanup] no active infinite jobs — nothing to do');
    return;
  }

  let success = 0;
  let failed  = 0;
  for (const t of targets) {
    try {
      await cleanupJob(t);
      success++;
    } catch (err) {
      failed++;
      console.error(
        `[ccs-cleanup] campaign ${t.campaign_id} job ${t.job_id} failed:`,
        err,
      );
    }
  }

  console.log(
    `[ccs-cleanup] tick done — success=${success} failed=${failed}`,
  );
}

// ── Query: all active infinite jobs across all orgs ──────────────────────────
async function findAllInfiniteActiveJobs(): Promise<CleanupTarget[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (c.id)
            c.id     AS campaign_id,
            j.id     AS job_id,
            c.org_id
       FROM campaigns c
       JOIN campaign_jobs j
         ON j.campaign_id = c.id
        AND j.status = 'active'
      WHERE c.schedule_type = 'infinite'
        AND c.status = 'active'
      ORDER BY c.id, j.start_time DESC`,
  );
  return rows;
}

// ── Core cleanup for one job (single transaction) ────────────────────────────
async function cleanupJob(t: CleanupTarget): Promise<void> {
  await withTransaction(async (client: PoolClient) => {

    // Step 1: snapshot counts — written before any deletion
    const { rows: countRows } = await client.query(
      `SELECT
         COUNT(*)                                          ::int AS total_in_ccs,
         COUNT(*) FILTER (WHERE status = 'completed')     ::int AS completed_count,
         COUNT(*) FILTER (WHERE status = 'exhausted')     ::int AS exhausted_count,
         COUNT(*) FILTER (WHERE status = 'dnc')           ::int AS dnc_count,
         COUNT(*) FILTER (WHERE status = 'queued')        ::int AS queued_count
       FROM campaign_contact_status
       WHERE job_id = $1`,
      [t.job_id],
    );
    const counts = countRows[0];

    // Nothing removable — skip entirely, no summary row written
    const removable =
      counts.completed_count + counts.exhausted_count + counts.dnc_count;
    if (removable === 0) {
      console.log(
        `[ccs-cleanup] job ${t.job_id} — nothing to remove, skipping`,
      );
      return;
    }

    await client.query(
      `INSERT INTO campaign_summary
         (campaign_id, job_id, org_id,
          total_in_ccs, completed_count, exhausted_count,
          dnc_count, queued_count, trigger)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'periodic_cleanup')`,
      [
        t.campaign_id, t.job_id, t.org_id,
        counts.total_in_ccs,
        counts.completed_count,
        counts.exhausted_count,
        counts.dnc_count,
        counts.queued_count,
      ],
    );

    // Step 2: archive exhausted + dnc rows (not completed — history has them)
    const { rowCount: archivedCount } = await client.query(
      `INSERT INTO ccs_archive
         (original_ccs_id, contact_id, job_id, campaign_id, org_id,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          archive_trigger, original_created_at, original_updated_at)
       SELECT
          id, contact_id, $1, $2, $3,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          'periodic_cleanup', created_at, updated_at
       FROM campaign_contact_status
       WHERE job_id = $4
         AND status IN ('exhausted', 'dnc')`,
      [t.campaign_id, t.campaign_id, t.org_id, t.job_id],
    );

    // Step 3: delete completed + exhausted + dnc from live CCS
    // queued rows are intentionally NOT deleted — campaign is still active
    const { rowCount: deletedCount } = await client.query(
      `DELETE FROM campaign_contact_status
       WHERE job_id = $1
         AND status IN ('completed', 'exhausted', 'dnc')`,
      [t.job_id],
    );

    console.log(
      `[ccs-cleanup] job ${t.job_id}` +
      ` archived=${archivedCount ?? 0}` +
      ` deleted=${deletedCount ?? 0}` +
      ` (completed=${counts.completed_count}` +
      ` exhausted=${counts.exhausted_count}` +
      ` dnc=${counts.dnc_count})`,
    );
  });
}