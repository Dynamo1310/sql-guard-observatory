/**
 * Página de Discos - Monitoreo de almacenamiento
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { HardDrive, AlertTriangle, CheckCircle2, Info, RefreshCw, Search, Server } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { disksApi, DiskDto, DiskSummaryDto, DiskFiltersDto } from '@/services/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';

export default function Disks() {
  const [allDisks, setAllDisks] = useState<DiskDto[]>([]);
  const [filters, setFilters] = useState<DiskFiltersDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();
  
  // Estados de filtros
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedHosting, setSelectedHosting] = useState<string>('All');
  const [selectedInstance, setSelectedInstance] = useState<string>('All');
  const [selectedEstado, setSelectedEstado] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cargar datos
  const fetchData = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    else setIsRefreshing(true);
    
    try {
      const [disksData, filtersData] = await Promise.all([
        disksApi.getDisks(),
        disksApi.getFilters(),
      ]);

      setAllDisks(disksData);
      setFilters(filtersData);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los datos',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calcular discos filtrados
  const filteredDisks = useMemo(() => {
    let result = allDisks;

    if (selectedAmbiente !== 'All') {
      result = result.filter(d => d.ambiente === selectedAmbiente);
    }
    if (selectedHosting !== 'All') {
      result = result.filter(d => d.hosting === selectedHosting);
    }
    if (selectedInstance !== 'All') {
      result = result.filter(d => d.instanceName === selectedInstance);
    }
    if (selectedEstado !== 'All') {
      result = result.filter(d => d.estado === selectedEstado);
    }
    if (searchQuery) {
      result = result.filter(d => 
        d.servidor?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.instanceName?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [allDisks, selectedAmbiente, selectedHosting, selectedInstance, selectedEstado, searchQuery]);

  // Calcular resumen
  const summary = useMemo((): DiskSummaryDto | null => {
    if (filteredDisks.length === 0 && allDisks.length === 0) return null;

    // Críticos: isAlerted = true (el backend ya incluye discos de logs con % físico < 10%)
    const criticos = filteredDisks.filter(d => d.isAlerted).length;
    
    // Bajos sin riesgo: % físico < 10% pero NO alertados
    const bajosSinRiesgo = filteredDisks.filter(d => !d.isAlerted && (d.porcentajeLibre ?? 100) < 10).length;
    
    const advertencia = filteredDisks.filter(d => d.estado === 'Advertencia').length;
    const saludables = filteredDisks.filter(d => d.estado === 'Saludable').length;

    return {
      discosCriticos: criticos,
      discosAdvertencia: advertencia,
      discosSaludables: saludables,
      totalDiscos: filteredDisks.length,
      discosAlertadosReales: criticos,
      discosBajosSinRiesgo: bajosSinRiesgo,
      ultimaCaptura: allDisks[0]?.captureDate,
    };
  }, [filteredDisks, allDisks]);

  // Filtros anidados
  const availableHostings = useMemo(() => {
    if (selectedAmbiente === 'All') return filters?.hostings || [];
    const hostingsInAmbiente = allDisks
      .filter(d => d.ambiente === selectedAmbiente)
      .map(d => d.hosting)
      .filter((h): h is string => !!h);
    return [...new Set(hostingsInAmbiente)].sort();
  }, [selectedAmbiente, filters, allDisks]);

  const availableInstances = useMemo(() => {
    let disksForInstances = allDisks;
    if (selectedAmbiente !== 'All') {
      disksForInstances = disksForInstances.filter(d => d.ambiente === selectedAmbiente);
    }
    if (selectedHosting !== 'All') {
      disksForInstances = disksForInstances.filter(d => d.hosting === selectedHosting);
    }
    const instances = disksForInstances
      .map(d => d.instanceName)
      .filter((inst): inst is string => !!inst);
    return [...new Set(instances)].sort();
  }, [selectedAmbiente, selectedHosting, allDisks]);

  // Handlers
  const handleAmbienteChange = useCallback((value: string) => {
    setSelectedAmbiente(value);
    setSelectedHosting('All');
    setSelectedInstance('All');
  }, []);

  const handleHostingChange = useCallback((value: string) => {
    setSelectedHosting(value);
    setSelectedInstance('All');
  }, []);

  // Hook de ordenamiento
  const { sortedData, requestSort, getSortIndicator } = useTableSort(filteredDisks);

  const getDiskSeverity = (disk: DiskDto): 'critical' | 'warning' | 'success' | 'info' => {
    if (disk.isAlerted) return 'critical';
    if (disk.estado === 'Critico') return 'critical';
    if (disk.estado === 'Advertencia') return 'warning';
    return 'success';
  };

  // Opciones para Combobox
  const instanceOptions: ComboboxOption[] = useMemo(() => {
    return [
      { value: 'All', label: 'Todas las instancias' },
      ...availableInstances.map(inst => ({ value: inst, label: inst }))
    ];
  }, [availableInstances]);

  // Render badge de estado
  const renderEstadoBadge = (disk: DiskDto) => {
    if (disk.isAlerted) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="destructive" className="text-xs">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Crítico
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                {disk.isLogDisk 
                  ? `Disco con archivos .ldf y ${(disk.porcentajeLibre ?? 0).toFixed(1)}% físico libre. Si se llena, la instancia queda INACCESIBLE.`
                  : 'Disco con archivos con growth y espacio real bajo (≤10%).'}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    if ((disk.porcentajeLibre ?? 100) < 10) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs">
                <Info className="w-3 h-3 mr-1" />
                Bajo (sin riesgo)
              </Badge>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                {disk.filesWithGrowth === 0 
                  ? 'Los archivos no tienen growth habilitado, no van a crecer.'
                  : `Los archivos tienen ${disk.espacioInternoEnArchivosGB?.toFixed(2) ?? 0} GB de espacio interno disponible.`
                }
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    if (disk.estado === 'Advertencia') {
      return (
        <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/30">
          Advertencia
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Saludable
      </Badge>
    );
  };

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Stats cards skeleton */}
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
        
        {/* Filters skeleton */}
        <div className="flex gap-4 flex-wrap">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        
        {/* Table skeleton */}
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
            <HardDrive className="h-8 w-8" />
            Espacio en Disco
          </h1>
          <p className="text-muted-foreground">
            Monitoreo de almacenamiento con análisis de espacio real
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchData(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Discos Críticos</CardTitle>
            <HardDrive className={`h-4 w-4 ${(summary?.discosCriticos ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.discosCriticos ?? 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {summary?.discosCriticos ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Growth + espacio real ≤10%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bajos (sin riesgo)</CardTitle>
            <HardDrive className={`h-4 w-4 ${(summary?.discosBajosSinRiesgo ?? 0) > 0 ? 'text-cyan-500' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.discosBajosSinRiesgo ?? 0) > 0 ? 'text-cyan-500' : 'text-emerald-500'}`}>
              {summary?.discosBajosSinRiesgo ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              &lt;10% físico, sin growth
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Advertencia</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${(summary?.discosAdvertencia ?? 0) > 0 ? 'text-warning' : 'text-emerald-500'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(summary?.discosAdvertencia ?? 0) > 0 ? 'text-warning' : 'text-emerald-500'}`}>
              {summary?.discosAdvertencia ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              10-20% libre
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saludables</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">
              {summary?.discosSaludables ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              &gt; 20% libre
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar servidor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={selectedAmbiente} onValueChange={handleAmbienteChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            {filters?.ambientes.map((amb) => (
              <SelectItem key={amb} value={amb}>{amb}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedHosting} onValueChange={handleHostingChange} disabled={availableHostings.length === 0}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Hosting" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            {availableHostings.map((host) => (
              <SelectItem key={host} value={host}>{host}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Combobox
          options={instanceOptions}
          value={selectedInstance}
          onValueChange={setSelectedInstance}
          placeholder="Instancia"
          searchPlaceholder="Buscar..."
          emptyText="No encontrado"
          className="w-[200px]"
        />

        <Select value={selectedEstado} onValueChange={setSelectedEstado}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All">Todos</SelectItem>
            {filters?.estados.map((est) => (
              <SelectItem key={est} value={est}>{est}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredDisks.length} disco(s) mostrado(s)
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" />
            Detalle por Disco
          </CardTitle>
          <CardDescription>
            Información detallada de cada disco incluyendo espacio físico y real disponible
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-auto">
            {sortedData.length === 0 ? (
              <div className="text-center py-12">
                <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay discos</h3>
                <p className="text-muted-foreground">
                  No hay datos disponibles con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('servidor')}>
                      Servidor {getSortIndicator('servidor')}
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSort('drive')}>
                      Drive {getSortIndicator('drive')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('totalGB')}>
                      Total (GB) {getSortIndicator('totalGB')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('porcentajeLibre')}>
                      % Libre Físico {getSortIndicator('porcentajeLibre')}
                    </TableHead>
                    <TableHead className="text-right cursor-pointer hover:bg-accent" onClick={() => requestSort('realPorcentajeLibre')}>
                      % Libre REAL {getSortIndicator('realPorcentajeLibre')}
                    </TableHead>
                    <TableHead className="text-center cursor-pointer hover:bg-accent" onClick={() => requestSort('filesWithGrowth')}>
                      Growth {getSortIndicator('filesWithGrowth')}
                    </TableHead>
                    <TableHead className="text-center cursor-pointer hover:bg-accent" onClick={() => requestSort('isLogDisk')}>
                      Tipo {getSortIndicator('isLogDisk')}
                    </TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Uso</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedData.map((disk, index) => {
                    const severity = getDiskSeverity(disk);
                    const realFreePct = disk.realPorcentajeLibre ?? disk.porcentajeLibre ?? 0;
                    const usedPct = 100 - realFreePct;
                    const hasInternalSpace = (disk.espacioInternoEnArchivosGB ?? 0) > 0.01;
                    
                    return (
                      <TableRow key={`${disk.id}-${disk.drive}-${index}`} className={cn({
                        'bg-destructive/10 dark:bg-destructive/20': disk.isAlerted,
                      })}>
                        <TableCell className="font-medium">{disk.servidor}</TableCell>
                        <TableCell className="font-bold">{disk.drive?.toUpperCase()}</TableCell>
                        <TableCell className="text-right text-sm">
                          {disk.totalGB?.toFixed(0) ?? 'N/A'}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          <span className={cn({
                            'text-red-500 font-bold': (disk.porcentajeLibre ?? 100) < 10,
                            'text-warning': (disk.porcentajeLibre ?? 100) >= 10 && (disk.porcentajeLibre ?? 100) < 20,
                            'text-muted-foreground': (disk.porcentajeLibre ?? 100) >= 20,
                          })}>
                            {disk.porcentajeLibre?.toFixed(1) ?? 'N/A'}%
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({disk.libreGB?.toFixed(1) ?? '?'} GB)
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="cursor-help">
                                <div className="flex flex-col items-end">
                                  <span className={cn('font-bold text-sm', {
                                    'text-red-500': realFreePct <= 10 && disk.filesWithGrowth > 0,
                                    'text-warning': realFreePct > 10 && realFreePct < 20,
                                    'text-muted-foreground': realFreePct >= 20,
                                  })}>
                                    {realFreePct.toFixed(1)}%
                                  </span>
                                  {hasInternalSpace && (
                                    <span className="text-xs text-muted-foreground">
                                      +{disk.espacioInternoEnArchivosGB?.toFixed(1)} GB int.
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <div className="text-sm space-y-1">
                                  <p><strong>Espacio Libre REAL:</strong> {disk.realLibreGB?.toFixed(2) ?? disk.libreGB?.toFixed(2)} GB ({realFreePct.toFixed(1)}%)</p>
                                  <p><strong>Espacio Físico:</strong> {disk.libreGB?.toFixed(2)} GB ({disk.porcentajeLibre?.toFixed(1)}%)</p>
                                  {hasInternalSpace && (
                                    <p><strong>Espacio Interno:</strong> +{disk.espacioInternoEnArchivosGB?.toFixed(2)} GB</p>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-center">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant={disk.filesWithGrowth > 0 ? 'default' : 'outline'} className="text-xs">
                                  {disk.filesWithGrowth > 0 ? `${disk.filesWithGrowth} sí` : 'No'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-sm">
                                  <p>Archivos con growth: {disk.filesWithGrowth}</p>
                                  <p>Archivos sin growth: {disk.filesWithoutGrowth}</p>
                                  <p>Total archivos: {disk.totalFiles}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell className="text-center">
                          {disk.isTempDBDisk ? (
                            <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500 border-orange-500/30">
                              TempDB
                            </Badge>
                          ) : disk.isDataDisk && disk.isLogDisk ? (
                            <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/30">
                              Data + Log
                            </Badge>
                          ) : disk.isLogDisk ? (
                            <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/30">
                              Log
                            </Badge>
                          ) : disk.isDataDisk ? (
                            <Badge variant="outline" className="text-xs">
                              Data
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{renderEstadoBadge(disk)}</TableCell>
                        <TableCell>
                          <div className="w-20">
                            <Progress 
                              value={usedPct} 
                              className={cn('h-2', {
                                '[&>div]:bg-red-500': severity === 'critical',
                                '[&>div]:bg-warning': severity === 'warning',
                                '[&>div]:bg-emerald-500': severity === 'success',
                              })}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
