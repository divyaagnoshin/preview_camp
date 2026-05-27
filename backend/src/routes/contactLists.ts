import { Router, Request, Response, NextFunction } from 'express';
import pool, { withTransaction } from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /contact-lists
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const perPage = Math.min(parseInt(req.query.per_page as string) || 20, 100);
    const offset = (page - 1) * perPage;

    const { rows } = await pool.query(
      `SELECT cl.*, COUNT(c.id)::int AS contact_count
       FROM contact_lists cl
       LEFT JOIN contacts c ON c.contact_list_id = cl.id
       WHERE cl.org_id = $1
       GROUP BY cl.id
       ORDER BY cl.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user!.orgId, perPage, offset],
    );
    const total = await pool.query(
      'SELECT COUNT(*)::int FROM contact_lists WHERE org_id = $1',
      [req.user!.orgId],
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
});

// POST /contact-lists
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body;
    if (!name) throw new AppError(400, 'name is required');
    const { rows } = await pool.query(
      `INSERT INTO contact_lists (org_id, name, description, created_by)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user!.orgId, name, description || null, req.user!.userId],
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /contact-lists/:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT cl.*, COUNT(c.id)::int AS contact_count
       FROM contact_lists cl
       LEFT JOIN contacts c ON c.contact_list_id = cl.id
       WHERE cl.id = $1 AND cl.org_id = $2
       GROUP BY cl.id`,
      [req.params.id, req.user!.orgId],
    );
    if (!rows[0]) throw new AppError(404, 'Contact list not found');

    const fields = await pool.query(
      `SELECT * FROM contact_list_field_definitions
       WHERE contact_list_id = $1 ORDER BY display_order`,
      [req.params.id],
    );
    res.json({ ...rows[0], field_definitions: fields.rows });
  } catch (err) {
    next(err);
  }
});

// PATCH /contact-lists/:id
router.patch(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { name, description } = req.body;
      const { rows } = await pool.query(
        `UPDATE contact_lists SET
         name = COALESCE($1, name),
         description = COALESCE($2, description),
         updated_at = NOW()
       WHERE id = $3 AND org_id = $4 RETURNING *`,
        [name, description, req.params.id, req.user!.orgId],
      );
      if (!rows[0]) throw new AppError(404, 'Contact list not found');
      res.json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /contact-lists/:id
router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check no active jobs using this list
      const active = await pool.query(
        `SELECT 1 FROM campaign_contact_lists ccl
       JOIN campaign_jobs cj ON cj.campaign_id = ccl.campaign_id
       WHERE ccl.contact_list_id = $1 AND cj.status = 'active' LIMIT 1`,
        [req.params.id],
      );
      if (active.rows.length)
        throw new AppError(409, 'Cannot delete list with active jobs');

      await pool.query(
        'DELETE FROM contact_lists WHERE id = $1 AND org_id = $2',
        [req.params.id, req.user!.orgId],
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

// POST /contact-lists/:id/field-definitions
router.post(
  '/:id/field-definitions',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        field_key,
        field_label,
        data_type,
        field_type,
        is_required,
        display_order,
        is_visible_to_agent,
      } = req.body;
      if (!field_key || !field_label)
        throw new AppError(400, 'field_key and field_label required');
      if (field_type && !['predefined', 'custom'].includes(field_type))
        throw new AppError(400, "field_type must be 'predefined' or 'custom'");

      const reserved = [
        'phone_number',
        'first_name',
        'last_name',
        'email',
        'timezone',
        'assigned_agent_id',
        'priority',
      ];
      if (reserved.includes(field_key))
        throw new AppError(400, `field_key '${field_key}' is system reserved`);

      const { rows } = await pool.query(
        `INSERT INTO contact_list_field_definitions
         (contact_list_id, field_key, field_label, data_type, field_type,
          is_required, display_order, is_visible_to_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          req.params.id,
          field_key,
          field_label,
          data_type || 'text',
          field_type || 'predefined',
          is_required || false,
          display_order || 99,
          is_visible_to_agent !== false,
        ],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      next(err);
    }
  },
);

