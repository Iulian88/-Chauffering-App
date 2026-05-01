import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase, supabaseAuth } from '../../shared/db/supabase.client';
import { pool } from '../../shared/db/pg.client';
import { AppError } from '../../shared/errors/AppError';
import { requireAuth } from '../../shared/middleware/auth.middleware';
import { updateFcmToken } from './users.repository';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  full_name: z.string().min(1).max(255).trim(),
});

const router = Router();

// POST /auth/register — self-service client registration
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, full_name } = RegisterSchema.parse(req.body);

  // 1. Create user in Supabase Auth via service-role (email_confirm: true skips
  //    the confirmation email so clients can log in immediately).
  const { data: adminData, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createError || !adminData?.user) {
    if (createError?.message?.toLowerCase().includes('already registered')) {
      throw AppError.conflict('An account with this email already exists');
    }
    throw AppError.internal('Could not create account. Please try again later.');
  }

  const supabaseUid = adminData.user.id;

  // 2. Insert the client profile into Railway Postgres.
  //    On any failure we roll back the Supabase user so nothing is left dangling.
  try {
    await pool.query(
      `INSERT INTO users (supabase_uid, email, full_name, role)
       VALUES ($1, $2, $3, 'client')`,
      [supabaseUid, email, full_name],
    );
  } catch (dbErr: any) {
    await supabase.auth.admin.deleteUser(supabaseUid);
    if (dbErr.code === '23505') {
      throw AppError.conflict('An account with this email already exists');
    }
    throw dbErr;
  }

  // 3. Auto sign-in so the response includes a ready-to-use token.
  const { data: sessionData, error: signInError } =
    await supabaseAuth.auth.signInWithPassword({ email, password });

  if (signInError || !sessionData?.session) {
    // Account created but auto-login failed — not critical, client can call /login.
    res.status(201).json({ data: { message: 'Account created. Please log in.' } });
    return;
  }

  res.status(201).json({
    data: {
      access_token: sessionData.session.access_token,
      refresh_token: sessionData.session.refresh_token,
      expires_in: sessionData.session.expires_in,
      user: {
        id: adminData.user.id,
        email,
        full_name,
        role: 'client',
        operator_id: null,
      },
    },
  });
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = LoginSchema.parse(req.body);

  const { data, error } = await supabaseAuth.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw AppError.unauthorized('Invalid email or password');
  }

  // Enrich with profile (supabase_uid = Supabase Auth UUID, id = Railway internal UUID)
  const { rows } = await pool.query(
    `SELECT id, full_name, role, operator_id, active AS is_active FROM users WHERE supabase_uid = $1`,
    [data.user.id],
  );
  const profile = rows[0];

  if (!profile) {
    throw AppError.forbidden('User profile not found in system');
  }
  if (!profile.is_active) {
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

// POST /auth/fcm-token — register / refresh device FCM token for push notifications
const FcmTokenSchema = z.object({
  fcm_token: z.string().min(1),
});

router.post('/fcm-token', requireAuth, async (req: Request, res: Response) => {
  const { fcm_token } = FcmTokenSchema.parse(req.body);
  await updateFcmToken(req.user!.id, fcm_token);
  res.json({ data: { success: true } });
});

export default router;
