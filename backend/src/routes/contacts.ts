import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse';
import { from as copyFrom } from 'pg-copy-streams';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { PoolClient } from 'pg';
import pool, { withTransaction } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { buildSchemaMap, validateCustomFields, SchemaMap } from './fieldTypeValidator';

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
// O(1) lookups inside the per-row hot loop. Plain Array.includes() is O(n) and
// gets called millions of times when importing tens of thousands of rows.
const SYSTEM_FIELDS_SET = new Set(SYSTEM_FIELDS);

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
//
// Performance: defs and valid-agent set are fetched ONCE, validation runs in
// memory, then inserts are issued in 500-row multi-VALUES batches inside a
// single transaction. A 50k-row CSV that previously did ~100k round-trips
// (one defs SELECT + one INSERT per row) now does ~100 round-trips total.
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

  // Pre-fetch field defs once. validateContact() used to run this per row.
  const defsRes = await pool.query(
    `SELECT field_key, is_required
       FROM contact_list_field_definitions
      WHERE contact_list_id = $1`,
    [contactListId],
  );
  const customKeySet = new Set<string>(
    defsRes.rows
      .map((d: any) => d.field_key)
      .filter((k: string) => !SYSTEM_FIELDS_SET.has(k)),
  );
  const requiredCustomKeys = defsRes.rows
    .filter((d: any) => d.is_required && !SYSTEM_FIELDS_SET.has(d.field_key))
    .map((d: any) => d.field_key);

  // Phase 1: validate + map every row in memory. Failures (bad phone format,
  // missing required custom field) are recorded directly into errors[] and
  // do not reach the insert phase. assigned_agent_id is passed through as-is;
  // the FK on contacts.assigned_agent_id → users.id is the source of truth.
  type ValidRow = {
    rowIdx: number;
    phone_number: string;
    first_name: any;
    last_name: any;
    email: any;
    timezone: any;
    alternate_phone_number: string | null;
    priority: number;
    assigned_agent_id: string | null;
    custom_fields: Record<string, any>;
  };
  const validRows: ValidRow[] = [];

  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const phoneRaw = row.phone_number || row.phone || '';
    const phoneErr = validatePhoneFormat(phoneRaw);
    if (phoneErr) {
      console.error('PHONE VALIDATION FAILED');
      console.error({
        
        phone: phoneRaw,
        error: phoneErr,
        fullRow: row,
      });
      failed++;
      errors.push({ row: i + 1, phone: String(phoneRaw), error: phoneErr });
      continue;
    }
    const phoneNorm = String(phoneRaw).replace(/[\s\-()]/g, '');

    const assignedAgentId =
      typeof row.assigned_agent_id === 'string' &&
      row.assigned_agent_id.trim() !== ''
        ? row.assigned_agent_id.trim()
        : null;

    // Single pass: collect only known custom-field keys. Non-system, non-phone
    // columns that aren't declared on this list are silently dropped (the
    // header pre-check would have already flagged truly unknown columns at
    // batch level — this just guards against any drift).
    const customFields: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) {
      if (
        !SYSTEM_FIELDS_SET.has(k) &&
        k !== 'phone' &&
        k !== 'alternate_phone_number' &&
        customKeySet.has(k)
      ) {
        customFields[k] = v;
      }
    }

    // Required-field check (inline, no DB round-trip).
    let reqErr: string | null = null;
    for (const key of requiredCustomKeys) {
      const v = customFields[key];
      if (v === undefined || v === null || v === '') {
        reqErr = `Required field missing: ${key}`;
        break;
      }
    }
    if (reqErr) {
      console.error('REQUIRED FIELD VALIDATION FAILED');
console.error({

  phone: phoneNorm,
  error: reqErr,
  fullRow: row,
});
      failed++;
      errors.push({ row: i + 1, phone: phoneNorm, error: reqErr });
      continue;
    }

    // Pull alternate_phone_number out of either the top-level cell or the
    // custom_fields bag so it ends up in its own real column.
    const altTop =
      typeof row.alternate_phone_number === 'string' &&
      row.alternate_phone_number.trim() !== ''
        ? row.alternate_phone_number.trim()
        : null;
    const altCf =
      typeof customFields.alternate_phone_number === 'string' &&
      customFields.alternate_phone_number.trim() !== ''
        ? customFields.alternate_phone_number.trim()
        : null;
    const alternatePhoneNumber = altTop ?? altCf ?? null;
    delete customFields.alternate_phone_number;

    validRows.push({
      rowIdx: i + 1,
      phone_number: phoneNorm,
      first_name: row.first_name ?? null,
      last_name: row.last_name ?? null,
      email: row.email ?? null,
      timezone: row.timezone ?? null,
      alternate_phone_number: alternatePhoneNumber,
      priority: row.priority ? parseInt(row.priority) : 100,
      assigned_agent_id: assignedAgentId,
      custom_fields: customFields,
    });
  }

  // Phase 2: load validRows via COPY FROM STDIN. 10000 rows / chunk balances
  // per-statement overhead against the worst-case bisect depth (~14 retries
  // for a single bad row). At ~100k rows/s throughput, a 500k upload runs in
  // ~5s of pure DB time.
  const CHUNK_SIZE = 10000;
  if (validRows.length) {
    await withTransaction(async (client) => {
      for (let start = 0; start < validRows.length; start += CHUNK_SIZE) {
        const chunk = validRows.slice(start, start + CHUNK_SIZE);
        const { imported: imp, failures } = await tryCopyChunkBisect(
          client,
          chunk,
          contactListId,
          batchId,
          ingestionMethod,
        );
        imported += imp;
        failed += failures.length;
        for (const f of failures) errors.push(f);
      }
    });
  }

  return { imported, failed, errors };
}

