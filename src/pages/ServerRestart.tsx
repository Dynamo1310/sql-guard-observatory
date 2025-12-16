import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Server,
  Play,
  Square,
  RefreshCw,
  Download,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  History,
  Terminal,
  Loader2,
  ChevronDown,
  ChevronRight,
  Wifi,
  WifiOff,
  Pause,
  SkipForward,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  serverRestartApi,
  RestartableServerDto,
  ServerRestartTaskDto,
  RestartOutputMessage,
} from '@/services/api';
import { useServerRestartStream } from '@/hooks/useServerRestartStream';
import { cn } from '@/lib/utils';

// Colores para el terminal
const OUTPUT_COLORS: Record<string, string> = {
  info: 'text-cyan-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  success: 'text-green-400',
};

export default function ServerRestart() {
  // Estados de datos
  const [servers, setServers] = useState<RestartableServerDto[]>([]);
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [taskHistory, setTaskHistory] = useState<ServerRestartTaskDto[]>([]);
  
  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [starting, setStarting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Ref para auto-scroll del terminal
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // Hook de SignalR streaming
  const {
    taskId: activeTaskId,
    isStreaming,
    outputLines,
    progress,
    completed,
    error: streamError,
    isConnected,
    subscribeToTask,
    unsubscribeFromTask,
    clearState,
  } = useServerRestartStream();

  // Cargar servidores
  const loadServers = async () => {
    setLoading(true);
    try {
      const data = await serverRestartApi.getServers();
      setServers(data);
    } catch (error) {
      toast.error('Error al cargar servidores');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar historial
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const data = await serverRestartApi.getTasks(20);
      setTaskHistory(data);
    } catch (error) {
      toast.error('Error al cargar historial');
      console.error(error);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadServers();
    loadHistory();
  }, []);

  // Auto-scroll del terminal
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [outputLines, autoScroll]);

  // Filtrar servidores
  const filteredServers = useMemo(() => {
    return servers.filter(server => {
      // Filtro de búsqueda
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!server.serverName.toLowerCase().includes(search) &&
            !server.instanceName.toLowerCase().includes(search)) {
          return false;
        }
      }
      
      // Filtro por ambiente
      if (filterAmbiente !== 'all' && server.ambiente?.toLowerCase() !== filterAmbiente.toLowerCase()) {
        return false;
      }
      
      // Filtro por tipo (standalone/alwayson)
      if (filterType === 'standalone' && !server.isStandalone) return false;
      if (filterType === 'alwayson' && !server.isAlwaysOn) return false;
      
      return true;
    });
  }, [servers, searchTerm, filterAmbiente, filterType]);

  // Ambientes disponibles
  const availableAmbientes = useMemo(() => {
    const ambientes = new Set<string>();
    servers.forEach(s => {
      if (s.ambiente) ambientes.add(s.ambiente);
    });
    return Array.from(ambientes).sort();
  }, [servers]);

  // Toggle selección de servidor
  const toggleServer = (serverName: string) => {
    setSelectedServers(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  // Seleccionar todos los filtrados
  const selectAllFiltered = () => {
    const allFilteredNames = new Set(filteredServers.map(s => s.serverName));
    setSelectedServers(allFilteredNames);
  };

  // Deseleccionar todos
  const deselectAll = () => {
    setSelectedServers(new Set());
  };

  // Iniciar reinicio
  const handleStartRestart = async () => {
    if (selectedServers.size === 0) {
      toast.warning('Selecciona al menos un servidor');
      return;
    }
    
    setShowConfirmDialog(true);
  };

  // Confirmar y ejecutar reinicio
  const confirmAndStartRestart = async () => {
    setShowConfirmDialog(false);
    setStarting(true);
    
    try {
      const serverList = Array.from(selectedServers);
      const response = await serverRestartApi.startRestart({ servers: serverList });
      
      if (response.success) {
        toast.success(`Tarea de reinicio iniciada: ${response.serverCount} servidor(es)`);
        
        // Suscribirse al streaming
        await subscribeToTask(response.taskId);
        
        // Limpiar selección
        setSelectedServers(new Set());
      } else {
        toast.error(response.message);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al iniciar reinicio');
    } finally {
      setStarting(false);
    }
  };

  // Cancelar tarea en curso
  const handleCancelTask = async () => {
    if (!activeTaskId) return;
    
    try {
      await serverRestartApi.cancelTask(activeTaskId);
      toast.info('Tarea cancelada');
      await unsubscribeFromTask();
    } catch (error: any) {
      toast.error(error.message || 'Error al cancelar');
    }
  };

  // Descargar log
  const handleDownloadLog = () => {
    const logContent = outputLines.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.line}`).join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restart_log_${activeTaskId || 'session'}_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Formatear duración
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  // Renderizar estado de tarea
  const renderTaskStatus = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge variant="outline" className="bg-slate-500/10"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case 'Running':
        return <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/50"><Loader2 className="w-3 h-3 mr-1 animate-spin" />En ejecución</Badge>;
      case 'Completed':
        return <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50"><CheckCircle2 className="w-3 h-3 mr-1" />Completado</Badge>;
      case 'Failed':
        return <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/50"><XCircle className="w-3 h-3 mr-1" />Fallido</Badge>;
      case 'Cancelled':
        return <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50"><AlertTriangle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reinicio de Servidores SQL</h1>
          <p className="text-muted-foreground text-sm">
            Selecciona los servidores a reiniciar y monitorea el proceso en tiempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Indicador de conexión SignalR */}
          <Badge variant={isConnected ? "outline" : "destructive"} className="gap-1">
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
          
          <Button variant="outline" size="sm" onClick={() => setShowHistoryPanel(!showHistoryPanel)}>
            <History className="w-4 h-4 mr-2" />
            Historial
          </Button>
          
          <Button variant="outline" size="sm" onClick={loadServers} disabled={loading}>
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Panel izquierdo - Lista de servidores */}
        <div className="w-1/2 border-r flex flex-col">
          {/* Filtros */}
          <div className="p-4 border-b space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar servidor..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {availableAmbientes.map(amb => (
                    <SelectItem key={amb} value={amb.toLowerCase()}>{amb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="standalone">Standalone</SelectItem>
                  <SelectItem value="alwayson">AlwaysOn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedServers.size} seleccionado(s) de {filteredServers.length}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAllFiltered}>
                  Seleccionar todos
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>
                  Deseleccionar
                </Button>
              </div>
            </div>
          </div>

          {/* Lista de servidores */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="divide-y">
                {filteredServers.map(server => (
                  <div
                    key={server.serverName}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors",
                      selectedServers.has(server.serverName) && "bg-primary/5"
                    )}
                    onClick={() => toggleServer(server.serverName)}
                  >
                    <Checkbox
                      checked={selectedServers.has(server.serverName)}
                      onCheckedChange={() => toggleServer(server.serverName)}
                    />
                    <Server className="w-5 h-5 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{server.serverName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {server.instanceName} • {server.majorVersion} {server.edition}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {server.isAlwaysOn ? (
                        <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
                          AlwaysOn
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">Standalone</Badge>
                      )}
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          server.ambiente?.toLowerCase() === 'produccion' 
                            ? "bg-red-500/10 text-red-400 border-red-500/30"
                            : server.ambiente?.toLowerCase() === 'qa'
                            ? "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                            : "bg-slate-500/10"
                        )}
                      >
                        {server.ambiente || 'N/A'}
                      </Badge>
                      {server.isConnected ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                  </div>
                ))}
                
                {filteredServers.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    No se encontraron servidores
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Acciones */}
          <div className="p-4 border-t">
            <Button
              className="w-full"
              size="lg"
              onClick={handleStartRestart}
              disabled={selectedServers.size === 0 || isStreaming || starting}
            >
              {starting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Reiniciar {selectedServers.size > 0 ? `(${selectedServers.size})` : ''} Servidor(es)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Panel derecho - Terminal / Output */}
        <div className="w-1/2 flex flex-col bg-slate-950">
          {/* Header del terminal */}
          <div className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium text-slate-300">Output en tiempo real</span>
              {isStreaming && (
                <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/50 text-xs animate-pulse">
                  STREAMING
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAutoScroll(!autoScroll)}
                className={cn(
                  "text-slate-400 hover:text-slate-200",
                  autoScroll && "text-green-400"
                )}
              >
                {autoScroll ? <SkipForward className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownloadLog}
                disabled={outputLines.length === 0}
                className="text-slate-400 hover:text-slate-200"
              >
                <Download className="w-4 h-4" />
              </Button>
              {isStreaming && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelTask}
                  className="text-red-400 hover:text-red-300"
                >
                  <Square className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {progress && (
            <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                <span>{progress.phase}: {progress.currentServer}</span>
                <span>{progress.currentIndex}/{progress.totalServers} ({progress.percentComplete}%)</span>
              </div>
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-green-500 transition-all duration-300"
                  style={{ width: `${progress.percentComplete}%` }}
                />
              </div>
            </div>
          )}

          {/* Terminal output */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-auto p-4 font-mono text-sm"
          >
            {outputLines.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Terminal className="w-12 h-12 mb-4 opacity-50" />
                <p>Selecciona servidores e inicia el reinicio</p>
                <p className="text-xs mt-1">El output aparecerá aquí en tiempo real</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {outputLines.map((line, index) => (
                  <div key={index} className={cn("leading-relaxed", OUTPUT_COLORS[line.type] || 'text-slate-300')}>
                    <span className="text-slate-600 text-xs mr-2">
                      {new Date(line.timestamp).toLocaleTimeString()}
                    </span>
                    {line.line}
                  </div>
                ))}
                {isStreaming && (
                  <div className="inline-block w-2 h-4 bg-green-400 animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Completed summary */}
          {completed && (
            <div className={cn(
              "px-4 py-3 border-t",
              completed.status === 'Completed' ? "bg-green-950/50 border-green-900" :
              completed.status === 'Failed' ? "bg-red-950/50 border-red-900" :
              "bg-yellow-950/50 border-yellow-900"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {completed.status === 'Completed' ? (
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                  ) : completed.status === 'Failed' ? (
                    <XCircle className="w-5 h-5 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  )}
                  <div>
                    <div className="font-medium text-slate-200">
                      {completed.status === 'Completed' ? 'Proceso completado' :
                       completed.status === 'Failed' ? 'Proceso fallido' :
                       'Proceso cancelado'}
                    </div>
                    <div className="text-xs text-slate-400">
                      Exitosos: {completed.successCount} • Fallidos: {completed.failureCount} • Duración: {formatDuration(completed.durationSeconds)}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearState}
                  className="border-slate-700"
                >
                  Limpiar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Panel de historial (colapsable) */}
        {showHistoryPanel && (
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-background border-l shadow-xl z-10 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold">Historial de Reinicios</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowHistoryPanel(false)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="divide-y">
                  {taskHistory.map(task => (
                    <div key={task.taskId} className="p-4 hover:bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        {renderTaskStatus(task.status)}
                        <span className="text-xs text-muted-foreground">
                          {new Date(task.startedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <span className="font-medium">{task.serverCount}</span> servidor(es)
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Por: {task.initiatedByUserName || 'Desconocido'}
                      </div>
                      {task.durationSeconds && (
                        <div className="text-xs text-muted-foreground">
                          Duración: {formatDuration(task.durationSeconds)}
                        </div>
                      )}
                      <div className="flex gap-2 mt-2">
                        <Badge variant="outline" className="text-xs bg-green-500/10">
                          ✓ {task.successCount}
                        </Badge>
                        <Badge variant="outline" className="text-xs bg-red-500/10">
                          ✗ {task.failureCount}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  
                  {taskHistory.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground">
                      No hay historial de reinicios
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
            <div className="p-3 border-t">
              <Button variant="outline" size="sm" className="w-full" onClick={loadHistory} disabled={loadingHistory}>
                <RefreshCw className={cn("w-4 h-4 mr-2", loadingHistory && "animate-spin")} />
                Actualizar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de confirmación */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-500">
              <AlertTriangle className="w-5 h-5" />
              Confirmar Reinicio
            </DialogTitle>
            <DialogDescription>
              Estás a punto de reiniciar los siguientes servidores. Esta acción es crítica y puede afectar servicios en producción.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <div className="text-sm font-medium mb-2">
              Servidores seleccionados ({selectedServers.size}):
            </div>
            <ScrollArea className="h-40 border rounded-md p-2">
              {Array.from(selectedServers).map(serverName => {
                const server = servers.find(s => s.serverName === serverName);
                return (
                  <div key={serverName} className="flex items-center justify-between py-1">
                    <span className="text-sm">{serverName}</span>
                    {server?.ambiente?.toLowerCase() === 'produccion' && (
                      <Badge variant="destructive" className="text-xs">PROD</Badge>
                    )}
                  </div>
                );
              })}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmAndStartRestart}>
              <Play className="w-4 h-4 mr-2" />
              Confirmar Reinicio
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

