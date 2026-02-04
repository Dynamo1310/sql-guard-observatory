import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Save,
  Mail,
  Clock,
  Play,
  Loader2,
  Plus,
  Trash2,
  History,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Send,
  Lock,
  Users,
  UserPlus
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Capabilities } from '@/lib/capabilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  backupAlertsApi,
  BackupAlertConfigDto,
  BackupAlertHistoryDto,
  BackupAlertStatusDto
} from '@/services/api';

const checkIntervalOptions = [
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
];

const alertIntervalOptions = [
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
];

export default function BackupAlerts() {
  const { hasCapability } = useAuth();
  const canConfigureAlerts = hasCapability(Capabilities.SystemConfigureAlerts);

  const [config, setConfig] = useState<BackupAlertConfigDto | null>(null);
  const [history, setHistory] = useState<BackupAlertHistoryDto[]>([]);
  const [status, setStatus] = useState<BackupAlertStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  // Form state
  const [name, setName] = useState('Alerta de Backups Atrasados');
  const [description, setDescription] = useState('Alerta automática cuando se detectan backups vencidos');
  const [isEnabled, setIsEnabled] = useState(false);
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(60);
  const [alertIntervalMinutes, setAlertIntervalMinutes] = useState(240);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newCcEmail, setNewCcEmail] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [configData, historyData] = await Promise.all([
        backupAlertsApi.getConfig(),
        backupAlertsApi.getHistory(10),
      ]);

      if (configData) {
        setConfig(configData);
        setName(configData.name);
        setDescription(configData.description || '');
        setIsEnabled(configData.isEnabled);
        setCheckIntervalMinutes(configData.checkIntervalMinutes || 60);
        setAlertIntervalMinutes(configData.alertIntervalMinutes || 240);
        setRecipients(configData.recipients || []);
        setCcRecipients(configData.ccRecipients || []);
      }
      setHistory(historyData);
    } catch (err: any) {
      console.error('Error loading config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const data = await backupAlertsApi.getStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Error loading status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadStatus();
  }, [loadConfig, loadStatus]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (recipients.length === 0) {
      toast.error('Agrega al menos un destinatario');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        isEnabled,
        checkIntervalMinutes,
        alertIntervalMinutes,
        recipients,
        ccRecipients,
      };

      let result: BackupAlertConfigDto;
      if (config && config.id > 0) {
        result = await backupAlertsApi.updateConfig(payload);
      } else {
        result = await backupAlertsApi.createConfig({
          name: payload.name,
          description: payload.description,
          checkIntervalMinutes: payload.checkIntervalMinutes,
          alertIntervalMinutes: payload.alertIntervalMinutes,
          recipients: payload.recipients,
          ccRecipients: payload.ccRecipients,
        });
      }

      setConfig(result);
      toast.success('Configuración guardada correctamente');
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setIsEnabled(enabled);

    if (config && config.id > 0) {
      try {
        const result = await backupAlertsApi.updateConfig({ isEnabled: enabled });
        setConfig(result);
        toast.success(enabled ? 'Alerta activada' : 'Alerta desactivada');
      } catch (err: any) {
        setIsEnabled(!enabled);
        toast.error('Error: ' + err.message);
      }
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      const result = await backupAlertsApi.testAlert();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleRunNow = async () => {
    try {
      setRunning(true);
      const result = await backupAlertsApi.runNow();
      if (result.success) {
        toast.success(result.message);
        await loadConfig();
        await loadStatus();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  const addRecipient = (isCC = false) => {
    const email = (isCC ? newCcEmail : newEmail).trim().toLowerCase();
    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email inválido');
      return;
    }

    const list = isCC ? ccRecipients : recipients;
    if (list.includes(email)) {
      toast.error('Este email ya está agregado');
      return;
    }

    if (isCC) {
      setCcRecipients([...ccRecipients, email]);
      setNewCcEmail('');
    } else {
      setRecipients([...recipients, email]);
      setNewEmail('');
    }
  };

  const removeRecipient = (email: string, isCC = false) => {
    if (isCC) {
      setCcRecipients(ccRecipients.filter(r => r !== email));
    } else {
      setRecipients(recipients.filter(r => r !== email));
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Nunca';
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-28" />
        </div>
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-6 w-40" />
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const totalIssues = (status?.unassignedIssues.length || 0) + (status?.assignedIssues.length || 0);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Save className="h-8 w-8" />
            Alertas de Backups Atrasados
          </h1>
          <p className="text-muted-foreground">
            Notificaciones automáticas cuando se detectan backups vencidos en Producción
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadConfig(); loadStatus(); }}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingStatus ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Estado actual */}
      <Card className={status?.unassignedIssues.length ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5'}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Save className="h-5 w-5" />
            Estado Actual de Backups
            {loadingStatus && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${status?.unassignedIssues.length ? 'bg-destructive animate-pulse' : 'bg-success'}`} />
              <span className="font-medium">
                {status?.unassignedIssues.length
                  ? `${status.unassignedIssues.length} backup(s) atrasado(s) sin asignar`
                  : 'No hay backups pendientes de atención'
                }
              </span>
            </div>
            <Badge variant="outline">
              {totalIssues} total en Producción
            </Badge>
            {status?.assignedIssues.length ? (
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                {status.assignedIssues.length} con responsable asignado
              </Badge>
            ) : null}
          </div>

          {status?.unassignedIssues.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {status.unassignedIssues.slice(0, 10).map(issue => (
                <Badge key={issue.instanceName} variant="destructive" className="font-mono">
                  {issue.instanceName}
                  <span className="ml-1 text-xs opacity-75">
                    ({issue.fullBackupBreached && issue.logBackupBreached
                      ? "FULL+LOG"
                      : issue.fullBackupBreached ? "FULL" : "LOG"})
                  </span>
                </Badge>
              ))}
              {status.unassignedIssues.length > 10 && (
                <Badge variant="outline">+{status.unassignedIssues.length - 10} más</Badge>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Configuración */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-5 w-5" />
                  Configuración de Alerta
                </CardTitle>
                <CardDescription>
                  Define los intervalos, destinatarios y copia
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {canConfigureAlerts ? (
                  <>
                    <Label htmlFor="enabled" className="text-sm">
                      {isEnabled ? 'Activa' : 'Inactiva'}
                    </Label>
                    <Switch
                      id="enabled"
                      checked={isEnabled}
                      onCheckedChange={handleToggle}
                    />
                  </>
                ) : (
                  <Badge variant="outline">
                    <Lock className="h-3 w-3 mr-1" />
                    Solo lectura
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Nombre de la Alerta</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alerta de Backups Atrasados"
                  disabled={!canConfigureAlerts}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción..."
                  disabled={!canConfigureAlerts}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="checkInterval">
                  <Clock className="h-4 w-4 inline mr-1" />
                  Intervalo de Verificación
                </Label>
                <Select
                  value={checkIntervalMinutes.toString()}
                  onValueChange={(v) => setCheckIntervalMinutes(parseInt(v))}
                  disabled={!canConfigureAlerts}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {checkIntervalOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cada cuánto se verifican los backups atrasados
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alertInterval">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Intervalo de Alertas
                </Label>
                <Select
                  value={alertIntervalMinutes.toString()}
                  onValueChange={(v) => setAlertIntervalMinutes(parseInt(v))}
                  disabled={!canConfigureAlerts}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {alertIntervalOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Cada cuánto se envía email si siguen atrasados
                </p>
              </div>
            </div>

            <Separator />

            {/* Destinatarios TO */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Destinatarios (TO)
              </Label>

              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient(false))}
                  disabled={!canConfigureAlerts}
                />
                <Button type="button" variant="outline" onClick={() => addRecipient(false)} disabled={!canConfigureAlerts}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {recipients.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recipients.map(email => (
                    <Badge key={email} variant="secondary" className="py-1.5 px-3">
                      <Mail className="h-3 w-3 mr-1.5" />
                      {email}
                      {canConfigureAlerts && (
                        <button
                          type="button"
                          onClick={() => removeRecipient(email, false)}
                          className="ml-2 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay destinatarios configurados
                </p>
              )}
            </div>

            <Separator />

            {/* Destinatarios CC */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Copia (CC)
              </Label>
              <p className="text-xs text-muted-foreground">
                Estos destinatarios recibirán el mismo email en copia
              </p>

              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="copia@ejemplo.com"
                  value={newCcEmail}
                  onChange={(e) => setNewCcEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient(true))}
                  disabled={!canConfigureAlerts}
                />
                <Button type="button" variant="outline" onClick={() => addRecipient(true)} disabled={!canConfigureAlerts}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {ccRecipients.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {ccRecipients.map(email => (
                    <Badge key={email} variant="outline" className="py-1.5 px-3">
                      <UserPlus className="h-3 w-3 mr-1.5" />
                      {email}
                      {canConfigureAlerts && (
                        <button
                          type="button"
                          onClick={() => removeRecipient(email, true)}
                          className="ml-2 hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No hay destinatarios en copia
                </p>
              )}
            </div>

            <Separator />

            {canConfigureAlerts ? (
              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Configuración'
                )}
              </Button>
            ) : (
              <Alert>
                <Lock className="h-4 w-4" />
                <AlertDescription>
                  Solo lectura. No tienes permisos para modificar esta configuración.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Panel lateral */}
        <div className="space-y-6">
          {/* Acciones rápidas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-5 w-5" />
                Acciones
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {canConfigureAlerts ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleTest}
                    disabled={testing || recipients.length === 0}
                  >
                    {testing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Enviar Email de Prueba
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={handleRunNow}
                    disabled={running || !isEnabled}
                  >
                    {running ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    Ejecutar Verificación Ahora
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-2">
                  <Lock className="h-4 w-4 inline mr-1" />
                  Requiere permisos
                </p>
              )}

              {!isEnabled && (
                <Alert>
                  <Bell className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Activa la alerta para ejecutar verificaciones
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Info de estado */}
          {config && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Estado del Servicio
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge variant={config.isEnabled ? 'default' : 'secondary'}>
                    {config.isEnabled ? 'Activa' : 'Inactiva'}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última verificación:</span>
                  <span className="font-mono text-xs">{formatDate(config.lastRunAt)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Última alerta:</span>
                  <span className="font-mono text-xs">{formatDate(config.lastAlertSentAt)}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Historial de alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Alertas Enviadas
          </CardTitle>
          <CardDescription>
            Últimas 10 alertas enviadas por el sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay alertas enviadas aún</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Instancias Afectadas</TableHead>
                  <TableHead>Destinatarios</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="font-mono text-xs">
                      {formatDate(h.sentAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {h.instancesAffected.slice(0, 3).map(inst => (
                          <Badge key={inst} variant="destructive" className="font-mono text-xs">
                            {inst}
                          </Badge>
                        ))}
                        {h.instancesAffected.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{h.instancesAffected.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {h.recipientCount} TO
                        {h.ccCount > 0 && `, ${h.ccCount} CC`}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {h.success ? (
                        <Badge variant="default" className="bg-success text-success-foreground">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Enviado
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="h-3 w-3 mr-1" />
                          Error
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info adicional */}
      <Alert>
        <Bell className="h-4 w-4" />
        <AlertDescription>
          <strong>Funcionamiento:</strong> El sistema verifica periódicamente los backups atrasados del Overview.
          Solo genera alertas para instancias de <strong>Producción</strong> que <strong>no tengan un responsable asignado</strong>.
          <br /><br />
          <strong>Para dejar de recibir alertas</strong> sobre una instancia específica, asigna un responsable desde el panel de Overview.
          Esto permite que el equipo sepa quién está trabajando en el problema y evita alertas redundantes.
        </AlertDescription>
      </Alert>
    </div>
  );
}
