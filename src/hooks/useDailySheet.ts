import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { checkSupabaseReachability } from '@/lib/supabaseReachability';
import {
  readFarmItems,
  readFarmTransactions,
  readTodayPurchases,
  readVoucherLines,
  readFeedFormulas,
  readFormulaItems,
  readFarmHalls,
  findVoucher,
} from '@/lib/offline/reads';
import { rpcError } from '@/utils/rpcError';
import {
  type VoucherCategory,
  type DailySheetData,
  type DailySheetRow,
  type SaveDailySheetLinePayload,
  type HallConfig,
  type FarmFeedFormula,
  type FormulaItem,
  toNumber,
} from '@/types/consumption.types';
import type { Json } from '@/types/database.types';

interface UseDailySheetParams {
  farmId: string;
  date: string;
  category: VoucherCategory;
  ignoreEditWindow?: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function numVal(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

export function useDailySheet({ farmId, date, category, ignoreEditWindow }: UseDailySheetParams) {
  const [data, setData] = useState<DailySheetData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [selectedFormulaId, setSelectedFormulaId] = useState<string | null>(null);
  const [hallConfigs, setHallConfigs] = useState<HallConfig[]>([]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyLinesRef = useRef<Map<string, SaveDailySheetLinePayload>>(new Map());

  // Fetch formulas for farm — uses `supabase` (NOT `supabaseAdmin`) so the
  // request carries the user's JWT and satisfies helper-based RLS
  // policies introduced by migration 012_fix_profiles_recursion.sql.
  // See FIX-voucher-entry bug: dropdowns + voucher create were failing
  // because anon-keyed supabaseAdmin returned 0 rows (RLS deny via NULL
  // auth.uid()).
  const fetchFormulas = useCallback(async (): Promise<FarmFeedFormula[]> => {
    try {
      return (await readFeedFormulas(farmId)) as unknown as FarmFeedFormula[];
    } catch (err) {
      return [];
    }
  }, [farmId]);

  // Fetch formula items — same JWT-bound swap pattern.
  const fetchFormulaItems = useCallback(async (formulaId: string): Promise<FormulaItem[]> => {
    try {
      return (await readFormulaItems(formulaId)) as unknown as FormulaItem[];
    } catch (err) {
      return [];
    }
  }, []);

  // Fetch halls for farm — same JWT-bound swap pattern.
  const fetchHalls = useCallback(async (): Promise<HallConfig[]> => {
    try {
      const halls = await readFarmHalls(farmId);
      return halls.map((h) => ({
        hallNumber: numVal(h.hall_number),
        hallName: String(h.name || `سالن ${h.hall_number}`),
        mixerCount: 1,
        isSelected: false,
      }));
    } catch (err) {
      return [];
    }
  }, [farmId]);

  // Main fetch
  const fetchData = useCallback(async () => {
    if (!farmId || !date || !category) {
      setError('پارامترهای نامعتبر');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // The hook uses the JWT-bound `supabase` client (not the
      // deprecated anon-keyed `supabaseAdmin`) so every RLS predicate
      // migrating to SECURITY DEFINER helpers in
      // 012_fix_profiles_recursion.sql actually evaluates with a real
      // auth.uid(). When this client was supabaseAdmin the FORMULA,
      // HALL, ITEM, and VOUCHER queries returned 0 rows (RLS deny)
      // — the user-facing symptom was «خطا در دریافت اطلاعات» on open
      // and «خطا در ایجاد حواله» on submit.
      const offline = !(await checkSupabaseReachability());

      // 1. Get or create voucher. Offline: local lookup only (offline draft
      // creation is the write path's job). Online: unchanged find-or-create.
      let voucherId: string;
      let voucherStatus = 'draft';
      let voucherCreatedAt = new Date().toISOString();
      let voucherSubmittedAt: string | null = null;

      const client = supabase;

      if (!offline) {
      const { data: existingVoucher } = await client
        .from('daily_vouchers')
        .select('id, farm_id, voucher_date, category, status, created_at, submitted_at')
        .eq('farm_id', farmId)
        .eq('voucher_date', date)
        .eq('category', category)
        .maybeSingle();

      if (existingVoucher) {
        voucherId = existingVoucher.id;
        voucherStatus = existingVoucher.status;
        voucherCreatedAt = existingVoucher.created_at;
        voucherSubmittedAt = existingVoucher.submitted_at;
      } else {
        const { data: newVoucher, error: createError } = await client
          .from('daily_vouchers')
          .insert({ farm_id: farmId, voucher_date: date, category, status: 'draft' as const })
          .select('id, created_at, submitted_at')
          .single();

        if (createError) {
          const { data: retryVoucher } = await client
            .from('daily_vouchers')
            .select('id, status, created_at, submitted_at')
            .eq('farm_id', farmId)
            .eq('voucher_date', date)
            .eq('category', category)
            .maybeSingle();
          if (retryVoucher) {
            voucherId = retryVoucher.id;
            voucherStatus = retryVoucher.status;
            voucherCreatedAt = retryVoucher.created_at;
            voucherSubmittedAt = retryVoucher.submitted_at;
          } else {
            throw new Error('خطا در ایجاد حواله');
          }
        } else {
          voucherId = newVoucher.id;
          voucherCreatedAt = newVoucher.created_at;
        }
      }
      } else {
        const localVoucher = await findVoucher(farmId, date, category);
        if (!localVoucher) {
          throw new Error('خطا در ایجاد حواله');
        }
        voucherId = localVoucher.id as string;
        voucherStatus = (localVoucher.status as string) || 'draft';
        voucherCreatedAt = (localVoucher.created_at as string) || voucherCreatedAt;
        voucherSubmittedAt = (localVoucher.submitted_at as string) ?? null;
      }

      const isEditable =
        ignoreEditWindow ||
        voucherStatus === 'draft' ||
        (voucherStatus === 'submitted' && voucherSubmittedAt !== null &&
          Date.now() - new Date(voucherSubmittedAt).getTime() < 24 * 60 * 60 * 1000);
      // 2. Fetch farm items (local when offline)
      const farmItems = await readFarmItems(farmId, category);

      // 3. Fetch voucher lines (local when offline)
      const existingLines = await readVoucherLines(voucherId);

  // 4. Get stock balances (local when offline)
  const allTxns = await readFarmTransactions(farmId);

  const balanceMap = new Map<string, number>();
  const totalInMap = new Map<string, number>();
  if (allTxns) {
    for (const txn of allTxns) {
      const current = balanceMap.get(txn.item_id) || 0;
      balanceMap.set(txn.item_id, current + numVal(txn.qty_in) - numVal(txn.qty_out));
      const totalIn = totalInMap.get(txn.item_id) || 0;
      totalInMap.set(txn.item_id, totalIn + numVal(txn.qty_in));
    }
  }

      // 5. Get today's purchases (local when offline)
      const purchases = await readTodayPurchases(farmId, date);

      const purchaseMap = new Map<string, number>();
      if (purchases) {
        for (const p of purchases) {
          const current = purchaseMap.get(p.item_id) || 0;
          purchaseMap.set(p.item_id, current + numVal(p.qty_in));
        }
      }

      // 6. Fetch formulas and halls (feed only)
      let formulas: FarmFeedFormula[] = [];
      let selectedFormula: FarmFeedFormula | null = null;
      const formulaItemsMap = new Map<string, number>();
      let halls: HallConfig[] = [];

      if (category === 'feed') {
        formulas = await fetchFormulas();
        halls = await fetchHalls();

        if (formulas.length > 0) {
          const targetFormulaId = selectedFormulaId || formulas[0].id;
          selectedFormula = formulas.find(f => f.id === targetFormulaId) || formulas[0];
          if (selectedFormula) {
            const fItems = await fetchFormulaItems(selectedFormula.id);
            for (const fi of fItems) {
              formulaItemsMap.set(fi.item_id, numVal(fi.qty_per_mixer));
            }
          }
        }
        setHallConfigs(halls);
      }

      // Build lines map
      interface VoucherLine {
        id: string;
        item_id: string;
        formula_no: string | null;
        mixer_count: number | null;
        hall_numbers: string | null;
        consumed_qty: number;
        waste_qty: number;
        notes: string | null;
        hall_consumed: Record<string, number> | null;
        formula_id: string | null;
      }
      const linesMap = new Map<string, VoucherLine>();
      if (existingLines) {
        for (const line of existingLines) {
          linesMap.set(line.item_id, line as unknown as VoucherLine);
        }
      }

      // 7. Build items
      const processedItems: DailySheetRow[] = (farmItems || []).map((fi) => {
        const line = linesMap.get(fi.id);
        const balance = balanceMap.get(fi.id) || 0;
        const hasInitial = (totalInMap.get(fi.id) || 0) > 0;
        const purchaseQty = purchaseMap.get(fi.id) || 0;
        const consumed = line ? numVal(line.consumed_qty) : 0;
        const waste = line ? numVal(line.waste_qty) : 0;
        const remaining = balance - consumed - waste;
        const qtyPerMixer = formulaItemsMap.get(fi.id) || 0;
        const hallConsumed = (line?.hall_consumed && typeof line.hall_consumed === 'object')
          ? line.hall_consumed as Record<string, number>
          : {};
        const totalConsumed = consumed;

        let status: 'ok' | 'warning' | 'danger' = 'ok';
        if (remaining < 0) status = 'danger';
        else if (remaining < numVal(fi.reorder_point)) status = 'warning';

        return {
          id: fi.id,
          name: fi.name,
          unit: fi.unit,
          priority: fi.priority,
          reorder_point: numVal(fi.reorder_point),
          line_id: line ? line.id : null,
          formula_no: line ? String(line.formula_no || '') : (selectedFormula ? String(selectedFormula.formula_no) : ''),
          mixer_count: line ? numVal(line.mixer_count) : 0,
          hall_numbers: line ? String(line.hall_numbers || '') : '',
          consumed_qty: consumed,
          waste_qty: waste,
          notes: line ? String(line.notes || '') : '',
          current_balance: balance,
          today_purchase: purchaseQty,
          remaining_preview: remaining,
          qty_per_mixer: qtyPerMixer,
          hall_consumed: hallConsumed,
          total_consumed: totalConsumed,
          has_initial: hasInitial,
          has_stock_source: hasInitial || purchaseQty > 0,
          status,
        };
      });

      setData({
        voucher: {
          id: voucherId,
          farm_id: farmId,
          voucher_date: date,
          category,
          status: voucherStatus as 'draft' | 'submitted' | 'locked' | 'reverted',
          created_at: voucherCreatedAt,
          submitted_at: voucherSubmittedAt,
          is_editable: Boolean(isEditable),
        },
        items: processedItems,
        halls,
        formula: selectedFormula,
        formulas,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطای ناشناخته';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [farmId, date, category, selectedFormulaId, fetchFormulas, fetchFormulaItems, fetchHalls]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Select formula
  const selectFormula = useCallback((formulaId: string) => {
    setSelectedFormulaId(formulaId);
  }, []);

  // Update hall configs
  const updateHallConfigs = useCallback((configs: HallConfig[]) => {
    setHallConfigs(configs);
  }, []);

  // Auto-calculate consumption based on formula and halls
  const autoCalculate = useCallback(() => {
    if (!data || category !== 'feed') return;
    const selectedHalls = hallConfigs.filter(h => h.isSelected);
    if (selectedHalls.length === 0) return;

    setData(prev => {
      if (!prev) return prev;
      const updatedItems = prev.items.map(item => {
        if (item.qty_per_mixer <= 0) return item;

        const newHallConsumed: Record<string, number> = {};
        let totalConsumed = 0;

        for (const hall of selectedHalls) {
          const hallQty = item.qty_per_mixer * hall.mixerCount;
          newHallConsumed[String(hall.hallNumber)] = hallQty;
          totalConsumed += hallQty;
        }

        const remaining = item.current_balance - totalConsumed - item.waste_qty;
        let status: 'ok' | 'warning' | 'danger' = 'ok';
        if (remaining < 0) status = 'danger';
        else if (remaining < item.reorder_point) status = 'warning';

        const updated: DailySheetRow = {
          ...item,
          hall_consumed: newHallConsumed,
          consumed_qty: totalConsumed,
          total_consumed: totalConsumed,
          remaining_preview: remaining,
          hall_numbers: selectedHalls.map(h => h.hallNumber).join(','),
          mixer_count: selectedHalls.reduce((s, h) => s + h.mixerCount, 0),
          status,
          isDirty: true,
        };

        dirtyLinesRef.current.set(item.id, {
          item_id: item.id,
          formula_no: item.formula_no,
          mixer_count: updated.mixer_count,
          hall_numbers: updated.hall_numbers,
          consumed_qty: updated.consumed_qty,
          waste_qty: updated.waste_qty,
          notes: updated.notes,
          hall_consumed: updated.hall_consumed,
        });

        return updated;
      });
      return { ...prev, items: updatedItems };
    });

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { saveDraft(); }, 800);
  }, [data, hallConfigs, category]);

  // Update a single line
  const updateLine = useCallback(
    (itemId: string, field: keyof DailySheetRow, value: string | number) => {
      if (!data) return;

      setData(prev => {
        if (!prev) return prev;
        const updatedItems = prev.items.map(item => {
          if (item.id !== itemId) return item;
          const updated = { ...item, [field]: value, isDirty: true };
          const consumed = field === 'consumed_qty' ? toNumber(value) : toNumber(updated.consumed_qty);
          const waste = field === 'waste_qty' ? toNumber(value) : toNumber(updated.waste_qty);
          const remaining = toNumber(updated.current_balance) - consumed - waste;
          let status: 'ok' | 'warning' | 'danger' = 'ok';
          if (remaining < 0) status = 'danger';
          else if (remaining < toNumber(updated.reorder_point)) status = 'warning';
          return { ...updated, consumed_qty: consumed, waste_qty: waste, remaining_preview: remaining, total_consumed: consumed, status };
        });
        return { ...prev, items: updatedItems };
      });

      const currentItem = data.items.find(i => i.id === itemId);
      if (currentItem) {
        const updatedItem = { ...currentItem, [field]: value };
        dirtyLinesRef.current.set(itemId, {
          item_id: itemId,
          formula_no: String(updatedItem.formula_no || ''),
          mixer_count: toNumber(updatedItem.mixer_count),
          hall_numbers: String(updatedItem.hall_numbers || ''),
          consumed_qty: toNumber(field === 'consumed_qty' ? value : updatedItem.consumed_qty),
          waste_qty: toNumber(field === 'waste_qty' ? value : updatedItem.waste_qty),
          notes: String(updatedItem.notes || ''),
          hall_consumed: updatedItem.hall_consumed,
        });
      }

      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      setSaveStatus('idle');
      saveTimeoutRef.current = setTimeout(() => { saveDraft(); }, 800);
    },
    [data]
  );

  // Save draft — atomic single-round-trip bulk upsert. All dirty lines go
  // out in ONE upsert call (same row shape and onConflict as before); a
  // rejected upsert (RLS/validation — supabase-js resolves { error }, never
  // throws) throws into the catch below so dirty lines are RETAINED for
  // retry instead of being silently discarded. Returns true only when a
  // pending draft was actually persisted.
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!data || dirtyLinesRef.current.size === 0) return false;
    setSaveStatus('saving');
    setIsSaving(true);

    try {
      const rows = Array.from(dirtyLinesRef.current.values()).map((line) => ({
        voucher_id: data.voucher.id,
        item_id: line.item_id,
        formula_no: line.formula_no || null,
        mixer_count: line.mixer_count || null,
        hall_numbers: line.hall_numbers || null,
        consumed_qty: line.consumed_qty,
        waste_qty: line.waste_qty,
        notes: line.notes || null,
        hall_consumed: (line.hall_consumed || {}) as unknown as Json,
      }));

      const { error } = await supabase
        .from('daily_voucher_lines')
        .upsert(rows, { onConflict: 'voucher_id,item_id' });

      if (error) throw new Error(error.message || 'خطا در ذخیره');

      dirtyLinesRef.current.clear();
      setData(prev => {
        if (!prev) return prev;
        return { ...prev, items: prev.items.map(item => ({ ...item, isDirty: false })) };
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      return true;
    } catch (err) {
      setSaveStatus('error');
      toast.error('خطا در ذخیره');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [data]);

  // Submit
  const submitSheet = useCallback(async (): Promise<boolean> => {
    if (!data) return false;
    if (dirtyLinesRef.current.size > 0) {
      const flushed = await saveDraft();
      if (!flushed) {
        setIsSaving(false);
        return false;
      }
    }
    setIsSaving(true);

    try {
      const totalQty = data.items.reduce(
        (sum, item) => sum + toNumber(item.consumed_qty) + toNumber(item.waste_qty),
        0
      );
      if (totalQty <= 0) {
        toast.error('ثبت حواله خالی مجاز نیست');
        setIsSaving(false);
        return false;
      }

      // Check for any stock source (initial or purchase or other inbound)
      const missingStock = data.items.filter(
        i => !i.has_initial && i.today_purchase <= 0 && (i.consumed_qty > 0 || i.waste_qty > 0)
      );
      if (missingStock.length > 0) {
        const names = missingStock.map(i => i.name).join('، ');
        toast.error(`برای ثبت مصرف، باید برای این اقلام موجودی اولیه یا خرید ثبت شده باشد: ${names}`);
        setIsSaving(false);
        return false;
      }

      // Build the payload for the atomic submit RPC (single transaction with
      // server-side stock enforcement + row locking + 24h window).
      const items = data.items
        .filter(item => toNumber(item.consumed_qty) > 0 || toNumber(item.waste_qty) > 0)
        .map(item => ({
          item_id: item.id,
          consumed_qty: toNumber(item.consumed_qty),
          waste_qty: toNumber(item.waste_qty),
          adjustment_qty: 0,
        }));

      const { data: result, error: rpcErr } = await supabase.rpc('submit_daily_voucher', {
        p_voucher_id: data.voucher.id,
        p_farm_id: data.voucher.farm_id,
        p_voucher_date: data.voucher.voucher_date,
        p_items: items,
        p_ignore_window: ignoreEditWindow,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message || 'خطا در ثبت نهایی');
      }

      const r = result as unknown as {
        success: boolean;
        code?: string;
        message?: string;
        detail?: string;
        items?: Array<{ item_name?: string; unit?: string; shortage?: number }>;
      };

      // The RPC keeps the raw technical detail server-side; never render it to the user.
      if (r?.success === true) {
        toast.success('حواله با موفقیت ثبت شد');
        await fetchData();
        return true;
      }

      if (r?.code === 'NEGATIVE_STOCK') {
        const list = (r.items ?? [])
          .map(it => `• ${it.item_name ?? 'آیتم'}: کمبود ${Number(it.shortage ?? 0).toFixed(2)} ${it.unit ?? ''}`.trim())
          .join('\n');
        toast.error(`موجودی کافی نیست:\n${list}`, { duration: 10000 });
        return false;
      }

      toast.error(rpcError(r?.message) ?? 'خطا در ثبت نهایی');
      return false;
    } catch (err) {
      const message = rpcError(err) ?? 'خطا در ثبت نهایی';
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [data, saveDraft, fetchData, ignoreEditWindow]);

  // Revert — routes through the atomic revert_daily_voucher RPC (SECURITY
  // DEFINER, row-locked, structured Persian error codes) instead of the old
  // two-step client delete+update, which could leave partial state on failure
  // and bypassed the 24h window / role checks.
  const revertSheet = useCallback(async () => {
    if (!data) return;
    setIsSaving(true);
    try {
      const { data: result, error: rpcErr } = await supabase.rpc('revert_daily_voucher', {
        p_voucher_id: data.voucher.id,
      });

      if (rpcErr) {
        throw new Error(rpcErr.message || 'خطا در برگشت حواله');
      }

      const r = result as unknown as {
        success: boolean;
        code?: string;
        message?: string;
        detail?: string;
      };

      // The RPC keeps the raw technical detail server-side; never render it to the user.
      if (r?.success === true) {
        toast.success('حواله به حالت پیش‌نویس برگشت داده شد');
        await fetchData();
        return;
      }

      toast.error(rpcError(r?.message) ?? 'خطا در برگشت حواله');
    } catch (err) {
      const message = rpcError(err) ?? 'خطا در برگشت حواله';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  }, [data, fetchData, ignoreEditWindow]);

  useEffect(() => {
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, []);

  return {
    data,
    isLoading,
    error,
    isSaving,
    saveStatus,
    hallConfigs,
    updateLine,
    selectFormula,
    updateHallConfigs,
    autoCalculate,
    submitSheet,
    revertSheet,
    refetch: fetchData,
  };
}
