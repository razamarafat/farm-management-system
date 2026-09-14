-- Morvarid-Farm migration 010 — Advisor Pass-4 anon surface reduction (idempotent)
--
-- Hadaf: bastan-e dastresi-e anon (login-nakarde) be data + helper RPC ha.
-- App az anon-key client + user JWT estefade mikone: vaghti login hasti,
-- role=authenticated hasti; role=anon faghat ghabl az login (safhe login,
-- hich data query nadare — ProtectedRoute). Pas REVOKE az anon hich flow-e
-- salemi ro nemishkane (verify: src/store/authStore, ProtectedRoute).
--
-- Fix ha (Advisor 2026-09-14: sec 83 WARN):
--   A. REVOKE table privileges az anon rooye 12 public table
--      -> 12x pg_graphql_anon_table_exposed hazf.
--      authenticated dast nakhord (app ba login kar mikone).
--   B. REVOKE EXECUTE az anon (+PUBLIC) baraye 12 RLS-helper SECDEF,
--      negah dashtan authenticated/service_role (RLS evaluation be
--      EXECUTE niaz dare — mesle pattern 015 §6c).
--      -> 12x anon_security_definer_function_executable hazf.
--      Yek failed-PATCH-e auth ham anjam shod: password_hibp_enabled
--      niaz be Pro plan dare (HTTP 402), pas dar in migration nist.
--
-- Amdan dast nakhord (risk > benefit, tozih dar report):
--   - 46x authenticated SECDEF (rpc_admin_* + helpers): admin RPC ha check-e
--     dakheli daran; hazf az authenticated admin flow ro moshkane (admin ham
--     role=authenticated dare). Rah-e dorost: admin JWT fan-out (Pass-3 docs).
--   - 12x authenticated GraphQL: PostgREST be SELECT niaz dare; omit comment
--     az ghabl hast; Advisor false-positive.
--   - 16x multiple_permissive (4 table x 4 role): ALL+SELECT amdan jodan;
--     merge risk-e lockout dare, cost faghat 1 policy-eval-e ezafe.
--   - 32x unused_index INFO: stat reset/low traffic; hazf FK-cover ro kharab
--     mikone.
--
-- Idempotency: REVOKE/GRANT khodeshan idempotent; loop ha rooye pg_proc/
-- information_schema, re-apply = no-op.

BEGIN;

-- === A. REVOKE anon az 12 public table (authenticated mimone) ===
REVOKE ALL ON public.daily_voucher_lines FROM anon;
REVOKE ALL ON public.daily_vouchers FROM anon;
REVOKE ALL ON public.farm_feed_formulas FROM anon;
REVOKE ALL ON public.farm_formula_items FROM anon;
REVOKE ALL ON public.farm_halls FROM anon;
REVOKE ALL ON public.farm_items FROM anon;
REVOKE ALL ON public.farms FROM anon;
REVOKE ALL ON public.inputs FROM anon;
REVOKE ALL ON public.inventory_transactions FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.suppliers FROM anon;
REVOKE ALL ON public.user_activity_logs FROM anon;

-- === B. REVOKE anon (+PUBLIC) az 12 helper, keep authenticated/service_role ===
DO $$
DECLARE
  rec record;
  anon_helpers text[] := ARRAY[
    'current_user_farm_id',
    'get_user_farm_id',
    'get_user_role',
    'has_farm_access',
    'has_farm_access_v2',
    'is_admin',
    'is_admin_user',
    'is_current_user_admin',
    'is_current_user_admin_or_supervisor',
    'is_self_active',
    'is_user_admin'
  ];
BEGIN
  FOR rec IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(anon_helpers)
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || rec.sig || ' FROM PUBLIC, anon';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION ' || rec.sig || ' TO service_role';
  END LOOP;
END $$;

COMMIT;
