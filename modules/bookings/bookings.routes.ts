import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { filterPricing } from '../../shared/middleware/filterPricing';
import {
  handleCreateBooking,
  handleListBookings,
  handleListMarketplaceBookings,
  handleGetBooking,
  handleCancelBooking,
  handleConfirmBooking,
  handleAssignOperator,
} from './bookings.controller';

const router = Router();

// Strip price fields based on caller role (client / driver)
router.use(filterPricing);

// Client creates a booking
router.post(
  '/',
  requireAuth,
  requireRole('client', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleCreateBooking,
);

// Pool (marketplace) bookings — unassigned pending jobs visible to all operator roles
// IMPORTANT: must be declared before /:id to avoid Express treating 'marketplace' as an id param
router.get(
  '/marketplace',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleListMarketplaceBookings,
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

// Assign operator to a pool booking — platform admins pick any operator; operator staff claim for themselves
router.patch(
  '/:id/assign-operator',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleAssignOperator,
);

export default router;