// GET /contact-lists/:id/contacts
router.get(
  '/:id/contacts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;

      const perPage = Math.min(
        parseInt(
          (req.query.per_page as string) ||
            (req.query.page_size as string),
        ) || 50,
        200,
      );

      const offset = (page - 1) * perPage;

      const search = String(req.query.search || '').trim();

      const searchClause = search
        ? `AND (
            c.phone_number ILIKE $4
            OR c.first_name ILIKE $4
            OR c.last_name ILIKE $4
            OR c.email ILIKE $4
          )`
        : '';

      const params: any[] = [req.params.id, perPage, offset];

      if (search) {
        params.push(`%${search}%`);
      }

      console.log(
        '[contacts] fetching - list_id:',
        req.params.id,
        'page:',
        page,
        'perPage:',
        perPage,
        'search:',
        search,
      );

      const { rows } = await pool.query(
        `
        SELECT
          c.*,
          u.first_name || ' ' || u.last_name AS assigned_agent_name
        FROM contacts c
        LEFT JOIN users u
          ON u.id = c.assigned_agent_id
        WHERE c.contact_list_id = $1::uuid
        ${searchClause}
        ORDER BY c.priority ASC, c.created_at ASC
        LIMIT $2 OFFSET $3
        `,
        params,
      );

      console.log('[contacts] rows fetched:', rows.length);

      const countParams: any[] = [req.params.id];

      if (search) {
        countParams.push(`%${search}%`);
      }

      const total = await pool.query(
        `
        SELECT COUNT(*)::int
        FROM contacts c
        WHERE c.contact_list_id = $1::uuid
        ${
          search
            ? `AND (
                c.phone_number ILIKE $2
                OR c.first_name ILIKE $2
                OR c.last_name ILIKE $2
                OR c.email ILIKE $2
              )`
            : ''
        }
        `,
        countParams,
      );

      console.log(
        '[contacts] total count:',
        total.rows[0].count,
      );

      res.json({
        data: rows,
        total: total.rows[0].count,
        page,
        per_page: perPage,
      });
    } catch (err) {
      console.error('[contacts] ERROR:', err);
      next(err);
    }
  },
);


