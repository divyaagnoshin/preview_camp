import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import pool, { withTransaction } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'))
      cb(null, true);
    else cb(new Error('Only CSV files allowed'));
  },
});

const SYSTEM_FIELDS = [
  'phone_number',
  'first_name',
  'last_name',
  'email',
  'timezone',
  'alternate_phone_number',
  'assigned_agent_id',
  'priority',
];

/** Validate and map a contact record against field definitions */
async function validateContact(
  data: Record<string, any>,
  listId: string,
  orgId: string,
) {
  const defs = await pool.query(
    'SELECT field_key, data_type, field_type, is_required FROM contact_list_field_definitions WHERE contact_list_id = $1',
    [listId],
  );
  const errors: string[] = [];
  const custom: Record<string, any> = {};

  for (const def of defs.rows) {
    // Skip keys that live as real columns on `contacts` — they're sourced
    // from req.body directly, never from custom_fields JSONB.
    if (SYSTEM_FIELDS.includes(def.field_key)) continue;
    const val = data.custom_fields?.[def.field_key] ?? data[def.field_key];
    if (def.is_required && (val === undefined || val === null || val === ''))
      errors.push(`Required field missing: ${def.field_key}`);
    if (val !== undefined) custom[def.field_key] = val;
  }

  // Check unknown keys in custom_fields
  if (data.custom_fields) {
    const validKeys = defs.rows
      .map((d: any) => d.field_key)
      .filter((k: string) => !SYSTEM_FIELDS.includes(k));
    for (const k of Object.keys(data.custom_fields)) {
      // System fields may arrive inside custom_fields from bulk/single forms;
      // they're hoisted to real columns later, so don't flag them as unknown.
      if (!validKeys.includes(k) && !SYSTEM_FIELDS.includes(k))
        errors.push(`Unknown field_key: ${k}`);
    }
  }

  if (!data.phone_number) errors.push('phone_number is required');
  if (data.assigned_agent_id) {
    const agentCheck = await pool.query(
      'SELECT 1 FROM users WHERE id = $1 AND org_id = $2',
      [data.assigned_agent_id, orgId],
    );
    if (!agentCheck.rows.length)
      errors.push('assigned_agent_id is not a valid agent in this org');
  }

  return { errors, custom_fields: custom };
}

// Validates phone number format. Accepts an optional leading '+' followed by
// 7-15 digits (E.164 range). Strips whitespace, dashes and parentheses before
// checking so common formatting (e.g. "+1 (415) 555-1212") is accepted.
export function validatePhoneFormat(phone: any): string | null {
  if (phone === undefined || phone === null || String(phone).trim() === '')
    return 'phone_number is empty';
  const cleaned = String(phone).replace(/[\s\-()]/g, '');
  if (!/^\+?[0-9]+$/.test(cleaned))
    return `phone_number contains invalid characters: "${phone}"`;
  const digits = cleaned.replace(/^\+/, '');
  if (digits.length < 7 || digits.length > 15)
    return `phone_number length must be 7-15 digits (got ${digits.length}: "${phone}")`;
  return null;
}

// Header-level pre-check: validate CSV columns against the list's expected
// fields. Unknown columns or missing required columns abort the whole upload
// with a single clear message so the user isn't spammed per row.
async function validateCsvHeader(
  headerKeys: string[],
  contactListId: string,
): Promise<string[]> {
  const defs = await pool.query(
    'SELECT field_key, is_required FROM contact_list_field_definitions WHERE contact_list_id = $1',
    [contactListId],
  );
  const customKeys = defs.rows
    .map((d: any) => d.field_key)
    .filter((k: string) => !SYSTEM_FIELDS.includes(k));
  const allowed = new Set([...SYSTEM_FIELDS, ...customKeys, 'phone']);
  const errs: string[] = [];

  const unknown = headerKeys.filter((k) => k && !allowed.has(k));
  if (unknown.length)
    errs.push(`Unknown column(s) in CSV: ${unknown.join(', ')}`);

  if (!headerKeys.includes('phone_number') && !headerKeys.includes('phone'))
    errs.push('Missing required column: phone_number');

  const missingReq = defs.rows
    .filter((d: any) => d.is_required && !SYSTEM_FIELDS.includes(d.field_key))
    .map((d: any) => d.field_key)
    .filter((k: string) => !headerKeys.includes(k));
  if (missingReq.length)
    errs.push(`Missing required column(s): ${missingReq.join(', ')}`);

  return errs;
}

