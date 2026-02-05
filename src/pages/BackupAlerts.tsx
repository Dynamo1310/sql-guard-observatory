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
  UserPlus,
  Database,
  FileText
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  backupAlertsApi,
  BackupAlertConfigDto,
  BackupAlertHistoryDto,
  BackupAlertStatusDto,
  BackupAlertType
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

// Estado por tipo de alerta
interface AlertTypeState {
  config: BackupAlertConfigDto | null;
  history: BackupAlertHistoryDto[];
  name: string;
  description: string;
  isEnabled: boolean;
  checkIntervalMinutes: number;
  alertIntervalMinutes: number;
  recipients: string[];
  ccRecipients: string[];
  newEmail: string;
  newCcEmail: string;
  saving: boolean;
  testing: boolean;
  running: boolean;
}

const createInitialState = (alertType: BackupAlertType): AlertTypeState => ({
  config: null,
  history: [],
  name: alertType === 'full' ? 'Alerta de Backups FULL Atrasados' : 'Alerta de Backups LOG Atrasados',
  description: alertType === 'full'
    ? 'Alerta automática cuando se detectan backups FULL vencidos'
    : 'Alerta automática cuando se detectan backups LOG vencidos',
  isEnabled: false,
  checkIntervalMinutes: 60,
  alertIntervalMinutes: 240,
  recipients: [],
  ccRecipients: [],
  newEmail: '',
  newCcEmail: '',
  saving: false,
  testing: false,
  running: false,
});