// Shared purger — wipes operational state referencing the supplied contacts
// then deletes them. Mirrors DELETE /contacts/:id semantics so dropping one
// contact through the list-scoped route behaves identically. Returns the
// number of `contacts` rows deleted.
async function purgeContacts(listId: string, contactIds: string[]): Promise<number> {
  if (!contactIds.length) return 0;
  let deleted = 0;
  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM campaign_contact_status WHERE contact_id = ANY($1::uuid[])`,
      [contactIds],
    );
    await client.query(
      `DELETE FROM contact_status_history WHERE contact_id = ANY($1::uuid[])`,
      [contactIds],
    );
    await client.query(
      `UPDATE agent_sessions SET current_contact_id = NULL
         WHERE current_contact_id = ANY($1::uuid[])`,
      [contactIds],
    );
    const { rowCount } = await client.query(
      `DELETE FROM contacts WHERE id = ANY($1::uuid[]) AND contact_list_id = $2`,
      [contactIds, listId],
    );
    deleted = rowCount || 0;
  });
  return deleted;
}

// DELETE /contact-lists/:id/contacts/:contactId — remove a single contact.
// List-scoped sibling of DELETE /contacts/:id so the UI can keep paths
// list-relative. Org ownership is verified via the parent list.
router.delete(
  '/:id/contacts/:contactId',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const owned = await pool.query(
        `SELECT c.id FROM contacts c
           JOIN contact_lists cl ON cl.id = c.contact_list_id
          WHERE c.id = $1 AND cl.id = $2 AND cl.org_id = $3`,
        [req.params.contactId, req.params.id, req.user!.orgId],
      );
      if (!owned.rows[0]) throw new AppError(404, 'Contact not found');
      try {
        await purgeContacts(req.params.id, [req.params.contactId]);
        res.status(204).send();
      } catch (e: any) {
        if (e?.code === '23503')
          throw new AppError(409, 'Contact has historical call activity and cannot be deleted');
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// DELETE /contact-lists/:id/contacts — wipe every contact in the list. The
// list shell itself stays. Blocked when an active job references the list
// to avoid yanking rows out from under a live dialer.
router.delete(
  '/:id/contacts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await pool.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');
      const active = await pool.query(
        `SELECT 1 FROM campaign_contact_lists ccl
           JOIN campaign_jobs cj ON cj.campaign_id = ccl.campaign_id
          WHERE ccl.contact_list_id = $1 AND cj.status = 'active' LIMIT 1`,
        [req.params.id],
      );
      if (active.rows.length)
        throw new AppError(409, 'Cannot wipe contacts while a job is active');
      const ids = await pool.query(
        `SELECT id FROM contacts WHERE contact_list_id = $1`,
        [req.params.id],
      );
      const contactIds = ids.rows.map((r: any) => r.id);
      try {
        const deleted = await purgeContacts(req.params.id, contactIds);
        res.json({ deleted });
      } catch (e: any) {
        if (e?.code === '23503')
          throw new AppError(409, 'Some contacts have historical call activity and cannot be deleted');
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// POST /contact-lists/:id/contacts/bulk-delete — wipe the supplied ids only.
// POST (not DELETE) because we need a body, and not every HTTP client/proxy
// stack supports bodies on DELETE. Body: { ids: string[] }.
router.post(
  '/:id/contacts/bulk-delete',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const rawIds: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
      const ids = rawIds.filter((s) => typeof s === 'string' && UUID_RE.test(s));
      if (!ids.length) throw new AppError(400, 'ids array required');
      const list = await pool.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');
      const active = await pool.query(
        `SELECT 1 FROM campaign_contact_lists ccl
           JOIN campaign_jobs cj ON cj.campaign_id = ccl.campaign_id
          WHERE ccl.contact_list_id = $1 AND cj.status = 'active' LIMIT 1`,
        [req.params.id],
      );
      if (active.rows.length)
        throw new AppError(409, 'Cannot delete contacts while a job is active');
      try {
        const deleted = await purgeContacts(req.params.id, ids);
        res.json({ deleted });
      } catch (e: any) {
        if (e?.code === '23503')
          throw new AppError(409, 'Some contacts have historical call activity and cannot be deleted');
        throw e;
      }
    } catch (err) {
      next(err);
    }
  },
);

// Field keys that must always be attached to every contact list.
const REQUIRED_FIELD_KEYS = ['system_contact_id'];

// Synthetic attribute representing the real `contacts.phone_number` column.
// It's not stored in org_field_library / contact_list_custom_fields — it's
// always selected, always first, and surfaces in the CSV header + UI so users
// can see/manage it like any other attribute.
const SYSTEM_PHONE_ATTR_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_PHONE_ATTR = {
  id: SYSTEM_PHONE_ATTR_ID,
  name: 'Phone Number',
  field_key: 'phone_number',
  field_type: 'system',
  data_type: 'PHONE',
  is_private: false,
  is_read_only_agent: false,
  is_masked_agent: false,
  is_masked_reports: false,
  org_id: null,
  source: 'system',
  is_selected: true,
  list_display_order: 0,
};
// Used to safely cast user-supplied ids before passing to UUID columns.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Map our library/custom data_type → contact_list_field_definitions.data_type
// (the input shape: text | number | date | boolean | url).
const DATA_TYPE_TO_INPUT_TYPE: Record<string, string> = {
  STRING: 'text',
  PHONE: 'text',
  EMAIL: 'text',
  INTEGER: 'number',
  LONG: 'number',
  FLOAT: 'number',
  TIMESTAMP: 'date',
  BOOLEAN: 'boolean',
};

// Rebuilds contact_list_field_definitions for a given list from the union of
// attached library fields + list-scoped custom fields. phone_number is
// pre-seeded separately as display_order=1, so it's skipped in the loop to
// avoid the (contact_list_id, field_key) UNIQUE violation. System keys
// (first_name, last_name, email, timezone, assigned_agent_id, priority) are
// included here when selected — downstream ingestion/agent code treats them
// as real columns on `contacts` instead of custom_fields JSONB.
// Each row carries data_type (input shape) and field_type (predefined|custom),
// the latter sourced from whether the row originated in org_field_library
// (predefined) or contact_list_custom_fields (custom).
async function syncFieldDefinitions(client: any, listId: string) {
  const { rows } = await client.query(
    `
    SELECT field_key, name, data_type, display_order, field_type FROM (
      SELECT fl.field_key, fl.name, fl.data_type, cla.display_order,
             'predefined'::text AS field_type
        FROM contact_list_attributes cla
        JOIN org_field_library fl ON fl.id = cla.field_library_id
       WHERE cla.contact_list_id = $1
      UNION ALL
      SELECT cf.field_key, cf.name, cf.data_type, cf.display_order,
             'custom'::text AS field_type
        FROM contact_list_custom_fields cf
       WHERE cf.contact_list_id = $1
    ) t
    ORDER BY display_order ASC, field_key ASC
    `,
    [listId],
  );
  await client.query(
    `DELETE FROM contact_list_field_definitions WHERE contact_list_id = $1`,
    [listId],
  );
  // Always seed phone_number as the first definition row — it's the dialing
  // target and must appear in the CSV header / agent UI even though it lives
  // as a real column on contacts (not in field_library / custom_fields).
  await client.query(
    `INSERT INTO contact_list_field_definitions
       (contact_list_id, field_key, field_label, data_type, field_type,
        is_required, display_order, is_visible_to_agent)
     VALUES ($1,'phone_number','Phone Number','text','predefined',true,1,true)`,
    [listId],
  );
  let pos = 1;
  for (const r of rows) {
    if (r.field_key === 'phone_number') continue;
    pos += 1;
    const inputType =
      DATA_TYPE_TO_INPUT_TYPE[String(r.data_type).toUpperCase()] || 'text';
    await client.query(
      `INSERT INTO contact_list_field_definitions
         (contact_list_id, field_key, field_label, data_type, field_type,
          is_required, display_order, is_visible_to_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        listId,
        r.field_key,
        r.name,
        inputType,
        r.field_type,
        REQUIRED_FIELD_KEYS.includes(r.field_key),
        pos,
        true,
      ],
    );
  }
  return pos;
}

