import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import AccessDenied from '@/components/shared/AccessDenied';
import { Spinner } from '@/components/ui/Spinner';

interface ProtectedRouteProps {
  allowedRoles?: string[];
}

export const ProtectedRoute = ({ allowedRoles }: ProtectedRouteProps) => {
  const { isAuthenticated, profile, isLoading } = useAuthStore();
  const location = useLocation();

  const isInitializing = isLoading || (isAuthenticated && !profile);

  if (isInitializing) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner size={32} />
      </div>
    );
  }

  if (!isAuthenticated || !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <AccessDenied />;
  }

  return <Outlet />;
};
