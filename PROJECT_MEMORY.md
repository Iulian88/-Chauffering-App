# PROJECT_MEMORY.md

---

# 1. SYSTEM OVERVIEW

## Purpose
Chauffering App is a dispatch and booking management system designed to:
- Receive bookings from multiple sources (partners, manual, API, email)
- Manage and assign drivers
- Control pricing and profit margins
- Enable operational arbitrage between client price and driver payout

## Core Flow

Partner / Source → Operator → System → Driver

1. Bookings come from:
   - External partners (e.g. Addison Lee)
   - Manual entry by operator
   - Future: API / email ingestion

2. Operator:
   - Reviews booking
   - Adjusts pricing if needed
   - Dispatches driver

3. Driver:
   - Receives trip
   - Completes ride

4. System:
   - Tracks revenue, status, and profit

---

# 2. ARCHITECTURE

## Frontend (Next.js - Vercel)

Main Pages:
- /dashboard → stats + recent bookings
- /bookings → list + create + dispatch
- /drivers → driver management
- /vehicles → fleet management
- /login → authentication

Key Components:
- CreateBookingModal → full booking creation
- DispatchModal → assign driver
- API client (api.ts) → handles all requests

---

## Backend (Node.js + Express - Railway)

Structure:
- routes/
  - bookings.routes.ts
  - drivers.routes.ts
  - vehicles.routes.ts

- services/
  - bookings.service.ts
  - pricing logic (inline for now)

- middleware/
  - auth middleware (JWT validation)

Responsibilities:
- Validate requests
- Handle business logic
- Calculate profit
- Communicate with Supabase

---

## Database (Supabase - PostgreSQL)

Main Tables:
- bookings
- drivers
- trips
- vehicles
- user_profiles
- pricing_rules (planned)

---

# 3. DATABASE STRUCTURE

## bookings

Core fields:

- id
- pickup_address
- dropoff_address
- pickup_lat / pickup_lng
- dropoff_lat / dropoff_lng
- stops (JSON, optional multi-stop)

Operational:
- scheduled_at
- status (pending / confirmed / dispatched / cancelled)
- operator_id
- driver_id

Source tracking:
- channel (manual / api / email)
- partner (internal / addison / etc.)

Pricing:
- client_price (what client pays)
- driver_price (what driver receives)
- profit (client_price - driver_price)

Currency:
- currency (default: RON)

---

## drivers

- id
- name
- phone
- status (available / busy)
- current_location (future)

---

## trips

- id
- booking_id
- driver_id
- start_time
- end_time
- status

---

## pricing_rules (PLANNED)

- id
- partner
- channel
- commission_percent
- fixed_fee
- priority

---

# 4. BOOKING FLOW

## Creation

1. Operator opens "Add Booking"
2. Fills:
   - pickup / destination
   - time
   - segment
   - pricing (optional)
   - partner / channel

3. Frontend → POST /bookings
4. Backend:
   - validates input
   - calculates profit:
     profit = client_price - driver_price (if both exist)

5. Saved in Supabase

---

## Pricing Logic

Current:
- Manual pricing
- Profit calculated server-side

Future:
- Automatic pricing rules
- Commission-based system

---

## Dispatch Flow

1. Booking status = confirmed
2. Operator clicks "Dispatch"
3. Selects driver
4. Backend updates:
   - driver_id
   - status = dispatched

---

# 5. DEPLOYMENT GUIDE

## Frontend (Vercel)

- Connected to GitHub repo
- Auto deploy on push
- Environment variables configured in Vercel dashboard

---

## Backend (Railway)

- Connected to GitHub
- Auto deploy on push
- Runs Express server

---

## Database (Supabase)

- Managed PostgreSQL
- Tables edited via SQL Editor
- Used directly by backend

---

# 6. ENV VARIABLES

## Frontend (Vercel)

- NEXT_PUBLIC_API_URL = backend URL

## Backend (Railway)

- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (if used)
- CORS_ORIGIN = frontend URL

---

# 7. KNOWN DECISIONS

## Profit calculated server-side
Reason:
- Prevent manipulation from frontend
- Ensure consistent logic

---

## channel / partner fields
Reason:
- Track booking origin
- Enable multi-source system
- Required for arbitrage

---

## Defaults

- channel = "manual"
- partner = "internal"

Reason:
- Ensure consistency
- Avoid null values

---

# 8. NEXT STEPS (CRITICAL)

## 1. Pricing Engine
- Commission-based pricing
- Automatic driver payout calculation
- Partner-specific rules

