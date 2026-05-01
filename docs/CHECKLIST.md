# Operational Checklist

_Last updated: 2026-05-02_

---

## Backend

- [x] Auth working (login / register / me / fcm-token)
- [x] Bookings working (create / list / get / cancel)
- [x] Trips working (create / advance status / list / get)
- [x] Dispatch working (assign driver + vehicle)
- [x] Pricing working (rules per segment, price estimate at booking)
- [x] Multi-tenant scoping (operator isolation)
- [x] Rate limiting active (auth 10/15min, global 300/15min, bookings 20/1min)
- [x] Input validation (Zod schemas on all routes)
- [x] Error handling (AppError + global 500 fallback)
- [ ] `GET /operators` list endpoint

---

## Network

- [x] Realtime events via Socket.IO
- [x] Push notifications via Firebase Admin SDK
- [x] FCM tokens stored (`users.fcm_token` column)
- [x] `notifications_log` table active
- [x] Push on `trip.assigned` fires on dispatch
- [ ] Push on `trip.refused` (notify operator)
- [ ] Realtime events in `dispatch.service.ts`
- [ ] Socket.IO client in dashboard (live updates)

---

## Security

- [x] JWT auth on all protected routes (`requireAuth` middleware)
- [x] Role-based access (platform_admin, operator_admin, dispatcher, driver, client)
- [x] Rate limiting prevents brute-force on auth
- [x] `trust proxy` set (correct IP in rate limiter)
- [x] Input sanitized via Zod (no raw user input in SQL)
- [x] Parameterized queries throughout (no SQL injection)
- [ ] CORS origin restriction (currently any origin accepted)

---

## Database

- [x] `users` table with `fcm_token` column (`migrations/010_fcm_token.sql`)
- [x] `notifications_log` table (`migrations/011_notifications_log.sql`)
- [x] `bookings`, `trips`, `drivers`, `vehicles`, `operators`, `pricing_rules` tables
- [x] All migrations committed to repo under `migrations/`

---

## Infrastructure

- [x] Railway backend deployed and healthy (`GET /health → { status: "ok" }`)
- [x] Vercel frontend deployed
- [x] Railway PostgreSQL active
- [x] Supabase auth active
- [x] `NODE_ENV=production` on Railway
- [ ] CORS_ORIGIN env var set on Railway

---

## Testing

- [x] E2E test: SA login → booking → dispatch → trip → notifications_log (2026-05-02)
- [ ] Automated test suite (unit / integration)
- [ ] Staging environment

---

## Missing / Next Up

| Item | Priority | Phase |
|------|----------|-------|
| CORS origin restriction | 🔴 High | 1.5 |
| `GET /operators` list endpoint | 🔴 High | 1 |
| Push on `trip.refused` | 🟡 Medium | 2A |
| Realtime in `dispatch.service.ts` | 🟡 Medium | 2A |
| Socket.IO client in dashboard | 🟡 Medium | 2B |
| Compliance system | 🟠 Low | 3 |
| Payments | 🔵 Future | 4 |
