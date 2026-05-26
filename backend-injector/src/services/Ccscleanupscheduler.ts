// backend-injector/src/services/ccsCleanupScheduler.ts
//
// Daily CCS cleanup — fires at 02:00 server-local time every day.
//
// What it does on each tick
// ──────────────────────────
// For INFINITE campaigns (active jobs):
//   1. Snapshot counts into campaign_summary (before any deletion).
//   2. Copy exhausted + dnc rows into ccs_archive.
//   3. Delete completed + exhausted + dnc rows from campaign_contact_status.
//   queued rows are LEFT ALONE — the campaign is still running.
//
// For FINITE campaigns (any job, any status):
//   1. Snapshot counts into campaign_summary.
//   2. Copy exhausted + dnc rows into ccs_archive.
//   3. Delete completed + exhausted + dnc rows from campaign_contact_status.
//   Same logic — just no schedule_type filter applied.
//
// Daily aggregation (both types):
//   At exactly 02:00, per job_id, all removable-status rows are aggregated
//   into campaign_summary with trigger = 'daily_aggregation' before cleanup.
//
// Timing
// ──────
// Controlled by CLEANUP_HOUR env var (default: 2 → 02:00 local time).
// Uses a ms-precise setTimeout chain to land exactly on the clock hour.
// No DB-level lock needed — this is a singleton process.

