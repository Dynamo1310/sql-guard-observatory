/**
 * Página de Inventario de Instancias SQL Server
 * Con caché local y paginación del lado del servidor
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, RefreshCw, Search, Shield, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, FileSpreadsheet } from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
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
import { sqlServerInventoryApi, CacheMetadata, PaginationInfo } from '@/services/sqlServerInventoryApi';
import { SqlServerInstance } from '@/types';

// Extraer versión simplificada (ej: "2019" de "Microsoft SQL Server 2019")
const getSimpleVersion = (majorVersion: string): string => {
  const match = majorVersion.match(/\d{4}/);
  return match ? match[0] : majorVersion;
};

// Color por versión de SQL Server
const getVersionColor = (version: string): string => {
  const simpleVersion = getSimpleVersion(version);
  switch (simpleVersion) {
    case '2022': return 'bg-violet-500/10 text-violet-500 border-violet-500/30';
    case '2019': return 'bg-blue-500/10 text-blue-500 border-blue-500/30';
    case '2017': return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/30';
    case '2016': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30';
    case '2014': return 'bg-amber-500/10 text-amber-500 border-amber-500/30';
    default: return 'bg-gray-500/10 text-gray-500 border-gray-500/30';
  }
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

export default function SqlServerInstances() {
  const [instances, setInstances] = useState<SqlServerInstance[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheMetadata | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, pageSize: 50, totalRecords: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  // Estados de filtros
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedVersion, setSelectedVersion] = useState<string>('All');
  const [selectedAlwaysOn, setSelectedAlwaysOn] = useState<string>('All');
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
      const response = await sqlServerInventoryApi.getInstances({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        ambiente: selectedAmbiente !== 'All' ? selectedAmbiente : undefined,
        version: selectedVersion !== 'All' ? selectedVersion : undefined,
        alwaysOn: selectedAlwaysOn !== 'All' ? selectedAlwaysOn : undefined,
      });
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
    } catch (error) {
      console.error('Error al cargar instancias:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las instancias de SQL Server',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, selectedAmbiente, selectedVersion, selectedAlwaysOn, toast]);

  // Actualizar desde la API externa
  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await sqlServerInventoryApi.refreshInstances();
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
      setPagination(response.pagination);
      toast({
        title: 'Inventario actualizado',
        description: `Se actualizó el inventario con ${response.cacheInfo.recordCount || response.data.length} instancias`,
      });
      // Recargar la página actual con filtros
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

  // Estado para exportación
  const [isExporting, setIsExporting] = useState(false);

  // Exportar a Excel
  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      toast({
        title: 'Generando Excel',
        description: 'Exportando inventario de instancias SQL Server...',
      });

      const response = await sqlServerInventoryApi.getInstances({
        page: 1,
        pageSize: 10000,
        search: debouncedSearch || undefined,
        ambiente: selectedAmbiente !== 'All' ? selectedAmbiente : undefined,
        version: selectedVersion !== 'All' ? selectedVersion : undefined,
        alwaysOn: selectedAlwaysOn !== 'All' ? selectedAlwaysOn : undefined,
      });

      const allInstances = response.data;

      if (allInstances.length === 0) {
        toast({
          title: 'Sin datos',
          description: 'No hay instancias para exportar con los filtros actuales',
          variant: 'destructive',
        });
        return;
      }

      const ExcelJS = await import('exceljs');

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SQL Guard Observatory';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Instancias SQL Server');

      worksheet.columns = [
        { header: 'Servidor', key: 'serverName', width: 35 },
        { header: 'Instancia', key: 'instance', width: 35 },
        { header: 'Versión', key: 'majorVersion', width: 25 },
        { header: 'Edición', key: 'edition', width: 30 },
        { header: 'Product Version', key: 'productVersion', width: 18 },
        { header: 'Product Level', key: 'productLevel', width: 15 },
        { header: 'Product Update', key: 'productUpdate', width: 15 },
        { header: 'Collation', key: 'collation', width: 25 },
        { header: 'AlwaysOn', key: 'alwaysOn', width: 12 },
        { header: 'Hosting Site', key: 'hostingSite', width: 20 },
        { header: 'Hosting Type', key: 'hostingType', width: 15 },
        { header: 'Ambiente', key: 'ambiente', width: 15 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF0066CC' },
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

      allInstances.forEach(inst => {
        worksheet.addRow({
          serverName: inst.ServerName,
          instance: inst.NombreInstancia,
          majorVersion: inst.MajorVersion,
          edition: inst.Edition,
          productVersion: inst.ProductVersion,
          productLevel: inst.ProductLevel,
          productUpdate: inst.ProductUpdateLevel,
          collation: inst.Collation,
          alwaysOn: inst.AlwaysOn === 'Enabled' ? 'Sí' : 'No',
          hostingSite: inst.hostingSite,
          hostingType: inst.hostingType,
          ambiente: inst.ambiente,
        });
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          row.eachCell(cell => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
              right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            };
          });
          if (rowNumber % 2 === 0) {
            row.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF5F5F5' },
            };
          }
        }
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          const alwaysOnCell = row.getCell(9);
          if (alwaysOnCell.value === 'Sí') {
            alwaysOnCell.font = { color: { argb: 'FF008000' }, bold: true };
          } else {
            alwaysOnCell.font = { color: { argb: 'FF888888' } };
          }
        }
      });

      worksheet.addRow([]);
      const totalRow = worksheet.addRow([`Total: ${allInstances.length} instancias`]);
      totalRow.font = { bold: true };
      totalRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFE599' },
      };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Inventario_Instancias_SQLServer_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Exportación completada',
        description: `Se exportaron ${allInstances.length} instancias SQL Server`,
      });
    } catch (error) {
      console.error('Error al exportar:', error);
      toast({
        title: 'Error al exportar',
        description: 'No se pudo generar el archivo Excel',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // Cargar datos al cambiar filtros o página
  useEffect(() => {
    fetchData(pagination.page, pagination.pageSize);
  }, [debouncedSearch, selectedAmbiente, selectedVersion, selectedAlwaysOn]);

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

  // Estadísticas (ahora son aproximadas basadas en los datos de caché)
  const stats = useMemo(() => {
    const total = pagination.totalRecords;
    const byVersion = instances.reduce((acc, i) => {
      const v = getSimpleVersion(i.MajorVersion);
      acc[v] = (acc[v] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const byAmbiente = instances.reduce((acc, i) => {
      acc[i.ambiente] = (acc[i.ambiente] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const alwaysOnEnabled = instances.filter(i => i.AlwaysOn === 'Enabled').length;

    return { total, byVersion, byAmbiente, alwaysOnEnabled };
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

        <div className="flex gap-4 flex-wrap">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
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
            <SqlServerIcon className="h-8 w-8" />
            Inventario SQL Server - Instancias
          </h1>
          <p className="text-muted-foreground">
            Listado de todas las instancias SQL Server registradas
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
            className="gap-2"
            onClick={exportToExcel}
            disabled={isExporting}
          >
            {isExporting ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-4 w-4" />
                Exportar Excel
              </>
            )}
          </Button>
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
            <SqlServerIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">
              {stats.total}
            </div>
            <p className="text-xs text-muted-foreground">
              Instancias SQL Server
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
            <CardTitle className="text-sm font-medium">AlwaysOn Activo</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {stats.alwaysOnEnabled}
            </div>
            <p className="text-xs text-muted-foreground">
              En esta página
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Versiones</CardTitle>
            <Database className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">
              {Object.keys(stats.byVersion).length}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.entries(stats.byVersion)
                .sort((a, b) => b[0].localeCompare(a[0]))
                .slice(0, 2)
                .map(([v, c]) => `${v}: ${c}`)
                .join(', ')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar servidor o instancia..."
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

        <Select value={selectedVersion} onValueChange={(v) => { setSelectedVersion(v); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Versión" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todas las versiones</SelectItem>
            <SelectItem value="2022">SQL Server 2022</SelectItem>
            <SelectItem value="2019">SQL Server 2019</SelectItem>
            <SelectItem value="2017">SQL Server 2017</SelectItem>
            <SelectItem value="2016">SQL Server 2016</SelectItem>
            <SelectItem value="2014">SQL Server 2014</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedAlwaysOn} onValueChange={(v) => { setSelectedAlwaysOn(v); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="AlwaysOn" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            <SelectItem value="Enabled">AlwaysOn Activo</SelectItem>
            <SelectItem value="Disabled">AlwaysOn Inactivo</SelectItem>
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
            <SqlServerIcon className="h-5 w-5" />
            Detalle de Instancias
          </CardTitle>
          <CardDescription>
            Información detallada de cada instancia SQL Server
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={cn("relative", loading && "opacity-50")}>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
                <RefreshCw className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            {instances.length === 0 ? (
              <div className="text-center py-12">
                <SqlServerIcon className="h-12 w-12 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay instancias</h3>
                <p className="text-muted-foreground">
                  No se encontraron instancias con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Instancia</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Edición</TableHead>
                    <TableHead>Build</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead className="text-center">AlwaysOn</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instances.map((instance) => (
                    <TableRow key={instance.id}>
                      <TableCell className="font-medium">{instance.ServerName}</TableCell>
                      <TableCell className="font-medium">{instance.NombreInstancia}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getVersionColor(instance.MajorVersion))}>
                          SQL {getSimpleVersion(instance.MajorVersion)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={instance.Edition}>
                        {instance.Edition.replace('Edition', '').replace('(64-bit)', '').trim()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-mono">{instance.ProductVersion}</span>
                          <span className="text-xs text-muted-foreground">
                            {instance.ProductLevel} {instance.ProductUpdateLevel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('text-xs', getAmbienteColor(instance.ambiente))}>
                          {instance.ambiente}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {instance.AlwaysOn === 'Enabled' ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto" />
                        ) : (
                          <XCircle className="h-5 w-5 text-muted-foreground mx-auto" />
                        )}
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
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(1)}
                  disabled={pagination.page === 1 || loading}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1 || loading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                {/* Page numbers */}
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={pagination.page === pageNum ? 'default' : 'outline'}
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => goToPage(pageNum)}
                        disabled={loading}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages || loading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => goToPage(pagination.totalPages)}
                  disabled={pagination.page === pagination.totalPages || loading}
                >
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
