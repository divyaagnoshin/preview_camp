import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import pool, { withTransaction } from '../db/pool';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

// ── M3: DNC ──────────────────────────────────────────────────────────
export const dncRouter = Router();
dncRouter.use(authenticate);

// Groups roll up list_count + total number_count from the nested lists.
dncRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT dg.*,
              COUNT(DISTINCT dl.id)::int AS list_count,
              COUNT(DISTINCT dn.id)::int AS number_count,
              COALESCE(
                ARRAY_AGG(DISTINCT cdg.campaign_id)
                  FILTER (WHERE cdg.campaign_id IS NOT NULL),
                '{}'
              ) AS campaign_ids,
              COALESCE(
                ARRAY_AGG(DISTINCT c.name)
                  FILTER (WHERE c.name IS NOT NULL),
                '{}'
              ) AS campaign_names
       FROM dnc_groups dg
       LEFT JOIN dnc_lists dl ON dl.dnc_group_id = dg.id
       LEFT JOIN dnc_numbers dn ON dn.dnc_group_id = dg.id
       LEFT JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dg.id
       LEFT JOIN campaigns c ON c.id = cdg.campaign_id
       WHERE dg.org_id = $1
       GROUP BY dg.id
       ORDER BY dg.created_at DESC`,
      [req.user!.orgId],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

dncRouter.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, campaign_id, campaign_ids } = req.body;
      if (!name) throw new AppError(400, 'name required');
      // Source no longer lives on the group — it is set per-list. campaign_id
      // stays accepted for backward compat; campaign_ids replaces it.
      const linkIds: string[] = Array.isArray(campaign_ids)
        ? campaign_ids.filter(Boolean)
        : campaign_id
          ? [campaign_id]
          : [];

      const row = await withTransaction(async (client) => {
        if (linkIds.length) {
          const owners = await client.query(
            'SELECT id FROM campaigns WHERE id = ANY($1::uuid[]) AND org_id=$2',
            [linkIds, req.user!.orgId],
          );
          if (owners.rowCount !== linkIds.length)
            throw new AppError(404, 'one or more campaigns not found');
        }
        const { rows } = await client.query(
          `INSERT INTO dnc_groups (org_id, name, description, created_by)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.user!.orgId, name, description, req.user!.userId],
        );
        for (const cid of linkIds) {
          await client.query(
            `INSERT INTO campaign_dnc_groups (campaign_id, dnc_group_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [cid, rows[0].id],
          );
        }
        return rows[0];
      });
      res.status(201).json(row);
    } catch (err) {
      next(err);
    }
  },
);

// Lists inside a group. number_count is rolled up for each list.
dncRouter.get(
  '/:id/lists',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = await pool.query(
        'SELECT id FROM dnc_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'dnc group not found');
      const { rows } = await pool.query(
        `SELECT dl.*, COUNT(dn.id)::int AS number_count
           FROM dnc_lists dl
           LEFT JOIN dnc_numbers dn ON dn.dnc_list_id = dl.id
          WHERE dl.dnc_group_id = $1
          GROUP BY dl.id
          ORDER BY dl.created_at DESC`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

dncRouter.post(
  '/:id/lists',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, source = 'manual' } = req.body;
      if (!name) throw new AppError(400, 'name required');
      const owner = await pool.query(
        'SELECT id FROM dnc_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'dnc group not found');
      try {
        const { rows } = await pool.query(
          `INSERT INTO dnc_lists (dnc_group_id, name, source, created_by)
           VALUES ($1,$2,$3,$4) RETURNING *`,
          [req.params.id, name, source, req.user!.userId],
        );
        res.status(201).json(rows[0]);
      } catch (e: any) {
        if (e?.code === '23505')
          throw new AppError(409, 'A list with that name already exists');
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// Edit a DNC group. name/description are always patchable; campaign_ids
// (when provided) replaces the campaign_dnc_groups linkage. Pass
// campaign_ids:[] to clear the linkage. Source no longer lives here.
dncRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description, campaign_ids } = req.body;
      const updated = await withTransaction(async (client) => {
        const owner = await client.query(
          'SELECT id FROM dnc_groups WHERE id=$1 AND org_id=$2',
          [req.params.id, req.user!.orgId],
        );
        if (!owner.rowCount) throw new AppError(404, 'dnc group not found');

        const sets: string[] = [];
        const vals: any[] = [];
        let i = 1;
        if (typeof name === 'string') {
          sets.push(`name=$${i++}`);
          vals.push(name);
        }
        if (typeof description === 'string' || description === null) {
          sets.push(`description=$${i++}`);
          vals.push(description);
        }
        if (Array.isArray(campaign_ids)) {
          const linkIds: string[] = campaign_ids.filter(Boolean);
          if (linkIds.length) {
            const owners = await client.query(
              'SELECT id FROM campaigns WHERE id = ANY($1::uuid[]) AND org_id=$2',
              [linkIds, req.user!.orgId],
            );
            if (owners.rowCount !== linkIds.length)
              throw new AppError(404, 'one or more campaigns not found');
          }
          await client.query(
            'DELETE FROM campaign_dnc_groups WHERE dnc_group_id=$1',
            [req.params.id],
          );
          for (const cid of linkIds) {
            await client.query(
              `INSERT INTO campaign_dnc_groups (campaign_id, dnc_group_id)
               VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [cid, req.params.id],
            );
          }
        }
        if (!sets.length) {
          const cur = await client.query(
            'SELECT * FROM dnc_groups WHERE id=$1',
            [req.params.id],
          );
          return cur.rows[0];
        }
        sets.push(`updated_at=NOW()`);
        vals.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE dnc_groups SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
          vals,
        );
        return rows[0];
      });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

