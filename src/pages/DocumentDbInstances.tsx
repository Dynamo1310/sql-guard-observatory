/**
 * Página de Inventario de Instancias DocumentDB
 * Con caché local y paginación del lado del servidor
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, RefreshCw, Search, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Cloud, Layers, CheckCircle2 } from 'lucide-react';
import { DocumentDbIcon } from '@/components/icons/DocumentDbIcon';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { documentdbInventoryApi, CacheMetadata, PaginationInfo } from '@/services/documentdbInventoryApi';
import { DocumentDbInstance } from '@/types';

// Color por versión de DocumentDB
const getVersionColor = (version: string): string => {
  const majorVersion = parseFloat(version);
  if (majorVersion >= 5) return 'bg-violet-500/10 text-violet-500 border-violet-500/30';
  if (majorVersion >= 4) return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
  return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
};

// Color por ambiente
const getAmbienteColor = (ambiente: string): string => {
  switch (ambiente.toLowerCase()) {
    case 'produccion':
    case 'production':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    case 'testing':
    case 'test':
      return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    case 'desarrollo':
    case 'development':
    case 'dev':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
};

// Opciones de tamaño de página
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function DocumentDbInstances() {
  const [instances, setInstances] = useState<DocumentDbInstance[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheMetadata | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  // Estados de filtros
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedClusterMode, setSelectedClusterMode] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Cargar datos desde el caché con paginación
  const fetchData = useCallback(async (page: number = 1, pageSize: number = 50) => {
    setLoading(true);
    try {
      const response = await documentdbInventoryApi.getInstances({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        ambiente: selectedAmbiente !== 'All' ? selectedAmbiente : undefined,
        clusterMode: selectedClusterMode !== 'All' ? selectedClusterMode : undefined,
      });
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error al cargar instancias:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las instancias de DocumentDB',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedAmbiente, selectedClusterMode, toast]);

  // Actualizar desde la API externa
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await documentdbInventoryApi.refreshInstances();
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
      toast({
        title: 'Inventario actualizado',
        description: `Se actualizó el inventario con ${response.cacheInfo.recordCount || response.data.length} instancias`,
      });
      fetchData(1, pagination.pageSize);
    } catch (error) {
      console.error('Error al actualizar instancias:', error);
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el inventario desde el servidor',
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast, fetchData, pagination.pageSize]);

  // Cargar datos al cambiar filtros
  useEffect(() => {
    fetchData(pagination.page, pagination.pageSize);
  }, [debouncedSearch, selectedAmbiente, selectedClusterMode]);

  // Cargar datos iniciales
  useEffect(() => {
    fetchData(1, 50);
  }, []);

  // Cambiar página
  const goToPage = (page: number) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchData(page, pagination.pageSize);
    }
  };

  // Cambiar tamaño de página
  const changePageSize = (newSize: number) => {
    fetchData(1, newSize);
  };

  // Formatear fecha de última actualización
  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Estadísticas
  const stats = useMemo(() => {
    const total = pagination.totalRecords;
    const byAmbiente = instances.reduce((acc, i) => {
      acc[i.ambiente] = (acc[i.ambiente] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const clusterEnabled = instances.filter(i => i.ClusterModeEnabled).length;
    const byVersion = instances.reduce((acc, i) => {
      acc[i.ProductVersion] = (acc[i.ProductVersion] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return { total, byAmbiente, clusterEnabled, byVersion };
  }, [instances, pagination.totalRecords]);

  // Loading State
  if (loading && instances.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
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
            <DocumentDbIcon className="h-8 w-8" />
            Inventario DocumentDB - Instancias
          </h1>
          <p className="text-muted-foreground">
            Listado de todas las instancias DocumentDB registradas
          </p>
        </div>
        <div className="flex items-center gap-4">
          {cacheInfo?.lastUpdatedAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatLastUpdated(cacheInfo.lastUpdatedAt)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Última actualización por: {cacheInfo.updatedByUserName || 'Sistema'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button
            variant="outline"
            onClick={refreshData}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Instancias</CardTitle>
            <DocumentDbIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground">
              Clusters DocumentDB
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Producción</CardTitle>
            <Database className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {stats.byAmbiente['Produccion'] || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              En esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cluster Mode</CardTitle>
            <Layers className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {stats.clusterEnabled}
            </div>
            <p className="text-xs text-muted-foreground">
              Con cluster habilitado
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AWS DocumentDB</CardTitle>
            <Cloud className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {instances.length}
            </div>
            <p className="text-xs text-muted-foreground">
              MongoDB compatible
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar cluster..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={selectedAmbiente} onValueChange={(v) => { setSelectedAmbiente(v); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos los ambientes</SelectItem>
            <SelectItem value="Produccion">Producción</SelectItem>
            <SelectItem value="Testing">Testing</SelectItem>
            <SelectItem value="Desarrollo">Desarrollo</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedClusterMode} onValueChange={(v) => { setSelectedClusterMode(v); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Cluster Mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            <SelectItem value="Enabled">Cluster Habilitado</SelectItem>
            <SelectItem value="Disabled">Cluster Deshabilitado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count and page size */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Mostrando {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} de {pagination.totalRecords} instancias
        </span>
        <div className="flex items-center gap-2">
          <span>Registros por página:</span>
          <Select value={String(pagination.pageSize)} onValueChange={(v) => changePageSize(Number(v))}>
            <SelectTrigger className="w-[80px] h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DocumentDbIcon className="h-5 w-5" />
            Detalle de Instancias
          </CardTitle>
          <CardDescription>
            Información detallada de cada cluster DocumentDB
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn("relative", loading && "opacity-50")}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <RefreshCw className="h-6 w-6 animate-spin text-green-600" />
              </div>
            )}
            {instances.length === 0 ? (
              <div className="text-center py-12">
                <DocumentDbIcon className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay instancias</h3>
                <p className="text-muted-foreground">
                  No se encontraron instancias con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Engine</TableHead>
                    <TableHead>Hosting</TableHead>
                    <TableHead className="text-center">Cluster</TableHead>
                    <TableHead>Ambiente</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.ServerName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate" title={instance.NombreInstancia}>
                        {instance.NombreInstancia}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getVersionColor(instance.ProductVersion))}>
                          v{instance.ProductVersion}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{instance.Engine}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{instance.hostingSite}</span>
                          <span className="text-xs text-muted-foreground">{instance.hostingType}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {instance.ClusterModeEnabled ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getAmbienteColor(instance.ambiente))}>
                          {instance.ambiente}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Pagination Controls */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Página {pagination.page} de {pagination.totalPages}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(1)} disabled={pagination.page === 1 || loading}>
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(pagination.page - 1)} disabled={pagination.page === 1 || loading}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) pageNum = i + 1;
                    else if (pagination.page <= 3) pageNum = i + 1;
                    else if (pagination.page >= pagination.totalPages - 2) pageNum = pagination.totalPages - 4 + i;
                    else pageNum = pagination.page - 2 + i;
                    return (
                      <Button key={pageNum} variant={pagination.page === pageNum ? 'default' : 'outline'} size="icon" className="h-8 w-8" onClick={() => goToPage(pageNum)} disabled={loading}>
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages || loading}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToPage(pagination.totalPages)} disabled={pagination.page === pagination.totalPages || loading}>
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

