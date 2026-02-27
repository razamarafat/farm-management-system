import { useState, useEffect, useCallback } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { useAuthStore } from '@/store/authStore';
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
      let query = supabaseAdmin
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true });

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }
      if (filters.status === 'active') query = query.eq('is_active', true);
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

  useEffect(() => {
    fetchSuppliers();
  }, [fetchSuppliers]);

  return { suppliers, isLoading, error, refetch: fetchSuppliers };
}

export function useActiveSuppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSuppliers = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabaseAdmin
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
  const { user } = useAuthStore();

  const createSupplier = async (input: SupplierInsert) => {
    setIsCreating(true);
    try {
      const { error } = await supabaseAdmin
        .from('suppliers')
        .insert({
          name: input.name,
          is_active: input.is_active ?? true,
          created_by: user?.id,
        } as any);
      if (error) throw error;
      toast.success('تأمین‌کننده جدید ایجاد شد');
      return true;
    } catch {
      toast.error('خطا در ایجاد تأمین‌کننده');
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
      const { error } = await supabaseAdmin
        .from('suppliers')
        .update({
          name: input.name,
          is_active: input.is_active,
        } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success('اطلاعات تأمین‌کننده بروزرسانی شد');
      return true;
    } catch {
      toast.error('خطا در بروزرسانی تأمین‌کننده');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateSupplier };
}

export function useDeleteSupplier() {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteSupplier = async (id: string, hard: boolean = false) => {
    setIsDeleting(true);
    try {
      if (hard) {
        const { error } = await supabaseAdmin.from('suppliers').delete().eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabaseAdmin.from('suppliers').update({ is_active: false }).eq('id', id);
        if (error) throw error;
      }
      toast.success(hard ? 'تأمین‌کننده حذف شد' : 'تأمین‌کننده غیرفعال شد');
      return true;
    } catch {
      toast.error('خطا در حذف تأمین‌کننده');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteSupplier };
}

export function useCheckSupplierUsage() {
  const checkUsage = async (supplierId: string): Promise<{ hasUsage: boolean; count: number }> => {
    try {
      const { count, error } = await supabaseAdmin
        .from('inventory_transactions')
        .select('*', { count: 'exact', head: true })
        .eq('supplier_id', supplierId)
        .neq('txn_type', 'consumption')
        .neq('txn_type', 'waste')
        .neq('txn_type', 'transfer_out');

      if (error) throw error;
      return { hasUsage: (count || 0) > 0, count: count || 0 };
    } catch {
      return { hasUsage: false, count: 0 };
    }
  };

  return { checkUsage };
}

export function useToggleSupplierStatus() {
  const toggleStatus = async (id: string, current: boolean) => {
    try {
      const { error } = await supabaseAdmin
        .from('suppliers')
        .update({ is_active: !current } as any)
        .eq('id', id);
      if (error) throw error;
      toast.success(current ? 'تأمین‌کننده غیرفعال شد' : 'تأمین‌کننده فعال شد');
      return true;
    } catch {
      toast.error('خطا در بروزرسانی وضعیت تأمین‌کننده');
      return false;
    }
  };

  return { toggleStatus };
}
