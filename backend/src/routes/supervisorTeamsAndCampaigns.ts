/**
 * supervisorTeamsAndCampaigns.ts  —  Supervisor Teams + Campaign Mapping Routes
 */

import { Router, Request, Response, NextFunction } from 'express';
import agnoPool, { withAgnoTransaction } from '../db/agnoPool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /v1/supervisor-teams
// Return all supervisors (role_id = 2) with their agents
// pulled via reporting_to column in user_details.
// ─────────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fetch all supervisors (role_id = 2)
      const { rows: supervisors } = await agnoPool.query(
        `SELECT
           s.userid             AS supervisor_id,
           s.first_name         AS supervisor_first_name,
           s.last_name          AS supervisor_last_name,
           s.email_id           AS supervisor_email,
           s.username           AS supervisor_username,
           CASE WHEN LOWER(s.status) = 'active' THEN true ELSE false END AS supervisor_is_active
         FROM user_details s
         WHERE s.role_id = 2
         AND LOWER(s.status) = 'active'
         ORDER BY s.first_name`,
      );

      // Fetch all agents that have a reporting_to set (role_id = 3 = agent)
      const { rows: agents } = await agnoPool.query(
        `SELECT
           a.userid        AS agent_id,
           a.first_name    AS agent_first_name,
           a.last_name     AS agent_last_name,
           a.email_id      AS agent_email,
           a.username      AS agent_username,
           a.reporting_to  AS reporting_to,
           CASE WHEN LOWER(a.status) = 'active' THEN true ELSE false END AS agent_is_active
         FROM user_details a
         WHERE a.role_id = 4
           AND a.reporting_to IS NOT NULL`,
      );

      // Group agents under their supervisor
      const supervisorMap = new Map<string, any>();

      for (const sup of supervisors) {
        supervisorMap.set(sup.supervisor_id, {
          ...sup,
          agents: [],
        });
      }

      for (const agent of agents) {
        // reporting_to stores supervisor userid (cast to string for map lookup)
        const supId = String(agent.reporting_to);
        if (supervisorMap.has(supId)) {
          supervisorMap.get(supId)!.agents.push({
            id: agent.agent_id,
            first_name: agent.agent_first_name,
            last_name: agent.agent_last_name,
            email: agent.agent_email,
            username: agent.agent_username,
            is_active: agent.agent_is_active,
          });
        }
      }

      res.json({ data: [...supervisorMap.values()] });
    } catch (err) {
      next(err);
    }
  },
);

// ═══════════════════════════════════════════════════════════════
//  SECTION 2 — CAMPAIGN–USER MAPPING
// ═══════════════════════════════════════════════════════════════

router.get(
  '/campaign-assignments/:campaignId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      const { rows: campaign } = await agnoPool.query(
        `SELECT id, name FROM campaigns WHERE id = $1 AND org_id = $2`,
        [req.params.campaignId, orgId],
      );
      if (!campaign[0]) throw new AppError(404, 'Campaign not found');

      const { rows } = await agnoPool.query(
        `SELECT
           cua.id            AS assignment_id,
           cua.campaign_id,
           u.id              AS user_id,
           u.first_name,
           u.last_name,
           u.email,
           u.role,
           u.is_active,
           cua.assigned_at,
           cua.assigned_by
         FROM campaign_user_assignments cua
         JOIN users u ON u.id = cua.user_id
         WHERE cua.campaign_id = $1
           AND u.org_id = $2
         ORDER BY u.role DESC, u.first_name`,
        [req.params.campaignId, orgId],
      );

      res.json({ campaign: campaign[0], data: rows });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  '/campaign-assignments/:campaignId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId, userId: assignedBy } = req.user!;
      const { user_ids } = req.body || {};

      if (!Array.isArray(user_ids) || user_ids.length === 0)
        throw new AppError(400, 'user_ids must be a non-empty array');

      const { rows: campaign } = await agnoPool.query(
        `SELECT id FROM campaigns WHERE id = $1 AND org_id = $2`,
        [req.params.campaignId, orgId],
      );
      if (!campaign[0]) throw new AppError(404, 'Campaign not found');

      const { rows: validUsers } = await agnoPool.query(
        `SELECT id FROM users
         WHERE id = ANY($1::uuid[]) AND org_id = $2 AND role IN ('agent', 'supervisor') AND is_active = true`,
        [user_ids, orgId],
      );
      if (validUsers.length !== user_ids.length)
        throw new AppError(400, 'One or more user_ids are invalid, inactive, or do not belong to this organisation');

      await withAgnoTransaction(async (client) => {
        for (const userId of user_ids) {
          await client.query(
            `INSERT INTO campaign_user_assignments (campaign_id, user_id, assigned_by)
             VALUES ($1, $2, $3) ON CONFLICT (campaign_id, user_id) DO NOTHING`,
            [req.params.campaignId, userId, assignedBy],
          );
        }
      });

      res.status(201).json({ message: 'Users assigned to campaign successfully' });
    } catch (err) {
      next(err);
    }
  },
);

router.put(
  '/campaign-assignments/:campaignId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId, userId: assignedBy } = req.user!;
      const { user_ids } = req.body || {};

      if (!Array.isArray(user_ids)) throw new AppError(400, 'user_ids must be an array');

      const { rows: campaign } = await agnoPool.query(
        `SELECT id FROM campaigns WHERE id = $1 AND org_id = $2`,
        [req.params.campaignId, orgId],
      );
      if (!campaign[0]) throw new AppError(404, 'Campaign not found');

      if (user_ids.length > 0) {
        const { rows: validUsers } = await agnoPool.query(
          `SELECT id FROM users
           WHERE id = ANY($1::uuid[]) AND org_id = $2 AND role IN ('agent', 'supervisor') AND is_active = true`,
          [user_ids, orgId],
        );
        if (validUsers.length !== user_ids.length)
          throw new AppError(400, 'One or more user_ids are invalid or inactive');
      }

      await withAgnoTransaction(async (client) => {
        await client.query(`DELETE FROM campaign_user_assignments WHERE campaign_id = $1`, [req.params.campaignId]);
        for (const userId of user_ids) {
          await client.query(
            `INSERT INTO campaign_user_assignments (campaign_id, user_id, assigned_by) VALUES ($1, $2, $3)`,
            [req.params.campaignId, userId, assignedBy],
          );
        }
      });

      res.json({ message: 'Campaign assignments updated successfully' });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/campaign-assignments/:campaignId/:userId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      const { rows: campaign } = await agnoPool.query(
        `SELECT id FROM campaigns WHERE id = $1 AND org_id = $2`,
        [req.params.campaignId, orgId],
      );
      if (!campaign[0]) throw new AppError(404, 'Campaign not found');

      const { rowCount } = await agnoPool.query(
        `DELETE FROM campaign_user_assignments WHERE campaign_id = $1 AND user_id = $2`,
        [req.params.campaignId, req.params.userId],
      );
      if (!rowCount || rowCount === 0) throw new AppError(404, 'Assignment not found');

      res.json({ message: 'User removed from campaign' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;