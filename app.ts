import 'dotenv/config';
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

import { errorHandler } from './shared/errors/errorHandler';

// Module routers
import authRoutes from './modules/auth/auth.routes';
import operatorRoutes from './modules/operators/operators.routes';
import driverRoutes from './modules/drivers/drivers.routes';
import vehicleRoutes from './modules/vehicles/vehicles.routes';
import bookingRoutes from './modules/bookings/bookings.routes';
import tripRoutes from './modules/trips/trips.routes';
import dispatchRoutes from './modules/dispatch/dispatch.routes';
import pricingRoutes from './modules/pricing/pricing.routes';

const app = express();

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Favicon handler ──────────────────────────────────────────────────────────
app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

// ─── API routes ───────────────────────────────────────────────────────────────
const v1 = express.Router();

v1.use('/auth',      authRoutes);
v1.use('/operators', operatorRoutes);
v1.use('/drivers',   driverRoutes);
v1.use('/vehicles',  vehicleRoutes);
v1.use('/bookings',  bookingRoutes);
v1.use('/trips',     tripRoutes);
v1.use('/dispatch',  dispatchRoutes);
v1.use('/pricing',   pricingRoutes);

app.use('/api/v1', v1);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

export default app;
