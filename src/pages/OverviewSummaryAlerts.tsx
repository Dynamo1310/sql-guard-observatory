import { useState, useEffect, useCallback } from 'react';
import { 
  Bell, 
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
  Calendar,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
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
  overviewSummaryAlertsApi, 
  OverviewSummaryAlertConfigDto, 
  OverviewSummaryAlertHistoryDto,
  OverviewSummaryAlertScheduleDto,
  OverviewSummaryDataDto
} from '@/services/api';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom', fullLabel: 'Domingo' },
  { value: 1, label: 'Lun', fullLabel: 'Lunes' },
  { value: 2, label: 'Mar', fullLabel: 'Martes' },
  { value: 3, label: 'Mié', fullLabel: 'Miércoles' },
  { value: 4, label: 'Jue', fullLabel: 'Jueves' },
  { value: 5, label: 'Vie', fullLabel: 'Viernes' },
  { value: 6, label: 'Sáb', fullLabel: 'Sábado' },
];

export default function OverviewSummaryAlerts() {
  const [config, setConfig] = useState<OverviewSummaryAlertConfigDto | null>(null);
  const [history, setHistory] = useState<OverviewSummaryAlertHistoryDto[]>([]);
  const [preview, setPreview] = useState<OverviewSummaryDataDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  // Form state
  const [name, setName] = useState('Alerta Resumen Overview');
  const [description, setDescription] = useState('Envía un resumen del estado de la plataforma productiva por email');
  const [isEnabled, setIsEnabled] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  
  // Schedule form state
  const [newScheduleTime, setNewScheduleTime] = useState('08:00');
  const [newScheduleDays, setNewScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [configData, historyData] = await Promise.all([
        overviewSummaryAlertsApi.getConfig(),
        overviewSummaryAlertsApi.getHistory(10),
      ]);

      if (configData) {
        setConfig(configData);
        setName(configData.name);
        setDescription(configData.description || '');
        setIsEnabled(configData.isEnabled);
        setRecipients(configData.recipients || []);
      }
      setHistory(historyData);
    } catch (err: any) {
      console.error('Error loading config:', err);
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPreview = async () => {
    try {
      setLoadingPreview(true);
      const data = await overviewSummaryAlertsApi.getPreview();
      setPreview(data);
    } catch (err: any) {
      console.error('Error loading preview:', err);
      toast.error('Error al cargar preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

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
      
      const result = await overviewSummaryAlertsApi.updateConfig({
        name: name.trim(),
        description: description.trim() || undefined,
        isEnabled,
        recipients,
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
      const result = await overviewSummaryAlertsApi.updateConfig({ isEnabled: enabled });
      setConfig(result);
      toast.success(enabled ? 'Alerta activada' : 'Alerta desactivada');
    } catch (err: any) {
      setIsEnabled(!enabled);
      toast.error('Error: ' + err.message);
    }
  };

  const handleAddSchedule = async () => {
    if (!newScheduleTime) {
      toast.error('Selecciona una hora');
      return;
    }
    if (newScheduleDays.length === 0) {
      toast.error('Selecciona al menos un día');
      return;
    }

    try {
      const schedule = await overviewSummaryAlertsApi.addSchedule({
        timeOfDay: newScheduleTime,
        isEnabled: true,
        daysOfWeek: newScheduleDays,
      });
      
      if (config) {
        setConfig({
          ...config,
          schedules: [...(config.schedules || []), schedule],
        });
      }
      
      setNewScheduleTime('08:00');
      setNewScheduleDays([1, 2, 3, 4, 5]);
      toast.success('Horario agregado');
    } catch (err: any) {
      toast.error('Error al agregar horario: ' + err.message);
    }
  };

  const handleDeleteSchedule = async (id: number) => {
    try {
      await overviewSummaryAlertsApi.deleteSchedule(id);
      
      if (config) {
        setConfig({
          ...config,
          schedules: config.schedules.filter(s => s.id !== id),
        });
      }
      
      toast.success('Horario eliminado');
    } catch (err: any) {
      toast.error('Error al eliminar horario: ' + err.message);
    }
  };

  const handleToggleSchedule = async (schedule: OverviewSummaryAlertScheduleDto) => {
    try {
      const updated = await overviewSummaryAlertsApi.updateSchedule(schedule.id, {
        isEnabled: !schedule.isEnabled,
      });
      
      if (config) {
        setConfig({
          ...config,
          schedules: config.schedules.map(s => s.id === schedule.id ? updated : s),
        });
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      const result = await overviewSummaryAlertsApi.sendTestEmail();
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
      const result = await overviewSummaryAlertsApi.runNow();
      if (result.success) {
        toast.success(result.message);
        await loadConfig();
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setRunning(false);
    }
  };

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Email inválido');
      return;
    }

    if (recipients.includes(email)) {
      toast.error('Este email ya está agregado');
      return;
    }

    setRecipients([...recipients, email]);
    setNewEmail('');
  };

  const removeRecipient = (email: string) => {
    setRecipients(recipients.filter(r => r !== email));
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

  const getDaysLabel = (days: number[]) => {
    if (days.length === 7) return 'Todos los días';
    if (days.length === 5 && days.every(d => d >= 1 && d <= 5)) return 'Lunes a Viernes';
    if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Fines de semana';
    return days.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.label).join(', ');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bell className="h-8 w-8 text-blue-500" />
            Resumen Overview Programado
          </h1>
          <p className="text-muted-foreground mt-2">
            Envía automáticamente un resumen del estado de producción por email en los horarios configurados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadConfig}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Preview del estado actual */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="h-5 w-5" />
            Vista Previa del Resumen
            {loadingPreview && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {preview ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-background rounded-lg">
                <div className="text-2xl font-bold text-primary">{preview.averageHealthScore}</div>
                <div className="text-xs text-muted-foreground">Score Promedio</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <div className="text-2xl font-bold text-green-500">{preview.healthyCount}</div>
                <div className="text-xs text-muted-foreground">Healthy</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <div className="text-2xl font-bold text-yellow-500">{preview.warningCount}</div>
                <div className="text-xs text-muted-foreground">Warning</div>
              </div>
              <div className="text-center p-3 bg-background rounded-lg">
                <div className="text-2xl font-bold text-red-500">{preview.criticalCount}</div>
                <div className="text-xs text-muted-foreground">Críticas</div>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={loadPreview} disabled={loadingPreview}>
              {loadingPreview ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Cargar Preview
            </Button>
          )}
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
                  Configuración
                </CardTitle>
                <CardDescription>
                  Define los horarios y destinatarios del resumen
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="enabled" className="text-sm">
                  {isEnabled ? 'Activa' : 'Inactiva'}
                </Label>
                <Switch
                  id="enabled"
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                />
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
                  placeholder="Alerta Resumen Overview"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descripción (opcional)</Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descripción..."
                />
              </div>
            </div>

            <Separator />

            {/* Horarios programados */}
            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Horarios de Envío
              </Label>
              
              {/* Lista de schedules existentes */}
              {config?.schedules && config.schedules.length > 0 ? (
                <div className="space-y-2">
                  {config.schedules.map(schedule => (
                    <div 
                      key={schedule.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        schedule.isEnabled ? 'bg-background' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={schedule.isEnabled}
                          onCheckedChange={() => handleToggleSchedule(schedule)}
                        />
                        <div>
                          <div className="font-mono font-medium">{schedule.timeOfDay}</div>
                          <div className="text-xs text-muted-foreground">
                            {getDaysLabel(schedule.daysOfWeek)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {schedule.lastSentAt && (
                          <span className="text-xs text-muted-foreground">
                            Último: {formatDate(schedule.lastSentAt)}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteSchedule(schedule.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Alert>
                  <Calendar className="h-4 w-4" />
                  <AlertDescription>
                    No hay horarios configurados. Agrega al menos uno para que se envíen los resúmenes automáticamente.
                  </AlertDescription>
                </Alert>
              )}

              {/* Agregar nuevo schedule */}
              <div className="p-3 border border-dashed rounded-lg space-y-3">
                <Label className="text-sm font-medium">Agregar nuevo horario</Label>
                <div className="flex gap-3 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Hora</Label>
                    <Input
                      type="time"
                      value={newScheduleTime}
                      onChange={(e) => setNewScheduleTime(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  <Button onClick={handleAddSchedule} variant="outline">
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => {
                        if (newScheduleDays.includes(day.value)) {
                          setNewScheduleDays(newScheduleDays.filter(d => d !== day.value));
                        } else {
                          setNewScheduleDays([...newScheduleDays, day.value].sort());
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        newScheduleDays.includes(day.value)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* Destinatarios */}
            <div className="space-y-3">
              <Label>Destinatarios del Email</Label>
              
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
                />
                <Button type="button" variant="outline" onClick={addRecipient}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {recipients.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {recipients.map(email => (
                    <Badge key={email} variant="secondary" className="py-1.5 px-3">
                      <Mail className="h-3 w-3 mr-1.5" />
                      {email}
                      <button
                        type="button"
                        onClick={() => removeRecipient(email)}
                        className="ml-2 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
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
                disabled={running || recipients.length === 0}
              >
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Ejecutar Ahora
              </Button>

              {recipients.length === 0 && (
                <Alert>
                  <Mail className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Agrega destinatarios para poder enviar emails
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
                  <span className="text-muted-foreground">Horarios:</span>
                  <span>{config.schedules?.length || 0} configurados</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Destinatarios:</span>
                  <span>{config.recipients?.length || 0}</span>
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
            Historial de Envíos
          </CardTitle>
          <CardDescription>
            Últimos 10 resúmenes enviados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay resúmenes enviados aún</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horario</TableHead>
                  <TableHead>Tipo</TableHead>
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
                      {h.scheduleTime ? (
                        <Badge variant="outline" className="font-mono">
                          {h.scheduleTime}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          h.triggerType === 'Scheduled' ? 'default' :
                          h.triggerType === 'Manual' ? 'secondary' :
                          'outline'
                        }
                      >
                        {h.triggerType === 'Scheduled' ? 'Programado' :
                         h.triggerType === 'Manual' ? 'Manual' : 'Prueba'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{h.recipientCount} emails</Badge>
                    </TableCell>
                    <TableCell>
                      {h.success ? (
                        <Badge variant="default" className="bg-green-500">
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
          <strong>¿Cómo funciona?</strong> El sistema envía un email con el resumen del estado de producción 
          (Health Score, instancias críticas, backups atrasados, discos críticos y mantenimiento vencido) 
          en los horarios que configures.
          <br /><br />
          <strong>Ideal para:</strong> Recibir un resumen del estado de la plataforma productiva fuera del horario laboral, 
          por ejemplo a las 08:00, 14:00 y 20:00.
        </AlertDescription>
      </Alert>
    </div>
  );
}

