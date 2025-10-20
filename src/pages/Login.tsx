import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { authApi } from '@/services/api';
import { toast } from 'sonner';
import supvLogo from '/SUPV.png';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export default function Login() {
  const [domainUser, setDomainUser] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Login con el backend .NET
      const response = await authApi.login({
        username: domainUser,
        password: password
      });

      if (!response.allowed) {
        setError('No tienes permisos para acceder a esta aplicación. Contacta al administrador.');
        setLoading(false);
        return;
      }

      toast.success('Inicio de sesión exitoso');
      
      // Forzar recarga completa para que el AuthContext se actualice
      window.location.href = '/';
    } catch (err: any) {
      console.error('Error al iniciar sesión:', err);
      setError(err.message || 'Error al verificar credenciales. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      
      <Card className="w-full max-w-md shadow-glow">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img 
              src={supvLogo} 
              alt="Supervielle" 
              className="h-16 object-contain"
            />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl">Observabilidad SQL Server</CardTitle>
            <CardDescription>
              Ingresa tus credenciales para acceder
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="domainUser">Usuario</Label>
              <Input
                id="domainUser"
                type="text"
                placeholder="TB03260"
                value={domainUser}
                onChange={(e) => setDomainUser(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Ingresa tu usuario
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2" />
                  Verificando...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
