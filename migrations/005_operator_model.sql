-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 005_operator_model
-- Purpose  : Add operator type column to distinguish fleet operators from
--            independent (self-employed) driver operators.
--            Also ensures the shared "Independent" self-operator exists.
-- Apply via: Supabase SQL editor → Run all
-- Safe to re-run: idempotent throughout.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Add type column to operators ──────────────────────────────────────────
-- Values: 'fleet' (company) | 'self' (independent driver)
-- All existing operators default to 'fleet'.
ALTER TABLE operators
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'fleet'
    CONSTRAINT chk_operator_type CHECK (type IN ('fleet', 'self'));

-- ── 2. Ensure the shared Independent self-operator exists ────────────────────
-- Used automatically when a driver has no fleet operator.
INSERT INTO operators (name, slug, type, timezone, locale, is_active, created_at, updated_at)
VALUES (
  'Independent',
  'independent',
  'self',
  'UTC',
  'en',
  true,
  now(),
  now()
)
ON CONFLICT (slug) DO UPDATE
  SET type       = 'self',
      updated_at = now();

-- ── 3. Mark any previously auto-created "independent" slugged operators ───────
UPDATE operators
SET type       = 'self',
    updated_at = now()
WHERE slug = 'independent'
  AND type <> 'self';

-- ── 4. Verify ────────────────────────────────────────────────────────────────
SELECT id, name, slug, type, is_active
FROM operators
ORDER BY type, created_at;
