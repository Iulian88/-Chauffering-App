import { Request, Response } from 'express';
import {
  CreateTripSchema,
  RefuseTripSchema,
  UpdateTripStatusSchema,
} from './trips.schema';
import {
  listTrips,
  createTrip,
  getTrip,
  acceptTrip,
  refuseTrip,
  advanceTripStatusByDriver,
  startTrip,
  completeTrip,
} from './trips.service';

export async function handleListTrips(req: Request, res: Response): Promise<void> {
  const trips = await listTrips(req.user!);
  res.json({ data: trips, count: trips.length });
}

export async function handleCreateTrip(req: Request, res: Response): Promise<void> {
  const input = CreateTripSchema.parse(req.body);
  const trip = await createTrip(input, req.user!);
  res.status(201).json({ data: trip });
}

export async function handleGetTrip(req: Request, res: Response): Promise<void> {
  const trip = await getTrip(req.params.id, req.user!);
  res.json({ data: trip });
}

export async function handleAcceptTrip(req: Request, res: Response): Promise<void> {
  const trip = await acceptTrip(req.params.id, req.user!);
  res.json({ data: trip });
}

export async function handleRefuseTrip(req: Request, res: Response): Promise<void> {
  const input = RefuseTripSchema.parse(req.body);
  const trip = await refuseTrip(req.params.id, input, req.user!);
  res.json({ data: trip });
}

export async function handleUpdateTripStatus(req: Request, res: Response): Promise<void> {
  const input = UpdateTripStatusSchema.parse(req.body);
  const trip = await advanceTripStatusByDriver(req.params.id, input, req.user!);
  res.json({ data: trip });
}

export async function handleStartTrip(req: Request, res: Response): Promise<void> {
  const trip = await startTrip(req, req.params.id, req.user!);
  res.json({ success: true, data: trip });
}

export async function handleCompleteTrip(req: Request, res: Response): Promise<void> {
  const trip = await completeTrip(req, req.params.id, req.user!);
  res.json({ success: true, data: trip });
}
