import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  FileText, RefreshCw, Trash2, Download, Search, 
  AlertCircle, AlertTriangle, Info, HardDrive, Calendar,
  Eye, Loader2, Database, Clock, Zap, X, Server, Terminal, Lock
} from "lucide-react";
import { toast } from "sonner";
import { logsApi, LogFileDto } from '@/services/api';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

type LogLevel = 'all' | 'INF' | 'WRN' | 'ERR' | 'FTL';

export default function AdminLogs() {
  const { hasCapability } = useAuth();
  const canManageLogs = hasCapability('System.ManageLogs');
  const [files, setFiles] = useState<LogFileDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<LogFileDto | null>(null);
  const [logContent, setLogContent] = useState<string>('');
  const [logLines, setLogLines] = useState<number>(0);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearAllDialog, setShowClearAllDialog] = useState(false);
  const [showPurgeDialog, setShowPurgeDialog] = useState(false);
  const [showServiceLogInfo, setShowServiceLogInfo] = useState(false);
  const [purgeDays, setPurgeDays] = useState<string>('30');
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [processing, setProcessing] = useState(false);

  const loadFiles = async () => {
    try {
      setLoading(true);
      const response = await logsApi.list();
      if (response.success) {
        setFiles(response.files);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar archivos de log');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  const totalSize = useMemo(() => {
    const total = files.reduce((acc, f) => acc + f.sizeBytes, 0);
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(2)} KB`;
    if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(2)} MB`;
    return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }, [files]);

  const serviceLogsSize = useMemo(() => {
    const total = files.filter(f => f.isServiceLog).reduce((acc, f) => acc + f.sizeBytes, 0);
    if (total < 1024) return `${total} B`;
    if (total < 1024 * 1024) return `${(total / 1024).toFixed(2)} KB`;
    if (total < 1024 * 1024 * 1024) return `${(total / (1024 * 1024)).toFixed(2)} MB`;
    return `${(total / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }, [files]);

  const hasServiceLogs = useMemo(() => files.some(f => f.isServiceLog && f.sizeBytes > 0), [files]);

  const handleViewLog = async (file: LogFileDto) => {
    setSelectedFile(file);
    setLoadingContent(true);
    setShowViewDialog(true);
    setSearchTerm('');
    setLevelFilter('all');
    
    try {
      const response = await logsApi.getContent(file.name);
      if (response.success) {
        setLogContent(response.content);
        setLogLines(response.lines);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al cargar contenido del log');
      console.error(error);
    } finally {
      setLoadingContent(false);
    }
  };

  const handleClearFile = async () => {
    if (!selectedFile) return;
    
    setProcessing(true);
    try {
      const response = await logsApi.clear(selectedFile.name);
      if (response.success) {
        toast.success(response.message);
        loadFiles();
        setShowClearDialog(false);
        setShowViewDialog(false);
      }
    } catch (error: any) {
      // Si es un archivo de servicio, mostrar el diálogo de información
      if (selectedFile.isServiceLog) {
        setShowClearDialog(false);
        setShowServiceLogInfo(true);
      } else {
        toast.error(error.message || 'Error al limpiar archivo de log');
      }
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteFile = async () => {
    if (!selectedFile) return;
    
    setProcessing(true);
    try {
      const response = await logsApi.delete(selectedFile.name);
      if (response.success) {
        toast.success(response.message);
        loadFiles();
        setShowDeleteDialog(false);
        setShowViewDialog(false);
      }
    } catch (error: any) {
      // Si es un archivo de servicio, mostrar el diálogo de información
      if (selectedFile.isServiceLog) {
        setShowDeleteDialog(false);
        setShowServiceLogInfo(true);
      } else {
        toast.error(error.message || 'Error al eliminar archivo de log');
      }
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleClearAll = async () => {
    setProcessing(true);
    try {
      const response = await logsApi.clearAll();
      if (response.success) {
        toast.success(response.message);
        loadFiles();
        setShowClearAllDialog(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al limpiar todos los logs');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handlePurge = async () => {
    setProcessing(true);
    try {
      const response = await logsApi.purge(parseInt(purgeDays));
      if (response.success) {
        toast.success(response.message);
        loadFiles();
        setShowPurgeDialog(false);
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al purgar logs antiguos');
      console.error(error);
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!selectedFile || !logContent) return;
    
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Archivo descargado');
  };

  const getFileStatus = (file: LogFileDto) => {
    if (file.isServiceLog) return 'service';
    if (file.isActive) return 'active';
    if (!file.canOperate) return 'locked';
    return 'idle';
  };

  // Filtrar y colorear líneas del log
  const filteredLines = useMemo(() => {
    if (!logContent) return [];
    
    const lines = logContent.split('\n');
    return lines.filter(line => {
      if (levelFilter !== 'all') {
        if (!line.includes(`[${levelFilter}]`)) return false;
      }
      if (searchTerm) {
        return line.toLowerCase().includes(searchTerm.toLowerCase());
      }
      return true;
    });
  }, [logContent, levelFilter, searchTerm]);

  const getLineStyle = (line: string): string => {
    if (line.includes('[ERR]') || line.includes('[FTL]') || line.includes('Error') || line.includes('Exception')) {
      return 'text-destructive bg-destructive/10';
    }
    if (line.includes('[WRN]') || line.includes('Warning')) {
      return 'text-warning bg-warning/10';
    }
    if (line.includes('[INF]')) {
      return 'text-muted-foreground';
    }
    return 'text-muted-foreground/70';
  };

  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'ERR':
      case 'FTL':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case 'WRN':
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'INF':
        return <Info className="h-4 w-4 text-muted-foreground" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const renderStatusBadge = (file: LogFileDto) => {
    const status = getFileStatus(file);
    
    switch (status) {
      case 'service':
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="bg-muted text-muted-foreground border-border/50">
                <Server className="h-3 w-3 mr-1" />
                Servicio
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Archivo del servicio de Windows (NSSM). Requiere reiniciar el servicio para modificarlo.
            </TooltipContent>
          </Tooltip>
        );
      case 'active':
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                <Zap className="h-3 w-3 mr-1" />
                Activo
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Log activo de Serilog del día actual
            </TooltipContent>
          </Tooltip>
        );
      case 'locked':
        return (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/30">
                <AlertCircle className="h-3 w-3 mr-1" />
                Bloqueado
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              Archivo bloqueado por otro proceso
            </TooltipContent>
          </Tooltip>
        );
      default:
        return <Badge variant="secondary">Disponible</Badge>;
    }
  };

  const canModifyFile = (file: LogFileDto) => {
    return !file.isServiceLog && !file.isActive && file.canOperate;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Logs del Sistema
          </h1>
          <p className="text-muted-foreground">
            Visualiza y gestiona los archivos de log del backend
          </p>
        </div>
        <Button onClick={loadFiles} variant="outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Archivos</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{files.length}</div>
            <p className="text-xs text-muted-foreground">archivos de log</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Espacio Total</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSize}</div>
            <p className="text-xs text-muted-foreground">en disco</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Logs de Servicio</CardTitle>
            <Server className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{serviceLogsSize}</div>
            <p className="text-xs text-muted-foreground">output.log / error.log</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Acciones Masivas</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex gap-2">
            {canManageLogs ? (
              <>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowClearAllDialog(true)}
                  disabled={files.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Vaciar
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowPurgeDialog(true)}
                  disabled={files.length === 0}
                >
                  <Calendar className="h-4 w-4 mr-1" />
                  Purgar
                </Button>
              </>
            ) : (
              <div className="flex items-center text-sm text-muted-foreground">
                <Lock className="h-4 w-4 mr-1" />
                Solo lectura
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Service Log Warning */}
      {hasServiceLogs && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/20 border border-border/50">
          <Server className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Archivos de servicio detectados (output.log, error.log)
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Estos archivos son creados por NSSM (el administrador de servicios) y están bloqueados mientras el servicio está corriendo. 
              Para limpiarlos, necesitas reiniciar el servicio de Windows.
            </p>
            <Button 
              variant="link" 
              size="sm" 
              className="text-primary p-0 h-auto mt-2"
              onClick={() => setShowServiceLogInfo(true)}
            >
              Ver instrucciones →
            </Button>
          </div>
        </div>
      )}

      {/* Files Table */}
      <Card>
        <CardHeader>
          <CardTitle>Archivos de Log</CardTitle>
          <CardDescription>
            Archivos de log disponibles en el servidor
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mb-4" />
              <p>No hay archivos de log disponibles</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>Última Modificación</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => {
                  const status = getFileStatus(file);
                  const bgClass = status === 'service' ? 'bg-muted/20' : 
                                  status === 'active' ? 'bg-warning/5' : 
                                  status === 'locked' ? 'bg-destructive/5' : '';
                  
                  return (
                    <TableRow key={file.name} className={bgClass}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-2">
                          {file.isServiceLog ? (
                            <Server className="h-4 w-4 text-muted-foreground" />
                          ) : file.isActive ? (
                            <Zap className="h-4 w-4 text-warning" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          {file.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        {renderStatusBadge(file)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={file.sizeBytes > 10 * 1024 * 1024 ? 'destructive' : file.sizeBytes > 5 * 1024 * 1024 ? 'default' : 'secondary'}>
                          {file.size}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span title={format(new Date(file.lastModified), 'PPpp', { locale: es })}>
                            {formatDistanceToNow(new Date(file.lastModified), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleViewLog(file)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {canManageLogs && (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedFile(file);
                                      if (file.isServiceLog) {
                                        setShowServiceLogInfo(true);
                                      } else {
                                        setShowClearDialog(true);
                                      }
                                    }}
                                    disabled={!canModifyFile(file) && !file.isServiceLog}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {file.isServiceLog ? 'Requiere reiniciar el servicio' : 
                                   !canModifyFile(file) ? 'Archivo bloqueado' : 'Vaciar contenido'}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => {
                                      setSelectedFile(file);
                                      if (file.isServiceLog) {
                                        setShowServiceLogInfo(true);
                                      } else {
                                        setShowDeleteDialog(true);
                                      }
                                    }}
                                    disabled={!canModifyFile(file) && !file.isServiceLog}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {file.isServiceLog ? 'Requiere reiniciar el servicio' : 
                                   !canModifyFile(file) ? 'Archivo bloqueado' : 'Eliminar archivo'}
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Log Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedFile?.isServiceLog ? (
                <Server className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
              {selectedFile?.name}
              {selectedFile?.isServiceLog && (
                <Badge variant="outline" className="bg-muted text-muted-foreground border-border/50 ml-2">
                  <Server className="h-3 w-3 mr-1" />
                  Servicio
                </Badge>
              )}
              {selectedFile?.isActive && !selectedFile?.isServiceLog && (
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30 ml-2">
                  <Zap className="h-3 w-3 mr-1" />
                  Activo
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {logLines} líneas • {selectedFile?.size}
            </DialogDescription>
          </DialogHeader>

          {/* Toolbar */}
          <div className="flex items-center gap-4 py-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en el log..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="level-filter" className="text-sm whitespace-nowrap">Nivel:</Label>
              <Select value={levelFilter} onValueChange={(v) => setLevelFilter(v as LogLevel)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Todos
                    </span>
                  </SelectItem>
                  <SelectItem value="INF">
                    <span className="flex items-center gap-2">
                      {getLevelIcon('INF')}
                      Info
                    </span>
                  </SelectItem>
                  <SelectItem value="WRN">
                    <span className="flex items-center gap-2">
                      {getLevelIcon('WRN')}
                      Warning
                    </span>
                  </SelectItem>
                  <SelectItem value="ERR">
                    <span className="flex items-center gap-2">
                      {getLevelIcon('ERR')}
                      Error
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-1" />
              Descargar
            </Button>
            {canManageLogs && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => {
                  if (selectedFile?.isServiceLog) {
                    setShowServiceLogInfo(true);
                  } else {
                    setShowClearDialog(true);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Vaciar
              </Button>
            )}
          </div>

          {/* Log Content */}
          <ScrollArea className="h-[50vh] border rounded-md bg-muted/30">
            {loadingContent ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredLines.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                <FileText className="h-12 w-12 mb-4" />
                <p>{logContent ? 'No se encontraron coincidencias' : 'El archivo está vacío'}</p>
              </div>
            ) : (
              <div className="p-4 font-mono text-xs space-y-0.5">
                {filteredLines.map((line, index) => (
                  <div 
                    key={index} 
                    className={`px-2 py-0.5 rounded whitespace-pre-wrap break-all ${getLineStyle(line)}`}
                  >
                    {line || '\u00A0'}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="text-xs text-muted-foreground text-right">
            Mostrando {filteredLines.length} de {logLines} líneas
          </div>
        </DialogContent>
      </Dialog>

      {/* Service Log Info Dialog */}
      <Dialog open={showServiceLogInfo} onOpenChange={setShowServiceLogInfo}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-muted-foreground" />
              Cómo limpiar logs de servicio
            </DialogTitle>
            <DialogDescription>
              Los archivos output.log y error.log están bloqueados por NSSM
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              El archivo <strong>{selectedFile?.name}</strong> ({selectedFile?.size}) es creado por NSSM 
              (Non-Sucking Service Manager) y está bloqueado mientras el servicio está corriendo.
            </p>
            
            <div className="bg-muted rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium">Ejecuta estos comandos como Administrador:</p>
              <div className="bg-background rounded p-3 font-mono text-xs space-y-2">
                <p className="text-muted-foreground"># 1. Detener el servicio</p>
                <p className="text-success">net stop SQLGuardObservatoryAPI</p>
                <p className="text-muted-foreground mt-3"># 2. Eliminar o vaciar el archivo</p>
                <p className="text-success">del "C:\ruta\al\backend\Logs\{selectedFile?.name}"</p>
                <p className="text-muted-foreground mt-3"># 3. Iniciar el servicio</p>
                <p className="text-success">net start SQLGuardObservatoryAPI</p>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/20">
              <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-xs text-warning">
                <strong>Nota:</strong> Mientras el servicio esté detenido, la API no estará disponible.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setShowServiceLogInfo(false)}>
              Entendido
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Clear Single File Dialog */}
      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar archivo de log?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción vaciará el contenido de <strong>{selectedFile?.name}</strong>. 
              El archivo seguirá existiendo pero quedará vacío. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearFile}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Vaciando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Vaciar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Single File Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar archivo de log?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción <strong>eliminará permanentemente</strong> el archivo <strong>{selectedFile?.name}</strong>. 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFile}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Eliminar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear All Dialog */}
      <AlertDialog open={showClearAllDialog} onOpenChange={setShowClearAllDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar todos los logs?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción vaciará el contenido de los archivos de log disponibles. 
              Los archivos bloqueados (activos, de servicio) serán omitidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleClearAll}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Vaciando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Vaciar Todo
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Purge Dialog */}
      <AlertDialog open={showPurgeDialog} onOpenChange={setShowPurgeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Purgar logs antiguos?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Esta acción <strong>eliminará permanentemente</strong> los archivos de log 
                  más antiguos que el período seleccionado. Los archivos bloqueados serán omitidos.
                </p>
                <div className="flex items-center gap-4">
                  <Label htmlFor="purge-days">Eliminar logs más antiguos de:</Label>
                  <Select value={purgeDays} onValueChange={setPurgeDays}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 días</SelectItem>
                      <SelectItem value="14">14 días</SelectItem>
                      <SelectItem value="30">30 días</SelectItem>
                      <SelectItem value="60">60 días</SelectItem>
                      <SelectItem value="90">90 días</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handlePurge}
              disabled={processing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Purgando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Purgar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
