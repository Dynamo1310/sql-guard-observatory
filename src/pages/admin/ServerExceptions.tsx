import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Capabilities } from '@/lib/capabilities';
import { serverExclusionsApi, ServerAlertExclusion } from '@/services/serverExclusionsApi';
import { sqlServerInventoryApi } from '@/services/sqlServerInventoryApi';
import { SqlServerInstance } from '@/types';
import { toast } from 'sonner';
import {
  ShieldOff, Plus, Trash2, RefreshCw, Loader2, Search,
  ServerOff, AlertTriangle, CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

export default function ServerExceptions() {
  const { hasCapability } = useAuth();
  const canConfigureAlerts = hasCapability(Capabilities.SystemConfigureAlerts);

  // Estado principal
  const [exclusions, setExclusions] = useState<ServerAlertExclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Estado del dialog de agregar
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedServer, setSelectedServer] = useState('');
  const [reason, setReason] = useState('');
  const [adding, setAdding] = useState(false);
  const [serverPopoverOpen, setServerPopoverOpen] = useState(false);

  // Estado del dialog de eliminar
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exclusionToDelete, setExclusionToDelete] = useState<ServerAlertExclusion | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inventario de servidores
  const [inventoryServers, setInventoryServers] = useState<SqlServerInstance[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Filtro de búsqueda en la tabla
  const [tableFilter, setTableFilter] = useState('');

  // Cargar exclusiones
  const loadExclusions = async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await serverExclusionsApi.getExclusions();
      setExclusions(data);
    } catch (error: any) {
      toast.error('Error al cargar exclusiones', { description: error.message });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Cargar inventario de servidores
  const loadInventory = async () => {
    setLoadingInventory(true);
    try {
      const response = await sqlServerInventoryApi.getInstances({ pageSize: 9999 });
      setInventoryServers(response.data || []);
    } catch (error: any) {
      console.error('Error cargando inventario:', error);
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    loadExclusions();
  }, []);

  // Servidores disponibles (no excluidos) para el selector
  const excludedNames = useMemo(() => {
    return new Set(exclusions.map(e => e.serverName.toLowerCase()));
  }, [exclusions]);

  const availableServers = useMemo(() => {
    // Obtener nombres de instancias únicos del inventario
    const uniqueServers = new Map<string, SqlServerInstance>();
    inventoryServers.forEach(s => {
      const key = s.NombreInstancia?.toLowerCase() || '';
      if (!uniqueServers.has(key)) {
        uniqueServers.set(key, s);
      }
    });

    return Array.from(uniqueServers.values())
      .filter(s => s.NombreInstancia && !excludedNames.has(s.NombreInstancia.toLowerCase()))
      .sort((a, b) => (a.NombreInstancia || '').localeCompare(b.NombreInstancia || ''));
  }, [inventoryServers, excludedNames]);

  // Exclusiones filtradas
  const filteredExclusions = useMemo(() => {
    if (!tableFilter) return exclusions;
    const lower = tableFilter.toLowerCase();
    return exclusions.filter(e =>
      e.serverName.toLowerCase().includes(lower) ||
      (e.reason?.toLowerCase().includes(lower)) ||
      (e.createdBy?.toLowerCase().includes(lower))
    );
  }, [exclusions, tableFilter]);

  // Abrir dialog de agregar
  const openAddDialog = () => {
    setSelectedServer('');
    setReason('');
    setAddDialogOpen(true);
    if (inventoryServers.length === 0) {
      loadInventory();
    }
  };

  // Agregar exclusión
  const handleAdd = async () => {
    if (!selectedServer.trim()) {
      toast.error('Seleccioná un servidor');
      return;
    }

    setAdding(true);
    try {
      await serverExclusionsApi.addExclusion({
        serverName: selectedServer.trim(),
        reason: reason.trim() || undefined,
      });
      toast.success('Servidor excluido', {
        description: `${selectedServer} ya no generará alertas`,
      });
      setAddDialogOpen(false);
      loadExclusions(true);
    } catch (error: any) {
      toast.error('Error al agregar exclusión', { description: error.message });
    } finally {
      setAdding(false);
    }
  };

  // Confirmar eliminación
  const confirmDelete = (exclusion: ServerAlertExclusion) => {
    setExclusionToDelete(exclusion);
    setDeleteDialogOpen(true);
  };

  // Eliminar exclusión
  const handleDelete = async () => {
    if (!exclusionToDelete) return;

    setDeleting(true);
    try {
      await serverExclusionsApi.removeExclusion(exclusionToDelete.id);
      toast.success('Exclusión eliminada', {
        description: `${exclusionToDelete.serverName} volverá a generar alertas`,
      });
      setDeleteDialogOpen(false);
      setExclusionToDelete(null);
      loadExclusions(true);
    } catch (error: any) {
      toast.error('Error al eliminar exclusión', { description: error.message });
    } finally {
      setDeleting(false);
    }
  };

  // Formatear fecha
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldOff className="h-8 w-8 text-orange-500" />
          <div>
            <h1 className="text-2xl font-bold">Excepciones de Servidores</h1>
            <p className="text-muted-foreground">
              Servidores excluidos de todas las alertas (dados de baja, apagados, etc.)
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadExclusions(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canConfigureAlerts && (
            <Button size="sm" onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Agregar Excepción
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ServerOff className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{exclusions.filter(e => e.isActive).length}</p>
                <p className="text-sm text-muted-foreground">Servidores Excluidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{exclusions.filter(e => e.expiresAtUtc).length}</p>
                <p className="text-sm text-muted-foreground">Con Expiración</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{exclusions.filter(e => !e.expiresAtUtc).length}</p>
                <p className="text-sm text-muted-foreground">Permanentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de exclusiones */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Listado de Excepciones</CardTitle>
              <CardDescription>
                Los servidores en esta lista no generarán alertas de ningún tipo
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar servidor..."
                value={tableFilter}
                onChange={(e) => setTableFilter(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredExclusions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {tableFilter ? 'No se encontraron resultados' : 'No hay servidores excluidos'}
              </p>
              <p className="text-sm mt-1">
                {tableFilter
                  ? 'Probá con otro término de búsqueda'
                  : 'Agregá servidores dados de baja para excluirlos de las alertas'}
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead>Creado por</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Expiración</TableHead>
                    <TableHead>Estado</TableHead>
                    {canConfigureAlerts && <TableHead className="w-[80px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExclusions.map((exclusion) => {
                    const isExpired = exclusion.expiresAtUtc && new Date(exclusion.expiresAtUtc) < new Date();
                    return (
                      <TableRow key={exclusion.id}>
                        <TableCell className="font-medium">{exclusion.serverName}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={exclusion.reason || ''}>
                          {exclusion.reason || <span className="text-muted-foreground italic">Sin motivo</span>}
                        </TableCell>
                        <TableCell>{exclusion.createdBy || '-'}</TableCell>
                        <TableCell className="text-sm">{formatDate(exclusion.createdAtUtc)}</TableCell>
                        <TableCell className="text-sm">
                          {exclusion.expiresAtUtc 
                            ? formatDate(exclusion.expiresAtUtc)
                            : <span className="text-muted-foreground">Permanente</span>}
                        </TableCell>
                        <TableCell>
                          {isExpired ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-300">
                              Expirada
                            </Badge>
                          ) : exclusion.isActive ? (
                            <Badge variant="default" className="bg-orange-500 hover:bg-orange-600">
                              Excluido
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactivo</Badge>
                          )}
                        </TableCell>
                        {canConfigureAlerts && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => confirmDelete(exclusion)}
                              title="Eliminar exclusión"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Dialog para agregar exclusión */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agregar Excepción de Servidor</DialogTitle>
            <DialogDescription>
              El servidor seleccionado no generará alertas de ningún tipo (servidores caídos, backups, discos, overview)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Selector de servidor con búsqueda */}
            <div className="space-y-2">
              <Label>Servidor</Label>
              <Popover open={serverPopoverOpen} onOpenChange={setServerPopoverOpen} modal={true}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={serverPopoverOpen}
                    className="w-full justify-between font-normal"
                  >
                    {selectedServer || 'Seleccionar servidor...'}
                    <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" sideOffset={4}>
                  <Command shouldFilter={true}>
                    <CommandInput
                      placeholder="Buscar servidor..."
                    />
                    <CommandList className="max-h-[250px] overflow-y-auto">
                      {loadingInventory ? (
                        <div className="flex items-center justify-center py-6">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Cargando inventario...</span>
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>No se encontraron servidores</CommandEmpty>
                          <CommandGroup heading="Servidores disponibles">
                            {availableServers.map((server) => (
                              <CommandItem
                                key={server.NombreInstancia}
                                value={server.NombreInstancia || ''}
                                onSelect={() => {
                                  setSelectedServer(server.NombreInstancia || '');
                                  setServerPopoverOpen(false);
                                }}
                                className="cursor-pointer"
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{server.NombreInstancia}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {server.ambiente} • {server.MajorVersion || 'N/A'}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Input manual como fallback */}
              <Input
                placeholder="O escribir el nombre manualmente..."
                value={selectedServer}
                onChange={(e) => setSelectedServer(e.target.value)}
              />
            </div>

            {/* Motivo */}
            <div className="space-y-2">
              <Label>Motivo (opcional)</Label>
              <Textarea
                placeholder="Ej: Servidor dado de baja el 15/02/2026..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAdd} disabled={adding || !selectedServer.trim()}>
              {adding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar Excepción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para confirmar eliminación */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar excepción?</AlertDialogTitle>
            <AlertDialogDescription>
              El servidor <strong>{exclusionToDelete?.serverName}</strong> volverá a generar alertas 
              normalmente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
