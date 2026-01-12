/**
 * Página de Inventario de Bases de Datos PostgreSQL
 * Con caché local y paginación del lado del servidor
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, RefreshCw, Search, HardDrive, CheckCircle2, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { PostgreSqlIcon } from '@/components/icons/PostgreSqlIcon';
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
import { postgresqlInventoryApi, CacheMetadata, PaginationInfo } from '@/services/postgresqlInventoryApi';
import { PostgreSqlDatabase } from '@/types';

// Formatear tamaño en MB a formato legible
const formatSize = (mb: number): string => {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
};

// Color por estado de la base de datos
const getStatusColor = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'online':
      return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    case 'offline':
      return 'bg-red-500/10 text-red-500 border-red-500/30';
    default:
      return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
};

// Opciones de tamaño de página
const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

export default function PostgreSqlDatabases() {
  const [databases, setDatabases] = useState<PostgreSqlDatabase[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheMetadata | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  // Estados de filtros
  const [selectedServer, setSelectedServer] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
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
      const response = await postgresqlInventoryApi.getDatabases({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        server: selectedServer !== 'All' ? selectedServer : undefined,
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
      });
      setDatabases(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error al cargar bases de datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las bases de datos PostgreSQL',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedServer, selectedStatus, toast]);

  // Actualizar desde la API externa
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await postgresqlInventoryApi.refreshDatabases();
      setDatabases(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
      toast({
        title: 'Inventario actualizado',
        description: `Se actualizó el inventario con ${response.cacheInfo.recordCount || response.data.length} bases de datos`,
      });
      fetchData(1, pagination.pageSize);
    } catch (error) {
      console.error('Error al actualizar bases de datos:', error);
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
  }, [debouncedSearch, selectedServer, selectedStatus]);

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
    const totalSizeMB = databases.reduce((sum, db) => sum + db.data_MB, 0);
    const onlineCount = databases.filter(db => db.status.toLowerCase() === 'online').length;
    const serversCount = new Set(databases.map(db => db.ServerName.ServerName)).size;

    return { total, totalSizeMB, onlineCount, serversCount };
  }, [databases, pagination.totalRecords]);

  // Loading State
  if (loading && databases.length === 0) {
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
            <PostgreSqlIcon className="h-8 w-8" />
            Inventario PostgreSQL - Bases de Datos
          </h1>
          <p className="text-muted-foreground">
            Listado de todas las bases de datos PostgreSQL registradas
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
            <CardTitle className="text-sm font-medium">Total Bases de Datos</CardTitle>
            <PostgreSqlIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#336791]">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.serversCount} servidores en esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tamaño (esta página)</CardTitle>
            <HardDrive className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">
              {formatSize(stats.totalSizeMB)}
            </div>
            <p className="text-xs text-muted-foreground">
              Datos almacenados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online (esta página)</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {stats.onlineCount}
            </div>
            <p className="text-xs text-muted-foreground">
              De {databases.length} en esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Encoding</CardTitle>
            <Database className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              UTF8
            </div>
            <p className="text-xs text-muted-foreground">
              Codificación principal
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar base de datos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Input
          placeholder="Filtrar por servidor..."
          value={selectedServer === 'All' ? '' : selectedServer}
          onChange={(e) => setSelectedServer(e.target.value || 'All')}
          className="w-[220px]"
        />

        <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            <SelectItem value="Online">Online</SelectItem>
            <SelectItem value="Offline">Offline</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count and page size */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Mostrando {((pagination.page - 1) * pagination.pageSize) + 1} - {Math.min(pagination.page * pagination.pageSize, pagination.totalRecords)} de {pagination.totalRecords} bases de datos
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
            <PostgreSqlIcon className="h-5 w-5" />
            Detalle de Bases de Datos
          </CardTitle>
          <CardDescription>
            Información detallada de cada base de datos PostgreSQL
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn("relative", loading && "opacity-50")}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <RefreshCw className="h-6 w-6 animate-spin text-[#336791]" />
              </div>
            )}
            {databases.length === 0 ? (
              <div className="text-center py-12">
                <PostgreSqlIcon className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay bases de datos</h3>
                <p className="text-muted-foreground">
                  No se encontraron bases de datos con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Base de Datos</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Tamaño</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Encoding</TableHead>
                    <TableHead>Collation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {databases.map((db) => (
                    <TableRow key={db.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{db.ServerName.ServerName}</span>
                          <span className="text-xs text-muted-foreground">{db.ServerName.ambiente}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{db.dbName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getStatusColor(db.status))}>
                          {db.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatSize(db.data_MB)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {db.databaseType}
                      </TableCell>
                      <TableCell className="text-sm">{db.encoding}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate" title={db.collation}>
                        {db.collation}
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

