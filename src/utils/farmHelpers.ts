import { FarmStaffProfile } from '@/types/farm.types';

export const formatFarmStaffName = (user: FarmStaffProfile) => {
  const name = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim();
  return name.length ? name : user.username;
};

export const getFarmStatusText = (isActive: boolean) => (isActive ? 'فعال' : 'غیرفعال');

export const getFarmItemStatusText = (isActive?: boolean | null) => (isActive ? 'فعال' : 'غیرفعال');
