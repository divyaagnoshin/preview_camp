import { Router, Request, Response, NextFunction } from 'express';
import { CronExpressionParser } from 'cron-parser';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import SftpClient from 'ssh2-sftp-client';
import * as FtpClient from 'basic-ftp';
import pool from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// Allowed providers — kept in sync with the CHECK constraint on
// cloud_import_configs.provider and the dropdown in the Add/Edit modal.
const PROVIDERS = ['s3', 'ftp', 'gcs'] as const;
type Provider = (typeof PROVIDERS)[number];

// Columns returned by every CRUD endpoint. Centralised so the schedule
// columns (migration 012) and the renames in 013 are picked up everywhere.
const SELECT_COLS = `id, name, provider, credentials, options,
  created_at, updated_at, last_used_at,
  schedule_enabled, cron_expression, timezone, contact_list_ids,
  next_refresh, last_refresh, last_run_status, last_run_error,
  last_run_imported_rows, last_run_failed_rows`;

// Validates a cron expression against the caller's timezone and returns the
// next fire time. Throws AppError(400) with the parser's message on bad input.
export function computeNextRun(cron: string, tz: string): Date {
  try {
    const it = CronExpressionParser.parse(cron, { tz });
    return it.next().toDate();
  } catch (e: any) {
    throw new AppError(400, `Invalid cron expression: ${e?.message || e}`);
  }
}

// Strips secrets before returning a row to the UI. The frontend table only
// needs to render the connection target (bucket/host/folder), and the edit
// modal re-asks for the secret rather than displaying it.
function sanitize(row: any) {
  if (!row) return row;
  const cred = { ...(row.credentials || {}) };
  if (cred.secret_access_key) cred.secret_access_key = '';
  if (cred.password) cred.password = '';
  if (cred.service_account_json) cred.service_account_json = '';
  return { ...row, credentials: cred };
}

