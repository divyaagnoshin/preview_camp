import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ── Calendars ─────────────────────────────────────────────
// GET /v1/holiday-calendars — list with date count and campaign usage count.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT hc.id, hc.name, hc.country_code, hc.created_at,
              (SELECT COUNT(*)::int FROM holiday_dates hd WHERE hd.calendar_id = hc.id) AS holiday_count,
              (SELECT COUNT(*)::int FROM campaign_holiday_calendars chc WHERE chc.holiday_calendar_id = hc.id) AS campaign_usage_count
         FROM holiday_calendars hc
        WHERE hc.org_id = $1
        ORDER BY hc.created_at DESC`,
      [req.user!.orgId],
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, country_code, created_at
         FROM holiday_calendars WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.orgId],
    );
    if (!rows.length) throw new AppError(404, 'Calendar not found');
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.post('/', requireRole('admin', 'supervisor'), async (req, res, next) => {
  try {
    const { name, country_code } = req.body;
    if (!name || typeof name !== 'string')
      throw new AppError(400, 'name required');
    if (country_code && !/^[A-Za-z]{2}$/.test(country_code))
      throw new AppError(400, 'country_code must be 2 letters');
    const { rows } = await pool.query(
      `INSERT INTO holiday_calendars (org_id, name, country_code)
       VALUES ($1, $2, $3)
       RETURNING id, name, country_code, created_at`,
      [
        req.user!.orgId,
        name.trim(),
        country_code ? country_code.toUpperCase() : null,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const { name, country_code } = req.body;
      if (name !== undefined && (typeof name !== 'string' || !name.trim()))
        throw new AppError(400, 'name must be a non-empty string');
      if (
        country_code !== undefined &&
        country_code !== null &&
        !/^[A-Za-z]{2}$/.test(country_code)
      )
        throw new AppError(400, 'country_code must be 2 letters or null');
      const { rows } = await pool.query(
        `UPDATE holiday_calendars
          SET name = COALESCE($1, name),
              country_code = CASE WHEN $2::text = '__null__' THEN NULL
                                  WHEN $2 IS NULL THEN country_code
                                  ELSE UPPER($2) END
        WHERE id = $3 AND org_id = $4
        RETURNING id, name, country_code, created_at`,
        [
          name?.trim() ?? null,
          country_code === null ? '__null__' : (country_code ?? null),
          req.params.id,
          req.user!.orgId,
        ],
      );
      if (!rows.length) throw new AppError(404, 'Calendar not found');
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      const usage = await pool.query(
        `SELECT COUNT(*)::int AS n FROM campaign_holiday_calendars WHERE holiday_calendar_id = $1`,
        [req.params.id],
      );
      if (usage.rows[0].n > 0)
        throw new AppError(409, `In use by ${usage.rows[0].n} campaign(s)`);
      const { rowCount } = await pool.query(
        `DELETE FROM holiday_calendars WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!rowCount) throw new AppError(404, 'Calendar not found');
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

// ── Dates ─────────────────────────────────────────────────
async function assertCalendarOwned(calendarId: string, orgId: string) {
  const r = await pool.query(
    `SELECT 1 FROM holiday_calendars WHERE id = $1 AND org_id = $2`,
    [calendarId, orgId],
  );
  if (!r.rowCount) throw new AppError(404, 'Calendar not found');
}

router.get('/:id/dates', async (req, res, next) => {
  try {
    await assertCalendarOwned(req.params.id, req.user!.orgId);
    const year = req.query.year ? parseInt(String(req.query.year), 10) : null;
    const params: any[] = [req.params.id];
    let where = `calendar_id = $1`;
    if (year && !Number.isNaN(year)) {
      params.push(year);
      where += ` AND EXTRACT(YEAR FROM holiday_date) = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, calendar_id,
              to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date,
              holiday_name, is_full_day_block, block_start, block_end
         FROM holiday_dates WHERE ${where}
        ORDER BY holiday_date ASC, block_start ASC NULLS FIRST`,
      params,
    );
    res.json({ data: rows });
  } catch (e) {
    next(e);
  }
});

router.post(
  '/:id/dates',
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      await assertCalendarOwned(req.params.id, req.user!.orgId);
      const {
        holiday_date,
        holiday_name,
        is_full_day_block = true,
        block_start,
        block_end,
      } = req.body;
      if (!holiday_date) throw new AppError(400, 'holiday_date required');
      if (!is_full_day_block && (!block_start || !block_end))
        throw new AppError(
          400,
          'block_start and block_end required when not a full-day block',
        );
      const { rows } = await pool.query(
        `INSERT INTO holiday_dates
         (calendar_id, holiday_date, holiday_name, is_full_day_block, block_start, block_end)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, calendar_id,
                 to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date,
                 holiday_name, is_full_day_block, block_start, block_end`,
        [
          req.params.id,
          holiday_date,
          holiday_name || null,
          !!is_full_day_block,
          is_full_day_block ? null : block_start,
          is_full_day_block ? null : block_end,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.patch(
  '/:id/dates/:dateId',
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      await assertCalendarOwned(req.params.id, req.user!.orgId);
      const {
        holiday_date,
        holiday_name,
        is_full_day_block,
        block_start,
        block_end,
      } = req.body;
      const fullDay =
        is_full_day_block === undefined ? null : !!is_full_day_block;
      const { rows } = await pool.query(
        `UPDATE holiday_dates
          SET holiday_date      = COALESCE($1::date, holiday_date),
              holiday_name      = COALESCE($2::text, holiday_name),
              is_full_day_block = COALESCE($3::boolean, is_full_day_block),
              block_start       = CASE WHEN $3::boolean IS TRUE THEN NULL
                                       WHEN $4::time IS NOT NULL THEN $4::time
                                       ELSE block_start END,
              block_end         = CASE WHEN $3::boolean IS TRUE THEN NULL
                                       WHEN $5::time IS NOT NULL THEN $5::time
                                       ELSE block_end END
        WHERE id = $6 AND calendar_id = $7
        RETURNING id, calendar_id,
                  to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date,
                  holiday_name, is_full_day_block, block_start, block_end`,
        [
          holiday_date || null,
          holiday_name ?? null,
          fullDay,
          block_start || null,
          block_end || null,
          req.params.dateId,
          req.params.id,
        ],
      );
      if (!rows.length) throw new AppError(404, 'Holiday not found');
      res.json(rows[0]);
    } catch (e) {
      next(e);
    }
  },
);

router.delete(
  '/:id/dates/:dateId',
  requireRole('admin', 'supervisor'),
  async (req, res, next) => {
    try {
      await assertCalendarOwned(req.params.id, req.user!.orgId);
      const { rowCount } = await pool.query(
        `DELETE FROM holiday_dates WHERE id = $1 AND calendar_id = $2`,
        [req.params.dateId, req.params.id],
      );
      if (!rowCount) throw new AppError(404, 'Holiday not found');
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

export default router;
