// src/services/ccsCleanup.ts
//
// Shared CCS cleanup logic — used by:
//   • backend          : campaigns.ts  /stop route  (finite + manual stop)
//   • backend-injector : scheduler.ts  periodic tick (infinite campaigns)
//
// What it does (inside ONE transaction per call)
// ───────────────────────────────────────────────
// 1. Snapshot counts into campaign_summary BEFORE touching CCS.
// 2. Copy non-completed CCS rows (queued | exhausted | dnc)
//    into ccs_archive.
// 3. DELETE all completed/exhausted/dnc rows from campaign_contact_status.
//    if the campaign is still running (infinite periodic cleanup).
//    Pass deleteQueued=true (finite stop) to also clear those.
//
// NOTE: This file is duplicated into both backend and backend-injector
// because they are separate Node processes with separate DB pools.
// Keep them in sync — they are identical except for the import path of
// the pool/withTransaction helper.

import pool, { withTransaction } from '../db/pool';
import { PoolClient } from 'pg';

export type CleanupTrigger = 'stop' | 'auto_complete' | 'periodic_cleanup';

export interface CleanupResult {
  job_id: string;
  campaign_id: string;
  summary_id: string;
  archived: number;      // non-completed rows moved to ccs_archive
  deleted_completed: number; // completed rows deleted (no archive copy)
  total_deleted: number;
}

/**
 * Snapshot + archive + delete CCS rows for one campaign_job.
 *
 * @param jobId         The campaign_jobs.id to clean up.
 * @param campaignId    Needed to populate ccs_archive.campaign_id.
 * @param orgId         Needed for campaign_summary.org_id index.
 * @param trigger       Label stored in campaign_summary and ccs_archive.
 * @param deleteQueued  If true, also remove queued rows
 *                      (use for finite stop / auto-complete).
 *                      If false, only remove completed/exhausted/dnc
 *                      (use for infinite periodic cleanup — live queue intact).
 * @param client        Optional existing transaction client. When provided
 *                      the caller owns the transaction boundary; when omitted
 *                      this function wraps everything in its own transaction.
 */
export async function cleanupJobCcs(
  jobId: string,
  campaignId: string,
  orgId: string,
  trigger: CleanupTrigger,
  deleteQueued: boolean,
  client?: PoolClient,
): Promise<CleanupResult> {
  const run = async (c: PoolClient): Promise<CleanupResult> => {
    // ── Step 1: snapshot counts ────────────────────────────────────────
    const { rows: countRows } = await c.query(
      `SELECT
         COUNT(*)                                          ::int AS total_in_ccs,
         COUNT(*) FILTER (WHERE status = 'completed')     ::int AS completed_count,
         COUNT(*) FILTER (WHERE status = 'exhausted')     ::int AS exhausted_count,
         COUNT(*) FILTER (WHERE status = 'dnc')           ::int AS dnc_count,
         COUNT(*) FILTER (WHERE status = 'queued')        ::int AS queued_count,
       FROM campaign_contact_status
       WHERE job_id = $1`,
      [jobId],
    );
    const counts = countRows[0] ?? {
      total_in_ccs: 0, completed_count: 0, exhausted_count: 0,
      dnc_count: 0, queued_count: 0,
    };

    const { rows: summaryRows } = await c.query(
      `INSERT INTO campaign_summary
         (campaign_id, job_id, org_id,
          total_in_ccs, completed_count, exhausted_count,
          dnc_count, queued_count, trigger)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        campaignId, jobId, orgId,
        counts.total_in_ccs, counts.completed_count, counts.exhausted_count,
        counts.dnc_count, counts.queued_count,
        trigger,
      ],
    );
    const summaryId = summaryRows[0].id;

    // ── Step 2: archive non-completed rows ────────────────────────────
    // Statuses to archive depend on whether we're clearing the live queue too.
    const archiveStatuses = deleteQueued
      ? ['queued', 'exhausted', 'dnc']
      : ['exhausted', 'dnc'];

    const { rows: archivedRows } = await c.query(
      `INSERT INTO ccs_archive
         (original_ccs_id, contact_id, job_id, campaign_id, org_id,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          archive_trigger, original_created_at, original_updated_at)
       SELECT
          id, contact_id, job_id, $1, $2,
          status, priority, assigned_agent_id, attempts_made,
          last_attempted_at, next_attempt_at,
          $3, created_at, updated_at
       FROM campaign_contact_status
       WHERE job_id = $4
         AND status = ANY($5::text[])
       RETURNING id`,
      [campaignId, orgId, trigger, jobId, archiveStatuses],
    );
    const archived = archivedRows.length;

    // ── Step 3: delete from live CCS ──────────────────────────────────
    // Always delete completed rows (no archive copy — history table has them).
    // Also delete the statuses we just archived.
    const deleteStatuses = ['completed', ...archiveStatuses];

    const { rowCount: deletedCount } = await c.query(
      `DELETE FROM campaign_contact_status
       WHERE job_id = $1
         AND status = ANY($2::text[])`,
      [jobId, deleteStatuses],
    );
    const totalDeleted = deletedCount ?? 0;
    const deletedCompleted = totalDeleted - archived;

    console.log(
      `[ccsCleanup] job ${jobId} trigger=${trigger}` +
      ` archived=${archived} deleted_completed=${deletedCompleted}` +
      ` total_deleted=${totalDeleted}`,
    );

    return {
      job_id: jobId,
      campaign_id: campaignId,
      summary_id: summaryId,
      archived,
      deleted_completed: deletedCompleted,
      total_deleted: totalDeleted,
    };
  };

  // Use the supplied client (caller owns TX) or open a new one.
  if (client) {
    return run(client);
  }
  return withTransaction(run);
}