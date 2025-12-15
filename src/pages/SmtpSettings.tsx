import { useState, useEffect } from 'react';
import { Mail, Server, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { smtpApi, SmtpSettingsDto, UpdateSmtpSettingsRequest } from '@/services/api';

export default function SmtpSettings() {
  const [settings, setSettings] = useState<SmtpSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [formData, setFormData] = useState<UpdateSmtpSettingsRequest>({
    host: '',
    port: 25,
    fromEmail: '',
    fromName: 'SQLNova',
    enableSsl: false,
    username: '',
    password: '',
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await smtpApi.getSettings();
      setSettings(data);
      setFormData({
        host: data.host,
        port: data.port,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        enableSsl: data.enableSsl,
        username: data.username || '',
        password: '', // No mostramos la contraseña
      });
    } catch (err: any) {
      if (err.message.includes('No hay configuración')) {
        // Primera vez, mostrar formulario vacío
      } else {
        toast.error('Error al cargar configuración: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.host || !formData.fromEmail) {
      toast.error('Host y Email remitente son requeridos');
      return;
    }

    try {
      setSaving(true);
      const updated = await smtpApi.updateSettings(formData);
      setSettings(updated);
      setFormData(prev => ({ ...prev, password: '' }));
      toast.success('Configuración SMTP guardada correctamente');
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.error('Ingresa un email para la prueba');
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      const result = await smtpApi.testConnection(testEmail);
      setTestResult(result);
      if (result.success) {
        toast.success('Email de prueba enviado correctamente');
      } else {
        toast.error('Error en la prueba: ' + result.message);
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      toast.error('Error: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Mail className="h-8 w-8 text-teal-500" />
          Configuración SMTP
        </h1>
        <p className="text-muted-foreground mt-2">
          Configura el servidor de correo para enviar notificaciones desde la aplicación
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Formulario de configuración */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Servidor SMTP
            </CardTitle>
            <CardDescription>
              Configura los parámetros del servidor de correo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="host">Servidor (Host)</Label>
                <Input
                  id="host"
                  placeholder="smtp.ejemplo.com"
                  value={formData.host}
                  onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="port">Puerto</Label>
                <Input
                  id="port"
                  type="number"
                  placeholder="25"
                  value={formData.port}
                  onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 25 })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fromEmail">Email Remitente</Label>
                <Input
                  id="fromEmail"
                  type="email"
                  placeholder="notificaciones@empresa.com"
                  value={formData.fromEmail}
                  onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                />
              </div>

              <Button type="submit" className="w-full mt-6" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Configuración'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Panel de prueba */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Probar Conexión
              </CardTitle>
              <CardDescription>
                Envía un email de prueba para verificar la configuración
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="testEmail">Email de Prueba</Label>
                <Input
                  id="testEmail"
                  type="email"
                  placeholder="tu.email@empresa.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                />
              </div>

              <Button
                onClick={handleTest}
                variant="outline"
                className="w-full"
                disabled={testing || !settings}
              >
                {testing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Enviar Email de Prueba
                  </>
                )}
              </Button>

              {testResult && (
                <Alert variant={testResult.success ? 'default' : 'destructive'}>
                  {testResult.success ? (
                    <CheckCircle2 className="h-4 w-4 text-teal-500" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>
                    {testResult.message}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Info de estado actual */}
          {settings && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Estado Actual</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Servidor:</span>
                  <span className="font-mono">{settings.host}:{settings.port}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Remitente:</span>
                  <span>{settings.fromEmail}</span>
                </div>
                {settings.updatedAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última modificación:</span>
                    <span>{new Date(settings.updatedAt).toLocaleString()}</span>
                  </div>
                )}
                {settings.updatedByDisplayName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modificado por:</span>
                    <span>{settings.updatedByDisplayName}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Información adicional */}
      <Alert>
        <Mail className="h-4 w-4" />
        <AlertDescription>
          <strong>Esta configuración es global</strong> y se utiliza para enviar todas las 
          notificaciones de la aplicación: alertas de guardias, solicitudes de intercambio, 
          activaciones y otras notificaciones del sistema.
        </AlertDescription>
      </Alert>
    </div>
  );
}

