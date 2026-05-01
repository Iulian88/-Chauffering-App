# Roadmap

_Last updated: 2026-05-02_

---

## Phase 1 — Core Backend

**Status: ~85%**

| Feature | Status |
|---------|--------|
| Auth (login / register / me / fcm-token) | ✅ Done |
| Bookings (create / list / get / cancel) | ✅ Done |
| Trips (create / advance status / list / get) | ✅ Done |
| Dispatch (assign driver + vehicle) | ✅ Done |
| Pricing (rules per segment) | ✅ Done |
| Multi-tenant (operator scoping) | ✅ Done |
| Vehicles CRUD | ✅ Done |
| Drivers CRUD | ✅ Done |
| Operators list endpoint (`GET /operators`) | ❌ Missing |
| Marketplace booking flow | 🔶 Partial |

---

## Phase 1.5 — Stability & Security

**Status: ~80%**

| Feature | Status |
|---------|--------|
| Rate limiting — auth endpoints (10 req/15 min) | ✅ Done |
| Rate limiting — global (300 req/15 min) | ✅ Done |
| Rate limiting — bookings (20 req/1 min) | ✅ Done |
| `NODE_ENV` properly set on Railway | ✅ Done |
| `trust proxy` configured | ✅ Done |
| Cache-control headers | ✅ Done |
| CORS — origin restriction (Railway/Vercel) | ❌ Missing |
| Input validation (zod schemas) | ✅ Done |
| Error handler (AppError + 500 fallback) | ✅ Done |

---

## Phase 2A — Network Layer (Realtime + Push)

**Status: ~90%**

| Feature | Status |
|---------|--------|
| Socket.IO realtime server | ✅ Done |
| Realtime events on booking create/update | ✅ Done |
| Realtime events on trip status advance | ✅ Done |
| FCM infra (`users.fcm_token` column) | ✅ Done |
| `auth/fcm-token` endpoint | ✅ Done |
| `getFcmTokenByDriverId()` | ✅ Done |
| `sendNotification()` + firebase-admin | ✅ Done |
| `notifications_log` table | ✅ Done |
| Push on `trip.assigned` (dispatch) | ✅ Done |
| Push on `trip.refused` (advance status) | ❌ Missing |
| Realtime events in dispatch.service.ts | ❌ Missing |
| End-to-end push test confirmed | ✅ Done |

---

## Phase 2B — UX Realtime

**Status: ~40%**

| Feature | Status |
|---------|--------|
| Next.js dashboard exists | ✅ Done |
| Login / auth flow | ✅ Done |
| Booking list page | ✅ Done |
| Live booking updates (Socket.IO client) | ❌ Missing |
| Live trip status (Socket.IO client) | ❌ Missing |
| Driver mobile app (FCM receive) | ❌ Missing |

---

## Phase 3 — Compliance

**Status: ~5%**

| Feature | Status |
|---------|--------|
| Driver document upload | ❌ Missing |
| Vehicle document upload | ❌ Missing |
| Document expiry validation | ❌ Missing |
| Legal compliance checks pre-dispatch | ❌ Missing |

---

## Phase 4 — Payments

**Status: 0%**

| Feature | Status |
|---------|--------|
| Payment gateway integration | ❌ Not started |
| Invoice generation | ❌ Not started |
| Payout to drivers | ❌ Not started |
| Financial reporting | ❌ Not started |
