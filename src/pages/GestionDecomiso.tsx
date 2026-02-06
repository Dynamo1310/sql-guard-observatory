/**
 * Gestión de Decomiso de Bases de Datos
 * Módulo para gestionar el decomiso de bases de datos sin actividad
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database, Search, RefreshCw, Server, AlertTriangle, Edit,
  HardDrive, Clock, Ticket, ChevronUp, ChevronDown
} from 'lucide-react';
import {
  decomisosApi,
  DecomisoGridDto,
  DecomisoGridResponse,
  UpdateDecomisoRequest,
} from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ESTADO_OPTIONS = ['Pendiente', 'En Proceso', 'Completado', 'Rechazado'];

type SortField = 'serverName' | 'dbName' | 'databaseSizeGB' | 'diasInactividad' | 'estado' | 'fechaCarga';
type SortDirection = 'asc' | 'desc';

function getEstadoBadgeVariant(estado: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (estado) {
    case 'Completado':
      return 'default';
    case 'En Proceso':
      return 'secondary';
    case 'Rechazado':
      return 'destructive';
    default:
      return 'outline';
  }
}

function getEstadoBadgeClass(estado: string): string {
  switch (estado) {
    case 'Completado':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800';
    case 'En Proceso':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800';
    case 'Rechazado':
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800';
    default: // Pendiente
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function GestionDecomiso() {
  const queryClient = useQueryClient();
  const [searchServer, setSearchServer] = useState('');
  const [filterEstado, setFilterEstado] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('diasInactividad');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Dialog state
  const [editingItem, setEditingItem] = useState<DecomisoGridDto | null>(null);
  const [formData, setFormData] = useState<UpdateDecomisoRequest>({
    serverName: '',
    dbName: '',
    estado: 'Pendiente',
    ticketJira: '',
    responsable: '',
    observaciones: '',
  });

  // Fetch data
  const { data, isLoading, isFetching, refetch } = useQuery<DecomisoGridResponse>({
    queryKey: ['decomisos'],
    queryFn: () => decomisosApi.getAll(),
    staleTime: 2 * 60 * 1000,
  });

  // Mutation: update or upsert
  const updateMutation = useMutation({
    mutationFn: (params: { id: number | null; data: UpdateDecomisoRequest }) => {
      if (params.id) {
        return decomisosApi.update(params.id, params.data);
      }
      return decomisosApi.upsert(params.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decomisos'] });
      toast.success('Estado de decomiso actualizado correctamente');
      setEditingItem(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // Open edit modal
  const handleEdit = (item: DecomisoGridDto) => {
    setEditingItem(item);
    setFormData({
      serverName: item.serverName,
      dbName: item.dbName,
      estado: item.estado,
      ticketJira: item.ticketJira || '',
      responsable: item.responsable || '',
      observaciones: item.observaciones || '',
    });
  };

  // Submit edit
  const handleSubmit = () => {
    if (!editingItem) return;
    updateMutation.mutate({
      id: editingItem.gestionId,
      data: formData,
    });
  };

  // Sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ?
      <ChevronUp className="inline h-3 w-3 ml-1" /> :
      <ChevronDown className="inline h-3 w-3 ml-1" />;
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!data?.items) return [];

    let items = [...data.items];

    // Filter by server name
    if (searchServer) {
      items = items.filter(i =>
        i.serverName.toLowerCase().includes(searchServer.toLowerCase()) ||
        i.dbName.toLowerCase().includes(searchServer.toLowerCase())
      );
    }

    // Filter by estado
    if (filterEstado && filterEstado !== 'all') {
      items = items.filter(i => i.estado === filterEstado);
    }

    // Sort
    items.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'serverName':
          comparison = a.serverName.localeCompare(b.serverName);
          break;
        case 'dbName':
          comparison = a.dbName.localeCompare(b.dbName);
          break;
        case 'databaseSizeGB':
          comparison = (a.databaseSizeGB || 0) - (b.databaseSizeGB || 0);
          break;
        case 'diasInactividad':
          comparison = a.diasInactividad - b.diasInactividad;
          break;
        case 'estado':
          comparison = a.estado.localeCompare(b.estado);
          break;
        case 'fechaCarga':
          comparison = new Date(a.fechaCarga).getTime() - new Date(b.fechaCarga).getTime();
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [data?.items, searchServer, filterEstado, sortField, sortDirection]);

  // Compute filtered KPIs
  const resumen = useMemo(() => {
    if (!data?.resumen) return { totalBases: 0, espacioRecuperableGB: 0, pendientesAccion: 0 };
    return data.resumen;
  }, [data?.resumen]);

  // Unique servers for info
  const uniqueServers = useMemo(() => {
    if (!data?.items) return [];
    return [...new Set(data.items.map(i => i.serverName))].sort();
  }, [data?.items]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Gestión de Decomiso de BD
          </h1>
          <p className="text-muted-foreground mt-1">
            Gestión del decomiso de bases de datos sin actividad detectadas en el reporte
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Total de Bases</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{resumen.totalBases}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Bases sin actividad detectadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Espacio Recuperable</CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{resumen.espacioRecuperableGB.toFixed(2)} GB</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Espacio total en disco recuperable
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Pendientes de Acción</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {resumen.pendientesAccion}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Bases que requieren gestión
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por servidor o base de datos..."
                  value={searchServer}
                  onChange={(e) => setSearchServer(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full sm:w-48">
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  {ESTADO_OPTIONS.map(estado => (
                    <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              <Server className="h-4 w-4" />
              {uniqueServers.length} servidores | {filteredItems.length} registros
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No se encontraron registros</p>
              <p className="text-sm">Ajusta los filtros o actualiza los datos</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort('serverName')}
                    >
                      Servidor <SortIcon field="serverName" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort('dbName')}
                    >
                      Base de Datos <SortIcon field="dbName" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap text-right"
                      onClick={() => handleSort('databaseSizeGB')}
                    >
                      Tamaño (GB) <SortIcon field="databaseSizeGB" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Última Actividad</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap text-right"
                      onClick={() => handleSort('diasInactividad')}
                    >
                      Días Inactivo <SortIcon field="diasInactividad" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                      onClick={() => handleSort('estado')}
                    >
                      Estado <SortIcon field="estado" />
                    </TableHead>
                    <TableHead className="whitespace-nowrap">Ticket Jira</TableHead>
                    <TableHead className="whitespace-nowrap">Responsable</TableHead>
                    <TableHead className="whitespace-nowrap text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, idx) => (
                    <TableRow
                      key={`${item.serverName}-${item.dbName}-${idx}`}
                      className={cn(
                        item.diasInactividad > 90 && 'bg-red-50 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/30',
                      )}
                    >
                      <TableCell className="font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.serverName}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Database className="h-3.5 w-3.5 text-muted-foreground" />
                          {item.dbName}
                        </div>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap font-mono">
                        {item.databaseSizeGB.toFixed(2)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDate(item.ultimaActividad)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className={cn(
                            'font-mono font-medium',
                            item.diasInactividad > 90 && 'text-red-600 dark:text-red-400',
                            item.diasInactividad > 30 && item.diasInactividad <= 90 && 'text-yellow-600 dark:text-yellow-400',
                          )}>
                            {item.diasInactividad}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant={getEstadoBadgeVariant(item.estado)}
                          className={getEstadoBadgeClass(item.estado)}
                        >
                          {item.estado}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.ticketJira ? (
                          <div className="flex items-center gap-1">
                            <Ticket className="h-3.5 w-3.5 text-blue-500" />
                            {item.ticketJira}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {item.responsable || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(item)}
                          title="Editar estado de decomiso"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Gestión de Decomiso
            </DialogTitle>
            <DialogDescription>
              {editingItem && (
                <span>
                  <strong>{editingItem.serverName}</strong> / <strong>{editingItem.dbName}</strong>
                  {' '}({editingItem.databaseSizeGB.toFixed(2)} GB — {editingItem.diasInactividad} días inactivo)
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={formData.estado}
                onValueChange={(value) => setFormData(prev => ({ ...prev, estado: value }))}
              >
                <SelectTrigger id="estado">
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADO_OPTIONS.map(estado => (
                    <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ticketJira">Ticket Jira</Label>
              <Input
                id="ticketJira"
                placeholder="Ej: DBA-1234"
                value={formData.ticketJira || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, ticketJira: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="responsable">Responsable</Label>
              <Input
                id="responsable"
                placeholder="Nombre del responsable"
                value={formData.responsable || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, responsable: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                placeholder="Notas adicionales sobre el decomiso..."
                rows={3}
                value={formData.observaciones || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingItem(null)}
              disabled={updateMutation.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
