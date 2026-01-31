/**
 * Página de Planificación de Parcheos
 * Permite planificar fechas, asignar DBAs y hacer seguimiento de parcheos
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  CalendarDays, Plus, RefreshCw, Search, X, Pencil, Trash2,
  CheckCircle2, XCircle, Clock, ArrowUpDown, ArrowUp, ArrowDown,
  Server, UserCheck, Calendar, AlertCircle, Sparkles, Lightbulb, Mail
} from 'lucide-react';
import { 
  patchPlanApi, 
  PatchPlanDto, 
  CreatePatchPlanRequest, 
  UpdatePatchPlanRequest,
  AvailableDbaDto,
  NonCompliantServerDto,
  SuggestedWindowDto,
  PatchPlanStatus,
  PatchModeType,
  PatchPriority,
} from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SortField = 'scheduledDate' | 'serverName' | 'status' | 'assignedDbaName';
type SortDirection = 'asc' | 'desc';

// Componente de header ordenable
const SortableHeader = ({ 
  field, 
  currentField, 
  direction, 
  onClick, 
  children 
}: { 
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onClick: (field: SortField) => void;
  children: React.ReactNode;
}) => (
  <TableHead 
    className="cursor-pointer hover:bg-muted/50 select-none"
    onClick={() => onClick(field)}
  >
    <div className="flex items-center gap-1">
      {children}
      {currentField === field ? (
        direction === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
      ) : (
        <ArrowUpDown className="h-4 w-4 opacity-30" />
      )}
    </div>
  </TableHead>
);

// Función para obtener el color del badge de estado
const getStatusBadge = (status: string) => {
  const statusStyles: Record<string, string> = {
    [PatchPlanStatus.Planificado]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    [PatchPlanStatus.EnCoordinacion]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    [PatchPlanStatus.SinRespuesta]: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100',
    [PatchPlanStatus.Aprobado]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    [PatchPlanStatus.EnProceso]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    [PatchPlanStatus.Parcheado]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    [PatchPlanStatus.Fallido]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
    [PatchPlanStatus.Cancelado]: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100',
    [PatchPlanStatus.Reprogramado]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100',
  };
  return <Badge className={statusStyles[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
};

// Formulario de plan de parcheo
interface PlanFormData {
  serverName: string;
  instanceName: string;
  currentVersion: string;
  targetVersion: string;
  isCoordinated: boolean;
  productOwnerNote: string;
  scheduledDate: string;
  windowStartTime: string;
  windowEndTime: string;
  assignedDbaId: string;
  notes: string;
  // Nuevos campos
  status: string;
  patchMode: string;
  coordinationOwnerName: string;
  coordinationOwnerEmail: string;
  cellTeam: string;
  priority: string;
  estimatedDuration: string;
  ambiente: string;
}

const emptyFormData: PlanFormData = {
  serverName: '',
  instanceName: '',
  currentVersion: '',
  targetVersion: '',
  isCoordinated: false,
  productOwnerNote: '',
  scheduledDate: '',
  windowStartTime: '22:00',
  windowEndTime: '06:00',
  assignedDbaId: '',
  notes: '',
  // Nuevos campos
  status: PatchPlanStatus.Planificado,
  patchMode: PatchModeType.Manual,
  coordinationOwnerName: '',
  coordinationOwnerEmail: '',
  cellTeam: '',
  priority: '',
  estimatedDuration: '120',
  ambiente: '',
};

export default function PatchPlanner() {
  const queryClient = useQueryClient();
  
  // Estados
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dbaFilter, setDbaFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('scheduledDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Modal states
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PatchPlanDto | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<PatchPlanDto | null>(null);
  const [statusPlan, setStatusPlan] = useState<PatchPlanDto | null>(null);
  const [formData, setFormData] = useState<PlanFormData>(emptyFormData);
  const [statusNotes, setStatusNotes] = useState('');
  const [suggestedWindows, setSuggestedWindows] = useState<SuggestedWindowDto[]>([]);
  const [isSuggestingWindows, setIsSuggestingWindows] = useState(false);

  // Queries
  const { data: plans, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['patchPlans'],
    queryFn: () => patchPlanApi.getAll(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: dbas } = useQuery({
    queryKey: ['availableDbas'],
    queryFn: () => patchPlanApi.getAvailableDbas(),
    staleTime: 10 * 60 * 1000,
  });

  // Query para servidores no-compliance
  const { data: nonCompliantServers } = useQuery({
    queryKey: ['nonCompliantServers'],
    queryFn: () => patchPlanApi.getNonCompliantServers(),
    staleTime: 5 * 60 * 1000,
  });

  // Query para células
  const { data: cellTeams } = useQuery({
    queryKey: ['cellTeams'],
    queryFn: () => patchPlanApi.getCellTeams(),
    staleTime: 10 * 60 * 1000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: CreatePatchPlanRequest) => patchPlanApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patchPlans'] });
      toast.success('Plan de parcheo creado exitosamente');
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al crear el plan');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePatchPlanRequest }) => 
      patchPlanApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patchPlans'] });
      toast.success('Plan de parcheo actualizado exitosamente');
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al actualizar el plan');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => patchPlanApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patchPlans'] });
      toast.success('Plan de parcheo eliminado');
      setIsDeleteDialogOpen(false);
      setDeletingPlan(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al eliminar el plan');
    },
  });

  const markStatusMutation = useMutation({
    mutationFn: ({ id, wasPatched, notes }: { id: number; wasPatched: boolean; notes?: string }) => 
      patchPlanApi.markStatus(id, { wasPatched, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patchPlans'] });
      toast.success('Estado actualizado exitosamente');
      setIsStatusDialogOpen(false);
      setStatusPlan(null);
      setStatusNotes('');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al actualizar el estado');
    },
  });

  // Métricas
  const metrics = useMemo(() => {
    if (!plans) return { total: 0, pending: 0, inProgress: 0, patched: 0, failed: 0 };
    const pendingStatuses = [PatchPlanStatus.Planificado, PatchPlanStatus.EnCoordinacion, PatchPlanStatus.SinRespuesta, PatchPlanStatus.Aprobado];
    const inProgressStatuses = [PatchPlanStatus.EnProceso];
    const completedStatuses = [PatchPlanStatus.Parcheado];
    const failedStatuses = [PatchPlanStatus.Fallido, PatchPlanStatus.Cancelado];
    return {
      total: plans.length,
      pending: plans.filter(p => pendingStatuses.includes(p.status)).length,
      inProgress: plans.filter(p => inProgressStatuses.includes(p.status)).length,
      patched: plans.filter(p => completedStatuses.includes(p.status)).length,
      failed: plans.filter(p => failedStatuses.includes(p.status)).length,
    };
  }, [plans]);

  // Filtrado y ordenamiento
  const filteredAndSortedPlans = useMemo(() => {
    if (!plans) return [];
    
    let filtered = [...plans];
    
    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.serverName.toLowerCase().includes(term) ||
        p.instanceName?.toLowerCase().includes(term) ||
        p.currentVersion.toLowerCase().includes(term) ||
        p.targetVersion.toLowerCase().includes(term)
      );
    }
    
    // Filtrar por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }
    
    // Filtrar por DBA
    if (dbaFilter !== 'all') {
      filtered = filtered.filter(p => p.assignedDbaId === dbaFilter);
    }
    
    // Ordenar
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'scheduledDate':
          comparison = new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime();
          break;
        case 'serverName':
          comparison = a.serverName.localeCompare(b.serverName);
          break;
        case 'status':
          const statusOrderMap: Record<string, number> = {
            [PatchPlanStatus.EnProceso]: 0,
            [PatchPlanStatus.Planificado]: 1,
            [PatchPlanStatus.EnCoordinacion]: 2,
            [PatchPlanStatus.SinRespuesta]: 3,
            [PatchPlanStatus.Aprobado]: 4,
            [PatchPlanStatus.Parcheado]: 5,
            [PatchPlanStatus.Reprogramado]: 6,
            [PatchPlanStatus.Fallido]: 7,
            [PatchPlanStatus.Cancelado]: 8,
          };
          comparison = (statusOrderMap[a.status] ?? 99) - (statusOrderMap[b.status] ?? 99);
          break;
        case 'assignedDbaName':
          comparison = (a.assignedDbaName || '').localeCompare(b.assignedDbaName || '');
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [plans, searchTerm, statusFilter, dbaFilter, sortField, sortDirection]);

  // Handlers
  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleOpenCreate = () => {
    setEditingPlan(null);
    setFormData(emptyFormData);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (plan: PatchPlanDto) => {
    setEditingPlan(plan);
    setFormData({
      serverName: plan.serverName,
      instanceName: plan.instanceName || '',
      currentVersion: plan.currentVersion,
      targetVersion: plan.targetVersion,
      isCoordinated: plan.isCoordinated,
      productOwnerNote: plan.productOwnerNote || '',
      scheduledDate: plan.scheduledDate.split('T')[0],
      windowStartTime: plan.windowStartTime,
      windowEndTime: plan.windowEndTime,
      assignedDbaId: plan.assignedDbaId || '',
      notes: plan.notes || '',
      // Nuevos campos
      status: plan.status || PatchPlanStatus.Planificado,
      patchMode: plan.patchMode || PatchModeType.Manual,
      coordinationOwnerName: plan.coordinationOwnerName || '',
      coordinationOwnerEmail: plan.coordinationOwnerEmail || '',
      cellTeam: plan.cellTeam || '',
      priority: plan.priority || '',
      estimatedDuration: plan.estimatedDuration?.toString() || '120',
      ambiente: plan.ambiente || '',
    });
    setIsDialogOpen(true);
  };

  // Handler para seleccionar servidor no-compliance
  const handleSelectNonCompliantServer = (server: NonCompliantServerDto) => {
    setFormData(prev => ({
      ...prev,
      serverName: server.serverName,
      instanceName: server.instanceName || '',
      currentVersion: server.currentBuild || '',
      targetVersion: server.requiredBuild || '',
      ambiente: server.ambiente || '',
    }));
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPlan(null);
    setFormData(emptyFormData);
    setSuggestedWindows([]);
  };

  const handleSubmit = () => {
    if (!formData.serverName || !formData.currentVersion || !formData.targetVersion || !formData.scheduledDate) {
      toast.error('Por favor complete los campos obligatorios');
      return;
    }

    const data: CreatePatchPlanRequest = {
      serverName: formData.serverName,
      instanceName: formData.instanceName || undefined,
      currentVersion: formData.currentVersion,
      targetVersion: formData.targetVersion,
      isCoordinated: formData.isCoordinated,
      productOwnerNote: formData.productOwnerNote || undefined,
      scheduledDate: formData.scheduledDate,
      windowStartTime: formData.windowStartTime,
      windowEndTime: formData.windowEndTime,
      assignedDbaId: formData.assignedDbaId || undefined,
      notes: formData.notes || undefined,
      // Nuevos campos
      status: formData.status,
      patchMode: formData.patchMode,
      coordinationOwnerName: formData.coordinationOwnerName || undefined,
      coordinationOwnerEmail: formData.coordinationOwnerEmail || undefined,
      cellTeam: formData.cellTeam || undefined,
      priority: formData.priority || undefined,
      estimatedDuration: formData.estimatedDuration ? parseInt(formData.estimatedDuration) : undefined,
      ambiente: formData.ambiente || undefined,
    };

    if (editingPlan) {
      updateMutation.mutate({ id: editingPlan.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleDelete = (plan: PatchPlanDto) => {
    setDeletingPlan(plan);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (deletingPlan) {
      deleteMutation.mutate(deletingPlan.id);
    }
  };

  const handleOpenStatusDialog = (plan: PatchPlanDto) => {
    setStatusPlan(plan);
    setStatusNotes('');
    setIsStatusDialogOpen(true);
  };

  const handleMarkStatus = (wasPatched: boolean) => {
    if (statusPlan) {
      markStatusMutation.mutate({ 
        id: statusPlan.id, 
        wasPatched, 
        notes: statusNotes || undefined 
      });
    }
  };

  // Handler para sugerir ventanas disponibles
  const handleSuggestWindows = async () => {
    if (!formData.serverName) {
      toast.error('Seleccione un servidor primero');
      return;
    }
    setIsSuggestingWindows(true);
    try {
      const duration = parseInt(formData.estimatedDuration) || 120;
      const windows = await patchPlanApi.suggestWindow(formData.serverName, duration);
      setSuggestedWindows(windows);
      if (windows.length === 0) {
        toast.info('No se encontraron ventanas disponibles en las próximas semanas');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error al obtener sugerencias');
    } finally {
      setIsSuggestingWindows(false);
    }
  };

  // Handler para aplicar una ventana sugerida
  const handleApplySuggestedWindow = (window: SuggestedWindowDto) => {
    setFormData(prev => ({
      ...prev,
      scheduledDate: window.date.split('T')[0],
      windowStartTime: window.startTime,
      windowEndTime: window.endTime,
    }));
    setSuggestedWindows([]);
    toast.success('Ventana aplicada');
  };

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setDbaFilter('all');
  };

  const hasActiveFilters = searchTerm || statusFilter !== 'all' || dbaFilter !== 'all';

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Error al cargar los datos
            </CardTitle>
            <CardDescription>
              No se pudieron cargar los planes de parcheo. Por favor intente nuevamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-8 w-8 text-primary" />
            Planner de Parcheos
          </h1>
          <p className="text-muted-foreground mt-1">
            Planifica y gestiona los parcheos de servidores SQL Server
          </p>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Actualizar datos</TooltipContent>
          </Tooltip>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Plan
          </Button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => setStatusFilter('all')}>
          <CardHeader className="pb-2">
            <CardDescription>Total de Planes</CardDescription>
            <CardTitle className="text-3xl">{metrics.total}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Server className="h-4 w-4 mr-1" />
              Servidores planificados
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className={cn(
            "cursor-pointer hover:border-yellow-500 transition-colors",
            statusFilter === PatchPlanStatus.Planificado && "border-yellow-500"
          )}
          onClick={() => setStatusFilter(statusFilter === PatchPlanStatus.Planificado ? 'all' : PatchPlanStatus.Planificado)}
        >
          <CardHeader className="pb-2">
            <CardDescription>Pendientes</CardDescription>
            <CardTitle className="text-3xl text-yellow-600">{metrics.pending}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="h-4 w-4 mr-1" />
              Por coordinar/aprobar
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className={cn(
            "cursor-pointer hover:border-purple-500 transition-colors",
            statusFilter === PatchPlanStatus.EnProceso && "border-purple-500"
          )}
          onClick={() => setStatusFilter(statusFilter === PatchPlanStatus.EnProceso ? 'all' : PatchPlanStatus.EnProceso)}
        >
          <CardHeader className="pb-2">
            <CardDescription>En Proceso</CardDescription>
            <CardTitle className="text-3xl text-purple-600">{metrics.inProgress}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 mr-1" />
              Ejecutándose ahora
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className={cn(
            "cursor-pointer hover:border-green-500 transition-colors",
            statusFilter === PatchPlanStatus.Parcheado && "border-green-500"
          )}
          onClick={() => setStatusFilter(statusFilter === PatchPlanStatus.Parcheado ? 'all' : PatchPlanStatus.Parcheado)}
        >
          <CardHeader className="pb-2">
            <CardDescription>Parcheados</CardDescription>
            <CardTitle className="text-3xl text-green-600">{metrics.patched}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Completados exitosamente
            </div>
          </CardContent>
        </Card>
        
        <Card 
          className={cn(
            "cursor-pointer hover:border-red-500 transition-colors",
            statusFilter === PatchPlanStatus.Fallido && "border-red-500"
          )}
          onClick={() => setStatusFilter(statusFilter === PatchPlanStatus.Fallido ? 'all' : PatchPlanStatus.Fallido)}
        >
          <CardHeader className="pb-2">
            <CardDescription>Fallidos</CardDescription>
            <CardTitle className="text-3xl text-red-600">{metrics.failed}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 mr-1" />
              Fallidos o cancelados
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search" className="sr-only">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Buscar por servidor, versión..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="w-[180px]">
              <Label htmlFor="status-filter" className="text-xs text-muted-foreground mb-1 block">Estado</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value={PatchPlanStatus.Planificado}>Planificado</SelectItem>
                  <SelectItem value={PatchPlanStatus.EnCoordinacion}>En Coordinación</SelectItem>
                  <SelectItem value={PatchPlanStatus.SinRespuesta}>Sin Respuesta</SelectItem>
                  <SelectItem value={PatchPlanStatus.Aprobado}>Aprobado</SelectItem>
                  <SelectItem value={PatchPlanStatus.EnProceso}>En Proceso</SelectItem>
                  <SelectItem value={PatchPlanStatus.Parcheado}>Parcheado</SelectItem>
                  <SelectItem value={PatchPlanStatus.Fallido}>Fallido</SelectItem>
                  <SelectItem value={PatchPlanStatus.Cancelado}>Cancelado</SelectItem>
                  <SelectItem value={PatchPlanStatus.Reprogramado}>Reprogramado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="w-[200px]">
              <Label htmlFor="dba-filter" className="text-xs text-muted-foreground mb-1 block">DBA Asignado</Label>
              <Select value={dbaFilter} onValueChange={setDbaFilter}>
                <SelectTrigger id="dba-filter">
                  <SelectValue placeholder="Todos los DBAs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {dbas?.map(dba => (
                    <SelectItem key={dba.id} value={dba.id}>{dba.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {hasActiveFilters && (
              <Button variant="ghost" onClick={clearFilters} className="h-10">
                <X className="h-4 w-4 mr-1" />
                Limpiar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle>Planes de Parcheo</CardTitle>
          <CardDescription>
            {filteredAndSortedPlans.length} {filteredAndSortedPlans.length === 1 ? 'plan' : 'planes'} encontrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHeader field="scheduledDate" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Fecha
                  </SortableHeader>
                  <SortableHeader field="serverName" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Servidor
                  </SortableHeader>
                  <TableHead>Versión</TableHead>
                  <TableHead>Ventana</TableHead>
                  <TableHead>Coordinado</TableHead>
                  <SortableHeader field="assignedDbaName" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    DBA Asignado
                  </SortableHeader>
                  <SortableHeader field="status" currentField={sortField} direction={sortDirection} onClick={handleSort}>
                    Estado
                  </SortableHeader>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedPlans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No hay planes de parcheo que mostrar
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedPlans.map((plan) => (
                    <TableRow key={plan.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">
                            {new Date(plan.scheduledDate).toLocaleDateString('es-ES', {
                              weekday: 'short',
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{plan.serverName}</span>
                          {plan.instanceName && (
                            <span className="text-xs text-muted-foreground">{plan.instanceName}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          <span className="text-muted-foreground">{plan.currentVersion}</span>
                          <span className="text-primary font-medium">→ {plan.targetVersion}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {plan.windowStartTime} - {plan.windowEndTime}
                        </span>
                      </TableCell>
                      <TableCell>
                        {plan.isCoordinated ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                                <UserCheck className="w-3 h-3 mr-1" />
                                Sí
                              </Badge>
                            </TooltipTrigger>
                            {plan.productOwnerNote && (
                              <TooltipContent>
                                <p className="max-w-xs">{plan.productOwnerNote}</p>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">No</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {plan.assignedDbaName ? (
                          <span className="font-medium">{plan.assignedDbaName}</span>
                        ) : (
                          <span className="text-muted-foreground italic">Sin asignar</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(plan.status)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {plan.wasPatched === null && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => handleOpenStatusDialog(plan)}>
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Marcar estado</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(plan)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Editar</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button variant="ghost" size="icon" onClick={() => handleDelete(plan)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Eliminar</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog para crear/editar plan */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlan ? 'Editar Plan de Parcheo' : 'Nuevo Plan de Parcheo'}</DialogTitle>
            <DialogDescription>
              {editingPlan ? 'Modifica los datos del plan de parcheo' : 'Completa los datos para crear un nuevo plan'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Selector de servidores no-compliance */}
            {!editingPlan && nonCompliantServers && nonCompliantServers.length > 0 && (
              <div className="space-y-2">
                <Label>Seleccionar servidor no-compliance</Label>
                <Select 
                  value="" 
                  onValueChange={(value) => {
                    const server = nonCompliantServers.find(s => s.serverName === value);
                    if (server) handleSelectNonCompliantServer(server);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar servidor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {nonCompliantServers.map(server => (
                      <SelectItem key={server.serverName} value={server.serverName}>
                        {server.serverName} - {server.currentBuild || 'N/A'} → {server.requiredBuild || 'N/A'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {nonCompliantServers.length} servidores pendientes de parcheo
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="serverName">Servidor *</Label>
                <Input
                  id="serverName"
                  value={formData.serverName}
                  onChange={(e) => setFormData(prev => ({ ...prev, serverName: e.target.value }))}
                  placeholder="Nombre del servidor"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="instanceName">Instancia</Label>
                <Input
                  id="instanceName"
                  value={formData.instanceName}
                  onChange={(e) => setFormData(prev => ({ ...prev, instanceName: e.target.value }))}
                  placeholder="Nombre de instancia (opcional)"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentVersion">Versión Actual *</Label>
                <Input
                  id="currentVersion"
                  value={formData.currentVersion}
                  onChange={(e) => setFormData(prev => ({ ...prev, currentVersion: e.target.value }))}
                  placeholder="Ej: 15.0.4316.3"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="targetVersion">Versión Objetivo *</Label>
                <Input
                  id="targetVersion"
                  value={formData.targetVersion}
                  onChange={(e) => setFormData(prev => ({ ...prev, targetVersion: e.target.value }))}
                  placeholder="Ej: 15.0.4355.3"
                />
              </div>
            </div>
            
            {/* Sugeridor de Ventanas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fecha y Ventana Horaria *</Label>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={handleSuggestWindows}
                  disabled={!formData.serverName || isSuggestingWindows}
                >
                  {isSuggestingWindows ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Lightbulb className="h-4 w-4 mr-2" />
                  )}
                  Sugerir Ventanas
                </Button>
              </div>
              {suggestedWindows.length > 0 && (
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Ventanas disponibles sugeridas:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedWindows.map((window, idx) => (
                      <Button
                        key={idx}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => handleApplySuggestedWindow(window)}
                      >
                        <Sparkles className="h-3 w-3 mr-1 text-yellow-500" />
                        {new Date(window.date).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' })} {window.startTime}-{window.endTime}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scheduledDate">Fecha Programada *</Label>
                <Input
                  id="scheduledDate"
                  type="date"
                  value={formData.scheduledDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="windowStartTime">Hora Inicio</Label>
                <Input
                  id="windowStartTime"
                  type="time"
                  value={formData.windowStartTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, windowStartTime: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="windowEndTime">Hora Fin</Label>
                <Input
                  id="windowEndTime"
                  type="time"
                  value={formData.windowEndTime}
                  onChange={(e) => setFormData(prev => ({ ...prev, windowEndTime: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="assignedDbaId">DBA Asignado</Label>
              <Select 
                value={formData.assignedDbaId || '__none__'} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, assignedDbaId: value === '__none__' ? '' : value }))}
              >
                <SelectTrigger id="assignedDbaId">
                  <SelectValue placeholder="Seleccionar DBA..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {dbas?.map(dba => (
                    <SelectItem key={dba.id} value={dba.id}>{dba.displayName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Nuevos campos: Estado, Modo, Prioridad */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="status">Estado</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PatchPlanStatus.Planificado}>Planificado</SelectItem>
                    <SelectItem value={PatchPlanStatus.EnCoordinacion}>En Coordinación</SelectItem>
                    <SelectItem value={PatchPlanStatus.SinRespuesta}>Sin Respuesta</SelectItem>
                    <SelectItem value={PatchPlanStatus.Aprobado}>Aprobado</SelectItem>
                    <SelectItem value={PatchPlanStatus.EnProceso}>En Proceso</SelectItem>
                    <SelectItem value={PatchPlanStatus.Parcheado}>Parcheado</SelectItem>
                    <SelectItem value={PatchPlanStatus.Fallido}>Fallido</SelectItem>
                    <SelectItem value={PatchPlanStatus.Cancelado}>Cancelado</SelectItem>
                    <SelectItem value={PatchPlanStatus.Reprogramado}>Reprogramado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="patchMode">Modo de Parcheo</Label>
                <Select 
                  value={formData.patchMode} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, patchMode: value }))}
                >
                  <SelectTrigger id="patchMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PatchModeType.Manual}>Manual</SelectItem>
                    <SelectItem value={PatchModeType.Automatico}>Automático</SelectItem>
                    <SelectItem value={PatchModeType.ManualConNova}>Manual con Nova</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">Prioridad</Label>
                <Select 
                  value={formData.priority || '__none__'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value === '__none__' ? '' : value }))}
                >
                  <SelectTrigger id="priority">
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin prioridad</SelectItem>
                    <SelectItem value={PatchPriority.Critica}>Crítica</SelectItem>
                    <SelectItem value={PatchPriority.Alta}>Alta</SelectItem>
                    <SelectItem value={PatchPriority.Media}>Media</SelectItem>
                    <SelectItem value={PatchPriority.Baja}>Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {/* Célula y Ambiente */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cellTeam">Célula</Label>
                <Select 
                  value={formData.cellTeam || '__none__'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, cellTeam: value === '__none__' ? '' : value }))}
                >
                  <SelectTrigger id="cellTeam">
                    <SelectValue placeholder="Seleccionar célula..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin célula</SelectItem>
                    {cellTeams?.map(cell => (
                      <SelectItem key={cell} value={cell}>{cell}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ambiente">Ambiente</Label>
                <Select 
                  value={formData.ambiente || '__none__'} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, ambiente: value === '__none__' ? '' : value }))}
                >
                  <SelectTrigger id="ambiente">
                    <SelectValue placeholder="Seleccionar ambiente..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin ambiente</SelectItem>
                    <SelectItem value="Producción">Producción</SelectItem>
                    <SelectItem value="Pre-Producción">Pre-Producción</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                    <SelectItem value="Desarrollo">Desarrollo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedDuration">Duración Est. (min)</Label>
                <Input
                  id="estimatedDuration"
                  type="number"
                  value={formData.estimatedDuration}
                  onChange={(e) => setFormData(prev => ({ ...prev, estimatedDuration: e.target.value }))}
                  placeholder="120"
                />
              </div>
            </div>
            
            {/* Datos del Owner de Coordinación */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="coordinationOwnerName">Owner para Coordinación</Label>
                <Input
                  id="coordinationOwnerName"
                  value={formData.coordinationOwnerName}
                  onChange={(e) => setFormData(prev => ({ ...prev, coordinationOwnerName: e.target.value }))}
                  placeholder="Nombre del owner"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coordinationOwnerEmail">Email del Owner</Label>
                <Input
                  id="coordinationOwnerEmail"
                  type="email"
                  value={formData.coordinationOwnerEmail}
                  onChange={(e) => setFormData(prev => ({ ...prev, coordinationOwnerEmail: e.target.value }))}
                  placeholder="owner@example.com"
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isCoordinated"
                checked={formData.isCoordinated}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isCoordinated: checked as boolean }))}
              />
              <Label htmlFor="isCoordinated" className="cursor-pointer">
                Coordinado con Product Owner
              </Label>
            </div>
            
            {formData.isCoordinated && (
              <div className="space-y-2">
                <Label htmlFor="productOwnerNote">Nota del Product Owner</Label>
                <Input
                  id="productOwnerNote"
                  value={formData.productOwnerNote}
                  onChange={(e) => setFormData(prev => ({ ...prev, productOwnerNote: e.target.value }))}
                  placeholder="Nombre del PO o detalles de coordinación"
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="notes">Notas Adicionales</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Notas u observaciones adicionales..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingPlan ? 'Guardar Cambios' : 'Crear Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar plan de parcheo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente el plan de parcheo para 
              <span className="font-semibold"> {deletingPlan?.serverName}</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para marcar estado */}
      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar Estado del Parcheo</DialogTitle>
            <DialogDescription>
              ¿El parcheo de <span className="font-semibold">{statusPlan?.serverName}</span> fue completado exitosamente?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="statusNotes">Notas (opcional)</Label>
              <Textarea
                id="statusNotes"
                value={statusNotes}
                onChange={(e) => setStatusNotes(e.target.value)}
                placeholder="Agregar notas sobre el resultado del parcheo..."
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => handleMarkStatus(false)}
              disabled={markStatusMutation.isPending}
              className="flex-1 sm:flex-none"
            >
              <XCircle className="h-4 w-4 mr-2 text-red-600" />
              No Parcheado
            </Button>
            <Button 
              onClick={() => handleMarkStatus(true)}
              disabled={markStatusMutation.isPending}
              className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700"
            >
              {markStatusMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Parcheado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
