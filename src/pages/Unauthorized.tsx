import { ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Unauthorized() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full gradient-card shadow-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Acceso No Autorizado</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            No tienes permisos para acceder a esta vista.
          </p>
          <p className="text-sm text-muted-foreground">
            Si crees que deberías tener acceso, contacta al administrador del sistema.
          </p>
          <Button 
            onClick={() => navigate('/')} 
            variant="outline"
            className="mt-4"
          >
            Volver al Inicio
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
