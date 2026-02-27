import { z } from 'zod';

export const createFarmSchema = z.object({
  name: z.string().min(2, 'نام فارم الزامی است').max(255, 'نام فارم بیش از حد طولانی است'),
  code: z.string().min(1, 'کد فارم الزامی است').max(50, 'کد فارم بیش از حد طولانی است'),
  address: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || val.length <= 500, {
      message: 'آدرس بیش از حد طولانی است',
    }),
  phone: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || /^\d{8,15}$/.test(val), {
      message: 'شماره تماس معتبر نیست',
    }),
  isActive: z.boolean().default(true),
});

export const assignItemSchema = z.object({
  itemId: z.string().min(1, 'انتخاب مورد الزامی است'),
  minStock: z.string().optional().or(z.literal('')),
  notes: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => !val || val.length <= 500, {
      message: 'یادداشت بیش از حد طولانی است',
    }),
});

export type CreateFarmInput = z.infer<typeof createFarmSchema>;
export type AssignItemInput = z.infer<typeof assignItemSchema>;
