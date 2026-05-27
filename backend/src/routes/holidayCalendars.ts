import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ── Calendars ─────────────────────────────────────────────
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
    console.log("Error Message ", e);
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

/**
 * Checks whether the proposed date entry conflicts with existing entries
 * on the same calendar_id + holiday_date.
 *
 * Rules:
 *  - Only one full-day block allowed per date (conflicts with everything).
 *  - Multiple time-range blocks allowed per date, but they must not overlap.
 *  - A full-day block cannot coexist with any time-range block on the same date.
 *
 * Pass excludeDateId on PATCH so the row being updated is not compared
 * against itself.
 */
async function assertNoDateConflict(
  calendarId: string,
  holidayDate: string,
  isFullDay: boolean,
  blockStart: string | null,
  blockEnd: string | null,
  excludeDateId?: string,
) {
  const params: any[] = [calendarId, holidayDate];
  const excludeClause = excludeDateId
    ? `AND id <> $${params.push(excludeDateId)}`
    : '';

  const { rows } = await pool.query(
    `SELECT id, is_full_day_block,
            -- cast to text to guarantee HH:MM:SS string, not a JS Date
            to_char(block_start, 'HH24:MI:SS') AS block_start,
            to_char(block_end,   'HH24:MI:SS') AS block_end
       FROM holiday_dates
      WHERE calendar_id = $1
        AND holiday_date = $2::date
        ${excludeClause}`,
    params,
  );

  for (const row of rows) {
    if (isFullDay) {
      // A new full-day block conflicts with anything already on that date.
      if (row.is_full_day_block) {
        throw new AppError(409, 'A full-day block already exists for this date');
      }
      throw new AppError(
        409,
        'Time-range blocks already exist for this date — remove them before adding a full-day block',
      );
    } else {
      // A new time-range block conflicts with an existing full-day block.
      if (row.is_full_day_block) {
        throw new AppError(
          409,
          'A full-day block already exists for this date — remove it before adding a time-range block',
        );
      }
      // Overlap check: two intervals overlap when startA < endB AND endA > startB.
      if (blockStart && blockEnd && row.block_start && row.block_end) {
        // Normalise to HH:MM for safe string comparison.
        const start = blockStart.slice(0, 5);
        const end   = blockEnd.slice(0, 5);
        const rs    = String(row.block_start).slice(0, 5);
        const re    = String(row.block_end).slice(0, 5);
        if (start < re && end > rs) {
          throw new AppError(
            409,
            `Time range overlaps with an existing block (${rs}–${re})`,
          );
        }
      }
    }
  }
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

      await assertNoDateConflict(
        req.params.id,
        holiday_date,
        !!is_full_day_block,
        is_full_day_block ? null : block_start,
        is_full_day_block ? null : block_end,
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
      console.log("Error Message "+e);
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

      const fullDay         = !!is_full_day_block;
      const finalBlockStart = fullDay ? null : (block_start ?? null);
      const finalBlockEnd   = fullDay ? null : (block_end ?? null);

      // Only run conflict check when date-related fields are being changed.
      if (
        holiday_date      !== undefined ||
        is_full_day_block !== undefined ||
        block_start       !== undefined ||
        block_end         !== undefined
      ) {
        // Fetch the current row to fill in any fields not supplied in the request.
        const cur = await pool.query(
          `SELECT to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date,
                  is_full_day_block,
                  to_char(block_start, 'HH24:MI:SS') AS block_start,
                  to_char(block_end,   'HH24:MI:SS') AS block_end
             FROM holiday_dates
            WHERE id = $1 AND calendar_id = $2`,
          [req.params.dateId, req.params.id],
        );
        if (!cur.rows.length) throw new AppError(404, 'Holiday not found');
        const existing = cur.rows[0];

        const checkDate    = holiday_date ?? existing.holiday_date;
        const checkFullDay =
          is_full_day_block !== undefined ? fullDay : existing.is_full_day_block;
        const checkStart   = checkFullDay ? null : (block_start ?? existing.block_start);
        const checkEnd     = checkFullDay ? null : (block_end   ?? existing.block_end);

        await assertNoDateConflict(
          req.params.id,
          checkDate,
          checkFullDay,
          checkStart,
          checkEnd,
          req.params.dateId, // exclude self from conflict check
        );
      }

      // FIX: use a sentinel only for holiday_name so that passing null
      // explicitly clears it, while omitting the field leaves it unchanged.
      const nameProvided = holiday_name !== undefined;

      const { rows } = await pool.query(
        `UPDATE holiday_dates
            SET holiday_date      = COALESCE($1::date, holiday_date),
                holiday_name      = CASE WHEN $6 THEN $2::text ELSE holiday_name END,
                is_full_day_block = $3,
                block_start       = $4,
                block_end         = $5
          WHERE id = $7
            AND calendar_id = $8
          RETURNING id, calendar_id,
                    to_char(holiday_date, 'YYYY-MM-DD') AS holiday_date,
                    holiday_name, is_full_day_block, block_start, block_end`,
        [
          holiday_date || null,    // $1
          holiday_name || null,    // $2 — empty string or null both clear the field
          fullDay,                 // $3
          finalBlockStart,         // $4
          finalBlockEnd,           // $5
          nameProvided,            // $6 — boolean flag: should we update holiday_name?
          req.params.dateId,       // $7
          req.params.id,           // $8
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