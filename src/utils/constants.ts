export const APP_NAME = 'مروارید فارم';
export const APP_DESC = 'پایش هوشمند دان و اقلام بسته‌بندی';
export const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.2';

export const USER_ROLES = {
  ADMIN: 'admin',
  SUPERVISOR: 'supervisor',
  OPERATOR: 'operator',
} as const;

export const DEFAULT_THEME = 'light';

// =========================================================================
// Inventory aging buckets (RPT_INVENTORY_AGING).
//
// Boundary convention:
//   days_since_last_movement ∈ [minDays, maxDays]  → bucket
//   The last bucket is open-ended on the high side (>= minDays).
//
// Threshold includes BOTH ends (e.g. days_since=30 falls into '0-30').
// To shift the buckets globally, bump minDays/maxDays here once and the
// client + RPC pick up the change automatically.
// =========================================================================
export const AGE_BUCKETS: ReadonlyArray<{
  key: string;
  label: string;        // Persian display label, e.g. '۰–۳۰ روز'
  minDays: number;
  maxDays: number | null; // null = open-ended top bucket
}> = [
  { key: '0-30',  label: '۰–۳۰ روز',   minDays: 0,  maxDays: 30 },
  { key: '31-60', label: '۳۱–۶۰ روز',  minDays: 31, maxDays: 60 },
  { key: '61-90', label: '۶۱–۹۰ روز',  minDays: 61, maxDays: 90 },
  { key: '90+',   label: '۹۰+ روز',    minDays: 91, maxDays: null },
];

/** Default threshold for "dead stock" = days with NO movement while on-hand > 0. */
export const DEAD_STOCK_THRESHOLD_DAYS = 90;

// =========================================================================
// ABC/Pareto classification (RPT_PARETO_CLASSIFICATION).
//
// Conventions (mirrored in scripts/migrations/010_pareto_classification.sql):
//   - Cumulative share ≤ A threshold  → class 'A'.
//   - Cumulative share ≤ B threshold  → class 'B'  (i.e. between A and A+B).
//   - All remaining items              → class 'C'.
//   - Defaults match the textbook Pareto: 70/20/10.
//
// To shift the global split, update BOTH this object and the SQL RPC's
// `p_a_threshold`/`p_b_threshold` defaults in one commit. The RPC also
// accepts runtime overrides (future UI slider will pass them through).
// =========================================================================
export const ABC_THRESHOLDS = {
  /** Cumulative share upper bound for class 'A' items. */
  A: 0.7,
  /** Cumulative share upper bound for class 'B' items (relative to A+B). */
  B: 0.9,
} as const;

/** Average lookback horizon (days) for the reorder-point heuristic.
 *  The schema has NO lead_times table — this is a documented heuristic that
 *  approximates "demand during lead time" using recent consumption rate. */
export const REORDER_HORIZON_DAYS = 7;

/** Classification basis options for the ABC report. 'value' is the default. */
export const ABC_BASIS_OPTIONS = [
  { value: 'value',    label: 'بر اساس ارزش (ریال)' },
  { value: 'quantity', label: 'بر اساس مقدار' },
] as const;

export type AbcBasis = (typeof ABC_BASIS_OPTIONS)[number]['value'];

export const DEFAULT_FARM_INGREDIENTS = [
  { name: 'ذرت دانه ای', unit: 'کیلوگرم', priority: 1 },
  { name: 'کنجاله سويا', unit: 'کیلوگرم', priority: 2 },
  { name: 'منو کلسيم فسفات', unit: 'کیلوگرم', priority: 3 },
  { name: 'متيونين', unit: 'کیلوگرم', priority: 4 },
  { name: 'لیزین', unit: 'کیلوگرم', priority: 5 },
  { name: 'پودر سنگ', unit: 'کیلوگرم', priority: 6 },
  { name: 'نمك', unit: 'کیلوگرم', priority: 7 },
  { name: 'جوش شیرین', unit: 'کیلوگرم', priority: 8 },
  { name: 'سبوس گندم', unit: 'کیلوگرم', priority: 9 },
  { name: 'آنزیمیت', unit: 'کیلوگرم', priority: 10 },
  { name: 'فیتاز', unit: 'کیلوگرم', priority: 11 },
  { name: 'آنزیم رباویو (پریمیکس)', unit: 'کیلوگرم', priority: 12 },
  { name: 'مکمل ویتامینه', unit: 'کیلوگرم', priority: 13 },
  { name: 'مکمل  معدنی', unit: 'کیلوگرم', priority: 14 },
  { name: 'روغن   سویا', unit: 'لیتر', priority: 15 },
  { name: 'کنجاله آفتابگردان', unit: 'کیلوگرم', priority: 16 },
  { name: 'کولین', unit: 'کیلوگرم', priority: 17 },
  { name: 'توکسین بایندر', unit: 'کیلوگرم', priority: 18 },
  { name: 'آنزیم  روابیو', unit: 'کیلوگرم', priority: 19 },
  { name: 'پودر صدف', unit: 'کیلوگرم', priority: 20 },
  { name: 'پریمیکس کولین', unit: 'کیلوگرم', priority: 21 },
  { name: 'پریمیکس ویتامین C', unit: 'کیلوگرم', priority: 22 },
  { name: 'پریمیکس رنگدانه', unit: 'کیلوگرم', priority: 23 },
  { name: 'پرو بیوتیک', unit: 'کیلوگرم', priority: 24 },
  { name: 'دی کلسیم فسفات', unit: 'کیلوگرم', priority: 25 },
  { name: 'اسیدی فایر', unit: 'کیلوگرم', priority: 26 },
  { name: 'پودر جوجه', unit: 'کیلوگرم', priority: 27 },
  { name: 'رنگدانه', unit: 'کیلوگرم', priority: 28 },
  { name: 'ویتامین  E', unit: 'کیلوگرم', priority: 29 },
  { name: 'پریمیکس ویتامین E و سلنیوم', unit: 'کیلوگرم', priority: 30 },
  { name: 'آنزیم روابیو اکسل', unit: 'کیلوگرم', priority: 31 },
];
