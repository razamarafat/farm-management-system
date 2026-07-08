// =====================================================================
// ReportSelector — Tile grid shown on the Reports home page.
//
// Each tile is a card describing one report from REPORT_CATALOG:
//   - lucide icon at the top
//   - Persian title + English subtitle
//   - 1-line Persian description
//   - status badge: "آماده" (ready, demo wired) or "در حال توسعه" (stub)
//
// Clicking a tile calls onSelect(reportId). Pure presentational — no
// data is loaded here. Routing inside ReportsHomePage drives the
// state transition.
// =====================================================================

import { memo } from 'react';
import {
  Warehouse,
  ScrollText,
  ListOrdered,
  ShoppingCart,
  ClipboardList,
  LayoutGrid,
  Package,
  BarChart3,
  BadgeDollarSign,
  Clock,
  RefreshCw,
  CalendarDays,
  AlertTriangle,
  AlertOctagon,
  FileBarChart,
  LineChart,
  PieChart,
  Hourglass,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Badge } from '@/components/ui/Badge';
import type { ReportCatalogEntry } from '@/types/report.types';

// Map: lucide icon name → component (so catalog.ts stays dep-free).
const ICON_MAP = {
  Warehouse,
  ScrollText,
  ListOrdered,
  ShoppingCart,
  ClipboardList,
  LayoutGrid,
  Package,
  BarChart3,
  BadgeDollarSign,
  Clock,
  RefreshCw,
  Calendar: CalendarDays,
  AlertTriangle,
  AlertOctagon,
  FileBarChart,
  LineChart,
  PieChart,
  Hourglass,
} as const;

interface ReportSelectorProps {
  reports: readonly ReportCatalogEntry[];
  onSelect: (reportId: string) => void;
  className?: string;
}

const GROUP_LABEL: Record<ReportCatalogEntry['group'], string> = {
  inventory: 'موجودی',
  consumption: 'مصرف',
  purchase: 'خرید و انتقال',
  valuation: 'ارزش‌گذاری',
  kpi: 'شاخص‌های کلیدی',
};

function ReportSelectorInner({ reports, onSelect, className }: ReportSelectorProps) {
  // Group reports so the selector is scannable.
  const groups = (['inventory', 'consumption', 'purchase', 'valuation', 'kpi'] as const)
    .map((group) => ({
      group,
      title: GROUP_LABEL[group],
      reports: reports.filter((r) => r.group === group),
    }))
    .filter((g) => g.reports.length > 0);

  return (
    <div className={cn('space-y-8', className)}>
      {groups.map(({ group, title, reports: items }) => (
        <section key={group}>
          <h2 className="text-sm font-bold text-[var(--c-muted-fg)] mb-3 uppercase tracking-wide">
            {title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((r) => {
              const Icon = ICON_MAP[r.iconName as keyof typeof ICON_MAP] ?? FileBarChart;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className={cn(
                    'group text-right rounded-[14px] border border-[var(--c-border)]',
                    'bg-[var(--c-card)] shadow-[var(--card-shadow)] p-4 sm:p-5',
                    'transition-all duration-200 hover:shadow-[var(--card-shadow-hover)] hover:border-[var(--c-primary)]',
                    'active:scale-[0.99] flex flex-col items-start gap-2',
                  )}
                >
                  <div className="flex items-start justify-between w-full gap-2">
                    <div
                      className={cn(
                        'w-10 h-10 rounded-[10px] flex items-center justify-center',
                        'bg-[var(--c-primary)]/10 text-[var(--c-primary)]',
                        'group-hover:bg-[var(--c-primary)] group-hover:text-white transition-colors',
                      )}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <Badge variant={r.status === 'ready' ? 'success' : 'secondary'}>
                      {r.status === 'ready' ? 'آماده' : 'در حال توسعه'}
                    </Badge>
                  </div>
                  <div className="min-w-0 w-full">
                    <p className="font-bold text-[var(--c-fg)] text-sm mt-1">{r.title}</p>
                    <p className="text-xs text-[var(--c-muted-fg)] mt-0.5 truncate" dir="ltr">
                      {r.subtitle}
                    </p>
                    <p className="text-xs text-[var(--c-muted-fg)] mt-2 leading-relaxed">
                      {r.description}
                    </p>
                  </div>
                  <span
                    className="text-[10px] font-mono text-[var(--c-muted-fg)] mt-auto"
                    dir="ltr"
                  >
                    {r.id}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export const ReportSelector = memo(ReportSelectorInner);
ReportSelector.displayName = 'ReportSelector';
