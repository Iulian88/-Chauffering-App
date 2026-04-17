import { AppError } from '../../shared/errors/AppError';
import { pool } from '../../shared/db/pg.client';
import {
  listAssignments,
  findAssignmentById,
  createAssignment,
  demoteExistingPrimary,
  setPrimaryAssignment,
  softDeleteAssignment,
  type AssignmentWithDetails,
  type Assignment,
} from './assignments.repository';

export async function getAssignments(operator_id?: string): Promise<AssignmentWithDetails[]> {
  return listAssignments(operator_id);
}

export async function addAssignment(input: {
  driver_id: string;
  vehicle_id: string;
  is_primary: boolean;
  requester_operator_id: string | null;
  requester_role: string;
}): Promise<Assignment> {
  const isPlatformWide = input.requester_role === 'platform_admin' || input.requester_role === 'superadmin';

  // Validate driver exists and belongs to operator
  const { rows: driverRows } = await pool.query(
    `SELECT id, operator_id FROM drivers WHERE id = $1`,
    [input.driver_id],
  );
  const driver = driverRows[0];

  if (!driver) throw AppError.notFound('Driver');

  const operatorId = driver.operator_id as string;
  if (!isPlatformWide && operatorId !== input.requester_operator_id) {
    throw AppError.forbidden('Driver does not belong to your operator');
  }

  // Validate vehicle exists and belongs to same operator
  const { rows: vehicleRows } = await pool.query(
    `SELECT id, operator_id FROM vehicles WHERE id = $1`,
    [input.vehicle_id],
  );
  const vehicle = vehicleRows[0];

  if (!vehicle) throw AppError.notFound('Vehicle');
  if (!isPlatformWide && (vehicle.operator_id as string) !== operatorId) {
    throw AppError.unprocessable(
      'Vehicle and driver must belong to the same operator',
      'OPERATOR_MISMATCH',
    );
  }

  // If setting as primary, atomically demote any existing primary
  if (input.is_primary) {
    await demoteExistingPrimary(input.driver_id);
  }

  // For independent drivers (operator_id = null) assigned by platform-wide users,
  // inherit the vehicle's operator as the assignment owner.
  const effectiveOperatorId = operatorId ?? (vehicle.operator_id as string | null);

  return createAssignment({
    driver_id: input.driver_id,
    vehicle_id: input.vehicle_id,
    operator_id: effectiveOperatorId,
    is_primary: input.is_primary,
  });
}

export async function promoteAssignment(
  id: string,
  requester_operator_id: string | null,
  requester_role: string,
): Promise<Assignment> {
  const assignment = await findAssignmentById(id);
  if (!assignment) throw AppError.notFound('Assignment');

  const isPlatformWide = requester_role === 'platform_admin' || requester_role === 'superadmin';
  if (!isPlatformWide && assignment.operator_id !== requester_operator_id) {
    throw AppError.forbidden('Assignment does not belong to your operator');
  }

  const updated = await setPrimaryAssignment(id, assignment.driver_id);
  if (!updated) throw AppError.internal('Failed to set primary assignment');
  return updated;
}

export async function removeAssignment(
  id: string,
  requester_operator_id: string | null,
  requester_role: string,
): Promise<void> {
  const assignment = await findAssignmentById(id);
  if (!assignment) throw AppError.notFound('Assignment');

  const isPlatformWide = requester_role === 'platform_admin' || requester_role === 'superadmin';
  if (!isPlatformWide && assignment.operator_id !== requester_operator_id) {
    throw AppError.forbidden('Assignment does not belong to your operator');
  }

  await softDeleteAssignment(id);
}
