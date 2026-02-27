import { z } from 'zod';
import { loginSchema } from '@/validations/authSchema';

export { loginSchema };

export const userSchema = z.object({
  username: z.string().min(3, 'نام کاربری باید حداقل ۳ کاراکتر باشد'),
  role: z.enum(['admin', 'supervisor', 'operator']),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  farm_id: z.string().uuid().optional().nullable(),
  password: z.string().min(6, 'رمز عبور باید حداقل ۶ کاراکتر باشد').optional(),
});

export const farmSchema = z.object({
  name: z.string().min(2, 'نام فارم الزامی است'),
  code: z.string().min(1, 'کد فارم الزامی است'),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export type UserFormData = z.infer<typeof userSchema>;
export type FarmFormData = z.infer<typeof farmSchema>;
