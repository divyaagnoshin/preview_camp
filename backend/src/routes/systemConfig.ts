import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

// Per-org platform configuration singleton. Powers the backend-injector
// cadence and the Time Guard window enforced by the schedule-template editor.
// A row is lazy-created on first read so newly-provisioned orgs always see
// the defaults declared in migration 027.

const router = Router();
router.use(authenticate);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];

function validateGuardWindows(input: unknown): Record<string, { start: string; end: string }> {
  if (input == null || typeof input !== 'object' || Array.isArray(input))
    throw new AppError(400, 'time_guard_windows must be an object');
  const out: Record<string, { start: string; end: string }> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!DAY_KEYS.includes(k))
      throw new AppError(400, `time_guard_windows key "${k}" is not 0-6`);
    if (!v || typeof v !== 'object')
      throw new AppError(400, `time_guard_windows[${k}] must be an object`);
    const { start, end } = v as { start?: string; end?: string };
    if (!start || !end || !HHMM.test(start) || !HHMM.test(end))
      throw new AppError(400, `time_guard_windows[${k}] start/end must be HH:MM`);
    if (start >= end)
      throw new AppError(400, `time_guard_windows[${k}] end must be after start`);
    out[k] = { start, end };
  }
  return out;
}

async function ensureRow(orgId: string) {
  const { rows } = await pool.query(
    `INSERT INTO system_config (org_id) VALUES ($1)
       ON CONFLICT (org_id) DO UPDATE SET org_id = EXCLUDED.org_id
       RETURNING *`,
    [orgId],
  );
  return rows[0];
}

// GET /v1/system-config — returns the caller-org's row (creates defaults
// on demand). Read access is open to any authenticated user so the
// Schedule Templates editor can enforce the Time Guard client-side.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await ensureRow(req.user!.orgId);
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// PATCH /v1/system-config — partial update. Only admin/supervisor/superadmin
// can mutate; agents only consume the values via the read path above.
router.patch(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await ensureRow(req.user!.orgId);

      const sets: string[] = [];
      const params: any[] = [];

      if ('inject_poll_minutes' in req.body) {
        const raw = req.body.inject_poll_minutes;
        const n = parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n < 1 || n > 1440)
          throw new AppError(400, 'inject_poll_minutes must be between 1 and 1440');
        params.push(n);
        sets.push(`inject_poll_minutes = $${params.length}`);
      }

      if ('time_guard_enabled' in req.body) {
        params.push(!!req.body.time_guard_enabled);
        sets.push(`time_guard_enabled = $${params.length}`);
      }

      if ('time_guard_windows' in req.body) {
        const cleaned = validateGuardWindows(req.body.time_guard_windows);
        params.push(JSON.stringify(cleaned));
        sets.push(`time_guard_windows = $${params.length}::jsonb`);
      }

            if ('recheck_interval' in req.body) {
        const raw = req.body.recheck_interval;
        const n = parseInt(String(raw), 10);
        if (!Number.isFinite(n) || n < 1)
          throw new AppError(400, 'recheck_interval must be a positive integer');
        params.push(n);
        sets.push(`recheck_interval = $${params.length}`);
      }

      if (!sets.length) throw new AppError(400, 'no updatable fields supplied');

      params.push(req.user!.orgId);
      const { rows } = await pool.query(
        `UPDATE system_config SET ${sets.join(', ')}, updated_at = NOW()
          WHERE org_id = $${params.length}
          RETURNING *`,
        params,
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
