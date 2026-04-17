import { Request, Response } from 'express';
import { z } from 'zod';
import { CreateBookingSchema, CancelBookingSchema } from './bookings.schema';
import {
  createBookingForClient,
  getOperatorBookings,
  getMarketplaceBookings,
  getBooking,
  cancelBooking,
  confirmBooking,
  assignOperatorToBooking,
} from './bookings.service';
import { AppError } from '../../shared/errors/AppError';

export async function handleCreateBooking(req: Request, res: Response): Promise<void> {
  const input = CreateBookingSchema.parse(req.body);
  const user = req.user!;

  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';

  // operator_id resolution:
  // - platform_admin/superadmin: optional from body (null = pool booking)
  // - client: optional from body (null = marketplace pool booking)
  // - operator staff: always from their own profile (required)
  const operator_id: string | null = isPlatformWide
    ? (req.body.operator_id as string | undefined) ?? null
    : user.role === 'client'
      ? (req.body.operator_id as string | undefined) ?? null
      : user.operator_id;

  // Operator staff must have an operator scope on their profile
  if (!isPlatformWide && user.role !== 'client' && !operator_id) {
    throw AppError.badRequest('operator_id is required');
  }

  if (!operator_id) {
    console.warn('[BOOKING] Pool booking created without operator_id', { user_id: user.id, role: user.role });
  }

  const { booking, warning } = await createBookingForClient(input, user, operator_id);
  res.status(201).json({ data: booking, ...(warning ? { warning } : {}) });
}

export async function handleListBookings(req: Request, res: Response): Promise<void> {
  const { status, segment, from, to, limit, offset } = req.query;

  const bookings = await getOperatorBookings(
    {
      status: status as string | undefined as any,
      segment: segment as string | undefined,
      from: from as string | undefined,
      to: to as string | undefined,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    },
    req.user!,
  );

  res.json({ data: bookings, count: bookings.length });
}

export async function handleGetBooking(req: Request, res: Response): Promise<void> {
  const booking = await getBooking(req.params.id, req.user!);
  res.json({ data: booking });
}

export async function handleCancelBooking(req: Request, res: Response): Promise<void> {
  const input = CancelBookingSchema.parse(req.body);
  const booking = await cancelBooking(req.params.id, input, req.user!);
  res.json({ data: booking });
}

export async function handleConfirmBooking(req: Request, res: Response): Promise<void> {
  const booking = await confirmBooking(req.params.id, req.user!);
  res.json({ data: booking });
}

export async function handleListMarketplaceBookings(req: Request, res: Response): Promise<void> {
  const bookings = await getMarketplaceBookings(req.user!);
  res.json({ data: bookings, count: bookings.length });
}

export async function handleAssignOperator(req: Request, res: Response): Promise<void> {
  const user = req.user!;
  const isPlatformWide = user.role === 'platform_admin' || user.role === 'superadmin';

  let operator_id: string;
  if (isPlatformWide) {
    // Platform admin supplies the target operator from body
    ({ operator_id } = z.object({ operator_id: z.string().uuid() }).parse(req.body));
  } else {
    // Operator staff always claim for their own operator
    if (!user.operator_id) throw AppError.forbidden('No operator scope');
    operator_id = user.operator_id;
  }

  const booking = await assignOperatorToBooking(req.params.id, operator_id, user);
  res.json({ data: booking });
}
