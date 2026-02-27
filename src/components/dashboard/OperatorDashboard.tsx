import {
  ClipboardList,
  ShoppingCart,
  FileText,
  FlaskConical,
  Package
} from 'lucide-react';
import { Tile } from '@/components/ui/Tile';
import { useAuthStore } from '@/store/authStore';
import { getJalaliDate } from '@/utils/jalaliDate';

const OperatorDashboard = () => {
  const { profile } = useAuthStore();

  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col space-y-2 text-center sm:text-right">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">
          سلام، {profile?.first_name || profile?.username}
        </h2>
        <p className="text-[var(--c-muted-fg)]">
          امروز {getJalaliDate()}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Tile
          icon={ClipboardList}
          label="ثبت مصرف روزانه"
          color="blue"
          to="/operator/consumption"
        />
        <Tile
          icon={ShoppingCart}
          label="خرید و انتقال"
          color="green"
          to="/operator/purchases"
        />
        <Tile
          icon={FileText}
          label="گزارشات"
          color="orange"
          to="/operator/reports"
        />
        <Tile
          icon={FlaskConical}
          label="فرمول‌ها"
          color="purple"
          to="/operator/formulas"
        />
        <Tile
          icon={Package}
          label="انبارداری"
          color="teal"
          to="/operator/inventory"
        />
      </div>
    </div>
  );
};

export default OperatorDashboard;