// ─── COPY FROM STDIN helpers ──────────────────────────────────────────────

// CSV escape: empty/unquoted = NULL per COPY's `FORMAT csv` rules. The fast
// path leaves values bare when they contain no quote/comma/CR/LF — phone
// numbers, UUIDs, integers and most names take this path with zero
// allocations. Only values with special chars hit the quote+escape slow path.
function csvField(v: any): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 34 || c === 44 || c === 10 || c === 13)
      return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Serialise validRows into the wire payload COPY expects: CSV lines, one row
// per line, columns in the same order as the COPY column list below. The
// per-chunk constants (contact_list_id, batch_id, ingestion_method) are
// pre-formatted once outside the hot loop so we save 3 csvField calls per row.
function buildCopyBuffer(
  rows: ValidRowForCopy[],
  contactListId: string,
  batchId: string,
  ingestionMethod: string,
): Buffer {
  const prefix = csvField(contactListId) + ',';
  const suffix =
    ',' + csvField(batchId) + ',' + csvField(ingestionMethod) + '\n';
  const parts: string[] = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    parts[i] =
      prefix +
      csvField(r.phone_number) +
      ',' +
      csvField(r.first_name) +
      ',' +
      csvField(r.last_name) +
      ',' +
      csvField(r.email) +
      ',' +
      csvField(r.timezone) +
      ',' +
      csvField(r.alternate_phone_number) +
      ',' +
      csvField(r.priority) +
      ',' +
      csvField(r.assigned_agent_id) +
      ',' +
      csvField(JSON.stringify(r.custom_fields)) +
      suffix;
  }
  return Buffer.from(parts.join(''), 'utf-8');
}

type ValidRowForCopy = {
  rowIdx: number;
  phone_number: string;
  first_name: any;
  last_name: any;
  email: any;
  timezone: any;
  alternate_phone_number: string | null;
  priority: number;
  assigned_agent_id: string | null;
  custom_fields: Record<string, any>;
};

