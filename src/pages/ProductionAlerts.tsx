import { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Bell, 
  Server, 
  Mail, 
  Clock, 
  Play, 
  Loader2, 
  Plus, 
  Trash2, 
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Wifi,
  WifiOff,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  productionAlertsApi, 
  ProductionAlertConfigDto, 
  ProductionAlertHistoryDto,
  inventoryApi,
  InventoryInstanceDto,
  InstanceConnectionStatus
} from '@/services/api';

const checkIntervalOptions = [
  { value: 1, label: '1 minuto' },
  { value: 2, label: '2 minutos' },
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
];

const alertIntervalOptions = [
  { value: 1, label: '1 minuto' },
  { value: 2, label: '2 minutos' },
  { value: 5, label: '5 minutos' },
  { value: 10, label: '10 minutos' },
  { value: 15, label: '15 minutos' },
  { value: 30, label: '30 minutos' },
  { value: 60, label: '1 hora' },
  { value: 120, label: '2 horas' },
  { value: 240, label: '4 horas' },
];

const failedChecksOptions = [
  { value: 1, label: '1 intento (inmediato)' },
  { value: 2, label: '2 intentos' },
  { value: 3, label: '3 intentos' },
  { value: 4, label: '4 intentos' },
  { value: 5, label: '5 intentos' },
  { value: 6, label: '6 intentos' },
  { value: 10, label: '10 intentos' },
  { value: 15, label: '15 intentos' },
];

