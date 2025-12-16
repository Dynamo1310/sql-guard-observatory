import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Server,
  Play,
  Square,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  History,
  Terminal,
  Loader2,
  ChevronRight,
  Pause,
  SkipForward,
  RotateCcw,
  X,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
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
  info: 'text-sky-400',
  error: 'text-red-400',
  warning: 'text-amber-400',
  success: 'text-emerald-400',
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
        return <Badge variant="secondary" className="text-xs"><Clock className="w-3 h-3 mr-1" />Pendiente</Badge>;
      case 'Running':
        return <Badge className="text-xs bg-blue-500"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Ejecutando</Badge>;
      case 'Completed':
        return <Badge className="text-xs bg-emerald-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completado</Badge>;
      case 'Failed':
        return <Badge variant="destructive" className="text-xs"><XCircle className="w-3 h-3 mr-1" />Fallido</Badge>;
      case 'Cancelled':
        return <Badge variant="outline" className="text-xs text-amber-500 border-amber-500"><AlertTriangle className="w-3 h-3 mr-1" />Cancelado</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  // Obtener color del ambiente
  const getAmbienteColor = (ambiente?: string) => {
    const amb = ambiente?.toLowerCase();
    if (amb === 'produccion' || amb === 'production' || amb === 'prod') {
      return 'bg-red-500/10 text-red-500 border-red-500/20';
    }
    if (amb === 'qa' || amb === 'testing' || amb === 'test') {
      return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
    }
    if (amb === 'desarrollo' || amb === 'development' || amb === 'dev') {
      return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
    return 'bg-slate-500/10 text-slate-500 border-slate-500/20';
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/10">
              <RotateCcw className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Reinicio de Servidores SQL</h1>
              <p className="text-sm text-muted-foreground">
                Selecciona servidores y monitorea el proceso en tiempo real
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Estado de conexión */}
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              isConnected 
                ? "bg-emerald-500/10 text-emerald-500" 
                : "bg-red-500/10 text-red-500"
            )}>
              <div className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
              {isConnected ? 'Conectado' : 'Desconectado'}
            </div>
            
            {/* Historial */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" onClick={loadHistory}>
                  <History className="w-4 h-4 mr-2" />
                  Historial
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[450px]">
                <SheetHeader>
                  <SheetTitle>Historial de Reinicios</SheetTitle>
                  <SheetDescription>
                    Últimas tareas de reinicio ejecutadas
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  {loadingHistory ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : taskHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay historial disponible
                    </div>
                  ) : (
                    <ScrollArea className="h-[calc(100vh-180px)]">
                      <div className="space-y-3 pr-4">
                        {taskHistory.map(task => (
                          <Card key={task.taskId} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              {renderTaskStatus(task.status)}
                              <span className="text-xs text-muted-foreground">
                                {new Date(task.startedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="mt-3 space-y-1">
                              <div className="flex items-center gap-2 text-sm">
                                <Server className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>{task.serverCount} servidor(es)</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{new Date(task.startedAt).toLocaleTimeString()}</span>
                                {task.durationSeconds && (
                                  <span>• {formatDuration(task.durationSeconds)}</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                              <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500">
                                ✓ {task.successCount}
                              </Badge>
                              <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500">
                                ✗ {task.failureCount}
                              </Badge>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </SheetContent>
            </Sheet>
            
            {/* Actualizar */}
            <Button variant="outline" size="sm" onClick={loadServers} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Actualizar
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Panel izquierdo - Lista de servidores */}
        <div className="w-1/2 max-w-2xl border-r flex flex-col bg-card/50">
          {/* Filtros */}
          <div className="shrink-0 p-4 space-y-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar servidor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            
            <div className="flex gap-2">
              <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los ambientes</SelectItem>
                  {availableAmbientes.map(amb => (
                    <SelectItem key={amb} value={amb.toLowerCase()}>{amb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="standalone">Standalone</SelectItem>
                  <SelectItem value="alwayson">AlwaysOn</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {selectedServers.size} de {filteredServers.length} seleccionados
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllFiltered}>
                  Seleccionar todo
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                  Limpiar
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
            ) : filteredServers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Server className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p>No se encontraron servidores</p>
              </div>
            ) : (
              <div className="p-2">
                {filteredServers.map(server => (
                  <div
                    key={server.serverName}
                    onClick={() => toggleServer(server.serverName)}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all mb-1",
                      "hover:bg-accent/50",
                      selectedServers.has(server.serverName) && "bg-primary/5 ring-1 ring-primary/20"
                    )}
                  >
                    <Checkbox
                      checked={selectedServers.has(server.serverName)}
                      onCheckedChange={() => toggleServer(server.serverName)}
                      className="shrink-0"
                    />
                    
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{server.serverName}</span>
                        {server.isConnected ? (
                          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Conectado" />
                        ) : (
                          <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Desconectado" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {server.majorVersion} {server.edition && `• ${server.edition}`}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge 
                        variant="outline" 
                        className={cn("text-[10px] px-1.5 py-0", getAmbienteColor(server.ambiente))}
                      >
                        {server.ambiente || 'N/A'}
                      </Badge>
                      {server.isAlwaysOn && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-purple-500/10 text-purple-500 border-purple-500/20">
                          AG
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Botón de acción */}
          <div className="shrink-0 p-4 border-t bg-card">
            <Button
              className="w-full h-10"
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
                  Reiniciar {selectedServers.size > 0 && `(${selectedServers.size})`}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Panel derecho - Terminal */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0d1117]">
          {/* Header del terminal */}
          <div className="shrink-0 flex items-center justify-between px-4 py-2 bg-[#161b22] border-b border-[#30363d]">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-medium text-slate-200">Terminal</span>
              {isStreaming && (
                <span className="flex items-center gap-1 text-xs text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  En vivo
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-[#30363d]"
                onClick={() => setAutoScroll(!autoScroll)}
                title={autoScroll ? "Pausar auto-scroll" : "Activar auto-scroll"}
              >
                {autoScroll ? <SkipForward className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-[#30363d]"
                onClick={handleDownloadLog}
                disabled={outputLines.length === 0}
                title="Descargar log"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
              {isStreaming && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={handleCancelTask}
                  title="Cancelar"
                >
                  <Square className="w-3.5 h-3.5" />
                </Button>
              )}
              {completed && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-slate-200 hover:bg-[#30363d]"
                  onClick={clearState}
                  title="Limpiar"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {progress && (
            <div className="shrink-0 px-4 py-2 bg-[#161b22]/50 border-b border-[#30363d]">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                <span className="truncate">{progress.phase}: {progress.currentServer}</span>
                <span className="shrink-0 ml-2">{progress.percentComplete}%</span>
              </div>
              <div className="h-1 bg-[#30363d] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress.percentComplete}%` }}
                />
              </div>
            </div>
          )}

          {/* Terminal output */}
          <div
            ref={terminalRef}
            className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed"
          >
            {outputLines.length === 0 && !isStreaming ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Terminal className="w-16 h-16 mb-4 opacity-30" />
                <p className="text-sm">Esperando ejecución...</p>
                <p className="text-xs mt-1 text-slate-600">
                  El output aparecerá aquí en tiempo real
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {outputLines.map((line, index) => (
                  <div key={index} className="flex gap-3">
                    <span className="text-slate-600 text-xs shrink-0 w-20 text-right">
                      {new Date(line.timestamp).toLocaleTimeString()}
                    </span>
                    <span className={cn("flex-1", OUTPUT_COLORS[line.type] || 'text-slate-300')}>
                      {line.line}
                    </span>
                  </div>
                ))}
                {isStreaming && (
                  <div className="flex gap-3">
                    <span className="text-slate-600 text-xs shrink-0 w-20" />
                    <span className="inline-block w-2 h-4 bg-emerald-400 animate-pulse" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completed summary */}
          {completed && (
            <div className={cn(
              "shrink-0 px-4 py-3 border-t",
              completed.status === 'Completed' ? "bg-emerald-500/10 border-emerald-500/20" :
              completed.status === 'Failed' ? "bg-red-500/10 border-red-500/20" :
              "bg-amber-500/10 border-amber-500/20"
            )}>
              <div className="flex items-center gap-3">
                {completed.status === 'Completed' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : completed.status === 'Failed' ? (
                  <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-200">
                    {completed.status === 'Completed' ? 'Proceso completado' :
                     completed.status === 'Failed' ? 'Proceso fallido' :
                     'Proceso cancelado'}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                    <span>✓ {completed.successCount} exitosos</span>
                    <span>•</span>
                    <span>✗ {completed.failureCount} fallidos</span>
                    <span>•</span>
                    <span>{formatDuration(completed.durationSeconds)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de confirmación */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Confirmar Reinicio
            </DialogTitle>
            <DialogDescription>
              Esta acción reiniciará los servidores seleccionados. Asegúrate de que no haya operaciones críticas en curso.
            </DialogDescription>
          </DialogHeader>
          
          <div className="my-4">
            <div className="text-sm font-medium mb-2 flex items-center justify-between">
              <span>Servidores a reiniciar</span>
              <Badge variant="secondary">{selectedServers.size}</Badge>
            </div>
            <ScrollArea className="h-48 rounded-md border p-3">
              <div className="space-y-2">
                {Array.from(selectedServers).map(serverName => {
                  const server = servers.find(s => s.serverName === serverName);
                  return (
                    <div key={serverName} className="flex items-center justify-between text-sm">
                      <span className="truncate">{serverName}</span>
                      {server?.ambiente?.toLowerCase().includes('prod') && (
                        <Badge variant="destructive" className="text-[10px] ml-2 shrink-0">
                          PROD
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
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
