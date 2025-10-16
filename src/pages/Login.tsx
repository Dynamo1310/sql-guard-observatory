import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import superviseLogo from '@/assets/supervielle-logo.png';

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
      // Validate format DOM\usuario
      if (!domainUser.includes('\\')) {
        setError('El formato debe ser DOMINIO\\usuario');
        setLoading(false);
        return;
      }

      // Call edge function to validate AD credentials and check whitelist
      const { data, error: functionError } = await supabase.functions.invoke('validate-ad-user', {
        body: { domainUser, password }
      });

      if (functionError) {
        throw functionError;
      }

      if (!data.allowed) {
        setError('No tienes permisos para acceder a esta aplicación. Contacta al administrador.');
        setLoading(false);
        return;
      }

      // Store domain user and roles in localStorage temporarily
      // In production, this should use proper JWT tokens with domain_user claim
      localStorage.setItem('domain_user', domainUser);
      localStorage.setItem('display_name', data.displayName);
      localStorage.setItem('roles', JSON.stringify(data.roles));
      
      toast.success('Inicio de sesión exitoso');
      navigate('/');
    } catch (err) {
      console.error('Error al iniciar sesión:', err);
      setError('Error al verificar credenciales. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-glow">
        <CardHeader className="space-y-4">
          <div className="flex justify-center">
            <img 
              src={superviseLogo} 
              alt="Supervielle" 
              className="h-16 object-contain"
            />
          </div>
          <div className="text-center">
            <CardTitle className="text-2xl">Observabilidad SQL Server</CardTitle>
            <CardDescription>
              Ingresa tus credenciales de Active Directory
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
              <Label htmlFor="domainUser">Usuario de Dominio</Label>
              <Input
                id="domainUser"
                type="text"
                placeholder="BANCO\usuario"
                value={domainUser}
                onChange={(e) => setDomainUser(e.target.value)}
                required
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Formato: DOMINIO\usuario
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
