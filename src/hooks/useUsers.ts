import { logger } from '@/utils/logger';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { CreateUserInput, ProfileWithFarm, UpdateUserInput, UserFilters } from '@/types/user.types';
import { generateRandomPassword } from '@/utils/userHelpers';

const logActivity = async (action: string, resourceId?: string) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('user_activity_logs').insert({
      user_id: user?.id ?? null,
      action,
      resource_type: 'user',
      resource_id: resourceId ?? null,
    });
  } catch {
    // ignore logging errors
  }
};

export const useUsers = (filters: UserFilters) => {
  const [users, setUsers] = useState<ProfileWithFarm[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search.trim());

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(filters.search.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let query = supabaseAdmin
        .from('profiles')
        .select('id, username, role, first_name, last_name, phone, is_active, last_login_at, created_at, farm:farms(id, name, code)')
        .order('created_at', { ascending: false });

      if (debouncedSearch) {
        const search = `%${debouncedSearch}%`;
        query = query.or(`first_name.ilike.${search},last_name.ilike.${search},username.ilike.${search}`);
      }
      if (filters.role !== 'all') query = query.eq('role', filters.role);
      if (filters.farmId !== 'all') query = query.eq('farm_id', filters.farmId);
      if (filters.status === 'active') query = query.eq('is_active', true);
      if (filters.status === 'inactive') query = query.eq('is_active', false);

      const { data, error: fetchError } = await query;
      if (fetchError) {
        logger.error('Fetch users error:', fetchError);
        throw fetchError;
      }

      setUsers((data || []) as unknown as ProfileWithFarm[]);
    } catch (err) {
      logger.error('useUsers error:', err);
      setError('خطا در دریافت اطلاعات کاربران');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, filters.role, filters.farmId, filters.status]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return { users, isLoading, error, refetch: fetchUsers };
};

export const useCreateUser = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const createUser = async (input: CreateUserInput) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const email = `${input.username.toLowerCase().trim()}@morvarid.local`;

      // Step 1: Check if profile with this username already exists
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', input.username.toLowerCase().trim())
        .maybeSingle();

      if (existingProfile) {
        throw new Error('این نام کاربری قبلا استفاده شده');
      }

      // Step 2: Check if auth user exists with this email
      let authUserId: string | null = null;
      
      // Try to find existing auth user
      const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
      const existingAuthUser = usersData?.users?.find(u => u.email === email);

      if (existingAuthUser) {
        // Auth user exists - check if they have a profile
        const { data: profileForAuth } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .eq('id', existingAuthUser.id)
          .maybeSingle();

        if (profileForAuth) {
          // Both exist - this shouldn't happen but handle it
          throw new Error('این نام کاربری قبلا استفاده شده');
        }

        // Auth exists but no profile - update auth and create profile
        authUserId = existingAuthUser.id;
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: input.password,
          email_confirm: true,
          user_metadata: { role: input.role, username: input.username.toLowerCase().trim() },
        });
      } else {
        // Create new auth user
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: input.password,
          email_confirm: true,
          user_metadata: { role: input.role, username: input.username.toLowerCase().trim() },
        });

        if (authError || !authData.user) {
          logger.error('Auth create error:', authError);
          const msg = authError?.message?.includes('already been registered')
            ? 'این نام کاربری قبلا استفاده شده'
            : 'خطا در ایجاد کاربر. لطفا دوباره تلاش کنید';
          throw new Error(msg);
        }
        authUserId = authData.user.id;
      }

      // Step 3: Insert or update profile
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: authUserId,
          username: input.username.toLowerCase().trim(),
          role: input.role,
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          is_active: input.isActive,
          farm_id: (input.farmId && input.farmId.trim() !== '') ? input.farmId : null,
          phone: (input.phone && input.phone.trim() !== '') ? input.phone.trim() : null,
        }, { onConflict: 'id' });

      if (profileError) {
        logger.error('Profile insert error:', profileError);
        // Cleanup: delete the auth user if we just created it
        if (!existingAuthUser && authUserId) {
          await supabaseAdmin.auth.admin.deleteUser(authUserId);
        }
        throw new Error('خطا در ایجاد پروفایل کاربر. لطفا دوباره تلاش کنید');
      }

      await logActivity('user_created', authUserId || '');
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در ایجاد کاربر. لطفا دوباره تلاش کنید';
      setCreateError(msg);
      throw new Error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return { isCreating, createError, createUser };
};

export const useUpdateUser = () => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const updateUser = async (userId: string, input: UpdateUserInput, username: string) => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({
          first_name: input.firstName.trim(),
          last_name: input.lastName.trim(),
          role: input.role,
          is_active: input.isActive,
          phone: (input.phone && input.phone.trim() !== '') ? input.phone.trim() : null,
          farm_id: (input.farmId && input.farmId.trim() !== '') ? input.farmId : null,
        })
        .eq('id', userId);

      if (profileError) {
        logger.error('Profile update error:', profileError);
        throw new Error('خطا در بروزرسانی اطلاعات کاربر');
      }

      // Update password if requested
      if (input.changePassword && input.newPassword) {
        const { error: passError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: input.newPassword,
        });
        if (passError) {
          logger.error('Password update error:', passError);
          throw new Error('خطا در تغییر رمز عبور');
        }
      }

      // Update user metadata in auth
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: input.role, username },
      });

      await logActivity('user_updated', userId);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطا در بروزرسانی اطلاعات کاربر';
      setUpdateError(msg);
      throw new Error(msg);
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, updateError, updateUser };
};

export const useDeleteUser = () => {
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteUser = async (userId: string, mode: 'soft' | 'hard') => {
    setIsDeleting(true);
    try {
      if (mode === 'soft') {
        const { error } = await supabaseAdmin
          .from('profiles')
          .update({ is_active: false })
          .eq('id', userId);
        if (error) {
          logger.error('Soft delete error:', error);
          throw new Error('خطا در غیرفعالسازی کاربر');
        }
        await logActivity('user_deactivated', userId);
        return true;
      }

      // Hard delete
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (profileError) {
        logger.error('Hard delete profile error:', profileError);
        throw new Error('خطا در حذف کاربر');
      }
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) {
        logger.error('Hard delete auth error:', authError);
      }
      await logActivity('user_deleted', userId);
      return true;
    } finally {
      setIsDeleting(false);
    }
  };

  return { isDeleting, deleteUser };
};

export const useToggleUserStatus = () => {
  const toggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);
      if (error) {
        logger.error('Toggle status error:', error);
        throw error;
      }
      await logActivity(currentStatus ? 'user_deactivated' : 'user_activated', userId);
      toast.success(currentStatus ? 'کاربر غیرفعال شد' : 'کاربر فعال شد');
      return true;
    } catch {
      toast.error('خطا در بروزرسانی وضعیت کاربر');
      return false;
    }
  };

  return { toggleStatus };
};

export const useResetPassword = () => {
  const [isResetting, setIsResetting] = useState(false);

  const resetPassword = async (userId: string, customPassword?: string) => {
    setIsResetting(true);
    try {
      const newPass = customPassword || generateRandomPassword(8);
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: newPass });
      if (error) {
        logger.error('Reset password error:', error);
        throw error;
      }
      await logActivity('password_reset', userId);
      return newPass;
    } catch {
      toast.error('خطا در بازنشانی رمز عبور');
      return null;
    } finally {
      setIsResetting(false);
    }
  };

  return { isResetting, resetPassword };
};
