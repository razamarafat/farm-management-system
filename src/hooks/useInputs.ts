import { useState, useEffect, useCallback } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { useAuthStore } from '@/store/authStore';
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
      let query = supabaseAdmin
        .from('inputs')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }
      if (filters.category !== 'all') {
        query = query.eq('category', filters.category);
      }
      if (filters.status === 'active') query = query.eq('is_active', true);
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

  useEffect(() => {
    fetchInputs();
  }, [fetchInputs]);

  return { inputs, isLoading, error, refetch: fetchInputs };
}

export function useActiveInputs(category?: 'feed' | 'packaging') {
  const [inputs, setInputs] = useState<Input[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchInputs = async () => {
      setIsLoading(true);
      try {
        let query = supabaseAdmin
          .from('inputs')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (category) {
          query = query.eq('category', category);
        }

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
  const { user } = useAuthStore();

  const createInput = async (input: InputInsert) => {
    if (!input.name.trim()) {
      toast.error('لطفاً نام نهاده را وارد کنید');
      return false;
    }

    setIsCreating(true);
    try {
      const payload = {
        name: input.name.trim(),
        category: input.category,
        default_unit: input.default_unit || 'کیلوگرم',
        description: input.description || null,
        is_active: input.is_active ?? true,
        created_by: user?.id || null,
      };
      const { error } = await supabaseAdmin
        .from('inputs')
        .insert(payload as any);

      if (error) {
        if (error.code === '23505') {
          toast.error('نهاده‌ای با این نام قبلاً ثبت شده است');
        } else {
          throw error;
        }
        return false;
      }

      toast.success('نهاده جدید با موفقیت ثبت شد');
      return true;
    } catch (err) {
      console.error('Error creating input:', err);
      toast.error('خطا در ثبت نهاده جدید');
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
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name.trim();
      if (input.category !== undefined) updateData.category = input.category;
      if (input.default_unit !== undefined) updateData.default_unit = input.default_unit;
      if (input.description !== undefined) updateData.description = input.description || null;
      if (input.is_active !== undefined) updateData.is_active = input.is_active;

      const { error } = await supabaseAdmin
        .from('inputs')
        .update(updateData)
        .eq('id', id);

      if (error) {
        if (error.code === '23505') {
          toast.error('نهاده‌ای با این نام قبلاً ثبت شده است');
        } else {
          throw error;
        }
        return false;
      }

      toast.success('اطلاعات نهاده بروزرسانی شد');
      return true;
    } catch (err) {
      console.error('Error updating input:', err);
      toast.error('خطا در بروزرسانی نهاده');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateInput };
}

export function useDeleteInput() {
  const [isDeleting, setIsDeleting] = useState(false);    const deleteInput = async (id: string) => {
    setIsDeleting(true);
    try {
      // Check if this input name is used in any farm_items
      const { data: inputData } = await supabaseAdmin
        .from('inputs')
        .select('name')
        .eq('id', id)
        .single();

      if (inputData) {
        const { count: usageCount } = await supabaseAdmin
          .from('farm_items')
          .select('*', { count: 'exact', head: true })
          .eq('name', inputData.name);

        if (usageCount && usageCount > 0) {
          toast.error(`این نهاده در ${usageCount} فارم استفاده شده و قابل حذف نیست. ابتدا آن را غیرفعال کنید.`);
          return false;
        }
      }

      const { error } = await supabaseAdmin
        .from('inputs')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('نهاده با موفقیت حذف شد');
      return true;
    } catch (err) {
      console.error('Error deleting input:', err);
      toast.error('خطا در حذف نهاده');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteInput };
}

export function useToggleInputStatus() {
  const toggleStatus = async (id: string, current: boolean) => {
    try {
      const { error } = await supabaseAdmin
        .from('inputs')
        .update({ is_active: !current })
        .eq('id', id);

      if (error) throw error;
      toast.success(current ? 'نهاده غیرفعال شد' : 'نهاده فعال شد');
      return true;
    } catch (err) {
      console.error('Error toggling input status:', err);
      toast.error('خطا در تغییر وضعیت نهاده');
      return false;
    }
  };

  return { toggleStatus };
}