export default function BackupAlerts() {
  const { hasCapability } = useAuth();
  const canConfigureAlerts = hasCapability(Capabilities.SystemConfigureAlerts);

  const [fullState, setFullState] = useState<AlertTypeState>(createInitialState('full'));
  const [logState, setLogState] = useState<AlertTypeState>(createInitialState('log'));
  const [status, setStatus] = useState<BackupAlertStatusDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [historyTab, setHistoryTab] = useState<BackupAlertType>('full');

  const loadConfigForType = useCallback(async (type: BackupAlertType, setState: React.Dispatch<React.SetStateAction<AlertTypeState>>) => {
    try {
      const [configData, historyData] = await Promise.all([
        backupAlertsApi.getConfig(type),
        backupAlertsApi.getHistory(type, 10),
      ]);

      setState(prev => ({
        ...prev,
        config: configData,
        history: historyData,
        name: configData?.name || prev.name,
        description: configData?.description || prev.description,
        isEnabled: configData?.isEnabled || false,
        checkIntervalMinutes: configData?.checkIntervalMinutes || 60,
        alertIntervalMinutes: configData?.alertIntervalMinutes || 240,
        recipients: configData?.recipients || [],
        ccRecipients: configData?.ccRecipients || [],
      }));
    } catch (err: any) {
      console.error(`Error loading ${type} config:`, err);
    }
  }, []);

  const loadAllConfigs = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadConfigForType('full', setFullState),
      loadConfigForType('log', setLogState),
    ]);
    setLoading(false);
  }, [loadConfigForType]);

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
    loadAllConfigs();
    loadStatus();
  }, [loadAllConfigs, loadStatus]);

  const handleSave = async (type: BackupAlertType) => {
    const state = type === 'full' ? fullState : logState;
    const setState = type === 'full' ? setFullState : setLogState;

    if (!state.name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (state.recipients.length === 0) {
      toast.error('Agrega al menos un destinatario');
      return;
    }

    try {
      setState(prev => ({ ...prev, saving: true }));

      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || undefined,
        isEnabled: state.isEnabled,
        checkIntervalMinutes: state.checkIntervalMinutes,
        alertIntervalMinutes: state.alertIntervalMinutes,
        recipients: state.recipients,
        ccRecipients: state.ccRecipients,
      };

      const result = await backupAlertsApi.updateConfig(type, payload);
      setState(prev => ({ ...prev, config: result }));
      toast.success(`Configuración de ${type.toUpperCase()} guardada correctamente`);
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setState(prev => ({ ...prev, saving: false }));
    }
  };

  const handleToggle = async (type: BackupAlertType, enabled: boolean) => {
    const setState = type === 'full' ? setFullState : setLogState;

    setState(prev => ({ ...prev, isEnabled: enabled }));

    try {
      const result = await backupAlertsApi.updateConfig(type, { isEnabled: enabled });
      setState(prev => ({ ...prev, config: result }));
      toast.success(`Alerta ${type.toUpperCase()} ${enabled ? 'activada' : 'desactivada'}`);
    } catch (err: any) {
      setState(prev => ({ ...prev, isEnabled: !enabled }));
      toast.error('Error: ' + err.message);
    }
  };

  const handleTest = async (type: BackupAlertType) => {
    const setState = type === 'full' ? setFullState : setLogState;

    try {
      setState(prev => ({ ...prev, testing: true }));
      const result = await backupAlertsApi.testAlert(type);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setState(prev => ({ ...prev, testing: false }));
    }
  };

  const handleRunNow = async (type: BackupAlertType) => {
    const setState = type === 'full' ? setFullState : setLogState;

    try {
      setState(prev => ({ ...prev, running: true }));
      const result = await backupAlertsApi.runNow(type);
      if (result.success) {
        toast.success(result.message);
        await loadConfigForType(type, setState);
        await loadStatus();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setState(prev => ({ ...prev, running: false }));
    }
  };

  const addRecipient = (type: BackupAlertType, isCC = false) => {
    const state = type === 'full' ? fullState : logState;
    const setState = type === 'full' ? setFullState : setLogState;
    const email = (isCC ? state.newCcEmail : state.newEmail).trim().toLowerCase();

    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email inválido');
      return;
    }

    const list = isCC ? state.ccRecipients : state.recipients;
    if (list.includes(email)) {
      toast.error('Este email ya está agregado');
      return;
    }

    if (isCC) {
      setState(prev => ({ ...prev, ccRecipients: [...prev.ccRecipients, email], newCcEmail: '' }));
    } else {
      setState(prev => ({ ...prev, recipients: [...prev.recipients, email], newEmail: '' }));
    }
  };

  const removeRecipient = (type: BackupAlertType, email: string, isCC = false) => {
    const setState = type === 'full' ? setFullState : setLogState;
    if (isCC) {
      setState(prev => ({ ...prev, ccRecipients: prev.ccRecipients.filter(r => r !== email) }));
    } else {
      setState(prev => ({ ...prev, recipients: prev.recipients.filter(r => r !== email) }));
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

  // Componente reutilizable para la configuración de un tipo de alerta
  const AlertTypeConfig = ({ type, state, setState }: {
    type: BackupAlertType;
    state: AlertTypeState;
    setState: React.Dispatch<React.SetStateAction<AlertTypeState>>;
  }) => {
    const typeName = type === 'full' ? 'FULL' : 'LOG';
    const TypeIcon = type === 'full' ? Database : FileText;

    return (
      <div className="space-y-4">
        {/* Header con switch */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Alerta de Backups {typeName}</span>
          </div>
          <div className="flex items-center gap-2">
            {canConfigureAlerts ? (
              <>
                <Label htmlFor={`enabled-${type}`} className="text-sm">
                  {state.isEnabled ? 'Activa' : 'Inactiva'}
                </Label>
                <Switch
                  id={`enabled-${type}`}
                  checked={state.isEnabled}
                  onCheckedChange={(v) => handleToggle(type, v)}
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
              value={state.checkIntervalMinutes.toString()}
              onValueChange={(v) => setState(prev => ({ ...prev, checkIntervalMinutes: parseInt(v) }))}
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
              Cada cuánto se verifican los backups {typeName}
            </p>
          </div>

          <div className="space-y-2">
            <Label>
              <Mail className="h-4 w-4 inline mr-1" />
              Intervalo de Alertas
            </Label>
            <Select
              value={state.alertIntervalMinutes.toString()}
              onValueChange={(v) => setState(prev => ({ ...prev, alertIntervalMinutes: parseInt(v) }))}
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
              value={state.newEmail}
              onChange={(e) => setState(prev => ({ ...prev, newEmail: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient(type, false))}
              disabled={!canConfigureAlerts}
            />
            <Button type="button" variant="outline" onClick={() => addRecipient(type, false)} disabled={!canConfigureAlerts}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {state.recipients.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {state.recipients.map(email => (
                <Badge key={email} variant="secondary" className="py-1.5 px-3">
                  <Mail className="h-3 w-3 mr-1.5" />
                  {email}
                  {canConfigureAlerts && (
                    <button
                      type="button"
                      onClick={() => removeRecipient(type, email, false)}
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
              value={state.newCcEmail}
              onChange={(e) => setState(prev => ({ ...prev, newCcEmail: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient(type, true))}
              disabled={!canConfigureAlerts}
            />
            <Button type="button" variant="outline" onClick={() => addRecipient(type, true)} disabled={!canConfigureAlerts}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {state.ccRecipients.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {state.ccRecipients.map(email => (
                <Badge key={email} variant="outline" className="py-1.5 px-3">
                  <UserPlus className="h-3 w-3 mr-1.5" />
                  {email}
                  {canConfigureAlerts && (
                    <button
                      type="button"
                      onClick={() => removeRecipient(type, email, true)}
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
              <Button onClick={() => handleSave(type)} disabled={state.saving}>
                {state.saving ? (
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
                onClick={() => handleTest(type)}
                disabled={state.testing || state.recipients.length === 0}
              >
                {state.testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar Prueba
              </Button>

              <Button
                variant="outline"
                onClick={() => handleRunNow(type)}
                disabled={state.running || !state.isEnabled}
              >
                {state.running ? (
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
        {state.config && (
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>Última verificación:</span>
              <span className="font-mono text-xs">{formatDate(state.config.lastRunAt)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              <span>Última alerta:</span>
              <span className="font-mono text-xs">{formatDate(state.config.lastAlertSentAt)}</span>
            </div>
          </div>
        )}
      </div>
    );
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

  const totalIssues = (status?.unassignedIssues.length || 0) + (status?.assignedIssues.length || 0);
  const fullHistory = fullState.history;
  const logHistory = logState.history;

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
            Notificaciones automáticas para backups FULL y LOG vencidos en Producción
          </p>
        </div>
        <Button variant="outline" onClick={() => { loadAllConfigs(); loadStatus(); }}>
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

      {/* Configuración con Accordion */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Configuración de Alertas
          </CardTitle>
          <CardDescription>
            Configura las alertas de FULL y LOG de forma independiente
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" defaultValue={['full', 'log']} className="w-full">
            <AccordionItem value="full">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <Database className="h-5 w-5 text-blue-500" />
                  <span className="font-semibold">Backups FULL (Completos)</span>
                  <Badge variant={fullState.isEnabled ? 'default' : 'secondary'} className="ml-2">
                    {fullState.isEnabled ? 'Activa' : 'Inactiva'}
                  </Badge>
                  {fullState.recipients.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {fullState.recipients.length} destinatarios
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <AlertTypeConfig type="full" state={fullState} setState={setFullState} />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="log">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-amber-500" />
                  <span className="font-semibold">Backups LOG (Transaccionales)</span>
                  <Badge variant={logState.isEnabled ? 'default' : 'secondary'} className="ml-2">
                    {logState.isEnabled ? 'Activa' : 'Inactiva'}
                  </Badge>
                  {logState.recipients.length > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {logState.recipients.length} destinatarios
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-4">
                <AlertTypeConfig type="log" state={logState} setState={setLogState} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* Historial de alertas con Tabs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Alertas Enviadas
          </CardTitle>
          <CardDescription>
            Últimas alertas enviadas para cada tipo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={historyTab} onValueChange={(v) => setHistoryTab(v as BackupAlertType)}>
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="full" className="flex items-center gap-2">
                <Database className="h-4 w-4" />
                FULL ({fullHistory.length})
              </TabsTrigger>
              <TabsTrigger value="log" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                LOG ({logHistory.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="full">
              {fullHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No hay alertas FULL enviadas aún</p>
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
                    {fullHistory.map((h) => (
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
            </TabsContent>

            <TabsContent value="log">
              {logHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>No hay alertas LOG enviadas aún</p>
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
                    {logHistory.map((h) => (
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info adicional */}
      <Alert>
        <Bell className="h-4 w-4" />
        <AlertDescription>
          <strong>Funcionamiento:</strong> El sistema verifica periódicamente los backups atrasados del Overview.
          Las alertas de <strong>FULL</strong> y <strong>LOG</strong> son independientes: cada una puede tener sus propios destinatarios, intervalos y configuración.
          <br /><br />
          <strong>Importante:</strong> Las alertas de LOG se suprimen automáticamente mientras haya un backup FULL en ejecución en la instancia,
          evitando falsos positivos durante ventanas de mantenimiento.
          <br /><br />
          <strong>Para dejar de recibir alertas</strong> sobre una instancia específica, asigna un responsable desde el panel de Overview.
        </AlertDescription>
      </Alert>
    </div>
  );
}