// Delete a DNC group. dnc_numbers cascades; campaigns.dnc_group_id is set to
// NULL by FK. Junction rows in campaign_dnc_groups are removed manually since
// that side has no ON DELETE clause.
dncRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await withTransaction(async (client) => {
        const owner = await client.query(
          'SELECT id FROM dnc_groups WHERE id=$1 AND org_id=$2',
          [req.params.id, req.user!.orgId],
        );
        if (!owner.rowCount) throw new AppError(404, 'dnc group not found');
        await client.query(
          'DELETE FROM campaign_dnc_groups WHERE dnc_group_id=$1',
          [req.params.id],
        );
        await client.query('DELETE FROM dnc_groups WHERE id=$1', [
          req.params.id,
        ]);
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── DNC LISTS ─────────────────────────────────────────────────────────
// Mounted at /v1/dnc-lists. Each list belongs to exactly one dnc_group; the
// group's org_id is verified on every call.
export const dncListsRouter = Router();
dncListsRouter.use(authenticate);

async function loadList(listId: string, orgId: string) {
  const { rows } = await pool.query(
    `SELECT dl.*, dg.org_id AS group_org_id
       FROM dnc_lists dl
       JOIN dnc_groups dg ON dg.id = dl.dnc_group_id
      WHERE dl.id = $1`,
    [listId],
  );
  if (!rows[0] || rows[0].group_org_id !== orgId)
    throw new AppError(404, 'dnc list not found');
  return rows[0];
}

dncListsRouter.get(
  '/:id/numbers',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await loadList(req.params.id, req.user!.orgId);
      const { rows } = await pool.query(
        `SELECT * FROM dnc_numbers
          WHERE dnc_list_id = $1
          ORDER BY added_at DESC`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

dncListsRouter.post(
  '/:id/numbers',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { numbers } = req.body;
      if (!Array.isArray(numbers) || !numbers.length)
        throw new AppError(400, 'numbers array required');
      if (numbers.length > 1000)
        throw new AppError(400, 'Max 1000 numbers per call');
      const list = await loadList(req.params.id, req.user!.orgId);

      let added = 0,
        duplicates = 0,
        failed = 0;
      const phones: string[] = [];
      const duplicatePhones: string[] = [];
      for (const n of numbers) {
        try {
          const result = await pool.query(
            `INSERT INTO dnc_numbers
               (dnc_list_id, dnc_group_id, phone_number, added_reason, added_by, notes)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
            [
              list.id,
              list.dnc_group_id,
              n.phone_number,
              n.added_reason,
              req.user!.userId,
              n.notes,
            ],
          );
          if ((result.rowCount ?? 0) > 0) {
            added++;
            if (n.phone_number) phones.push(n.phone_number);
          } else {
            duplicates++;
            if (n.phone_number) duplicatePhones.push(n.phone_number);
          }
        } catch {
          failed++;
        }
      }

      // Propagate to campaign_contact_status: for every campaign linked to
      // the list's parent group, flip any active CCS row whose contact phone
      // matches one of the just-added numbers to status='dnc'.
      let ccs_updated = 0;
      if (phones.length) {
        const { rowCount } = await pool.query(
          `UPDATE campaign_contact_status ccs
              SET status = 'dnc', updated_at = NOW()
             FROM contacts c, campaign_jobs cj
            WHERE ccs.contact_id = c.id
              AND ccs.job_id = cj.id
              AND cj.campaign_id IN (
                SELECT campaign_id FROM campaign_dnc_groups
                 WHERE dnc_group_id = $1
              )
              AND c.phone_number = ANY($2::text[])
              AND ccs.status NOT IN ('completed', 'dnc')`,
          [list.dnc_group_id, phones],
        );
        ccs_updated = rowCount ?? 0;
      }
      res.json({
        added,
        duplicates,
        failed,
        ccs_updated,
        duplicate_phones: duplicatePhones,
      });
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v1/dnc-lists/:id/numbers
// Deletes ALL numbers from a DNC list (list shell is preserved).
// Mirrors deleteAllContacts on the contact-list side.
dncListsRouter.delete(
  '/:id/numbers',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await loadList(req.params.id, req.user!.orgId);
      const { rowCount } = await pool.query(
        'DELETE FROM dnc_numbers WHERE dnc_list_id = $1',
        [list.id],
      );
      // Refresh cached counts on the parent group
      res.json({ deleted: rowCount ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);
 
// POST /v1/dnc-lists/:id/numbers/bulk-delete
// Deletes a specific set of DNC number IDs from this list.
// Mirrors deleteContactsBulk on the contact-list side.
dncListsRouter.post(
  '/:id/numbers/bulk-delete',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await loadList(req.params.id, req.user!.orgId);
      const ids: string[] = Array.isArray(req.body?.ids)
        ? req.body.ids.filter(Boolean)
        : [];
      if (!ids.length) throw new AppError(400, 'ids array required');
      if (ids.length > 1000) throw new AppError(400, 'Max 1000 ids per call');
 
      // Only delete numbers that actually belong to this list (security check)
      const { rowCount } = await pool.query(
        'DELETE FROM dnc_numbers WHERE id = ANY($1::uuid[]) AND dnc_list_id = $2',
        [ids, list.id],
      );
      res.json({ deleted: rowCount ?? 0 });
    } catch (err) {
      next(err);
    }
  },
);

dncListsRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, source } = req.body;
      await loadList(req.params.id, req.user!.orgId);
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (typeof name === 'string') {
        sets.push(`name=$${i++}`);
        vals.push(name);
      }
      if (typeof source === 'string') {
        sets.push(`source=$${i++}`);
        vals.push(source);
      }
      if (!sets.length) {
        const { rows } = await pool.query(
          'SELECT * FROM dnc_lists WHERE id=$1',
          [req.params.id],
        );
        return res.json(rows[0]);
      }
      sets.push(`updated_at=NOW()`);
      vals.push(req.params.id);
      try {
        const { rows } = await pool.query(
          `UPDATE dnc_lists SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`,
          vals,
        );
        res.json(rows[0]);
      } catch (e: any) {
        if (e?.code === '23505')
          throw new AppError(409, 'A list with that name already exists');
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

dncListsRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await loadList(req.params.id, req.user!.orgId);
      await pool.query('DELETE FROM dnc_lists WHERE id=$1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── DNC NUMBERS ───────────────────────────────────────────────────────
// Mounted at /v1/dnc-numbers. Edit (phone/reason/notes) + delete-by-id
// endpoints used by the list-detail view in the UI.
export const dncNumbersRouter = Router();
dncNumbersRouter.use(authenticate);

dncNumbersRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: existing } = await pool.query(
        `SELECT dn.id
           FROM dnc_numbers dn
           JOIN dnc_groups dg ON dg.id = dn.dnc_group_id
          WHERE dn.id = $1 AND dg.org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!existing[0]) throw new AppError(404, 'dnc number not found');

      const { phone_number, added_reason, notes } = req.body || {};
      const { rows } = await pool.query(
        `UPDATE dnc_numbers SET
           phone_number = COALESCE($1, phone_number),
           added_reason = COALESCE($2, added_reason),
           notes = COALESCE($3, notes)
         WHERE id = $4
         RETURNING *`,
        [
          phone_number ?? null,
          added_reason ?? null,
          notes ?? null,
          req.params.id,
        ],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

dncNumbersRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT dn.id
           FROM dnc_numbers dn
           JOIN dnc_groups dg ON dg.id = dn.dnc_group_id
          WHERE dn.id = $1 AND dg.org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!rows[0]) throw new AppError(404, 'dnc number not found');
      await pool.query('DELETE FROM dnc_numbers WHERE id=$1', [req.params.id]);
      res.json({ removed: true });
    } catch (err) {
      next(err);
    }
  },
);

// ── M4: SCHEDULE TEMPLATES ────────────────────────────────────────────
export const scheduleRouter = Router();
scheduleRouter.use(authenticate);

scheduleRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM schedule_templates WHERE org_id=$1 ORDER BY name',
        [req.user!.orgId],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

scheduleRouter.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, timezone = 'UTC', windows = [] } = req.body;
      if (!name) throw new AppError(400, 'name required');
      // Multiple windows per weekday are allowed; only reject when two
      // windows on the same day overlap in time (ambiguous dial eligibility).
      if (Array.isArray(windows) && windows.length) {
        const byDay = new Map<number, { start: string; end: string }[]>();
        for (const w of windows) {
          if (!w.start_time || !w.end_time)
            throw new AppError(400, 'start_time and end_time required');
          if (w.start_time >= w.end_time)
            throw new AppError(400, 'end_time must be after start_time');
          await assertWithinTimeGuard(req.user!.orgId, w.day_of_week, w.start_time, w.end_time);
          const list = byDay.get(w.day_of_week) || [];
          for (const ex of list) {
            if (w.start_time < ex.end && w.end_time > ex.start)
              throw new AppError(
                400,
                `Overlapping windows for day ${w.day_of_week}: ${ex.start}-${ex.end} and ${w.start_time}-${w.end_time}.`,
              );
          }
          list.push({ start: w.start_time, end: w.end_time });
          byDay.set(w.day_of_week, list);
        }
      }

      const { rows } = await pool.query(
        `INSERT INTO schedule_templates (org_id, name, timezone, created_by)
       VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.user!.orgId, name, timezone, req.user!.userId],
      );
      const tmpl = rows[0];

      for (const w of windows) {
        await pool.query(
          `INSERT INTO schedule_windows (schedule_template_id, day_of_week, start_time, end_time)
         VALUES ($1,$2,$3,$4)`,
          [tmpl.id, w.day_of_week, w.start_time, w.end_time],
        );
      }
      const winRows = await pool.query(
        'SELECT * FROM schedule_windows WHERE schedule_template_id=$1 ORDER BY day_of_week',
        [tmpl.id],
      );
      res.status(201).json({ ...tmpl, windows: winRows.rows });
    } catch (err) {
      next(err);
    }
  },
);

scheduleRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM schedule_templates WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!rows[0]) throw new AppError(404, 'Template not found');
      const windows = await pool.query(
        'SELECT * FROM schedule_windows WHERE schedule_template_id=$1 ORDER BY day_of_week',
        [req.params.id],
      );
      const using = await pool.query(
        'SELECT COUNT(*)::int FROM campaign_schedule_templates WHERE schedule_template_id=$1',
        [req.params.id],
      );
      res.json({
        ...rows[0],
        windows: windows.rows,
        campaigns_using: using.rows[0].count,
      });
    } catch (err) {
      next(err);
    }
  },
);

// Confirms the template belongs to the caller's org before any window mutation.
async function assertTemplateOwned(id: string, orgId: string) {
  const r = await pool.query(
    'SELECT 1 FROM schedule_templates WHERE id=$1 AND org_id=$2',
    [id, orgId],
  );
  if (!r.rowCount) throw new AppError(404, 'Template not found');
}

// Time Guard — restricts each schedule_window to the org-wide permitted
// hours configured in system_config.time_guard_windows. Days absent from
// the JSONB blob are blocked entirely when the guard is on. HH:MM:SS time
// values from the DB are sliced to HH:MM so string comparison stays
// lexicographic-safe against the JSONB "HH:MM" entries.
async function assertWithinTimeGuard(orgId: string, dayOfWeek: number, start: string, end: string) {
  const { rows } = await pool.query(
    `SELECT time_guard_enabled, time_guard_windows FROM system_config WHERE org_id = $1`,
    [orgId],
  );
  const cfg = rows[0];
  if (!cfg || !cfg.time_guard_enabled) return;
  const allowed = cfg.time_guard_windows?.[String(dayOfWeek)];
  if (!allowed)
    throw new AppError(
      409,
      `Time Guard blocks new windows on day ${dayOfWeek}. Enable this day in System Configuration first.`,
    );
  const s = String(start).slice(0, 5);
  const e = String(end).slice(0, 5);
  const aStart = String(allowed.start).slice(0, 5);
  const aEnd = String(allowed.end).slice(0, 5);
  if (s < aStart || e > aEnd)
    throw new AppError(
      409,
      `Time Guard for day ${dayOfWeek} allows only ${aStart}–${aEnd}. Adjust the slot or update System Configuration.`,
    );
}

scheduleRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, timezone } = req.body;
      if (name !== undefined && (typeof name !== 'string' || !name.trim()))
        throw new AppError(400, 'name must be a non-empty string');
      const { rows } = await pool.query(
        `UPDATE schedule_templates
          SET name = COALESCE($1, name),
              timezone = COALESCE($2, timezone)
        WHERE id=$3 AND org_id=$4
        RETURNING *`,
        [
          name?.trim() ?? null,
          timezone ?? null,
          req.params.id,
          req.user!.orgId,
        ],
      );
      if (!rows[0]) throw new AppError(404, 'Template not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

scheduleRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const usage = await pool.query(
        'SELECT COUNT(*)::int AS n FROM campaign_schedule_templates WHERE schedule_template_id=$1',
        [req.params.id],
      );
      if (usage.rows[0].n > 0)
        throw new AppError(409, `In use by ${usage.rows[0].n} campaign(s)`);
      const { rowCount } = await pool.query(
        'DELETE FROM schedule_templates WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!rowCount) throw new AppError(404, 'Template not found');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── Schedule windows (day-wise time blocks) ───────────────
scheduleRouter.post(
  '/:id/windows',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertTemplateOwned(req.params.id, req.user!.orgId);
      const { day_of_week, start_time, end_time } = req.body;
      if (day_of_week === undefined || day_of_week < 0 || day_of_week > 6)
        throw new AppError(400, 'day_of_week must be 0-6');
      if (!start_time || !end_time)
        throw new AppError(400, 'start_time and end_time required');
      if (start_time >= end_time)
        throw new AppError(400, 'end_time must be after start_time');
      await assertWithinTimeGuard(req.user!.orgId, day_of_week, start_time, end_time);
      // Multiple windows per weekday are allowed; reject only when the new
      // slot's time range overlaps an existing window on the same day.
      const overlap = await pool.query(
        `SELECT start_time, end_time FROM schedule_windows
          WHERE schedule_template_id = $1
            AND day_of_week = $2
            AND start_time < $4::time
            AND end_time   > $3::time
          LIMIT 1`,
        [req.params.id, day_of_week, start_time, end_time],
      );
      if (overlap.rowCount)
        throw new AppError(
          409,
          `New window overlaps an existing slot on this day (${overlap.rows[0].start_time}–${overlap.rows[0].end_time}).`,
        );
      const { rows } = await pool.query(
        `INSERT INTO schedule_windows (schedule_template_id, day_of_week, start_time, end_time)
       VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, day_of_week, start_time, end_time],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

scheduleRouter.patch(
  '/:id/windows/:winId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertTemplateOwned(req.params.id, req.user!.orgId);
      const { day_of_week, start_time, end_time } = req.body;
      if (day_of_week !== undefined && (day_of_week < 0 || day_of_week > 6))
        throw new AppError(400, 'day_of_week must be 0-6');
      // Resolve the final (day, start, end) by merging the patch against
      // current row state, then reject only when the resulting time range
      // overlaps a sibling window on the same day.
      if (day_of_week !== undefined || start_time !== undefined || end_time !== undefined) {
        const cur = await pool.query(
          `SELECT day_of_week, start_time, end_time FROM schedule_windows
            WHERE id=$1 AND schedule_template_id=$2`,
          [req.params.winId, req.params.id],
        );
        if (!cur.rowCount) throw new AppError(404, 'Window not found');
        const finalDay   = day_of_week ?? cur.rows[0].day_of_week;
        const finalStart = start_time  ?? cur.rows[0].start_time;
        const finalEnd   = end_time    ?? cur.rows[0].end_time;
        if (finalStart >= finalEnd)
          throw new AppError(400, 'end_time must be after start_time');
        await assertWithinTimeGuard(req.user!.orgId, finalDay, finalStart, finalEnd);
        const overlap = await pool.query(
          `SELECT start_time, end_time FROM schedule_windows
            WHERE schedule_template_id = $1
              AND day_of_week = $2
              AND id <> $3
              AND start_time < $5::time
              AND end_time   > $4::time
            LIMIT 1`,
          [req.params.id, finalDay, req.params.winId, finalStart, finalEnd],
        );
        if (overlap.rowCount)
          throw new AppError(
            409,
            `Window overlaps an existing slot on this day (${overlap.rows[0].start_time}–${overlap.rows[0].end_time}).`,
          );
      }
      const { rows } = await pool.query(
        `UPDATE schedule_windows
          SET day_of_week = COALESCE($1, day_of_week),
              start_time  = COALESCE($2::time, start_time),
              end_time    = COALESCE($3::time, end_time)
        WHERE id=$4 AND schedule_template_id=$5
        RETURNING *`,
        [
          day_of_week ?? null,
          start_time ?? null,
          end_time ?? null,
          req.params.winId,
          req.params.id,
        ],
      );
      if (!rows[0]) throw new AppError(404, 'Window not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

scheduleRouter.delete(
  '/:id/windows/:winId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await assertTemplateOwned(req.params.id, req.user!.orgId);
      const { rowCount } = await pool.query(
        'DELETE FROM schedule_windows WHERE id=$1 AND schedule_template_id=$2',
        [req.params.winId, req.params.id],
      );
      if (!rowCount) throw new AppError(404, 'Window not found');
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── TIMEZONES (catalog used by schedule-template editor) ─────────────
// Backed by the `timezones` table; auto-seeded on backend startup from
// Intl.supportedValuesOf('timeZone'). Returns plain strings so the picker
// component can keep its filter logic simple.
export const timezonesRouter = Router();
timezonesRouter.use(authenticate);

timezonesRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = String(req.query.q || '')
        .toLowerCase()
        .trim();
      const sql = q
        ? `SELECT name FROM timezones WHERE LOWER(name) LIKE $1 ORDER BY name LIMIT 100`
        : `SELECT name FROM timezones ORDER BY name`;
      const params = q ? [`%${q}%`] : [];
      const { rows } = await pool.query(sql, params);
      res.json({ data: rows.map((r: any) => r.name) });
    } catch (err) {
      next(err);
    }
  },
);

// ── M5: JOBS ──────────────────────────────────────────────────────────
export const jobsRouter = Router();
jobsRouter.use(authenticate);

jobsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { campaign_id, status } = req.query;
    const params: any[] = [req.user!.orgId];
    let where = 'WHERE c.org_id = $1';
    if (campaign_id) {
      params.push(campaign_id);
      where += ` AND cj.campaign_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND cj.status = $${params.length}`;
    }

    const { rows } = await pool.query(
      `SELECT cj.*, c.name as campaign_name, c.schedule_type
       FROM campaign_jobs cj JOIN campaigns c ON c.id = cj.campaign_id
       ${where} ORDER BY cj.start_time DESC`,
      params,
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

jobsRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT cj.*, c.name as campaign_name, c.schedule_type, c.agent_priority_enabled
       FROM campaign_jobs cj JOIN campaigns c ON c.id = cj.campaign_id
       WHERE cj.id=$1 AND c.org_id=$2`,
        [req.params.id, req.user!.orgId],
      );
      if (!rows[0]) throw new AppError(404, 'Job not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

jobsRouter.get(
  '/:id/contacts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status, assigned_agent_id } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(
        parseInt(req.query.per_page as string) || 50,
        200,
      );
      const offset = (page - 1) * perPage;

      const params: any[] = [req.params.id];
      let where = 'WHERE ccs.job_id = $1';
      if (status) {
        params.push(status);
        where += ` AND ccs.status = $${params.length}`;
      }
      if (assigned_agent_id) {
        params.push(assigned_agent_id);
        where += ` AND ccs.assigned_agent_id = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT ccs.*, c.phone_number, c.first_name, c.last_name,
              u.first_name || ' ' || u.last_name AS assigned_agent_name
       FROM campaign_contact_status ccs
       JOIN contacts c ON c.id = ccs.contact_id
       LEFT JOIN users u ON u.id = ccs.assigned_agent_id
       ${where}
       ORDER BY ccs.priority ASC, ccs.next_attempt_at ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, perPage, offset],
      );
      const total = await pool.query(
        `SELECT COUNT(*)::int FROM campaign_contact_status ccs ${where}`,
        params,
      );
      res.json({
        data: rows,
        total: total.rows[0].count,
        page,
        per_page: perPage,
      });
    } catch (err) {
      next(err);
    }
  },
);

