# Current Progress

_Last updated: 2026-05-02_

---

## Overall Progress

**~88–90%** of MVP scope complete.

Backend is production-ready for the core dispatch workflow. The blocking gaps before a full public launch are: CORS restriction, UI realtime updates, and compliance docs.

---

## What Works (CONFIRMED IN PRODUCTION)

### Auth
- `POST /auth/login` — Supabase JWT, rate-limited (10/15 min)
- `POST /auth/register` — rate-limited (10/15 min)
- `GET /auth/me` — resolves internal user from JWT (300/15 min)
- `POST /auth/fcm-token` — stores Firebase device token per user

### Bookings
- `POST /bookings` — create with pricing snapshot, segment validation
- `GET /bookings` — operator-scoped or SA global list
- `GET /bookings/:id` — single booking
- `PATCH /bookings/:id/cancel` — cancellation with reason

### Dispatch
- `POST /dispatch/assign` — assigns driver + vehicle → creates trip
- Trip `status = assigned` written correctly

### Trips
- `GET /trips` — list (operator-scoped)
- `GET /trips/:id` — single trip
- `POST /trips/:id/advance` — status machine (assigned → accepted → en_route → arrived → completed / refused)

### Push Notifications
- FCM push fires on `trip.assigned`
- `notifications_log` row written with `status = "sent"`
- firebase-admin lazy-init from `FIREBASE_SERVICE_ACCOUNT` env

### Pricing
- Rules per segment (`business`, `executive`, `office_lux`, etc.)
- Surge multiplier, base fare, per-km, per-min
- Price estimate calculated at booking creation

### Rate Limiting
- Auth: 10 req/15 min on login + register only
- Global: 300 req/15 min (all other routes including `/auth/me`)
- Bookings: 20 req/1 min

---

## Recently Fixed (this session)

| Issue | Fix | Commit |
|-------|-----|--------|
| Infinite `/auth/me` loop (429) | Scoped `authLimiter` to login/register only | `770ac30` |
| Duplicate `fetchMe()` calls on login | Removed `fetchMe` from `INITIAL_SESSION`/`SIGNED_IN` events | `182c14e` |
| Railway not auto-deploying | Empty commit to force Railway redeploy | `f06ca0d` |
| `fcm_token` column missing in DB | Applied `migrations/010_fcm_token.sql` via Railway CLI | local |
| `notifications_log` table missing | Applied `migrations/011_notifications_log.sql` via Railway CLI | local |

---

## Current Limitations

| Limitation | Impact |
|-----------|--------|
| No CORS origin restriction | Security gap (any origin accepted) |
| No `GET /operators` list endpoint | Dashboard can't populate operator picker |
| No UI realtime updates (Socket.IO client) | Dashboard shows stale data |
| No push on `trip.refused` | Operator not notified when driver refuses |
| No realtime events in `dispatch.service.ts` | Dispatcher doesn't get live updates |
| No compliance system | Cannot enforce driver/vehicle document checks pre-dispatch |
| No payments | No payment gateway, invoicing, or payouts |
| No staging environment | All testing is against production |

---

## Infrastructure

| Component | Stack | Status |
|-----------|-------|--------|
| Backend | Node.js + TypeScript + Express | ✅ Railway |
| Database | PostgreSQL (Railway) | ✅ Active |
| Auth | Supabase JWT | ✅ Active |
| Frontend | Next.js | ✅ Vercel |
| Realtime | Socket.IO | ✅ Active |
| Push | Firebase Admin SDK | ✅ Active |
| Rate limiting | express-rate-limit | ✅ Active |

---

## Last E2E Test (2026-05-02)

```
SA login           → PASS (token obtained)
POST /bookings     → PASS (booking fbad940b, RON 50.30)
POST /dispatch/assign → PASS (trip d1edbccb, status=assigned)
GET /trips/:id     → PASS (status=assigned confirmed)
notifications_log  → PASS (1 row, status=sent, template=trip.assigned)
```
