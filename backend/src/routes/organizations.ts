import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import pool, { withTransaction } from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { seedSystemDispositionsForOrg } from '../db/seedSystemDispositions';

// Superadmin-only routes — manage tenant organizations and seed the first
// admin user for each. All endpoints require the platform-level role.
const router = Router();
router.use(authenticate, requireRole('superadmin'));

// GET /v1/organizations — list every org with its admin count.
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT o.id, o.name, o.description, o.created_at, o.updated_at,
              COUNT(u.id) FILTER (WHERE u.role = 'admin')::int AS admin_count,
              COUNT(u.id)::int AS user_count
       FROM organizations o
       LEFT JOIN users u ON u.org_id = o.id
       WHERE o.name <> 'System'
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /v1/organizations — create a new tenant organization.
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim())
      throw new AppError(400, 'name required');
    if (name.trim().toLowerCase() === 'system')
      throw new AppError(400, 'name "System" is reserved');

    const { rows } = await pool.query(
      `INSERT INTO organizations (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at, updated_at`,
      [name.trim(), description || null],
    );
    // Populate the canonical org-wide system dispositions so admins land
    // on Manage Dispositions with a usable starting set instead of an
    // empty Available pane.
    await seedSystemDispositionsForOrg(rows[0].id).catch((err) => {
      console.error('seedSystemDispositionsForOrg on org create failed:', err);
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /v1/organizations/:id — rename / update description.
router.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body || {};
      if (name !== undefined && (typeof name !== 'string' || !name.trim()))
        throw new AppError(400, 'name must be a non-empty string');
      if (name && name.trim().toLowerCase() === 'system')
        throw new AppError(400, 'name "System" is reserved');

      const cur = await pool.query(
        `SELECT name FROM organizations WHERE id = $1`,
        [req.params.id],
      );
      if (!cur.rows[0]) throw new AppError(404, 'Organization not found');
      if (cur.rows[0].name === 'System')
        throw new AppError(400, 'System organization cannot be modified');

      const { rows } = await pool.query(
        `UPDATE organizations
         SET name = COALESCE($1, name),
             description = COALESCE($2, description),
             updated_at = NOW()
         WHERE id = $3
         RETURNING id, name, description, created_at, updated_at`,
        [
          name ? name.trim() : null,
          description !== undefined ? description : null,
          req.params.id,
        ],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v1/organizations/:id — remove tenant. Blocks if dependent records
// (users, campaigns, contact lists, etc.) exist; superadmin must clear those
// out first because nothing in the schema is set to ON DELETE CASCADE off the
// organizations table.
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cur = await pool.query(
        `SELECT name FROM organizations WHERE id = $1`,
        [req.params.id],
      );
      if (!cur.rows[0]) throw new AppError(404, 'Organization not found');
      if (cur.rows[0].name === 'System')
        throw new AppError(400, 'System organization cannot be deleted');

      const { rows: dep } = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM users              WHERE org_id = $1) AS users,
           (SELECT COUNT(*)::int FROM contact_lists      WHERE org_id = $1) AS contact_lists,
           (SELECT COUNT(*)::int FROM campaigns          WHERE org_id = $1) AS campaigns,
           (SELECT COUNT(*)::int FROM dnc_groups         WHERE org_id = $1) AS dnc_groups,
           (SELECT COUNT(*)::int FROM holiday_calendars  WHERE org_id = $1) AS holiday_calendars,
           (SELECT COUNT(*)::int FROM schedule_templates WHERE org_id = $1) AS schedule_templates`,
        [req.params.id],
      );
      const d = dep[0];
      const blockers = Object.entries(d).filter(([_, v]) => (v as number) > 0);
      if (blockers.length) {
        throw new AppError(
          409,
          `Cannot delete: organization still has ${blockers
            .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
            .join(', ')}`,
        );
      }

      await pool.query(`DELETE FROM organizations WHERE id = $1`, [
        req.params.id,
      ]);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/organizations/:id — single organization detail (with counts).
router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT o.id, o.name, o.description, o.created_at, o.updated_at,
                COUNT(u.id) FILTER (WHERE u.role = 'admin')::int      AS admin_count,
                COUNT(u.id) FILTER (WHERE u.role = 'supervisor')::int AS supervisor_count,
                COUNT(u.id) FILTER (WHERE u.role = 'agent')::int      AS agent_count,
                COUNT(u.id)::int                                       AS user_count
         FROM organizations o
         LEFT JOIN users u ON u.org_id = o.id
         WHERE o.id = $1
         GROUP BY o.id`,
        [req.params.id],
      );
      if (!rows[0]) throw new AppError(404, 'Organization not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/organizations/:id/users — list every user in an organization.
router.get(
  '/:id/users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
         FROM users
         WHERE org_id = $1
         ORDER BY role, first_name`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// POST /v1/organizations/:id/users — create any user (admin/supervisor/agent)
// inside the target org. Superadmin uses this from the org-detail page so
// that the new user's org_id is always the explicitly-selected organization.
router.post(
  '/:id/users',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, first_name, last_name, role } = req.body || {};
      if (!email || !password || !first_name || !last_name)
        throw new AppError(
          400,
          'email, password, first_name, last_name required',
        );
      if (typeof password !== 'string' || password.length < 8)
        throw new AppError(400, 'password must be at least 8 characters');
      const finalRole =
        role && ['admin', 'supervisor', 'agent'].includes(role)
          ? role
          : 'agent';

      const orgRes = await pool.query(
        `SELECT id, name FROM organizations WHERE id = $1`,
        [req.params.id],
      );
      if (!orgRes.rows[0]) throw new AppError(404, 'Organization not found');
      if (orgRes.rows[0].name === 'System')
        throw new AppError(400, 'Cannot create user under System org');

      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users
           (org_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        [
          req.params.id,
          String(email).toLowerCase().trim(),
          hash,
          first_name,
          last_name,
          finalRole,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH /v1/organizations/:id/users/:userId — superadmin edits a user inside
// the target org. Supports rename, role change, and active-toggle. Email and
// password aren't editable here (email is the natural key; password changes
// flow through self-service reset).
router.patch(
  '/:id/users/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { first_name, last_name, role, is_active } = req.body || {};
      if (
        role !== undefined &&
        !['admin', 'supervisor', 'agent'].includes(role)
      )
        throw new AppError(400, 'invalid role');
      const { rows } = await pool.query(
        `UPDATE users SET
           first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
         WHERE id = $5 AND org_id = $6
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        [
          first_name || null,
          last_name || null,
          role || null,
          is_active === undefined ? null : is_active,
          req.params.userId,
          req.params.id,
        ],
      );
      if (!rows[0]) throw new AppError(404, 'User not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v1/organizations/:id/users/:userId — superadmin removes a user
// from the target org. Falls back to deactivation when historical FK
// dependencies prevent a hard delete.
router.delete(
  '/:id/users/:userId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: target } = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND org_id = $2`,
        [req.params.userId, req.params.id],
      );
      if (!target[0]) throw new AppError(404, 'User not found');

      try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [
          req.params.userId,
        ]);
        res.status(204).send();
      } catch (e: any) {
        if (e?.code === '23503') {
          await pool.query(
            `UPDATE users SET is_active = false, updated_at = NOW()
             WHERE id = $1`,
            [req.params.userId],
          );
          res.json({
            id: req.params.userId,
            deactivated: true,
            reason:
              'User has historical activity and was deactivated instead of deleted',
          });
          return;
        }
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// GET /v1/organizations/:id/admins — list admin users for an organization.
router.get(
  '/:id/admins',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
         FROM users
         WHERE org_id = $1 AND role = 'admin'
         ORDER BY created_at DESC`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// POST /v1/organizations/:id/admins — provision an admin user for the org.
router.post(
  '/:id/admins',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, first_name, last_name } = req.body || {};
      if (!email || !password || !first_name || !last_name)
        throw new AppError(
          400,
          'email, password, first_name, last_name required',
        );
      if (typeof password !== 'string' || password.length < 8)
        throw new AppError(400, 'password must be at least 8 characters');

      const orgRes = await pool.query(
        `SELECT id, name FROM organizations WHERE id = $1`,
        [req.params.id],
      );
      if (!orgRes.rows[0]) throw new AppError(404, 'Organization not found');
      if (orgRes.rows[0].name === 'System')
        throw new AppError(400, 'Cannot create admin under System org');

      const result = await withTransaction(async (client) => {
        const hash = await bcrypt.hash(password, 10);
        const { rows } = await client.query(
          `INSERT INTO users
             (org_id, email, password_hash, first_name, last_name, role)
           VALUES ($1, $2, $3, $4, $5, 'admin')
           RETURNING id, email, first_name, last_name, role, org_id, created_at`,
          [
            req.params.id,
            String(email).toLowerCase().trim(),
            hash,
            first_name,
            last_name,
          ],
        );
        return rows[0];
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
