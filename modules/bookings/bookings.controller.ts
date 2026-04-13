import { Request, Response } from 'express';
import { CreateBookingSchema, CancelBookingSchema } from './bookings.schema';
import {
  createBookingForClient,
  getOperatorBookings,
  getBooking,
  cancelBooking,
} from './bookings.service';
import { AppError } from '../../shared/errors/AppError';

export async function handleCreateBooking(req: Request, res: Response): Promise<void> {
  const input = CreateBookingSchema.parse(req.body);
  const user = req.user!;

  // operator_id: clients submit it explicitly; staff derive from their profile
  const operator_id =
    user.role === 'client'
      ? (req.body.operator_id as string | undefined)
      : user.operator_id;

  if (!operator_id) throw AppError.badRequest('operator_id is required');

  const booking = await createBookingForClient(input, user, operator_id);
  res.status(201).json({ data: booking });
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
