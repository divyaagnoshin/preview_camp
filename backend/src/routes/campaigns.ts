import { Router, Request, Response, NextFunction } from 'express';
import pool, { withTransaction } from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { io } from '../index';
import agnoPool from '../db/agnoPool';

const router = Router();
router.use(authenticate);

// GET /campaigns
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query;
    const params: any[] = [req.user!.orgId];
    let where = 'WHERE c.org_id = $1';
    if (status) {
      params.push(status);
      where += ` AND c.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT c.*,
              json_agg(DISTINCT jsonb_build_object('id',cl.id,'name',cl.name)) FILTER (WHERE cl.id IS NOT NULL) AS contact_lists,
              COALESCE(
                ARRAY_AGG(DISTINCT cdg.dnc_group_id)
                  FILTER (WHERE cdg.dnc_group_id IS NOT NULL),
                '{}'
              ) AS dnc_group_ids,
              (SELECT cj.id FROM campaign_jobs cj WHERE cj.campaign_id = c.id AND cj.status='active' LIMIT 1) AS active_job_id
       FROM campaigns c
       LEFT JOIN campaign_contact_lists ccl ON ccl.campaign_id = c.id
       LEFT JOIN contact_lists cl ON cl.id = ccl.contact_list_id
       LEFT JOIN campaign_dnc_groups cdg ON cdg.campaign_id = c.id
       ${where}
       GROUP BY c.id ORDER BY c.created_at DESC`,
      params,
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    next(err);
  }
});

