import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import {
  handleCreateBooking,
  handleListBookings,
  handleGetBooking,
  handleCancelBooking,
  handleConfirmBooking,
} from './bookings.controller';

const router = Router();

// Client creates a booking
router.post(
  '/',
  requireAuth,
  requireRole('client', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleCreateBooking,
);

// Operator lists all bookings (with optional filters)
router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleListBookings,
);

// Get single booking — operator staff or the owning client
router.get(
  '/:id',
  requireAuth,
  requireRole('client', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleGetBooking,
);

// Confirm booking — operator only
router.patch(
  '/:id/confirm',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleConfirmBooking,
);

// Cancel booking — client or operator
router.patch(
  '/:id/cancel',
  requireAuth,
  requireRole('client', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleCancelBooking,
);

export default router;
