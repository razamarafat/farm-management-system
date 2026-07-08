// =====================================================================
// src/hooks/useFarms.ts — MIGRATED to anon + rpc_admin_*
//
// Reads go through the anon `supabase` client (RLS-gated via migration
// 004_rls_policies.sql). Writes go through SECURITY DEFINER Postgres
// functions defined in 003_admin_rpcs.sql.
//
// The public hook surface is unchanged so AdminFarmsPage.tsx does not
// need to be edited.
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { rpc } from '@/utils/rpc';
import { Farm, FarmInsert } from '@/types/farm.types';

export interface FarmFilters {
  search: string;
  status: 'all' | 'active' | 'inactive';
}

/* ---------- READS ---------- */

export const useFarms = (filters: FarmFilters) => {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search.trim()), 300);
    return () => clearTimeout(t);
  }, [filters.search]);

  const fetchFarms = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('farms')
        .select('*')
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const s = `%${debouncedSearch}%`;
        q = q.or(`name.ilike.${s},code.ilike.${s}`);
      }
      if (filters.status === 'active')   q = q.eq('is_active', true);
      if (filters.status === 'inactive') q = q.eq('is_active', false);

      const { data, error: fe } = await q;
      if (fe) throw fe;
      setFarms((data || []) as Farm[]);
    } catch (e) {
      console.error(e);
      setError('خطا در دریافت اطلاعات');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters.status]);

  useEffect(() => { fetchFarms(); }, [fetchFarms]);

  return { farms, isLoading, error, refetch: fetchFarms };
};

/* ---------- WRITES via SECURITY DEFINER RPCs ---------- */

export const useCreateFarm = () => {
  const [isCreating, setIsCreating] = useState(false);

  const createFarm = async (input: FarmInsert): Promise<boolean> => {
    setIsCreating(true);
    try {
      const { error } = await rpc<void>('rpc_admin_create_farm', {
        p_name:      input.name,
        p_code:      input.code,
        p_address:   input.address ?? '',
        p_phone:     input.phone   ?? '',
        p_is_active: input.is_active ?? true,
      });
      if (error) throw new Error(error);
      toast.success('فارم جدید ایجاد شد');
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطا در ایجاد فارم');
      return false;
    } finally {
      setIsCreating(false);
    }
  };

  return { isCreating, createFarm };
};

export const useUpdateFarm = () => {
  const [isUpdating, setIsUpdating] = useState(false);

  const updateFarm = async (id: string, input: Partial<FarmInsert>): Promise<boolean> => {
    setIsUpdating(true);
    try {
      const { error } = await rpc<void>('rpc_admin_update_farm', {
        p_id:        id,
        p_name:      (input as FarmInsert).name      ?? '',
        p_code:      (input as FarmInsert).code      ?? '',
        p_address:   (input as FarmInsert).address   ?? '',
        p_phone:     (input as FarmInsert).phone     ?? '',
        p_is_active: (input as FarmInsert).is_active ?? true,
      });
      if (error) throw new Error(error);
      toast.success('اطلاعات فارم بروزرسانی شد');
      return true;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'خطا در بروزرسانی فارم');
      return false;
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateFarm };
};

export const useDeleteFarm = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteFarm = async (id: string, hard: boolean): Promise<boolean> => {
    setIsDeleting(true);
    try {
      const { error } = await rpc<void>('rpc_admin_delete_farm', {
        p_id: id, p_hard: hard,
      });
      if (error) throw new Error(error);
      toast.success(hard ? 'فارم حذف شد' : 'فارم غیرفعال شد');
      return true;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'خطا در حذف فارم');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteFarm };
};

export const useToggleFarmStatus = () => {
  const toggleStatus = async (id: string, current?: boolean): Promise<boolean> => {
    // The optional `current` argument is kept as a BACKWARD-COMPAT shim
    // for callers that used the prior (id, current) signature; the hook
    // always derives the new state from the toggle RPC's response so
    // the caller does not need to pass it. The DrFarms page still calls
    // with (id, f.is_active) — we accept and ignore it.
    try {
      const { data, error } = await rpc<{ is_active: boolean }>('rpc_admin_toggle_farm', { p_id: id });
      if (error) throw new Error(error);
      const next = data && typeof data.is_active === 'boolean' ? data.is_active : !current;
      toast.success(next ? 'فارم فعال شد' : 'فارم غیرفعال شد');
      return true;
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'خطا در بروزرسانی وضعیت فارم');
      return false;
    }
  };

  return { toggleStatus };
};