// GET /contact-lists/:id/attributes
// Returns a unified list of attributes available for this list:
//   • source='library'     → predefined / org library fields (selectable)
//   • source='custom_list' → list-scoped custom fields (always selected)
router.get(
  '/:id/attributes',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await pool.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      const { rows } = await pool.query(
        `
        SELECT fl.id, fl.name, fl.field_key, fl.field_type, fl.data_type,
               fl.is_private, fl.is_read_only_agent, fl.is_masked_agent,
               fl.is_masked_reports, fl.org_id,
               'library'::text AS source,
               (cla.contact_list_id IS NOT NULL) AS is_selected,
               cla.display_order AS list_display_order
          FROM org_field_library fl
          LEFT JOIN contact_list_attributes cla
            ON cla.field_library_id = fl.id AND cla.contact_list_id = $1
         WHERE (fl.org_id = $2 OR fl.org_id IS NULL)
           AND fl.field_key <> 'phone_number'
        UNION ALL
        SELECT cf.id, cf.name, cf.field_key, 'custom'::text AS field_type,
               cf.data_type,
               cf.is_private, cf.is_read_only_agent, cf.is_masked_agent,
               cf.is_masked_reports, NULL::uuid AS org_id,
               'custom_list'::text AS source,
               TRUE AS is_selected,
               cf.display_order AS list_display_order
          FROM contact_list_custom_fields cf
         WHERE cf.contact_list_id = $1
         ORDER BY is_selected DESC, list_display_order ASC NULLS LAST, name ASC
        `,
        [req.params.id, req.user!.orgId],
      );
      // Prepend the synthetic phone_number row (real column on contacts; not
      // stored as a library/custom field but always required for dialing).
      res.json({ data: [SYSTEM_PHONE_ATTR, ...rows] });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /contact-lists/:id/attributes
// Body: { ids: string[] } — ordered list of attribute IDs from either source.
// Server resolves each ID against org_field_library and contact_list_custom_fields.
// Library IDs replace contact_list_attributes; custom IDs only get re-ordered.
router.put(
  '/:id/attributes',
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const rawIdsAll: string[] = Array.isArray(req.body?.ids)
        ? req.body.ids
        : Array.isArray(req.body?.field_library_ids)
          ? req.body.field_library_ids
          : [];
      // Drop the synthetic phone_number id and any non-UUID input before
      // touching UUID-typed columns.
      const rawIds = rawIdsAll.filter(
        (id) => id !== SYSTEM_PHONE_ATTR_ID && UUID_RE.test(id),
      );

      const list = await client.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      // Resolve each ID to its source table.
      const libRes = await client.query(
        `SELECT id FROM org_field_library
          WHERE id = ANY($1::uuid[]) AND (org_id = $2 OR org_id IS NULL)`,
        [
          rawIds.length ? rawIds : ['00000000-0000-0000-0000-000000000000'],
          req.user!.orgId,
        ],
      );
      const libSet = new Set<string>(libRes.rows.map((r: any) => r.id));

      const cusRes = await client.query(
        `SELECT id FROM contact_list_custom_fields
          WHERE id = ANY($1::uuid[]) AND contact_list_id = $2`,
        [
          rawIds.length ? rawIds : ['00000000-0000-0000-0000-000000000000'],
          req.params.id,
        ],
      );
      const cusSet = new Set<string>(cusRes.rows.map((r: any) => r.id));

      // Force-include required library fields.
      const reqRes = await client.query(
        `SELECT id FROM org_field_library
          WHERE field_key = ANY($1::text[]) AND org_id IS NULL`,
        [REQUIRED_FIELD_KEYS],
      );
      const requiredIds: string[] = reqRes.rows.map((r: any) => r.id);
      const orderedLib: string[] = [];
      const orderedCus: string[] = [];
      for (const id of rawIds) {
        if (libSet.has(id) && !orderedLib.includes(id)) orderedLib.push(id);
        else if (cusSet.has(id) && !orderedCus.includes(id))
          orderedCus.push(id);
      }
      for (const rid of requiredIds)
        if (!orderedLib.includes(rid)) orderedLib.unshift(rid);

      await client.query('BEGIN');
      await client.query(
        `DELETE FROM contact_list_attributes WHERE contact_list_id = $1`,
        [req.params.id],
      );
      // Combined order so library + custom interleave consistently.
      let pos = 0;
      for (const lid of orderedLib) {
        pos += 1;
        await client.query(
          `INSERT INTO contact_list_attributes (contact_list_id, field_library_id, display_order)
           VALUES ($1, $2, $3)`,
          [req.params.id, lid, pos],
        );
      }
      for (const cid of orderedCus) {
        pos += 1;
        await client.query(
          `UPDATE contact_list_custom_fields SET display_order = $1
            WHERE id = $2 AND contact_list_id = $3`,
          [pos, cid, req.params.id],
        );
      }
      // Mirror the unified selection into contact_list_field_definitions so the
      // legacy ingest path (validateContact) sees the same set of fields.
      const defs = await syncFieldDefinitions(client, req.params.id);
      await client.query('COMMIT');
      res.json({
        attached_library: orderedLib.length,
        attached_custom: orderedCus.length,
        field_definitions: defs,
      });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  },
);

