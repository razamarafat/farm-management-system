import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/utils/rpc';
import { rpcError } from '@/utils/rpcError';
import { toast } from 'sonner';

export interface FormulaItem {
  id: string;
  formula_id: string;
  item_id: string;
  qty_per_mixer: number;
  item_name?: string;
  item_unit?: string;
}

export interface Formula {
  id: string;
  farm_id: string;
  formula_no: number;
  name: string | null;
  mixer_weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  items: FormulaItem[];
  total_weight: number;
}

export interface FormulaInput {
  formula_no: number;
  name: string;
  mixer_weight: number;
  is_active: boolean;
  items: { item_id: string; qty_per_mixer: number }[];
}

export interface FarmItemBasic {
  id: string;
  name: string;
  unit: string;
  priority: number;
}

export function useFormulas(farmId: string | null) {
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFormulas = useCallback(async () => {
    if (!farmId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data: rawFormulas, error: fetchErr } = await supabase
        .from('farm_feed_formulas')
        .select('*')
        .eq('farm_id', farmId)
        .order('formula_no', { ascending: true });
      if (fetchErr) throw fetchErr;

      const results: Formula[] = [];
      for (const f of rawFormulas || []) {
        const { data: rawItems } = await supabase
          .from('farm_formula_items')
          .select('*')
          .eq('formula_id', f.id);
        const enriched: FormulaItem[] = [];
        for (const ri of rawItems || []) {
          const { data: fi } = await supabase
            .from('farm_items')
            .select('name, unit')
            .eq('id', ri.item_id)
            .maybeSingle();
          enriched.push({
            id: ri.id,
            formula_id: ri.formula_id,
            item_id: ri.item_id,
            qty_per_mixer: Number(ri.qty_per_mixer) || 0,
            item_name: fi?.name || 'نامشخص',
            item_unit: fi?.unit || 'کیلوگرم',
          });
        }
        const totalWeight = enriched.reduce((s, i) => s + i.qty_per_mixer, 0);
        results.push({
          id: f.id,
          farm_id: f.farm_id,
          formula_no: f.formula_no,
          name: f.name,
          mixer_weight: Number(f.mixer_weight) || 3000,
          is_active: f.is_active,
          created_at: f.created_at,
          updated_at: f.updated_at,
          items: enriched,
          total_weight: totalWeight,
        });
      }
      setFormulas(results);
    } catch (err) {
      console.error('Fetch formulas error:', err);
      setError('خطا در دریافت فرمول‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [farmId]);

  useEffect(() => { fetchFormulas(); }, [fetchFormulas]);

  return { formulas, isLoading, error, refetch: fetchFormulas };
}

export function useFarmFeedItems(farmId: string | null) {
  const [items, setItems] = useState<FarmItemBasic[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!farmId) return;
    const load = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('farm_items')
          .select('id, name, unit, priority')
          .eq('farm_id', farmId)
          .eq('category', 'feed')
          .eq('is_active', true)
          .order('priority', { ascending: true });

        setItems(
          (data || []).map((i) => ({
            id: i.id, name: i.name, unit: i.unit, priority: i.priority,
          })),
        );
      } catch (err) {
        console.error('Fetch farm items error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [farmId]);

  return { items, isLoading };
}

export function useFormulaActions(farmId: string | null) {
  const [isSaving, setIsSaving] = useState(false);

  const validItemsJsonb = (input: FormulaInput) =>
    input.items
      .filter((i) => i.qty_per_mixer > 0)
      .map((i) => ({ item_id: i.item_id, qty_per_mixer: Number(i.qty_per_mixer) || 0 }));

  const createFormula = async (input: FormulaInput): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      const { error } = await rpc('rpc_admin_create_formula', {
        p_farm_id:     farmId,
        p_formula_no:  input.formula_no,
        p_name:        input.name ?? '',
        p_mixer_weight: Number(input.mixer_weight) || 0,
        p_is_active:   !!input.is_active,
        p_items:       validItemsJsonb(input),
      });
      if (error) throw error;
      toast.success('فرمول با موفقیت ایجاد شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در ایجاد فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateFormula = async (formulaId: string, input: FormulaInput): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      // rpc_admin_update_formula replaces the items atomically, so the
      // call sends whatever items the user authored — partial-update of
      // header fields isn't supported by the RPC signature; the form
      // always supplies the full FormulaInput.
      const { error } = await rpc('rpc_admin_update_formula', {
        p_formula_id:   formulaId,
        p_name:         input.name ?? '',
        p_mixer_weight: Number(input.mixer_weight) || 0,
        p_is_active:    !!input.is_active,
        p_items:        validItemsJsonb(input),
      });
      if (error) throw error;
      toast.success('فرمول بروزرسانی شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در بروزرسانی فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFormula = async (formulaId: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      const { error } = await rpc('rpc_admin_delete_formula', { p_formula_id: formulaId });
      if (error) throw error;
      toast.success('فرمول حذف شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در حذف فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFormulaStatus = async (formulaId: string): Promise<boolean> => {
    try {
      const { data, error } = await rpc<{ is_active: boolean }>(
        'rpc_admin_toggle_formula',
        { p_formula_id: formulaId },
      );
      if (error) throw error;
      const next = (data && (data as { is_active?: boolean }).is_active) ?? null;
      toast.success(next === false ? 'فرمول غیرفعال شد' : 'فرمول فعال شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در تغییر وضعیت');
      return false;
    }
  };

  const duplicateFormula = async (formula: Formula, newNo: number): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      const { error } = await rpc('rpc_admin_duplicate_formula', {
        p_source_formula_id: formula.id,
        p_new_no: newNo,
      });
      if (error) throw error;
      toast.success(`فرمول کپی شد به شماره ${newNo}`);
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در کپی فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { createFormula, updateFormula, deleteFormula, toggleFormulaStatus, duplicateFormula, isSaving };
}
