import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../shared/middleware/auth.middleware';
import { filterPricing } from '../../shared/middleware/filterPricing';
import {
  listMarketplaceOperators,
  createMarketplaceRequest,
  listMarketplaceRequests,
  acceptRequest,
  listJobBoard,
  claimJob,
  listMyAffiliations,
  requestDriverAffiliation,
  updateAffiliation,
  listMyFavorites,
  addToFavorites,
  removeFromFavorites,
} from './marketplace.service';

const router = Router();

// Strip price fields based on caller role (client / driver)
router.use(filterPricing);

// ─────────────────────────────────────────────────────────────────────────────
// Operators directory (public within authenticated API)
// GET /marketplace/operators
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/operators',
  requireAuth,
  requireRole('client', 'driver', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (_req, res) => {
    const operators = await listMarketplaceOperators();
    res.json({ data: operators, count: operators.length });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace Requests (Client → Operator pool)
// ─────────────────────────────────────────────────────────────────────────────

const CreateRequestSchema = z.object({
  segment:         z.enum(['ride', 'business', 'executive', 'office_lux', 'prime_lux']),
  pickup_address:  z.string().min(1),
  pickup_lat:      z.number(),
  pickup_lng:      z.number(),
  dropoff_address: z.string().min(1),
  dropoff_lat:     z.number(),
  dropoff_lng:     z.number(),
  stops:           z.array(z.object({
    address: z.string(),
    lat:     z.number(),
    lng:     z.number(),
    order:   z.number().int(),
  })).nullable().optional(),
  scheduled_at:    z.string().datetime({ offset: true }),
  distance_km:     z.number().positive(),
  duration_sec:    z.number().int().positive(),
  client_price:    z.number().positive().nullable().optional(),
  offer_expires_at: z.string().datetime({ offset: true }).nullable().optional(),
});

// GET /marketplace/requests — operators see open requests
router.get(
  '/requests',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const segment = req.query.segment as string | undefined;
    const requests = await listMarketplaceRequests(req.user!, segment);
    res.json({ data: requests, count: requests.length });
  },
);

// POST /marketplace/requests — client posts a ride request
router.post(
  '/requests',
  requireAuth,
  requireRole('client', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const input = CreateRequestSchema.parse(req.body);
    const booking = await createMarketplaceRequest(input, req.user!);
    res.status(201).json({ data: booking });
  },
);

// POST /marketplace/requests/:id/accept — operator accepts request (first-wins)
router.post(
  '/requests/:id/accept',
  requireAuth,
  requireRole('operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const booking = await acceptRequest(id, req.user!);
    res.json({ data: booking });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Job Board (Self-employed drivers)
// ─────────────────────────────────────────────────────────────────────────────

// GET /marketplace/jobs — driver job board
router.get(
  '/jobs',
  requireAuth,
  requireRole('driver', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const segment = req.query.segment as string | undefined;
    const jobs = await listJobBoard(req.user!, segment);
    res.json({ data: jobs, count: jobs.length });
  },
);

// POST /marketplace/jobs/:id/claim — driver claims a job (atomic)
router.post(
  '/jobs/:id/claim',
  requireAuth,
  requireRole('driver'),
  async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const result = await claimJob(id, req.user!);
    res.status(201).json({ data: result });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Affiliations (Driver ↔ Operator)
// ─────────────────────────────────────────────────────────────────────────────

const UpdateAffiliationSchema = z.object({
  status:         z.enum(['pending', 'active', 'suspended']),
  commission_pct: z.number().min(0).max(100).nullable().optional(),
});

const RequestAffiliationSchema = z.object({
  operator_id: z.string().uuid(),
  note:        z.string().max(500).nullable().optional(),
});

// GET /marketplace/affiliations — driver sees own; operator sees all theirs
router.get(
  '/affiliations',
  requireAuth,
  requireRole('driver', 'operator_admin', 'operator_dispatcher', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const affiliations = await listMyAffiliations(req.user!);
    res.json({ data: affiliations, count: affiliations.length });
  },
);

// POST /marketplace/affiliations — driver requests affiliation
router.post(
  '/affiliations',
  requireAuth,
  requireRole('driver'),
  async (req, res) => {
    const { operator_id, note } = RequestAffiliationSchema.parse(req.body);
    const aff = await requestDriverAffiliation(operator_id, note ?? null, req.user!);
    res.status(201).json({ data: aff });
  },
);

// PATCH /marketplace/affiliations/:id — operator approves/suspends
router.patch(
  '/affiliations/:id',
  requireAuth,
  requireRole('operator_admin', 'platform_admin', 'superadmin'),
  async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { status, commission_pct } = UpdateAffiliationSchema.parse(req.body);
    const aff = await updateAffiliation(id, status, commission_pct ?? null, req.user!);
    res.json({ data: aff });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Favorites (Client ↔ Driver)
// ─────────────────────────────────────────────────────────────────────────────

// GET /marketplace/favorites — client lists favorite drivers
router.get(
  '/favorites',
  requireAuth,
  requireRole('client'),
  async (req, res) => {
    const favorites = await listMyFavorites(req.user!);
    res.json({ data: favorites, count: favorites.length });
  },
);

// POST /marketplace/favorites — client adds a driver
router.post(
  '/favorites',
  requireAuth,
  requireRole('client'),
  async (req, res) => {
    const { driver_id } = z.object({ driver_id: z.string().uuid() }).parse(req.body);
    const fav = await addToFavorites(driver_id, req.user!);
    res.status(201).json({ data: fav });
  },
);

// DELETE /marketplace/favorites/:driver_id — client removes a driver
router.delete(
  '/favorites/:driver_id',
  requireAuth,
  requireRole('client'),
  async (req, res) => {
    const { driver_id } = z.object({ driver_id: z.string().uuid() }).parse(req.params);
    await removeFromFavorites(driver_id, req.user!);
    res.status(204).end();
  },
);

export default router;
