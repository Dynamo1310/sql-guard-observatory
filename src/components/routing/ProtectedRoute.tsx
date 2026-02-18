import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  viewName: string;
  redirectTo?: string;
}

/**
 * Componente que protege rutas verificando permisos del usuario
 * Si el usuario no tiene permisos, lo redirige a la página de no autorizado o a una ruta específica
 */
export function ProtectedRoute({ children, viewName, redirectTo }: ProtectedRouteProps) {
  const { hasPermission, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!hasPermission(viewName)) {
    return <Navigate to={redirectTo || '/unauthorized'} replace />;
  }

  return <>{children}</>;
}