---

## 2. Partner Integrations
- API ingestion
- Email parsing
- External dashboards

---

## 3. Driver System
- Driver availability tracking
- Driver app / panel
- Real-time updates

---

## 4. Dispatch Optimization
- Auto-assign drivers
- Distance-based logic
- Load balancing

---

# 9. RULES FOR FUTURE AGENTS

- DO NOT break existing endpoints
- ALWAYS maintain backward compatibility
- ALWAYS calculate profit server-side
- NEVER hardcode pricing logic
- ALWAYS use environment variables
- DO NOT bypass auth middleware

---

# 10. DEBUG GUIDE

## Backend Logs
- Railway → Logs tab

---

## Database
- Supabase → Table Editor / SQL Editor

---

## API Testing

Use:
- Postman
- curl
- browser console

Example:

GET /api/v1/bookings
Authorization: Bearer <token>

---

## Common Errors

### 401 Unauthorized
- Missing token
- Expired token
- Auth header missing

---

### CORS Error
- Check CORS_ORIGIN in Railway

---

### Data not updating
- Check Supabase directly
- Check backend logs

---

# FINAL NOTE

This system is already production-capable.

Focus areas:
- Stability
- Pricing control
- Partner scaling

---

# 11. AGENT OPERATING PROTOCOL (CRITICAL)

This section defines how any AI agent must behave when working on this project.

## ALWAYS DO FIRST

Before any change:
1. Read this entire PROJECT_MEMORY.md
2. Understand current architecture
3. Identify impacted layers (frontend / backend / DB)

---

## SAFE CHANGE RULES

When implementing anything:

- NEVER break existing endpoints
- NEVER rename existing DB fields
- NEVER remove fields from responses
- ALWAYS keep backward compatibility

If unsure:
→ ASK instead of guessing

---

## AUTH RULE (CRITICAL)

All protected API requests MUST include:

Authorization: Bearer <access_token>

Token source:
- localStorage.getItem('access_token')

If missing:
→ system will return 401

---

## PRICING RULE (CRITICAL)

- Profit MUST always be calculated server-side
- NEVER trust frontend pricing
- NEVER calculate profit in UI only
- Backend is the source of truth

Formula:

profit = client_price - driver_price

---

## DATA SAFETY RULE

- DO NOT delete existing data
- DO NOT run destructive SQL
- ALWAYS use ADD COLUMN, never DROP unless explicitly requested

---

## DEPLOYMENT RULE

After changes:

1. Commit
2. Push to GitHub
3. Verify:
   - Vercel deploy (frontend)
   - Railway deploy (backend)

---

## DEBUGGING PROTOCOL

When error appears:

Step 1: Check browser console
Step 2: Check Network tab (status codes)
Step 3: Check Railway logs
Step 4: Check Supabase data

DO NOT guess blindly.

---

## WHEN ADDING FEATURES

Always follow this order:

1. Database (Supabase)
2. Backend (routes + service)
3. Frontend (UI + API client)

NEVER start from frontend first.

---

## WHEN MODIFYING BOOKINGS

Bookings are the CORE entity.

Any change must:
- preserve existing fields
- not break dispatch logic
- not break pricing

---

## SOURCE SYSTEM RULE

Bookings can come from multiple sources:

- manual
- api
- email

System must remain flexible.

DO NOT hardcode assumptions about source.

---

## FUTURE INTEGRATION RULE

System must support:

- multiple partners
- different pricing per partner
- external API ingestion

Design must stay modular.

---

## ERROR HANDLING RULE

- NEVER ignore errors
- ALWAYS log meaningful messages
- ALWAYS return clear API responses

---

# 12. AGENT MEMORY RULE

This file (PROJECT_MEMORY.md) is the SINGLE SOURCE OF TRUTH.

Any agent working on this project MUST:

- read it before coding
- follow it strictly
- update it when architecture changes

If something changes:
→ UPDATE THIS FILE

---

# 13. CURRENT SYSTEM STATE (LIVE)

Status: PRODUCTION READY

Working:
- Auth
- Bookings CRUD
- Dispatch
- Pricing fields
- Dashboard

Known gaps:
- Pricing automation
- Driver availability
- Partner integrations

---

# FINAL PRINCIPLE

This system is NOT a simple CRUD app.

It is a:

DISPATCH + PRICING + ARBITRAGE ENGINE

All decisions must support:
- scalability
- pricing flexibility
- multi-source bookings

This is not a simple app — it is a dispatch + arbitrage platform.
