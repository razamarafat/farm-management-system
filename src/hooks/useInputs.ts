import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/utils/rpc';
import { rpcError } from '@/utils/rpcError';
import { toast } from 'sonner';
import type { Input, InputInsert, InputFilters } from '@/types/input.types';

export function useInputs(filters: InputFilters) {
  const [inputs, setInputs] = useState<Input[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const fetchInputs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('inputs')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (debouncedSearch) query = query.ilike('name', `%${debouncedSearch}%`);
      if (filters.category !== 'all') query = query.eq('category', filters.category);
      if (filters.status === 'active')   query = query.eq('is_active', true);
      if (filters.status === 'inactive') query = query.eq('is_active', false);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setInputs((data || []) as Input[]);
    } catch (err) {
      console.error('Error fetching inputs:', err);
      setError('خطا در دریافت اطلاعات نهاده‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters.category, filters.status]);

  useEffect(() => { fetchInputs(); }, [fetchInputs]);

  return { inputs, isLoading, error, refetch: fetchInputs };
}

export function useActiveInputs(category?: 'feed' | 'packaging') {
  const [inputs, setInputs] = useState<Input[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInputs = async () => {
      setIsLoading(true);
      try {
        let query = supabase.from('inputs').select('*').eq('is_active', true).order('name');
        if (category) query = query.eq('category', category);
        const { data } = await query;
        setInputs((data || []) as Input[]);
      } catch (err) {
        console.error('Error fetching active inputs:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInputs();
  }, [category]);

  return { inputs, isLoading };
}

export function useCreateInput() {
  const [isCreating, setIsCreating] = useState(false);

  const createInput = async (input: InputInsert) => {
    if (!input.name.trim()) {
      toast.error('لطفاً نام نهاده را وارد کنید');
      return false;
    }
    setIsCreating(true);
    try {
      const { error } = await rpc('rpc_admin_create_input', {
        p_name:         input.name,
        p_category:     input.category,
        p_default_unit: input.default_unit ?? 'کیلوگرم',
        p_description:  input.description ?? '',
        p_is_active:    input.is_active ?? true,
      });
      if (error) throw error;
      toast.success('نهاده جدید با موفقیت ثبت شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در ثبت نهاده جدید');
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  return { isCreating, createInput };
}

export function useUpdateInput() {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateInput = async (id: string, input: Partial<InputInsert>) => {
    if (input.name !== undefined && !input.name.trim()) {
      toast.error('نام نهاده نمی‌تواند خالی باشد');
      return false;
    }
    setIsUpdating(true);
    try {
      // Fetch-then-merge to preserve partial-update semantics.
      const { data: current, error: fetchErr } = await supabase
        .from('inputs').select('*').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      const merged = { ...(current as Input), ...input };
      const { error } = await rpc('rpc_admin_update_input', {
        p_id:           id,
        p_name:         merged.name ?? '',
        p_category:     merged.category ?? 'feed',
        p_default_unit: merged.default_unit ?? '',
        p_description:  merged.description ?? '',
        p_is_active:    merged.is_active ?? true,
      });
      if (error) throw error;
      toast.success('اطلاعات نهاده بروزرسانی شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در بروزرسانی نهاده');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateInput };
}

export function useDeleteInput() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteInput = async (id: string, hard: boolean = false) => {
    setIsDeleting(true);
    try {
      const { error } = await rpc('rpc_admin_delete_input', { p_id: id, p_hard: hard });
      if (error) throw error;
      toast.success(hard ? 'نهاده با موفقیت حذف شد' : 'نهاده غیرفعال شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در حذف نهاده');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteInput };
}

export function useToggleInputStatus() {
  const toggleStatus = async (id: string) => {
    try {
      const { data, error } = await rpc<{ is_active: boolean }>('rpc_admin_toggle_input', { p_id: id });
      if (error) throw error;
      const next = (data && (data as { is_active?: boolean }).is_active) ?? null;
      toast.success(next === false ? 'نهاده غیرفعال شد' : 'نهاده فعال شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در تغییر وضعیت نهاده');
      return false;
    }
  };
  return { toggleStatus };
}