// POST /campaigns
router.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        schedule_type = 'finite',
        contact_strategy_id,
        max_attempts,
        wrapup_time_sec = 90,
        auto_dial_delay_sec = 8,
        caller_id,
        start_date,
        end_date,
        agent_priority_enabled = false,
        contact_list_ids = [],
        schedule_template_id,
        holiday_calendar_id,
        dnc_group_ids = [],
        disposition_group_id,
      } = req.body;

      if (!name) throw new AppError(400, 'name required');
      if (!contact_list_ids.length)
        throw new AppError(400, 'contact_list_ids required');

      // Accept either dnc_group_id (single, new column) or the legacy
      // dnc_group_ids array; the first id is what gets stored on the campaign row.
      const dncId =
        req.body.dnc_group_id ??
        (Array.isArray(dnc_group_ids) ? dnc_group_ids[0] : null);

      const result = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO campaigns
           (org_id, name, schedule_type, contact_strategy_id, max_attempts,
            wrapup_time_sec, auto_dial_delay_sec, caller_id, start_date, end_date,
            agent_priority_enabled, schedule_template_id, holiday_calendar_id, dnc_group_id,
            disposition_group_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
          [
            req.user!.orgId,
            name,
            schedule_type,
            contact_strategy_id || null,
            max_attempts || null,
            wrapup_time_sec,
            auto_dial_delay_sec,
            caller_id || null,
            start_date || null,
            end_date || null,
            agent_priority_enabled,
            schedule_template_id || null,
            holiday_calendar_id || null,
            dncId || null,
            disposition_group_id || null,
            req.user!.userId,
          ],
        );
        const camp = rows[0];

        for (const listId of contact_list_ids) {
          await client.query(
            'INSERT INTO campaign_contact_lists (campaign_id, contact_list_id) VALUES ($1,$2)',
            [camp.id, listId],
          );
        }
        // Junction inserts kept for backwards compatibility with existing readers.
        if (schedule_template_id) {
          await client.query(
            'INSERT INTO campaign_schedule_templates (campaign_id, schedule_template_id) VALUES ($1,$2)',
            [camp.id, schedule_template_id],
          );
        }
        if (holiday_calendar_id) {
          await client.query(
            'INSERT INTO campaign_holiday_calendars (campaign_id, holiday_calendar_id) VALUES ($1,$2)',
            [camp.id, holiday_calendar_id],
          );
        }
        const dncList: string[] =
          Array.isArray(dnc_group_ids) && dnc_group_ids.length
            ? dnc_group_ids
            : dncId
              ? [dncId]
              : [];
        for (const id of dncList) {
          await client.query(
            'INSERT INTO campaign_dnc_groups (campaign_id, dnc_group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [camp.id, id],
          );
        }
        return camp;
      });

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /campaigns/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.*,
              (SELECT cj.id FROM campaign_jobs cj WHERE cj.campaign_id=c.id AND cj.status='active' LIMIT 1) AS active_job_id
       FROM campaigns c WHERE c.id=$1 AND c.org_id=$2`,
      [req.params.id, req.user!.orgId],
    );
    if (!rows[0]) throw new AppError(404, 'Campaign not found');

    const lists = await pool.query(
      `SELECT cl.* FROM contact_lists cl
       JOIN campaign_contact_lists ccl ON ccl.contact_list_id=cl.id
       WHERE ccl.campaign_id=$1`,
      [req.params.id],
    );
    const dnc = await pool.query(
      `SELECT dg.* FROM dnc_groups dg
       JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id=dg.id
       WHERE cdg.campaign_id=$1`,
      [req.params.id],
    );
    res.json({ ...rows[0], contact_lists: lists.rows, dnc_groups: dnc.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /campaigns/:id
router.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: check } = await pool.query(
        'SELECT status FROM campaigns WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!check[0]) throw new AppError(404, 'Campaign not found');
      if (check[0].status === 'active')
        throw new AppError(409, 'Cannot update active campaign — stop first');

      // Build the SET clause from whichever keys the caller actually sent so
      // omitted fields keep their existing value and routing-ids can be
      // cleared by passing null/''.
      const ALLOWED = [
        'name',
        'schedule_type',
        'max_attempts',
        'wrapup_time_sec',
        'auto_dial_delay_sec',
        'agent_priority_enabled',
        'schedule_template_id',
        'holiday_calendar_id',
        'dnc_group_id',
        'disposition_group_id',
        'start_date',
        'end_date',
      ];
      const sets: string[] = [];
      const params: any[] = [];
      for (const key of ALLOWED) {
        if (key in req.body) {
          const v = req.body[key];
          params.push(v === '' ? null : v);
          sets.push(`${key} = $${params.length}`);
        }
      }

      // dnc_group_ids is the junction-array form. When supplied, the
      // campaign_dnc_groups rows are replaced and the legacy single
      // dnc_group_id column is kept in sync with the first id (or NULL) so
      // older read paths still resolve.
      const dncIdsProvided = Array.isArray(req.body.dnc_group_ids);
      const dncIds: string[] = dncIdsProvided
        ? req.body.dnc_group_ids.filter(Boolean)
        : [];
      if (dncIdsProvided && !('dnc_group_id' in req.body)) {
        params.push(dncIds[0] || null);
        sets.push(`dnc_group_id = $${params.length}`);
      }

      // contact_list_ids — junction replacement on campaign_contact_lists.
      // Only the future job runs use this junction (existing jobs/CCS rows
      // are tied by job_id, not by the junction). The PATCH already blocks
      // active campaigns above, so callers can only reach here while the
      // campaign is in draft or stopped state.
      const listIdsProvided = Array.isArray(req.body.contact_list_ids);
      const listIds: string[] = listIdsProvided
        ? req.body.contact_list_ids.filter(Boolean)
        : [];
      if (listIdsProvided && !listIds.length)
        throw new AppError(400, 'contact_list_ids must not be empty');

      const updated = await withTransaction(async (client) => {
        if (dncIdsProvided && dncIds.length) {
          const owners = await client.query(
            'SELECT id FROM dnc_groups WHERE id = ANY($1::uuid[]) AND org_id=$2',
            [dncIds, req.user!.orgId],
          );
          if (owners.rowCount !== dncIds.length)
            throw new AppError(404, 'one or more dnc groups not found');
        }

        if (listIdsProvided) {
          const owners = await client.query(
            'SELECT id FROM contact_lists WHERE id = ANY($1::uuid[]) AND org_id=$2',
            [listIds, req.user!.orgId],
          );
          if (owners.rowCount !== listIds.length)
            throw new AppError(404, 'one or more contact lists not found');
        }

        // Always bump updated_at so PATCH with only junction-arrays (no
        // scalar fields) still produces a valid SET clause.
        sets.push('updated_at = NOW()');
        params.push(req.params.id, req.user!.orgId);
        const { rows } = await client.query(
          `UPDATE campaigns SET ${sets.join(', ')}
           WHERE id=$${params.length - 1} AND org_id=$${params.length} RETURNING *`,
          params,
        );

        if (dncIdsProvided) {
          await client.query(
            'DELETE FROM campaign_dnc_groups WHERE campaign_id=$1',
            [req.params.id],
          );
          for (const gid of dncIds) {
            await client.query(
              `INSERT INTO campaign_dnc_groups (campaign_id, dnc_group_id)
               VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [req.params.id, gid],
            );
          }
        }

        if (listIdsProvided) {
          await client.query(
            'DELETE FROM campaign_contact_lists WHERE campaign_id=$1',
            [req.params.id],
          );
          for (const lid of listIds) {
            await client.query(
              `INSERT INTO campaign_contact_lists (campaign_id, contact_list_id)
               VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [req.params.id, lid],
            );
          }
        }
        return rows[0];
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /campaigns/:id — blocked while a campaign is active. Walks the
// campaign_jobs → history tree explicitly because those FKs were created
// without ON DELETE CASCADE.
router.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await withTransaction(async (client) => {
        const { rows } = await client.query(
          'SELECT status FROM campaigns WHERE id=$1 AND org_id=$2',
          [req.params.id, req.user!.orgId],
        );
        if (!rows[0]) throw new AppError(404, 'Campaign not found');
        if (rows[0].status === 'active')
          throw new AppError(409, 'Cannot delete active campaign — stop first');

        // Children of campaign_jobs (no cascade) → wipe by job_id.
        await client.query(
          `DELETE FROM contact_interactions WHERE job_id IN
             (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
          [req.params.id],
        );
        await client.query(
          `DELETE FROM contact_status_history WHERE job_id IN
             (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
          [req.params.id],
        );
        await client.query(
          `DELETE FROM campaign_contact_status WHERE job_id IN
             (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
          [req.params.id],
        );
        await client.query(
          `UPDATE agent_sessions SET current_job_id=NULL
           WHERE current_job_id IN
             (SELECT id FROM campaign_jobs WHERE campaign_id=$1)`,
          [req.params.id],
        );
        await client.query('DELETE FROM campaign_jobs WHERE campaign_id=$1', [
          req.params.id,
        ]);
        // Direct campaign children without ON DELETE CASCADE.
        await client.query(
          'DELETE FROM disposition_codes WHERE campaign_id=$1',
          [req.params.id],
        );
        // Junction tables (campaign_contact_lists, _schedule_templates,
        // _holiday_calendars, _dnc_groups) all cascade automatically.
        await client.query('DELETE FROM campaigns WHERE id=$1 AND org_id=$2', [
          req.params.id,
          req.user!.orgId,
        ]);
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// POST /campaigns/:id/run — auto-creates job + registers contacts into CCS.
//
// Two-phase commit so the transient 'preparing' job state is observable to
// the UI / pollers while CCS is being populated:
//   TX1: validate → flip campaign to 'active' and create/update the job row
//        as status='preparing'. Commits immediately so list/poll queries see
//        the new state.
//   TX2: bulk-INSERT contacts into campaign_contact_status, write status
//        history, then flip the job to 'active'. While TX2 is in flight the
//        committed job row remains 'preparing'.
//   On TX2 failure: best-effort rollback the campaign + job back to their
//   pre-run state so the user can retry without a stuck 'preparing' job.
//
// The infinite-campaign injector intentionally JOINs `campaign_jobs WHERE
// status='active'`, so a 'preparing' job is invisible to it and can't
// double-inject during this window.
router.post(
  '/:id/run',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ── Phase 1 ─────────────────────────────────────────────────────────
      const phase1 = await withTransaction(async (client) => {
        const { rows: campRows } = await client.query(
          'SELECT * FROM campaigns WHERE id=$1 AND org_id=$2',
          [req.params.id, req.user!.orgId],
        );
        if (!campRows[0]) throw new AppError(404, 'Campaign not found');
        const camp = campRows[0];
        if (camp.status === 'active')
          throw new AppError(409, 'Campaign already active');

        // Count contacts from attached lists
        const { rows: countRows } = await client.query(
          `SELECT COUNT(c.id)::int AS cnt FROM contacts c
         JOIN campaign_contact_lists ccl ON ccl.contact_list_id=c.contact_list_id
         WHERE ccl.campaign_id=$1`,
          [camp.id],
        );
        if (!countRows[0].cnt)
          throw new AppError(422, 'Campaign has no contacts');

        // One campaign → one campaign_jobs row, forever. Re-running just
        // reactivates the existing job (bump run_number, refresh totals)
        // instead of creating a new job_id every time. This makes the
        // UNIQUE(contact_id, job_id) constraint on campaign_contact_status
        // act as a real dedup so re-runs only enqueue newly-added contacts.
        const { rows: existingJobRows } = await client.query(
          `SELECT * FROM campaign_jobs
            WHERE campaign_id=$1
            ORDER BY job_run_number DESC
            LIMIT 1`,
          [camp.id],
        );

        let job;
        if (existingJobRows[0]) {
          const { rows: updatedJob } = await client.query(
            `UPDATE campaign_jobs
                SET status='preparing',
                    job_run_number = job_run_number + 1,
                    total_contacts = $2,
                    start_time = NOW(),
                    end_time = NULL
              WHERE id=$1
              RETURNING *`,
            [existingJobRows[0].id, countRows[0].cnt],
          );
          job = updatedJob[0];
        } else {
          const { rows: newJob } = await client.query(
            `INSERT INTO campaign_jobs (campaign_id, job_run_number, status, total_contacts)
             VALUES ($1,1,'preparing',$2) RETURNING *`,
            [camp.id, countRows[0].cnt],
          );
          job = newJob[0];
        }

        // Update campaign status. The injector reads `last_injected_at` off
        // the per-org system_config row, so there is nothing campaign-level
        // to bump here — the existing TX1 → TX2 sequence is sufficient.
        await client.query(
          `UPDATE campaigns SET status='active', updated_at=NOW() WHERE id=$1`,
          [camp.id],
        );
        return { camp, job, total: countRows[0].cnt };
      });

      // ── Phase 2 ─────────────────────────────────────────────────────────
      // CCS insertion + history + flip job 'preparing' → 'active'. Wrapped
      // in its own transaction so the job's pre-CCS 'preparing' state is
      // already committed and visible to readers before the heavy INSERT
      // starts.
      const { camp, job, total } = phase1;
      try {
        const newCcsRows = await withTransaction(async (client) => {
          // Register all contacts into CCS. Dedup is by (phone_number, job_id),
          // NOT by (contact_id, job_id), because the same phone can exist in
          // multiple contact_lists with different contact_id values. Two-layer
          // dedup:
          //   1. DISTINCT ON (phone_number) — collapses duplicates inside this
          //      batch when a campaign is linked to multiple lists that share
          //      a phone. Lowest priority number (= highest priority) wins,
          //      then oldest contact row, for a deterministic pick.
          //   2. NOT EXISTS against existing CCS rows joined back to contacts
          //      by phone — skips a phone that is already queued for this job
          //      from a previous run, even if its contact_id is now different.
          // ON CONFLICT (contact_id, job_id) DO NOTHING is kept only as a
          // defensive race-condition fallback. RETURNING drives the
          // status-history insert below.
          const { rows } = await client.query(
            `INSERT INTO campaign_contact_status
             (contact_id, job_id, status, priority, assigned_agent_id, next_attempt_at)
           SELECT DISTINCT ON (c.phone_number)
             c.id, $1,
             CASE WHEN dn.phone_number IS NOT NULL THEN 'dnc' ELSE 'queued' END,
             c.priority,
             CASE WHEN $2 THEN c.assigned_agent_id ELSE NULL END,
             NOW()
           FROM contacts c
           JOIN campaign_contact_lists ccl ON ccl.contact_list_id = c.contact_list_id
           LEFT JOIN (
             SELECT DISTINCT dn.phone_number
             FROM dnc_numbers dn
             JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dn.dnc_group_id
             WHERE cdg.campaign_id = $3
           ) dn ON dn.phone_number = c.phone_number
           WHERE ccl.campaign_id = $3
             AND NOT EXISTS (
               SELECT 1
                 FROM campaign_contact_status ccs
                 JOIN contacts c2 ON c2.id = ccs.contact_id
                WHERE ccs.job_id = $1
                  AND c2.phone_number = c.phone_number
             )
           ORDER BY c.phone_number, c.priority ASC, c.created_at ASC
           ON CONFLICT (contact_id, job_id) DO NOTHING
           RETURNING contact_id, status`,
            [job.id, camp.agent_priority_enabled, camp.id],
          );

          // Write status history only for the newly-inserted CCS rows. Rows
          // that were skipped by ON CONFLICT already have their original
          // history entry from a prior run.
          if (rows.length) {
            const contactIds = rows.map((r: any) => r.contact_id);
            const statuses = rows.map((r: any) => r.status);
            await client.query(
              `INSERT INTO contact_status_history (contact_id, job_id, to_status, trigger_type)
               SELECT UNNEST($1::uuid[]), $2, UNNEST($3::text[]), 'system'`,
              [contactIds, job.id, statuses],
            );
          }

          // Flip the job to 'active' inside the same transaction that
          // wrote the CCS rows — readers either see (preparing + empty CCS)
          // or (active + populated CCS), never a half-state.
          // Also set excluded_contacts = total_contacts - (non-dnc contacts in CCS)
          await client.query(
            `UPDATE campaign_jobs
   SET status='active',
       excluded_contacts = (
         -- DNC contacts
         SELECT COUNT(*)::int
         FROM campaign_contact_status
         WHERE job_id = $1 AND status = 'dnc'
       ) + (
         -- Duplicate contacts: total from lists minus what got inserted into CCS
         SELECT GREATEST(0, total_contacts - COUNT(*)::int)
         FROM campaign_contact_status
         WHERE job_id = $1
       )
   WHERE id=$1`,
            [job.id],
          );
          return rows;
        });

        // Fetch mapped agents so UI knows who to notify
        const mappedRes = await agnoPool.query(
          `SELECT agent_userid FROM campaign_agent_mapping WHERE campaign_id=$1`,
          [camp.id]
        );
        const mapped_agents = mappedRes.rows.map((r: any) => r.agent_userid);

        // Broadcast to AgnoConV2 Angular clients
        io.emit('campaign_update', {
          campaign_id: camp.id,
          event: 'started',
          message: `Campaign ${camp.name || camp.id} has been started.`,
          timestamp: new Date().toISOString(),
          mapped_agents
        });

        res.json({
          campaign_id: camp.id,
          job_id: job.id,
          status: 'active',
          started_at: job.start_time,
          contacts_registered: newCcsRows.length,
          contacts_skipped_as_duplicate: total - newCcsRows.length,
        });
      } catch (err) {
        // Best-effort rollback so the user can retry. We don't reuse the
        // failed connection — withTransaction will grab a fresh one.
        try {
          await withTransaction(async (client) => {
            await client.query(
              `UPDATE campaign_jobs SET status='stopped', end_time=NOW() WHERE id=$1`,
              [job.id],
            );
            await client.query(
              `UPDATE campaigns SET status='inactive', updated_at=NOW() WHERE id=$1`,
              [camp.id],
            );
          });
        } catch (rollbackErr) {
          console.error('[campaigns/run] rollback failed:', rollbackErr);
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /campaigns/:id/stop
router.post(
  '/:id/stop',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body;
      const result = await withTransaction(async (client) => {
        const { rows: campRows } = await client.query(
          'SELECT * FROM campaigns WHERE id=$1 AND org_id=$2',
          [req.params.id, req.user!.orgId],
        );
        if (!campRows[0]) throw new AppError(404, 'Campaign not found');
        if (campRows[0].status !== 'active')
          throw new AppError(409, 'Campaign is not active');

        const { rows: jobRows } = await client.query(
          "SELECT id FROM campaign_jobs WHERE campaign_id=$1 AND status='active'",
          [req.params.id],
        );
        const jobId = jobRows[0]?.id;

        // Stop the job
        await client.query(
          "UPDATE campaign_jobs SET status='stopped', end_time=NOW() WHERE id=$1",
          [jobId],
        );
        await client.query(
          "UPDATE campaigns SET status='inactive', updated_at=NOW() WHERE id=$1",
          [req.params.id],
        );

        // Count and release unlocked queued CCS rows
        const { rows: relRows } = await client.query(
          `UPDATE campaign_contact_status
         SET status='queued' WHERE job_id=$1 AND locked_by_session IS NULL AND status='queued'
         RETURNING id`,
          [jobId],
        );

        // Fetch mapped agents so UI knows who to notify
        const mappedRes = await agnoPool.query(
          `SELECT agent_userid FROM campaign_agent_mapping WHERE campaign_id=$1`,
          [req.params.id]
        );
        const mapped_agents = mappedRes.rows.map((r: any) => r.agent_userid);

        // Broadcast to AgnoConV2 Angular clients
        io.emit('campaign_update', {
          campaign_id: req.params.id,
          event: 'stopped',
          message: `Campaign ${campRows[0].name} has been stopped.`,
          timestamp: new Date().toISOString(),
          mapped_agents
        });

        return {
          campaign_id: req.params.id,
          job_id: jobId,
          status: 'inactive',
          stopped_at: new Date().toISOString(),
          contacts_released: relRows.length,
        };
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /campaigns/:id
router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        'SELECT status FROM campaigns WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!rows[0]) throw new AppError(404, 'Campaign not found');
      if (rows[0].status !== 'draft')
        throw new AppError(409, 'Only draft campaigns can be deleted');
      await pool.query('DELETE FROM campaigns WHERE id=$1', [req.params.id]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