// Pulls alternate_phone_number out of either the top-level body or the
// custom_fields JSONB (frontend sends it via custom_fields today). Returns
// the value plus the stripped custom_fields so it isn't double-stored.
function extractAlternatePhone(body: any, cf: Record<string, any>) {
  const v =
    (typeof body.alternate_phone_number === 'string' &&
    body.alternate_phone_number.trim() !== ''
      ? body.alternate_phone_number.trim()
      : undefined) ??
    (typeof cf.alternate_phone_number === 'string' &&
    cf.alternate_phone_number.trim() !== ''
      ? cf.alternate_phone_number.trim()
      : undefined) ??
    null;
  const stripped = { ...cf };
  delete stripped.alternate_phone_number;
  return { alternate_phone_number: v, custom_fields: stripped };
}

// Maps already-parsed CSV/JSON records to the contacts schema, validates each
// row against the list's field definitions, and inserts them under the given
// upload batch. Returns per-row error details for any failures. Reused by the
// CSV-upload route and the cloud-import (S3 / FTP) route.
export async function importCsvRecords(
  records: any[],
  contactListId: string,
  orgId: string,
  batchId: string,
  ingestionMethod: string,
) {
  let imported = 0;
  let failed = 0;
  const errors: { row: number; phone: string; error: string }[] = [];

  // Header-level pre-check. If columns don't match the list's schema, fail
  // the whole batch with a single header error rather than per-row noise.
  if (records.length > 0) {
    const headerErrs = await validateCsvHeader(
      Object.keys(records[0]),
      contactListId,
    );
    if (headerErrs.length) {
      for (const msg of headerErrs)
        errors.push({ row: 0, phone: '', error: msg });
      return { imported: 0, failed: records.length, errors };
    }
  }

  // Tracks phone numbers seen earlier in this same upload so the second
  // occurrence is reported as an in-file duplicate.
  const seenPhones = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const phoneRaw = row.phone_number || row.phone || '';

    const phoneErr = validatePhoneFormat(phoneRaw);
    if (phoneErr) {
      failed++;
      errors.push({ row: i + 1, phone: String(phoneRaw), error: phoneErr });
      continue;
    }
    const phoneNorm = String(phoneRaw).replace(/[\s\-()]/g, '');
    if (seenPhones.has(phoneNorm)) {
      failed++;
      errors.push({
        row: i + 1,
        phone: phoneNorm,
        error: 'Duplicate phone number within this CSV file',
      });
      continue;
    }
    seenPhones.add(phoneNorm);

    const mapped: Record<string, any> = {
      phone_number: phoneNorm,
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      timezone: row.timezone,
      alternate_phone_number: row.alternate_phone_number,
      priority: row.priority ? parseInt(row.priority) : 100,
      assigned_agent_id: row.assigned_agent_id || null,
      custom_fields: {},
    };
    for (const [k, v] of Object.entries(row)) {
      if (
        !SYSTEM_FIELDS.includes(k) &&
        k !== 'phone' &&
        k !== 'alternate_phone_number'
      )
        mapped.custom_fields[k] = v;
    }

    try {
      const { errors: errs, custom_fields: cfRaw } = await validateContact(
        mapped,
        contactListId,
        orgId,
      );
      if (errs.length) throw new Error(errs.join('; '));
      const { alternate_phone_number, custom_fields: cf } =
        extractAlternatePhone(mapped, cfRaw);

      // RETURNING id lets us detect whether ON CONFLICT actually skipped the
      // row (already exists in this list) so we can surface it as a duplicate
      // rather than silently counting it as imported.
      const result = await pool.query(
        `INSERT INTO contacts
           (contact_list_id, phone_number, first_name, last_name, email, timezone,
            alternate_phone_number,
            priority, assigned_agent_id, custom_fields, upload_batch_id, ingestion_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (contact_list_id, phone_number) DO NOTHING
         RETURNING id`,
        [
          contactListId,
          mapped.phone_number,
          mapped.first_name,
          mapped.last_name,
          mapped.email,
          mapped.timezone,
          alternate_phone_number,
          mapped.priority,
          mapped.assigned_agent_id,
          JSON.stringify(cf),
          batchId,
          ingestionMethod,
        ],
      );
      if (result.rows.length === 0) {
        failed++;
        errors.push({
          row: i + 1,
          phone: phoneNorm,
          error: 'Phone number already exists in this contact list',
        });
      } else {
        imported++;
      }
    } catch (e: any) {
      failed++;
      errors.push({
        row: i + 1,
        phone: phoneNorm,
        error: e.message,
      });
    }
  }

  return { imported, failed, errors };
}

