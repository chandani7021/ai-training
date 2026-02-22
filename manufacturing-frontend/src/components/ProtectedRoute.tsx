import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  role: 'admin' | 'employee';
  children: React.ReactNode;
}

export function ProtectedRoute({ role, children }: Props) {
  const { user } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) {
    return <Navigate to={user.role === 'admin' ? '/admin/documents' : '/employee/trainings'} replace />;
  }
  return <>{children}</>;
}
