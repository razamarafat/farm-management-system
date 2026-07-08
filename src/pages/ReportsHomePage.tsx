// =====================================================================
// ReportsHomePage — top-level /{admin|supervisor|operator}/reports.
//
// Architecture:
//   - The page root owns ONLY navigation state: `userId` (from
//     authStore) and `selectedReportId` (drives selector vs drill-down).
//   - All per-report state — filters, visibleColumns, sort, page,
//     savedViews dialog — is owned by the ReportBody child component.
//   - <ReportBody key={report.id} /> makes React unmount + remount on
//     every report switch, which re-fires the lazy useState
//     initializers and pulls fresh values from the persist store.
//
// Note: an earlier version of this file hoisted all per-report
// state above ReportBody. That pattern failed because useState
// initializers only fire on first mount — switching reports there
// only re-hydrated visibleColumns+sort but left filters+page stale.
// =====================================================================

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ReportSelector } from '@/components/reports/ReportSelector';
import { ReportBody } from '@/components/reports/ReportBody';
import { useAuthStore } from '@/store/authStore';
import { useReportViewsStore } from '@/store/reportViewsStore';
import { REPORT_CATALOG } from '@/types/report.types';

export default function ReportsHomePage() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const setLastReport = useReportViewsStore((s) => s.setLastReport);

  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // On mount: restore last opened report (best-effort).
  useEffect(() => {
    if (!userId) return;
    const persistedLast = useReportViewsStore.getState().scopes[userId]?.lastReportId ?? null;
    if (persistedLast && REPORT_CATALOG.some((r) => r.id === persistedLast)) {
      setSelectedReportId(persistedLast);
    }
  }, [userId]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedReportId(id);
      if (userId) setLastReport(userId, id);
    },
    [userId, setLastReport],
  );

  const handleBack = useCallback(() => {
    setSelectedReportId(null);
  }, []);

  if (!userId) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-[var(--c-muted-fg)]">
        برای استفاده از گزارشات ابتدا وارد حساب شوید.
      </div>
    );
  }

  const report = selectedReportId
    ? REPORT_CATALOG.find((r) => r.id === selectedReportId) ?? null
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <AnimatePresence mode="wait">
        {selectedReportId === null || !report ? (
          <motion.div
            key="selector"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-[var(--c-fg)]">گزارشات</h1>
                <p className="text-sm text-[var(--c-muted-fg)] mt-1">
                  یک گزارش را برای مشاهده انتخاب کنید. فیلترها، ستون‌ها و مرتب‌سازی هر گزارش قابل ذخیره‌سازی است.
                </p>
              </div>
            </div>
            <ReportSelector reports={REPORT_CATALOG} onSelect={handleSelect} />
          </motion.div>
        ) : (
          <motion.div
            key={`shell-${report.id}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Button variant="ghost" onClick={handleBack}>
                <ArrowRight className="w-4 h-4 ml-1.5" />
                بازگشت به فهرست
              </Button>
            </div>
            {/* key={report.id} → unmount + remount → fresh state per report
                AND every useState lazy initializer re-fires reading the
                new persisted slice via useReportViewsStore. */}
            <ReportBody key={report.id} report={report} userId={userId} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
