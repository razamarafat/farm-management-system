import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

  // Fetch formulas for farm
  const fetchFormulas = useCallback(async (): Promise<FarmFeedFormula[]> => {
    try {
      const { data: formulas } = await supabaseAdmin
        .from('farm_feed_formulas')
        .select('*')
        .eq('farm_id', farmId)
        .eq('is_active', true)
        .order('formula_no', { ascending: false });
      return (formulas || []) as unknown as FarmFeedFormula[];
    } catch {
      return [];
    }
  }, [farmId]);

  // Fetch formula items
  const fetchFormulaItems = useCallback(async (formulaId: string): Promise<FormulaItem[]> => {
    try {
      const { data: items } = await supabaseAdmin
        .from('farm_formula_items')
        .select('*')
        .eq('formula_id', formulaId);
      return (items || []) as unknown as FormulaItem[];
    } catch {
      return [];
    }
  }, []);

  // Fetch halls for farm
  const fetchHalls = useCallback(async (): Promise<HallConfig[]> => {
    try {
      const { data: halls } = await supabaseAdmin
        .from('farm_halls')
        .select('*')
        .eq('farm_id', farmId)
        .eq('is_active', true)
        .order('hall_number', { ascending: true });
      return (halls || []).map((h: Record<string, unknown>) => ({
        hallNumber: numVal(h.hall_number),
        hallName: String(h.name || `سالن ${h.hall_number}`),
        mixerCount: 1,
        isSelected: false,
      }));
    } catch {
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
      const client = supabaseAdmin;

      // 1. Get or create voucher
      let voucherId: string;
      let voucherStatus = 'draft';
      let voucherCreatedAt = new Date().toISOString();
      let voucherSubmittedAt: string | null = null;

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

      const isEditable =
        ignoreEditWindow ||
        voucherStatus === 'draft' ||
        (voucherStatus === 'submitted' && voucherSubmittedAt !== null &&
          Date.now() - new Date(voucherSubmittedAt).getTime() < 24 * 60 * 60 * 1000);
      // 2. Fetch farm items
      const { data: farmItems } = await client
        .from('farm_items')
        .select('id, name, unit, priority, reorder_point')
        .eq('farm_id', farmId)
        .eq('category', category)
        .eq('is_active', true)
        .order('priority', { ascending: true })
        .order('name', { ascending: true });

      // 3. Fetch voucher lines
      const { data: existingLines } = await client
        .from('daily_voucher_lines')
        .select('id, item_id, formula_no, mixer_count, hall_numbers, consumed_qty, waste_qty, notes, hall_consumed, formula_id')
        .eq('voucher_id', voucherId);

        // 4. Get stock balances
  const { data: allTxns } = await client
    .from('inventory_transactions')
    .select('item_id, qty_in, qty_out, txn_type')
    .eq('farm_id', farmId);

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

      // 5. Get today's purchases
      const { data: purchases } = await client
        .from('inventory_transactions')
        .select('item_id, qty_in')
        .eq('farm_id', farmId)
        .eq('txn_date', date)
        .eq('txn_type', 'purchase');

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
      let formulaItemsMap = new Map<string, number>();
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
      console.error('Fetch daily sheet error:', err);
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

  // Save draft
  const saveDraft = useCallback(async () => {
    if (!data || dirtyLinesRef.current.size === 0) return;
    setSaveStatus('saving');
    setIsSaving(true);

    try {
      const lines = Array.from(dirtyLinesRef.current.values());

      for (const line of lines) {
        await supabaseAdmin.from('daily_voucher_lines').upsert(
          {
            voucher_id: data.voucher.id,
            item_id: line.item_id,
            formula_no: line.formula_no || null,
            mixer_count: line.mixer_count || null,
            hall_numbers: line.hall_numbers || null,
            consumed_qty: line.consumed_qty,
            waste_qty: line.waste_qty,
            notes: line.notes || null,
            hall_consumed: (line.hall_consumed || {}) as unknown as Json,
          },
          { onConflict: 'voucher_id,item_id' }
        );
      }

      dirtyLinesRef.current.clear();
      setData(prev => {
        if (!prev) return prev;
        return { ...prev, items: prev.items.map(item => ({ ...item, isDirty: false })) };
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save draft error:', err);
      setSaveStatus('error');
      toast.error('خطا در ذخیره');
    } finally {
      setIsSaving(false);
    }
  }, [data]);

  // Submit
  const submitSheet = useCallback(async (): Promise<boolean> => {
    if (!data) return false;
    if (dirtyLinesRef.current.size > 0) await saveDraft();
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

      // Check for negative stock
      const negativeItems = data.items.filter(i => i.remaining_preview < 0 && (i.consumed_qty > 0 || i.waste_qty > 0));
      if (negativeItems.length > 0) {
        const list = negativeItems.map(i => `• ${i.name}: کمبود ${Math.abs(i.remaining_preview).toFixed(2)} ${i.unit}`).join('\n');
        toast.error(`موجودی کافی نیست:\n${list}`, { duration: 10000 });
        setIsSaving(false);
        return false;
      }

      // If admin override, allow resubmitting by clearing previous transactions
      if (ignoreEditWindow) {
        await supabaseAdmin.from('inventory_transactions')
          .delete()
          .eq('source_type', 'daily_voucher')
          .eq('source_id', data.voucher.id);
      }

      // Create inventory transactions
      for (const item of data.items) {
        if (item.consumed_qty > 0) {
          await supabaseAdmin.from('inventory_transactions').insert({
            farm_id: data.voucher.farm_id,
            item_id: item.id,
            txn_date: data.voucher.voucher_date,
            txn_type: 'consumption' as const,
            qty_out: item.consumed_qty,
            qty_in: 0,
            source_type: 'daily_voucher',
            source_id: data.voucher.id,
          });
        }
        if (item.waste_qty > 0) {
          await supabaseAdmin.from('inventory_transactions').insert({
            farm_id: data.voucher.farm_id,
            item_id: item.id,
            txn_date: data.voucher.voucher_date,
            txn_type: 'waste' as const,
            qty_out: item.waste_qty,
            qty_in: 0,
            source_type: 'daily_voucher',
            source_id: data.voucher.id,
          });
        }
      }

      // Update voucher status
      await supabaseAdmin.from('daily_vouchers').update({
        status: 'submitted' as const,
        submitted_at: new Date().toISOString(),
      }).eq('id', data.voucher.id);

      toast.success('حواله با موفقیت ثبت شد');
      await fetchData();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در ثبت نهایی';
      console.error('Submit error:', err);
      toast.error(message);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [data, saveDraft, fetchData, ignoreEditWindow]);

  // Revert
  const revertSheet = useCallback(async () => {
    if (!data) return;
    setIsSaving(true);
    try {
      await supabaseAdmin.from('inventory_transactions')
        .delete()
        .eq('source_type', 'daily_voucher')
        .eq('source_id', data.voucher.id);

      await supabaseAdmin.from('daily_vouchers').update({
        status: 'draft' as const,
        submitted_at: null,
        reverted_at: new Date().toISOString(),
      }).eq('id', data.voucher.id);

      toast.success('حواله به حالت پیش‌نویس برگشت داده شد');
      await fetchData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'خطا در برگشت حواله';
      console.error('Revert error:', err);
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
