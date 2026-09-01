import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface ActivityLogRow {
  id: string;
  user_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
  /** Resolved client-side from profiles; null when the actor was deleted. */
  actor_name: string | null;
}

export const ACTIVITY_LOG_PAGE_SIZE = 25;

export function useActivityLogs(page: number, actionFilter: string | null) {
  const [rows, setRows] = useState<ActivityLogRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('user_activity_logs')
        .select('id, user_id, action, resource_type, resource_id, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(
          (page - 1) * ACTIVITY_LOG_PAGE_SIZE,
          page * ACTIVITY_LOG_PAGE_SIZE - 1,
        );

      if (actionFilter) {
        query = query.eq('action', actionFilter);
      }

      const { data, count, error: logsError } = await query;
      if (logsError) throw logsError;

      const logRows = (data ?? []) as Array<{
        id: string;
        user_id: string | null;
        action: string;
        resource_type: string | null;
        resource_id: string | null;
        created_at: string;
      }>;
      const userIds = [...new Set(logRows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
      const actorNames = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, username, first_name, last_name')
          .in('id', userIds);
        if (profilesError) throw profilesError;

        for (const profile of profiles ?? []) {
          const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
          actorNames.set(profile.id, fullName || profile.username);
        }
      }

      setRows(logRows.map((row) => ({
        ...row,
        actor_name: row.user_id ? actorNames.get(row.user_id) ?? null : null,
      })));
      setTotalCount(count ?? 0);
    } catch (err) {
      // Error silently handled - toast will show error
      setRows([]);
      setTotalCount(0);
      setError('خطا در دریافت سوابق فعالیت‌ها');
    } finally {
      setIsLoading(false);
    }
  }, [actionFilter, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    rows,
    totalCount,
    isLoading,
    error,
    refetch: fetchLogs,
    PAGE_SIZE: ACTIVITY_LOG_PAGE_SIZE,
  };
}
