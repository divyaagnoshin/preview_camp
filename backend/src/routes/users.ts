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
 *    role        text                  role_id      integer      ← 2=supervisor, 4=agent
 *    is_active   boolean               status       varchar(10)  ← 'Active'|'Inactive'
 *    sip_extension text                extension_id integer      ← SIP extension (int)
 *    sip_password  text                reporting_to integer      ← integer FK (agnocon users)
 *    reporting_to  text  ←─ stores ANY reporting_to (UUID admin or agnocon userid)
 *                                      username     varchar(50)  ← login username
 *                                      mobile_no    bigint       ← mobile number
 *
 * WHO LIVES WHERE
 *   • Admin accounts  → preview_campaign.users  (role='admin')
 *   • Agents/Supervisors → agnoconnew.user_details (role_id 2 or 4)
 *                          + mirrored into preview_campaign.users for SIP + reporting_to storage
 *
 * CREATE FLOW  (POST /v1/users)
 *   1. Validate inputs (all required fields enforced)
 *   2. Generate numeric userid (e.g. "1001") by MAX(userid)+1 from agnoconnew
 *   3. INSERT into agnoconnew.user_details  (primary record — AgnoCon login)
 *   4. UPSERT into preview_campaign.users   (mirror — stores sip_password + reporting_to text)
 *
 * REQUIRED FIELDS
 *   first_name, last_name, mobile_no, email, password, role,
 *   username, sip_extension
 *
 * GET /v1/users
 *   Returns ONLY active users (status = 'Active').
 *   No status column in response — all returned users are active.
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

/**
 * Validate mobile number: must be a positive integer (7–15 digits).
 */
function parseMobileNo(value: unknown): bigint {
  const s = String(value ?? '').trim();
  if (!/^\d{7,15}$/.test(s))
    throw new AppError(400, 'mobile_no must be a valid number (7–15 digits)');
  return BigInt(s);
}

