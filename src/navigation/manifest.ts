import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle,
  ClipboardList,
  FileText,
  FlaskConical,
  Home,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Warehouse,
  Wheat,
} from 'lucide-react';

export type Role = 'admin' | 'supervisor' | 'operator';

export interface NavItem {
  /** Path relative to the role base, e.g. 'consumption'. */
  path: string;
  label: string;
  labelByRole?: Partial<Record<Role, string>>;
  icon: LucideIcon;
  /** Tile color token — Harvest & Earth palette. */
  color: 'sage' | 'forest' | 'olive' | 'mint' | 'grain' | 'terracotta' | 'clay' | 'earth' | 'sky' | 'sand' | 'red';
  /** Roles that see this item. */
  roles: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: 'consumption',
    label: 'حواله‌های مصرف',
    labelByRole: { supervisor: 'مشاهده حواله‌ها', operator: 'ثبت مصرف روزانه' },
    icon: ClipboardList,
    color: 'sage',
    roles: ['admin', 'supervisor', 'operator'],
  },
  {
    path: 'purchase',
    label: 'خرید و انتقال',
    labelByRole: { supervisor: 'مشاهده خریدها', operator: 'ثبت خرید/انتقال' },
    icon: ShoppingCart,
    color: 'forest',
    roles: ['admin', 'supervisor', 'operator'],
  },
  {
    path: 'reports',
    label: 'گزارشات',
    icon: FileText,
    color: 'sky',
    roles: ['admin', 'supervisor', 'operator'],
  },
  {
    path: 'formulas',
    label: 'مدیریت فرمول‌ها',
    labelByRole: { supervisor: 'فرمول‌ها و آنالیز', operator: 'فرمول‌ها' },
    icon: FlaskConical,
    color: 'olive',
    roles: ['admin', 'supervisor', 'operator'],
  },
  {
    path: 'inventory',
    label: 'موجودی انبار',
    labelByRole: { operator: 'انبارداری' },
    icon: Package,
    color: 'mint',
    roles: ['admin', 'supervisor', 'operator'],
  },
  {
    path: 'reorder',
    label: 'نقطه سفارش',
    icon: AlertTriangle,
    color: 'grain',
    roles: ['admin', 'supervisor', 'operator'],
  },
  { path: 'users', label: 'مدیریت کاربران', icon: Users,    color: 'terracotta', roles: ['admin'] },
  { path: 'farms', label: 'مدیریت فارم‌ها', icon: Warehouse, color: 'earth', roles: ['admin'] },
  { path: 'inputs', label: 'تعریف نهاده‌ها', icon: Wheat, color: 'clay', roles: ['admin'] },
  { path: 'suppliers', label: 'تامین‌کنندگان', icon: Truck, color: 'sand', roles: ['admin'] },
];

export const DASHBOARD_NAV_ITEM = {
  icon: Home,
  label: 'داشبورد',
} as const;

export function navItemsForRole(role: string | null | undefined): NavItem[] {
  if (role !== 'admin' && role !== 'supervisor' && role !== 'operator') return [];
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

export function getNavLabel(item: NavItem, role: Role): string {
  return item.labelByRole?.[role] ?? item.label;
}

export function roleBase(role: Role): string {
  return `/${role}`;
}
