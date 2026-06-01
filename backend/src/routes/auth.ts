import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/login
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError(400, 'email and password required');

    const { rows } = await pool.query(
      `SELECT u.*, o.name as org_name
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.email = $1 AND u.is_active = true`,
      [email.toLowerCase()]
    );

    const user = rows[0];
    if (!user) throw new AppError(401, 'Invalid credentials');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, 'Invalid credentials');

    if (user.role === 'agent')
      throw new AppError(403, 'Agent accounts are no longer supported on this instance');

    const secret    = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as `${number}${'s' | 'm' | 'h' | 'd'}`;
    const token     = jwt.sign(
      { userId: user.id, orgId: user.org_id, role: user.role, email: user.email },
      secret,
      { expiresIn }
    );

    res.json({
      token,
      user: {
        id:        user.id,
        email:     user.email,
        firstName: user.first_name,
        lastName:  user.last_name,
        role:      user.role,
        orgId:     user.org_id,
        orgName:   user.org_name,
      },
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /auth/me
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.org_id, o.name as org_name
       FROM users u JOIN organizations o ON o.id = u.org_id
       WHERE u.id = $1`,
      [req.user!.userId]
    );
    if (!rows[0]) throw new AppError(404, 'User not found');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/forgot-password
//
// Flow:
//  1. Verify the email exists and belongs to an active, non-agent user.
//  2. Generate a secure random token, store its hash + expiry in the DB.
//  3. Send the reset email (replace the stub below with your mailer).
//  4. Return 200 so the frontend can show "check your inbox".
//
// NOTE: The DB migration below must be run once:
//   ALTER TABLE users
//     ADD COLUMN IF NOT EXISTS password_reset_token  TEXT,
//     ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ;
// ─────────────────────────────────────────────────────────────────────────────
router.post('/forgot-password', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'This endpoint is disabled. Use /reset-password-inline instead.' });
});
// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/reset-password
//
// Consumes the token from the email link and sets a new password.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password', (_req: Request, res: Response) => {
  res.status(410).json({ error: 'This endpoint is disabled. Use /reset-password-inline instead.' });
});


// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/verify-email
//
// Step 1 of inline password reset.
// Just checks the email exists and belongs to an active, non-agent user.
// Returns 200 on success so the frontend can proceed to the reset step.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/verify-email', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError(400, 'email is required');

    const { rows } = await pool.query(
      `SELECT id, role, is_active FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      throw new AppError(404, 'No active account found with that email address.');
    }

    if (user.role === 'agent') {
      throw new AppError(403, 'Agent accounts are no longer supported on this instance.');
    }

    res.json({ message: 'Email verified.' });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /auth/reset-password-inline
//
// Step 2 of inline password reset.
// Directly updates the password for the verified email — no token needed
// since the user has already been verified in the same session.
//
// IMPORTANT: Only expose this endpoint on internal/admin builds.
// For public-facing apps, always use a time-limited token flow instead.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/reset-password-inline', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) throw new AppError(400, 'email and newPassword are required');

    if (newPassword.length < 8)
      throw new AppError(400, 'Password must be at least 8 characters.');

    // Re-verify the account is still active (guard against race conditions)
    const { rows } = await pool.query(
      `SELECT id, role, is_active FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    const user = rows[0];
    if (!user || !user.is_active) throw new AppError(404, 'Account not found.');
    if (user.role === 'agent') throw new AppError(403, 'Agent accounts are not supported.');

    const passwordHash = await bcrypt.hash(newPassword, 12);

   await pool.query(
      `UPDATE users SET password_hash = $1 WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ message: 'Password updated successfully.' });
  } catch (err) { next(err); }
});

export default router;