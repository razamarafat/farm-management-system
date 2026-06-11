import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toast';

export const AuthLayout = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--c-bg)] p-4 sm:p-6">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
};
