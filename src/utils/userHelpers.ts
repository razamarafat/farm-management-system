import { ROLE_LABELS, UserRole } from '@/types/user.types';

export const generateRandomPassword = (length: number = 10): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export const getInitials = (firstName: string | null, lastName: string | null): string => {
  if (firstName && lastName) return `${firstName.charAt(0)}${lastName.charAt(0)}`;
  if (firstName) return firstName.charAt(0);
  if (lastName) return lastName.charAt(0);
  return '?';
};

export const formatUserFullName = (firstName: string | null, lastName: string | null): string => {
  const full = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return full.length ? full : 'بدون نام';
};

export const getRoleLabel = (role: UserRole): string => ROLE_LABELS[role];

export const getUserStatusText = (isActive: boolean): string => (isActive ? 'فعال' : 'غیرفعال');
