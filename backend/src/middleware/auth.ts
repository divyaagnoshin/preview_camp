import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  orgId: string;
  role: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

// Accepts UUIDs we'd plausibly find in the org table; loose enough to cover
// non-v4 variants while still rejecting anything that would blow up a query.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret') as AuthPayload;
    req.user = payload;

    // Superadmin can act inside any tenant by sending X-Org-Context. The
    // header overrides the JWT's orgId so existing org-scoped queries see
    // the chosen tenant's data without per-route changes. Other roles must
    // not be able to escape their org via this header.
    if (payload.role === 'superadmin') {
      const ctx = req.headers['x-org-context'];
      if (typeof ctx === 'string' && UUID_RE.test(ctx)) {
        req.user = { ...payload, orgId: ctx };
      }
    }
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid or expired' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Superadmin is the highest privilege tier and bypasses role gates so the
    // same admin-only mutations work transparently for cross-tenant management.
    if (
      !req.user ||
      (req.user.role !== 'superadmin' && !roles.includes(req.user.role))
    ) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