// POST /contacts — single
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      contact_list_id,
      phone_number,
      first_name,
      last_name,
      email,
      timezone,
      priority,
      assigned_agent_id,
      custom_fields,
    } = req.body;
    if (!contact_list_id) throw new AppError(400, 'contact_list_id required');
    if (!phone_number) throw new AppError(400, 'phone_number required');

    const { errors, custom_fields: cfRaw } = await validateContact(
      { phone_number, custom_fields },
      contact_list_id,
      req.user!.orgId,
    );
    const { alternate_phone_number, custom_fields: cf } = extractAlternatePhone(
      req.body,
      cfRaw,
    );
    if (errors.length) throw new AppError(400, errors.join('; '));

    const batchRes = await pool.query(
      `INSERT INTO contact_upload_batches
         (contact_list_id, ingestion_method, source_ref, total_rows, imported_rows, status, uploaded_by)
       VALUES ($1,'API_SINGLE','POST /contacts',1,1,'done',$2) RETURNING id`,
      [contact_list_id, req.user!.userId],
    );
    const batchId = batchRes.rows[0].id;

    const { rows } = await pool.query(
      `INSERT INTO contacts
         (contact_list_id, phone_number, first_name, last_name, email, timezone,
          alternate_phone_number,
          priority, assigned_agent_id, custom_fields, upload_batch_id, ingestion_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'API_SINGLE') RETURNING *`,
      [
        contact_list_id,
        phone_number,
        first_name,
        last_name,
        email,
        timezone,
        alternate_phone_number,
        priority || 100,
        assigned_agent_id || null,
        JSON.stringify(cf),
        batchId,
      ],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /contacts/batch
router.post(
  '/batch',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        contact_list_id,
        contacts,
        on_duplicate = 'skip',
        validate_only = false,
      } = req.body;
      if (!contact_list_id) throw new AppError(400, 'contact_list_id required');
      if (!Array.isArray(contacts) || !contacts.length)
        throw new AppError(400, 'contacts array required');
      if (contacts.length > 1000)
        throw new AppError(413, 'Batch exceeds 1000 contacts');

      const errors: { row: number; phone: string; error: string }[] = [];
      const valid: any[] = [];

      for (let i = 0; i < contacts.length; i++) {
        const c = contacts[i];
        const { errors: errs, custom_fields: cfRaw } = await validateContact(
          c,
          contact_list_id,
          req.user!.orgId,
        );
        if (errs.length) {
          errors.push({
            row: i + 1,
            phone: c.phone_number || '',
            error: errs.join('; '),
          });
        } else {
          const { alternate_phone_number, custom_fields: cf } =
            extractAlternatePhone(c, cfRaw);
          valid.push({ ...c, alternate_phone_number, custom_fields: cf });
        }
      }

      if (validate_only) {
        res.json({
          total_rows: contacts.length,
          valid_rows: valid.length,
          failed_rows: errors.length,
          errors,
        });
        return;
      }

      const batchRes = await pool.query(
        `INSERT INTO contact_upload_batches
         (contact_list_id, ingestion_method, source_ref, total_rows, status, uploaded_by)
       VALUES ($1,'API_BATCH','POST /contacts/batch',$2,'processing',$3) RETURNING id`,
        [contact_list_id, contacts.length, req.user!.userId],
      );
      const batchId = batchRes.rows[0].id;

      let imported = 0;
      for (const c of valid) {
        const onConflict =
          on_duplicate === 'update'
            ? 'ON CONFLICT (contact_list_id, phone_number) DO UPDATE SET custom_fields=EXCLUDED.custom_fields, updated_at=NOW()'
            : 'ON CONFLICT DO NOTHING';
        await pool.query(
          `INSERT INTO contacts
           (contact_list_id, phone_number, first_name, last_name, email, timezone,
            alternate_phone_number,
            priority, assigned_agent_id, custom_fields, upload_batch_id, ingestion_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'API_BATCH') ${onConflict}`,
          [
            contact_list_id,
            c.phone_number,
            c.first_name,
            c.last_name,
            c.email,
            c.timezone,
            c.alternate_phone_number,
            c.priority || 100,
            c.assigned_agent_id || null,
            JSON.stringify(c.custom_fields),
            batchId,
          ],
        );
        imported++;
      }

      await pool.query(
        'UPDATE contact_upload_batches SET imported_rows=$1, failed_rows=$2, status=$3, completed_at=NOW() WHERE id=$4',
        [
          imported,
          errors.length,
          errors.length > 0 ? 'partial_failure' : 'done',
          batchId,
        ],
      );

      res.status(202).json({
        batch_id: batchId,
        total_rows: contacts.length,
        imported_rows: imported,
        failed_rows: errors.length,
        status: errors.length > 0 ? 'partial_failure' : 'done',
        errors,
      });
    } catch (err) {
      next(err);
    }
  },
);

