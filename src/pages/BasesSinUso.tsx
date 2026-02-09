/**
 * Bases sin Uso - Proyecto de gestión de bajas de bases de datos
 * Vista combinada de inventario (SqlServerDatabasesCache) + gestión (GestionBasesSinUso)
 * con filtros, ordenamiento, visibilidad de columnas, edición y gráficos.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Database, Search, RefreshCw, Edit, ChevronUp, ChevronDown,
  SlidersHorizontal, BarChart3, Eye, EyeOff,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react';
import {
  basesSinUsoApi,
  BasesSinUsoGridDto,
  BasesSinUsoGridResponse,
  BasesSinUsoStatsDto,
  BasesSinUsoDbaDto,
  UpdateBasesSinUsoRequest,
} from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';

// ==================== TYPES ====================

type SortField = keyof BasesSinUsoGridDto;
type SortDirection = 'asc' | 'desc';

// ==================== COLUMN DEFINITIONS ====================

interface ColumnDef {
  key: string;
  label: string;
  group: 'inventario' | 'gestion';
  defaultVisible: boolean;
  width?: string;
}

const ALL_COLUMNS: ColumnDef[] = [
  // Inventario
  { key: 'serverName', label: 'Servidor', group: 'inventario', defaultVisible: true },
  { key: 'serverAmbiente', label: 'Ambiente', group: 'inventario', defaultVisible: true },
  { key: 'dbName', label: 'Base de Datos', group: 'inventario', defaultVisible: true },
  { key: 'status', label: 'Status', group: 'inventario', defaultVisible: true },
  { key: 'stateDesc', label: 'Estado BD', group: 'inventario', defaultVisible: false },
  { key: 'dataMB', label: 'Tamaño (MB)', group: 'inventario', defaultVisible: true },
  { key: 'dataFiles', label: 'Archivos', group: 'inventario', defaultVisible: false },
  { key: 'recoveryModel', label: 'Recovery Model', group: 'inventario', defaultVisible: true },
  { key: 'compatibilityLevel', label: 'Nivel Compat.', group: 'inventario', defaultVisible: true },
  { key: 'userAccess', label: 'User Access', group: 'inventario', defaultVisible: false },
  { key: 'creationDate', label: 'Fecha Creación BD', group: 'inventario', defaultVisible: false },
  { key: 'collation', label: 'Collation', group: 'inventario', defaultVisible: false },
  { key: 'fulltext', label: 'Fulltext', group: 'inventario', defaultVisible: false },
  { key: 'autoClose', label: 'AutoClose', group: 'inventario', defaultVisible: false },
  { key: 'readOnly', label: 'ReadOnly', group: 'inventario', defaultVisible: false },
  { key: 'autoShrink', label: 'AutoShrink', group: 'inventario', defaultVisible: false },
  { key: 'autoCreateStatistics', label: 'AutoCreateStats', group: 'inventario', defaultVisible: false },
  { key: 'autoUpdateStatistics', label: 'AutoUpdateStats', group: 'inventario', defaultVisible: false },
  { key: 'sourceTimestamp', label: 'Source Timestamp', group: 'inventario', defaultVisible: false },
  { key: 'cachedAt', label: 'Cached At', group: 'inventario', defaultVisible: false },
  { key: 'enInventarioActual', label: 'En Inventario', group: 'inventario', defaultVisible: true },
  // Gestión
  { key: 'compatibilidadMotor', label: 'Compat. Motor', group: 'gestion', defaultVisible: true },
  { key: 'fechaUltimaActividad', label: 'Última Actividad', group: 'gestion', defaultVisible: true },
  { key: 'offline', label: 'Baja (Offline)', group: 'gestion', defaultVisible: true },
  { key: 'fechaBajaMigracion', label: 'Fecha Baja/Migra.', group: 'gestion', defaultVisible: true },
  { key: 'motivoBasesSinActividad', label: 'Motivo: Sin Actividad', group: 'gestion', defaultVisible: true },
  { key: 'motivoObsolescencia', label: 'Motivo: Obsolescencia', group: 'gestion', defaultVisible: true },
  { key: 'motivoEficiencia', label: 'Motivo: Eficiencia', group: 'gestion', defaultVisible: true },
  { key: 'motivoCambioVersionAmbBajos', label: 'Motivo: Cambio Versión', group: 'gestion', defaultVisible: false },
  { key: 'fechaUltimoBkp', label: 'Último BKP', group: 'gestion', defaultVisible: true },
  { key: 'ubicacionUltimoBkp', label: 'Ubicación BKP', group: 'gestion', defaultVisible: false },
  { key: 'dbaAsignado', label: 'DBA Asignado', group: 'gestion', defaultVisible: true },
  { key: 'owner', label: 'Owner', group: 'gestion', defaultVisible: true },
  { key: 'comentarios', label: 'Comentarios', group: 'gestion', defaultVisible: false },
];

// ==================== CHART COLORS ====================

const CHART_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#14b8a6', '#6366f1',
];

// ==================== HELPERS ====================

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function formatDateTime(dateStr: string | null | undefined): string {
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

function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return date.toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// ==================== COMPONENT ====================

export default function BasesSinUso() {
  const queryClient = useQueryClient();

  // Search / filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('all');
  const [filterOffline, setFilterOffline] = useState<string>('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('serverName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key))
  );

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // Tab (table vs charts)
  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');

  // Dialog state
  const [editingItem, setEditingItem] = useState<BasesSinUsoGridDto | null>(null);
  const [formData, setFormData] = useState<UpdateBasesSinUsoRequest>({
    serverName: '',
    dbName: '',
    offline: false,
    motivoBasesSinActividad: false,
    motivoObsolescencia: false,
    motivoEficiencia: false,
    motivoCambioVersionAmbBajos: false,
  });

  // ==================== QUERIES ====================

  const { data, isLoading, isFetching, refetch } = useQuery<BasesSinUsoGridResponse>({
    queryKey: ['bases-sin-uso'],
    queryFn: () => basesSinUsoApi.getAll(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: statsData } = useQuery<BasesSinUsoStatsDto>({
    queryKey: ['bases-sin-uso-stats'],
    queryFn: () => basesSinUsoApi.getStats(),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'charts',
  });

  const { data: dbasData } = useQuery<BasesSinUsoDbaDto[]>({
    queryKey: ['bases-sin-uso-dbas'],
    queryFn: () => basesSinUsoApi.getDbas(),
    staleTime: 10 * 60 * 1000,
  });

  // ==================== MUTATIONS ====================

  const updateMutation = useMutation({
    mutationFn: (params: { id: number | null; data: UpdateBasesSinUsoRequest }) => {
      if (params.id) {
        return basesSinUsoApi.update(params.id, params.data);
      }
      return basesSinUsoApi.upsert(params.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bases-sin-uso'] });
      queryClient.invalidateQueries({ queryKey: ['bases-sin-uso-stats'] });
      toast.success('Registro actualizado correctamente');
      setEditingItem(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al actualizar: ${error.message}`);
    },
  });

  // ==================== HANDLERS ====================

  const handleEdit = useCallback((item: BasesSinUsoGridDto) => {
    setEditingItem(item);
    setFormData({
      serverName: item.serverName,
      dbName: item.dbName,
      serverInstanceId: item.serverInstanceId,
      serverAmbiente: item.serverAmbiente ?? undefined,
      databaseId: item.databaseId,
      status: item.status ?? undefined,
      stateDesc: item.stateDesc ?? undefined,
      dataFiles: item.dataFiles ?? undefined,
      dataMB: item.dataMB ?? undefined,
      userAccess: item.userAccess ?? undefined,
      recoveryModel: item.recoveryModel ?? undefined,
      compatibilityLevel: item.compatibilityLevel ?? undefined,
      creationDate: item.creationDate ?? undefined,
      collation: item.collation ?? undefined,
      compatibilidadMotor: item.compatibilidadMotor ?? undefined,
      fechaUltimaActividad: item.fechaUltimaActividad ?? undefined,
      offline: item.offline,
      fechaBajaMigracion: item.fechaBajaMigracion ?? undefined,
      motivoBasesSinActividad: item.motivoBasesSinActividad,
      motivoObsolescencia: item.motivoObsolescencia,
      motivoEficiencia: item.motivoEficiencia,
      motivoCambioVersionAmbBajos: item.motivoCambioVersionAmbBajos,
      fechaUltimoBkp: item.fechaUltimoBkp ?? undefined,
      ubicacionUltimoBkp: item.ubicacionUltimoBkp ?? undefined,
      dbaAsignado: item.dbaAsignado ?? undefined,
      owner: item.owner ?? undefined,
      comentarios: item.comentarios ?? undefined,
    });
  }, []);

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

  // Column visibility toggle
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const showAllColumns = () => setVisibleColumns(new Set(ALL_COLUMNS.map(c => c.key)));
  const hideAllColumns = () => setVisibleColumns(new Set(['serverName', 'dbName']));
  const resetColumns = () => setVisibleColumns(new Set(ALL_COLUMNS.filter(c => c.defaultVisible).map(c => c.key)));

  // ==================== DERIVED DATA ====================

  const ambientes = useMemo(() => {
    if (!data?.items) return [];
    return [...new Set(data.items.map(i => i.serverAmbiente).filter(Boolean))] as string[];
  }, [data?.items]);

  const filteredAndSortedItems = useMemo(() => {
    if (!data?.items) return [];

    let items = [...data.items];

    // Text search
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      items = items.filter(i =>
        i.serverName.toLowerCase().includes(lowerSearch) ||
        i.dbName.toLowerCase().includes(lowerSearch) ||
        (i.dbaAsignado?.toLowerCase().includes(lowerSearch)) ||
        (i.owner?.toLowerCase().includes(lowerSearch)) ||
        (i.comentarios?.toLowerCase().includes(lowerSearch))
      );
    }

    // Filter by ambiente
    if (filterAmbiente !== 'all') {
      items = items.filter(i => i.serverAmbiente === filterAmbiente);
    }

    // Filter by offline
    if (filterOffline !== 'all') {
      items = items.filter(i => filterOffline === 'yes' ? i.offline : !i.offline);
    }

    // Sort
    items.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
        comparison = (aVal === bVal) ? 0 : aVal ? -1 : 1;
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal), 'es', { sensitivity: 'base' });
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return items;
  }, [data?.items, searchTerm, filterAmbiente, filterOffline, sortField, sortDirection]);

  // Reset page when filters change
  const totalFilteredItems = filteredAndSortedItems.length;
  const totalPages = Math.max(1, Math.ceil(totalFilteredItems / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return filteredAndSortedItems.slice(start, start + pageSize);
  }, [filteredAndSortedItems, safeCurrentPage, pageSize]);

  // ==================== CELL RENDER ====================

  const renderCellValue = (item: BasesSinUsoGridDto, colKey: string) => {
    const value = item[colKey as keyof BasesSinUsoGridDto];

    // Booleans with badges
    if (colKey === 'offline') {
      return (
        <Badge variant={item.offline ? 'destructive' : 'outline'}
          className={item.offline
            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          }>
          {item.offline ? 'SI' : 'NO'}
        </Badge>
      );
    }
    if (colKey === 'enInventarioActual') {
      return (
        <Badge variant={item.enInventarioActual ? 'default' : 'secondary'}
          className={item.enInventarioActual
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
          }>
          {item.enInventarioActual ? 'SI' : 'NO'}
        </Badge>
      );
    }
    if (['motivoBasesSinActividad', 'motivoObsolescencia', 'motivoEficiencia', 'motivoCambioVersionAmbBajos'].includes(colKey)) {
      const boolVal = value as boolean;
      return boolVal ? (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">SI</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
    }
    if (['fulltext', 'autoClose', 'readOnly', 'autoShrink', 'autoCreateStatistics', 'autoUpdateStatistics'].includes(colKey)) {
      if (value == null) return <span className="text-muted-foreground">—</span>;
      return value ? 'Si' : 'No';
    }

    // Dates
    if (['creationDate', 'fechaUltimaActividad', 'fechaBajaMigracion', 'fechaUltimoBkp', 'sourceTimestamp', 'cachedAt'].includes(colKey)) {
      return formatDate(value as string | null);
    }
    if (['fechaCreacion', 'fechaModificacion'].includes(colKey)) {
      return formatDateTime(value as string | null);
    }

    // Compatibility level with red highlight if different from engine
    if (colKey === 'compatibilityLevel') {
      if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
      const isDifferent = item.engineCompatLevel && String(value) !== String(item.engineCompatLevel);
      return (
        <span className={isDifferent ? 'text-red-600 dark:text-red-400 font-semibold' : ''} title={
          isDifferent ? `Motor: ${item.engineVersion} (esperado: ${item.engineCompatLevel})` : undefined
        }>
          {String(value)}
        </span>
      );
    }

    // Numbers
    if (colKey === 'dataMB' && value != null) {
      return (value as number).toLocaleString('es-AR');
    }

    // Default
    if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
    return String(value);
  };

  // ==================== RENDER ====================

  const resumen = data?.resumen;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" />
            Bases sin Uso
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gestión de bajas y seguimiento de bases de datos del inventario
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-1"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Total Bases</div>
            <div className="text-2xl font-bold mt-1">
              {isLoading ? <Skeleton className="h-8 w-16" /> : resumen?.totalBases.toLocaleString() ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Bases Offline</div>
            <div className="text-2xl font-bold mt-1 text-red-600">
              {isLoading ? <Skeleton className="h-8 w-16" /> : resumen?.basesOffline.toLocaleString() ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Con Gestión</div>
            <div className="text-2xl font-bold mt-1 text-blue-600">
              {isLoading ? <Skeleton className="h-8 w-16" /> : resumen?.basesConGestion.toLocaleString() ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Sin Gestión</div>
            <div className="text-2xl font-bold mt-1 text-yellow-600">
              {isLoading ? <Skeleton className="h-8 w-16" /> : resumen?.pendientesGestion.toLocaleString() ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Espacio Total</div>
            <div className="text-2xl font-bold mt-1">
              {isLoading ? <Skeleton className="h-8 w-16" /> : (() => {
                const gb = (resumen?.espacioTotalMB ?? 0) / 1024;
                return gb >= 1024 ? `${(gb / 1024).toFixed(2)} TB` : `${gb.toFixed(1)} GB`;
              })()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab toggle */}
      <div className="flex items-center gap-2 border-b pb-2">
        <Button
          variant={activeTab === 'table' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('table')}
          className="gap-1"
        >
          <Database className="h-4 w-4" />
          Tabla
        </Button>
        <Button
          variant={activeTab === 'charts' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setActiveTab('charts')}
          className="gap-1"
        >
          <BarChart3 className="h-4 w-4" />
          Gráficos
        </Button>
      </div>

      {/* ==================== TABLE VIEW ==================== */}
      {activeTab === 'table' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar servidor, base, DBA, owner..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Filter: Ambiente */}
                <Select value={filterAmbiente} onValueChange={(v) => { setFilterAmbiente(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[140px] h-9">
                    <SelectValue placeholder="Ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {ambientes.map(amb => (
                      <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Filter: Offline */}
                <Select value={filterOffline} onValueChange={(v) => { setFilterOffline(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[130px] h-9">
                    <SelectValue placeholder="Baja" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="yes">Offline (SI)</SelectItem>
                    <SelectItem value="no">Online (NO)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Column visibility */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1 h-9">
                      <SlidersHorizontal className="h-4 w-4" />
                      Columnas
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 max-h-[500px] overflow-y-auto">
                    <DropdownMenuLabel>Visibilidad de columnas</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <div className="flex gap-1 px-2 py-1">
                      <Button variant="ghost" size="sm" className="text-xs h-7 flex-1" onClick={showAllColumns}>
                        <Eye className="h-3 w-3 mr-1" /> Todas
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 flex-1" onClick={hideAllColumns}>
                        <EyeOff className="h-3 w-3 mr-1" /> Mínimo
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 flex-1" onClick={resetColumns}>
                        Reset
                      </Button>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Inventario</DropdownMenuLabel>
                    {ALL_COLUMNS.filter(c => c.group === 'inventario').map(col => (
                      <DropdownMenuCheckboxItem
                        key={col.key}
                        checked={visibleColumns.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      >
                        {col.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Gestión de Bajas</DropdownMenuLabel>
                    {ALL_COLUMNS.filter(c => c.group === 'gestion').map(col => (
                      <DropdownMenuCheckboxItem
                        key={col.key}
                        checked={visibleColumns.has(col.key)}
                        onCheckedChange={() => toggleColumn(col.key)}
                      >
                        {col.label}
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Results count */}
            <div className="text-xs text-muted-foreground mt-2">
              Mostrando {Math.min((safeCurrentPage - 1) * pageSize + 1, totalFilteredItems)}–{Math.min(safeCurrentPage * pageSize, totalFilteredItems)} de {totalFilteredItems} registros
              {totalFilteredItems !== (data?.items.length ?? 0) && ` (${data?.items.length ?? 0} total)`}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-420px)] scrollbar-thin" style={{ scrollbarGutter: 'stable' }}>
              <Table>
                <TableHeader className="sticky top-0 z-20 bg-background">
                  <TableRow>
                    <TableHead className="w-[50px] sticky left-0 bg-background z-30">
                      #
                    </TableHead>
                    {ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(col => (
                      <TableHead
                        key={col.key}
                        className="cursor-pointer hover:bg-accent whitespace-nowrap text-xs"
                        onClick={() => handleSort(col.key as SortField)}
                      >
                        {col.label}
                        <SortIcon field={col.key as SortField} />
                      </TableHead>
                    ))}
                    <TableHead className="w-[60px] text-center sticky right-0 bg-background z-30">
                      Acciones
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                        {ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(col => (
                          <TableCell key={col.key}><Skeleton className="h-4 w-20" /></TableCell>
                        ))}
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredAndSortedItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={visibleColumns.size + 2} className="text-center py-8 text-muted-foreground">
                        No se encontraron registros
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedItems.map((item, idx) => (
                      <TableRow
                        key={`${item.serverName}-${item.dbName}`}
                        className={cn(
                          "text-xs",
                          item.offline && "bg-red-50/50 dark:bg-red-950/20",
                          !item.enInventarioActual && !item.offline && "bg-yellow-50/50 dark:bg-yellow-950/20"
                        )}
                      >
                        <TableCell className="sticky left-0 bg-inherit z-10 font-mono text-muted-foreground">
                          {(safeCurrentPage - 1) * pageSize + idx + 1}
                        </TableCell>
                        {ALL_COLUMNS.filter(c => visibleColumns.has(c.key)).map(col => (
                          <TableCell key={col.key} className="whitespace-nowrap max-w-[200px] truncate">
                            {renderCellValue(item, col.key)}
                          </TableCell>
                        ))}
                        <TableCell className="sticky right-0 bg-inherit z-10 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleEdit(item)}
                            title="Editar gestión"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <div className="text-xs text-muted-foreground">
                  Página {safeCurrentPage} de {totalPages}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(1)}
                    disabled={safeCurrentPage <= 1}
                    title="Primera página"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    title="Página anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  {/* Page number buttons */}
                  {(() => {
                    const pages: number[] = [];
                    const start = Math.max(1, safeCurrentPage - 2);
                    const end = Math.min(totalPages, safeCurrentPage + 2);
                    for (let i = start; i <= end; i++) pages.push(i);
                    return pages.map(p => (
                      <Button
                        key={p}
                        variant={p === safeCurrentPage ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 w-8 p-0 text-xs"
                        onClick={() => setCurrentPage(p)}
                      >
                        {p}
                      </Button>
                    ));
                  })()}

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safeCurrentPage >= totalPages}
                    title="Página siguiente"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={safeCurrentPage >= totalPages}
                    title="Última página"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== CHARTS VIEW ==================== */}
      {activeTab === 'charts' && (
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {/* Chart: Por Motivo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Distribución por Motivo de Baja</CardTitle>
            </CardHeader>
            <CardContent>
              {statsData?.porMotivo && statsData.porMotivo.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={statsData.porMotivo}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statsData.porMotivo.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos de motivos registrados
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart: Por Ambiente */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Bases por Ambiente</CardTitle>
            </CardHeader>
            <CardContent>
              {statsData?.porAmbiente && statsData.porAmbiente.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statsData.porAmbiente}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" name="Bases" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos de ambientes registrados
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart: Evolución Temporal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Evolución Temporal de Bajas</CardTitle>
            </CardHeader>
            <CardContent>
              {statsData?.evolucionTemporal && statsData.evolucionTemporal.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={statsData.evolucionTemporal}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="value" name="Bajas" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos de evolución temporal
                </div>
              )}
            </CardContent>
          </Card>

          {/* Chart: Por Compatibilidad de Motor */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Bases por Compatibilidad de Motor</CardTitle>
            </CardHeader>
            <CardContent>
              {statsData?.porCompatibilidad && statsData.porCompatibilidad.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statsData.porCompatibilidad}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" name="Bases" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
                  No hay datos de compatibilidad registrados
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ==================== EDIT DIALOG ==================== */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Gestión de Baja</DialogTitle>
            <DialogDescription>
              {editingItem?.serverName} / {editingItem?.dbName}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Info estática: Compatibilidad Motor y Nivel Compat. BD */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-muted-foreground">Versión Motor</Label>
                <div className="text-sm font-medium px-3 py-2 bg-muted rounded-md">
                  {editingItem?.engineVersion || '—'}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Compat. Level BD</Label>
                <div className={cn(
                  "text-sm font-medium px-3 py-2 rounded-md",
                  editingItem?.engineCompatLevel && editingItem?.compatibilityLevel &&
                  String(editingItem.compatibilityLevel) !== String(editingItem.engineCompatLevel)
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                    : "bg-muted"
                )}>
                  {editingItem?.compatibilityLevel || '—'}
                  {editingItem?.engineCompatLevel && editingItem?.compatibilityLevel &&
                    String(editingItem.compatibilityLevel) !== String(editingItem.engineCompatLevel) &&
                    <span className="text-xs ml-1">(esperado: {editingItem.engineCompatLevel})</span>
                  }
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-muted-foreground">Ambiente</Label>
                <div className="text-sm font-medium px-3 py-2 bg-muted rounded-md">
                  {editingItem?.serverAmbiente || '—'}
                </div>
              </div>
            </div>

            {/* DBA Asignado y Owner */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>DBA Asignado</Label>
                <Select
                  value={formData.dbaAsignado || ''}
                  onValueChange={(val) => setFormData(prev => ({ ...prev, dbaAsignado: val || undefined }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar DBA..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {(dbasData ?? []).map(dba => (
                      <SelectItem key={dba.userId} value={dba.displayName}>
                        {dba.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Input
                  value={formData.owner || ''}
                  onChange={e => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                  placeholder="Owner de la base de datos"
                />
              </div>
            </div>

            {/* Fecha Última Actividad y Offline */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Última Actividad</Label>
                <Input
                  type="date"
                  value={formatDateForInput(formData.fechaUltimaActividad)}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    fechaUltimaActividad: e.target.value || undefined
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Baja (Offline)</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="offline"
                    checked={formData.offline}
                    onCheckedChange={(checked) => setFormData(prev => ({
                      ...prev,
                      offline: checked === true
                    }))}
                  />
                  <label htmlFor="offline" className="text-sm font-medium leading-none">
                    Base de datos dada de baja
                  </label>
                </div>
              </div>
            </div>

            {/* Fecha Baja/Migración */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Baja / Migración</Label>
                <Input
                  type="date"
                  value={formatDateForInput(formData.fechaBajaMigracion)}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    fechaBajaMigracion: e.target.value || undefined
                  }))}
                />
              </div>
            </div>

            <Separator />

            {/* Motivos de Baja */}
            <div className="space-y-3">
              <Label className="text-sm font-semibold">Motivos de Baja</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="motivoSinActividad"
                    checked={formData.motivoBasesSinActividad}
                    onCheckedChange={(checked) => setFormData(prev => ({
                      ...prev,
                      motivoBasesSinActividad: checked === true
                    }))}
                  />
                  <label htmlFor="motivoSinActividad" className="text-sm">Bases sin Actividad</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="motivoObsolescencia"
                    checked={formData.motivoObsolescencia}
                    onCheckedChange={(checked) => setFormData(prev => ({
                      ...prev,
                      motivoObsolescencia: checked === true
                    }))}
                  />
                  <label htmlFor="motivoObsolescencia" className="text-sm">Obsolescencia (anual)</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="motivoEficiencia"
                    checked={formData.motivoEficiencia}
                    onCheckedChange={(checked) => setFormData(prev => ({
                      ...prev,
                      motivoEficiencia: checked === true
                    }))}
                  />
                  <label htmlFor="motivoEficiencia" className="text-sm">Eficiencia (ARQ)</label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="motivoCambioVersion"
                    checked={formData.motivoCambioVersionAmbBajos}
                    onCheckedChange={(checked) => setFormData(prev => ({
                      ...prev,
                      motivoCambioVersionAmbBajos: checked === true
                    }))}
                  />
                  <label htmlFor="motivoCambioVersion" className="text-sm">Cambio Versión Amb. Bajos</label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Último Backup */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha Último BKP</Label>
                <Input
                  type="date"
                  value={formatDateForInput(formData.fechaUltimoBkp)}
                  onChange={e => setFormData(prev => ({
                    ...prev,
                    fechaUltimoBkp: e.target.value || undefined
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Ubicación Último BKP</Label>
                <Input
                  value={formData.ubicacionUltimoBkp || ''}
                  onChange={e => setFormData(prev => ({ ...prev, ubicacionUltimoBkp: e.target.value }))}
                  placeholder="Ruta del último backup"
                />
              </div>
            </div>

            {/* Comentarios */}
            <div className="space-y-2">
              <Label>Comentarios</Label>
              <Textarea
                value={formData.comentarios || ''}
                onChange={e => setFormData(prev => ({ ...prev, comentarios: e.target.value }))}
                placeholder="Comentarios adicionales..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingItem(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
