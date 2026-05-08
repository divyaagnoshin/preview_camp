import { Router, Request, Response, NextFunction } from 'express';
import pool, { withTransaction } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const REJECTION_CODES = [
  'NOT_READY',
  'NEED_BREAK',
  'SKILL_MISMATCH',
  'TECHNICAL_ISSUE',
  'SUPERVISOR_HOLD',
];

// PATCH /sessions/ready
router.patch(
  '/sessions/ready',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { selected_job_ids } = req.body;
      if (!Array.isArray(selected_job_ids) || !selected_job_ids.length)
        throw new AppError(400, 'selected_job_ids array required');

      // Verify all jobs are active
      const { rows: jobCheck } = await pool.query(
        `SELECT id FROM campaign_jobs WHERE id = ANY($1) AND status = 'active'`,
        [selected_job_ids],
      );
      if (jobCheck.length !== selected_job_ids.length)
        throw new AppError(400, 'One or more job IDs are not active');

      // Upsert agent session
      const { rows } = await pool.query(
        `INSERT INTO agent_sessions (agent_id, selected_job_ids, status, last_heartbeat_at)
       VALUES ($1, $2, 'available', NOW())
       ON CONFLICT (agent_id) DO UPDATE
         SET selected_job_ids = $2,
             status = 'available',
             last_heartbeat_at = NOW(),
             logout_at = NULL
       RETURNING *`,
        [req.user!.userId, selected_job_ids],
      );
      res.json({
        session_id: rows[0].id,
        status: 'available',
        selected_job_ids,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /workspace/next-contact — the core atomic fetch
router.get(
  '/workspace/next-contact',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const agentId = req.user!.userId;

      // Get active session
      const { rows: sessRows } = await pool.query(
        `SELECT * FROM agent_sessions WHERE agent_id=$1 AND status='available'`,
        [agentId],
      );
      if (!sessRows[0])
        throw new AppError(400, 'Session not in available status');
      const session = sessRows[0];

      if (!session.selected_job_ids?.length)
        throw new AppError(400, 'No jobs selected for this session');

      // Get campaign config for agent priority check
      const { rows: jobCamps } = await pool.query(
        `SELECT cj.id as job_id, c.agent_priority_enabled, c.auto_dial_delay_sec, c.name as campaign_name
       FROM campaign_jobs cj
       JOIN campaigns c ON c.id = cj.campaign_id
       WHERE cj.id = ANY($1) AND cj.status = 'active'`,
        [session.selected_job_ids],
      );
      const agentPriorityEnabled = jobCamps.some(
        (j) => j.agent_priority_enabled,
      );
      const autoDialDelay = jobCamps[0]?.auto_dial_delay_sec || 8;

      // Build the fetch query dynamically based on agent priority
      const assignmentFilter = agentPriorityEnabled
        ? `AND (ccs.assigned_agent_id = $2 OR ccs.assigned_agent_id IS NULL)`
        : '';
      const orderBy = agentPriorityEnabled
        ? `CASE WHEN ccs.assigned_agent_id = $2 THEN 0 ELSE 1 END ASC, ccs.priority ASC, ccs.next_attempt_at ASC`
        : `ccs.priority ASC, ccs.next_attempt_at ASC`;

      const fetchParams: any[] = [session.selected_job_ids];
      if (agentPriorityEnabled) fetchParams.push(agentId);

      const result = await withTransaction(async (client) => {
        // Atomic: find + lock CCS row
        const { rows: ccsRows } = await client.query(
          `SELECT ccs.*, c.phone_number, c.first_name, c.last_name, c.custom_fields,
                c.priority as contact_priority, cj.campaign_id,
                camp.name as campaign_name, camp.auto_dial_delay_sec
         FROM campaign_contact_status ccs
         JOIN contacts c ON c.id = ccs.contact_id
         JOIN campaign_jobs cj ON cj.id = ccs.job_id
         JOIN campaigns camp ON camp.id = cj.campaign_id
         WHERE ccs.job_id = ANY($1)
           AND ccs.status = 'queued'
           AND ccs.next_attempt_at <= NOW()
           AND ccs.locked_by_session IS NULL
           AND c.phone_number NOT IN (
             SELECT dn.phone_number FROM dnc_numbers dn
             JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dn.dnc_group_id
             WHERE cdg.campaign_id = cj.campaign_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM contact_interactions ci
             WHERE ci.contact_id = ccs.contact_id
               AND ci.dialed_at >= NOW() - INTERVAL '4 hours'
               AND ci.call_status != 'pending'
           )
           ${assignmentFilter}
         ORDER BY ${orderBy}
         LIMIT 1
         FOR UPDATE OF ccs SKIP LOCKED`,
          fetchParams,
        );

        if (!ccsRows[0]) return null; // No contact available

        const ccs = ccsRows[0];

        // Lock the CCS row + set status=with_agent
        await client.query(
          `UPDATE campaign_contact_status
         SET locked_by_session=$1, locked_at=NOW(), status='with_agent', updated_at=NOW()
         WHERE id=$2`,
          [session.id, ccs.id],
        );

        // Insert contact_interactions row (given_at only)
        const givenAt = new Date();
        const autoDialFiresAt = new Date(
          givenAt.getTime() + autoDialDelay * 1000,
        );

        const { rows: interRows } = await client.query(
          `INSERT INTO contact_interactions
           (contact_id, job_id, agent_id, agent_session_id,
            attempt_number, dial_mode, given_at, auto_dial_fires_at, preview_action)
         VALUES ($1,$2,$3,$4,$5,'auto',$6,$7,'pending')
         RETURNING id`,
          [
            ccs.contact_id,
            ccs.job_id,
            agentId,
            session.id,
            ccs.attempts_made + 1,
            givenAt,
            autoDialFiresAt,
          ],
        );

        // Update agent session
        await client.query(
          `UPDATE agent_sessions
         SET status='with_agent', current_contact_id=$1, current_job_id=$2,
             last_heartbeat_at=NOW()
         WHERE id=$3`,
          [ccs.contact_id, ccs.job_id, session.id],
        );

        // Get field definitions for preview card
        const { rows: fieldDefs } = await client.query(
          `SELECT field_key, field_label, data_type, field_type, display_order, is_visible_to_agent
         FROM contact_list_field_definitions
         WHERE contact_list_id = (
           SELECT contact_list_id FROM contacts WHERE id=$1
         ) AND is_visible_to_agent = true
         ORDER BY display_order`,
          [ccs.contact_id],
        );

        return {
          interaction_id: interRows[0].id,
          ccs_id: ccs.id,
          contact_id: ccs.contact_id,
          job_id: ccs.job_id,
          campaign_name: ccs.campaign_name,
          phone_number: ccs.phone_number,
          first_name: ccs.first_name,
          last_name: ccs.last_name,
          attempt_number: ccs.attempts_made + 1,
          priority: ccs.contact_priority,
          assigned_agent_id: ccs.assigned_agent_id,
          custom_fields: ccs.custom_fields,
          field_definitions: fieldDefs,
          auto_dial_in_sec: autoDialDelay,
          given_at: givenAt.toISOString(),
        };
      });

      if (!result) {
        res.status(204).set('Retry-After-Ms', '5000').send();
        return;
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /workspace/reject
router.post(
  '/workspace/reject',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { interaction_id, rejection_reason } = req.body;
      if (!interaction_id) throw new AppError(400, 'interaction_id required');
      if (!REJECTION_CODES.includes(rejection_reason))
        throw new AppError(
          400,
          `rejection_reason must be one of: ${REJECTION_CODES.join(', ')}`,
        );

      await withTransaction(async (client) => {
        const { rows: intRows } = await client.query(
          `SELECT * FROM contact_interactions WHERE id=$1 AND agent_id=$2 AND preview_action='pending'`,
          [interaction_id, req.user!.userId],
        );
        if (!intRows[0])
          throw new AppError(404, 'Interaction not found or already closed');
        const interaction = intRows[0];

        // Update contact_interactions
        await client.query(
          `UPDATE contact_interactions
         SET preview_action='rejected', rejected_at=NOW(),
             rejection_reason=$1, agent_session_id=NULL
         WHERE id=$2`,
          [rejection_reason, interaction_id],
        );

        // Release CCS — no cooldown on reject (contact wasn't called)
        await client.query(
          `UPDATE campaign_contact_status
         SET status='queued', locked_by_session=NULL, locked_at=NULL,
             next_attempt_at=NOW(), updated_at=NOW()
         WHERE contact_id=$1 AND job_id=$2`,
          [interaction.contact_id, interaction.job_id],
        );

        // Reset agent session
        await client.query(
          `UPDATE agent_sessions
         SET status='available', current_contact_id=NULL, current_job_id=NULL
         WHERE agent_id=$1`,
          [req.user!.userId],
        );
      });

      res.json({ interaction_id, status: 'rejected', re_queued: true });
    } catch (err) {
      next(err);
    }
  },
);


// POST /workspace/disposition — the single final UPDATE on contact_interactions
router.post(
  '/workspace/disposition',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        interaction_id,
        disposition_code_id,
        accepted_at,
        dialed_at,
        answered_at,
        disconnected_at,
        call_status,
        telephony_call_sid,
        recording_url,
        reschedule_at,
        notes,
      } = req.body;

      if (!interaction_id) throw new AppError(400, 'interaction_id required');
      if (!disposition_code_id)
        throw new AppError(400, 'disposition_code_id required');
      if (!accepted_at) throw new AppError(400, 'accepted_at required');
      if (!dialed_at) throw new AppError(400, 'dialed_at required');
      if (!disconnected_at) throw new AppError(400, 'disconnected_at required');
      if (!call_status) throw new AppError(400, 'call_status required');

      const result = await withTransaction(async (client) => {
        // Validate interaction
        const { rows: intRows } = await client.query(
          `SELECT * FROM contact_interactions WHERE id=$1 AND agent_id=$2 AND wrapup_at IS NULL`,
          [interaction_id, req.user!.userId],
        );
        if (!intRows[0])
          throw new AppError(404, 'Interaction not found or already disposed');
        const interaction = intRows[0];

        // Get disposition code
        const { rows: codeRows } = await client.query(
          'SELECT * FROM disposition_codes WHERE id=$1',
          [disposition_code_id],
        );
        if (!codeRows[0])
          throw new AppError(400, 'Invalid disposition_code_id');
        const code = codeRows[0];
        if (code.notes_required && !notes)
          throw new AppError(400, `Notes required for ${code.code}`);
        if (
          code.capability === 'RESCHEDULE' &&
          !reschedule_at &&
          !code.retry_delay_min
        )
          throw new AppError(
            400,
            'reschedule_at required for RESCHEDULE disposition',
          );

        const wrapupAt = new Date();

        // Compute durations
        const givenAt = new Date(interaction.given_at);
        const acceptedDate = new Date(accepted_at);
        const disconnDate = new Date(disconnected_at);
        const answeredDate = answered_at ? new Date(answered_at) : null;

        const previewDurationSec = Math.round(
          (acceptedDate.getTime() - givenAt.getTime()) / 1000,
        );
        const talkTimeSec = answeredDate
          ? Math.round((disconnDate.getTime() - answeredDate.getTime()) / 1000)
          : null;
        const wrapupDurationSec = Math.round(
          (wrapupAt.getTime() - disconnDate.getTime()) / 1000,
        );
        const totalHandlingSec = Math.round(
          (wrapupAt.getTime() - givenAt.getTime()) / 1000,
        );

        // Single final UPDATE on contact_interactions
        await client.query(
          `UPDATE contact_interactions SET
           preview_action = 'accepted',
           accepted_at = $1, dialed_at = $2, answered_at = $3,
           disconnected_at = $4, wrapup_at = $5,
           preview_duration_sec = $6, talk_time_sec = $7,
           wrapup_duration_sec = $8, total_handling_sec = $9,
           call_status = $10, telephony_call_sid = $11, recording_url = $12,
           disposition_code_id = $13, disposition_capability = $14,
           reschedule_at = $15, disposition_notes = $16,
           agent_session_id = NULL
         WHERE id = $17`,
          [
            accepted_at,
            dialed_at,
            answered_at || null,
            disconnected_at,
            wrapupAt,
            previewDurationSec,
            talkTimeSec,
            wrapupDurationSec,
            totalHandlingSec,
            call_status,
            telephony_call_sid || null,
            recording_url || null,
            disposition_code_id,
            code.capability,
            reschedule_at || null,
            notes || null,
            interaction_id,
          ],
        );

        // Get campaign config for max_attempts check
        const { rows: campRows } = await client.query(
          `SELECT c.max_attempts FROM campaigns c
         JOIN campaign_jobs cj ON cj.campaign_id = c.id
         WHERE cj.id = $1`,
          [interaction.job_id],
        );
        const maxAttempts = campRows[0]?.max_attempts;

        // Get current attempts_made
        const { rows: ccsRows } = await client.query(
          `SELECT attempts_made FROM campaign_contact_status
         WHERE contact_id=$1 AND job_id=$2`,
          [interaction.contact_id, interaction.job_id],
        );
        const newAttemptsMade = (ccsRows[0]?.attempts_made || 0) + 1;
        const isExhausted = maxAttempts && newAttemptsMade >= maxAttempts;

        // Determine new CCS status from capability
        let ccsStatus: string;
        let nextAttemptAt: string | null = null;

        if (code.capability === 'CLOSED' || code.code === 'DNC') {
          ccsStatus = code.code === 'DNC' ? 'dnc' : 'completed';
        } else if (isExhausted) {
          ccsStatus = 'exhausted';
        } else if (code.capability === 'RESCHEDULE') {
          ccsStatus = 'queued';
          nextAttemptAt =
            reschedule_at ||
            new Date(
              Date.now() + (code.retry_delay_min || 90) * 60000,
            ).toISOString();
        } else {
          // NEXT_ATTEMPT
          ccsStatus = 'queued';
          nextAttemptAt = new Date(
            Date.now() + (code.retry_delay_min || 90) * 60000,
          ).toISOString();
        }


        // Update CCS
        await client.query(
          `UPDATE campaign_contact_status SET
           status = $1,
           locked_by_session = NULL,
           locked_at = NULL,
           next_attempt_at = COALESCE($2::timestamptz, next_attempt_at),
           attempts_made = $3,
           last_attempted_at = NOW(),
           updated_at = NOW()
         WHERE contact_id=$4 AND job_id=$5`,
          [
            ccsStatus,
            nextAttemptAt,
            newAttemptsMade,
            interaction.contact_id,
            interaction.job_id,
          ],
        );

        // DNC: add to dnc_numbers
        if (code.code === 'DNC') {
          const { rows: dncGroupRows } = await client.query(
            `SELECT dg.id FROM dnc_groups dg
           JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dg.id
           JOIN campaign_jobs cj ON cj.campaign_id = cdg.campaign_id
           WHERE cj.id = $1 LIMIT 1`,
            [interaction.job_id],
          );
          if (dncGroupRows[0]) {
            await client.query(
              `INSERT INTO dnc_numbers (dnc_group_id, phone_number, added_reason, added_by)
             SELECT $1, c.phone_number, 'agent_marked', $2
             FROM contacts c WHERE c.id = $3
             ON CONFLICT DO NOTHING`,
              [dncGroupRows[0].id, req.user!.userId, interaction.contact_id],
            );
          }
        }

        // Status history
        await client.query(
          `INSERT INTO contact_status_history
           (contact_id, job_id, from_status, to_status, trigger_type, triggered_by)
         VALUES ($1,$2,'with_agent',$3,'disposition',$4)`,
          [
            interaction.contact_id,
            interaction.job_id,
            ccsStatus,
            req.user!.userId,
          ],
        );

        // Agent session back to available
        await client.query(
          `UPDATE agent_sessions SET
           status='available', current_contact_id=NULL, current_job_id=NULL
         WHERE agent_id=$1`,
          [req.user!.userId],
        );

        // Check finite campaign auto-close
        const { rows: pendingRows } = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM campaign_contact_status
         WHERE job_id=$1 AND status NOT IN ('completed','exhausted','dnc')`,
          [interaction.job_id],
        );
        if (pendingRows[0].cnt === 0) {
          const { rows: jobRows } = await client.query(
            `SELECT cj.id, c.schedule_type FROM campaign_jobs cj
           JOIN campaigns c ON c.id = cj.campaign_id
           WHERE cj.id=$1`,
            [interaction.job_id],
          );
          if (jobRows[0]?.schedule_type === 'finite') {
            await client.query(
              `UPDATE campaign_jobs SET status='completed', end_time=NOW() WHERE id=$1`,
              [interaction.job_id],
            );
            await client.query(
              `UPDATE campaigns SET status='completed', updated_at=NOW()
             WHERE id=(SELECT campaign_id FROM campaign_jobs WHERE id=$1)`,
              [interaction.job_id],
            );
          }
        }

        return {
          interaction_id,
          contact_id: interaction.contact_id,
          disposition_code: code.code,
          capability: code.capability,
          ccs_status: ccsStatus,
          next_attempt_at: nextAttemptAt,
          preview_duration_sec: previewDurationSec,
          talk_time_sec: talkTimeSec,
          wrapup_duration_sec: wrapupDurationSec,
          total_handling_sec: totalHandlingSec,
        };
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// POST /sessions/heartbeat
router.post(
  '/sessions/heartbeat',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `UPDATE agent_sessions SET last_heartbeat_at=NOW()
       WHERE agent_id=$1 AND status != 'offline' RETURNING *`,
        [req.user!.userId],
      );
      if (!rows[0])
        throw new AppError(404, 'Session not found or already offline');
      res.json({
        session_id: rows[0].id,
        last_heartbeat_at: rows[0].last_heartbeat_at,
        status: rows[0].status,
      });
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /sessions/offline
router.patch(
  '/sessions/offline',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: active } = await pool.query(
        `SELECT 1 FROM agent_sessions WHERE agent_id=$1 AND status='with_agent'`,
        [req.user!.userId],
      );
      if (active.length)
        throw new AppError(409, 'Active contact in progress — dispose first');

      const { rows } = await pool.query(
        `UPDATE agent_sessions SET status='offline', logout_at=NOW()
       WHERE agent_id=$1 RETURNING *`,
        [req.user!.userId],
      );
      res.json({
        session_id: rows[0]?.id,
        status: 'offline',
        logout_at: rows[0]?.logout_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