// ─────────────────────────────────────────────────────────────
// GET /v1/users
// List ACTIVE agents and supervisors only.
// Admin → sees all active.  Supervisor → sees active agents only.
// ─────────────────────────────────────────────────────────────
router.get(
  '/',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { role, orgId } = req.user!;

      // Supervisors only see agents; always filter to Active only
      const roleFilter = role === 'supervisor'
        ? `WHERE role_id = 4 AND LOWER(status) = 'active'`
        : `WHERE role_id IN (2, 4) AND LOWER(status) = 'active'`;

      // ── Step 1: fetch active agents/supervisors from agnoconnew ──
      const { rows: agnoRows } = await agnoPool.query(`
        SELECT
          userid                                                         AS id,
          first_name,
          last_name,
          mobile_no::text,
          email_id                                                       AS email,
          username,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END      AS role,
          reporting_to::text,
          extension_id::text                                             AS sip_extension,
          created_date                                                   AS created_at,
          updated_date                                                   AS updated_at
        FROM user_details
        ${roleFilter}
        ORDER BY first_name, last_name
      `);

      // ── Step 2: fetch the mirror rows from preview_campaign ──
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
//   • Supervisors from agnoconnew.user_details (active only)
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

      // Active supervisors from agnoconnew
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
// Pass ?current=<id> to also include the currently-assigned extension.
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

      const { rows: agnoRows } = await agnoPool.query(`
        SELECT
          userid                                                         AS id,
          first_name,
          last_name,
          mobile_no::text,
          email_id                                                       AS email,
          username,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END      AS role,
          reporting_to::text,
          extension_id::text                                             AS sip_extension,
          created_date                                                   AS created_at,
          updated_date                                                   AS updated_at
        FROM user_details
        WHERE userid = $1
          AND role_id IN (2, 4)
      `, [req.params.id]);

      if (!agnoRows[0]) throw new AppError(404, 'User not found');

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
// Required body fields:
//   first_name, last_name, mobile_no, email, password, role,
//   username, sip_extension
//
// Optional:
//   reporting_to  — UUID (admin) or numeric string (agnocon user)
//   sip_password  — stored ONLY in preview_campaign.users
// ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId, userId: createdBy } = req.user!;
      const {
        first_name, last_name, mobile_no, email, password, role,
        username, reporting_to, sip_extension, sip_password,
      } = req.body || {};

      // ── Validate required fields ───────────────────────────
      if (!first_name?.trim()) throw new AppError(400, 'first_name is required');
      if (!last_name?.trim()) throw new AppError(400, 'last_name is required');
      if (!mobile_no) throw new AppError(400, 'mobile_no is required');
      if (!email?.trim()) throw new AppError(400, 'email is required');
      if (!password || typeof password !== 'string' || password.length < 8)
        throw new AppError(400, 'password must be at least 8 characters');
      if (!username?.trim()) throw new AppError(400, 'username is required');
      if (!sip_extension) throw new AppError(400, 'sip_extension is required');
      assertAllowedRole(role);

      const mobileNoParsed = parseMobileNo(mobile_no);
      const normalizedEmail = String(email).toLowerCase().trim();
      const normalizedUsername = String(username).trim();

      // ── Duplicate checks in agnoconnew ────────────────────
      const { rows: dupEmail } = await agnoPool.query(
        `SELECT userid FROM user_details WHERE LOWER(email_id) = $1`,
        [normalizedEmail],
      );
      if (dupEmail.length > 0)
        throw new AppError(409, 'A user with this email already exists');

      const { rows: dupUsername } = await agnoPool.query(
        `SELECT userid FROM user_details WHERE LOWER(username) = $1`,
        [normalizedUsername.toLowerCase()],
      );
      if (dupUsername.length > 0)
        throw new AppError(409, 'A user with this username already exists');

      // ── Generate numeric userid for agnoconnew ────────────
      const userid = await nextAgnoUserId();

      // ── Parse optional/computed fields ────────────────────
      const roleId = roleToId(role);
      const rtInt = reportingToInt(reporting_to);
      const rtText = reporting_to ? String(reporting_to).trim() : null;
      const sipExtInt: number | null = sip_extension
        ? (parseInt(String(sip_extension).trim(), 10) || null)
        : null;

      // ── INSERT into agnoconnew.user_details ───────────────
      const { rows: agnoRows } = await agnoPool.query(`
        INSERT INTO user_details (
          userid, first_name, last_name, mobile_no, email_id,
          username, password, role_id, reporting_to, extension_id,
          status, created_date, created_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          'Active', NOW(), $11
        )
        RETURNING
          userid              AS id,
          first_name,
          last_name,
          mobile_no::text,
          email_id            AS email,
          username,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END AS role,
          reporting_to::text,
          extension_id::text  AS sip_extension,
          created_date        AS created_at,
          updated_date        AS updated_at
      `, [
        userid,
        first_name.trim(),
        last_name.trim(),
        mobileNoParsed,
        normalizedEmail,
        normalizedUsername,
        password,                          // plain text — agnoconnew legacy
        roleId,
        rtInt,
        sipExtInt,
        String(createdBy).slice(0, 10),
      ]);

      // ── UPSERT into preview_campaign.users ────────────────
      await pool.query(`
        INSERT INTO users (email, role, is_active, sip_extension, sip_password, reporting_to, org_id, password_hash)
        VALUES ($1, $2, true, $3, $4, $5, $6, '')
        ON CONFLICT (email) DO UPDATE
          SET sip_extension = EXCLUDED.sip_extension,
              sip_password  = EXCLUDED.sip_password,
              reporting_to  = EXCLUDED.reporting_to,
              is_active     = true
      `, [
        normalizedEmail,
        role,
        String(sipExtInt ?? ''),
        sip_password || null,
        rtText,
        orgId,
      ]);

      res.status(201).json({
        ...agnoRows[0],
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
//
// All fields optional; only provided fields are updated.
// username and email uniqueness are checked excluding self.
// ─────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;
      const {
        first_name, last_name, mobile_no, email, role, is_active,
        password, username, reporting_to, sip_extension, sip_password,
      } = req.body || {};

      // ── Verify user exists in agnoconnew ──────────────────
      const { rows: existing } = await agnoPool.query(
        `SELECT userid, email_id FROM user_details WHERE userid = $1 AND role_id IN (2, 4)`,
        [req.params.id],
      );
      if (!existing[0]) throw new AppError(404, 'User not found');

      // ── Validate provided fields ───────────────────────────
      if (role !== undefined) assertAllowedRole(role);
      if (email !== undefined && !String(email).trim())
        throw new AppError(400, 'email must be a non-empty string');
      if (password !== undefined && (typeof password !== 'string' || password.length < 8))
        throw new AppError(400, 'password must be at least 8 characters');
      if (username !== undefined && !String(username).trim())
        throw new AppError(400, 'username must be a non-empty string');
      if (mobile_no !== undefined) parseMobileNo(mobile_no); // validates format

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
      if (mobile_no !== undefined) {
        agnoSet.push(`mobile_no = $${ai++}`);
        agnoParams.push(parseMobileNo(mobile_no));
      }
      if (email !== undefined) {
        const ne = String(email).toLowerCase().trim();
        const { rows: dup } = await agnoPool.query(
          `SELECT userid FROM user_details WHERE LOWER(email_id) = $1 AND userid <> $2`,
          [ne, req.params.id],
        );
        if (dup.length > 0)
          throw new AppError(409, 'Another user with this email already exists');
        agnoSet.push(`email_id = $${ai++}`);
        agnoParams.push(ne);
      }
      if (username !== undefined) {
        const nu = String(username).trim();
        const { rows: dupU } = await agnoPool.query(
          `SELECT userid FROM user_details WHERE LOWER(username) = $1 AND userid <> $2`,
          [nu.toLowerCase(), req.params.id],
        );
        if (dupU.length > 0)
          throw new AppError(409, 'Another user with this username already exists');
        agnoSet.push(`username = $${ai++}`);
        agnoParams.push(nu);
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
        agnoParams.push(password);
      }
      if (reporting_to !== undefined) {
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
          userid              AS id,
          first_name,
          last_name,
          mobile_no::text,
          email_id            AS email,
          username,
          CASE WHEN role_id = 2 THEN 'supervisor' ELSE 'agent' END AS role,
          CASE WHEN LOWER(status) = 'active' THEN true ELSE false END AS is_active,
          reporting_to::text,
          extension_id::text  AS sip_extension,
          created_date        AS created_at,
          updated_date        AS updated_at
      `, agnoParams);

      // ── Update preview_campaign mirror if relevant fields changed ──
      const pvSet: string[] = [];
      const pvParams: unknown[] = [];
      let pi = 1;

      if (sip_extension !== undefined) {
        pvSet.push(`sip_extension = $${pi++}`);
        pvParams.push(sip_extension ? String(sip_extension) : null);
      }
      if (sip_password !== undefined) {
        pvSet.push(`sip_password = $${pi++}`);
        pvParams.push(sip_password || null);
      }
      if (reporting_to !== undefined) {
        pvSet.push(`reporting_to = $${pi++}`);
        pvParams.push(reporting_to ? String(reporting_to).trim() : null);
      }
      if (is_active !== undefined) {
        pvSet.push(`is_active = $${pi++}`);
        pvParams.push(Boolean(is_active));
      }

      if (pvSet.length > 0) {
        const lookupEmail = email
          ? String(email).toLowerCase().trim()
          : existing[0].email_id.toLowerCase();
        pvParams.push(orgId, lookupEmail);
        await pool.query(`
          UPDATE users
          SET ${pvSet.join(', ')}
          WHERE org_id = $${pi} AND LOWER(email) = $${pi + 1}
        `, pvParams);
      }

      const result = agnoRows[0];
      if (reporting_to !== undefined)
        result.reporting_to = reporting_to ? String(reporting_to).trim() : null;
      if (sip_password !== undefined)
        result.sip_password = sip_password || null;

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
        `SELECT userid, email_id FROM user_details WHERE userid = $1 AND role_id IN (2, 4)`,
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
        await pool.query(
          `UPDATE users SET is_active = false WHERE org_id = $1 AND LOWER(email) = $2`,
          [orgId, userEmail.toLowerCase()],
        );

        return res.json({
          message: 'User deactivated (has existing interactions, cannot be fully removed)',
        });
      }

      // Hard-delete from both DBs
      await agnoPool.query(`DELETE FROM user_details WHERE userid = $1`, [req.params.id]);
      await pool.query(
        `DELETE FROM users WHERE org_id = $1 AND LOWER(email) = $2`,
        [orgId, userEmail.toLowerCase()],
      );

      res.json({ message: 'User deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;