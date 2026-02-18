import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { track, AnalyticsEventNames } from '@/services/analyticsService';

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
  const location = useLocation();

  // Mostrar loading mientras se cargan los permisos
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

  // Verificar si el usuario tiene permiso para esta vista
  if (!hasPermission(viewName)) {
    track(AnalyticsEventNames.PERMISSION_DENIED, {
      viewName,
      requiredPermission: viewName,
    }, { route: location.pathname });
    return <Navigate to={redirectTo || '/unauthorized'} replace />;
  }

  // Usuario tiene permisos, renderizar la vista
  return <>{children}</>;
}

