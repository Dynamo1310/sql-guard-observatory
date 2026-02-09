import { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  HardDrive,
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
  Save,
  UserPlus,
  Users
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
  diskAlertsApi,
  DiskAlertConfigDto,
  DiskAlertHistoryDto,
  DiskAlertStatusDto,
} from '@/services/api';

const checkIntervalOptions = [
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
];

const alertIntervalOptions = [
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
  { value: 480, label: '8 horas' },
  { value: 720, label: '12 horas' },
  { value: 1440, label: '24 horas' },
];

export default function DiskAlerts() {
  const { hasCapability } = useAuth();
  const canConfigureAlerts = hasCapability(Capabilities.SystemConfigureAlerts);

  const [config, setConfig] = useState<DiskAlertConfigDto | null>(null);
  const [history, setHistory] = useState<DiskAlertHistoryDto[]>([]);
  const [status, setStatus] = useState<DiskAlertStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);

  // Form state
  const [name, setName] = useState('Alerta de Discos Críticos');
  const [description, setDescription] = useState('');
  const [isEnabled, setIsEnabled] = useState(false);
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(60);
  const [alertIntervalMinutes, setAlertIntervalMinutes] = useState(240);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [ccRecipients, setCcRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newCcEmail, setNewCcEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const [configData, historyData] = await Promise.all([
        diskAlertsApi.getConfig(),
        diskAlertsApi.getHistory(10),
      ]);

      setConfig(configData);
      setHistory(historyData);
      setName(configData?.name || 'Alerta de Discos Críticos');
      setDescription(configData?.description || '');
      setIsEnabled(configData?.isEnabled || false);
      setCheckIntervalMinutes(configData?.checkIntervalMinutes || 60);
      setAlertIntervalMinutes(configData?.alertIntervalMinutes || 240);
      setRecipients(configData?.recipients || []);
      setCcRecipients(configData?.ccRecipients || []);
    } catch (err: any) {
      console.error('Error loading disk alert config:', err);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const data = await diskAlertsApi.getStatus();
      setStatus(data);
    } catch (err: any) {
      console.error('Error loading disk status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadStatus()]);
      setLoading(false);
    };
    init();
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
      const result = await diskAlertsApi.updateConfig({
        name: name.trim(),
        description: description.trim() || undefined,
        isEnabled,
        checkIntervalMinutes,
        alertIntervalMinutes,
        recipients,
        ccRecipients,
      });
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
    try {
      const result = await diskAlertsApi.updateConfig({ isEnabled: enabled });
      setConfig(result);
      toast.success(`Alerta de discos ${enabled ? 'activada' : 'desactivada'}`);
    } catch (err: any) {
      setIsEnabled(!enabled);
      toast.error('Error: ' + err.message);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      const result = await diskAlertsApi.testAlert();
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
      const result = await diskAlertsApi.runNow();
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
      setCcRecipients(prev => [...prev, email]);
      setNewCcEmail('');
    } else {
      setRecipients(prev => [...prev, email]);
      setNewEmail('');
    }
  };

  const removeRecipient = (email: string, isCC = false) => {
    if (isCC) {
      setCcRecipients(prev => prev.filter(r => r !== email));
    } else {
      setRecipients(prev => prev.filter(r => r !== email));
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
          <CardHeader>
            <Skeleton className="h-6 w-56" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <HardDrive className="h-8 w-8" />
            Alertas de Discos Críticos
          </h1>
          <p className="text-muted-foreground">
            Notificaciones automáticas para discos con espacio crítico en Producción
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadConfig(); loadStatus(); }}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loadingStatus ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Estado actual */}
      <Card className={status?.unassignedDisks.length ? 'border-destructive/30 bg-destructive/5' : 'border-success/30 bg-success/5'}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <HardDrive className="h-5 w-5" />
            Estado Actual de Discos
            {loadingStatus && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${status?.unassignedDisks.length ? 'bg-destructive animate-pulse' : 'bg-success'}`} />
              <span className="font-medium">
                {status?.unassignedDisks.length
                  ? `${status.unassignedDisks.length} disco(s) crítico(s) sin asignar`
                  : 'No hay discos críticos pendientes de atención'
                }
              </span>
            </div>
            <Badge variant="outline">
              {status?.totalCriticalDisks ?? 0} total en Producción
            </Badge>
            {status?.assignedDisks.length ? (
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                {status.assignedDisks.length} con responsable asignado
              </Badge>
            ) : null}
          </div>

          {/* Tabla de discos sin asignar */}
          {status?.unassignedDisks.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-destructive mb-2">Sin asignar (generan alerta por email):</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Disco</TableHead>
                    <TableHead>% Libre</TableHead>
                    <TableHead>GB Libre</TableHead>
                    <TableHead>Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.unassignedDisks.slice(0, 15).map((disk, idx) => (
                    <TableRow key={`unassigned-${disk.instanceName}-${disk.drive}-${idx}`}>
                      <TableCell className="font-mono text-sm">{disk.instanceName}</TableCell>
                      <TableCell className="font-mono">{disk.drive}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="font-mono">
                          {disk.porcentajeLibre.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{disk.libreGB.toFixed(1)} GB</TableCell>
                      <TableCell>
                        {disk.isCriticalSystemDisk && (
                          <Badge variant="outline" className="text-xs">Sistema</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {status.unassignedDisks.length > 15 && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  ... y {status.unassignedDisks.length - 15} disco(s) más
                </p>
              )}
            </div>
          ) : null}

          {/* Tabla de discos asignados */}
          {status?.assignedDisks.length ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Con responsable asignado (no generan alerta):</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Disco</TableHead>
                    <TableHead>% Libre</TableHead>
                    <TableHead>GB Libre</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Asignado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {status.assignedDisks.map((disk, idx) => (
                    <TableRow key={`assigned-${disk.instanceName}-${disk.drive}-${idx}`} className="opacity-70">
                      <TableCell className="font-mono text-sm">{disk.instanceName}</TableCell>
                      <TableCell className="font-mono">{disk.drive}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {disk.porcentajeLibre.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{disk.libreGB.toFixed(1)} GB</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          {disk.assignedToUserName}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{disk.assignedAt}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Configuración */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configuración de Alertas
          </CardTitle>
          <CardDescription>
            Configura el envío automático de alertas por email cuando se detecten discos críticos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Header con switch */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Alerta de Discos Críticos</span>
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

          {/* Intervalos */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>
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
                Cada cuánto se verifican los discos críticos
              </p>
            </div>

            <div className="space-y-2">
              <Label>
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
                Cada cuánto se envía email si siguen en estado crítico
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

          {/* Acciones */}
          <div className="flex flex-wrap gap-2">
            {canConfigureAlerts && (
              <>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Guardar
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={handleTest}
                  disabled={testing || recipients.length === 0}
                >
                  {testing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Enviar Prueba
                </Button>

                <Button
                  variant="outline"
                  onClick={handleRunNow}
                  disabled={running || !isEnabled}
                >
                  {running ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Ejecutar Ahora
                </Button>
              </>
            )}
          </div>

          {/* Estado del servicio */}
          {config && (
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Última verificación:</span>
                <span className="font-mono text-xs">{formatDate(config.lastRunAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail className="h-3 w-3" />
                <span>Última alerta:</span>
                <span className="font-mono text-xs">{formatDate(config.lastAlertSentAt)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historial de alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Alertas Enviadas
          </CardTitle>
          <CardDescription>
            Últimas alertas de discos críticos enviadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HardDrive className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay alertas de discos enviadas aún</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Discos Críticos</TableHead>
                  <TableHead>Discos Afectados</TableHead>
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
                      <Badge variant="destructive">{h.criticalDiskCount}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {h.disksAffected.slice(0, 3).map((disk, idx) => (
                          <Badge key={`${disk}-${idx}`} variant="outline" className="font-mono text-xs">
                            {disk.replace('|', ' ')}
                          </Badge>
                        ))}
                        {h.disksAffected.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{h.disksAffected.length - 3}
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
          <strong>Funcionamiento:</strong> El sistema verifica periódicamente los discos de las instancias de Producción.
          Se alerta cuando un disco tiene menos del 10% de espacio libre y cumple alguna de estas condiciones:
          tiene archivos SQL con growth habilitado, es un disco de logs, o es un disco crítico del sistema (C, E, F, G, H).
          <br /><br />
          <strong>Discos del sistema:</strong> C:\ (Sistema Operativo), E:\ (Motor SQL), F:\ (TempDB Data), G:\ (TempDB Log), H:\ (Log de usuario)
          siempre generan alerta cuando bajan del 10% de espacio libre.
          <br /><br />
          <strong>Para dejar de recibir alertas</strong> sobre un disco específico, asigna un responsable desde el panel de Overview.
          Los discos con responsable asignado no generan alerta por email.
        </AlertDescription>
      </Alert>
    </div>
  );
}
