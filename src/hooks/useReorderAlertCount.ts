import { useReportSection } from '@/hooks/useReportSection';

/**
 * Count of items currently at/below their reorder point, for the badge on
 * the dashboard tile. Server-side RPC (SECURITY INVOKER — RLS scopes rows
 * to the caller's farm for non-admins). p_farm_id stays null: admins see
 * the fleet-wide count, operators are scoped by RLS anyway.
 */
export function useReorderAlertCount(): number | null {
  const { rows, isLoading, error } = useReportSection<Record<string, unknown>>(
    'reporting_reorder_point_v3',
    {
      p_farm_id: null,
      p_basis: 'quantity',
      p_abc_class: null,
      p_reorder_needed_only: true,
    },
  );
  if (isLoading || error) return null; // badge hidden until known
  return rows.length;
}
