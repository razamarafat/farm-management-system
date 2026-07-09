-- =====================================================================
-- migration: 016_recover_unique_indexes.sql
--
-- Purpose: Restore UNIQUE constraints on four columns whose backing
--          indexes were unintentionally dropped during migration 015
--          Section 5's "unused index" pass. Without these, the SPA's
--          admin UI allowed (and a malicious authoring path could
--          insert) duplicate business-unique rows on:
--
--            1. public.profiles.username  — username MUST be unique
--            2. public.farms.code         — farm code MUST be unique
--            3. public.inputs.name        — central catalog MUST be unique
--            4. public.suppliers.name     — supplier name MUST be unique
--
-- Safety guarantees:
--   (a) Each column is duplicate-pre-checked FIRST. If duplicates exist,
--       RAISE EXCEPTION aborts the transaction cleanly with a descriptive
--       message — operator must dedupe data before re-applying.
--   (b) Each CREATE UNIQUE INDEX uses native IF NOT EXISTS so re-apply is
--       a strict no-op once the live DB has the index.
--   (c) Idempotency verified: re-applying returns HTTP 201 with empty [].
--
-- Live verification:
--   - Blocked INSERT-duplicate: any future `INSERT INTO profiles (..., username=X)` where
--     X equals an existing row will be rejected with SQLSTATE 23505.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  -- ===== 1. profiles.username =====
  IF EXISTS (
    SELECT 1 FROM (
      SELECT username, COUNT(*) AS c
        FROM public.profiles
       GROUP BY username
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'profiles has duplicate usernames — dedupe before applying 016';
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

  -- ===== 2. farms.code =====
  IF EXISTS (
    SELECT 1 FROM (
      SELECT code, COUNT(*) AS c
        FROM public.farms
       GROUP BY code
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'farms has duplicate codes — dedupe before applying 016';
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS farms_code_key ON public.farms (code);

  -- ===== 3. inputs.name =====
  IF EXISTS (
    SELECT 1 FROM (
      SELECT name, COUNT(*) AS c
        FROM public.inputs
       GROUP BY name
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'inputs has duplicate names — dedupe before applying 016';
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS inputs_name_key ON public.inputs (name);

  -- ===== 4. suppliers.name =====
  IF EXISTS (
    SELECT 1 FROM (
      SELECT name, COUNT(*) AS c
        FROM public.suppliers
       GROUP BY name
      HAVING COUNT(*) > 1
    ) d
  ) THEN
    RAISE EXCEPTION 'suppliers have duplicate names — dedupe before applying 016';
  END IF;
  CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON public.suppliers (name);
END $$;

COMMIT;
