import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Settings2, Play, RefreshCw, Clock, CheckCircle2, AlertCircle, 
  Activity, Cpu, Database, HardDrive, Shield, AlertTriangle,
  Wrench, Server, RotateCcw, Save, Calculator, Loader2, Lock,
  ShieldX, Plus, Trash2, Ban
} from "lucide-react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { collectorApi, CollectorConfig, CollectorThreshold, CollectorExecutionLog, CollectorException, CreateCollectorException } from '@/services/collectorApi';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import { Capabilities } from '@/lib/capabilities';

const categoryIcons: Record<string, React.ReactNode> = {
  'Availability': <Shield className="h-4 w-4" />,
  'Performance': <Activity className="h-4 w-4" />,
  'Maintenance': <Wrench className="h-4 w-4" />,
  'Auxiliary': <Server className="h-4 w-4" />,
};

const collectorIcons: Record<string, React.ReactNode> = {
  'CPU': <Cpu className="h-4 w-4" />,
  'Memoria': <Database className="h-4 w-4" />,
  'IO': <HardDrive className="h-4 w-4" />,
  'Discos': <HardDrive className="h-4 w-4" />,
  'Backups': <Database className="h-4 w-4" />,
  'AlwaysOn': <Server className="h-4 w-4" />,
  'DatabaseStates': <Database className="h-4 w-4" />,
  'ErroresCriticos': <AlertCircle className="h-4 w-4" />,
  'Maintenance': <Wrench className="h-4 w-4" />,
  'ConfiguracionTempdb': <Database className="h-4 w-4" />,
  'Autogrowth': <Activity className="h-4 w-4" />,
  'Waits': <Clock className="h-4 w-4" />,
};

