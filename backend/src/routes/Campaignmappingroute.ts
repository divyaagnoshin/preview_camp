/**
 * campaignMapping.ts  —  Campaign ↔ Agent Mapping Routes
 *
 * Uses the ACTUAL table: public.campaign_agent_mapping
 *   columns: id, campaign_id (varchar), agent_userid (varchar),
 *            company_id (int), created_date, created_by
 *
 * Mount in index.ts:
 *   import campaignMappingRouter from './routes/campaignMapping';
 *   app.use('/v1/campaign-mapping', campaignMappingRouter);
 */

import { Router, Request, Response, NextFunction } from 'express';
import agnoPool from '../db/agnoPool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// GET /v1/campaign-mapping
// Return all (campaign_id, agent_userid) rows joined with users
// ─────────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await agnoPool.query(
        `SELECT
            cam.id               AS mapping_id,
            cam.campaign_id,
            cam.agent_userid     AS user_id,
            cam.company_id,
            cam.created_date,

            u.first_name,
            u.last_name,
            u.email_id           AS email,

            CASE
              WHEN u.role_id = 2 THEN 'supervisor'
              ELSE 'agent'
            END AS role,

            CASE
              WHEN LOWER(u.status) = 'active' THEN true
              ELSE false
            END AS is_active

         FROM campaign_agent_mapping cam

         LEFT JOIN user_details u
            ON u.userid = cam.agent_userid

         ORDER BY cam.campaign_id, u.first_name`,
      );

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/campaign-mapping/agents
// Return all org users eligible for campaign assignment.
// ─────────────────────────────────────────────────────────────
router.get(
  '/agents',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await agnoPool.query(
        `SELECT
            u.userid        AS id,
            u.first_name,
            u.last_name,
            u.email_id      AS email,
            CASE
              WHEN u.role_id = 2 THEN 'supervisor'
              ELSE 'agent'
            END             AS role,
            CASE
              WHEN LOWER(u.status) = 'active' THEN true
              ELSE false
            END             AS is_active
         FROM user_details u
         ORDER BY u.first_name`,
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/campaign-mapping/by-campaign/:campaignId
// All agents assigned to ONE specific campaign.
// ─────────────────────────────────────────────────────────────
router.get(
  '/by-campaign/:campaignId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // ✅ FIX: Added WHERE cam.campaign_id = $1 — was missing before,
      //         causing the route to return ALL mappings instead of
      //         only the ones for the selected campaign.
      const { rows } = await agnoPool.query(
        `SELECT
            cam.id               AS mapping_id,
            cam.campaign_id,
            cam.agent_userid     AS user_id,
            cam.company_id,
            cam.created_date,

            u.first_name,
            u.last_name,
            u.email_id           AS email,

            CASE
              WHEN u.role_id = 2 THEN 'supervisor'
              ELSE 'agent'
            END AS role,

            CASE
              WHEN LOWER(u.status) = 'active' THEN true
              ELSE false
            END AS is_active

         FROM campaign_agent_mapping cam

         LEFT JOIN user_details u
            ON u.userid = cam.agent_userid

         WHERE cam.campaign_id = $1

         ORDER BY u.first_name`,
        [req.params.campaignId],
      );

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/campaign-mapping/by-agent/:agentId
// All campaigns a given agent is assigned to.
// ─────────────────────────────────────────────────────────────
router.get(
  '/by-agent/:agentId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await agnoPool.query(
        `SELECT
           cam.id           AS mapping_id,
           cam.campaign_id,
           cam.agent_userid AS user_id,
           cam.created_date
         FROM campaign_agent_mapping cam
         WHERE cam.agent_userid = $1
         ORDER BY cam.campaign_id`,
        [req.params.agentId],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PUT /v1/campaign-mapping/sync-campaign/:campaignId
// Full replace: set exactly which agents are in this campaign.
// Admin only.
//
// Body: { agent_userids: string[] }   (empty array = remove all)
// ─────────────────────────────────────────────────────────────
router.put(
  '/sync-campaign/:campaignId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agent_userids } = req.body || {};

      if (!Array.isArray(agent_userids))
        throw new AppError(400, 'agent_userids must be an array');

      const createdBy   = req.user!.userId;
      const campaignId  = req.params.campaignId;

      // Delete all existing rows for this campaign, then re-insert
      await agnoPool.query(
        `DELETE FROM campaign_agent_mapping WHERE campaign_id = $1`,
        [campaignId],
      );

      for (const userId of agent_userids) {
        await agnoPool.query(
          `INSERT INTO campaign_agent_mapping
             (campaign_id, agent_userid, created_by)
           VALUES ($1, $2, $3)`,
          [campaignId, userId, createdBy],
        );
      }

      res.json({
        message: `Campaign assignments synced — ${agent_userids.length} agent(s) assigned`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /v1/campaign-mapping
// Assign one agent to one or more campaigns (or vice-versa).
// Admin only.
//
// Body: { agent_userid: string, campaign_ids: string[] }
// ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agent_userid, campaign_ids } = req.body || {};

      if (!agent_userid || typeof agent_userid !== 'string')
        throw new AppError(400, 'agent_userid is required');
      if (!Array.isArray(campaign_ids) || campaign_ids.length === 0)
        throw new AppError(400, 'campaign_ids must be a non-empty array');

      const createdBy = req.user!.userId;

      let inserted = 0;
      for (const cId of campaign_ids) {
        const result = await agnoPool.query(
          `INSERT INTO campaign_agent_mapping
             (campaign_id, agent_userid, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (campaign_id, agent_userid) DO NOTHING`,
          [cId, agent_userid, createdBy],
        );
        inserted += result.rowCount ?? 0;
      }

      res.status(201).json({
        message: `${inserted} assignment(s) created (duplicates skipped)`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PUT /v1/campaign-mapping/sync-agent/:agentId
// Full replace: set exactly which campaigns this agent is in.
// Admin only.
//
// Body: { campaign_ids: string[] }   (empty array = remove all)
// ─────────────────────────────────────────────────────────────
router.put(
  '/sync-agent/:agentId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { campaign_ids } = req.body || {};

      if (!Array.isArray(campaign_ids))
        throw new AppError(400, 'campaign_ids must be an array');

      const createdBy = req.user!.userId;

      await agnoPool.query(
        `DELETE FROM campaign_agent_mapping WHERE agent_userid = $1`,
        [req.params.agentId],
      );

      for (const cId of campaign_ids) {
        await agnoPool.query(
          `INSERT INTO campaign_agent_mapping
             (campaign_id, agent_userid, created_by)
           VALUES ($1, $2, $3)`,
          [cId, req.params.agentId, createdBy],
        );
      }

      res.json({
        message: `Agent assignments synced — ${campaign_ids.length} campaign(s) assigned`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /v1/campaign-mapping/:mappingId
// Remove a single mapping row by its PK. Admin only.
// ─────────────────────────────────────────────────────────────
router.delete(
  '/:mappingId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await agnoPool.query(
        `DELETE FROM campaign_agent_mapping WHERE id = $1`,
        [req.params.mappingId],
      );

      if (!rowCount || rowCount === 0)
        throw new AppError(404, 'Mapping not found');

      res.json({ message: 'Mapping removed' });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /v1/campaign-mapping/by-pair/:campaignId/:agentId
// Remove by (campaign_id, agent_userid) pair. Admin only.
// ─────────────────────────────────────────────────────────────
router.delete(
  '/by-pair/:campaignId/:agentId',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await agnoPool.query(
        `DELETE FROM campaign_agent_mapping
         WHERE campaign_id = $1 AND agent_userid = $2`,
        [req.params.campaignId, req.params.agentId],
      );

      if (!rowCount || rowCount === 0)
        throw new AppError(404, 'Mapping not found');

      res.json({ message: 'Mapping removed' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;