import { useState, useEffect, useMemo } from 'react';
import {
  Server,
  Settings,
  Plus,
  Search,
  RefreshCw,
  Check,
  X,
  Power,
  PowerOff,
  Trash2,
  Edit2,
  Download,
  History,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertTriangle,
  Shield,
  RotateCcw,
  GitBranch,
  Wrench,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  operationalServersApi,
  OperationalServerDto,
  InventoryServerInfoDto,
  OperationalServerAuditDto,
  CreateOperationalServerRequest,
  UpdateOperationalServerRequest,
} from '@/services/api';
import { cn } from '@/lib/utils';

export default function OperationalServersConfig() {
  // Estados de datos
  const [servers, setServers] = useState<OperationalServerDto[]>([]);
  const [inventoryServers, setInventoryServers] = useState<InventoryServerInfoDto[]>([]);
  const [auditHistory, setAuditHistory] = useState<OperationalServerAuditDto[]>([]);
  const [selectedServersToImport, setSelectedServersToImport] = useState<Set<string>>(new Set());

  // Estados de UI
  const [loading, setLoading] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInventory, setSearchInventory] = useState('');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('all');
  const [filterEnabled, setFilterEnabled] = useState<string>('all');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [editingServer, setEditingServer] = useState<OperationalServerDto | null>(null);
  const [deletingServer, setDeletingServer] = useState<OperationalServerDto | null>(null);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form para agregar servidor manual
  const [newServer, setNewServer] = useState<CreateOperationalServerRequest>({
    serverName: '',
    instanceName: '',
    description: '',
    ambiente: '',
    isFromInventory: false,
    enabledForRestart: true,
    enabledForFailover: false,
    enabledForPatching: false,
    notes: '',
  });

  // Form para editar servidor
  const [editForm, setEditForm] = useState<UpdateOperationalServerRequest>({
    description: '',
    ambiente: '',
    enabled: true,
    enabledForRestart: true,
    enabledForFailover: false,
    enabledForPatching: false,
    notes: '',
  });

  // Cargar servidores operacionales
  const loadServers = async () => {
    setLoading(true);
    try {
      const data = await operationalServersApi.getServers();
      setServers(data);
    } catch (error: any) {
      toast.error('Error al cargar servidores', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Cargar servidores del inventario
  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      const data = await operationalServersApi.getInventoryServers();
      setInventoryServers(data);
    } catch (error: any) {
      toast.error('Error al cargar inventario', { description: error.message });
    } finally {
      setLoadingInventory(false);
    }
  };

  // Cargar historial de auditoría
  const loadAuditHistory = async () => {
    setLoadingAudit(true);
    try {
      const data = await operationalServersApi.getAuditHistory(50);
      setAuditHistory(data);
    } catch (error: any) {
      toast.error('Error al cargar historial');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  // Filtrar servidores
  const filteredServers = useMemo(() => {
    return servers.filter(server => {
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (!server.serverName.toLowerCase().includes(search) &&
            !(server.instanceName?.toLowerCase().includes(search)) &&
            !(server.description?.toLowerCase().includes(search))) {
          return false;
        }
      }

      if (filterAmbiente !== 'all' && server.ambiente?.toLowerCase() !== filterAmbiente.toLowerCase()) {
        return false;
      }

      if (filterEnabled === 'enabled' && !server.enabled) return false;
      if (filterEnabled === 'disabled' && server.enabled) return false;

      return true;
    });
  }, [servers, searchTerm, filterAmbiente, filterEnabled]);

  // Filtrar servidores del inventario
  const filteredInventory = useMemo(() => {
    return inventoryServers.filter(server => {
      if (!searchInventory) return true;
      const search = searchInventory.toLowerCase();
      return server.serverName.toLowerCase().includes(search) ||
             (server.instanceName?.toLowerCase().includes(search)) ||
             (server.ambiente?.toLowerCase().includes(search));
    });
  }, [inventoryServers, searchInventory]);

  // Ambientes disponibles
  const availableAmbientes = useMemo(() => {
    const ambientes = new Set<string>();
    servers.forEach(s => {
      if (s.ambiente) ambientes.add(s.ambiente);
    });
    return Array.from(ambientes).sort();
  }, [servers]);

  // Toggle servidor habilitado
  const handleToggleServer = async (server: OperationalServerDto) => {
    try {
      const result = await operationalServersApi.toggleServer(server.id);
      toast.success(result.message);
      await loadServers();
    } catch (error: any) {
      toast.error('Error al cambiar estado', { description: error.message });
    }
  };

  // Abrir diálogo de edición
  const openEditDialog = (server: OperationalServerDto) => {
    setEditingServer(server);
    setEditForm({
      description: server.description || '',
      ambiente: server.ambiente || '',
      enabled: server.enabled,
      enabledForRestart: server.enabledForRestart,
      enabledForFailover: server.enabledForFailover,
      enabledForPatching: server.enabledForPatching,
      notes: server.notes || '',
    });
    setShowEditDialog(true);
  };

  // Guardar edición
  const handleSaveEdit = async () => {
    if (!editingServer) return;
    setSaving(true);
    try {
      await operationalServersApi.updateServer(editingServer.id, editForm);
      toast.success('Servidor actualizado');
      setShowEditDialog(false);
      await loadServers();
    } catch (error: any) {
      toast.error('Error al actualizar', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  // Crear servidor manual
  const handleCreateServer = async () => {
    if (!newServer.serverName.trim()) {
      toast.error('El nombre del servidor es requerido');
      return;
    }
    setSaving(true);
    try {
      await operationalServersApi.createServer(newServer);
      toast.success('Servidor agregado');
      setShowAddDialog(false);
      setNewServer({
        serverName: '',
        instanceName: '',
        description: '',
        ambiente: '',
        isFromInventory: false,
        enabledForRestart: true,
        enabledForFailover: false,
        enabledForPatching: false,
        notes: '',
      });
      await loadServers();
    } catch (error: any) {
      toast.error('Error al agregar servidor', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  // Eliminar servidor
  const handleDeleteServer = async () => {
    if (!deletingServer) return;
    try {
      await operationalServersApi.deleteServer(deletingServer.id);
      toast.success('Servidor eliminado');
      setShowDeleteDialog(false);
      setDeletingServer(null);
      await loadServers();
    } catch (error: any) {
      toast.error('Error al eliminar', { description: error.message });
    }
  };

  // Abrir diálogo de importación
  const openImportDialog = async () => {
    setShowImportDialog(true);
    setSelectedServersToImport(new Set());
    await loadInventory();
  };

  // Toggle selección para importar
  const toggleServerToImport = (serverName: string) => {
    setSelectedServersToImport(prev => {
      const next = new Set(prev);
      if (next.has(serverName)) {
        next.delete(serverName);
      } else {
        next.add(serverName);
      }
      return next;
    });
  };

  // Importar servidores seleccionados
  const handleImportServers = async () => {
    if (selectedServersToImport.size === 0) {
      toast.warning('Selecciona al menos un servidor');
      return;
    }
    setImporting(true);
    try {
      const result = await operationalServersApi.importFromInventory({
        serverNames: Array.from(selectedServersToImport),
      });
      if (result.success) {
        toast.success(result.message);
        setShowImportDialog(false);
        await loadServers();
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      toast.error('Error al importar', { description: error.message });
    } finally {
      setImporting(false);
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

  // Formatear fecha
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Obtener color de acción de auditoría
  const getAuditActionColor = (action: string) => {
    switch (action) {
      case 'Created': return 'bg-emerald-500/10 text-emerald-500';
      case 'Updated': return 'bg-blue-500/10 text-blue-500';
      case 'Deleted': return 'bg-red-500/10 text-red-500';
      case 'Enabled': return 'bg-green-500/10 text-green-500';
      case 'Disabled': return 'bg-amber-500/10 text-amber-500';
      default: return 'bg-slate-500/10 text-slate-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-500/10">
              <Settings className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Configuración de Servidores Operacionales</h1>
              <p className="text-sm text-muted-foreground">
                Configura qué servidores estarán disponibles para operaciones controladas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Historial */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" onClick={loadAuditHistory}>
                  <History className="w-4 h-4 mr-2" />
                  Historial
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[500px]">
                <SheetHeader>
                  <SheetTitle>Historial de Cambios</SheetTitle>
                  <SheetDescription>
                    Últimos cambios realizados en la configuración
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  {loadingAudit ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : auditHistory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay historial disponible
                    </div>
                  ) : (
                    <ScrollArea className="h-[calc(100vh-180px)]">
                      <div className="space-y-3 pr-4">
                        {auditHistory.map(audit => (
                          <Card key={audit.id} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <Badge className={cn("text-xs", getAuditActionColor(audit.action))}>
                                  {audit.action}
                                </Badge>
                                <p className="font-medium mt-1">{audit.serverName}</p>
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDate(audit.changedAt)}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Por: {audit.changedByUserName || 'Desconocido'}
                            </p>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <Button variant="outline" size="sm" onClick={loadServers} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
              Actualizar
            </Button>

            <Button variant="outline" size="sm" onClick={openImportDialog}>
              <Download className="w-4 h-4 mr-2" />
              Importar del Inventario
            </Button>

            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Agregar Manual
            </Button>
          </div>
        </div>
      </div>

      {/* Contenido Principal */}
      <div className="flex-1 p-6 overflow-auto">
        {/* Info banner */}
        <Card className="mb-4 bg-violet-500/5 border-violet-500/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-violet-500">¿Cómo funciona?</p>
                <p className="text-muted-foreground mt-1">
                  Los servidores que configures aquí serán los únicos visibles en las vistas de operaciones
                  (reinicios, failovers, parcheos). Si no hay ningún servidor configurado, se mostrarán
                  todos los servidores del inventario por defecto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filtros */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar servidor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>

          <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="Ambiente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los ambientes</SelectItem>
              {availableAmbientes.map(amb => (
                <SelectItem key={amb} value={amb.toLowerCase()}>{amb}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterEnabled} onValueChange={setFilterEnabled}>
            <SelectTrigger className="h-9 w-[150px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="enabled">Habilitados</SelectItem>
              <SelectItem value="disabled">Deshabilitados</SelectItem>
            </SelectContent>
          </Select>

          <div className="ml-auto text-sm text-muted-foreground flex items-center gap-2">
            <Badge variant="outline">{filteredServers.length}</Badge>
            <span>servidor(es)</span>
          </div>
        </div>

        {/* Lista de servidores */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredServers.length === 0 ? (
          <Card className="p-12 text-center">
            <Server className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="font-medium text-lg mb-2">No hay servidores configurados</h3>
            <p className="text-muted-foreground mb-4">
              Importa servidores del inventario o agrega uno manualmente
            </p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={openImportDialog}>
                <Download className="w-4 h-4 mr-2" />
                Importar del Inventario
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Agregar Manual
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredServers.map(server => (
              <Card key={server.id} className={cn(
                "transition-all",
                !server.enabled && "opacity-60 bg-muted/30"
              )}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Estado */}
                    <div className="shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-9 w-9 rounded-full",
                          server.enabled 
                            ? "text-emerald-500 hover:bg-emerald-500/10" 
                            : "text-slate-400 hover:bg-slate-500/10"
                        )}
                        onClick={() => handleToggleServer(server)}
                        title={server.enabled ? "Desactivar" : "Activar"}
                      >
                        {server.enabled ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </Button>
                    </div>

                    {/* Info del servidor */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{server.serverName}</span>
                        {server.instanceName && server.instanceName !== server.serverName && (
                          <span className="text-sm text-muted-foreground">({server.instanceName})</span>
                        )}
                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px] px-1.5", getAmbienteColor(server.ambiente))}
                        >
                          {server.ambiente || 'N/A'}
                        </Badge>
                        {!server.isFromInventory && (
                          <Badge variant="outline" className="text-[10px] px-1.5 bg-purple-500/10 text-purple-500 border-purple-500/20">
                            Manual
                          </Badge>
                        )}
                      </div>
                      {server.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">{server.description}</p>
                      )}
                    </div>

                    {/* Permisos de operaciones */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] px-2 py-0.5 gap-1",
                          server.enabledForRestart 
                            ? "bg-orange-500/10 text-orange-500 border-orange-500/20" 
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reinicio
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] px-2 py-0.5 gap-1",
                          server.enabledForFailover 
                            ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <GitBranch className="w-3 h-3" />
                        Failover
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-[10px] px-2 py-0.5 gap-1",
                          server.enabledForPatching 
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        <Wrench className="w-3 h-3" />
                        Parcheo
                      </Badge>
                    </div>

                    {/* Acciones */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(server)}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeletingServer(server);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Diálogo de agregar servidor manual */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Servidor Manual</DialogTitle>
            <DialogDescription>
              Agrega un servidor que no está en el inventario
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Nombre del Servidor *</label>
              <Input
                value={newServer.serverName}
                onChange={(e) => setNewServer({ ...newServer, serverName: e.target.value })}
                placeholder="Ej: SQLPROD01"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Nombre de Instancia</label>
              <Input
                value={newServer.instanceName || ''}
                onChange={(e) => setNewServer({ ...newServer, instanceName: e.target.value })}
                placeholder="Opcional"
                className="mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Ambiente</label>
              <Select 
                value={newServer.ambiente || 'none'} 
                onValueChange={(v) => setNewServer({ ...newServer, ambiente: v === 'none' ? '' : v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  <SelectItem value="Produccion">Producción</SelectItem>
                  <SelectItem value="Testing">Testing</SelectItem>
                  <SelectItem value="Desarrollo">Desarrollo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                value={newServer.description || ''}
                onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                placeholder="Descripción opcional..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Operaciones habilitadas</label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={newServer.enabledForRestart}
                  onCheckedChange={(c) => setNewServer({ ...newServer, enabledForRestart: !!c })}
                />
                <span className="text-sm">Reinicio</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={newServer.enabledForFailover}
                  onCheckedChange={(c) => setNewServer({ ...newServer, enabledForFailover: !!c })}
                />
                <span className="text-sm">Failover</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={newServer.enabledForPatching}
                  onCheckedChange={(c) => setNewServer({ ...newServer, enabledForPatching: !!c })}
                />
                <span className="text-sm">Parcheo</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateServer} disabled={saving || !newServer.serverName.trim()}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de editar servidor */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Servidor</DialogTitle>
            <DialogDescription>
              {editingServer?.serverName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Ambiente</label>
              <Select 
                value={editForm.ambiente || 'none'} 
                onValueChange={(v) => setEditForm({ ...editForm, ambiente: v === 'none' ? '' : v })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin especificar</SelectItem>
                  <SelectItem value="Produccion">Producción</SelectItem>
                  <SelectItem value="Testing">Testing</SelectItem>
                  <SelectItem value="Desarrollo">Desarrollo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Descripción</label>
              <Textarea
                value={editForm.description || ''}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descripción opcional..."
                className="mt-1"
                rows={2}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Servidor habilitado</label>
              <Switch
                checked={editForm.enabled}
                onCheckedChange={(c) => setEditForm({ ...editForm, enabled: c })}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Operaciones habilitadas</label>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={editForm.enabledForRestart}
                  onCheckedChange={(c) => setEditForm({ ...editForm, enabledForRestart: !!c })}
                />
                <span className="text-sm">Reinicio</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={editForm.enabledForFailover}
                  onCheckedChange={(c) => setEditForm({ ...editForm, enabledForFailover: !!c })}
                />
                <span className="text-sm">Failover</span>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={editForm.enabledForPatching}
                  onCheckedChange={(c) => setEditForm({ ...editForm, enabledForPatching: !!c })}
                />
                <span className="text-sm">Parcheo</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notas</label>
              <Textarea
                value={editForm.notes || ''}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Notas adicionales..."
                className="mt-1"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar servidor?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar <strong>{deletingServer?.serverName}</strong> de la configuración?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteServer} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo de importación desde inventario */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Importar desde Inventario</DialogTitle>
            <DialogDescription>
              Selecciona los servidores del inventario que deseas agregar
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar en inventario..."
                value={searchInventory}
                onChange={(e) => setSearchInventory(e.target.value)}
                className="pl-9"
              />
            </div>

            {loadingInventory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ScrollArea className="h-[400px] border rounded-md">
                <div className="p-2">
                  {filteredInventory.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay servidores disponibles
                    </div>
                  ) : (
                    filteredInventory.map(server => (
                      <div
                        key={server.serverName}
                        onClick={() => !server.alreadyAdded && toggleServerToImport(server.serverName)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg mb-1 transition-all",
                          server.alreadyAdded 
                            ? "opacity-50 cursor-not-allowed bg-muted/50" 
                            : "cursor-pointer hover:bg-accent/50",
                          selectedServersToImport.has(server.serverName) && "bg-primary/5 ring-1 ring-primary/20"
                        )}
                      >
                        <Checkbox
                          checked={server.alreadyAdded || selectedServersToImport.has(server.serverName)}
                          disabled={server.alreadyAdded}
                          onCheckedChange={() => !server.alreadyAdded && toggleServerToImport(server.serverName)}
                        />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{server.serverName}</span>
                            {server.alreadyAdded && (
                              <Badge variant="secondary" className="text-[10px]">Ya agregado</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            {server.instanceName && <span>{server.instanceName}</span>}
                            {server.majorVersion && <span>• {server.majorVersion}</span>}
                            {server.isAlwaysOn && (
                              <Badge variant="outline" className="text-[9px] px-1 bg-purple-500/10 text-purple-500">AG</Badge>
                            )}
                          </div>
                        </div>

                        <Badge 
                          variant="outline" 
                          className={cn("text-[10px] shrink-0", getAmbienteColor(server.ambiente))}
                        >
                          {server.ambiente || 'N/A'}
                        </Badge>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            )}

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {selectedServersToImport.size} servidor(es) seleccionado(s)
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const available = filteredInventory.filter(s => !s.alreadyAdded).map(s => s.serverName);
                  setSelectedServersToImport(new Set(available));
                }}
              >
                Seleccionar todos
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImportServers} disabled={importing || selectedServersToImport.size === 0}>
              {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
              Importar ({selectedServersToImport.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}




