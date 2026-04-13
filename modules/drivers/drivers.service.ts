import { Driver, DriverAvailabilityStatus, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import {
  findDriversByOperator,
  findDriverById,
  findDriverByUserId,
  updateDriverAvailability,
} from './drivers.repository';

export async function listDrivers(user: AuthUser): Promise<Driver[]> {
  if (!user.operator_id) throw AppError.forbidden('No operator scope');
  return findDriversByOperator(user.operator_id);
}

export async function getDriver(id: string, user: AuthUser): Promise<Driver> {
  if (!user.operator_id) throw AppError.forbidden('No operator scope');
  const driver = await findDriverById(id, user.operator_id);
  if (!driver) throw AppError.notFound('Driver');
  return driver;
}

export async function setAvailability(
  id: string,
  status: DriverAvailabilityStatus,
  user: AuthUser,
): Promise<Driver> {
  // Drivers can only update their own availability
  if (user.role === 'driver') {
    const ownDriver = await findDriverByUserId(user.id);
    if (!ownDriver) throw AppError.notFound('Driver profile');
    if (ownDriver.id !== id) throw AppError.forbidden('Cannot update another driver\'s availability');

    // Drivers cannot mark themselves busy manually — that's set by trip assignment
    if (status === 'busy') {
      throw AppError.unprocessable(
        'Drivers cannot set themselves as busy manually',
        'MANUAL_BUSY_FORBIDDEN',
      );
    }

    return updateDriverAvailability(id, ownDriver.operator_id, status);
  }

  // Operator staff can update any driver in their scope
  if (!user.operator_id) throw AppError.forbidden('No operator scope');
  const driver = await findDriverById(id, user.operator_id);
  if (!driver) throw AppError.notFound('Driver');

  return updateDriverAvailability(id, user.operator_id, status);
}
