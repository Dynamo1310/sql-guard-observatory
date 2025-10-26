import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { authApi } from '@/services/api';
import sqlNovaAnimation from '/SQLNovaAnimation.mp4';
import windows11Logo from '/Windows11.png';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Autenticando con Windows...');

  // No hay autenticación automática - useEffect vacío o removido

  const handleWindowsLogin = async () => {
    setLoading(true);
    setError('');

    try {
      setStatus('Verificando credenciales de Windows...');
      await authApi.windowsLogin();

      setStatus('Autenticación exitosa. Redirigiendo...');
      
      // Forzar recarga completa para actualizar el AuthContext
      setTimeout(() => {
        window.location.href = '/';
      }, 500);
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión con Windows. Asegúrate de estar en el dominio gscorp.ad y estar en la lista blanca de usuarios.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4 overflow-hidden">
            <video 
              src={sqlNovaAnimation} 
              autoPlay 
              muted 
              playsInline
              className="w-full h-48 object-cover"
              style={{ objectPosition: 'center' }}
            />
          </div>
          <CardTitle className="text-2xl text-center">SQL Nova - Observabilidad SQL Server</CardTitle>
          <CardDescription className="text-center">
            Autenticación con Windows (Dominio gscorp.ad)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground text-center">{status}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4 py-4">
              <p className="text-sm text-muted-foreground text-center">
                Haz clic en el botón para iniciar sesión con tu cuenta de Windows del dominio gscorp.ad
              </p>
              <Button
                onClick={handleWindowsLogin}
                className="w-full"
                disabled={loading}
                size="lg"
              >
                <img src={windows11Logo} alt="Windows 11" className="h-5 w-5 mr-2" />
                Iniciar Sesión con Windows
              </Button>
              {error && (
                <div className="text-xs text-muted-foreground text-center">
                  <p className="mb-2">Verifica que:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Estés conectado al dominio gscorp.ad</li>
                    <li>Tu usuario esté en la lista blanca</li>
                    <li>Windows Authentication esté habilitado</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
