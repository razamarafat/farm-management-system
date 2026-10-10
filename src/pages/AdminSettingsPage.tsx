import { Link } from 'react-router-dom';
import { ArrowRight, Settings } from 'lucide-react';
import { AdminQuickSettingsCard } from '@/components/dashboard/AdminQuickSettingsCard';

export const AdminSettingsPage = () => {
  return (
    <div className="space-y-6 w-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--c-border)]">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[var(--c-primary)]/10 text-[var(--c-primary)] border border-[var(--c-primary)]/20">
            <Settings size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--c-fg)]">تنظیمات و پیکربندی سامانه</h1>
            <p className="text-xs text-[var(--c-muted-fg)] mt-0.5">
              مدیریت هویت مجموعه، ظرفیت بچ میکسر فارم‌ها و رفتارهای عملیاتی سیستم
            </p>
          </div>
        </div>

        <Link
          to="/admin"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--c-muted-fg)] hover:text-[var(--c-fg)] bg-[var(--c-card)] hover:bg-[var(--c-muted)]/60 px-3 py-1.5 rounded-lg border border-[var(--c-border)] transition-colors self-start sm:self-auto"
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
