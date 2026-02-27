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
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
  },
  supervisor: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
  },
  operator: {
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
  },
};
