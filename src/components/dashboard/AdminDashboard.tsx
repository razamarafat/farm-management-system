import {
  Users,
  Warehouse,
  ClipboardList,
  ShoppingCart,
  FileText,
  FlaskConical,
  Package,
  Settings,
  Activity,
  Truck,
  Wheat
} from 'lucide-react';
import { Tile } from '@/components/ui/Tile';

const AdminDashboard = () => {
  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col space-y-2 text-center sm:text-right">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">داشبورد مدیریت</h2>
        <p className="text-[var(--c-muted-fg)]">
          نمای کلی وضعیت فارم‌ها و دسترسی به بخش‌های مدیریتی
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Tile
          icon={ClipboardList}
          label="حواله‌های مصرف"
          color="blue"
          to="/admin/consumption"
        />
        <Tile
          icon={ShoppingCart}
          label="خرید و انتقال"
          color="green"
          to="/admin/purchases"
        />
        <Tile
          icon={FileText}
          label="گزارشات"
          color="orange"
          to="/admin/reports"
        />
        <Tile
          icon={FlaskConical}
          label="مدیریت فرمول‌ها"
          color="purple"
          to="/admin/formulas"
        />
        <Tile
          icon={Package}
          label="موجودی انبار"
          color="teal"
          to="/admin/inventory"
        />

        <Tile
          icon={Users}
          label="مدیریت کاربران"
          color="red"
          to="/admin/users"
        />
        <Tile
          icon={Warehouse}
          label="مدیریت فارم‌ها"
          color="indigo"
          to="/admin/farms"
        />
        <Tile
          icon={Wheat}
          label="تعریف نهاده‌ها"
          color="amber"
          to="/admin/inputs"
          disabled
        />
        <Tile
          icon={Package}
          label="اقلام بسته‌بندی"
          color="cyan"
          to="/admin/packaging"
          disabled
        />
        <Tile
          icon={Truck}
          label="تامین‌کنندگان"
          color="slate"
          to="/admin/suppliers"
        />
        <Tile
          icon={Activity}
          label="لاگ فعالیت‌ها"
          color="slate"
          to="/admin/logs"
          disabled
        />
        <Tile
          icon={Settings}
          label="تنظیمات"
          color="slate"
          to="/admin/settings"
          disabled
        />
      </div>
    </div>
  );
};

export default AdminDashboard;
