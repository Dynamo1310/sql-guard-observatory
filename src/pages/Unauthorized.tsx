import { ShieldAlert, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { logout, permissions, user } = useAuth();

  // Si el usuario no tiene ningún permiso, mostrar mensaje diferente
  const hasNoPermissions = permissions.length === 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">
            {hasNoPermissions ? 'Sin Permisos Asignados' : 'Acceso No Autorizado'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {hasNoPermissions ? (
            <>
              <p className="text-muted-foreground">
                Tu usuario <strong>{user?.displayName}</strong> no tiene permisos asignados en el sistema.
              </p>
              <p className="text-sm text-muted-foreground">
                Contacta al administrador para que te agregue a un grupo con los permisos necesarios.
              </p>
            </>
          ) : (
            <>
              <p className="text-muted-foreground">
                No tienes permisos para acceder a esta vista.
              </p>
              <p className="text-sm text-muted-foreground">
                Si crees que deberías tener acceso, contacta al administrador del sistema.
              </p>
            </>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-4">
            {!hasNoPermissions && (
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
              >
                Volver al Inicio
              </Button>
            )}
            <Button 
              onClick={handleLogout} 
              variant={hasNoPermissions ? "default" : "ghost"}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Cerrar Sesión
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
