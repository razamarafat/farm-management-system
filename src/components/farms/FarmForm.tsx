import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Button } from '@/components/ui/Button';
import { createFarmSchema, CreateFarmInput } from '@/validations/farmSchema';
import { Farm } from '@/types/farm.types';
import { useCreateFarm, useUpdateFarm } from '@/hooks/useFarms';

interface FarmFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  farm?: Farm | null;
}

export const FarmForm = ({ isOpen, onClose, onSuccess, farm }: FarmFormProps) => {
  const isEdit = !!farm;
  const { createFarm, isCreating } = useCreateFarm();
  const { updateFarm, isUpdating } = useUpdateFarm();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(createFarmSchema),
    defaultValues: {
      name: farm?.name || '',
      code: farm?.code || '',
      address: farm?.address || '',
      phone: farm?.phone || '',
      isActive: farm?.is_active ?? true,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        name: farm?.name || '',
        code: farm?.code || '',
        address: farm?.address || '',
        phone: farm?.phone || '',
        isActive: farm?.is_active ?? true,
      });
    }
  }, [isOpen, farm, reset]);

  const onSubmit = async (values: CreateFarmInput) => {
    if (isEdit && farm) {
      const ok = await updateFarm(farm.id, {
        name: values.name,
        code: values.code,
        address: values.address || null,
        phone: values.phone || null,
        is_active: values.isActive,
      });
      if (ok) onSuccess();
      return;
    }

    const ok = await createFarm({
      name: values.name,
      code: values.code,
      address: values.address || null,
      phone: values.phone || null,
      is_active: values.isActive,
    });
    if (ok) onSuccess();
  };

  const isActiveValue = watch('isActive');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'ویرایش فارم' : 'ایجاد فارم جدید'}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>انصراف</Button>
          <Button type="submit" form="farm-form" isLoading={isEdit ? isUpdating : isCreating}>
            {isEdit ? 'بروزرسانی' : 'ایجاد فارم'}
          </Button>
        </div>
      }
    >
      <form id="farm-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label="نام فارم" {...register('name')} error={errors.name?.message} />
        <Input label="کد فارم" {...register('code')} error={errors.code?.message} />
        <Input label="آدرس" {...register('address')} error={errors.address?.message} />
        <Input label="شماره تماس" {...register('phone')} dir="ltr" error={errors.phone?.message} />
        <Checkbox
          label="فارم فعال باشد"
          checked={!!isActiveValue}
          onChange={(e) => setValue('isActive', e.target.checked)}
        />
      </form>
    </Modal>
  );
};
