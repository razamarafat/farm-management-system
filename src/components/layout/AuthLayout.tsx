import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui/Toast';

export const AuthLayout = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
};