jobsRouter.patch(
  '/:id/contacts/:ccsId',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { assigned_agent_id, priority } = req.body;
      const { rows: check } = await pool.query(
        `SELECT status FROM campaign_contact_status WHERE id=$1 AND job_id=$2`,
        [req.params.ccsId, req.params.id],
      );
      if (!check[0]) throw new AppError(404, 'CCS row not found');
      if (check[0].status === 'with_agent')
        throw new AppError(
          409,
          'Contact is with_agent — cannot reassign mid-call',
        );

      const { rows } = await pool.query(
        `UPDATE campaign_contact_status SET
         assigned_agent_id = CASE WHEN $1::text = 'null' THEN NULL ELSE COALESCE($1::uuid, assigned_agent_id) END,
         priority = COALESCE($2, priority),
         updated_at = NOW()
       WHERE id=$3 RETURNING *`,
        [
          assigned_agent_id !== undefined ? assigned_agent_id || 'null' : null,
          priority,
          req.params.ccsId,
        ],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

jobsRouter.get(
  '/:id/stats',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: jobRows } = await pool.query(
        `SELECT cj.*, c.name as campaign_name FROM campaign_jobs cj
       JOIN campaigns c ON c.id=cj.campaign_id
       WHERE cj.id=$1 AND c.org_id=$2`,
        [req.params.id, req.user!.orgId],
      );
      if (!jobRows[0]) throw new AppError(404, 'Job not found');

      const { rows: statRows } = await pool.query(
        `SELECT status, COUNT(*)::int FROM campaign_contact_status
       WHERE job_id=$1 GROUP BY status`,
        [req.params.id],
      );
      const byStatus: Record<string, number> = {};
      for (const s of statRows) byStatus[s.status] = s.count;

      const { rows: agentRows } = await pool
        .query(
          `SELECT u.id, u.first_name||' '||u.last_name as agent_name,
              COUNT(*) FILTER (WHERE ccs.status='with_agent')::int as with_agent_count,
              COUNT(*) FILTER (WHERE ccs.status='completed')::int as completed_count
       FROM campaign_contact_status ccs
       JOIN users u ON u.id = ccs.locked_by_session::text::uuid
       WHERE ccs.job_id=$1 GROUP BY u.id, u.first_name, u.last_name`,
          [req.params.id],
        )
        .catch(() => ({ rows: [] }));

      res.json({
        job_id: req.params.id,
        campaign_name: jobRows[0].campaign_name,
        status: jobRows[0].status,
        prcnt_complete: jobRows[0].prcnt_complete,
        by_status: {
          queued: byStatus['queued'] || 0,
          with_agent: byStatus['with_agent'] || 0,
          completed: byStatus['completed'] || 0,
          exhausted: byStatus['exhausted'] || 0,
          dnc: byStatus['dnc'] || 0,
        },
        by_agent: agentRows,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── M7: DISPOSITION CODES ─────────────────────────────────────────────
export const dispositionRouter = Router();
dispositionRouter.use(authenticate);

dispositionRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { campaign_id, capability, type } = req.query;
      const params: any[] = [];
      let where = '';
      if (campaign_id) {
        params.push(campaign_id);
        where += `${where ? ' AND ' : 'WHERE '}(dc.campaign_id IS NULL OR dc.campaign_id = $${params.length})`;
      }
      if (capability) {
        params.push(capability);
        where += `${where ? ' AND ' : 'WHERE '}dc.capability = $${params.length}`;
      }
      if (type === 'system' || type === 'custom') {
        params.push(type);
        where += `${where ? ' AND ' : 'WHERE '}dc.type = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT * FROM disposition_codes dc ${where} ORDER BY dc.display_order`,
        params,
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

dispositionRouter.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        code,
        label,
        capability,
        retry_delay_min,
        notes_required,
        campaign_id,
      } = req.body;
      if (!code || !label || !capability)
        throw new AppError(400, 'code, label, capability required');
      if (!['CLOSED', 'NEXT_ATTEMPT', 'RESCHEDULE'].includes(capability))
        throw new AppError(
          400,
          'capability must be CLOSED | NEXT_ATTEMPT | RESCHEDULE',
        );
      if (capability === 'NEXT_ATTEMPT' && !retry_delay_min)
        throw new AppError(400, 'retry_delay_min required for NEXT_ATTEMPT');

      const { rows } = await pool.query(
        `INSERT INTO disposition_codes
         (org_id, campaign_id, code, label, capability, retry_delay_min, notes_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          req.user!.orgId,
          campaign_id || null,
          code.toUpperCase(),
          label,
          capability,
          retry_delay_min || null,
          notes_required || false,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// PATCH/DELETE are restricted to custom codes (disposition_group_id IS NOT
// NULL). System codes — the seeded org-wide entries with both campaign_id
// and disposition_group_id NULL — are immutable through the API.
dispositionRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows: existing } = await pool.query(
        `SELECT id, type FROM disposition_codes WHERE id = $1`,
        [req.params.id],
      );
      if (!existing[0]) throw new AppError(404, 'disposition code not found');
      if (existing[0].type === 'system')
        throw new AppError(409, 'system disposition codes cannot be edited');

      const { label, capability, retry_delay_min, notes_required, display_order } =
        req.body || {};
      if (capability && !['CLOSED', 'NEXT_ATTEMPT', 'RESCHEDULE'].includes(capability))
        throw new AppError(400, 'capability must be CLOSED | NEXT_ATTEMPT | RESCHEDULE');
      if (capability === 'NEXT_ATTEMPT' && retry_delay_min == null)
        throw new AppError(400, 'retry_delay_min required for NEXT_ATTEMPT');

      const { rows } = await pool.query(
        `UPDATE disposition_codes SET
           label           = COALESCE($1, label),
           capability      = COALESCE($2, capability),
           retry_delay_min = $3,
           notes_required  = COALESCE($4, notes_required),
           display_order   = COALESCE($5, display_order)
         WHERE id = $6 RETURNING *`,
        [
          label ?? null,
          capability ?? null,
          retry_delay_min ?? null,
          notes_required ?? null,
          display_order ?? null,
          req.params.id,
        ],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

dispositionRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, type FROM disposition_codes WHERE id = $1`,
        [req.params.id],
      );
      if (!rows[0]) throw new AppError(404, 'disposition code not found');
      if (rows[0].type === 'system')
        throw new AppError(409, 'system disposition codes cannot be deleted');
      await pool.query('DELETE FROM disposition_codes WHERE id=$1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// ── M7b: DISPOSITION GROUPS ───────────────────────────────────────────
// Mounted at /v1/disposition-groups. Each group is an admin-managed bucket
// of custom disposition_codes (disposition_group_id = group.id). The
// seeded org-wide system codes (disposition_group_id IS NULL AND
// campaign_id IS NULL) are surfaced read-only inside every group view.
export const dispositionGroupsRouter = Router();
dispositionGroupsRouter.use(authenticate);

dispositionGroupsRouter.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT dg.*,
                COUNT(dgc.disposition_code_id)::int AS custom_code_count
           FROM disposition_groups dg
           LEFT JOIN disposition_group_codes dgc
             ON dgc.disposition_group_id = dg.id
          GROUP BY dg.id
          ORDER BY dg.created_at DESC`,
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

dispositionGroupsRouter.post(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body || {};
      if (!name) throw new AppError(400, 'name required');
      
      // No transaction needed since it's just one insert now
      const { rows } = await pool.query(
        `INSERT INTO disposition_groups (org_id, name, description, created_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.user!.orgId, name, description || null, req.user!.userId],
      );
      
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);


dispositionGroupsRouter.patch(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'disposition group not found');
      const { name, description } = req.body || {};
      const { rows } = await pool.query(
        `UPDATE disposition_groups SET
           name        = COALESCE($1, name),
           description = COALESCE($2, description),
           updated_at  = NOW()
         WHERE id = $3 RETURNING *`,
        [name ?? null, description ?? null, req.params.id],
      );
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

dispositionGroupsRouter.delete(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'disposition group not found');
      await pool.query('DELETE FROM disposition_groups WHERE id=$1', [req.params.id]);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

// Codes attached to this group via disposition_group_codes. The junction is
// the sole source of truth — system codes only appear here if a user has
// explicitly added them. `is_system` is still returned so the backend can
// gate edit/delete on the row's underlying type.
dispositionGroupsRouter.get(
  '/:id/codes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const exists = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1',
        [req.params.id],
      );
      if (!exists.rowCount) throw new AppError(404, 'disposition group not found');
      const { rows } = await pool.query(
        `SELECT dc.*,
                (dc.type = 'system') AS is_system
           FROM disposition_codes dc
           JOIN disposition_group_codes dgc ON dgc.disposition_code_id = dc.id
          WHERE dgc.disposition_group_id = $1
            AND dc.campaign_id IS NULL
          ORDER BY dc.display_order, dc.code`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// Codes that exist in this org but are NOT yet attached to this group.
// Drives the "Available" pane on the Manage Dispositions screen. Returns
// both system and custom codes — the UI treats them uniformly.
dispositionGroupsRouter.get(
  '/:id/codes/available',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const exists = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!exists.rowCount) throw new AppError(404, 'disposition group not found');
      const { rows } = await pool.query(
        `SELECT dc.*,
                (dc.type = 'system') AS is_system
           FROM disposition_codes dc
          WHERE dc.campaign_id IS NULL
            AND dc.id NOT IN (
              SELECT disposition_code_id FROM disposition_group_codes
               WHERE disposition_group_id = $1
            )
          ORDER BY dc.display_order, dc.code`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// Create a new custom disposition (org-wide) and attach it to this group.
// disposition_group_id stays NULL on the code row — membership lives in the
// junction so the same code can later be added to other groups.
dispositionGroupsRouter.post(
  '/:id/codes',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'disposition group not found');
      const { code, label, capability, retry_delay_min, notes_required, display_order } =
        req.body || {};
      if (!code || !label || !capability)
        throw new AppError(400, 'code, label, capability required');
      if (!['CLOSED', 'NEXT_ATTEMPT', 'RESCHEDULE'].includes(capability))
        throw new AppError(400, 'capability must be CLOSED | NEXT_ATTEMPT | RESCHEDULE');
      if (capability === 'NEXT_ATTEMPT' && retry_delay_min == null)
        throw new AppError(400, 'retry_delay_min required for NEXT_ATTEMPT');

      const created = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO disposition_codes
             (org_id, campaign_id, disposition_group_id, type, code, label,
              capability, retry_delay_min, notes_required, display_order)
           VALUES ($1, NULL, NULL, 'custom', $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            req.user!.orgId,
            String(code).toUpperCase(),
            label,
            capability,
            retry_delay_min ?? null,
            notes_required ?? false,
            display_order ?? 99,
          ],
        );
        await client.query(
          `INSERT INTO disposition_group_codes (disposition_group_id, disposition_code_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [req.params.id, rows[0].id],
        );
        return rows[0];
      });
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

// Bulk replace the code attachments for this group. `disposition_code_ids`
// is the full desired list. Accepts both system and custom codes — the
// junction is the sole source of truth for which codes a group exposes.
dispositionGroupsRouter.put(
  '/:id/codes',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owner = await pool.query(
        'SELECT id FROM disposition_groups WHERE id=$1 AND org_id=$2',
        [req.params.id, req.user!.orgId],
      );
      if (!owner.rowCount) throw new AppError(404, 'disposition group not found');
      const ids: string[] = Array.isArray(req.body?.disposition_code_ids)
        ? req.body.disposition_code_ids.filter(Boolean)
        : [];

      await withTransaction(async (client) => {
        if (ids.length) {
          const valid = await client.query(
            `SELECT id FROM disposition_codes
              WHERE id = ANY($1::uuid[])
                AND campaign_id IS NULL`,
            [ids],
          );
          if (valid.rowCount !== ids.length)
            throw new AppError(404, 'one or more disposition codes not found');
        }
        await client.query(
          'DELETE FROM disposition_group_codes WHERE disposition_group_id=$1',
          [req.params.id],
        );
        for (const cid of ids) {
          await client.query(
            `INSERT INTO disposition_group_codes (disposition_group_id, disposition_code_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [req.params.id, cid],
          );
        }
      });
      res.json({ ok: true, count: ids.length });
    } catch (err) {
      next(err);
    }
  },
);

