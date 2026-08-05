import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useActivityLogs } from '@/hooks/useActivityLogs';
import { Badge, type BadgeProps } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { toPersianDigits } from '@/utils/persianNumbers';

const ACTION_LABELS: Record<string, string> = {
  user_created: 'ایجاد کاربر',
  user_updated: 'ویرایش کاربر',
  user_activated: 'فعال‌سازی',
  user_deactivated: 'غیرفعال‌سازی',
  user_deleted: 'حذف کاربر',
  password_reset: 'بازنشانی رمز',
};

const ACTION_OPTIONS = [
  { value: 'user_created', label: 'ایجاد کاربر' },
  { value: 'user_updated', label: 'ویرایش کاربر' },
  { value: 'user_activated', label: 'فعال‌سازی' },
  { value: 'user_deactivated', label: 'غیرفعال‌سازی' },
  { value: 'user_deleted', label: 'حذف کاربر' },
  { value: 'password_reset', label: 'بازنشانی رمز' },
] as const;

function actionVariant(action: string): BadgeProps['variant'] {
  if (action === 'user_deleted' || action === 'user_deactivated') return 'destructive';
  if (action === 'user_created' || action === 'user_activated') return 'success';
  return 'info';
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function formatResourceId(resourceId: string | null): string {
  if (!resourceId) return '—';
  return resourceId.length > 16 ? `${resourceId.slice(0, 8)}…${resourceId.slice(-6)}` : resourceId;
}

export default function AdminLogsPage() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const { rows, totalCount, isLoading, error, refetch, PAGE_SIZE } = useActivityLogs(
    page,
    actionFilter || null,
  );

  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pageLabel = useMemo(() => `${toPersianDigits(page)} از ${toPersianDigits(totalPages)}`, [page, totalPages]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-[12px] bg-[var(--c-primary-light)] p-2.5 text-[var(--c-primary)]">
            <Activity className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--c-fg)]">لاگ فعالیت‌ها</h1>
            <p className="mt-1 text-sm text-[var(--c-muted-fg)]">سوابق عملیات مدیریتی کاربران</p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label htmlFor="activity-action-filter" className="text-sm font-medium text-[var(--c-fg)]">
              فیلتر عملیات
            </label>
            <select
              id="activity-action-filter"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
              className="h-11 w-full rounded-[10px] border-2 border-[var(--c-input)] bg-[var(--c-card)] px-3.5 text-sm text-[var(--c-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-ring)] sm:w-72"
            >
              <option value="">همه</option>
              {ACTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-5" aria-label="در حال بارگذاری">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <AlertTriangle className="h-10 w-10 text-[var(--c-destructive)]" aria-hidden="true" />
              <p className="text-[var(--c-destructive)]">{error}</p>
              <Button variant="outline" size="sm" onClick={refetch}>تلاش مجدد</Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-[var(--c-muted-fg)]">
              هیچ فعالیتی ثبت نشده است
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-[var(--c-border)] bg-[var(--c-muted)]">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-4 text-center font-bold text-[var(--c-muted-fg)]">تاریخ</th>
                      <th className="whitespace-nowrap px-4 py-4 text-center font-bold text-[var(--c-muted-fg)]">کاربر</th>
                      <th className="whitespace-nowrap px-4 py-4 text-center font-bold text-[var(--c-muted-fg)]">عملیات</th>
                      <th className="whitespace-nowrap px-4 py-4 text-center font-bold text-[var(--c-muted-fg)]">شناسه منبع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--c-border)] transition-colors hover:bg-[var(--c-muted)]">
                        <td dir="ltr" className="whitespace-nowrap px-4 py-4 text-center text-[var(--c-muted-fg)]">
                          {toPersianDigits(getJalaliDateTime(new Date(row.created_at)))}
                        </td>
                        <td className="px-4 py-4 text-center font-medium text-[var(--c-fg)]">
                          {row.actor_name || '—'}
                        </td>
                        <td className="px-4 py-4 text-center">
                          <Badge variant={actionVariant(row.action)}>{actionLabel(row.action)}</Badge>
                        </td>
                        <td dir="ltr" title={row.resource_id ?? undefined} className="px-4 py-4 text-center font-mono text-xs text-[var(--c-muted-fg)]">
                          {formatResourceId(row.resource_id)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-[var(--c-border)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm text-[var(--c-muted-fg)]">
                  صفحه {pageLabel}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    قبلی
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    بعدی
                    <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
