// backend-injector/src/services/ccsCleanupScheduler.ts
//
// Daily CCS cleanup — fires at 02:00 server-local time every day.
//
// Changes vs previous version
// ────────────────────────────
// • Both tables now receive a `date` column (CURRENT_DATE at run time).
// • campaign_summary uses an UPSERT on (job_id, date) — re-running the
//   scheduler on the same calendar day overwrites the row instead of
//   appending a duplicate.  Requires the unique index:
//     CREATE UNIQUE INDEX uq_campaign_summary_job_date
//       ON campaign_summary (job_id, date);
// • ccs_archive.date is set from archived_at::date (the same calendar day
//   the archive row is written).
// • `runNow()` is exported so you can trigger a manual test run without
//   waiting for 02:00.
//
// Condition for archiving from campaign_contact_status → ccs_archive
// ──────────────────────────────────────────────────────────────────
// Only rows with status IN ('exhausted', 'dnc') are archived.
// Rationale:
//   • 'completed' rows are already captured in call history — no need to
//     archive them; they are simply deleted.
//   • 'queued' rows are LEFT ALONE entirely — the campaign is still running
//     and agents need those rows.
//   • 'exhausted' and 'dnc' are dead-end states that need a long-term audit
//     trail but should be removed from the hot CCS table.

import pool, { withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

const CLEANUP_HOUR = parseInt(process.env.CLEANUP_HOUR || '2', 10);

interface CleanupTarget {
  campaign_id: string;
  job_id: string;
  org_id: string;
  schedule_type: 'infinite' | 'finite' | string;
}

// ── Entry point ───────────────────────────────────────────────────────────────
export function startCleanupScheduler() {
  console.log(
    `[ccs-cleanup] scheduler started — will run daily at ${String(CLEANUP_HOUR).padStart(2, '0')}:00`,
  );
  scheduleNextRun();
}

// ── Manual test trigger — call this from a dev route or script ────────────────
export async function runNow(): Promise<void> {
  console.log('[ccs-cleanup] manual run triggered');
  await cleanupTick();
  console.log('[ccs-cleanup] manual run complete');
}

// ── Schedule the next CLEANUP_HOUR tick ──────────────────────────────────────
function scheduleNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(CLEANUP_HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);

  const msUntilNext = next.getTime() - now.getTime();
  console.log(
    `[ccs-cleanup] next run at ${next.toDateString()} ` +
    `${String(next.getHours()).padStart(2, '0')}:00 ` +
    `(in ${Math.round(msUntilNext / 60000)} min)`,
  );

  setTimeout(() => {
    void cleanupTick().finally(() => scheduleNextRun());
  }, msUntilNext);
}

// ── Tick ──────────────────────────────────────────────────────────────────────
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
  const finite = targets.filter(t => t.schedule_type !== 'infinite');
  console.log(`[ccs-cleanup] targets — infinite=${infinite.length} finite=${finite.length}`);

  let success = 0, failed = 0;
  for (const t of targets) {
    try {
      await cleanupJob(t);
      success++;
    } catch (err) {
      failed++;
      console.error(
        `[ccs-cleanup] campaign ${t.campaign_id} job ${t.job_id} (${t.schedule_type}) failed:`,
        err,
      );
    }
  }

  console.log(`[ccs-cleanup] tick done — success=${success} failed=${failed}`);
}

// ── Find all eligible jobs ────────────────────────────────────────────────────
async function findAllEligibleJobs(): Promise<CleanupTarget[]> {
  const { rows } = await pool.query(
    `-- Infinite: latest active job per active campaign
     SELECT DISTINCT ON (c.id)
            c.id          AS campaign_id,
            j.id          AS job_id,
            c.org_id,
            c.schedule_type
       FROM campaigns c
       JOIN campaign_jobs j ON j.campaign_id = c.id AND j.status = 'active'
      WHERE c.schedule_type = 'infinite'
        AND c.status = 'active'

     UNION ALL

     -- Finite: latest job per campaign (any status), only if removable rows exist
     SELECT DISTINCT ON (c.id)
            c.id          AS campaign_id,
            j.id          AS job_id,
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

// ── Core cleanup for one job (single transaction) ─────────────────────────────
async function cleanupJob(t: CleanupTarget): Promise<void> {
  await withTransaction(async (client: PoolClient) => {

    // ── Step 1: Count current CCS rows ────────────────────────────────────────
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
    const removable = counts.completed_count + counts.exhausted_count + counts.dnc_count;

    // ── Step 2: Upsert summary row (one row per job per calendar date) ─────────
    // If the scheduler runs twice on the same day (e.g. manual re-run after a
    // failure) the existing row is updated rather than a duplicate being added.
    await writeSummary(client, t, counts, 'daily_aggregation');

    if (removable === 0) {
      console.log(
        `[ccs-cleanup] job ${t.job_id} (${t.schedule_type}) — nothing to remove`,
      );
      return;
    }

    // ── Step 3: Archive exhausted + dnc rows into ccs_archive ────────────────
    //
    // WHO gets archived:   exhausted, dnc
    // WHO does NOT:        completed  → already in call history, no archive needed
    //                      queued     → NEVER touched; agents still need to call them
    //
    const { rowCount: archivedCount } = await client.query(
      `INSERT INTO ccs_archive
         (original_ccs_id, contact_id, job_id, campaign_id, org_id,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          archive_trigger,
          date,
          archived_at,
          original_created_at, original_updated_at)
       SELECT
          id, contact_id, $1, $2, $3,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          'daily_cleanup',
          now()::date,
          now(),
          created_at, updated_at
       FROM campaign_contact_status
       WHERE job_id = $4
         AND status NOT IN ('queued', 'completed')
         -- NOT queued   → agents still need these rows to make calls
         -- NOT completed → already captured in call history, skip archive`,
      [t.job_id, t.campaign_id, t.org_id, t.job_id],
    );

    // ── Step 4: Delete all non-queued rows from CCS ───────────────────────────
    //
    // WHO gets deleted:    completed, exhausted, dnc  (dead-end statuses)
    // WHO stays:           queued → NEVER deleted; agents call from these rows
    //
    const { rowCount: deletedCount } = await client.query(
      `DELETE FROM campaign_contact_status
       WHERE job_id = $1
         AND status != 'queued'
         -- queued rows are intentionally kept so agents can continue calling`,
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

// ── Upsert one campaign_summary row (one per job per calendar date) ───────────
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
        dnc_count, queued_count,
        trigger,
        date,            -- ← calendar date of this snapshot
        snapshot_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
             CURRENT_DATE,   -- ← date
             now())
     ON CONFLICT (job_id, date)           -- ← upsert: one row per job per day
     DO UPDATE SET
       total_in_ccs    = EXCLUDED.total_in_ccs,
       completed_count = EXCLUDED.completed_count,
       exhausted_count = EXCLUDED.exhausted_count,
       dnc_count       = EXCLUDED.dnc_count,
       queued_count    = EXCLUDED.queued_count,
       trigger         = EXCLUDED.trigger,
       snapshot_at     = EXCLUDED.snapshot_at`,
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