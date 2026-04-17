-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 002_segments
-- Apply via: Supabase SQL editor → run all
-- Safe to re-run (idempotent via IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. segments table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segments (
  name        TEXT        PRIMARY KEY,
  label       TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Seed the 5 canonical segments ──────────────────────────────────────────
INSERT INTO segments (name, label, sort_order) VALUES
  ('ride',       'Standard Ride',  1),
  ('business',   'Business Class', 2),
  ('executive',  'Executive',      3),
  ('office_lux', 'Office Luxury',  4),
  ('prime_lux',  'Prime Luxury',   5)
ON CONFLICT (name) DO NOTHING;
