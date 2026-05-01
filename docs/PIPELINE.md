# Development Pipeline

_Last updated: 2026-05-02_

---

## Flow

```
1. Local development
        ↓
2. TypeScript check
   npx tsc --noEmit
        ↓
3. Commit (atomic — one logical change per commit)
   git add <files>
   git commit -m "<type>(<scope>): <message>"
        ↓
4. Push → main
   git push origin main
        ↓
5. Railway auto-deploy (backend)
   Wait for build to complete.
   Verify: GET /health → { status: "ok" }
        ↓
6. Vercel auto-deploy (frontend)
   Automatic on push to main.
   Verify dashboard loads without console errors.
        ↓
7. Manual migration (if schema changed)
   railway run npx tsx scripts/e2e-setup.ts
   OR apply SQL via Railway Postgres console.
   Rule: migration file MUST be committed BEFORE deploy.
        ↓
8. End-to-end test
   Run E2E curl sequence (see docs/PROGRESS.md).
   Verify notifications_log if push was expected.
```

---

## Commit Message Convention

```
type(scope): short description

Types: feat | fix | chore | docs | refactor | test | ci
Scope: auth | bookings | trips | dispatch | pricing | drivers |
       vehicles | operators | realtime | notifications | middleware |
       db | deploy | docs
```

### Examples
```
feat(dispatch): add realtime event on trip assign
fix(auth): scope authLimiter to login+register only
chore(db): add migrations/011_notifications_log.sql
docs(pipeline): add deployment checklist
ci: trigger Railway redeploy
```

---

## Rules

- **NO partial feature deploy** — never push half-implemented features to main
- **DB changes MUST have migration committed** before the code that uses them is deployed
- **Always test AFTER deploy**, not before — Railway may have a build lag of 1–3 min
- **Avoid frontend auth loops** — each auth event (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED) must call `fetchMe()` at most once
- **Fire-and-forget push** — `sendNotification()` is `void`; failures are logged, not thrown
- **operator_id scoping** — all queries must respect operator isolation (SA sees all, others see their own scope)

---

## Environment Variables

| Variable | Used By | Set In |
|----------|---------|--------|
| `DATABASE_URL` | pg Pool | Railway env |
| `SUPABASE_URL` | supabase.client.ts | Railway env + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | auth middleware | Railway env |
| `SUPABASE_ANON_KEY` | frontend client | Vercel env |
| `FIREBASE_SERVICE_ACCOUNT` | notifications.service.ts | Railway env |
| `NODE_ENV` | express config | Railway env (`production`) |
| `PORT` | server.ts | Railway env (auto) |
| `CORS_ORIGIN` | app.ts | Railway env (**not yet restricted**) |

---

## Known Risks

| Risk | Mitigation |
|------|-----------|
| Railway deploy lag (build freeze) | Use empty commit `ci: trigger Railway redeploy` to force retry |
| Rate limiter state is in-process | Restart resets counters; consider Redis adapter for multi-instance |
| No staging environment | All E2E tests run against production; use test user accounts |
| Vercel ↔ Railway version mismatch | Always push backend + frontend in same commit batch when API changes |
| `FIREBASE_SERVICE_ACCOUNT` missing | Push will silently fail; log entry will still be written with `status=failed` |

---

## Local Development

```bash
# Install deps
npm install

# Type check (no emit)
npx tsc --noEmit

# Run locally (requires DATABASE_URL in .env.local)
railway run npm run dev

# Run a one-off DB script
railway run npx tsx scripts/<script>.ts

# Apply a migration locally via Railway env
railway run npx tsx -e "
  import { pool } from './shared/db/pg.client';
  await pool.query('<SQL>');
  await pool.end();
"
```