export default function CollectorConfigPage() {
  const { hasCapability } = useAuth();
  const canConfigureCollectors = hasCapability(Capabilities.SystemConfigureCollectors);
  
  const [collectors, setCollectors] = useState<CollectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollector, setSelectedCollector] = useState<CollectorConfig | null>(null);
  const [thresholds, setThresholds] = useState<CollectorThreshold[]>([]);
  const [logs, setLogs] = useState<CollectorExecutionLog[]>([]);
  const [showThresholdsDialog, setShowThresholdsDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [modifiedThresholds, setModifiedThresholds] = useState<Record<number, number>>({});
  const [savingThresholds, setSavingThresholds] = useState(false);
  const [consolidatorRunning, setConsolidatorRunning] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  
  // Estado para editar configuracion del collector
  const [editConfig, setEditConfig] = useState({
    intervalSeconds: 300,
    weight: 0,
    parallelDegree: 5
  });

  // Estado para excepciones
  const [showExceptionsDialog, setShowExceptionsDialog] = useState(false);
  const [exceptions, setExceptions] = useState<CollectorException[]>([]);
  const [exceptionTypes, setExceptionTypes] = useState<string[]>([]);
  const [loadingExceptions, setLoadingExceptions] = useState(false);
  const [addingException, setAddingException] = useState(false);
  const [newException, setNewException] = useState<CreateCollectorException>({
    exceptionType: '',
    serverName: '',
    reason: ''
  });

  const loadCollectors = async () => {
    try {
      setLoading(true);
      const data = await collectorApi.getAll();
      setCollectors(data);
    } catch (error) {
      toast.error('Error al cargar collectors');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCollectors();
    // Refrescar cada 30 segundos
    const interval = setInterval(loadCollectors, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleCollector = async (collector: CollectorConfig) => {
    try {
      await collectorApi.update(collector.name, { isEnabled: !collector.isEnabled });
      toast.success(`Collector ${collector.displayName} ${!collector.isEnabled ? 'habilitado' : 'deshabilitado'}`);
      loadCollectors();
    } catch (error) {
      toast.error('Error al actualizar collector');
    }
  };

  const handleExecuteCollector = async (collector: CollectorConfig) => {
    try {
      const result = await collectorApi.execute(collector.name);
      if (result.started) {
        toast.success(`Ejecución de ${collector.displayName} iniciada`);
      } else {
        toast.warning(result.message);
      }
      setTimeout(loadCollectors, 2000);
    } catch (error) {
      toast.error('Error al ejecutar collector');
    }
  };

  const openThresholdsDialog = async (collector: CollectorConfig) => {
    setSelectedCollector(collector);
    try {
      const data = await collectorApi.getThresholds(collector.name);
      setThresholds(data);
      setModifiedThresholds({});
      setShowThresholdsDialog(true);
    } catch (error) {
      toast.error('Error al cargar umbrales');
    }
  };

  const openLogsDialog = async (collector: CollectorConfig) => {
    setSelectedCollector(collector);
    try {
      const data = await collectorApi.getLogs(collector.name, 20);
      setLogs(data);
      setShowLogsDialog(true);
    } catch (error) {
      toast.error('Error al cargar logs');
    }
  };

  const handleThresholdChange = (id: number, value: number) => {
    setModifiedThresholds(prev => ({ ...prev, [id]: value }));
  };

  const saveThresholds = async () => {
    if (!selectedCollector) return;
    
    setSavingThresholds(true);
    try {
      for (const [id, value] of Object.entries(modifiedThresholds)) {
        await collectorApi.updateThreshold(selectedCollector.name, parseInt(id), { thresholdValue: value });
      }
      toast.success('Umbrales guardados correctamente');
      setShowThresholdsDialog(false);
      setModifiedThresholds({});
    } catch (error) {
      toast.error('Error al guardar umbrales');
    } finally {
      setSavingThresholds(false);
    }
  };

  const resetThresholds = async () => {
    if (!selectedCollector) return;
    
    try {
      await collectorApi.resetThresholds(selectedCollector.name);
      toast.success('Umbrales restablecidos a valores por defecto');
      const data = await collectorApi.getThresholds(selectedCollector.name);
      setThresholds(data);
      setModifiedThresholds({});
    } catch (error) {
      toast.error('Error al restablecer umbrales');
    }
  };

  const handleExecuteConsolidator = async () => {
    try {
      setConsolidatorRunning(true);
      const result = await collectorApi.executeConsolidator();
      if (result.success) {
        toast.success(`Consolidacion completada en ${result.durationMs}ms`);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Error al ejecutar el consolidador');
      console.error(error);
    } finally {
      setConsolidatorRunning(false);
    }
  };

  const openConfigDialog = (collector: CollectorConfig) => {
    setSelectedCollector(collector);
    setEditConfig({
      intervalSeconds: collector.intervalSeconds,
      weight: collector.weight,
      parallelDegree: collector.parallelDegree
    });
    setShowConfigDialog(true);
  };

  const saveCollectorConfig = async () => {
    if (!selectedCollector) return;
    
    setSavingConfig(true);
    try {
      await collectorApi.update(selectedCollector.name, {
        intervalSeconds: editConfig.intervalSeconds,
        weight: editConfig.weight,
        parallelDegree: editConfig.parallelDegree
      });
      toast.success(`Configuracion de ${selectedCollector.displayName} guardada`);
      setShowConfigDialog(false);
      loadCollectors();
    } catch (error) {
      toast.error('Error al guardar configuracion');
      console.error(error);
    } finally {
      setSavingConfig(false);
    }
  };

  // === HANDLERS DE EXCEPCIONES ===
  const openExceptionsDialog = async (collector: CollectorConfig) => {
    setSelectedCollector(collector);
    setLoadingExceptions(true);
    try {
      const [exceptionsData, typesData] = await Promise.all([
        collectorApi.getExceptions(collector.name),
        collectorApi.getExceptionTypes(collector.name)
      ]);
      setExceptions(exceptionsData);
      setExceptionTypes(typesData);
      setNewException({ exceptionType: typesData[0] || '', serverName: '', reason: '' });
      setShowExceptionsDialog(true);
    } catch (error) {
      toast.error('Error al cargar excepciones');
      console.error(error);
    } finally {
      setLoadingExceptions(false);
    }
  };

  const addException = async () => {
    if (!selectedCollector || !newException.serverName.trim() || !newException.exceptionType) return;
    
    setAddingException(true);
    try {
      await collectorApi.addException(selectedCollector.name, {
        exceptionType: newException.exceptionType,
        serverName: newException.serverName.trim(),
        reason: newException.reason?.trim() || undefined
      });
      toast.success(`Excepción agregada para ${newException.serverName}`);
      
      // Recargar excepciones
      const exceptionsData = await collectorApi.getExceptions(selectedCollector.name);
      setExceptions(exceptionsData);
      setNewException({ exceptionType: exceptionTypes[0] || '', serverName: '', reason: '' });
    } catch (error: any) {
      toast.error(error.message || 'Error al agregar excepción');
    } finally {
      setAddingException(false);
    }
  };

  const removeException = async (exceptionId: number) => {
    if (!selectedCollector) return;
    
    try {
      await collectorApi.removeException(selectedCollector.name, exceptionId);
      toast.success('Excepción eliminada');
      setExceptions(prev => prev.filter(e => e.id !== exceptionId));
    } catch (error) {
      toast.error('Error al eliminar excepción');
    }
  };

  // Helper para verificar si un collector soporta excepciones
  const supportsExceptions = (collectorName: string) => {
    return ['Maintenance', 'Backups', 'AlwaysOn'].includes(collectorName);
  };

  const groupedCollectors = collectors.reduce((acc, collector) => {
    const category = collector.category;
    if (!acc[category]) acc[category] = [];
    acc[category].push(collector);
    return acc;
  }, {} as Record<string, CollectorConfig[]>);

  const groupedThresholds = thresholds.reduce((acc, threshold) => {
    const group = threshold.thresholdGroup || 'General';
    if (!acc[group]) acc[group] = [];
    acc[group].push(threshold);
    return acc;
  }, {} as Record<string, CollectorThreshold[]>);

  const formatInterval = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h`;
  };

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Consolidator card skeleton */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-72" />
                </div>
              </div>
              <Skeleton className="h-10 w-44" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-28" />
            </div>
          </CardContent>
        </Card>
        
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-full" />
        
        {/* Collectors grid skeleton */}
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-5 w-32" />
                  </div>
                  <Skeleton className="h-5 w-10" />
                </div>
                <Skeleton className="h-4 w-full mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="space-y-1">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-5 w-12" />
                    </div>
                  ))}
                </div>
                <Skeleton className="h-px w-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-8" />
                  <Skeleton className="h-8 w-8" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings2 className="h-8 w-8" />
            Configuración de Collectors
          </h1>
          <p className="text-muted-foreground">
            Administra los collectors de métricas de HealthScore
          </p>
        </div>
        <Button onClick={loadCollectors} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refrescar
        </Button>
      </div>

      {/* Consolidador Card */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Calculator className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Health Score Consolidator</CardTitle>
                <CardDescription>
                  Calcula el HealthScore final consolidando todas las metricas de los collectors
                </CardDescription>
              </div>
            </div>
            {canConfigureCollectors ? (
              <Button 
                onClick={handleExecuteConsolidator}
                disabled={consolidatorRunning}
                className="min-w-[180px]"
              >
                {consolidatorRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Ejecutando...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Ejecutar Consolidador
                  </>
                )}
              </Button>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                <Lock className="h-3 w-3 mr-1" />
                Solo lectura
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Intervalo: 5 minutos</span>
            </div>
            <div className="flex items-center gap-1">
              <Activity className="h-4 w-4" />
              <span>12 categorias ponderadas</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span>Siempre activo</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="Availability" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          {Object.keys(groupedCollectors).map(category => (
            <TabsTrigger key={category} value={category} className="flex items-center gap-2">
              {categoryIcons[category]}
              {category}
              <Badge variant="secondary" className="ml-1">
                {groupedCollectors[category].length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {Object.entries(groupedCollectors).map(([category, categoryCollectors]) => (
          <TabsContent key={category} value={category} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {categoryCollectors.map(collector => (
                <Card key={collector.name} className={!collector.isEnabled ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {collectorIcons[collector.name]}
                        <CardTitle className="text-lg">{collector.displayName}</CardTitle>
                      </div>
                      <Switch 
                        checked={collector.isEnabled}
                        onCheckedChange={() => handleToggleCollector(collector)}
                        disabled={!canConfigureCollectors}
                      />
                    </div>
                    <CardDescription>{collector.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Intervalo</span>
                        <p className="font-medium">{formatInterval(collector.intervalSeconds)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Peso</span>
                        <p className="font-medium">{collector.weight}%</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Paralelismo</span>
                        <p className="font-medium">{collector.parallelDegree}</p>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Última ejecución</span>
                        {collector.lastExecution ? (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3 text-success" />
                            {formatDistanceToNow(new Date(collector.lastExecution), { 
                              addSuffix: true, 
                              locale: es 
                            })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Nunca</span>
                        )}
                      </div>
                      {collector.lastInstancesProcessed !== null && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Instancias</span>
                          <span>{collector.lastInstancesProcessed}</span>
                        </div>
                      )}
                      {collector.lastError && (
                        <div className="flex items-center gap-1 text-sm text-destructive">
                          <AlertCircle className="h-3 w-3" />
                          <span className="truncate">{collector.lastError}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      {canConfigureCollectors && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openConfigDialog(collector)}
                          title="Configurar intervalo, peso y paralelismo"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => openThresholdsDialog(collector)}
                      >
                        Umbrales
                      </Button>
                      {supportsExceptions(collector.name) && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openExceptionsDialog(collector)}
                          title="Gestionar excepciones de servidores"
                        >
                          <ShieldX className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openLogsDialog(collector)}
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      {canConfigureCollectors && (
                        <Button 
                          variant="default" 
                          size="sm"
                          onClick={() => handleExecuteCollector(collector)}
                          disabled={!collector.isEnabled}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Dialog de Umbrales */}
      <Dialog open={showThresholdsDialog} onOpenChange={setShowThresholdsDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCollector && collectorIcons[selectedCollector.name]}
              {selectedCollector?.displayName} - Umbrales
            </DialogTitle>
            <DialogDescription>
              Configura los umbrales para el cálculo del score
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="h-[50vh]">
            <div className="space-y-6 pr-4">
              {Object.entries(groupedThresholds).map(([group, groupThresholds]) => (
                <div key={group} className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {group}
                  </h4>
                  <div className="space-y-4">
                    {groupThresholds.map(threshold => (
                      <div key={threshold.id} className="grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-5">
                          <Label className="text-sm font-medium">{threshold.displayName}</Label>
                          <p className="text-xs text-muted-foreground">{threshold.description}</p>
                        </div>
                        <div className="col-span-2 text-center">
                          <span className="text-sm font-mono">{threshold.thresholdOperator}</span>
                        </div>
                        <div className="col-span-3">
                          <Input
                            type="number"
                            value={modifiedThresholds[threshold.id] ?? threshold.thresholdValue}
                            onChange={(e) => handleThresholdChange(threshold.id, parseFloat(e.target.value))}
                            className={`h-8 ${!canConfigureCollectors ? 'bg-muted cursor-not-allowed' : ''}`}
                            disabled={!canConfigureCollectors}
                          />
                        </div>
                        <div className="col-span-2 text-right">
                          <Badge variant={
                            threshold.actionType === 'Score' ? 'default' :
                            threshold.actionType === 'Cap' ? 'secondary' : 'destructive'
                          }>
                            {threshold.actionType === 'Penalty' ? threshold.resultingScore : 
                             threshold.actionType === 'Cap' ? `Cap ${threshold.resultingScore}` :
                             `Score ${threshold.resultingScore}`}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            {canConfigureCollectors ? (
              <>
                <Button variant="outline" onClick={resetThresholds}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Restablecer
                </Button>
                <Button 
                  onClick={saveThresholds} 
                  disabled={Object.keys(modifiedThresholds).length === 0 || savingThresholds}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Guardar Cambios
                </Button>
              </>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center">
                <Lock className="h-4 w-4 mr-1" />
                Solo lectura - No tienes permisos para modificar umbrales
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Logs */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {selectedCollector?.displayName} - Historial de Ejecuciones
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-[50vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inicio</TableHead>
                  <TableHead>Duración</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Éxito</TableHead>
                  <TableHead className="text-right">Error</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="font-mono text-sm">
                      {format(new Date(log.startedAtUtc), 'dd/MM HH:mm:ss')}
                    </TableCell>
                    <TableCell>
                      {log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        log.status === 'Completed' ? 'default' :
                        log.status === 'Running' ? 'secondary' : 'destructive'
                      }>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {log.successCount}
                    </TableCell>
                    <TableCell className="text-right text-destructive">
                      {log.errorCount}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.triggerType}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Dialog de Configuracion del Collector */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Configurar {selectedCollector?.displayName}
            </DialogTitle>
            <DialogDescription>
              Ajusta el intervalo de ejecucion, peso en el Health Score y grado de paralelismo
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Intervalo */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="interval" className="text-sm font-medium">
                  Intervalo de Ejecucion
                </Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {formatInterval(editConfig.intervalSeconds)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="interval"
                  type="number"
                  min={30}
                  max={3600}
                  step={30}
                  value={editConfig.intervalSeconds}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, intervalSeconds: Math.max(30, parseInt(e.target.value) || 30) }))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">segundos</span>
                <div className="flex-1">
                  <Slider
                    value={[editConfig.intervalSeconds]}
                    onValueChange={([value]) => setEditConfig(prev => ({ ...prev, intervalSeconds: value }))}
                    min={30}
                    max={900}
                    step={30}
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Minimo 30 segundos. Valores comunes: 60s (1min), 300s (5min), 600s (10min)
              </p>
            </div>

            <Separator />

            {/* Peso */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="weight" className="text-sm font-medium">
                  Peso en Health Score
                </Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {editConfig.weight.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="weight"
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={editConfig.weight}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, weight: Math.max(0, Math.min(50, parseFloat(e.target.value) || 0)) }))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <div className="flex-1">
                  <Slider
                    value={[editConfig.weight]}
                    onValueChange={([value]) => setEditConfig(prev => ({ ...prev, weight: value }))}
                    min={0}
                    max={25}
                    step={0.5}
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Porcentaje de contribucion al Health Score final. 0% = no pondera.
              </p>
            </div>

            <Separator />

            {/* Paralelismo */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="parallel" className="text-sm font-medium">
                  Grado de Paralelismo
                </Label>
                <span className="text-sm font-mono text-muted-foreground">
                  {editConfig.parallelDegree} instancias
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="parallel"
                  type="number"
                  min={1}
                  max={20}
                  value={editConfig.parallelDegree}
                  onChange={(e) => setEditConfig(prev => ({ ...prev, parallelDegree: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) }))}
                  className="w-24"
                />
                <div className="flex-1">
                  <Slider
                    value={[editConfig.parallelDegree]}
                    onValueChange={([value]) => setEditConfig(prev => ({ ...prev, parallelDegree: value }))}
                    min={1}
                    max={20}
                    step={1}
                    className="w-full"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Numero de instancias a procesar en paralelo. Mayor = mas rapido pero mas carga.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={saveCollectorConfig} disabled={savingConfig}>
              {savingConfig ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Guardar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Excepciones */}
      <Dialog open={showExceptionsDialog} onOpenChange={setShowExceptionsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldX className="h-5 w-5" />
              {selectedCollector?.displayName} - Excepciones
            </DialogTitle>
            <DialogDescription>
              Gestiona las excepciones de servidores para este collector. Los servidores exceptuados no serán penalizados.
            </DialogDescription>
          </DialogHeader>
          
          {loadingExceptions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Formulario para agregar excepción */}
              {canConfigureCollectors && exceptionTypes.length > 0 && (
                <div className="p-4 border rounded-lg space-y-4 bg-muted/30">
                  <h4 className="font-medium flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Agregar Excepción
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo de Excepción</Label>
                      <Select
                        value={newException.exceptionType}
                        onValueChange={(value) => setNewException(prev => ({ ...prev, exceptionType: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {exceptionTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Servidor</Label>
                      <Input
                        placeholder="Nombre del servidor (ej: SERVER01)"
                        value={newException.serverName}
                        onChange={(e) => setNewException(prev => ({ ...prev, serverName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Motivo (opcional)</Label>
                    <Textarea
                      placeholder="Razón de la excepción..."
                      value={newException.reason || ''}
                      onChange={(e) => setNewException(prev => ({ ...prev, reason: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <Button 
                    onClick={addException} 
                    disabled={addingException || !newException.serverName.trim() || !newException.exceptionType}
                    className="w-full"
                  >
                    {addingException ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Agregando...
                      </>
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Agregar Excepción
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Lista de excepciones existentes */}
              <div className="space-y-2">
                <h4 className="font-medium">Excepciones Activas ({exceptions.length})</h4>
                {exceptions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Ban className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No hay excepciones configuradas</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Servidor</TableHead>
                          <TableHead>Motivo</TableHead>
                          <TableHead>Creado</TableHead>
                          {canConfigureCollectors && <TableHead className="w-12"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exceptions.map(exception => (
                          <TableRow key={exception.id}>
                            <TableCell>
                              <Badge variant="outline">{exception.exceptionType}</Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {exception.serverName}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                              {exception.reason || '-'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {exception.createdBy && (
                                <span className="block">{exception.createdBy}</span>
                              )}
                              {format(new Date(exception.createdAtUtc), 'dd/MM/yyyy')}
                            </TableCell>
                            {canConfigureCollectors && (
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeException(exception.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExceptionsDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