// ── M8: REPORTS ───────────────────────────────────────────────────────
export const reportsRouter = Router();
reportsRouter.use(authenticate);

reportsRouter.get(
  '/campaign/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // One campaign → one campaign_jobs row. Pull it regardless of status
      // (active / stopped / completed) so the dashboard keeps showing stats
      // after a Stop instead of going blank.
      const { rows: campRows } = await pool.query(
        `SELECT c.*, (
           SELECT cj.id FROM campaign_jobs cj
            WHERE cj.campaign_id = c.id
            ORDER BY cj.job_run_number DESC
            LIMIT 1
         ) AS job_id
         FROM campaigns c
         WHERE c.id=$1 AND c.org_id=$2`,
        [req.params.id, req.user!.orgId],
      );
      if (!campRows[0]) throw new AppError(404, 'Campaign not found');
      const jobId = req.query.job_id || campRows[0].job_id;

      // total_contacts is the raw count across attached lists, duplicates
      // included. successful_contacts comes from CCS (= unique phones that
      // actually got queued by the DISTINCT-ON dedup in /campaigns/:id/run).
      // duplicate_contacts is the difference — phones collapsed because the
      // same number appeared in multiple lists for this campaign.
      const { rows: totals } = await pool.query(
        `SELECT COUNT(c.id)::int AS total_contacts
           FROM contacts c
           JOIN campaign_contact_lists ccl
             ON ccl.contact_list_id = c.contact_list_id
          WHERE ccl.campaign_id = $1`,
        [req.params.id],
      );

      const { rows: stats } = await pool.query(
        `SELECT
         COUNT(*)::int AS successful_contacts,
         COUNT(*) FILTER (WHERE ci.dialed_at IS NOT NULL)::int AS attempted,
         COUNT(*) FILTER (WHERE ci.call_status='connected')::int AS connected,
         COUNT(*) FILTER (WHERE ccs.status IN ('completed','dnc','exhausted'))::int AS completed_total,
         COUNT(*) FILTER (WHERE ccs.status='dnc')::int AS dnc,
         ROUND(AVG(ci.preview_duration_sec))::int AS avg_preview_duration_sec,
         ROUND(AVG(ci.talk_time_sec))::int AS avg_talk_time_sec,
         ROUND(AVG(ci.wrapup_duration_sec))::int AS avg_wrapup_duration_sec,
         ROUND(AVG(ci.total_handling_sec))::int AS avg_total_handling_sec
       FROM campaign_contact_status ccs
       LEFT JOIN contact_interactions ci ON ci.contact_id=ccs.contact_id AND ci.job_id=ccs.job_id
       WHERE ccs.job_id=$1`,
        [jobId],
      );

      const { rows: dispositions } = await pool.query(
        `SELECT dc.code, dc.label, COUNT(*)::int as count
       FROM contact_interactions ci
       JOIN disposition_codes dc ON dc.id=ci.disposition_code_id
       WHERE ci.job_id=$1 GROUP BY dc.code, dc.label ORDER BY count DESC`,
        [jobId],
      );

      const totalContacts = totals[0]?.total_contacts ?? 0;
      const successfulContacts = stats[0]?.successful_contacts ?? 0;
      const duplicateContacts = Math.max(
        0,
        totalContacts - successfulContacts,
      );

      res.json({
        campaign_id: req.params.id,
        job_id: jobId,
        total_contacts: totalContacts,
        successful_contacts: successfulContacts,
        duplicate_contacts: duplicateContacts,
        attempted: stats[0]?.attempted ?? 0,
        connected: stats[0]?.connected ?? 0,
        completed_total: stats[0]?.completed_total ?? 0,
        dnc: stats[0]?.dnc ?? 0,
        avg_preview_duration_sec: stats[0]?.avg_preview_duration_sec ?? 0,
        avg_talk_time_sec: stats[0]?.avg_talk_time_sec ?? 0,
        avg_wrapup_duration_sec: stats[0]?.avg_wrapup_duration_sec ?? 0,
        avg_total_handling_sec: stats[0]?.avg_total_handling_sec ?? 0,
        dispositions,
      });
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  '/agent/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { from, to } = req.query;
      const params: any[] = [req.params.id];
      let where = 'WHERE ci.agent_id=$1';
      if (from) {
        params.push(from);
        where += ` AND ci.given_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        where += ` AND ci.given_at <= $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT
         COUNT(*)::int AS total_offered,
         COUNT(*) FILTER (WHERE preview_action='rejected')::int AS rejected,
         COUNT(*) FILTER (WHERE preview_action='accepted')::int AS accepted,
         COUNT(*) FILTER (WHERE call_status='connected')::int AS connected,
         ROUND(AVG(preview_duration_sec))::int AS avg_preview_duration_sec,
         ROUND(AVG(talk_time_sec))::int AS avg_talk_time_sec,
         ROUND(AVG(wrapup_duration_sec))::int AS avg_wrapup_duration_sec
       FROM contact_interactions ci ${where}`,
        params,
      );
      const { rows: agentInfo } = await pool.query(
        'SELECT id, first_name, last_name, email FROM users WHERE id=$1',
        [req.params.id],
      );
      res.json({ ...agentInfo[0], ...rows[0] });
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  '/interactions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        job_id,
        agent_id,
        from,
        to,
        preview_action,
        call_status,
        disposition_capability,
      } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(
        parseInt(req.query.per_page as string) || 100,
        500,
      );
      const offset = (page - 1) * perPage;

      const params: any[] = [req.user!.orgId];
      let where = `WHERE c.org_id = $1`;
      if (job_id) {
        params.push(job_id);
        where += ` AND ci.job_id=$${params.length}`;
      }
      if (agent_id) {
        params.push(agent_id);
        where += ` AND ci.agent_id=$${params.length}`;
      }
      if (from) {
        params.push(from);
        where += ` AND ci.given_at>=$${params.length}`;
      }
      if (to) {
        params.push(to);
        where += ` AND ci.given_at<=$${params.length}`;
      }
      if (preview_action) {
        params.push(preview_action);
        where += ` AND ci.preview_action=$${params.length}`;
      }
      if (call_status) {
        params.push(call_status);
        where += ` AND ci.call_status=$${params.length}`;
      }
      if (disposition_capability) {
        params.push(disposition_capability);
        where += ` AND ci.disposition_capability=$${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT ci.*, ct.phone_number, ct.first_name, ct.last_name,
              u.first_name||' '||u.last_name AS agent_name,
              dc.code AS disposition_code_label
       FROM contact_interactions ci
       JOIN contacts ct ON ct.id=ci.contact_id
       JOIN campaigns c ON c.id=(SELECT campaign_id FROM campaign_jobs WHERE id=ci.job_id)
       JOIN users u ON u.id=ci.agent_id
       LEFT JOIN disposition_codes dc ON dc.id=ci.disposition_code_id
       ${where}
       ORDER BY ci.given_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, perPage, offset],
      );
      const total = await pool.query(
        `SELECT COUNT(*)::int FROM contact_interactions ci
       JOIN contacts ct ON ct.id=ci.contact_id
       JOIN campaigns c ON c.id=(SELECT campaign_id FROM campaign_jobs WHERE id=ci.job_id)
       ${where}`,
        params,
      );
      res.json({
        data: rows,
        total: total.rows[0].count,
        page,
        per_page: perPage,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ── AGENTS ────────────────────────────────────────────────
export const agentsRouter = Router();
agentsRouter.use(authenticate);

agentsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, email, first_name, last_name, role, is_active, created_at
       FROM users WHERE org_id=$1 ORDER BY role, first_name`,
        [req.user!.orgId],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// POST /v1/agents — admin-only. Creates a new agent user under the caller's
// organization. Email is normalised; password is hashed with bcrypt.
agentsRouter.post(
  '/',
  requireRole('admin'),
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
        role && ['agent', 'supervisor', 'admin'].includes(role)
          ? role
          : 'agent';

      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `INSERT INTO users
           (org_id, email, password_hash, first_name, last_name, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        [
          req.user!.orgId,
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

// PATCH /v1/agents/:id — admin-only. Toggle active status or rename. Limited
// to users in the caller's org.
agentsRouter.patch(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { is_active, first_name, last_name } = req.body || {};
      const { rows } = await pool.query(
        `UPDATE users SET
           is_active = COALESCE($1, is_active),
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           updated_at = NOW()
         WHERE id = $4 AND org_id = $5
         RETURNING id, email, first_name, last_name, role, is_active, created_at`,
        [
          is_active === undefined ? null : is_active,
          first_name || null,
          last_name || null,
          req.params.id,
          req.user!.orgId,
        ],
      );
      if (!rows[0]) throw new AppError(404, 'Agent not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /v1/agents/:id — admin-only. Removes a user from the caller's org.
// Self-delete is forbidden so an admin can't accidentally lock themselves
// out. Hard-deletes the row when no FK dependencies block it; otherwise
// falls back to deactivation so historical interactions remain queryable.
agentsRouter.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.params.id === req.user!.userId)
        throw new AppError(400, 'You cannot delete your own account');

      const { rows: target } = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!target[0]) throw new AppError(404, 'User not found');

      try {
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        res.status(204).send();
      } catch (e: any) {
        if (e?.code === '23503') {
          await pool.query(
            `UPDATE users SET is_active = false, updated_at = NOW()
             WHERE id = $1`,
            [req.params.id],
          );
          res.json({
            id: req.params.id,
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

// ── SESSIONS (live agent status) ──────────────────────────
export const sessionsRouter = Router();
sessionsRouter.use(authenticate);
sessionsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Enriched with the agent's currently-held contact (phone + name) and
      // active job/campaign so the Agents page can render a meaningful
      // "Current Contact" cell instead of a placeholder.
      const { rows } = await pool.query(
        `SELECT s.id, s.agent_id, s.selected_job_ids, s.status,
                s.current_contact_id, s.current_job_id,
                s.login_at, s.logout_at, s.last_heartbeat_at,
                c.phone_number    AS current_phone_number,
                c.first_name      AS current_first_name,
                c.last_name       AS current_last_name,
                camp.name         AS current_campaign_name
         FROM agent_sessions s
         JOIN users u ON u.id = s.agent_id
         LEFT JOIN contacts c ON c.id = s.current_contact_id
         LEFT JOIN campaign_jobs cj ON cj.id = s.current_job_id
         LEFT JOIN campaigns camp ON camp.id = cj.campaign_id
         WHERE u.org_id = $1
         ORDER BY s.last_heartbeat_at DESC`,
        [req.user!.orgId],
      );
      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);