// Streams one chunk into Postgres via COPY. Caller is responsible for
// wrapping this in a SAVEPOINT so a failure can be rolled back without
// poisoning the surrounding transaction.
async function copyChunk(
  client: PoolClient,
  rows: ValidRowForCopy[],
  contactListId: string,
  batchId: string,
  ingestionMethod: string,
): Promise<void> {
  const ingest = client.query(
    copyFrom(
      `COPY contacts
         (contact_list_id, phone_number, first_name, last_name, email,
          timezone, alternate_phone_number, priority, assigned_agent_id,
          custom_fields, upload_batch_id, ingestion_method)
       FROM STDIN WITH (FORMAT csv, NULL '')`,
    ),
  );
  const buf = buildCopyBuffer(rows, contactListId, batchId, ingestionMethod);
  await pipeline(Readable.from(buf), ingest as any);
}

// Bisecting retry: try the whole chunk in one COPY; on failure, split in
// half and recurse. Each attempt is wrapped in its own SAVEPOINT so a failed
// COPY doesn't abort the outer transaction. Worst case for a single bad row
// in a 5000-row chunk is ~13 extra COPYs (log2(5000)) instead of 5000
// individual INSERTs.
async function tryCopyChunkBisect(
  client: PoolClient,
  rows: ValidRowForCopy[],
  contactListId: string,
  batchId: string,
  ingestionMethod: string,
): Promise<{
  imported: number;
  failures: { row: number; phone: string; error: string }[];
}> {
  if (rows.length === 0) return { imported: 0, failures: [] };
  const sp = `sp_copy_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await copyChunk(client, rows, contactListId, batchId, ingestionMethod);
    await client.query(`RELEASE SAVEPOINT ${sp}`);
    return { imported: rows.length, failures: [] };
  } catch (err: any) {
    console.error('========= COPY FAILED =========');

    console.error('Error Message:', err?.message);
    console.error('Error Detail:', err?.detail);
    console.error('Error Code:', err?.code);
    console.error('Constraint:', err?.constraint);
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    if (rows.length === 1) {
      console.error('FAILED SINGLE ROW');
      console.error(rows[0]);
      return {
        imported: 0,
        failures: [
          {
            row: rows[0].rowIdx,
            phone: rows[0].phone_number,
            error: err?.message || 'COPY failed',
          },
        ],
      };
    }
    const mid = Math.floor(rows.length / 2);
    const left = await tryCopyChunkBisect(
      client,
      rows.slice(0, mid),
      contactListId,
      batchId,
      ingestionMethod,
    );
    const right = await tryCopyChunkBisect(
      client,
      rows.slice(mid),
      contactListId,
      batchId,
      ingestionMethod,
    );
    return {
      imported: left.imported + right.imported,
      failures: [...left.failures, ...right.failures],
    };
  }
}

// End-to-end streaming CSV import. Differs from importCsvRecords in that it
// never materialises the full record set in memory: the csv-parse stream is
// driven by for-await, each row is validated inline, and rows are appended
// to a rolling chunk that flushes via COPY whenever it hits CHUNK_SIZE. For a
// 300k-row upload this drops peak JS heap from ~150 MB (records[] + validRows[])
// to ~2 MB (one chunk worth) and lets parse / validate / COPY overlap inside
// the same transaction.
export async function importCsvStream(
  fileBuffer: Buffer,
  contactListId: string,
  _orgId: string,
  batchId: string,
  ingestionMethod: string,
  opts: { hasHeader: boolean; delimiter: string },
): Promise<{
  imported: number;
  failed: number;
  totalRows: number;
  errors: { row: number; phone: string; error: string }[];
}> {
  let imported = 0;
  let failed = 0;
  let totalRows = 0;
  const errors: { row: number; phone: string; error: string }[] = [];

  // Pre-fetch field defs once. Same lookups validateContact() used to run
  // per row in the legacy path.
  const defsRes = await pool.query(
    `SELECT field_key, is_required
       FROM contact_list_field_definitions
      WHERE contact_list_id = $1`,
    [contactListId],
  );

  // Fetch data_type for each custom field once — used for in-memory type validation
  const typeRes = await pool.query(
    `SELECT field_key, data_type FROM (
       SELECT fl.field_key, fl.data_type
         FROM contact_list_attributes cla
         JOIN org_field_library fl ON fl.id = cla.field_library_id
        WHERE cla.contact_list_id = $1
       UNION ALL
       SELECT cf.field_key, cf.data_type
         FROM contact_list_custom_fields cf
        WHERE cf.contact_list_id = $1
     ) t`,
    [contactListId],
  );
  const schemaMap: SchemaMap = buildSchemaMap(typeRes.rows);

  
  const customKeySet = new Set<string>(
    defsRes.rows
      .map((d: any) => d.field_key)
      .filter((k: string) => !SYSTEM_FIELDS_SET.has(k)),
  );
  const requiredCustomKeys: string[] = defsRes.rows
    .filter((d: any) => d.is_required && !SYSTEM_FIELDS_SET.has(d.field_key))
    .map((d: any) => d.field_key);

  const parser = parse({
    columns: opts.hasHeader,
    delimiter: opts.delimiter,
    skip_empty_lines: true,
    trim: true,
  });
  Readable.from(fileBuffer).pipe(parser);

  const CHUNK_SIZE = 10000;
  let chunk: ValidRowForCopy[] = [];
  let headerChecked = false;
  let headerFailed = false;
  console.log(`Flushing chunk with ${chunk.length} records...`);
  const flushChunk = async (client: PoolClient) => {
    
    if (chunk.length === 0) return;
    console.log('Flushing chunk:', chunk.length); 
    const { imported: imp, failures } = await tryCopyChunkBisect(
      client,
      chunk,
      contactListId,
      batchId,
      ingestionMethod,
    );
    imported += imp;
    console.log('Inserted rows:', imp);
    failed += failures.length;
    for (const f of failures) errors.push(f);
    chunk = [];
  };

  await withTransaction(async (client) => {
    // Bulk-load tuning: skip the WAL fsync on COMMIT. If Postgres crashes
    // between COMMIT returning and the WAL hitting disk the upload is lost,
    // which is acceptable here since the user can simply re-upload — data
    // integrity (FKs, constraints, MVCC) is unaffected. Saves one fsync
    // per upload (≈5-50 ms on typical SSD-backed installs).
    await client.query('SET LOCAL synchronous_commit = OFF');
    for await (const row of parser as AsyncIterable<any>) {
      totalRows++;

      // Lazy header check fires once on the first record. If columns don't
      // match the list's schema, fail the whole batch with a single error
      // and stop validating subsequent rows (still consume the stream so we
      // report an accurate totalRows count).
      if (!headerChecked) {
        headerChecked = true;
        const headerErrs = await validateCsvHeader(
          Object.keys(row),
          contactListId,
        );
        if (headerErrs.length) {
          for (const msg of headerErrs)
            errors.push({ row: 0, phone: '', error: msg });
          headerFailed = true;
        }
      }
      if (headerFailed) {
        failed++;
        continue;
      }

      const phoneRaw = row.phone_number || row.phone || '';
      const phoneErr = validatePhoneFormat(phoneRaw);
      if (phoneErr) {
        console.error('PHONE ERROR');
        console.error({
          row: totalRows,
          phone: phoneRaw,
          error: phoneErr,
        });
        failed++;
        errors.push({
          row: totalRows,
          phone: String(phoneRaw),
          error: phoneErr,
        });
        continue;
      }
      const phoneNorm = String(phoneRaw).replace(/[\s\-()]/g, '');

      const assignedAgentId =
        typeof row.assigned_agent_id === 'string' &&
        row.assigned_agent_id.trim() !== ''
          ? row.assigned_agent_id.trim()
          : null;

      const customFields: Record<string, any> = {};
      for (const k in row) {
        if (
          !SYSTEM_FIELDS_SET.has(k) &&
          k !== 'phone' &&
          k !== 'alternate_phone_number' &&
          customKeySet.has(k)
        ) {
          customFields[k] = row[k];
        }
      }

      let reqErr: string | null = null;
      for (const key of requiredCustomKeys) {
        const v = customFields[key];
        if (v === undefined || v === null || v === '') {
          reqErr = `Required field missing: ${key}`;
          break;
        }
      }
      if (reqErr) {
        console.error('REQUIRED FIELD ERROR');
console.error({
  row: totalRows,
  phone: phoneNorm,
  error: reqErr,
  rowData: row,
});
        failed++;
        errors.push({ row: totalRows, phone: phoneNorm, error: reqErr });
        continue;
      }
      const typeErr = validateCustomFields(totalRows, customFields, schemaMap);
      if (typeErr) {
        failed++;
        errors.push({ row: totalRows, phone: phoneNorm, error: typeErr });
        continue;
      }

      const altTop =
        typeof row.alternate_phone_number === 'string' &&
        row.alternate_phone_number.trim() !== ''
          ? row.alternate_phone_number.trim()
          : null;
      const altCf =
        typeof customFields.alternate_phone_number === 'string' &&
        customFields.alternate_phone_number.trim() !== ''
          ? customFields.alternate_phone_number.trim()
          : null;
      const alternatePhoneNumber = altTop ?? altCf ?? null;
      delete customFields.alternate_phone_number;

      console.log('VALID ROW READY FOR INSERT:', {
        row: totalRows,
        phone: phoneNorm,
      });

      chunk.push({
        rowIdx: totalRows,
        phone_number: phoneNorm,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        email: row.email ?? null,
        timezone: row.timezone ?? null,
        alternate_phone_number: alternatePhoneNumber,
        priority: row.priority ? parseInt(row.priority) : 100,
        assigned_agent_id: assignedAgentId,
        custom_fields: customFields,
      });

      if (chunk.length >= CHUNK_SIZE) await flushChunk(client);
    }
    await flushChunk(client);
  });
  console.log('=========== IMPORT SUMMARY ===========');

      console.log({
        totalRows,
        imported,
        failed,
        errors,
      });
  return { imported, failed, totalRows, errors };
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
        await pool.query(
          `INSERT INTO contacts
           (contact_list_id, phone_number, first_name, last_name, email, timezone,
            alternate_phone_number,
            priority, assigned_agent_id, custom_fields, upload_batch_id, ingestion_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'API_BATCH')`,
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

      console.log('================ CSV UPLOAD START ================');
      console.log('File Name:', req.file?.originalname);
      console.log('File Size:', req.file?.size);
      console.log('Contact List ID:', contact_list_id);
      console.log('User ID:', req.user?.userId);
      console.log('Has Header:', has_header);
      console.log('Delimiter:', delimiter);
      if (!contact_list_id) throw new AppError(400, 'contact_list_id required');
      if (!req.file) throw new AppError(400, 'CSV file required');

      const batchRes = await pool.query(
        `INSERT INTO contact_upload_batches
         (contact_list_id, ingestion_method, source_ref, status, uploaded_by)
       VALUES ($1,'CSV_UPLOAD',$2,'processing',$3) RETURNING id`,
        [contact_list_id, req.file.originalname, req.user!.userId],
      );
      const batchId = batchRes.rows[0].id;

      // Stream the CSV: parse → validate → COPY in one pipeline. Avoids
      // materialising the full record array (saves ~150 MB on a 300k upload)
      // and overlaps parse / validate / DB work inside one transaction.
      const { imported, failed, totalRows, errors } = await importCsvStream(
        req.file.buffer,
        contact_list_id,
        req.user!.orgId,
        batchId,
        'CSV_UPLOAD',
        { hasHeader: has_header === 'true', delimiter },
      );

      await pool.query(
        `UPDATE contact_upload_batches
       SET total_rows=$1, imported_rows=$2, failed_rows=$3,
           status=$4, completed_at=NOW()
       WHERE id=$5`,
        [
          totalRows,
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
        total_rows: totalRows,
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

// PATCH /contacts/:id — edit a single contact in-place. System fields map to
// real columns; everything else goes through validateContact and is merged
// into the existing custom_fields JSONB (so partial edits don't drop keys).
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const contactId = req.params.id;
    const existing = await pool.query(
      `SELECT c.*, cl.org_id
         FROM contacts c
         JOIN contact_lists cl ON cl.id = c.contact_list_id
        WHERE c.id = $1 AND cl.org_id = $2`,
      [contactId, req.user!.orgId],
    );
    if (!existing.rows[0]) throw new AppError(404, 'Contact not found');
    const prev = existing.rows[0];

    const {
      phone_number,
      first_name,
      last_name,
      email,
      timezone,
      priority,
      assigned_agent_id,
      custom_fields,
    } = req.body;

    if (phone_number !== undefined) {
      const phoneErr = validatePhoneFormat(phone_number);
      if (phoneErr) throw new AppError(400, phoneErr);
    }

    const { errors, custom_fields: cfRaw } = await validateContact(
      {
        phone_number: phone_number ?? prev.phone_number,
        custom_fields: custom_fields ?? {},
      },
      prev.contact_list_id,
      req.user!.orgId,
    );
    if (errors.length) throw new AppError(400, errors.join('; '));
    const { alternate_phone_number, custom_fields: cfNew } =
      extractAlternatePhone(req.body, cfRaw);

    const mergedCf = { ...(prev.custom_fields || {}), ...cfNew };
    const finalAltPhone =
      req.body.alternate_phone_number !== undefined ||
      (custom_fields && 'alternate_phone_number' in custom_fields)
        ? alternate_phone_number
        : prev.alternate_phone_number;

    const { rows } = await pool.query(
      `UPDATE contacts SET
         phone_number = COALESCE($1, phone_number),
         first_name = COALESCE($2, first_name),
         last_name = COALESCE($3, last_name),
         email = COALESCE($4, email),
         timezone = COALESCE($5, timezone),
         alternate_phone_number = $6,
         priority = COALESCE($7, priority),
         assigned_agent_id = $8,
         custom_fields = $9,
         updated_at = NOW()
       WHERE id = $10 RETURNING *`,
      [
        phone_number ?? null,
        first_name ?? null,
        last_name ?? null,
        email ?? null,
        timezone ?? null,
        finalAltPhone,
        priority ?? null,
        assigned_agent_id === undefined
          ? prev.assigned_agent_id
          : assigned_agent_id || null,
        JSON.stringify(mergedCf),
        contactId,
      ],
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /contacts/:id — remove a single contact (org-scoped via its list).
// Contacts are referenced from four tables: campaign_contact_status (queue
// rows), contact_status_history (state transitions), agent_sessions
// (current_contact_id pointer), and contact_interactions (audit log). We
// purge the first three inside a transaction since they're operational
// state. If contact_interactions still hold the row, we fall back to a
// 409 with a clear message instead of the generic FK error.
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const owned = await pool.query(
      `SELECT c.id FROM contacts c
         JOIN contact_lists cl ON cl.id = c.contact_list_id
        WHERE c.id = $1 AND cl.org_id = $2`,
      [req.params.id, req.user!.orgId],
    );
    if (!owned.rows[0]) throw new AppError(404, 'Contact not found');

    try {
      await withTransaction(async (client) => {
        await client.query(
          `DELETE FROM campaign_contact_status WHERE contact_id = $1`,
          [req.params.id],
        );
        await client.query(
          `DELETE FROM contact_status_history WHERE contact_id = $1`,
          [req.params.id],
        );
        await client.query(
          `UPDATE agent_sessions SET current_contact_id = NULL
             WHERE current_contact_id = $1`,
          [req.params.id],
        );
        await client.query(`DELETE FROM contacts WHERE id = $1`, [
          req.params.id,
        ]);
      });
      res.status(204).send();
    } catch (e: any) {
      if (e?.code === '23503') {
        throw new AppError(
          409,
          'Contact has historical call activity and cannot be deleted',
        );
      }
      throw e;
    }
  } catch (err) {
    next(err);
  }
});

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
