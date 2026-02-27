import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Plus,
  Search,
  Users,
  X,
  Pencil,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { useUsers, useToggleUserStatus } from '@/hooks/useUsers';
import { UserFilters } from '@/types/user.types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import { UserCard } from '@/components/users/UserCard';
import { UserForm } from '@/components/users/UserForm';
import { UserDeleteDialog } from '@/components/users/UserDeleteDialog';
import { UserPasswordReset } from '@/components/users/UserPasswordReset';
import { toPersianDigits } from '@/utils/persianNumbers';
import { getJalaliDateTime } from '@/utils/jalaliDate';
import { ProfileWithFarm, ROLE_COLORS, ROLE_LABELS } from '@/types/user.types';
import { supabase } from '@/lib/supabase';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { Toggle } from '@/components/ui/Toggle';

interface FarmOption {
  id: string;
  name: string;
  code: string;
}

const defaultFilters: UserFilters = {
  search: '',
  role: 'all',
  farmId: 'all',
  status: 'all',
};

export const UserList = () => {
  const [filters, setFilters] = useState<UserFilters>(defaultFilters);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<ProfileWithFarm | null>(null);
  const [deleteUser, setDeleteUser] = useState<ProfileWithFarm | null>(null);
  const [resetUser, setResetUser] = useState<ProfileWithFarm | null>(null);
  const [farms, setFarms] = useState<FarmOption[]>([]);
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const { users, isLoading, error, refetch } = useUsers(filters);
  const { toggleStatus } = useToggleUserStatus();

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

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.is_active).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [users]);

  const isFiltersActive = useMemo(() => {
    return (
      filters.search.trim() ||
      filters.role !== 'all' ||
      filters.farmId !== 'all' ||
      filters.status !== 'all'
    );
  }, [filters]);

  const handleClearFilters = () => setFilters(defaultFilters);

  const handleToggleStatus = async (user: ProfileWithFarm) => {
    const ok = await toggleStatus(user.id, user.is_active);
    if (ok) refetch();
  };

  const renderTable = () => (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-[60px_1.6fr_120px_140px_140px_100px_160px_120px] bg-muted text-xs font-semibold text-muted-foreground px-4 py-3 text-center">
        <span>ردیف</span>
        <span>کاربر</span>
        <span>نقش</span>
        <span>فارم</span>
        <span>تلفن</span>
        <span>وضعیت</span>
        <span>آخرین ورود</span>
        <span>عملیات</span>
      </div>
      <div className="divide-y">
        {users.map((user, index) => {
          const roleColor = ROLE_COLORS[user.role];
          const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'بدون نام';
          return (
            <div
              key={user.id}
              className="grid grid-cols-[60px_1.6fr_120px_140px_140px_100px_160px_120px] px-4 py-3 text-sm items-center hover:bg-muted/50 transition-colors text-center"
            >
              <span>{toPersianDigits(index + 1)}</span>
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                  {(user.first_name?.charAt(0) || user.last_name?.charAt(0) || '?')}
                </div>
                <div className="text-right">
                  <div className="font-semibold">{fullName}</div>
                  <div className="text-xs text-muted-foreground">{user.username}</div>
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full w-fit mx-auto ${roleColor.bg} ${roleColor.text}`}>
                {ROLE_LABELS[user.role]}
              </span>
              <span>{user.farm?.name ?? '—'}</span>
              <span dir="ltr" className="font-mono">
                {user.phone ? toPersianDigits(user.phone) : '—'}
              </span>
              <div className="flex items-center justify-center">
                <Toggle checked={user.is_active} onChange={() => handleToggleStatus(user)} />
              </div>
              <span className="text-xs text-muted-foreground">
                {user.last_login_at ? getJalaliDateTime(new Date(user.last_login_at)) : 'ورود نداشته'}
              </span>
              <div className="flex items-center justify-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setEditUser(user)}>
                  <Pencil size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteUser(user)}
                  className="text-destructive"
                >
                  <Trash2 size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setResetUser(user)} title="بازنشانی رمز عبور">
                  <KeyRound size={16} />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">مدیریت کاربران</h2>
          <p className="text-sm text-muted-foreground">مدیریت حساب‌های کاربری فارم‌ها</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <Plus size={18} /> افزودن کاربر
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Card className="px-4 py-3 text-sm flex items-center gap-2">
          <Users size={16} /> کل کاربران: {toPersianDigits(stats.total)}
        </Card>
        <Card className="px-4 py-3 text-sm">فعال: {toPersianDigits(stats.active)}</Card>
        <Card className="px-4 py-3 text-sm">غیرفعال: {toPersianDigits(stats.inactive)}</Card>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="w-full lg:max-w-sm relative">
          <Input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="جستجوی نام، نام کاربری یا شماره تماس..."
            className="pr-10"
          />
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
        </div>
        <Select
          label="نقش"
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value as UserFilters['role'] })}
        >
          <option value="all">همه</option>
          <option value="admin">مدیر</option>
          <option value="supervisor">سرپرست</option>
          <option value="operator">کاربر ثبت</option>
        </Select>
        <Select
          label="فارم"
          value={filters.farmId}
          onChange={(e) => setFilters({ ...filters, farmId: e.target.value })}
        >
          <option value="all">همه</option>
          {farms.map((farm) => (
            <option key={farm.id} value={farm.id}>
              {farm.name} ({farm.code})
            </option>
          ))}
        </Select>
        <Select
          label="وضعیت"
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value as UserFilters['status'] })}
        >
          <option value="all">همه</option>
          <option value="active">فعال</option>
          <option value="inactive">غیرفعال</option>
        </Select>
        {isFiltersActive && (
          <Button variant="ghost" onClick={handleClearFilters} className="gap-2">
            <X size={16} /> پاک کردن فیلترها
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <Card className="p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto text-destructive" />
          <div className="text-sm">خطا در دریافت اطلاعات کاربران</div>
          <Button onClick={refetch}>تلاش مجدد</Button>
        </Card>
      )}

      {!isLoading && !error && users.length === 0 && (
        <Card className="p-8 text-center space-y-3">
          <Users className="mx-auto text-muted-foreground" size={48} />
          <div className="text-lg font-bold">کاربری یافت نشد</div>
          <p className="text-sm text-muted-foreground">
            فیلترها را تغییر دهید یا کاربر جدید اضافه کنید
          </p>
          {!isFiltersActive && (
            <Button onClick={() => setIsCreateOpen(true)}>افزودن کاربر</Button>
          )}
        </Card>
      )}

      {!isLoading && !error && users.length > 0 && (
        <div>
          {isDesktop ? (
            renderTable()
          ) : (
            <div className="space-y-3">
              {users.map((user, index) => (
                <UserCard
                  key={user.id}
                  user={user}
                  index={index}
                  onEdit={() => setEditUser(user)}
                  onDelete={() => setDeleteUser(user)}
                  onToggleStatus={() => handleToggleStatus(user)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <UserForm
        mode="create"
        user={null}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSuccess={() => {
          setIsCreateOpen(false);
          refetch();
          toast.success('کاربر جدید ایجاد شد');
        }}
      />

      <UserForm
        mode="edit"
        user={editUser}
        isOpen={!!editUser}
        onClose={() => setEditUser(null)}
        onSuccess={() => {
          setEditUser(null);
          refetch();
          toast.success('اطلاعات کاربر بروزرسانی شد');
        }}
      />

      {deleteUser && (
        <UserDeleteDialog
          user={deleteUser}
          isOpen={!!deleteUser}
          onClose={() => setDeleteUser(null)}
          onSuccess={() => {
            setDeleteUser(null);
            refetch();
          }}
        />
      )}

      {resetUser && (
        <UserPasswordReset user={resetUser} isOpen={!!resetUser} onClose={() => setResetUser(null)} />
      )}
    </div>
  );
};
