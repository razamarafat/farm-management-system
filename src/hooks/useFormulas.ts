import { logger } from '@/utils/logger';
import { useState, useEffect, useCallback } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
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
      const { data: rawFormulas, error: fetchErr } = await supabaseAdmin
        .from('farm_feed_formulas')
        .select('*')
        .eq('farm_id', farmId)
        .order('formula_no', { ascending: true });

      if (fetchErr) throw fetchErr;

      const results: Formula[] = [];
      for (const f of rawFormulas || []) {
        const { data: rawItems } = await supabaseAdmin
          .from('farm_formula_items')
          .select('*')
          .eq('formula_id', f.id);

        const enriched: FormulaItem[] = [];
        for (const ri of rawItems || []) {
          const { data: fi } = await supabaseAdmin
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
      logger.error('Fetch formulas error:', err);
      setError('خطا در دریافت فرمول‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    fetchFormulas();
  }, [fetchFormulas]);

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
        const { data } = await supabaseAdmin
          .from('farm_items')
          .select('id, name, unit, priority')
          .eq('farm_id', farmId)
          .eq('category', 'feed')
          .eq('is_active', true)
          .order('priority', { ascending: true });

        setItems(
          (data || []).map((i) => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            priority: i.priority,
          }))
        );
      } catch (err) {
        logger.error('Fetch farm items error:', err);
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

  const createFormula = async (input: FormulaInput): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      const { data: existing } = await supabaseAdmin
        .from('farm_feed_formulas')
        .select('id')
        .eq('farm_id', farmId)
        .eq('formula_no', input.formula_no)
        .maybeSingle();

      if (existing) {
        toast.error(`فرمول شماره ${input.formula_no} قبلاً وجود دارد`);
        return false;
      }

      const insertData: Record<string, unknown> = {
        farm_id: farmId,
        formula_no: input.formula_no,
        name: input.name || null,
        mixer_weight: input.mixer_weight,
        is_active: input.is_active,
      };

      const { data: formula, error: createErr } = await supabaseAdmin
        .from('farm_feed_formulas')
        .insert(insertData as never)
        .select('id')
        .single();

      if (createErr || !formula) throw createErr || new Error('خطا در ایجاد فرمول');

      const validItems = input.items.filter((i) => i.qty_per_mixer > 0);
      if (validItems.length > 0) {
        const itemRows = validItems.map((item) => ({
          formula_id: (formula as { id: string }).id,
          item_id: item.item_id,
          qty_per_mixer: item.qty_per_mixer,
        }));

        const { error: itemsErr } = await supabaseAdmin
          .from('farm_formula_items')
          .insert(itemRows as never[]);

        if (itemsErr) throw itemsErr;
      }

      toast.success('فرمول با موفقیت ایجاد شد');
      return true;
    } catch (err) {
      logger.error('Create formula error:', err);
      toast.error('خطا در ایجاد فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateFormula = async (formulaId: string, input: FormulaInput): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        name: input.name || null,
        mixer_weight: input.mixer_weight,
        is_active: input.is_active,
      };

      const { error: updateErr } = await supabaseAdmin
        .from('farm_feed_formulas')
        .update(updateData as never)
        .eq('id', formulaId);

      if (updateErr) throw updateErr;

      await supabaseAdmin.from('farm_formula_items').delete().eq('formula_id', formulaId);

      const validItems = input.items.filter((i) => i.qty_per_mixer > 0);
      if (validItems.length > 0) {
        const itemRows = validItems.map((item) => ({
          formula_id: formulaId,
          item_id: item.item_id,
          qty_per_mixer: item.qty_per_mixer,
        }));

        const { error: itemsErr } = await supabaseAdmin
          .from('farm_formula_items')
          .insert(itemRows as never[]);

        if (itemsErr) throw itemsErr;
      }

      toast.success('فرمول بروزرسانی شد');
      return true;
    } catch (err) {
      logger.error('Update formula error:', err);
      toast.error('خطا در بروزرسانی فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteFormula = async (formulaId: string): Promise<boolean> => {
    setIsSaving(true);
    try {
      await supabaseAdmin.from('farm_formula_items').delete().eq('formula_id', formulaId);
      const { error } = await supabaseAdmin.from('farm_feed_formulas').delete().eq('id', formulaId);
      if (error) throw error;
      toast.success('فرمول حذف شد');
      return true;
    } catch (err) {
      logger.error('Delete formula error:', err);
      toast.error('خطا در حذف فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const toggleFormulaStatus = async (formulaId: string, currentActive: boolean): Promise<boolean> => {
    try {
      const { error } = await supabaseAdmin
        .from('farm_feed_formulas')
        .update({ is_active: !currentActive } as never)
        .eq('id', formulaId);
      if (error) throw error;
      toast.success(currentActive ? 'فرمول غیرفعال شد' : 'فرمول فعال شد');
      return true;
    } catch (err) {
      logger.error('Toggle formula error:', err);
      toast.error('خطا در تغییر وضعیت');
      return false;
    }
  };

  const duplicateFormula = async (formula: Formula, newNo: number): Promise<boolean> => {
    if (!farmId) return false;
    setIsSaving(true);
    try {
      const insertData: Record<string, unknown> = {
        farm_id: farmId,
        formula_no: newNo,
        name: formula.name ? `${formula.name} (کپی)` : `کپی فرمول ${formula.formula_no}`,
        mixer_weight: formula.mixer_weight,
        is_active: true,
      };

      const { data: newF, error: createErr } = await supabaseAdmin
        .from('farm_feed_formulas')
        .insert(insertData as never)
        .select('id')
        .single();

      if (createErr || !newF) throw createErr;

      if (formula.items.length > 0) {
        const itemRows = formula.items.map((item) => ({
          formula_id: (newF as { id: string }).id,
          item_id: item.item_id,
          qty_per_mixer: item.qty_per_mixer,
        }));

        await supabaseAdmin.from('farm_formula_items').insert(itemRows as never[]);
      }

      toast.success(`فرمول کپی شد به شماره ${newNo}`);
      return true;
    } catch (err) {
      logger.error('Duplicate formula error:', err);
      toast.error('خطا در کپی فرمول');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { createFormula, updateFormula, deleteFormula, toggleFormulaStatus, duplicateFormula, isSaving };
}
