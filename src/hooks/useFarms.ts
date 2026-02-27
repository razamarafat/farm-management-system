import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { Farm, FarmInsert } from '@/types/farm.types';

export interface FarmFilters {
  search: string;
  status: 'all' | 'active' | 'inactive';
}

export const useFarms = (filters: FarmFilters) => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const fetchFarms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('farms')
        .select('*')
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const search = `%${debouncedSearch}%`;
        query = query.or(`name.ilike.${search},code.ilike.${search}`);
      }
      if (filters.status === 'active') query = query.eq('is_active', true);
      if (filters.status === 'inactive') query = query.eq('is_active', false);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setFarms((data || []) as Farm[]);
    } catch (err) {
      console.error(err);
      setError('خطا در دریافت اطلاعات');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters.status]);

  useEffect(() => {
    fetchFarms();
  }, [fetchFarms]);

  return { farms, isLoading, error, refetch: fetchFarms };
};

export const useCreateFarm = () => {
  const [isCreating, setIsCreating] = useState(false);

  const createFarm = async (input: FarmInsert) => {
    setIsCreating(true);
    try {
      const { error } = await supabaseAdmin.from('farms').insert(input);
      if (error) throw error;
      toast.success('فارم جدید ایجاد شد');
      return true;
    } catch {
      toast.error('خطا در ایجاد فارم');
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  return { isCreating, createFarm };
};

export const useUpdateFarm = () => {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateFarm = async (id: string, input: Partial<FarmInsert>) => {
    setIsUpdating(true);
    try {
      const { error } = await supabaseAdmin.from('farms').update(input).eq('id', id);
      if (error) throw error;
      toast.success('اطلاعات فارم بروزرسانی شد');
      return true;
    } catch {
      toast.error('خطا در بروزرسانی فارم');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateFarm };
};

export const useDeleteFarm = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteFarm = async (id: string, hard: boolean) => {
    setIsDeleting(true);
    try {
      if (hard) {
        const { error } = await supabaseAdmin.from('farms').delete().eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from('farms').update({ is_active: false }).eq('id', id);
        if (error) throw error;
      }
      toast.success(hard ? 'فارم حذف شد' : 'فارم غیرفعال شد');
      return true;
    } catch {
      toast.error('خطا در حذف فارم');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteFarm };
};

export const useToggleFarmStatus = () => {
  const toggleStatus = async (id: string, current: boolean) => {
    try {
      const { error } = await supabaseAdmin.from('farms').update({ is_active: !current }).eq('id', id);
      if (error) throw error;
      toast.success(current ? 'فارم غیرفعال شد' : 'فارم فعال شد');
      return true;
    } catch {
      toast.error('خطا در بروزرسانی وضعیت فارم');
      return false;
    }
  };

  return { toggleStatus };
};
