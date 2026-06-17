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
 *    password_hash text                password     varchar(50)  ← DES-CBC encrypted Base64
 *    role        text                  role_id      integer      ← 2=supervisor, 4=agent
 *    is_active   boolean               status       varchar(10)  ← 'Active'|'Inactive'
 *    sip_extension text                extension_id integer      ← SIP extension (int)
 *    sip_password  text                reporting_to integer      ← integer FK (agnocon users)
 *    reporting_to  text  ←─ stores ANY reporting_to (UUID admin or agnocon userid)
 *                                      username     varchar(50)  ← login username
 *                                      mobile_no    bigint       ← mobile number
 *
 * WHO LIVES WHERE
 *   • Admin accounts     → preview_campaign.users  (role='admin')
 *   • Agents/Supervisors → agnoconnew.user_details ONLY
 *                          preview_campaign.users is NOT touched on create/update —
 *                          it only stores sip_password + reporting_to for agents
 *                          that were previously mirrored, and is read for GET merges.
 *
 * CREATE FLOW  (POST /v1/users)
 *   1. Validate inputs (all required fields enforced)
 *   2. Generate numeric userid (e.g. "1001") by MAX(userid)+1 from agnoconnew
 *   3. Encrypt password using AgnoCon DES-CBC scheme (see agnoEncrypt below)
 *   4. INSERT into agnoconnew.user_details  (only DB written to on create)
 *   5. Sync to agnoconnew.agents table (agents only)
 *
 * PASSWORD ENCRYPTION
 *   AgnoCon's Encryption64.cs uses:
 *     Algorithm : DES-CBC
 *     Key       : UTF-8 bytes of "AB45XS87"  (8 bytes)
 *     IV        : [0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF]
 *     Output    : Base64 string
 *   The password stored in user_details.password must be this encrypted form
 *   so that AgnoCon's AuthController can decrypt and compare it on login.
 *
 * REQUIRED FIELDS
 *   first_name, last_name, mobile_no, email, password, role,
 *   username, sip_extension
 */

import { Router, Request, Response, NextFunction } from 'express';
import forge from 'node-forge';
import pool from '../db/pool';           // preview_campaign DB  (read-only for GET merges)
import agnoPool from '../db/agnoPool';   // agnoconnew DB        (primary write target)
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─────────────────────────────────────────────────────────────
// AgnoCon DES-CBC encryption  (mirrors Encryption64.cs exactly)
// ─────────────────────────────────────────────────────────────

/** Key = UTF-8 bytes of PassW.Substring(0, 8) = "AB45XS87" */
// ADD these replacements using node-forge:
const AGNO_KEY = 'AB45XS87';
const AGNO_IV = String.fromCharCode(0x12, 0x34, 0x56, 0x78, 0x90, 0xAB, 0xCD, 0xEF);

function agnoEncrypt(plainText: string): string {
  const cipher = forge.cipher.createCipher('DES-CBC', AGNO_KEY);
  cipher.start({ iv: AGNO_IV });
  cipher.update(forge.util.createBuffer(plainText, 'utf8'));
  cipher.finish();
  return forge.util.encode64(cipher.output.getBytes());
}

export function agnoDecrypt(encryptedBase64: string): string {
  const decipher = forge.cipher.createDecipher('DES-CBC', AGNO_KEY);
  decipher.start({ iv: AGNO_IV });
  decipher.update(
    forge.util.createBuffer(
      forge.util.decode64(encryptedBase64.replace(/ /g, '+')),
    ),
  );
  decipher.finish();
  return decipher.output.toString();
}
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
 * Falls back to 1001 if the table is empty.
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
 * Parse reporting_to:
 *   purely numeric string → integer (for agnoconnew integer column)
 *   UUID / anything else  → null   (cannot store in integer column)
 */
function reportingToInt(value: string | null | undefined): number | null {
  if (!value) return null;
  const s = String(value).trim();
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
}

