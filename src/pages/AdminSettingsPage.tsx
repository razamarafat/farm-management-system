import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { AdminQuickSettingsCard } from '@/components/dashboard/AdminQuickSettingsCard';

export const AdminSettingsPage = () => {
  return (
    <div className="space-y-6 w-full pb-12">
      <div className="flex items-center justify-between pb-2">
        <Link
          to="/admin"
          className="flex items-center gap-1.5 text-xs text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] transition-colors"
        >
          <ArrowRight size={14} />
          <span>بازگشت به داشبورد مدیریت</span>
        </Link>
      </div>

      <AdminQuickSettingsCard />
    </div>
  );
};

export default AdminSettingsPage;
