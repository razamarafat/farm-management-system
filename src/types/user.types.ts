export type UserRole = 'admin' | 'supervisor' | 'operator';

export interface Profile {
  id: string;
  username: string;
  farm_id: string | null;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  notes?: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ProfileWithFarm extends Profile {
  farm: { id: string; name: string; code: string } | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  farmId?: string;
  isActive: boolean;
  notes?: string;
}

export interface UpdateUserInput {
  firstName: string;
  lastName: string;
  phone?: string;
  role: UserRole;
  farmId?: string;
  isActive: boolean;
  notes?: string;
  changePassword: boolean;
  newPassword?: string;
}

export interface UserFilters {
  search: string;
  role: UserRole | 'all';
  farmId: string | 'all';
  status: 'all' | 'active' | 'inactive';
}

export type UserSortField = 'name' | 'username' | 'role' | 'farm' | 'created_at' | 'last_login_at';
export type UserSortOrder = 'asc' | 'desc';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'مدیر',
  supervisor: 'سرپرست',
  operator: 'کاربر ثبت',
};

export const ROLE_COLORS: Record<UserRole, { bg: string; text: string }> = {
  admin: {
    bg: 'bg-[color-mix(in_srgb,var(--c-destructive)_16%,transparent)]',
    text: 'text-[var(--c-error)]',
  },
  supervisor: {
    bg: 'bg-[color-mix(in_srgb,var(--c-info)_16%,transparent)]',
    text: 'text-[var(--c-info)]',
  },
  operator: {
    bg: 'bg-[color-mix(in_srgb,var(--c-success)_16%,transparent)]',
    text: 'text-[var(--c-success)]',
  },
};
