import { Settings, Activity } from 'lucide-react';
import { Tile } from '@/components/ui/Tile';
import { getNavLabel, navItemsForRole, roleBase } from '@/navigation/manifest';
import { useReorderAlertCount } from '@/hooks/useReorderAlertCount';

const AdminDashboard = () => {
  const role = 'admin' as const;
  const basePath = roleBase(role);
  const reorderCount = useReorderAlertCount();

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col space-y-2 text-center sm:text-right">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">داشبورد مدیریت</h2>
        <p className="text-[var(--c-muted-fg)]">
          نمای کلی وضعیت فارم‌ها و دسترسی به بخش‌های مدیریتی
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {navItemsForRole(role).map((item) => (
          <Tile
            key={item.path}
            icon={item.icon}
            label={getNavLabel(item, role)}
            color={item.color}
            to={`${basePath}/${item.path}`}
            badgeCount={item.path === 'reorder' ? reorderCount : undefined}
          />
        ))}

        <Tile
          icon={Activity}
          label="لاگ فعالیت‌ها"
          color="sand"
          to="/admin/logs"
        />
        <Tile
          icon={Settings}
          label="تنظیمات"
          color="sand"
          to="/admin/settings"
          disabled
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
