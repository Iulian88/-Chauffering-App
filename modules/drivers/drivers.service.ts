import { Driver, DriverAvailabilityStatus, AuthUser } from '../../shared/types/domain';
import { AppError } from '../../shared/errors/AppError';
import {
  findAllDrivers,
  findDriversByOperator,
  findAvailableDriversByOperator,
  findDriverById,
  findDriverByIdGlobal,
  findDriverByUserId,
  updateDriverAvailability,
} from './drivers.repository';

const isPlatformWide = (role: string) => role === 'platform_admin' || role === 'superadmin';

export async function listAvailableDrivers(
  user: AuthUser,
  segment?: string,
): Promise<{ drivers: Driver[]; count: number }> {
  if (!user.operator_id) throw AppError.forbidden('No operator scope');
  const drivers = await findAvailableDriversByOperator(user.operator_id, segment);
  return { drivers, count: drivers.length };
}

export async function listDrivers(user: AuthUser): Promise<Driver[]> {
  if (!isPlatformWide(user.role) && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }
  return isPlatformWide(user.role)
    ? findAllDrivers()
    : findDriversByOperator(user.operator_id as string);
}

export async function getDriver(id: string, user: AuthUser): Promise<Driver> {
  if (!isPlatformWide(user.role) && !user.operator_id) {
    throw AppError.forbidden('No operator scope');
  }
  const driver = isPlatformWide(user.role)
    ? await findDriverByIdGlobal(id)
    : await findDriverById(id, user.operator_id as string);
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
