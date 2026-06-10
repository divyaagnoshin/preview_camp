/**
 * users.ts  —  User Management Routes  (Preview Campaign backend)
 *
 * Mounted in index.ts:
 *   app.use('/v1/users', usersRouter);
 *
 * ═══════════════════════════════════════════════════════════════
 * ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 *  preview_campaign DB (pool)        agnoconnew DB (agnoPool)
 *  ─────────────────────────         ────────────────────────
 *  public.users                      public.user_details
 *    id          uuid PK               userid       varchar(10) PK ← pure numeric "1001"
 *    email       text                  email_id     varchar(50)
 *    password_hash text                password     varchar(50)  ← plain text (legacy)
 *    role        text                  role_id      integer      ← 2=supervisor, 3=agent
 *    is_active   boolean               status       varchar(10)  ← 'Active'|'Inactive'
 *    sip_extension text                extension_id integer      ← SIP extension (int)
 *    sip_password  text                reporting_to integer      ← integer FK (agnocon users)
 *    reporting_to  text  ←─ stores ANY reporting_to (UUID admin or agnocon userid)
 *
 * WHO LIVES WHERE
 *   • Admin accounts  → preview_campaign.users  (role='admin')
 *   • Agents/Supervisors → agnoconnew.user_details (role_id 2 or 3)
 *                          + mirrored into preview_campaign.users for SIP + reporting_to storage
 *
 * CREATE FLOW  (POST /v1/users)
 *   1. Validate inputs
 *   2. Generate numeric userid (e.g. "1001") by MAX(userid)+1 from agnoconnew
 *   3. INSERT into agnoconnew.user_details  (primary record — AgnoCon login)
 *   4. UPSERT into preview_campaign.users   (mirror — stores sip_password + reporting_to text)
 *
 * SIP EXTENSION
 *   • Sent by frontend as a string e.g. "1001"
 *   • Stored as integer in agnoconnew.extension_id
 *   • Stored as text   in preview_campaign.users.sip_extension
 *   • sip_password stored ONLY in preview_campaign.users (agnoconnew has no such column)
 *
 * REPORTING_TO
 *   • Frontend sends a string: either a UUID (admin) or a numeric agnocon userid string
 *   • preview_campaign.users.reporting_to  stores the raw string (text column) ← always
 *   • agnoconnew.user_details.reporting_to stores the integer  ← only when it's a numeric id
 *     (UUID admin ids cannot be stored in the integer column — they are skipped there)
 */

import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';           // preview_campaign DB
import agnoPool from '../db/agnoPool';  // agnoconnew DB
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ['agent', 'supervisor'] as const;
type AllowedRole = (typeof ALLOWED_ROLES)[number];

function assertAllowedRole(role: unknown): asserts role is AllowedRole {
  if (!ALLOWED_ROLES.includes(role as AllowedRole))
    throw new AppError(400, `role must be one of: ${ALLOWED_ROLES.join(', ')}`);
}

function roleToId(role: AllowedRole): number {
  return role === 'supervisor' ? 2 : 4;
}

/**
 * Generate the next numeric userid for agnoconnew.user_details.
 * Finds the highest existing numeric userid and increments it.
 * Falls back to 1001 if the table is empty.
 * Result is returned as a string (column type is varchar(10)).
 */
async function nextAgnoUserId(): Promise<string> {
  const { rows } = await agnoPool.query(`
    SELECT COALESCE(MAX(userid::integer), 1000) + 1 AS next_id
    FROM user_details
    WHERE userid ~ '^[0-9]+$'
  `);
  return String(rows[0].next_id);
}

/**
 * Parse a reporting_to value coming from the frontend:
 *   - If it looks purely numeric ("1001") → returns the integer (for agnoconnew)
 *   - If it's a UUID or any other string   → returns null   (cannot store in integer column)
 */
function reportingToInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null; // UUID admins — skip the agnoconnew integer column
}


