import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useShallow } from 'zustand/react/shallow';
import { Eye, EyeOff, Lock, User as UserIcon, ArrowLeft, Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { loginSchema, LoginFormData } from '@/validations/authSchema';
import { rpcError } from '@/utils/rpcError';
import { useAuthStore } from '@/store/authStore';
import { supabase } from '@/lib/supabase';
import { getRememberMe, setRememberMe } from '@/lib/auth-storage';
import { Profile } from '@/types/user.types';
import { roleHome } from '@/utils/roleHome';

type LoadingStage = 'idle' | 'loading' | 'success';

export const LoginForm = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loadingStage, setLoadingStage] = useState<LoadingStage>('idle');
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser, setProfile, setSessionStart } = useAuthStore(
    useShallow((state) => ({
      setUser: state.setUser,
      setProfile: state.setProfile,
      setSessionStart: state.setSessionStart,
    }))
  );

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: 'onChange',
    defaultValues: {
      username: '',
      password: '',
      rememberMe: getRememberMe(),
    },
  });

  const username = watch('username');
  const password = watch('password');
  const isFilled = Boolean(username?.trim() && password?.trim());

  const onSubmit = async (data: LoginFormData) => {
    setLoadingStage('loading');
    try {
      // Persist the "Remember Me" choice BEFORE sign-in so the Supabase client
      // writes the resulting session to the correct storage backend
      // (localStorage when checked, sessionStorage when unchecked).
      setRememberMe(data.rememberMe);

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
          setLoadingStage('idle');
          return;
        }

        if (!profile.is_active) {
          await supabase.auth.signOut();
          toast.error('حساب کاربری شما غیرفعال شده است');
          setLoadingStage('idle');
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

        // Success animation — briefly show the success state, then navigate
        setLoadingStage('success');
        toast.success(`خوش آمدید، ${profile.first_name || profile.username}`);

        const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
        const home = roleHome(profile.role);
        const target = from?.pathname?.startsWith(home)
          ? `${from.pathname}${from.search ?? ''}`
          : home;

        // Brief pause to let the success animation play
        await new Promise(resolve => setTimeout(resolve, 900));
        navigate(target, { replace: true });
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoadingStage('idle');
      toast.error(rpcError(error) ?? 'نام کاربری یا رمز عبور اشتباه است');
    }
  };

  const isBusy = loadingStage !== 'idle';

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
            disabled={isBusy}
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
            className="pl-10 pr-10"
            error={errors.password?.message}
            disabled={isBusy}
          />
          <Lock className="absolute right-3 top-[38px] h-4 w-4 text-muted-foreground" />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute left-3 top-[38px] text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            disabled={isBusy}
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
            disabled={isBusy}
            className="h-4 w-4 rounded border-[var(--c-border)] text-[var(--c-primary)] focus:ring-[var(--c-ring)]"
          />
          <label htmlFor="remember" className="text-sm text-muted-foreground">
            مرا به خاطر بسپار
          </label>
        </div>
      </div>

      {/* Full-screen success overlay */}
      <AnimatePresence>
        {loadingStage === 'success' && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* Expanding ring behind the button area */}
            <motion.div
              className="absolute rounded-full bg-[var(--c-primary)]/10 w-[300vmax] h-[300vmax] -translate-x-1/2 -translate-y-1/2"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        animate={
          isFilled && loadingStage === 'idle'
            ? {
                scale: [1, 1.02, 1],
                boxShadow: [
                  '0 0 0px rgba(59,130,246,0)',
                  '0 0 15px rgba(59,130,246,0.4)',
                  '0 0 8px rgba(59,130,246,0.2)',
                ],
              }
            : { scale: 1, boxShadow: 'none' }
        }
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative rounded-[10px]"
      >
        <Button
          type="submit"
          className="w-full relative overflow-hidden"
          isLoading={loadingStage === 'loading'}
          isFilled={isFilled}
          disabled={loadingStage === 'success'}
        >
          {/* Shimmer/skeleton wave that sweeps across the button while loading */}
          {loadingStage === 'loading' && (
            <motion.div
              className="absolute inset-0 -skew-x-12"
              initial={{ x: '-150%' }}
              animate={{ x: '150%' }}
              transition={{ repeat: Infinity, duration: 1.3, ease: 'linear' }}
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.12) 60%, transparent 100%)',
              }}
            />
          )}

          <AnimatePresence mode="wait">
            <motion.span
              key={loadingStage}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="flex items-center justify-center gap-2 relative z-10"
            >
              {loadingStage === 'success' ? (
                <>
                  <motion.span
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  >
                    <Check className="h-5 w-5" />
                  </motion.span>
                  <span>خوش آمدید</span>
                </>
              ) : loadingStage === 'loading' ? (
                <span>در حال ورود...</span>
              ) : (
                <>
                  <span>ورود به حساب کاربری</span>
                  {isFilled && (
                    <motion.span
                      initial={{ opacity: 0, x: 5 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
                    </motion.span>
                  )}
                </>
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </motion.div>

      <div className="text-center mt-4">
        <button
          type="button"
          onClick={() => toast.info('لطفا با مدیر سیستم تماس بگیرید')}
          className="text-sm text-primary hover:underline"
          disabled={isBusy}
        >
          رمز عبور خود را فراموش کرده‌اید؟
        </button>
      </div>
    </form>
  );
};