// GET /contact-lists/:id/csv-template
// Returns a CSV file with one header row of the attached attributes' field_keys.
router.get(
  '/:id/csv-template',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const list = await pool.query(
        `SELECT name FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      const { rows } = await pool.query(
        `
        SELECT field_key, display_order FROM (
          SELECT fl.field_key, cla.display_order
            FROM contact_list_attributes cla
            JOIN org_field_library fl ON fl.id = cla.field_library_id
           WHERE cla.contact_list_id = $1
          UNION ALL
          SELECT cf.field_key, cf.display_order
            FROM contact_list_custom_fields cf
           WHERE cf.contact_list_id = $1
        ) t
        ORDER BY display_order ASC, field_key ASC
        `,
        [req.params.id],
      );
      // Always prepend phone_number — it's the dialing target and lives as a
      // real column on contacts (never in field_library / field_definitions).
      const header = ['phone_number', ...rows.map((r) => r.field_key)].join(
        ',',
      );
      const safeName = (list.rows[0].name || 'contacts').replace(
        /[^a-z0-9_-]+/gi,
        '_',
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeName}_template.csv"`,
      );
      res.send(header + '\n');
    } catch (err) {
      next(err);
    }
  },
);

// Allowed data types for list-scoped custom fields.
const CUSTOM_DATA_TYPES = new Set([
  'STRING',
  'INTEGER',
  'FLOAT',
  'LONG',
  'PHONE',
  'EMAIL',
  'TIMESTAMP',
  'BOOLEAN',
]);

const toFieldKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// POST /contact-lists/:id/custom-fields
// Bulk-create list-scoped custom field definitions.
// Body: { fields: [{ name, data_type, is_private?, is_read_only_agent?,
//                    is_masked_agent?, is_masked_reports? }] }
router.post(
  '/:id/custom-fields',
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const fields: any[] = Array.isArray(req.body?.fields)
        ? req.body.fields
        : [];
      if (!fields.length) throw new AppError(400, 'fields array required');

      const list = await client.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      // Compute next display_order = max across both attribute sources + 1.
      const maxRes = await client.query(
        `
        SELECT COALESCE(MAX(display_order), 0) AS m FROM (
          SELECT display_order FROM contact_list_attributes WHERE contact_list_id = $1
          UNION ALL
          SELECT display_order FROM contact_list_custom_fields WHERE contact_list_id = $1
        ) t
        `,
        [req.params.id],
      );
      let nextOrder = Number(maxRes.rows[0].m) || 0;

      const cleaned = fields.map((f: any) => {
        const name = String(f.name || '').trim();
        if (!name) throw new AppError(400, 'Each field requires a name');
        const data_type = String(f.data_type || 'STRING').toUpperCase();
        if (!CUSTOM_DATA_TYPES.has(data_type))
          throw new AppError(400, `Invalid data_type: ${data_type}`);
        return {
          name,
          field_key: toFieldKey(name),
          data_type,
          is_private: !!f.is_private,
          is_read_only_agent: !!f.is_read_only_agent,
          is_masked_agent: !!f.is_masked_agent,
          is_masked_reports: !!f.is_masked_reports,
          is_editable_agent: f.is_editable_agent !== false,
        };
      });
      const keys = cleaned.map((c) => c.field_key);
      if (new Set(keys).size !== keys.length)
        throw new AppError(400, 'Duplicate field names in request');

      await client.query('BEGIN');
      const inserted: any[] = [];
      for (const c of cleaned) {
        nextOrder += 1;
        const { rows } = await client.query(
  `INSERT INTO contact_list_custom_fields
     (contact_list_id, name, field_key, data_type,
      is_private, is_read_only_agent, is_masked_agent, is_masked_reports,
      is_editable_agent, display_order, created_by)        -- ← add column
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)             -- ← add $9
   RETURNING *`,
  [
    req.params.id,
    c.name,
    c.field_key,
    c.data_type,
    c.is_private,
    c.is_read_only_agent,
    c.is_masked_agent,
    c.is_masked_reports,
    c.is_editable_agent,  // ← add this
    nextOrder,
    req.user!.userId,
  ],
);
        inserted.push(rows[0]);
        // Mirror into the org-scoped library so the field is reusable across
        // lists in the same org. Conflicts (same field_key already present
        // in the org library) are no-ops — the existing row stays.
        await client.query(
  `INSERT INTO org_field_library
     (org_id, name, field_key, field_type, data_type,
      is_private, is_read_only_agent, is_masked_agent, is_masked_reports,
      is_editable_agent, display_order, created_by)        -- ← add column
   VALUES ($1,$2,$3,'custom',$4,$5,$6,$7,$8,$9,99,$10)    -- ← add $9
   ON CONFLICT (org_id, field_key) DO NOTHING`,
  [
    req.user!.orgId,
    c.name,
    c.field_key,
    c.data_type,
    c.is_private,
    c.is_read_only_agent,
    c.is_masked_agent,
    c.is_masked_reports,
    c.is_editable_agent,  // ← add this
    req.user!.userId,
  ],
);
      }
      await syncFieldDefinitions(client, req.params.id);
      await client.query('COMMIT');
      res.status(201).json({ data: inserted });
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505')
        return next(
          new AppError(
            409,
            'A custom field with this key already exists for this list',
          ),
        );
      next(err);
    } finally {
      client.release();
    }
  },
);

