import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/utils/rpc';
import { rpcError } from '@/utils/rpcError';
import { toast } from 'sonner';
import type { Supplier, SupplierInsert, SupplierFilters } from '@/types/supplier.types';

export function useSuppliers(filters: SupplierFilters) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const fetchSuppliers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (debouncedSearch) query = query.ilike('name', `%${debouncedSearch}%`);
      if (filters.status === 'active')   query = query.eq('is_active', true);
      if (filters.status === 'inactive') query = query.eq('is_active', false);

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setSuppliers((data || []) as Supplier[]);
    } catch (err) {
      console.error(err);
      setError('خطا در دریافت اطلاعات تأمین‌کنندگان');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters.status]);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  return { suppliers, isLoading, error, refetch: fetchSuppliers };
}

export function useActiveSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuppliers = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('suppliers')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });
        setSuppliers((data || []) as Supplier[]);
      } catch (err) {
        console.error('Error fetching suppliers:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchSuppliers();
  }, []);

  return { suppliers, isLoading };
}

export function useCreateSupplier() {
  const [isCreating, setIsCreating] = useState(false);

  const createSupplier = async (input: SupplierInsert) => {
    setIsCreating(true);
    try {
      const { error } = await rpc('rpc_admin_create_supplier', {
        p_name:      input.name,
        p_is_active: input.is_active ?? true,
      });
      if (error) throw error;
      toast.success('تأمین‌کننده جدید ایجاد شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در ایجاد تأمین‌کننده');
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  return { isCreating, createSupplier };
}

export function useUpdateSupplier() {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateSupplier = async (id: string, input: Partial<SupplierInsert>) => {
    setIsUpdating(true);
    try {
      const { data: current, error: fetchErr } = await supabase
        .from('suppliers').select('*').eq('id', id).single();
      if (fetchErr) throw fetchErr;
      const merged = { ...(current as Supplier), ...input };
      const { error } = await rpc('rpc_admin_update_supplier', {
        p_id:        id,
        p_name:      merged.name ?? '',
        p_is_active: merged.is_active ?? true,
      });
      if (error) throw error;
      toast.success('اطلاعات تأمین‌کننده بروزرسانی شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در بروزرسانی تأمین‌کننده');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateSupplier };
}

export const useDeleteSupplier = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSupplier = async (id: string, hard: boolean = false) => {
    setIsDeleting(true);
    try {
      const { error } = await rpc('rpc_admin_delete_supplier', { p_id: id, p_hard: hard });
      if (error) throw error;
      toast.success(hard ? 'تأمین‌کننده حذف شد' : 'تأمین‌کننده غیرفعال شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در حذف تأمین‌کننده');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteSupplier };
};

export function useCheckSupplierUsage() {
  const checkUsage = async (supplierId: string): Promise<{ hasUsage: boolean; count: number }> => {
    try {
      const { data, error } = await rpc<number>('rpc_supplier_usage_count', { p_supplier_id: supplierId });
      if (error) throw error;
      const count = Number(data) || 0;
      return { hasUsage: count > 0, count };
    } catch {
      return { hasUsage: false, count: 0 };
    }
  };
  return { checkUsage };
}

export function useToggleSupplierStatus() {
  const toggleStatus = async (id: string) => {
    try {
      const { data, error } = await rpc<{ is_active: boolean }>('rpc_admin_toggle_supplier', { p_id: id });
      if (error) throw error;
      const next = (data && (data as { is_active?: boolean }).is_active) ?? null;
      toast.success(next === false ? 'تأمین‌کننده غیرفعال شد' : 'تأمین‌کننده فعال شد');
      return true;
    } catch (err) {
      toast.error(rpcError(err) || 'خطا در بروزرسانی وضعیت تأمین‌کننده');
      return false;
    }
  };
  return { toggleStatus };
}
