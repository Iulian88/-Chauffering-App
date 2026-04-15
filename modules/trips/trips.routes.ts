import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import {
  handleListTrips,
  handleCreateTrip,
  handleGetTrip,
  handleAcceptTrip,
  handleRefuseTrip,
  handleUpdateTripStatus,
} from './trips.controller';

const router = Router();

// Operator lists all trips in their scope
router.get(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleListTrips,
);

// Operator creates trip (dispatches booking to driver)
router.post(
  '/',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  handleCreateTrip,
);

// Get trip — operator staff or assigned driver
router.get(
  '/:id',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'driver', 'platform_admin', 'superadmin'),
  handleGetTrip,
);

// Driver accepts assigned trip
router.patch(
  '/:id/accept',
  requireAuth,
  requireRole('driver'),
  handleAcceptTrip,
);

// Driver refuses assigned trip
router.patch(
  '/:id/refuse',
  requireAuth,
  requireRole('driver'),
  handleRefuseTrip,
);

// Driver advances status: en_route → arrived → completed
router.patch(
  '/:id/status',
  requireAuth,
  requireRole('driver'),
  handleUpdateTripStatus,
);

export default router;