// PATCH /contact-lists/:id/custom-fields/:fid
// Edit a saved list-scoped custom field. field_key is immutable (it's the
// JSONB key in contacts.custom_fields — renaming would orphan stored values).
router.patch(
  '/:id/custom-fields/:fid',
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const list = await client.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      const b = req.body || {};
      const name = b.name != null ? String(b.name).trim() : undefined;
      if (name === '') throw new AppError(400, 'name cannot be empty');
      let data_type: string | undefined;
      if (b.data_type != null) {
        data_type = String(b.data_type).toUpperCase();
        if (!CUSTOM_DATA_TYPES.has(data_type))
          throw new AppError(400, `Invalid data_type: ${data_type}`);
      }

      await client.query('BEGIN');
      const { rows } = await client.query(
  `UPDATE contact_list_custom_fields SET
     name               = COALESCE($1, name),
     data_type          = COALESCE($2, data_type),
     is_private         = COALESCE($3, is_private),
     is_read_only_agent = COALESCE($4, is_read_only_agent),
     is_masked_agent    = COALESCE($5, is_masked_agent),
     is_masked_reports  = COALESCE($6, is_masked_reports),
     is_editable_agent  = COALESCE($7, is_editable_agent)  -- ← add this
   WHERE id = $8 AND contact_list_id = $9                  -- ← bump param nums
   RETURNING *`,
  [
    name ?? null,
    data_type ?? null,
    b.is_private != null ? !!b.is_private : null,
    b.is_read_only_agent != null ? !!b.is_read_only_agent : null,
    b.is_masked_agent != null ? !!b.is_masked_agent : null,
    b.is_masked_reports != null ? !!b.is_masked_reports : null,
    b.is_editable_agent != null ? !!b.is_editable_agent : null, // ← add
    req.params.fid,
    req.params.id,
  ],
);
      if (!rows[0]) {
        await client.query('ROLLBACK');
        throw new AppError(404, 'Custom field not found');
      }
      await syncFieldDefinitions(client, req.params.id);
      await client.query('COMMIT');
      res.json({ data: rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  },
);

// DELETE /contact-lists/:id/custom-fields/:fid
router.delete(
  '/:id/custom-fields/:fid',
  async (req: Request, res: Response, next: NextFunction) => {
    const client = await pool.connect();
    try {
      const list = await client.query(
        `SELECT id FROM contact_lists WHERE id = $1 AND org_id = $2`,
        [req.params.id, req.user!.orgId],
      );
      if (!list.rows[0]) throw new AppError(404, 'Contact list not found');

      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `DELETE FROM contact_list_custom_fields
          WHERE id = $1 AND contact_list_id = $2`,
        [req.params.fid, req.params.id],
      );
      if (!rowCount) {
        await client.query('ROLLBACK');
        throw new AppError(404, 'Custom field not found');
      }
      await syncFieldDefinitions(client, req.params.id);
      await client.query('COMMIT');
      res.json({ deleted: true });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  },
);

export default router;