/**
 * Validate and return mobile number (7–15 digits).
 */
function parseMobileNo(value: unknown): string {
  const s = String(value ?? '').trim();
  if (!/^\d{7,15}$/.test(s))
    throw new AppError(400, 'mobile_no must be a valid number (7–15 digits)');
  return s;
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

      const roleFilter =
        role === 'supervisor'
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

      // ── Step 2: fetch sip_password + reporting_to from preview_campaign mirror ──
      const emails = agnoRows.map((r: any) => r.email.toLowerCase());
      let pvMap: Record<
        string,
        { sip_password: string | null; reporting_to: string | null }
      > = {};

      if (emails.length > 0) {
        const { rows: pvRows } = await pool.query(
          `
          SELECT LOWER(email) AS email, sip_password, reporting_to
          FROM users
          WHERE org_id = $1
            AND LOWER(email) = ANY($2::text[])
        `,
          [orgId, emails],
        );
        pvRows.forEach((r: any) => {
          pvMap[r.email] = {
            sip_password: r.sip_password,
            reporting_to: r.reporting_to,
          };
        });
      }

      // ── Step 3: merge sip_password / reporting_to from preview_campaign ──
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
// ─────────────────────────────────────────────────────────────
router.get(
  '/reporting-options',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { orgId } = req.user!;

      const { rows: adminRows } = await pool.query(
        `
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
      `,
        [orgId],
      );

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
// ─────────────────────────────────────────────────────────────
router.get(
  '/roles/available',
  requireRole('admin', 'supervisor'),
  (req: Request, res: Response) => {
    const { role } = req.user!;
    const roles: AllowedRole[] =
      role === 'admin' ? ['agent', 'supervisor'] : ['agent'];
    res.json({ data: roles });
  },
);

// ─────────────────────────────────────────────────────────────
// GET /v1/users/extensions
// ─────────────────────────────────────────────────────────────
router.get(
  '/extensions',
  requireRole('admin', 'supervisor'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const current = req.query.current
        ? String(req.query.current).trim()
        : null;

      const { rows } = await agnoPool.query(
        `
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
      `,
        current ? [current] : [],
      );

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

      const { rows: agnoRows } = await agnoPool.query(
        `
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
      `,
        [req.params.id],
      );

      if (!agnoRows[0]) throw new AppError(404, 'User not found');

      // Merge sip_password from preview_campaign mirror row (read-only)
      const { rows: pvRows } = await pool.query(
        `
        SELECT sip_password, reporting_to
        FROM users
        WHERE org_id = $1 AND LOWER(email) = $2
      `,
        [orgId, agnoRows[0].email.toLowerCase()],
      );

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
// Writes ONLY to agnoconnew.user_details (and agnoconnew.agents).
// Does NOT write to preview_campaign.users.
//
// Required body fields:
//   first_name, last_name, mobile_no, email, password, role,
//   username, sip_extension
//
// Optional:
//   reporting_to  — UUID (admin) or numeric string (agnocon user)
//   sip_password  — stored in preview_campaign.users mirror if present
// ─────────────────────────────────────────────────────────────
router.post(
  '/',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId: createdBy } = req.user!;
      const {
        first_name,
        last_name,
        mobile_no,
        email,
        password,
        role,
        username,
        reporting_to,
        sip_extension,
        sip_password,
      } = req.body || {};

      // ── Validate required fields ───────────────────────────
      if (!first_name?.trim())
        throw new AppError(400, 'first_name is required');
      if (!last_name?.trim())
        throw new AppError(400, 'last_name is required');
      if (!mobile_no)
        throw new AppError(400, 'mobile_no is required');
      if (!email?.trim())
        throw new AppError(400, 'email is required');
      if (!password || typeof password !== 'string' || password.length < 8)
        throw new AppError(400, 'password must be at least 8 characters');
      if (!username?.trim())
        throw new AppError(400, 'username is required');
      if (!sip_extension)
        throw new AppError(400, 'sip_extension is required');
      assertAllowedRole(role);

      const mobileNoParsed = parseMobileNo(mobile_no);
      const normalizedEmail = String(email).toLowerCase().trim();
      const normalizedUsername = String(username).trim();

      // ── Duplicate checks ───────────────────────────────────
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

      // ── Generate numeric userid ────────────────────────────
      const userid = await nextAgnoUserId();

      // ── Prepare values ─────────────────────────────────────
      const roleId = roleToId(role);
      const rtInt = reportingToInt(reporting_to);
      const rtText = reporting_to ? String(reporting_to).trim() : null;
      const sipExtInt: number | null = sip_extension
        ? parseInt(String(sip_extension).trim(), 10) || null
        : null;

      // Encrypt password using AgnoCon's DES-CBC scheme so AgnoCon login works
      const encryptedPassword = agnoEncrypt(password);

      // ── INSERT into agnoconnew.user_details (only DB written) ──
      const { rows: agnoRows } = await agnoPool.query(
        `
        INSERT INTO user_details (
          userid, first_name, last_name, mobile_no, email_id,
          username, password, role_id, reporting_to, extension_id,
          status, created_date, created_by, company_id
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          'Active', NOW(), $11, '1'
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
      `,
        [
          userid,
          first_name.trim(),
          last_name.trim(),
          mobileNoParsed,
          normalizedEmail,
          normalizedUsername,
          encryptedPassword,   // DES-CBC Base64 — matches AgnoCon AuthController
          roleId,
          rtInt,
          sipExtInt,
          String(createdBy).slice(0, 10),
        ],
      );

      // ── Sync to agnoconnew.agents (agents only) ───────────
      if (role === 'agent') {
        try {
          const contactStr = sipExtInt
            ? `[leg_timeout=20]user/${sipExtInt}`
            : 'user/undefined';
          const { rowCount } = await agnoPool.query(
            `UPDATE agents SET contact = $2 WHERE name = $1`,
            [userid, contactStr],
          );
          if (rowCount === 0) {
            await agnoPool.query(
              `
              INSERT INTO agents (
                name, instance_id, uuid, type, contact, status, state,
                max_no_answer, wrap_up_time, reject_delay_time, busy_delay_time, no_answer_delay_time,
                last_bridge_start, last_bridge_end, last_offered_call, last_status_change,
                no_answer_count, calls_answered, talk_time, ready_time, external_calls_count
              ) VALUES (
                $1, 'single_box', '', 'callback', $2, 'Logged Out', 'Waiting',
                5, 30, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0, 0
              )
            `,
              [userid, contactStr],
            );
          }
        } catch (agentErr: any) {
          console.error('agents table sync error:', agentErr);
          throw new AppError(
            500,
            `User created but failed to sync agents table: ${agentErr.message}`,
          );
        }
      }

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
// Writes ONLY to agnoconnew.user_details (and agnoconnew.agents).
// Does NOT write to preview_campaign.users.
//
// All fields optional; only provided fields are updated.
// ─────────────────────────────────────────────────────────────
router.patch(
  '/:id',
  requireRole('admin'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        first_name,
        last_name,
        mobile_no,
        email,
        role,
        is_active,
        password,
        username,
        reporting_to,
        sip_extension,
        sip_password,
      } = req.body || {};

      // ── Verify user exists ─────────────────────────────────
      const { rows: existing } = await agnoPool.query(
        `SELECT userid, email_id, role_id FROM user_details WHERE userid = $1 AND role_id IN (2, 4)`,
        [req.params.id],
      );
      if (!existing[0]) throw new AppError(404, 'User not found');

      // ── Validate provided fields ───────────────────────────
      if (role !== undefined) assertAllowedRole(role);
      if (email !== undefined && !String(email).trim())
        throw new AppError(400, 'email must be a non-empty string');
      if (
        password !== undefined &&
        (typeof password !== 'string' || password.length < 8)
      )
        throw new AppError(400, 'password must be at least 8 characters');
      if (username !== undefined && !String(username).trim())
        throw new AppError(400, 'username must be a non-empty string');
      if (mobile_no !== undefined) parseMobileNo(mobile_no);

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
        // Encrypt with AgnoCon DES-CBC scheme so AgnoCon login continues to work
        agnoSet.push(`password = $${ai++}`);
        agnoParams.push(agnoEncrypt(String(password)));
      }
      if (reporting_to !== undefined) {
        agnoSet.push(`reporting_to = $${ai++}`);
        agnoParams.push(reportingToInt(reporting_to));
      }
      if (sip_extension !== undefined) {
        const sipExtInt = sip_extension
          ? parseInt(String(sip_extension), 10) || null
          : null;
        agnoSet.push(`extension_id = $${ai++}`);
        agnoParams.push(sipExtInt);
      }

      agnoParams.push(req.params.id);

      // ── UPDATE agnoconnew.user_details ────────────────────
      const { rows: agnoRows } = await agnoPool.query(
        `
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
      `,
        agnoParams,
      );

      // ── Update agnoconnew.agents if SIP extension changed ─
      const isAgentNow =
        role === 'agent' ||
        (role === undefined && existing[0].role_id === 4);

      if (isAgentNow && sip_extension !== undefined) {
        const contactStr = sip_extension
          ? `[leg_timeout=20]user/${sip_extension}`
          : 'user/undefined';
        const { rowCount } = await agnoPool.query(
          `UPDATE agents SET contact = $2 WHERE name = $1`,
          [req.params.id, contactStr],
        );
        if (rowCount === 0) {
          await agnoPool.query(
            `
            INSERT INTO agents (
              name, instance_id, uuid, type, contact, status, state,
              max_no_answer, wrap_up_time, reject_delay_time, busy_delay_time, no_answer_delay_time,
              last_bridge_start, last_bridge_end, last_offered_call, last_status_change,
              no_answer_count, calls_answered, talk_time, ready_time, external_calls_count
            ) VALUES (
              $1, 'single_box', '', 'callback', $2, 'Logged Out', 'Waiting',
              5, 30, 0, 0, 0,
              0, 0, 0, 0,
              0, 0, 0, 0, 0
            )
          `,
            [req.params.id, contactStr],
          );
        }
      } else if (role === 'supervisor') {
        // Role changed to supervisor — remove from agents table
        await agnoPool.query(`DELETE FROM agents WHERE name = $1`, [
          req.params.id,
        ]);
      }

      const result = agnoRows[0];
      if (reporting_to !== undefined)
        result.reporting_to = reporting_to
          ? String(reporting_to).trim()
          : null;
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

      let hasInteractions = false;
      try {
        const { rows: linked } = await agnoPool.query(
          `SELECT 1 FROM contact_interactions WHERE agent_id = $1 LIMIT 1`,
          [req.params.id],
        );
        hasInteractions = linked.length > 0;
      } catch {
        // Table may not exist in this instance — skip check
      }

      if (hasInteractions) {
        // Soft-delete: deactivate in agnoconnew; also deactivate preview_campaign mirror if exists
        await agnoPool.query(
          `UPDATE user_details SET status = 'Inactive', updated_date = NOW() WHERE userid = $1`,
          [req.params.id],
        );
        await pool.query(
          `UPDATE users SET is_active = false WHERE org_id = $1 AND LOWER(email) = $2`,
          [orgId, userEmail.toLowerCase()],
        );
        return res.json({
          message:
            'User deactivated (has existing interactions, cannot be fully removed)',
        });
      }

      // Hard-delete from agnoconnew (primary); also clean up any mirror row
      await agnoPool.query(`DELETE FROM user_details WHERE userid = $1`, [
        req.params.id,
      ]);
      await agnoPool.query(`DELETE FROM agents WHERE name = $1`, [
        req.params.id,
      ]);
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