import pool, { withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

// Hour of day (0-23) at which cleanup runs. Default: 2 (02:00).
const CLEANUP_HOUR = parseInt(process.env.CLEANUP_HOUR || '2', 10);

interface CleanupTarget {
  campaign_id: string;
  job_id: string;
  org_id: string;
  schedule_type: 'infinite' | 'finite' | string;
}

// ── Entry point — called once from index.ts ───────────────────────────────────
export function startCleanupScheduler() {
  console.log(
    `[ccs-cleanup] scheduler started — will run daily at ${String(CLEANUP_HOUR).padStart(2, '0')}:00`,
  );
  scheduleNextRun();
}

// ── Schedule the next 02:00 tick using an exact ms offset ────────────────────
function scheduleNextRun() {
  const now  = new Date();
  const next = new Date(now);

  next.setHours(CLEANUP_HOUR, 0, 0, 0);

  // If 02:00 already passed today, aim for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  const msUntilNext = next.getTime() - now.getTime();
  const hh = String(next.getHours()).padStart(2, '0');
  const mm = String(next.getMinutes()).padStart(2, '0');
  console.log(
    `[ccs-cleanup] next run scheduled at ${next.toDateString()} ${hh}:${mm}` +
    ` (in ${Math.round(msUntilNext / 60000)} min)`,
  );

  setTimeout(() => {
    void cleanupTick().finally(() => scheduleNextRun());
  }, msUntilNext);
}

// ── Tick ─────────────────────────────────────────────────────────────────────
async function cleanupTick() {
  const startedAt = new Date();
  console.log(`[ccs-cleanup] tick started at ${startedAt.toISOString()}`);

  let targets: CleanupTarget[] = [];
  try {
    targets = await findAllEligibleJobs();
  } catch (err) {
    console.error('[ccs-cleanup] findAllEligibleJobs failed:', err);
    return;
  }

  if (!targets.length) {
    console.log('[ccs-cleanup] no eligible jobs — nothing to do');
    return;
  }

  const infinite = targets.filter(t => t.schedule_type === 'infinite');
  const finite   = targets.filter(t => t.schedule_type !== 'infinite');
  console.log(
    `[ccs-cleanup] targets — infinite=${infinite.length} finite=${finite.length}`,
  );

  let success = 0;
  let failed  = 0;

  for (const t of targets) {
    try {
      await cleanupJob(t);
      success++;
    } catch (err) {
      failed++;
      console.error(
        `[ccs-cleanup] campaign ${t.campaign_id} job ${t.job_id}` +
        ` (${t.schedule_type}) failed:`,
        err,
      );
    }
  }

  console.log(
    `[ccs-cleanup] tick done — success=${success} failed=${failed}`,
  );
}

// ── Query: all eligible jobs ─────────────────────────────────────────────────
//
// INFINITE  → campaign active + job active   (running campaigns, queued rows
//             must survive, only dead-end statuses removed)
//
// FINITE    → any campaign/job status        (campaign may already be finished;
//             we still clean up leftover completed/exhausted/dnc rows)
//
async function findAllEligibleJobs(): Promise<CleanupTarget[]> {
  const { rows } = await pool.query(
    `-- Infinite: latest active job per active campaign
     SELECT DISTINCT ON (c.id)
            c.id             AS campaign_id,
            j.id             AS job_id,
            c.org_id,
            c.schedule_type
       FROM campaigns c
       JOIN campaign_jobs j
         ON j.campaign_id = c.id
        AND j.status = 'active'
      WHERE c.schedule_type = 'infinite'
        AND c.status = 'active'

     UNION ALL

     -- Finite: latest job per campaign (any status), only if removable rows exist
     SELECT DISTINCT ON (c.id)
            c.id             AS campaign_id,
            j.id             AS job_id,
            c.org_id,
            c.schedule_type
       FROM campaigns c
       JOIN campaign_jobs j ON j.campaign_id = c.id
      WHERE c.schedule_type != 'infinite'
        AND EXISTS (
          SELECT 1 FROM campaign_contact_status ccs
           WHERE ccs.job_id = j.id
             AND ccs.status IN ('completed', 'exhausted', 'dnc')
        )
      ORDER BY c.id, j.start_time DESC`,
  );
  return rows;
}

// ── Core cleanup for one job (single transaction) ────────────────────────────
async function cleanupJob(t: CleanupTarget): Promise<void> {
  await withTransaction(async (client: PoolClient) => {

    // ── Step 1: Snapshot counts per job_id (daily aggregation) ───────────────
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

    const removable =
      counts.completed_count + counts.exhausted_count + counts.dnc_count;

    // Nothing removable — still write a daily aggregation row so we have a
    // full-picture record for this job even on quiet days.
    if (removable === 0) {
      console.log(
        `[ccs-cleanup] job ${t.job_id} (${t.schedule_type})` +
        ` — nothing to remove; writing aggregation row only`,
      );
      await writeSummary(client, t, counts, 'daily_aggregation');
      return;
    }

    // Write aggregation snapshot BEFORE deletion so counts are accurate
    await writeSummary(client, t, counts, 'daily_aggregation');

    // ── Step 2: Archive exhausted + dnc rows ──────────────────────────────────
    // completed rows are already tracked in call history — skip archiving them
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
          'daily_cleanup', created_at, updated_at
       FROM campaign_contact_status
       WHERE job_id = $4
         AND status IN ('exhausted', 'dnc')`,
      [t.job_id, t.campaign_id, t.org_id, t.job_id],
    );

    // ── Step 3: Delete completed + exhausted + dnc ────────────────────────────
    // For INFINITE campaigns: queued rows are intentionally kept — agents need them.
    // For FINITE campaigns:   same rule — queued rows still in-flight are kept.
    const { rowCount: deletedCount } = await client.query(
      `DELETE FROM campaign_contact_status
       WHERE job_id = $1
         AND status IN ('completed', 'exhausted', 'dnc')`,
      [t.job_id],
    );

    console.log(
      `[ccs-cleanup] job ${t.job_id} (${t.schedule_type})` +
      ` archived=${archivedCount ?? 0}` +
      ` deleted=${deletedCount ?? 0}` +
      ` (completed=${counts.completed_count}` +
      ` exhausted=${counts.exhausted_count}` +
      ` dnc=${counts.dnc_count})`,
    );
  });
}

// ── Helper: insert one campaign_summary row ───────────────────────────────────
async function writeSummary(
  client: PoolClient,
  t: CleanupTarget,
  counts: {
    total_in_ccs: number;
    completed_count: number;
    exhausted_count: number;
    dnc_count: number;
    queued_count: number;
  },
  trigger: string,
) {
  await client.query(
    `INSERT INTO campaign_summary
       (campaign_id, job_id, org_id,
        total_in_ccs, completed_count, exhausted_count,
        dnc_count, queued_count, trigger)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      t.campaign_id, t.job_id, t.org_id,
      counts.total_in_ccs,
      counts.completed_count,
      counts.exhausted_count,
      counts.dnc_count,
      counts.queued_count,
      trigger,
    ],
  );
}