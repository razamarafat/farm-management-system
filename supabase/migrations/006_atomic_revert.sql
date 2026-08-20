-- 006_atomic_revert.sql
-- ---------------------------------------------------------------------------
-- Replaces the client-side two-step daily-sheet revert (delete inventory rows
-- + update voucher status as separate calls) with a single atomic,
-- row-locked, SECURITY DEFINER RPC that mirrors submit_daily_voucher's
-- safety pattern:
--   * FOR UPDATE row lock on the voucher serializes concurrent submit/revert.
--   * Structured jsonb error codes (VOUCHER_NOT_FOUND / ACCESS_DENIED /
--     VOUCHER_LOCKED / INVALID_STATUS / OK) instead of raw RAISE EXCEPTION.
--   * 24h window enforced and committed via RETURN (not RAISE, which would
--     roll back the lock UPDATE).
--   * admin/operator permission check consistent with RLS (supervisor denied).
--
-- Supersedes public.revert_daily_sheet(uuid), which had no row lock, used raw
-- exceptions, and had an ineffective 24h auto-lock (its lock UPDATE was rolled
-- back by the subsequent RAISE). Applied to live DB 2026-08-16.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.revert_daily_sheet(uuid);

CREATE OR REPLACE FUNCTION public.revert_daily_voucher(p_voucher_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_farm_id uuid;
  v_status text;
  v_submitted_at timestamptz;
BEGIN
  -- Row-lock the voucher so a concurrent submit/revert cannot interleave.
  SELECT farm_id, status::text, submitted_at
    INTO v_farm_id, v_status, v_submitted_at
    FROM public.daily_vouchers
   WHERE id = p_voucher_id
   FOR UPDATE;

  IF v_farm_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_NOT_FOUND', 'message', 'حواله یافت نشد');
  END IF;

  IF NOT public.has_farm_access_v2(v_farm_id) THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCESS_DENIED', 'message', 'شما به این فارم دسترسی ندارید');
  END IF;

  IF public.get_user_role() NOT IN ('admin', 'operator') THEN
    RETURN jsonb_build_object('success', false, 'code', 'ACCESS_DENIED', 'message', 'شما اجازه برگشت ندارید');
  END IF;

  IF v_status = 'locked' THEN
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_LOCKED', 'message', 'این حواله قفل شده و قابل برگشت نیست');
  END IF;

  -- 24h edit window: lock then reject. RETURN (not RAISE) so the lock commits.
  IF v_status = 'submitted'
     AND v_submitted_at IS NOT NULL
     AND (NOW() - v_submitted_at) >= INTERVAL '24 hours' THEN
    UPDATE public.daily_vouchers SET status = 'locked', locked_at = NOW() WHERE id = p_voucher_id;
    RETURN jsonb_build_object('success', false, 'code', 'VOUCHER_LOCKED', 'message', 'زمان برگشت این حواله به پایان رسیده است');
  END IF;

  IF v_status <> 'submitted' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_STATUS', 'message', 'فقط حواله‌های ثبت شده قابل برگشت هستند');
  END IF;

  -- Reverse the submit side effects atomically: drop the consumption rows and reset the voucher.
  DELETE FROM public.inventory_transactions
   WHERE source_type = 'daily_voucher' AND source_id = p_voucher_id;

  UPDATE public.daily_vouchers SET
    status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    reverted_by = auth.uid(),
    reverted_at = NOW(),
    updated_at = NOW()
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object('success', true, 'code', 'OK', 'message', 'حواله به حالت پیش‌نویس برگشت داده شد');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'code', 'ERROR',
    'message', CASE WHEN SQLERRM ~ '[^\x00-\x7F]' AND SQLERRM !~ '[a-zA-Z]'
                    THEN SQLERRM ELSE 'خطای غیرمنتظره‌ای رخ داد' END,
    'detail', SQLERRM
  );
END;
$function$;