// GET /v1/cloud-import-configs — list every saved profile for the caller's
// org, newest first. Used by the table view in the Cloud Import modal.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS}
         FROM cloud_import_configs
        WHERE org_id = $1
        ORDER BY created_at DESC`,
      [req.user!.orgId],
    );
    res.json({ data: rows.map(sanitize) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/history', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cfg = await pool.query(`SELECT id FROM cloud_import_configs WHERE id = $1 AND org_id = $2`, [req.params.id, req.user!.orgId]);
    if (!cfg.rows.length) {
      throw new AppError(404, 'Configuration not found');
    }
    
    const { rows } = await pool.query(
      `SELECT id, run_at, status, imported_rows, failed_rows, error_log
         FROM cloud_import_run_history
        WHERE config_id = $1
        ORDER BY run_at DESC`,
      [req.params.id],
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

// GET /:id — single profile (also sanitized).
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLS}
         FROM cloud_import_configs
        WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.orgId],
    );
    if (!rows.length) throw new AppError(404, 'Config not found');
    res.json(sanitize(rows[0]));
  } catch (e) {
    next(e);
  }
});

// POST /v1/cloud-import-configs/test-connection — test connection without saving.
router.post(
  '/test-connection',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { provider, credentials = {}, options = {} } = req.body;
      if (!PROVIDERS.includes(provider)) {
        throw new AppError(400, `provider must be one of ${PROVIDERS.join(', ')}`);
      }

      const cred = credentials;
      const protocol = (cred.protocol || '').toLowerCase();
      const port = cred.port
        ? parseInt(cred.port, 10)
        : protocol === 'sftp'
          ? 22
          : 21;

      if (provider === 's3') {
        const s3 = new S3Client({
          region: cred.region || 'us-east-1',
          credentials: {
            accessKeyId: cred.access_key_id,
            secretAccessKey: cred.secret_access_key,
          },
        });
        // Try a list-objects command with MaxKeys=1 just to verify credentials
        // and bucket existence without downloading anything.
        await s3.send(
          new ListObjectsV2Command({
            Bucket: cred.bucket,
            Prefix: cred.folder,
            MaxKeys: 1,
          })
        );
      } else if (provider === 'ftp') {
        if (protocol === 'sftp') {
          const sftp = new SftpClient();
          try {
            await sftp.connect({
              host: cred.host,
              port,
              username: cred.username,
              password: cred.password,
            });
          } finally {
            await sftp.end();
          }
        } else {
          const client = new FtpClient.Client();
          try {
            await client.access({
              host: cred.host,
              port,
              user: cred.username,
              password: cred.password,
              secure: false,
            });
          } finally {
            client.close();
          }
        }
      } else {
        throw new AppError(400, 'Test connection not supported for this provider yet');
      }

      res.json({ success: true });
    } catch (e: any) {
      // Format the error nicely so the UI can display it
      const message = e?.message || String(e);
      res.status(400).json({ error: message });
    }
  }
);

// POST /v1/cloud-import-configs — create a new profile.
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, provider, credentials = {}, options = {}, contact_list_ids = [] } = req.body;
    if (!name || typeof name !== 'string')
      throw new AppError(400, 'name required');
    if (!PROVIDERS.includes(provider))
      throw new AppError(
        400,
        `provider must be one of ${PROVIDERS.join(', ')}`,
      );

    if (options.source_path) {
      const pathCheck = await pool.query(
        `SELECT id FROM cloud_import_configs WHERE org_id = $1 AND options->>'source_path' = $2`,
        [req.user!.orgId, options.source_path]
      );
      if (pathCheck.rows.length > 0) {
        throw new AppError(409, 'This source path is already mapped to another configuration');
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO cloud_import_configs
         (org_id, name, provider, credentials, options, created_by, contact_list_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${SELECT_COLS}`,
      [
        req.user!.orgId,
        name.trim(),
        provider as Provider,
        JSON.stringify(credentials),
        JSON.stringify(options),
        req.user!.userId,
        contact_list_ids,
      ],
    );
    res.status(201).json(sanitize(rows[0]));
  } catch (e: any) {
    // Friendlier message for the unique (org_id, name) violation than the
    // raw Postgres "duplicate key value violates unique constraint".
    if (e?.code === '23505')
      return next(new AppError(409, 'A config with this name already exists'));
    next(e);
  }
});

