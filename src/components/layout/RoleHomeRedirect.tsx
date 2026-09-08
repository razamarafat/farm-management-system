import { Navigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/store/authStore';
import { Spinner } from '@/components/ui/Spinner';
import { roleHome } from '@/utils/roleHome';

function AuthSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Spinner size={32} />
    </div>
  );
}

export const RedirectIfAuthed = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, profile, isLoading } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      profile: state.profile,
      isLoading: state.isLoading,
    }))
  );

  if (isLoading) {
    return <AuthSpinner />;
  }

  if (isAuthenticated && profile) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }

  return <>{children}</>;
};

export const RoleHomeRedirect = () => {
  const { isAuthenticated, profile, isLoading } = useAuthStore(
    useShallow((state) => ({
      isAuthenticated: state.isAuthenticated,
      profile: state.profile,
      isLoading: state.isLoading,
    }))
  );

  if (isLoading) {
    return <AuthSpinner />;
  }

  if (isAuthenticated && profile) {
    return <Navigate to={roleHome(profile.role)} replace />;
  }

  return <Navigate to="/login" replace />;
};