export default function ProductionAlerts() {
  const [config, setConfig] = useState<ProductionAlertConfigDto | null>(null);
  const [history, setHistory] = useState<ProductionAlertHistoryDto[]>([]);
  const [inventory, setInventory] = useState<InventoryInstanceDto[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<InstanceConnectionStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  // Form state
  const [name, setName] = useState('Alerta de Servidores Caídos');
  const [description, setDescription] = useState('Alerta automática cuando se detectan servidores sin respuesta');
  const [isEnabled, setIsEnabled] = useState(false);
  const [checkIntervalMinutes, setCheckIntervalMinutes] = useState(1);
  const [alertIntervalMinutes, setAlertIntervalMinutes] = useState(15);
  const [failedChecksBeforeAlert, setFailedChecksBeforeAlert] = useState(1);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [selectedAmbientes, setSelectedAmbientes] = useState<string[]>(['Produccion']);

  // Filtrar instancias: excluir AWS y DMZ, y solo ambientes seleccionados
  const filteredInstances = useMemo(() => {
    return inventory.filter(inst => 
      inst.hostingSite?.toLowerCase() !== 'aws' && 
      !inst.nombreInstancia?.toLowerCase().includes('dmz') &&
      selectedAmbientes.some(a => a.toLowerCase() === inst.ambiente?.toLowerCase())
    );
  }, [inventory, selectedAmbientes]);

  // Obtener estado de conexión por instancia
  const getConnectionStatusForInstance = useCallback((instanceName: string): InstanceConnectionStatus | undefined => {
    return connectionStatus.find(s => s.instanceName === instanceName);
  }, [connectionStatus]);

  // Contar instancias caídas
  const downInstances = useMemo(() => {
    return filteredInstances.filter(inst => {
      const status = getConnectionStatusForInstance(inst.nombreInstancia);
      return status && !status.isConnected;
    });
  }, [filteredInstances, getConnectionStatusForInstance]);

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [configData, historyData] = await Promise.all([
        productionAlertsApi.getConfig(),
        productionAlertsApi.getHistory(10),
      ]);

      if (configData) {
        setConfig(configData);
        setName(configData.name);
        setDescription(configData.description || '');
        setIsEnabled(configData.isEnabled);
        setCheckIntervalMinutes(configData.checkIntervalMinutes || 1);
        setAlertIntervalMinutes(configData.alertIntervalMinutes || 15);
        setFailedChecksBeforeAlert(configData.failedChecksBeforeAlert || 1);
        setRecipients(configData.recipients || []);
        setSelectedAmbientes(configData.ambientes || ['Produccion']);
      }
      setHistory(historyData);
    } catch (err: any) {
      console.error('Error loading config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadInventory = useCallback(async () => {
    try {
      setLoadingInventory(true);
      const data = await inventoryApi.getAll();
      setInventory(data);
    } catch (err: any) {
      console.error('Error loading inventory:', err);
      toast.error('Error al cargar inventario: ' + err.message);
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const loadConnectionStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const data = await productionAlertsApi.getConnectionStatus();
      setConnectionStatus(data);
    } catch (err: any) {
      console.error('Error loading status:', err);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadInventory();
    loadConnectionStatus();
  }, [loadConfig, loadInventory, loadConnectionStatus]);

  // Auto-refresh del estado cada 30 segundos
  useEffect(() => {
    const interval = setInterval(() => {
      loadConnectionStatus();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadConnectionStatus]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('El nombre es requerido');
      return;
    }

    if (recipients.length === 0) {
      toast.error('Agrega al menos un destinatario');
      return;
    }

    if (selectedAmbientes.length === 0) {
      toast.error('Selecciona al menos un ambiente');
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
        failedChecksBeforeAlert,
        recipients,
        ambientes: selectedAmbientes,
      };

      let result: ProductionAlertConfigDto;
      if (config) {
        result = await productionAlertsApi.updateConfig(payload);
      } else {
        result = await productionAlertsApi.createConfig({
          name: payload.name,
          description: payload.description,
          checkIntervalMinutes: payload.checkIntervalMinutes,
          alertIntervalMinutes: payload.alertIntervalMinutes,
          recipients: payload.recipients,
          ambientes: payload.ambientes,
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
    
    if (config) {
      try {
        const result = await productionAlertsApi.updateConfig({ isEnabled: enabled });
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
      const result = await productionAlertsApi.testAlert();
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
      const result = await productionAlertsApi.runNow();
      if (result.success) {
        toast.success(result.message);
        await loadConfig();
        await loadConnectionStatus();
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
            <Bell className="h-8 w-8 text-amber-500" />
            Alertas de Servidores Caídos
          </h1>
          <p className="text-muted-foreground mt-2">
            Monitoreo automático de conexión a instancias SQL Server (excluye AWS y DMZ)
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { loadInventory(); loadConnectionStatus(); }}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingInventory || loadingStatus ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Estado actual */}
      <Card className={downInstances.length > 0 ? 'border-red-500/50 bg-red-500/5' : 'border-green-500/50 bg-green-500/5'}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5" />
            Estado Actual de Conexiones
            {(loadingInventory || loadingStatus) && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${downInstances.length > 0 ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="font-medium">
                {downInstances.length > 0 
                  ? `${downInstances.length} servidor(es) sin conexión`
                  : 'Todas las conexiones OK'
                }
              </span>
            </div>
            <Badge variant="outline">
              <Filter className="h-3 w-3 mr-1" />
              {filteredInstances.length} instancias monitoreadas
            </Badge>
            <Badge variant="secondary">
              {inventory.length - filteredInstances.length} excluidas (AWS/DMZ)
            </Badge>
          </div>
          
          {downInstances.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {downInstances.map(inst => (
                <Badge key={inst.nombreInstancia} variant="destructive" className="font-mono">
                  <WifiOff className="h-3 w-3 mr-1" />
                  {inst.nombreInstancia}
                </Badge>
              ))}
            </div>
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
                  Configuración de Alerta
                </CardTitle>
                <CardDescription>
                  Define los intervalos y destinatarios
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
                  placeholder="Alerta de Servidores Caídos"
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

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="checkInterval">
                  <Clock className="h-4 w-4 inline mr-1" />
                  Intervalo de Verificación
                </Label>
                <Select value={checkIntervalMinutes.toString()} onValueChange={(v) => setCheckIntervalMinutes(parseInt(v))}>
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
                  Cada cuánto se verifica la conexión a los servidores
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alertInterval">
                  <Mail className="h-4 w-4 inline mr-1" />
                  Intervalo de Alertas
                </Label>
                <Select value={alertIntervalMinutes.toString()} onValueChange={(v) => setAlertIntervalMinutes(parseInt(v))}>
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
                  Cada cuánto se envía email si un servidor sigue caído
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="failedChecks">
                <AlertTriangle className="h-4 w-4 inline mr-1" />
                Chequeos Fallidos Antes de Alertar
              </Label>
              <Select value={failedChecksBeforeAlert.toString()} onValueChange={(v) => setFailedChecksBeforeAlert(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {failedChecksOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Cantidad de verificaciones fallidas consecutivas requeridas antes de enviar la primera alerta.
                <br />
                <span className="text-amber-600">
                  Ejemplo: Si el intervalo es 1 minuto y los intentos son 5, se enviará alerta después de 5 minutos de fallas consecutivas.
                </span>
              </p>
            </div>

            {/* Selector de Ambientes */}
            <div className="space-y-3">
              <Label>Ambientes a Monitorear</Label>
              <div className="flex flex-wrap gap-3">
                {['Produccion', 'Desarrollo', 'Testing'].map(ambiente => (
                  <label key={ambiente} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAmbientes.includes(ambiente)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAmbientes([...selectedAmbientes, ambiente]);
                        } else {
                          setSelectedAmbientes(selectedAmbientes.filter(a => a !== ambiente));
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="text-sm">{ambiente}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Solo se monitorearan las instancias de los ambientes seleccionados
              </p>
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
                disabled={running || !isEnabled}
              >
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Ejecutar Verificación Ahora
              </Button>

              {!isEnabled && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
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

      {/* Lista de instancias monitoreadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Instancias Monitoreadas
          </CardTitle>
          <CardDescription>
            Instancias del inventario (excluyendo AWS y DMZ) - Se verifica conexión cada {checkIntervalMinutes} minuto(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInventory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : filteredInstances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Server className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No hay instancias en el inventario</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Estado</TableHead>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead>Hosting</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Fallas</TableHead>
                    <TableHead>Última Verificación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInstances.map((inst) => {
                    const status = getConnectionStatusForInstance(inst.nombreInstancia);
                    const isConnected = status?.isConnected ?? true;
                    
                    return (
                      <TableRow key={inst.id} className={!isConnected ? 'bg-red-500/10' : ''}>
                        <TableCell>
                          {isConnected ? (
                            <Wifi className="h-5 w-5 text-green-500" />
                          ) : (
                            <WifiOff className="h-5 w-5 text-red-500 animate-pulse" />
                          )}
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          {inst.nombreInstancia}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {inst.serverName}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inst.ambiente === 'Produccion' ? 'default' : 'secondary'}>
                            {inst.ambiente}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{inst.hostingSite}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {inst.majorVersion?.replace('Microsoft SQL Server ', '')}
                        </TableCell>
                        <TableCell>
                          {status && status.consecutiveFailures > 0 ? (
                            <Badge 
                              variant={status.consecutiveFailures >= failedChecksBeforeAlert ? 'destructive' : 'secondary'}
                              className="font-mono"
                            >
                              {status.consecutiveFailures}/{failedChecksBeforeAlert}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {status?.lastCheckedAt ? formatDate(status.lastCheckedAt) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
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
                        {h.instancesDown.map(inst => (
                          <Badge key={inst} variant="destructive" className="font-mono text-xs">
                            {inst}
                          </Badge>
                        ))}
                      </div>
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
          <strong>¿Cómo funciona?</strong> El sistema obtiene la lista de instancias de <code className="bg-muted px-1 rounded">http://asprbm-nov-01/InventoryDBA/inventario/</code> cada {checkIntervalMinutes} minuto(s).
          Se excluyen automáticamente las instancias con <strong>hostingSite = "AWS"</strong> o que contengan <strong>"DMZ"</strong> en el nombre.
          <br /><br />
          <strong>Lógica de alertas:</strong> Cuando se detecta una falla de conexión, el sistema cuenta las verificaciones fallidas consecutivas. 
          Solo después de alcanzar <strong>{failedChecksBeforeAlert} chequeo(s) fallido(s)</strong> consecutivo(s) se envía la primera alerta por email.
          Luego, se envía un email cada <strong>{alertIntervalMinutes} minuto(s)</strong> mientras el servidor siga sin responder.
          <br />
          <span className="text-muted-foreground">
            Esto evita falsos positivos por micro cortes de red momentáneos.
          </span>
        </AlertDescription>
      </Alert>
    </div>
  );
}
