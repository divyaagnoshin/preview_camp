import bcrypt from 'bcryptjs';
import pool from './pool';

// System organisation that owns the superadmin user. The schema requires
// users.org_id NOT NULL, so we host the platform-level superadmin under a
// reserved "System" org which never participates in tenant-scoped queries.
const SYSTEM_ORG_NAME = 'System';
const SUPERADMIN_EMAIL = 'superadmin@system.local';
const SUPERADMIN_PASSWORD = 'SuperAdmin@123';

// Boots the platform superadmin if it doesn't already exist. Runs on every
// backend boot — both inserts are idempotent so re-runs are no-ops.
export async function seedSuperadmin(): Promise<void> {
  try {
    const orgRes = await pool.query(
      `SELECT id FROM organizations WHERE name = $1 LIMIT 1`,
      [SYSTEM_ORG_NAME],
    );
    let orgId: string | undefined = orgRes.rows[0]?.id;
    if (!orgId) {
      const ins = await pool.query(
        `INSERT INTO organizations (name, description)
         VALUES ($1, 'Platform-level system organisation (superadmin)')
         RETURNING id`,
        [SYSTEM_ORG_NAME],
      );
      orgId = ins.rows[0].id;
    }

    const userRes = await pool.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [SUPERADMIN_EMAIL],
    );
    if (userRes.rows[0]) return;

    const hash = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO users (org_id, email, password_hash, first_name, last_name, role)
       VALUES ($1, $2, $3, 'Super', 'Admin', 'superadmin')`,
      [orgId, SUPERADMIN_EMAIL, hash],
    );
    console.log(`✓ Seeded superadmin (${SUPERADMIN_EMAIL} / ${SUPERADMIN_PASSWORD})`);
  } catch (err) {
    console.error('Superadmin seed failed:', err);
  }
}
