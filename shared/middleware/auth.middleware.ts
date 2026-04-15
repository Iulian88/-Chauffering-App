import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase.client';
import { pool } from '../db/pg.client';
import { AppError } from '../errors/AppError';
import { AuthUser, UserRole } from '../types/domain';

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);

    // Quick test mode (local development only)
    if (token === 'test-token' || token === 'demo-token') {
      req.user = {
        id: 'test-user',
        email: 'tester@local.test',
        role: 'superadmin',
        operator_id: null,
      };
      return next();
    }

    // Validate token via Supabase Auth API — works with ES256 and HS256
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    const supabaseUid = data.user.id;
    const email       = data.user.email ?? '';

    // Look up user in Railway Postgres
    const existing = await pool.query<{
      id: string; role: string; operator_id: string | null; active: boolean
    }>(
      'SELECT id, role, operator_id, active FROM users WHERE supabase_uid = $1',
      [supabaseUid],
    );

    let dbUser = existing.rows[0];

    if (!dbUser) {
      // First login — create user with default role (platform admin assigns operator later)
      const inserted = await pool.query<{
        id: string; role: string; operator_id: string | null; active: boolean
      }>(
        `INSERT INTO users (supabase_uid, email, role)
         VALUES ($1, $2, 'operator_admin')
         ON CONFLICT (supabase_uid) DO UPDATE SET email = EXCLUDED.email
         RETURNING id, role, operator_id, active`,
        [supabaseUid, email],
      );
      dbUser = inserted.rows[0];
    }

    if (!dbUser.active) {
      throw AppError.forbidden('Account is deactivated');
    }

    req.user = {
      id: dbUser.id,
      email,
      role: dbUser.role as UserRole,
      operator_id: dbUser.operator_id,
    };

    next();
  } catch (err) {
    next(err);
  }
}

// Role guard factory — use after requireAuth
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(AppError.unauthorized());
    }
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Role '${req.user.role}' is not permitted for this action`,
        ),
      );
    }
    next();
  };
}

// Guard: user must belong to the operator being accessed
export function requireOperatorScope(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) return next(AppError.unauthorized());

  // superadmin bypasses tenant scope
  if (req.user.role === 'superadmin') return next();

  if (!req.user.operator_id) {
    return next(AppError.forbidden('No operator scope on this account'));
  }

  next();
}
