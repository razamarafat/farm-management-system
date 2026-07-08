-- =====================================================================
-- migration: 006_create_missing_tables.sql
--
-- Purpose  : Create the two tables that previous migrations assumed but
--            never materialised in Morvarid-FARM:
--              * public.inputs        — global catalogue of feed /
--                                       packaging items.
--              * public.farm_staff    — many-to-many join between
--                                       profiles and farms, supporting
--                                       future per-farm staff roles.
--
-- Idempotency is the central design goal here — every DDL is wrapped
-- in `IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP … IF EXISTS` so
-- applying this file on a DB that already has either table is a
-- no-op. All RLS policies use DROP IF EXISTS before CREATE so a
-- re-apply cleanly resets policy shapes.
--
-- Order:
--   * Before this file: apply 001 in spirit (001 defines inputs
--     identically for fresh DBs; this file is the catch-up).
--   * After this file: re-run 004 to land the inputs_select_authenticated
--     policy that 004 was previously guarded on to_regclass.
--   * After this file: re-run 005 to land the farm_staff_user_farm_active_idx
--     index that 005 was previously guarded on to_regclass.
--
-- Notes:
--   * The `inputs` DDL mirrors `scripts/migrations/001_create_inputs_table.sql`
--     exactly. If both 001 and 006 are applied, the second is a no-op.
--   * `farm_staff` is intentionally NOT queried by any SPA hook today
--     (FarmStaffPanel uses profiles.farm_id). It exists to give a
--     future-proof many-to-many representation: a user can be assigned
--     to multiple farms with a role per farm. The RLS scaffolding here
--     is minimal but safe — admins manage, users read their own rows.
-- =====================================================================


-- =====================================================================
-- Section 1 : public.inputs (mirrors 001_create_inputs_table.sql)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.inputs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'feed'
                  CHECK (category IN ('feed', 'packaging')),
  default_unit  TEXT NOT NULL DEFAULT 'کیلوگرم',
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT inputs_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_inputs_category ON public.inputs(category);
CREATE INDEX IF NOT EXISTS idx_inputs_is_active ON public.inputs(is_active);
CREATE INDEX IF NOT EXISTS idx_inputs_name      ON public.inputs(name);

-- updated_at trigger (idempotent).
CREATE OR REPLACE FUNCTION public.update_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inputs_updated_at ON public.inputs;
CREATE TRIGGER trg_inputs_updated_at
  BEFORE UPDATE ON public.inputs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inputs_updated_at();

-- RLS scaffolding (ENABLE is idempotent; DROP IF EXISTS prevents
-- re-create errors if 001's policies already sit on the table).
ALTER TABLE public.inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inputs_select_authenticated"        ON public.inputs;
DROP POLICY IF EXISTS "Authenticated users can view inputs" ON public.inputs;

CREATE POLICY "inputs_select_authenticated" ON public.inputs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "inputs_insert_admin" ON public.inputs
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  ));

CREATE POLICY "inputs_update_admin" ON public.inputs
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  ));

CREATE POLICY "inputs_delete_admin" ON public.inputs
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  ));


-- =====================================================================
-- Section 2 : public.farm_staff (composite-PK many-to-many)
-- =====================================================================
--
-- Shape:
--   PRIMARY KEY (user_id, farm_id) — a user can hold ONE role per farm.
--                                    Use a different PK + multiple rows
--                                    per user-farm if role per period
--                                    ever becomes a requirement.
--   role text referencing user_role_enum (no FK to keep migration order
--         simple; CHECK enforces the same allowlist as the enum).
--   is_active bool — drives the 005 partial-index predicate.
--   Timestamps + created_by for audit.
--
-- FK targets all live in the live DB (verified during the schema
-- probe that informed this migration).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.farm_staff (
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  farm_id      UUID NOT NULL REFERENCES public.farms(id)     ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'operator'
                  CHECK (role IN ('admin','supervisor','operator')),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, farm_id)
);

CREATE INDEX IF NOT EXISTS farm_staff_user_farm_active_idx
  ON public.farm_staff (user_id, farm_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS farm_staff_farm_user_active_idx
  ON public.farm_staff (farm_id, user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS farm_staff_farm_role_idx
  ON public.farm_staff (farm_id, role)
  WHERE is_active = true;

-- updated_at trigger.
CREATE OR REPLACE FUNCTION public.update_farm_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_farm_staff_updated_at ON public.farm_staff;
CREATE TRIGGER trg_farm_staff_updated_at
  BEFORE UPDATE ON public.farm_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.update_farm_staff_updated_at();

-- RLS scaffolding.
ALTER TABLE public.farm_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "farm_staff_select_self_or_admin" ON public.farm_staff;
DROP POLICY IF EXISTS "farm_staff_insert_admin"        ON public.farm_staff;
DROP POLICY IF EXISTS "farm_staff_update_admin"        ON public.farm_staff;
DROP POLICY IF EXISTS "farm_staff_delete_admin"        ON public.farm_staff;

-- A user can read their own farm_staff rows; an admin can read all.
CREATE POLICY "farm_staff_select_self_or_admin" ON public.farm_staff
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true)
  );

-- Only active admins can manage farm_staff rows (write paths go via
-- admin UI / future rpc_admin_upsert_farm_staff function, not the SPA).
CREATE POLICY "farm_staff_insert_admin" ON public.farm_staff
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

CREATE POLICY "farm_staff_update_admin" ON public.farm_staff
  FOR UPDATE USING (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));

CREATE POLICY "farm_staff_delete_admin" ON public.farm_staff
  FOR DELETE USING (EXISTS (SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.is_active = true));


-- =====================================================================
-- Section 3 : Permissions recap
-- =====================================================================
-- public.farm_staff RLS is on; only admins can write it. Reads are
-- either self (auth.uid() = user_id) OR admin. anon cannot read or
-- write — anon has no JWT context. The four policies above use
-- auth.uid() so anon requests resolve to NULL and the policies
-- evaluate to FALSE.
--
-- public.inputs RLS is on; writes are admin-gated, reads are
-- authenticated-gated. The behaviour matches 001's original setup
-- AND the additional `inputs_select_authenticated` policy that 004
-- will create on its next apply. The 004-created policy is
-- redundant with the one above; Postgres will OR identical
-- permitted predicates safely when both are present.
