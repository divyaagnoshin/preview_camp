import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../db/pool';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

// POST /auth/login
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

    // Agent workflow has been removed from the product; existing rows in the
    // users table with role='agent' must not be able to obtain a token.
    if (user.role === 'agent')
      throw new AppError(403, 'Agent accounts are no longer supported on this instance');

    const secret = process.env.JWT_SECRET || 'dev-secret';
    const expiresIn = (process.env.JWT_EXPIRES_IN || '8h') as `${number}${'s'|'m'|'h'|'d'}`;
    const token = jwt.sign(
      { userId: user.id, orgId: user.org_id, role: user.role, email: user.email },
      secret,
      { expiresIn }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        orgId: user.org_id,
        orgName: user.org_name,
      }
    });
  } catch (err) { next(err); }
});

// GET /auth/me
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

export default router;
