import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAuth, supabase } from '../../shared/db/supabase.client';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middleware/auth.middleware';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const router = Router();

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = LoginSchema.parse(req.body);

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw AppError.unauthorized('Invalid email or password');
  }

  // Enrich with profile
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('id, full_name, role, operator_id, is_active')
    .eq('id', data.user.id)
    .single();

  if (!profile?.is_active) {
    throw AppError.forbidden('Account is deactivated');
  }

  res.json({
    data: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile.full_name,
        role: profile.role,
        operator_id: profile.operator_id,
      },
    },
  });
});

// POST /auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refresh_token } = z.object({ refresh_token: z.string() }).parse(req.body);

  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  res.json({
    data: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
  });
});

// GET /auth/me
router.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ data: req.user });
});

export default router;
