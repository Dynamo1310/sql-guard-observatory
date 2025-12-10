import { useState, useEffect, useMemo, useCallback } from 'react';
import { HardDrive, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
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
  const { toast } = useToast();
  
  // Estados de filtros
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedHosting, setSelectedHosting] = useState<string>('All');
  const [selectedInstance, setSelectedInstance] = useState<string>('All');
  const [selectedEstado, setSelectedEstado] = useState<string>('All');

  // Cargar datos iniciales (sin filtros)
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const [disksData, filtersData] = await Promise.all([
          disksApi.getDisks(),
          disksApi.getFilters(),
        ]);

        setAllDisks(disksData);
        setFilters(filtersData);
      } catch (error) {
        console.error('Error al cargar datos iniciales:', error);
        toast({
          title: 'Error',
          description: 'No se pudieron cargar los datos',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInitialData();
  }, [toast]);

  // Calcular discos filtrados de forma memoizada (sin useEffect adicional)
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

    return result;
  }, [allDisks, selectedAmbiente, selectedHosting, selectedInstance, selectedEstado]);

  // Calcular resumen de forma memoizada
  const summary = useMemo((): DiskSummaryDto | null => {
    if (filteredDisks.length === 0 && allDisks.length === 0) return null;

    const alertadosReales = filteredDisks.filter(d => d.isAlerted).length;
    const bajosSinRiesgo = filteredDisks.filter(d => !d.isAlerted && (d.porcentajeLibre ?? 100) < 10).length;
    const advertencia = filteredDisks.filter(d => d.estado === 'Advertencia').length;
    const saludables = filteredDisks.filter(d => d.estado === 'Saludable').length;

    return {
      discosCriticos: alertadosReales,
      discosAdvertencia: advertencia,
      discosSaludables: saludables,
      totalDiscos: filteredDisks.length,
      discosAlertadosReales: alertadosReales,
      discosBajosSinRiesgo: bajosSinRiesgo,
      ultimaCaptura: allDisks[0]?.captureDate,
    };
  }, [filteredDisks, allDisks]);

  // Filtros anidados - opciones disponibles según selección previa
  const availableHostings = useMemo(() => {
    if (selectedAmbiente === 'All') {
      return filters?.hostings || [];
    }
    
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

  // Handlers para cambio de filtros con reset de dependientes
  const handleAmbienteChange = useCallback((value: string) => {
    setSelectedAmbiente(value);
    setSelectedHosting('All');
    setSelectedInstance('All');
  }, []);

  const handleHostingChange = useCallback((value: string) => {
    setSelectedHosting(value);
    setSelectedInstance('All');
  }, []);

  const handleInstanceChange = useCallback((value: string) => {
    setSelectedInstance(value);
  }, []);

  const handleEstadoChange = useCallback((value: string) => {
    setSelectedEstado(value);
  }, []);

  // Hook de ordenamiento usando los discos filtrados directamente
  const { sortedData, requestSort, getSortIndicator } = useTableSort(filteredDisks);

  const getDiskSeverity = (disk: DiskDto): 'critical' | 'warning' | 'success' | 'info' => {
    if (disk.isAlerted) return 'critical';
    if (disk.estado === 'Critico') return 'critical';
    if (disk.estado === 'Advertencia') return 'warning';
    return 'success';
  };

  // Preparar opciones para el Combobox de instancias
  const instanceOptions: ComboboxOption[] = useMemo(() => {
    return [
      { value: 'All', label: 'Todas las instancias' },
      ...availableInstances.map(inst => ({ value: inst, label: inst }))
    ];
  }, [availableInstances]);

  // Función para renderizar el badge de estado
  const renderEstadoBadge = (disk: DiskDto) => {
    // Disco realmente alertado (growth + espacio real <= 10%)
    if (disk.isAlerted) {
      return (
        <Badge variant="destructive" className="text-xs">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Crítico
        </Badge>
      );
    }
    
    // Disco bajo sin riesgo (sin growth o con espacio interno)
    if (!disk.isAlerted && (disk.porcentajeLibre ?? 100) < 10) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">
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
        <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
          Advertencia
        </Badge>
      );
    }
    
    return (
      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
        <CheckCircle2 className="w-3 h-3 mr-1" />
        Saludable
      </Badge>
    );
  };

  if (loading && allDisks.length === 0) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Espacio en Disco</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Monitoreo de almacenamiento con análisis de espacio real (v3.3)
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Discos Críticos"
          value={summary?.discosCriticos ?? 0}
          icon={HardDrive}
          description="Growth + espacio real ≤10%"
          variant={(summary?.discosCriticos ?? 0) === 0 ? 'success' : 'critical'}
        />
        <KPICard
          title="Discos Bajos (sin riesgo)"
          value={summary?.discosBajosSinRiesgo ?? 0}
          icon={HardDrive}
          description="<10% físico, sin growth"
          variant={(summary?.discosBajosSinRiesgo ?? 0) === 0 ? 'success' : 'warning'}
        />
        <KPICard
          title="Discos en Advertencia"
          value={summary?.discosAdvertencia ?? 0}
          icon={HardDrive}
          description="10-20% libre"
          variant={(summary?.discosAdvertencia ?? 0) === 0 ? 'success' : 'warning'}
        />
        <KPICard
          title="Discos Saludables"
          value={summary?.discosSaludables ?? 0}
          icon={HardDrive}
          description="> 20% libre"
          variant="success"
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {/* Filtro 1: Ambiente */}
            <div>
              <label className="text-sm font-medium mb-2 block">Ambiente</label>
              <Select value={selectedAmbiente} onValueChange={handleAmbienteChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos</SelectItem>
                  {filters?.ambientes.map((amb) => (
                    <SelectItem key={amb} value={amb}>
                      {amb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro 2: Hosting (dependiente de Ambiente) */}
            <div>
              <label className="text-sm font-medium mb-2 block">Hosting</label>
              <Select 
                value={selectedHosting} 
                onValueChange={handleHostingChange}
                disabled={availableHostings.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos</SelectItem>
                  {availableHostings.map((host) => (
                    <SelectItem key={host} value={host}>
                      {host}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro 3: Instancia (dependiente de Ambiente + Hosting, con búsqueda) */}
            <div>
              <label className="text-sm font-medium mb-2 block">Instancia</label>
              <Combobox
                options={instanceOptions}
                value={selectedInstance}
                onValueChange={handleInstanceChange}
                placeholder="Todas las instancias"
                searchPlaceholder="Buscar instancia..."
                emptyText="No se encontraron instancias"
              />
            </div>

            {/* Filtro 4: Estado (independiente) */}
            <div>
              <label className="text-sm font-medium mb-2 block">Estado</label>
              <Select value={selectedEstado} onValueChange={handleEstadoChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos</SelectItem>
                  {filters?.estados.map((est) => (
                    <SelectItem key={est} value={est}>
                      {est}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="gradient-card shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Detalle por Disco</CardTitle>
          <span className="text-sm text-muted-foreground">
            {filteredDisks.length} disco(s) mostrado(s)
          </span>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Cargando...</p>
            </div>
          ) : sortedData.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">No hay datos disponibles con los filtros seleccionados</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('servidor')}
                  >
                    Servidor {getSortIndicator('servidor')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('drive')}
                  >
                    Drive {getSortIndicator('drive')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-right cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('totalGB')}
                  >
                    Total (GB) {getSortIndicator('totalGB')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-right cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('porcentajeLibre')}
                  >
                    % Libre Físico {getSortIndicator('porcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-right cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('realPorcentajeLibre')}
                  >
                    % Libre REAL {getSortIndicator('realPorcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-center cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('filesWithGrowth')}
                  >
                    Growth {getSortIndicator('filesWithGrowth')}
                  </TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                  <TableHead className="text-xs">Uso</TableHead>
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
                      'bg-red-50 dark:bg-red-950/30': disk.isAlerted,
                    })}>
                      <TableCell className="font-mono text-xs py-2">{disk.servidor}</TableCell>
                      <TableCell className="font-mono text-xs font-bold py-2">{disk.drive?.toUpperCase()}</TableCell>
                      <TableCell className="text-right font-mono text-xs py-2">
                        {disk.totalGB?.toFixed(0) ?? 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs py-2">
                        <span className={cn({
                          'text-destructive font-bold': (disk.porcentajeLibre ?? 100) < 10,
                          'text-amber-600 dark:text-amber-400': (disk.porcentajeLibre ?? 100) >= 10 && (disk.porcentajeLibre ?? 100) < 20,
                          'text-muted-foreground': (disk.porcentajeLibre ?? 100) >= 20,
                        })}>
                          {disk.porcentajeLibre?.toFixed(1) ?? 'N/A'}%
                        </span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          ({disk.libreGB?.toFixed(1) ?? '?'} GB)
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs py-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger className="cursor-help">
                              <div className="flex flex-col items-end">
                                <span className={cn('font-bold', {
                                  'text-destructive': realFreePct <= 10 && disk.filesWithGrowth > 0,
                                  'text-amber-600 dark:text-amber-400': realFreePct > 10 && realFreePct < 20,
                                  'text-green-600 dark:text-green-400': realFreePct >= 20,
                                })}>
                                  {realFreePct.toFixed(1)}%
                                </span>
                                {hasInternalSpace && (
                                  <span className="text-[10px] text-green-600 dark:text-green-400">
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
                                <hr className="my-1" />
                                <p className="text-xs text-muted-foreground">
                                  {realFreePct <= 10 
                                    ? '⚠️ Espacio REAL ≤ 10%' 
                                    : realFreePct < 20 
                                      ? '⚡ Espacio moderado (10-20%)'
                                      : '✅ Espacio saludable (> 20%)'}
                                </p>
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge 
                                variant={disk.filesWithGrowth > 0 ? 'default' : 'secondary'}
                                className={cn('text-xs', {
                                  'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300': disk.filesWithGrowth > 0,
                                  'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400': disk.filesWithGrowth === 0,
                                })}
                              >
                                {disk.filesWithGrowth > 0 ? `${disk.filesWithGrowth} sí` : 'No'}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-sm">
                                <p>Archivos con growth: {disk.filesWithGrowth}</p>
                                <p>Archivos sin growth: {disk.filesWithoutGrowth}</p>
                                <p>Total archivos: {disk.totalFiles}</p>
                                {disk.filesWithGrowth === 0 && (
                                  <p className="text-amber-600 mt-1">
                                    ⚠️ Sin growth = no van a crecer
                                  </p>
                                )}
                                {disk.filesWithGrowth > 0 && realFreePct <= 10 && (
                                  <p className="text-red-600 mt-1">
                                    🚨 Con growth + bajo espacio = CRÍTICO
                                  </p>
                                )}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="py-2">
                        {renderEstadoBadge(disk)}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="w-20">
                          <Progress 
                            value={usedPct} 
                            className={cn('h-2', {
                              '[&>div]:bg-destructive': severity === 'critical',
                              '[&>div]:bg-amber-500': severity === 'warning',
                              '[&>div]:bg-green-500': severity === 'success',
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
        </CardContent>
      </Card>
    </div>
  );
}
