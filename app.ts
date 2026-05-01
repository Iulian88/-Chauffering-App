import 'dotenv/config';
import 'express-async-errors';

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

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
import assignmentRoutes from './modules/assignments/assignments.routes';
import segmentRoutes from './modules/segments/segments.routes';
import marketplaceRoutes from './modules/marketplace/marketplace.routes';

const app = express();

// Trust Railway's reverse proxy so rate limiter reads the real client IP
// (without this, every request appears to come from the same proxy IP)
app.set('trust proxy', 1);

// ─── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(express.json());

// Prevent Railway/Fastly CDN from caching authenticated API responses.
// Without this, GET requests are served from edge cache and bypass the
// rate limiter, making the per-IP counters inaccurate.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// ─── Rate limiting ──────────────────────────────────────────────────────────
// Global: 300 requests per 15 minutes per IP across all routes
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

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

// Auth: 10 requests per 15 minutes per IP (brute-force protection)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// Bookings: 20 requests per minute per IP
const bookingLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

v1.use('/auth',      authLimiter);
v1.use('/bookings',  bookingLimiter);

v1.use('/auth',      authRoutes);
v1.use('/operators', operatorRoutes);
v1.use('/drivers',   driverRoutes);
v1.use('/vehicles',  vehicleRoutes);
v1.use('/bookings',  bookingRoutes);
v1.use('/trips',     tripRoutes);
v1.use('/dispatch',    dispatchRoutes);
v1.use('/pricing',     pricingRoutes);
v1.use('/assignments', assignmentRoutes);
v1.use('/segments',    segmentRoutes);
v1.use('/marketplace', marketplaceRoutes);

app.use('/api/v1', v1);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// ─── Global error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

export default app;