// POST /contacts/upload — CSV
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        contact_list_id,
        has_header = 'true',
        delimiter = ',',
        on_duplicate = 'skip',
      } = req.body;
      if (!contact_list_id) throw new AppError(400, 'contact_list_id required');
      if (!req.file) throw new AppError(400, 'CSV file required');

      const batchRes = await pool.query(
        `INSERT INTO contact_upload_batches
         (contact_list_id, ingestion_method, source_ref, status, uploaded_by)
       VALUES ($1,'CSV_UPLOAD',$2,'processing',$3) RETURNING id`,
        [contact_list_id, req.file.originalname, req.user!.userId],
      );
      const batchId = batchRes.rows[0].id;

      // Parse and insert async
      const csvBuffer = req.file.buffer.toString('utf-8');
      const records: any[] = await new Promise((resolve, reject) => {
        parse(
          csvBuffer,
          {
            columns: has_header === 'true',
            delimiter,
            skip_empty_lines: true,
            trim: true,
          },
          (err, data) => (err ? reject(err) : resolve(data)),
        );
      });

      const { imported, failed, errors } = await importCsvRecords(
        records,
        contact_list_id,
        req.user!.orgId,
        batchId,
        'CSV_UPLOAD',
      );

      await pool.query(
        `UPDATE contact_upload_batches
       SET total_rows=$1, imported_rows=$2, failed_rows=$3,
           status=$4, completed_at=NOW()
       WHERE id=$5`,
        [
          records.length,
          imported,
          failed,
          failed > 0 && imported === 0
            ? 'failed'
            : failed > 0
              ? 'partial_failure'
              : 'done',
          batchId,
        ],
      );

      res.status(202).json({
        batch_id: batchId,
        status: 'done',
        total_rows: records.length,
        imported_rows: imported,
        failed_rows: failed,
        errors,
      });
    } catch (err) {
      next(err);
    }
  },
);

// GET /contacts/check-dnc
router.post(
  '/check-dnc',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { phone_number, campaign_id } = req.body;
      if (!phone_number) throw new AppError(400, 'phone_number required');

      let query: string;
      let params: any[];

      if (campaign_id) {
        query = `
        SELECT dg.id as group_id, dg.name as group_name, dn.added_at, dn.added_reason
        FROM dnc_numbers dn
        JOIN dnc_groups dg ON dg.id = dn.dnc_group_id
        JOIN campaign_dnc_groups cdg ON cdg.dnc_group_id = dg.id
        WHERE dn.phone_number = $1 AND cdg.campaign_id = $2`;
        params = [phone_number, campaign_id];
      } else {
        query = `
        SELECT dg.id as group_id, dg.name as group_name, dn.added_at, dn.added_reason
        FROM dnc_numbers dn
        JOIN dnc_groups dg ON dg.id = dn.dnc_group_id
        WHERE dn.phone_number = $1 AND dg.org_id = $2`;
        params = [phone_number, req.user!.orgId];
      }

      const { rows } = await pool.query(query, params);
      res.json({ phone_number, is_dnc: rows.length > 0, matched_groups: rows });
    } catch (err) {
      next(err);
    }
  },
);

// GET /contact-upload-batches/:id
router.get(
  '/upload-batches/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM contact_upload_batches WHERE id = $1',
        [req.params.id],
      );
      if (!rows[0]) throw new AppError(404, 'Batch not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