// PUT /:id — update. Empty/missing secret fields keep the previously stored
// value so the UI can let users edit non-secret fields without re-typing
// passwords.
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, provider, credentials = {}, options = {}, contact_list_ids = [] } = req.body;
    if (!name) throw new AppError(400, 'name required');
    if (!PROVIDERS.includes(provider))
      throw new AppError(
        400,
        `provider must be one of ${PROVIDERS.join(', ')}`,
      );

    if (options.source_path) {
      const pathCheck = await pool.query(
        `SELECT id FROM cloud_import_configs WHERE org_id = $1 AND options->>'source_path' = $2 AND id != $3`,
        [req.user!.orgId, options.source_path, req.params.id]
      );
      if (pathCheck.rows.length > 0) {
        throw new AppError(409, 'This source path is already mapped to another configuration');
      }
    }

    const existing = await pool.query(
      `SELECT credentials FROM cloud_import_configs
        WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.user!.orgId],
    );
    if (!existing.rows.length) throw new AppError(404, 'Config not found');

    const prevCred = existing.rows[0].credentials || {};
    const merged = { ...credentials };
    for (const k of ['secret_access_key', 'password', 'service_account_json'])
      if (!merged[k]) merged[k] = prevCred[k] || '';

    const { rows } = await pool.query(
      `UPDATE cloud_import_configs
          SET name = $1, provider = $2, credentials = $3, options = $4, contact_list_ids = $5,
              updated_at = NOW()
        WHERE id = $6 AND org_id = $7
        RETURNING ${SELECT_COLS}`,
      [
        name.trim(),
        provider as Provider,
        JSON.stringify(merged),
        JSON.stringify(options),
        contact_list_ids,
        req.params.id,
        req.user!.orgId,
      ],
    );
    res.json(sanitize(rows[0]));
  } catch (e: any) {
    if (e?.code === '23505')
      return next(new AppError(409, 'A config with this name already exists'));
    next(e);
  }
});

// PUT /:id/schedule — set, pause, or resume the cron schedule. When
// enabled the cron is parsed against the chosen IANA timezone and the next
// fire time is persisted (next_refresh) so the scheduler poll has nothing
// to recompute. When disabled the row is paused: schedule_enabled flips
// to false and next_refresh is cleared so the scheduler stops firing, but
// cron_expression / timezone / contact_list_id are preserved so a later
// Activate can resume without re-entering the schedule.
router.put(
  '/:id/schedule',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        enabled = false,
        cron_expression,
        timezone,
        contact_list_ids,
      } = req.body;

      // Load the existing row so a pause (enabled=false) can preserve the
      // previously stored cron / timezone / contact_list_ids, and so a
      // resume (enabled=true) without explicit fields can fall back to
      // them.
      const existing = await pool.query(
        `SELECT cron_expression, timezone, contact_list_ids
           FROM cloud_import_configs
          WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!existing.rows.length) throw new AppError(404, 'Config not found');
      const prev = existing.rows[0];

      const finalCron = cron_expression ?? prev.cron_expression;
      const finalTz = timezone || prev.timezone || 'UTC';
      const finalLists = contact_list_ids ?? prev.contact_list_ids;

      if (enabled) {
        if (!finalCron)
          throw new AppError(400, 'cron_expression required when enabled');
        if (!finalLists || finalLists.length === 0)
          throw new AppError(400, 'contact_list_ids array required when enabled');
        // Confirm the lists belong to the caller's org so a malicious user
        // can't aim a schedule at someone else's data.
        const listChk = await pool.query(
          `SELECT id FROM contact_lists WHERE id = ANY($1) AND org_id = $2`,
          [finalLists, req.user!.orgId],
        );
        if (listChk.rows.length !== finalLists.length)
          throw new AppError(404, 'One or more contact_list_ids not found or unauthorized');
      }

      const nextRun = enabled ? computeNextRun(finalCron, finalTz) : null;

      const { rows } = await pool.query(
        `UPDATE cloud_import_configs
            SET schedule_enabled = $1,
                cron_expression  = $2,
                timezone         = $3,
                contact_list_ids = $4,
                next_refresh     = $5,
                updated_at       = NOW()
          WHERE id = $6 AND org_id = $7
        RETURNING ${SELECT_COLS}`,
        [
          enabled,
          finalCron || null,
          finalTz,
          finalLists || '{}',
          nextRun,
          req.params.id,
          req.user!.orgId,
        ],
      );
      if (!rows.length) throw new AppError(404, 'Config not found');
      res.json(sanitize(rows[0]));
    } catch (e) {
      next(e);
    }
  },
);

// GET /:id/history
router.get(
  '/:id/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cfg = await pool.query(
        `SELECT id FROM cloud_import_configs WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!cfg.rows[0]) throw new AppError(404, 'Config not found');

      const { rows } = await pool.query(
        `SELECT id, created_at AS run_date, status, imported_rows AS contacts_imported, failed_rows AS contacts_failed, error_log AS error_message
         FROM cloud_import_run_history
         WHERE config_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [req.params.id],
      );
      res.json({ data: rows });
    } catch (e) {
      next(e);
    }
  },
);

// DELETE /:id
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rowCount } = await pool.query(
        `DELETE FROM cloud_import_configs WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!rowCount) throw new AppError(404, 'Config not found');
      res.status(204).end();
    } catch (e) {
      next(e);
    }
  },
);

export default router;
