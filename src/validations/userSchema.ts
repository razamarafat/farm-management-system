import { z } from 'zod';

export const createUserSchema = z
  .object({
    username: z
      .string()
      .min(1, 'نام کاربری الزامی است')
      .min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد')
      .max(50, 'نام کاربری باید حداکثر ۵۰ کاراکتر باشد')
      .regex(/^[a-zA-Z0-9_]+$/, 'فقط حروف انگلیسی، اعداد و _ مجاز است')
      .transform((v) => v.toLowerCase().trim()),
    password: z
      .string()
      .min(1, 'رمز عبور الزامی است')
      .min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد')
      .max(100, 'رمز عبور بیش از حد طولانی است'),
    confirmPassword: z.string().min(1, 'تکرار رمز عبور الزامی است'),
    firstName: z
      .string()
      .min(1, 'نام الزامی است')
      .min(2, 'نام باید حداقل ۲ کاراکتر باشد')
      .max(100, 'نام بیش از حد طولانی است')
      .transform((v) => v.trim()),
    lastName: z
      .string()
      .min(1, 'نام خانوادگی الزامی است')
      .min(2, 'نام خانوادگی باید حداقل ۲ کاراکتر باشد')
      .max(100, 'نام خانوادگی بیش از حد طولانی است')
      .transform((v) => v.trim()),
    phone: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => !val || /^09\d{9}$/.test(val), {
        message: 'شماره تماس معتبر نیست',
      }),
    role: z.enum(['admin', 'supervisor', 'operator']).refine((val) => !!val, {
      message: 'نقش کاربری الزامی است',
    }),
    farmId: z.string().optional().or(z.literal('')),
    isActive: z.boolean().default(true),
    notes: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => !val || val.length <= 500, {
        message: 'یادداشت بیش از حد طولانی است',
      })
      .transform((v) => v?.trim() ?? ''),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'رمز عبور و تکرار آن یکسان نیستند',
    path: ['confirmPassword'],
  })
  .refine((data) => data.role === 'admin' || !!data.farmId, {
    message: 'انتخاب فارم برای این نقش الزامی است',
    path: ['farmId'],
  });

export const updateUserSchema = z
  .object({
    firstName: z
      .string()
      .min(1, 'نام الزامی است')
      .min(2, 'نام باید حداقل ۲ کاراکتر باشد')
      .max(100, 'نام بیش از حد طولانی است')
      .transform((v) => v.trim()),
    lastName: z
      .string()
      .min(1, 'نام خانوادگی الزامی است')
      .min(2, 'نام خانوادگی باید حداقل ۲ کاراکتر باشد')
      .max(100, 'نام خانوادگی بیش از حد طولانی است')
      .transform((v) => v.trim()),
    phone: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => !val || /^09\d{9}$/.test(val), {
        message: 'شماره تماس معتبر نیست',
      }),
    role: z.enum(['admin', 'supervisor', 'operator']).refine((val) => !!val, {
      message: 'نقش کاربری الزامی است',
    }),
    farmId: z.string().optional().or(z.literal('')),
    isActive: z.boolean().default(true),
    notes: z
      .string()
      .optional()
      .or(z.literal(''))
      .refine((val) => !val || val.length <= 500, {
        message: 'یادداشت بیش از حد طولانی است',
      })
      .transform((v) => v?.trim() ?? ''),
    changePassword: z.boolean().default(false),
    newPassword: z.string().optional().or(z.literal('')),
  })
  .refine((data) => data.role === 'admin' || !!data.farmId, {
    message: 'انتخاب فارم برای این نقش الزامی است',
    path: ['farmId'],
  })
  .refine((data) => !data.changePassword || (data.newPassword && data.newPassword.length >= 6), {
    message: 'رمز عبور باید حداقل ۶ کاراکتر باشد',
    path: ['newPassword'],
  });

export const userFiltersSchema = z.object({
  search: z.string().default(''),
  role: z.enum(['all', 'admin', 'supervisor', 'operator']).default('all'),
  farmId: z.string().default('all'),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});
