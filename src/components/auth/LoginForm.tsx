import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginSchema, LoginFormData } from '@/validations/authSchema';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { Profile } from '@/types/user.types';

export const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { setUser, setProfile, setSessionStart } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // Construct email from username
      const email = `${data.username.toLowerCase().trim()}@morvarid.local`;

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: data.password,
      });

      if (authError) {
        throw authError;
      }

      if (authData.user) {
        // Fetch profile
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();
        
        const profile = data as Profile | null;

        if (profileError || !profile) {
          await supabase.auth.signOut();
          toast.error('خطا در دریافت اطلاعات کاربر');
          return;
        }

        if (!profile.is_active) {
          await supabase.auth.signOut();
          toast.error('حساب کاربری شما غیرفعال شده است');
          return;
        }

        // Update last login
        await supabase
          .from('profiles')
          .update({ last_login_at: new Date().toISOString() } as Pick<Profile, 'last_login_at'>)
          .eq('id', profile.id);

        setUser(authData.user);
        setProfile(profile);
        setSessionStart(profile.role);
        
        toast.success(`خوش آمدید، ${profile.first_name || profile.username}`);

        // Redirect based on role
        switch (profile.role) {
          case 'admin':
            navigate('/admin');
            break;
          case 'supervisor':
            navigate('/supervisor');
            break;
          case 'operator':
            navigate('/operator');
            break;
          default:
            navigate('/');
        }
      }
    } catch (error) {
      console.error('Login error:', error);
      const errorMessage = error instanceof Error ? error.message : '';
      toast.error(errorMessage || 'نام کاربری یا رمز عبور اشتباه است');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <div className="relative">
          <Input
            {...register('username')}
            label="نام کاربری"
            placeholder="نام کاربری خود را وارد کنید"
            dir="ltr"
            className="pr-10 text-left"
            error={errors.username?.message}
          />
          <UserIcon className="absolute right-3 top-[38px] h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative">
          <Input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            label="رمز عبور"
            placeholder="رمز عبور"
            dir="ltr"
            className="pl-10 pr-10" // Space for icons
            error={errors.password?.message}
          />
          <Lock className="absolute right-3 top-[38px] h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute left-3 top-[38px] text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2 space-x-reverse">
          <input
            type="checkbox"
            id="remember"
            {...register('rememberMe')}
            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
          />
          <label htmlFor="remember" className="text-sm text-muted-foreground">
            مرا به خاطر بسپار
          </label>
        </div>
      </div>

      <Button type="submit" className="w-full" isLoading={isLoading}>
        {isLoading ? 'در حال ورود...' : 'ورود به حساب کاربری'}
      </Button>

      <div className="text-center mt-4">
        <button
          type="button"
          onClick={() => toast.info('لطفا با مدیر سیستم تماس بگیرید')}
          className="text-sm text-primary hover:underline"
        >
          رمز عبور خود را فراموش کرده‌اید؟
        </button>
      </div>
    </form>
  );
};
