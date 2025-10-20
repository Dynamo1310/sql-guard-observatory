import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { authApi } from '@/services/api';
import { Separator } from '@/components/ui/separator';
import { Building2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [domainUsername, setDomainUsername] = useState('');
  const [domainPassword, setDomainPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loginMode, setLoginMode] = useState<'direct' | 'ad'>('direct');

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.login({
        username,
        password,
      });

      // Forzar recarga completa para actualizar el AuthContext
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleADLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainUsername || !domainPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await authApi.loginWithAD({
        domain: 'GSCORP',
        username: domainUsername,
        password: domainPassword,
      });

      // Forzar recarga completa para actualizar el AuthContext
      window.location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Active Directory');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center">Observabilidad SQL Server</CardTitle>
          <CardDescription className="text-center">
            Selecciona tu método de autenticación
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Botones para elegir modo de login */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={loginMode === 'direct' ? 'default' : 'outline'}
              onClick={() => {
                setLoginMode('direct');
                setError('');
              }}
            >
              Acceso Directo
            </Button>
            <Button
              type="button"
              variant={loginMode === 'ad' ? 'default' : 'outline'}
              onClick={() => {
                setLoginMode('ad');
                setError('');
              }}
            >
              Cuenta Supervielle
            </Button>
          </div>

          <Separator />

          {/* Formulario Acceso Directo */}
          {loginMode === 'direct' && (
            <form onSubmit={handleDirectLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="TB12345"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Utiliza tu usuario y contraseña del sistema
              </p>
            </form>
          )}

          {/* Formulario Active Directory */}
          {loginMode === 'ad' && (
            <form onSubmit={handleADLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="domain-username">Usuario de Dominio</Label>
                <Input
                  id="domain-username"
                  type="text"
                  placeholder="TB12345"
                  value={domainUsername}
                  onChange={(e) => setDomainUsername(e.target.value)}
                  disabled={loading}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Solo tu usuario (sin GSCORP\)
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain-password">Contraseña de Dominio</Label>
                <Input
                  id="domain-password"
                  type="password"
                  placeholder="Contraseña"
                  value={domainPassword}
                  onChange={(e) => setDomainPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Autenticando...' : 'Acceder con Cuenta Supervielle'}
              </Button>
              <Alert>
                <AlertDescription className="text-xs">
                  <strong>Importante:</strong> Solo usuarios autorizados en la lista blanca pueden acceder, 
                  incluso con credenciales de Active Directory válidas.
                </AlertDescription>
              </Alert>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
