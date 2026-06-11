// Inputs Management Types

export type InputCategory = 'feed' | 'packaging';

export interface Input {
  id: string;
  name: string;
  category: InputCategory;
  default_unit: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface InputInsert {
  name: string;
  category: InputCategory;
  default_unit?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface InputUpdate {
  name?: string;
  category?: InputCategory;
  default_unit?: string;
  description?: string | null;
  is_active?: boolean;
}

export interface InputFilters {
  search: string;
  category: InputCategory | 'all';
  status: 'all' | 'active' | 'inactive';
}

export const INPUT_CATEGORY_LABELS: Record<InputCategory, string> = {
  feed: 'نهاده',
  packaging: 'بسته‌بندی',
};

export const INPUT_CATEGORY_COLORS: Record<InputCategory, string> = {
  feed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  packaging: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

export const DEFAULT_UNITS = [
  'کیلوگرم',
  'گرم',
  'تن',
  'لیتر',
  'متر مکعب',
  'عدد',
  'کیسه',
  'بسته',
  'کارتن',
  'شانه',
] as const;
