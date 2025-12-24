import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { 
  Settings2, Play, RefreshCw, Clock, CheckCircle2, AlertCircle, 
  Activity, Cpu, Database, HardDrive, Shield, AlertTriangle,
  Wrench, Server, RotateCcw, Save
} from "lucide-react";
import { toast } from "sonner";
import { collectorApi, CollectorConfig, CollectorThreshold, CollectorExecutionLog } from '@/services/collectorApi';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

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
  'LogChain': <AlertTriangle className="h-4 w-4" />,
  'DatabaseStates': <Database className="h-4 w-4" />,
  'ErroresCriticos': <AlertCircle className="h-4 w-4" />,
  'Maintenance': <Wrench className="h-4 w-4" />,
  'ConfiguracionTempdb': <Database className="h-4 w-4" />,
  'Autogrowth': <Activity className="h-4 w-4" />,
  'Waits': <Clock className="h-4 w-4" />,
};

export default function CollectorConfigPage() {
  const [collectors, setCollectors] = useState<CollectorConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCollector, setSelectedCollector] = useState<CollectorConfig | null>(null);
  const [thresholds, setThresholds] = useState<CollectorThreshold[]>([]);
  const [logs, setLogs] = useState<CollectorExecutionLog[]>([]);
  const [showThresholdsDialog, setShowThresholdsDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [modifiedThresholds, setModifiedThresholds] = useState<Record<number, number>>({});
  const [savingThresholds, setSavingThresholds] = useState(false);

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

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Configuración de Collectors</h1>
          <p className="text-muted-foreground">
            Administra los collectors de métricas de HealthScore
          </p>
        </div>
        <Button onClick={loadCollectors} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refrescar
        </Button>
      </div>

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
                            <CheckCircle2 className="h-3 w-3 text-green-500" />
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
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => openThresholdsDialog(collector)}
                      >
                        <Settings2 className="h-4 w-4 mr-1" />
                        Umbrales
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openLogsDialog(collector)}
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm"
                        onClick={() => handleExecuteCollector(collector)}
                        disabled={!collector.isEnabled}
                      >
                        <Play className="h-4 w-4" />
                      </Button>
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
                            className="h-8"
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
                    <TableCell className="text-right text-green-600">
                      {log.successCount}
                    </TableCell>
                    <TableCell className="text-right text-red-600">
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
    </div>
  );
}

