import { useLayoutEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Aplicar tema inmediatamente (antes del primer render de React)
const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = savedTheme || (prefersDark ? 'dark' : 'light');
document.documentElement.classList.toggle('dark', initialTheme === 'dark');

/**
 * Componente que redirige al usuario a la primera vista a la que tiene acceso
 * Útil para la ruta raíz "/" cuando el usuario inicia sesión
 */
export function DefaultRoute() {
  const { hasPermission, loading } = useAuth();

  // Asegurar que el tema esté aplicado (por si cambia mientras el componente está montado)
  useLayoutEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = savedTheme || (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, []);

  // Mostrar loading mientras se cargan los permisos
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  // Orden de prioridad de las vistas para redirección
  // Redirige a la primera vista que el usuario tenga permisos
  const viewPriority = [
    { path: '/overview', viewName: 'Overview' },
    { path: '/healthscore', viewName: 'HealthScore' },
    { path: '/jobs', viewName: 'Jobs' },
    { path: '/disks', viewName: 'Disks' },
    { path: '/databases', viewName: 'Databases' },
    { path: '/backups', viewName: 'Backups' },
    { path: '/indexes', viewName: 'Indexes' },
    { path: '/patching', viewName: 'Patching' },
    { path: '/oncall/dashboard', viewName: 'OnCallDashboard' },
    { path: '/vault/dashboard', viewName: 'VaultDashboard' },
    { path: '/admin/users', viewName: 'AdminUsers' },
    { path: '/admin/groups', viewName: 'AdminGroups' },
  ];

  // Buscar la primera vista a la que el usuario tiene acceso
  for (const view of viewPriority) {
    if (hasPermission(view.viewName)) {
      return <Navigate to={view.path} replace />;
    }
  }

  // Si el usuario no tiene acceso a ninguna vista (no debería pasar), redirigir a unauthorized
  return <Navigate to="/unauthorized" replace />;
}

