import {
  ClipboardList,
  ShoppingCart,
  FileText,
  FlaskConical,
  Package
} from 'lucide-react';
import { Tile } from '@/components/ui/Tile';

const SupervisorDashboard = () => {
  return (
    <div className="space-y-6 w-full">
      <div className="flex flex-col space-y-2 text-center sm:text-right">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--c-fg)]">پنل سرپرست</h2>
        <p className="text-[var(--c-muted-fg)]">
          مشاهده و بررسی وضعیت فارم
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <Tile
          icon={ClipboardList}
          label="مشاهده حواله‌ها"
          color="blue"
          to="/supervisor/consumption"
        />
        <Tile
          icon={ShoppingCart}
          label="مشاهده خریدها"
          color="green"
          to="/supervisor/purchase"
        />
        <Tile
          icon={FileText}
          label="گزارشات"
          color="orange"
          to="/supervisor/reports"
        />
        <Tile
          icon={FlaskConical}
          label="فرمول‌ها و آنالیز"
          color="purple"
          to="/supervisor/formulas"
        />
        <Tile
          icon={Package}
          label="موجودی انبار"
          color="teal"
          to="/supervisor/inventory"
        />
      </div>
    </div>
  );
};

export default SupervisorDashboard;
