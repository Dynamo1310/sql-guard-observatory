/**
 * Intervenciones - Seguimiento de incidencias DBA
 * Registro de intervenciones con métricas de tiempo, participantes y gráficos.
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Swords, Search, RefreshCw, Edit, Plus, Trash2,
  ChevronUp, ChevronDown, BarChart3, ExternalLink,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Clock, Users, Link2,
} from 'lucide-react';
import {
  intervencionesWarApi,
  IntervencionWarDto,
  IntervencionWarGridResponse,
  IntervencionWarStatsDto,
  CreateUpdateIntervencionWarRequest,
  basesSinUsoApi,
  BasesSinUsoDbaDto,
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
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';

// ==================== CONSTANTS ====================

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const TIPOS_INTERVENCION = ['War', 'Degradación', 'Chat', 'Llamado', 'Mail'] as const;

type SortField = keyof IntervencionWarDto;
type SortDirection = 'asc' | 'desc';

// ==================== HELPERS ====================

/**
 * Convierte un date string a formato local para mostrar en la grilla.
 */
function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Convierte un date string a formato yyyy-MM-ddTHH:mm para el input datetime-local.
 * Usa componentes locales para evitar el desfase de timezone.
 */
function formatDateTimeForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${MM}-${dd}T${hh}:${mm}`;
  } catch {
    return '';
  }
}

/**
 * Convierte el valor del input datetime-local a un ISO string local (sin offset UTC).
 * El input devuelve "2026-02-18T14:30" — lo parseamos manualmente como hora local.
 */
function inputToLocalIso(value: string): string {
  if (!value) return new Date().toISOString();
  // value viene como "yyyy-MM-ddTHH:mm"
  // Construimos la fecha usando componentes locales
  const [datePart, timePart] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  const d = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return d.toISOString();
}

function formatDuration(mins: number): string {
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
}

// ==================== COMPONENT ====================

export default function IntervencionesWar() {
  const queryClient = useQueryClient();

  // Search / filter
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCelula, setFilterCelula] = useState<string>('all');
  const [filterDba, setFilterDba] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');

  // Sort
  const [sortField, setSortField] = useState<SortField>('fechaHora');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 30;

  // Tab
  const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<IntervencionWarDto | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const emptyForm: CreateUpdateIntervencionWarRequest = {
    fechaHora: new Date().toISOString(),
    duracionMinutos: 0,
    dbaParticipantes: '',
    tipoIntervencion: 'War',
  };
  const [formData, setFormData] = useState<CreateUpdateIntervencionWarRequest>(emptyForm);

  // ==================== QUERIES ====================

  const { data, isLoading, isFetching, refetch } = useQuery<IntervencionWarGridResponse>({
    queryKey: ['intervenciones-war'],
    queryFn: () => intervencionesWarApi.getAll(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: statsData } = useQuery<IntervencionWarStatsDto>({
    queryKey: ['intervenciones-war-stats'],
    queryFn: () => intervencionesWarApi.getStats(),
    staleTime: 10 * 60 * 1000,
    enabled: activeTab === 'charts',
  });

  const { data: dbasData } = useQuery<BasesSinUsoDbaDto[]>({
    queryKey: ['bases-sin-uso-dbas'],
    queryFn: () => basesSinUsoApi.getDbas(),
    staleTime: 30 * 60 * 1000,
  });

  // ==================== MUTATIONS ====================

  const saveMutation = useMutation({
    mutationFn: (params: { id?: number; data: CreateUpdateIntervencionWarRequest }) => {
      if (params.id) {
        return intervencionesWarApi.update(params.id, params.data);
      }
      return intervencionesWarApi.create(params.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intervenciones-war'] });
      queryClient.invalidateQueries({ queryKey: ['intervenciones-war-stats'] });
      toast.success(editingItem ? 'Intervención actualizada' : 'Intervención creada');
      setDialogOpen(false);
      setEditingItem(null);
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => intervencionesWarApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intervenciones-war'] });
      queryClient.invalidateQueries({ queryKey: ['intervenciones-war-stats'] });
      toast.success('Intervención eliminada');
      setDeleteConfirmId(null);
    },
    onError: (error: Error) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  // ==================== DERIVED DATA ====================

  const celulas = useMemo(() => {
    if (!data?.items) return [];
    return [...new Set(data.items.map(i => i.celula).filter(Boolean))].sort() as string[];
  }, [data?.items]);

  const dbasEnIntervenciones = useMemo(() => {
    if (!data?.items) return [];
    const all = data.items.flatMap(i =>
      i.dbaParticipantes.split(',').map(d => d.trim()).filter(Boolean)
    );
    return [...new Set(all)].sort();
  }, [data?.items]);

  // ==================== FILTERED & SORTED ====================

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    let items = [...data.items];

    // Search
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      items = items.filter(i =>
        i.dbaParticipantes?.toLowerCase().includes(lower) ||
        i.numeroIncidente?.toLowerCase().includes(lower) ||
        i.tipoIntervencion?.toLowerCase().includes(lower) ||
        i.servidores?.toLowerCase().includes(lower) ||
        i.baseDatos?.toLowerCase().includes(lower) ||
        i.celula?.toLowerCase().includes(lower) ||
        i.referente?.toLowerCase().includes(lower) ||
        i.comentarios?.toLowerCase().includes(lower)
      );
    }

    // Filters
    if (filterCelula !== 'all') items = items.filter(i => i.celula === filterCelula);
    if (filterTipo !== 'all') items = items.filter(i => i.tipoIntervencion === filterTipo);
    if (filterDba !== 'all') {
      items = items.filter(i =>
        i.dbaParticipantes.split(',').map(d => d.trim()).includes(filterDba)
      );
    }

    // Sort
    items.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [data?.items, searchTerm, filterCelula, filterDba, filterTipo, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ==================== HANDLERS ====================

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

  const openCreate = useCallback(() => {
    setEditingItem(null);
    setFormData({
      ...emptyForm,
      fechaHora: new Date().toISOString(),
    });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((item: IntervencionWarDto) => {
    setEditingItem(item);
    setFormData({
      fechaHora: item.fechaHora,
      duracionMinutos: item.duracionMinutos,
      dbaParticipantes: item.dbaParticipantes,
      tipoIntervencion: item.tipoIntervencion ?? undefined,
      numeroIncidente: item.numeroIncidente ?? undefined,
      incidenteLink: item.incidenteLink ?? undefined,
      servidores: item.servidores ?? undefined,
      baseDatos: item.baseDatos ?? undefined,
      celula: item.celula ?? undefined,
      referente: item.referente ?? undefined,
      comentarios: item.comentarios ?? undefined,
      intervencionesRelacionadas: item.intervencionesRelacionadas ?? undefined,
    });
    setDialogOpen(true);
  }, []);

  const handleSubmit = () => {
    if (!formData.dbaParticipantes.trim()) {
      toast.error('Debe indicar al menos un DBA participante');
      return;
    }
    if (formData.duracionMinutos <= 0) {
      toast.error('La duración debe ser mayor a 0 minutos');
      return;
    }
    saveMutation.mutate({
      id: editingItem?.id,
      data: formData,
    });
  };

  // ==================== RENDER ====================

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const resumen = data?.resumen;

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Swords className="h-6 w-6 text-primary" />
            Intervenciones
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seguimiento de intervenciones DBA en incidencias
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1">
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Actualizar
          </Button>
          <Button size="sm" onClick={openCreate} className="gap-1">
            <Plus className="h-4 w-4" />
            Nueva Intervención
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Total Intervenciones</div>
            <div className="text-2xl font-bold mt-1">{resumen?.totalIntervenciones ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Horas Totales</div>
            <div className="text-2xl font-bold mt-1">
              {resumen?.totalHoras ?? 0}h {resumen?.totalMinutos ?? 0}m
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Este Mes</div>
            <div className="text-2xl font-bold mt-1">
              {resumen?.intervencionesEsteMes ?? 0}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({resumen?.horasEsteMes ?? 0}h {resumen?.minutosEsteMes ?? 0}m)
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground font-medium">Wars</div>
            <div className="text-2xl font-bold mt-1">{resumen?.intervencionesWar ?? 0}</div>
            <div className="text-xs text-muted-foreground">{resumen?.dbasUnicos ?? 0} DBAs únicos</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button variant={activeTab === 'table' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('table')}>
          <Swords className="h-4 w-4 mr-1" /> Intervenciones
        </Button>
        <Button variant={activeTab === 'charts' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('charts')}>
          <BarChart3 className="h-4 w-4 mr-1" /> Gráficos
        </Button>
      </div>

      {activeTab === 'table' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 w-[250px]"
                placeholder="Buscar incidente, DBA, server..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>

            <Select value={filterTipo} onValueChange={v => { setFilterTipo(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los Tipos</SelectItem>
                {TIPOS_INTERVENCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterDba} onValueChange={v => { setFilterDba(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="DBA" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los DBA</SelectItem>
                {dbasEnIntervenciones.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterCelula} onValueChange={v => { setFilterCelula(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Célula" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las Células</SelectItem>
                {celulas.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>

            <span className="text-xs text-muted-foreground ml-auto">
              {filteredItems.length} registro{filteredItems.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Table */}
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('id')}>
                    ID <SortIcon field="id" />
                  </TableHead>
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('fechaHora')}>
                    Fecha/Hora <SortIcon field="fechaHora" />
                  </TableHead>
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('tipoIntervencion')}>
                    Tipo <SortIcon field="tipoIntervencion" />
                  </TableHead>
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('duracionMinutos')}>
                    Duración <SortIcon field="duracionMinutos" />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">DBA(s)</TableHead>
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('numeroIncidente')}>
                    Incidente <SortIcon field="numeroIncidente" />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Servidores</TableHead>
                  <TableHead className="whitespace-nowrap">DBs</TableHead>
                  <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => handleSort('celula')}>
                    Célula <SortIcon field="celula" />
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Relacionadas</TableHead>
                  <TableHead className="whitespace-nowrap text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No se encontraron intervenciones
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedItems.map(item => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{item.id}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(item.fechaHora)}</TableCell>
                      <TableCell>
                        {item.tipoIntervencion ? (
                          <Badge variant={item.tipoIntervencion === 'War' ? 'destructive' : 'secondary'} className="text-xs">
                            {item.tipoIntervencion}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono">
                          {formatDuration(item.duracionMinutos)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.dbaParticipantes.split(',').map(d => d.trim()).filter(Boolean).map(dba => (
                            <Badge key={dba} variant="outline" className="text-xs">{dba}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {item.numeroIncidente && (
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{item.numeroIncidente}</span>
                            {item.incidenteLink && (
                              <a href={item.incidenteLink} target="_blank" rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-700">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate" title={item.servidores ?? ''}>
                        {item.servidores ?? '-'}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate" title={item.baseDatos ?? ''}>
                        {item.baseDatos ?? '-'}
                      </TableCell>
                      <TableCell className="text-sm">{item.celula ?? '-'}</TableCell>
                      <TableCell>
                        {item.intervencionesRelacionadas ? (
                          <Badge variant="outline" className="text-xs">
                            <Link2 className="h-3 w-3 mr-1" />
                            {item.intervencionesRelacionadas}
                          </Badge>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700"
                            onClick={() => setDeleteConfirmId(item.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Página {currentPage} de {totalPages} ({filteredItems.length} registros)
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Charts Tab */}
      {activeTab === 'charts' && statsData && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Por Tipo de Intervención */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Por Tipo de Intervención</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statsData.porTipo.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {statsData.porTipo.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Horas por DBA */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Horas por DBA</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={statsData.porDba}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => [`${v}h`, 'Horas']} />
                  <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Distribución por Duración */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Distribución por Duración</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={statsData.porDuracion.filter(d => d.value > 0)} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {statsData.porDuracion.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Evolución Mensual */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Evolución Mensual (Horas)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={statsData.evolucionMensual}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip formatter={(v: number) => [`${v}h`, 'Horas']} />
                  <Line type="monotone" dataKey="value" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Horas por Célula */}
          {statsData.porCelula.length > 0 && (
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Horas por Célula</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={statsData.porCelula}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: number) => [`${v}h`, 'Horas']} />
                    <Bar dataKey="value" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Editar Intervención #${editingItem.id}` : 'Nueva Intervención'}</DialogTitle>
            <DialogDescription>
              {editingItem ? 'Modifique los datos de la intervención' : 'Registre una nueva intervención DBA'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Fecha/Hora + Duración + Tipo */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Fecha y Hora *</Label>
                <Input
                  type="datetime-local"
                  value={formatDateTimeForInput(formData.fechaHora)}
                  onChange={e => setFormData(prev => ({ ...prev, fechaHora: e.target.value ? inputToLocalIso(e.target.value) : prev.fechaHora }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Duración (minutos) *</Label>
                <Input
                  type="number"
                  min={1}
                  value={formData.duracionMinutos || ''}
                  onChange={e => setFormData(prev => ({ ...prev, duracionMinutos: parseInt(e.target.value) || 0 }))}
                  placeholder="Ej: 90"
                />
                {formData.duracionMinutos > 0 && (
                  <span className="text-xs text-muted-foreground">{formatDuration(formData.duracionMinutos)}</span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Tipo de Intervención *</Label>
                <Select
                  value={formData.tipoIntervencion || 'War'}
                  onValueChange={v => setFormData(prev => ({ ...prev, tipoIntervencion: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_INTERVENCION.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* DBA Participantes */}
            <div className="space-y-2">
              <Label>DBA Participante(s) *</Label>
              <Input
                value={formData.dbaParticipantes}
                onChange={e => setFormData(prev => ({ ...prev, dbaParticipantes: e.target.value }))}
                placeholder="Nombre DBA (separar con coma si son varios)"
              />
              {dbasData && dbasData.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {dbasData.map(dba => (
                    <Badge
                      key={dba.userId}
                      variant="outline"
                      className="cursor-pointer hover:bg-primary/10 text-xs"
                      onClick={() => {
                        const current = formData.dbaParticipantes;
                        const name = dba.displayName;
                        if (current.split(',').map(d => d.trim()).includes(name)) return;
                        setFormData(prev => ({
                          ...prev,
                          dbaParticipantes: current ? `${current}, ${name}` : name
                        }));
                      }}
                    >
                      + {dba.displayName}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Incidente + Link */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número de Incidente</Label>
                <Input
                  value={formData.numeroIncidente || ''}
                  onChange={e => setFormData(prev => ({ ...prev, numeroIncidente: e.target.value }))}
                  placeholder="INC0012345"
                />
              </div>
              <div className="space-y-2">
                <Label>Link</Label>
                <Input
                  value={formData.incidenteLink || ''}
                  onChange={e => setFormData(prev => ({ ...prev, incidenteLink: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Servidores + DBs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Servidor(es)</Label>
                <Input
                  value={formData.servidores || ''}
                  onChange={e => setFormData(prev => ({ ...prev, servidores: e.target.value }))}
                  placeholder="Servidores (separar con coma)"
                />
              </div>
              <div className="space-y-2">
                <Label>Base(s) de Datos</Label>
                <Input
                  value={formData.baseDatos || ''}
                  onChange={e => setFormData(prev => ({ ...prev, baseDatos: e.target.value }))}
                  placeholder="Bases de datos (separar con coma)"
                />
              </div>
            </div>

            {/* Referente + Relacionadas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Referente</Label>
                <Input
                  value={formData.referente || ''}
                  onChange={e => setFormData(prev => ({ ...prev, referente: e.target.value }))}
                  placeholder="Referente del área"
                />
              </div>
              <div className="space-y-2">
                <Label>Intervenciones Relacionadas</Label>
                <Input
                  value={formData.intervencionesRelacionadas || ''}
                  onChange={e => setFormData(prev => ({ ...prev, intervencionesRelacionadas: e.target.value }))}
                  placeholder="IDs separados por coma (ej: 12, 45)"
                />
              </div>
            </div>

            {/* Comentarios */}
            <div className="space-y-2">
              <Label>Comentarios</Label>
              <Textarea
                value={formData.comentarios || ''}
                onChange={e => setFormData(prev => ({ ...prev, comentarios: e.target.value }))}
                placeholder="Notas y observaciones de la intervención"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando...' : editingItem ? 'Actualizar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              ¿Está seguro que desea eliminar la intervención #{deleteConfirmId}? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
