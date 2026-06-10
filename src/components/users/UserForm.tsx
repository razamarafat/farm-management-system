import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, ClipboardEdit, Copy, Eye, RefreshCcw, Shield, X } from 'lucide-react';
import { toast } from 'sonner';
import { createUserSchema, updateUserSchema } from '@/validations/userSchema';
import { CreateUserInput, ProfileWithFarm, UpdateUserInput } from '@/types/user.types';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PasswordInput } from '@/components/ui/PasswordInput';
// import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Select } from '@/components/ui/Select';
import { useCreateUser, useUpdateUser } from '@/hooks/useUsers';
import { supabase } from '@/lib/supabase';
import { generateRandomPassword } from '@/utils/userHelpers';
import { getJalaliDate, getJalaliDateTime } from '@/utils/jalaliDate';
// import { toPersianDigits } from '@/utils/persianNumbers';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface UserFormProps {
  mode: 'create' | 'edit';
  user: ProfileWithFarm | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FarmOption {
  id: string;
  name: string;
  code: string;
}

export const UserForm = ({ mode, user, isOpen, onClose, onSuccess }: UserFormProps) => {
  const isEdit = mode === 'edit';
  const schema = isEdit ? updateUserSchema : createUserSchema;
  const { createUser, isCreating } = useCreateUser();
  const { updateUser, isUpdating } = useUpdateUser();

  const [farms, setFarms] = useState<FarmOption[]>([]);
  const [isDirtyConfirm, setIsDirtyConfirm] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [generatedPass, setGeneratedPass] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema as any),
    defaultValues: {
      username: user?.username || '',
      password: '',
      confirmPassword: '',
      firstName: user?.first_name || '',
      lastName: user?.last_name || '',
      phone: user?.phone || '',
      role: user?.role || 'operator',
      farmId: user?.farm_id || '',
      isActive: user?.is_active ?? true,
              notes: '',
        changePassword: false,
        newPassword: '',
      },
  });

  const roleValue = watch('role');
  const changePassword = watch('changePassword');
  const passwordValue = watch('password');
  const usernameValue = watch('username');

  useEffect(() => {
    const loadFarms = async () => {
      const { data } = await supabase
        .from('farms')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      setFarms((data || []) as FarmOption[]);
    };
    loadFarms();
  }, []);

  useEffect(() => {
    if (isOpen) {
      reset({
        username: user?.username || '',
        password: '',
        confirmPassword: '',
        firstName: user?.first_name || '',
        lastName: user?.last_name || '',
        phone: user?.phone || '',
        role: user?.role || 'operator',
        farmId: user?.farm_id || '',
        isActive: user?.is_active ?? true,
              notes: '',
      changePassword: false,
      newPassword: '',
    });
      setGeneratedPass('');
      setUsernameAvailable(null);
      setConfirmNewPassword('');
    }
  }, [isOpen, reset, user]);

  const handleUsernameBlur = async () => {
    if (!usernameValue || isEdit) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', usernameValue)
      .maybeSingle();
    if (error) {
      setUsernameAvailable(null);
      return;
    }
    setUsernameAvailable(!data);
  };

  const passwordStrength = useMemo(() => {
    if (!passwordValue || passwordValue.length < 6) {
      return { label: 'ضعیف', color: 'bg-red-500', width: 'w-1/3' };
    }
    if (passwordValue.length < 9) {
      return { label: 'متوسط', color: 'bg-yellow-500', width: 'w-2/3' };
    }
    return { label: 'قوی', color: 'bg-green-500', width: 'w-full' };
  }, [passwordValue]);

  const handleGeneratePassword = () => {
    const pass = generateRandomPassword(10);
    setValue('password', pass);
    setValue('confirmPassword', pass);
    setGeneratedPass(pass);
  };

  const handleCopyGenerated = async () => {
    if (!generatedPass) return;
    await navigator.clipboard.writeText(generatedPass);
    toast.success('رمز عبور کپی شد');
  };

  const handleClose = () => {
    if (isDirty) {
      setIsDirtyConfirm(true);
      return;
    }
    onClose();
  };

  const handleFormSubmit = async (values: Record<string, unknown>) => {
    try {
      if (!isEdit) {
        const data = values as unknown as CreateUserInput;
        const { data: existing, error: existingError } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', data.username)
          .maybeSingle();
        if (existingError) {
          toast.error('خطا در بررسی نام کاربری');
          return;
        }
        if (existing) {
          setError('username', { message: 'این نام کاربری قبلا استفاده شده' });
          return;
        }
        await createUser(data);
        toast.success(`کاربر ${data.firstName} ${data.lastName} با موفقیت ایجاد شد`);
        onSuccess();
      } else if (user) {
        const data = values as unknown as UpdateUserInput;
        if (data.changePassword && data.newPassword !== confirmNewPassword) {
          toast.error('رمز عبور و تکرار آن یکسان نیستند');
          return;
        }
        await updateUser(user.id, data, user.username);
        toast.success('اطلاعات کاربر بروزرسانی شد');
        onSuccess();
      }
    } catch (error) {
      toast.error(isEdit ? 'خطا در بروزرسانی اطلاعات کاربر' : 'خطا در ایجاد کاربر. لطفا دوباره تلاش کنید');
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={isEdit ? 'ویرایش کاربر' : 'افزودن کاربر جدید'}
        className="max-w-[520px]"
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleClose}>انصراف</Button>
            <Button type="submit" form="user-form" isLoading={isEdit ? isUpdating : isCreating}>
              {isEdit ? 'بروزرسانی' : 'ایجاد کاربر'}
            </Button>
          </div>
        }
      >
        <form id="user-form" onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {isEdit && user && (
            <div className="text-xs text-muted-foreground">
              تاریخ ایجاد: {getJalaliDate(new Date(user.created_at))} | آخرین ورود:{' '}
              {user.last_login_at ? getJalaliDateTime(new Date(user.last_login_at)) : 'ورود نداشته'}
            </div>
          )}

          <div className="space-y-2">
            <Input
              label="نام کاربری"
              {...register('username')}
              dir="ltr"
              placeholder="مثال: mohammad_karimi"
              disabled={isEdit}
              error={errors.username?.message as string}
              onBlur={handleUsernameBlur}
            />
            {!isEdit && usernameAvailable !== null && (
              <div className={`text-xs flex items-center gap-1 ${usernameAvailable ? 'text-green-600' : 'text-destructive'}`}>
                {usernameAvailable ? <Check size={14} /> : <X size={14} />}
                {usernameAvailable ? 'نام کاربری آزاد است' : 'این نام کاربری قبلا استفاده شده'}
              </div>
            )}
          </div>

          {!isEdit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">رمز عبور</span>
                <Button type="button" variant="ghost" size="sm" onClick={handleGeneratePassword} className="gap-2">
                  <RefreshCcw size={14} /> تولید رمز تصادفی
                </Button>
              </div>
              <PasswordInput label="رمز عبور" {...register('password')} dir="ltr" error={errors.password?.message as string} />
              <PasswordInput label="تکرار رمز عبور" {...register('confirmPassword')} dir="ltr" error={errors.confirmPassword?.message as string} />
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className={`h-full ${passwordStrength.color} ${passwordStrength.width}`} />
              </div>
              <div className="text-xs text-muted-foreground">قدرت رمز عبور: {passwordStrength.label}</div>
              {generatedPass && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>رمز تولید شده: {generatedPass}</span>
                  <Button type="button" variant="outline" size="icon" onClick={handleCopyGenerated}>
                    <Copy size={14} />
                  </Button>
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div className="space-y-3">
              <Checkbox
                label="تغییر رمز عبور"
                checked={changePassword}
                onChange={(e) => setValue('changePassword', e.target.checked)}
              />
              {changePassword && (
                <div className="space-y-2">
                  <PasswordInput label="رمز عبور جدید" {...register('newPassword')} dir="ltr" error={errors.newPassword?.message as string} />
                  <PasswordInput
                    label="تکرار رمز عبور"
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="نام" {...register('firstName')} error={errors.firstName?.message as string} />
            <Input label="نام خانوادگی" {...register('lastName')} error={errors.lastName?.message as string} />
          </div>

          <Input label="شماره تماس (اختیاری)" {...register('phone')} dir="ltr" error={errors.phone?.message as string} />

          <div className="space-y-2">
            <label className="text-sm font-medium">نقش کاربری</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                className={`border rounded-lg p-3 text-sm text-right space-y-1 transition-colors ${roleValue === 'operator' ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => setValue('role', 'operator')}
              >
                <ClipboardEdit size={18} className="text-green-600" />
                <div className="font-semibold">کاربر ثبت</div>
                <div className="text-xs text-muted-foreground">ثبت اطلاعات روزانه فارم</div>
              </button>
              <button
                type="button"
                className={`border rounded-lg p-3 text-sm text-right space-y-1 transition-colors ${roleValue === 'supervisor' ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => setValue('role', 'supervisor')}
              >
                <Eye size={18} className="text-blue-600" />
                <div className="font-semibold">سرپرست</div>
                <div className="text-xs text-muted-foreground">مشاهده اطلاعات و گزارشات</div>
              </button>
              <button
                type="button"
                className={`border rounded-lg p-3 text-sm text-right space-y-1 transition-colors ${roleValue === 'admin' ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => setValue('role', 'admin')}
              >
                <Shield size={18} className="text-red-600" />
                <div className="font-semibold">مدیر</div>
                <div className="text-xs text-muted-foreground">دسترسی کامل به تمام بخش‌ها</div>
              </button>
            </div>
          </div>

          {roleValue !== 'admin' && (
            <Select
              label="فارم مربوطه"
              value={watch('farmId')}
              onChange={(e) => setValue('farmId', e.target.value)}
              error={errors.farmId?.message as string}
            >
              <option value="">فارم مورد نظر را انتخاب کنید</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name} ({farm.code})
                </option>
              ))}
            </Select>
          )}

          <Checkbox
            label="حساب کاربری فعال باشد"
            checked={watch('isActive')}
            onChange={(e) => setValue('isActive', e.target.checked)}
          />

          {/* Notes field - uncomment when 'notes' column exists in profiles table
          <Textarea
            label="یادداشت"
            placeholder="یادداشت یا توضیحات اضافی (اختیاری)"
            maxLength={500}
            rows={3}
            {...register('notes')}
          />
          <div className="text-xs text-muted-foreground">
            {toPersianDigits(String(watch('notes')?.length || 0))} / ۵۰۰
          </div>
          */}
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isDirtyConfirm}
        onClose={() => setIsDirtyConfirm(false)}
        title="تغییرات ذخیره نشده"
        message="تغییرات ذخیره نشده دارید. آیا مطمئنید؟"
        confirmLabel="بله، خارج شو"
        cancelLabel="ادامه ویرایش"
        onConfirm={() => {
          setIsDirtyConfirm(false);
          onClose();
        }}
      />
    </>
  );
};
