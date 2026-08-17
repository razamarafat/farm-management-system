-- =====================================================================
-- migration: 019_sql_rls_recursion_fix.sql
--
-- ROOT CAUSE OF "stack depth limit exceeded" ON EVERY REPORT
-- -----------------------------------------------------------
-- All profile-reading RLS helpers (has_farm_access_v2,
-- is_current_user_admin, is_current_user_admin_or_supervisor,
-- current_user_farm_id, get_user_farm_id, get_user_role, is_admin_user,
-- is_user_admin, has_farm_access) were deployed as SECURITY INVOKER
-- even though migration 012_fix_profiles_recursion.sql intended them
-- to be SECURITY DEFINER.
--
-- Consequence: when an RLS policy on inventory_transactions /
-- farm_items / daily_voucher_lines / etc. evaluated one of these
-- helpers for an authenticated user, the helper ran as the INVOKING
-- user and re-read public.profiles UNDER RLS. The profiles SELECT
-- policy (profiles_select_self) calls is_current_user_admin() again,
-- which (being INVOKER) re-read profiles under RLS, which called
-- is_current_user_admin() again … → infinite recursion →
-- PostgreSQL error 54001 "stack depth limit exceeded".
--
-- This aborted every reporting_* RPC for any logged-in user (the
-- SPA calls them with the user's JWT). Service-role clients bypassed
-- RLS so the functions appeared "fine" in offline checks — masking
-- the bug until a real user opened a report.
--
-- FIX
-- ---
-- Re-create every profile-reading helper as SECURITY DEFINER with an
-- explicit `SET search_path = public`. As the function owner
-- (postgres) they read public.profiles WITHOUT triggering the caller's
-- profiles RLS, which breaks the recursion cycle. All other policy
-- logic (farm scope, admin override) is preserved unchanged.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT are safe to re-run.
-- No DML on user data.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND role = 'admin'::public.user_role_enum
       AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_current_user_admin_or_supervisor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND role = ANY (ARRAY['admin'::public.user_role_enum, 'supervisor'::public.user_role_enum])
       AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_farm_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT farm_id FROM public.profiles
   WHERE id = auth.uid() AND is_active = true LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_farm_access_v2(check_farm_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid()
       AND is_active = true
       AND (role = 'admin' OR (farm_id IS NOT NULL AND farm_id = check_farm_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
     WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_admin(user_uuid uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = user_uuid AND role = 'admin');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_farm_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN (SELECT farm_id FROM public.profiles WHERE id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'role',
    (SELECT role::TEXT FROM public.profiles WHERE id = auth.uid())
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid uuid)
RETURNS user_role_enum LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN (SELECT role FROM public.profiles WHERE id = user_uuid LIMIT 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.has_farm_access(check_farm_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN RETURN TRUE; END IF;
  RETURN check_farm_id = get_user_farm_id();
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'is_current_user_admin',
    'is_current_user_admin_or_supervisor',
    'current_user_farm_id',
    'has_farm_access_v2',
    'is_admin_user',
    'is_user_admin',
    'get_user_farm_id',
    'get_user_role',
    'has_farm_access'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO anon, authenticated', fn);
  END LOOP;
END $$;
