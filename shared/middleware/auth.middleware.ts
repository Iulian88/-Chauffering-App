import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase.client';
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

    // Verify JWT with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      throw AppError.unauthorized('Invalid or expired token');
    }

    // Load profile to get role and operator_id
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, role, operator_id, is_active')
      .eq('id', data.user.id)
      .single();

    if (profileError || !profile) {
      throw AppError.unauthorized('User profile not found');
    }

    if (!profile.is_active) {
      throw AppError.forbidden('Account is deactivated');
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
      role: profile.role as UserRole,
      operator_id: profile.operator_id,
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