// ─────────────────────────────────────────────────────────────
// GET /v1/users
// List agents and supervisors.
// Admin → sees all.  Supervisor → sees agents only.
// ─────────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, orgId } = req.user!;

      // Supervisors only see agents
      const roleFilter = role === 'supervisor'
        ? 'WHERE role_id = 4'
        : 'WHERE role_id IN (2, 4)';

      // ── Step 1: fetch agents/supervisors from agnoconnew ──
      // NO cross-DB JOIN — agnoconnew has no "users" table.
      const { rows: agnoRows } = await agnoPool.query(`
        SELECT
          userid                                                         AS id,
          first_name,
          last_name,
          email_id                                                       AS email,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END      AS role,
          CASE WHEN LOWER(status) = 'active' THEN true ELSE false END   AS is_active,
          reporting_to::text,
          extension_id::text                                             AS sip_extension,
          created_date                                                   AS created_at,
          updated_date                                                   AS updated_at
        FROM user_details
        ${roleFilter}
        ORDER BY first_name, last_name
      `);

      // ── Step 2: fetch the mirror rows from preview_campaign ──
      // These hold sip_password and the full reporting_to text (including UUID admins).
      const emails = agnoRows.map((r: any) => r.email.toLowerCase());
      let pvMap: Record<string, { sip_password: string | null; reporting_to: string | null }> = {};

      if (emails.length > 0) {
        const { rows: pvRows } = await pool.query(`
          SELECT LOWER(email) AS email, sip_password, reporting_to
          FROM users
          WHERE org_id = $1
            AND LOWER(email) = ANY($2::text[])
        `, [orgId, emails]);

        pvRows.forEach((r: any) => {
          pvMap[r.email] = { sip_password: r.sip_password, reporting_to: r.reporting_to };
        });
      }

      // ── Step 3: merge ──
      const rows = agnoRows.map((r: any) => {
        const pv = pvMap[r.email.toLowerCase()];
        return {
          ...r,
          sip_password: pv?.sip_password ?? null,
          reporting_to: pv?.reporting_to ?? r.reporting_to ?? null,
        };
      });

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/users/reporting-options
// Merged dropdown list for "Reporting To":
//   • Admins from preview_campaign.users
//   • Supervisors + Agents from agnoconnew.user_details
//
// Must be declared BEFORE /:id to avoid route collision.
// ─────────────────────────────────────────────────────────────
router.get(
  '/reporting-options',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      // Admins from preview_campaign (org-scoped)
      const { rows: adminRows } = await pool.query(`
        SELECT
          id::text           AS id,
          first_name,
          last_name,
          email,
          'admin'            AS role,
          'preview_campaign' AS source
        FROM users
        WHERE org_id = $1
          AND role = 'admin'
          AND is_active = true
        ORDER BY first_name, last_name
      `, [orgId]);

      // Agents + supervisors from agnoconnew (not org-scoped in agnoconnew)
      const { rows: agnoRows } = await agnoPool.query(`
        SELECT
          userid             AS id,
          first_name,
          last_name,
          email_id           AS email,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END AS role,
          'agnoconnew'       AS source
        FROM user_details
        WHERE role_id IN (2, 4)
          AND LOWER(status) = 'active'
        ORDER BY first_name, last_name
      `);

      res.json({ data: [...adminRows, ...agnoRows] });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/users/roles/available
// Must be declared BEFORE /:id.
// ─────────────────────────────────────────────────────────────
router.get(
  '/roles/available',
  requireRole('admin', 'supervisor'),
  (req: Request, res: Response) => {
    const { role } = req.user!;
    const roles: AllowedRole[] = role === 'admin'
      ? ['agent', 'supervisor']
      : ['agent'];
    res.json({ data: roles });
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/users/extensions
// Returns UNASSIGNED, active SIP extensions from agnoconnew.extensions.
//
// Mirrors AgnoCon's own extensionselect logic exactly:
//   SELECT extension_id FROM extensions
//   WHERE status = 'Active'
//     AND extension_id NOT IN (
//       SELECT CAST(extension_id AS text) FROM user_details
//       WHERE extension_id IS NOT NULL
//     )
//
// When editing an existing user we also include their currently-assigned
// extension so it appears pre-selected in the dropdown (pass ?current=<id>).
//
// extensions table columns used:
//   extension_id   — the SIP extension number (PK, text)
//   effective_name — friendly label e.g. "Sales Line 1"  (nullable)
//   status         — 'Active' | 'Inactive'
//
// NOTE: The agnoconnew extensions table does NOT have an "effetive_number"
// column — that was a typo in an earlier draft.  Only extension_id and
// effective_name are returned.
// ─────────────────────────────────────────────────────────────
router.get(
  '/extensions',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const current = req.query.current ? String(req.query.current).trim() : null;

      const { rows } = await agnoPool.query(`
        SELECT
          extension_id::text AS extension_id,
          effective_name
        FROM extensions
        WHERE LOWER(status) = 'active'
          AND company_id = 1
          AND (
            extension_id NOT IN (
              SELECT CAST(extension_id AS TEXT)
              FROM user_details
              WHERE extension_id IS NOT NULL
             
            )
            ${current ? `OR extension_id = $1` : ''}
          )
        ORDER BY extension_id
      `, current ? [current] : []);

      res.json({ data: rows });
    } catch (err) {
      next(err);
    }
  },
);
// ─────────────────────────────────────────────────────────────
// GET /v1/users/:id
// ─────────────────────────────────────────────────────────────
router.get(
  '/:id',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      // ── Step 1: fetch from agnoconnew (no cross-DB JOIN) ──
      const { rows: agnoRows } = await agnoPool.query(`
        SELECT
          userid                                                         AS id,
          first_name,
          last_name,
          email_id                                                       AS email,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END      AS role,
          CASE WHEN LOWER(status) = 'active' THEN true ELSE false END   AS is_active,
          reporting_to::text,
          extension_id::text                                             AS sip_extension,
          created_date                                                   AS created_at,
          updated_date                                                   AS updated_at
        FROM user_details
        WHERE userid = $1
          AND role_id IN (2, 3)
      `, [req.params.id]);

      if (!agnoRows[0]) throw new AppError(404, 'User not found');

      // ── Step 2: fetch mirror row from preview_campaign ──
      const { rows: pvRows } = await pool.query(`
        SELECT sip_password, reporting_to
        FROM users
        WHERE org_id = $1 AND LOWER(email) = $2
      `, [orgId, agnoRows[0].email.toLowerCase()]);

      const pv = pvRows[0];
      const row = {
        ...agnoRows[0],
        sip_password: pv?.sip_password ?? null,
        reporting_to: pv?.reporting_to ?? agnoRows[0].reporting_to ?? null,
      };

      res.json(row);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /v1/users
// Create a new agent or supervisor.
// Admin only.
//
// Body:
// {
//   "first_name":    "John",
//   "last_name":     "Doe",
//   "email":         "john@example.com",
//   "password":      "Str0ngPass!",       ← min 8 chars, stored in agnoconnew (plain) + preview (bcrypt not needed for agents)
//   "role":          "agent",             ← or "supervisor"
//   "reporting_to":  "550e8400-...",      ← UUID (admin) or numeric string (agnocon user) — optional
//   "sip_extension": "1001",              ← optional, stored as integer in agnoconnew
//   "sip_password":  "sippass123"         ← optional, stored ONLY in preview_campaign.users
// }
// ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId, userId: createdBy } = req.user!;
      const {
        first_name, last_name, email, password, role,
        reporting_to, sip_extension, sip_password,
      } = req.body || {};

      // ── Validate ──────────────────────────────────────────
      if (!first_name?.trim()) throw new AppError(400, 'first_name is required');
      if (!last_name?.trim()) throw new AppError(400, 'last_name is required');
      if (!email?.trim()) throw new AppError(400, 'email is required');
      if (!password || typeof password !== 'string' || password.length < 8)
        throw new AppError(400, 'password must be at least 8 characters');
      assertAllowedRole(role);

      const normalizedEmail = String(email).toLowerCase().trim();

      // ── Duplicate check in agnoconnew ─────────────────────
      const { rows: dupAgno } = await agnoPool.query(
        `SELECT userid FROM user_details WHERE LOWER(email_id) = $1`,
        [normalizedEmail],
      );
      if (dupAgno.length > 0)
        throw new AppError(409, 'A user with this email already exists');

      // ── Generate numeric userid for agnoconnew ────────────
      // agnoconnew.user_details.userid is varchar(10) but historically
      // stores pure numeric values ("1001", "1002" …).
      const userid = await nextAgnoUserId();

      // ── Parse optional fields ─────────────────────────────
      const roleId = roleToId(role);
      const rtInt = reportingToInt(reporting_to);     // integer or null
      const rtText = reporting_to ? String(reporting_to).trim() : null; // raw string

      const sipExtRaw = sip_extension ? String(sip_extension).trim() : null;
      const sipExtInt: number | null = sipExtRaw ? (parseInt(sipExtRaw, 10) || null) : null;

      // ── INSERT into agnoconnew.user_details ───────────────
      const { rows: agnoRows } = await agnoPool.query(`
        INSERT INTO user_details (
          userid, first_name, last_name, email_id,
          password, role_id, reporting_to, extension_id,
          status, created_date, created_by
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          'Active', NOW(), $9
        )
        RETURNING
          userid          AS id,
          first_name,
          last_name,
          email_id        AS email,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END AS role,
          true            AS is_active,
          reporting_to::text,
          extension_id::text  AS sip_extension,
          created_date    AS created_at,
          updated_date    AS updated_at
      `, [
        userid,
        first_name.trim(),
        last_name.trim(),
        normalizedEmail,
        password,                          // plain text — agnoconnew legacy
        roleId,
        rtInt,                             // integer reporting_to (null for UUID admins)
        sipExtInt,                         // integer extension_id
        String(createdBy).slice(0, 10),   // created_by varchar(10)
      ]);

      // ── UPSERT into preview_campaign.users ────────────────
      // This mirrors the record so that:
      //   • sip_password is stored (agnoconnew has no such column)
      //   • reporting_to as full text (UUID admin or numeric string) is stored
      //   • sip_extension as text is stored for preview_campaign lookups
      //
      // password_hash is left empty ('') — agents do NOT log into
      // preview_campaign, only into AgnoCon. This row exists purely
      // as a data mirror / credential store.
      try {
        await pool.query(`
          INSERT INTO users (
            org_id, email, password_hash,
            first_name, last_name, role,
            is_active, sip_extension, sip_password, reporting_to
          ) VALUES (
            $1, $2, '',
            $3, $4, $5,
            true, $6, $7, $8
          )
          ON CONFLICT (org_id, email) DO UPDATE SET
            first_name    = EXCLUDED.first_name,
            last_name     = EXCLUDED.last_name,
            role          = EXCLUDED.role,
            is_active     = true,
            sip_extension = EXCLUDED.sip_extension,
            sip_password  = EXCLUDED.sip_password,
            reporting_to  = EXCLUDED.reporting_to,
            updated_at    = NOW()
        `, [
          orgId,
          normalizedEmail,
          first_name.trim(),
          last_name.trim(),
          role,
          sipExtRaw,           // text sip_extension
          sip_password || null,
          rtText,              // full text reporting_to (UUID or numeric)
        ]);
      } catch (mirrorErr) {
        // Mirror failure is non-fatal — agnoconnew is the source of truth.
        // Log and continue so the response still returns the created user.
        console.error('[users] Mirror to preview_campaign failed:', mirrorErr);
      }

      res.status(201).json({
        ...agnoRows[0],
        // Overlay the richer text values from what we just stored
        reporting_to: rtText,
        sip_password: sip_password || null,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /v1/users/:id
// Update an agent or supervisor.
// Admin only.
// ─────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;
      const {
        first_name, last_name, email, role, is_active,
        password, reporting_to, sip_extension, sip_password,
      } = req.body || {};

      // ── Verify user exists in agnoconnew ──────────────────
      const { rows: existing } = await agnoPool.query(
        `SELECT userid, email_id FROM user_details WHERE userid = $1 AND role_id IN (2, 3)`,
        [req.params.id],
      );
      if (!existing[0]) throw new AppError(404, 'User not found');

      const currentEmail = existing[0].email_id as string;

      // ── Validate ──────────────────────────────────────────
      if (role !== undefined) assertAllowedRole(role);
      if (email !== undefined && !String(email).trim())
        throw new AppError(400, 'email must be a non-empty string');
      if (password !== undefined && (typeof password !== 'string' || password.length < 8))
        throw new AppError(400, 'password must be at least 8 characters');

      // ── Build agnoconnew SET clause ───────────────────────
      const agnoSet: string[] = ['updated_date = NOW()'];
      const agnoParams: unknown[] = [];
      let ai = 1;

      if (first_name !== undefined) {
        agnoSet.push(`first_name = $${ai++}`);
        agnoParams.push(String(first_name).trim());
      }
      if (last_name !== undefined) {
        agnoSet.push(`last_name = $${ai++}`);
        agnoParams.push(String(last_name).trim());
      }
      if (email !== undefined) {
        const ne = String(email).toLowerCase().trim();
        // Duplicate check excluding self
        const { rows: dup } = await agnoPool.query(
          `SELECT userid FROM user_details WHERE LOWER(email_id) = $1 AND userid <> $2`,
          [ne, req.params.id],
        );
        if (dup.length > 0)
          throw new AppError(409, 'Another user with this email already exists');
        agnoSet.push(`email_id = $${ai++}`);
        agnoParams.push(ne);
      }
      if (role !== undefined) {
        agnoSet.push(`role_id = $${ai++}`);
        agnoParams.push(roleToId(role));
      }
      if (is_active !== undefined) {
        agnoSet.push(`status = $${ai++}`);
        agnoParams.push(Boolean(is_active) ? 'Active' : 'Inactive');
      }
      if (password !== undefined) {
        agnoSet.push(`password = $${ai++}`);
        agnoParams.push(password);  // plain text in agnoconnew
      }
      if (reporting_to !== undefined) {
        // Store integer in agnoconnew only if it's numeric
        agnoSet.push(`reporting_to = $${ai++}`);
        agnoParams.push(reportingToInt(reporting_to));
      }
      if (sip_extension !== undefined) {
        const sipExtInt = sip_extension
          ? (parseInt(String(sip_extension), 10) || null)
          : null;
        agnoSet.push(`extension_id = $${ai++}`);
        agnoParams.push(sipExtInt);
      }

      agnoParams.push(req.params.id);

      const { rows: agnoRows } = await agnoPool.query(`
        UPDATE user_details
        SET ${agnoSet.join(', ')}
        WHERE userid = $${ai}
        RETURNING
          userid          AS id,
          first_name,
          last_name,
          email_id        AS email,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END AS role,
          CASE WHEN LOWER(status) = 'active' THEN true ELSE false END AS is_active,
          reporting_to::text,
          extension_id::text AS sip_extension,
          created_date    AS created_at,
          updated_date    AS updated_at
      `, agnoParams);

      // ── Mirror changes to preview_campaign.users ──────────
      try {
        const updatedEmail = (email
          ? String(email).toLowerCase().trim()
          : currentEmail).toLowerCase();

        const pvSet: string[] = ['updated_at = NOW()'];
        const pvParams: unknown[] = [];
        let pi = 1;

        if (first_name !== undefined) { pvSet.push(`first_name = $${pi++}`); pvParams.push(String(first_name).trim()); }
        if (last_name !== undefined) { pvSet.push(`last_name = $${pi++}`); pvParams.push(String(last_name).trim()); }
        if (email !== undefined) { pvSet.push(`email = $${pi++}`); pvParams.push(String(email).toLowerCase().trim()); }
        if (role !== undefined) { pvSet.push(`role = $${pi++}`); pvParams.push(role); }
        if (is_active !== undefined) { pvSet.push(`is_active = $${pi++}`); pvParams.push(Boolean(is_active)); }
        if (reporting_to !== undefined) {
          pvSet.push(`reporting_to = $${pi++}`);
          pvParams.push(reporting_to ? String(reporting_to).trim() : null);
        }
        if (sip_extension !== undefined) {
          pvSet.push(`sip_extension = $${pi++}`);
          pvParams.push(sip_extension ? String(sip_extension).trim() : null);
        }
        if (sip_password !== undefined && sip_password) {
          pvSet.push(`sip_password = $${pi++}`);
          pvParams.push(sip_password);
        }

        pvParams.push(orgId, updatedEmail);

        await pool.query(`
          UPDATE users
          SET ${pvSet.join(', ')}
          WHERE org_id = $${pi++} AND LOWER(email) = $${pi}
        `, pvParams);
      } catch (mirrorErr) {
        console.error('[users] Mirror update to preview_campaign failed:', mirrorErr);
      }

      // Return with the richer reporting_to text if it was updated
      const result = agnoRows[0];
      if (reporting_to !== undefined) {
        result.reporting_to = reporting_to ? String(reporting_to).trim() : null;
      }
      if (sip_password !== undefined) {
        result.sip_password = sip_password || null;
      }

      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─────────────────────────────────────────────────────────────
// DELETE /v1/users/:id
// Soft-delete if user has interactions, otherwise hard-delete.
// Admin only.
// ─────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      const { rows: existing } = await agnoPool.query(
        `SELECT userid, email_id FROM user_details WHERE userid = $1 AND role_id IN (2, 3)`,
        [req.params.id],
      );
      if (!existing[0]) throw new AppError(404, 'User not found');

      const userEmail = existing[0].email_id as string;

      // Check for linked call interactions in agnoconnew
      let hasInteractions = false;
      try {
        const { rows: linked } = await agnoPool.query(
          `SELECT 1 FROM contact_interactions WHERE agent_id = $1 LIMIT 1`,
          [req.params.id],
        );
        hasInteractions = linked.length > 0;
      } catch {
        // Table may not exist in this agnoconnew instance — skip check
      }

      if (hasInteractions) {
        // Soft-delete: deactivate in both DBs
        await agnoPool.query(
          `UPDATE user_details SET status = 'Inactive', updated_date = NOW() WHERE userid = $1`,
          [req.params.id],
        );
        try {
          await pool.query(
            `UPDATE users SET is_active = false, updated_at = NOW()
             WHERE org_id = $1 AND LOWER(email) = $2`,
            [orgId, userEmail.toLowerCase()],
          );
        } catch (e) { console.error('[users] Mirror deactivate failed:', e); }

        return res.json({
          message: 'User deactivated (has existing interactions, cannot be fully removed)',
        });
      }

      // Hard-delete from agnoconnew
      await agnoPool.query(`DELETE FROM user_details WHERE userid = $1`, [req.params.id]);

      // Also remove the mirror row from preview_campaign
      try {
        await pool.query(
          `DELETE FROM users WHERE org_id = $1 AND LOWER(email) = $2 AND role IN ('agent','supervisor')`,
          [orgId, userEmail.toLowerCase()],
        );
      } catch (e) { console.error('[users] Mirror delete failed:', e); }

      res.json({ message: 'User deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;