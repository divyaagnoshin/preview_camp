import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const DATA_TYPES = [
  'STRING',
  'LONG',
  'INTEGER',
  'FLOAT',
  'PHONE',
  'EMAIL',
  'TIMESTAMP',
  'BOOLEAN',
];
const FIELD_TYPES = ['predefined', 'custom'];

// GET /field-library — org rows + global rows (org_id IS NULL)
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM org_field_library
       WHERE org_id = $1 OR org_id IS NULL
       ORDER BY (org_id IS NULL) DESC, display_order ASC, name ASC`,
      [req.user!.orgId],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// POST /field-library — create org-scoped field
router.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        name,
        field_key,
        field_type,
        data_type,
        is_private,
        is_read_only_agent,
        is_masked_agent,
        is_masked_reports,
        display_order,
      } = req.body;
      if (!name || !field_key || !data_type)
        throw new AppError(400, 'name, field_key and data_type are required');
      if (!DATA_TYPES.includes(data_type))
        throw new AppError(
          400,
          `data_type must be one of: ${DATA_TYPES.join(', ')}`,
        );
      if (field_type && !FIELD_TYPES.includes(field_type))
        throw new AppError(
          400,
          `field_type must be one of: ${FIELD_TYPES.join(', ')}`,
        );

      const { rows } = await pool.query(
        `INSERT INTO org_field_library
        (org_id, name, field_key, field_type, data_type,
         is_private, is_read_only_agent, is_masked_agent, is_masked_reports,
         display_order, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
        [
          req.user!.orgId,
          name,
          field_key,
          field_type || 'custom',
          data_type,
          !!is_private,
          !!is_read_only_agent,
          !!is_masked_agent,
          !!is_masked_reports,
          display_order ?? 99,
          req.user!.userId,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err: any) {
      if (err.code === '23505')
        return next(
          new AppError(409, 'A field with this key already exists in this org'),
        );
      next(err);
    }
  },
);

// PATCH /field-library/:id — update own org rows only (globals are immutable)
router.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await pool.query(
        `SELECT * FROM org_field_library WHERE id = $1`,
        [req.params.id],
      );
      if (!existing.rows[0]) throw new AppError(404, 'Field not found');
      if (existing.rows[0].org_id === null)
        throw new AppError(403, 'Global predefined fields are immutable');
      if (existing.rows[0].org_id !== req.user!.orgId)
        throw new AppError(404, 'Field not found');

      const {
        name,
        field_key,
        field_type,
        data_type,
        is_private,
        is_read_only_agent,
        is_masked_agent,
        is_masked_reports,
        display_order,
      } = req.body;
      if (data_type && !DATA_TYPES.includes(data_type))
        throw new AppError(
          400,
          `data_type must be one of: ${DATA_TYPES.join(', ')}`,
        );
      if (field_type && !FIELD_TYPES.includes(field_type))
        throw new AppError(
          400,
          `field_type must be one of: ${FIELD_TYPES.join(', ')}`,
        );

      const { rows } = await pool.query(
        `UPDATE org_field_library SET
         name = COALESCE($1, name),
         field_key = COALESCE($2, field_key),
         field_type = COALESCE($3, field_type),
         data_type = COALESCE($4, data_type),
         is_private = COALESCE($5, is_private),
         is_read_only_agent = COALESCE($6, is_read_only_agent),
         is_masked_agent = COALESCE($7, is_masked_agent),
         is_masked_reports = COALESCE($8, is_masked_reports),
         display_order = COALESCE($9, display_order),
         updated_at = NOW()
       WHERE id = $10 AND org_id = $11
       RETURNING *`,
        [
          name ?? null,
          field_key ?? null,
          field_type ?? null,
          data_type ?? null,
          is_private ?? null,
          is_read_only_agent ?? null,
          is_masked_agent ?? null,
          is_masked_reports ?? null,
          display_order ?? null,
          req.params.id,
          req.user!.orgId,
        ],
      );
      res.json(rows[0]);
    } catch (err: any) {
      if (err.code === '23505')
        return next(
          new AppError(409, 'A field with this key already exists in this org'),
        );
      next(err);
    }
  },
);

// DELETE /field-library/:id — own org rows only
router.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const existing = await pool.query(
        `SELECT org_id FROM org_field_library WHERE id = $1`,
        [req.params.id],
      );
      if (!existing.rows[0]) throw new AppError(404, 'Field not found');
      if (existing.rows[0].org_id === null)
        throw new AppError(403, 'Global predefined fields cannot be deleted');
      if (existing.rows[0].org_id !== req.user!.orgId)
        throw new AppError(404, 'Field not found');

      await pool.query(
        `DELETE FROM org_field_library WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
