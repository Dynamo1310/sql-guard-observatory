import { useState, useEffect, useMemo } from 'react';
import { HardDrive } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { disksApi, DiskDto, DiskSummaryDto, DiskFiltersDto } from '@/services/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { useToast } from '@/hooks/use-toast';

export default function Disks() {
  const [disks, setDisks] = useState<DiskDto[]>([]);
  const [allDisks, setAllDisks] = useState<DiskDto[]>([]); // Guardar todos los discos para filtrado local
  const [summary, setSummary] = useState<DiskSummaryDto | null>(null);
  const [filters, setFilters] = useState<DiskFiltersDto | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // Estados de filtros
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('All');
  const [selectedHosting, setSelectedHosting] = useState<string>('All');
  const [selectedInstance, setSelectedInstance] = useState<string>('All');
  const [selectedEstado, setSelectedEstado] = useState<string>('All');

  const { sortedData, requestSort, getSortIndicator } = useTableSort(disks);

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
        setDisks(disksData);
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
  }, []);

  // Filtros anidados - opciones disponibles según selección previa
  const availableHostings = useMemo(() => {
    if (selectedAmbiente === 'All') {
      return filters?.hostings || [];
    }
    
    // Filtrar hostings que existen en el ambiente seleccionado
    const hostingsInAmbiente = allDisks
      .filter(d => d.ambiente === selectedAmbiente)
      .map(d => d.hosting)
      .filter((h): h is string => !!h);
    
    return [...new Set(hostingsInAmbiente)].sort();
  }, [selectedAmbiente, filters, allDisks]);

  const availableInstances = useMemo(() => {
    let filteredDisks = allDisks;
    
    if (selectedAmbiente !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.ambiente === selectedAmbiente);
    }
    
    if (selectedHosting !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.hosting === selectedHosting);
    }
    
    const instances = filteredDisks
      .map(d => d.instanceName)
      .filter((inst): inst is string => !!inst);
    
    return [...new Set(instances)].sort();
  }, [selectedAmbiente, selectedHosting, allDisks]);

  // Aplicar filtros y actualizar resumen cuando cambian las selecciones
  useEffect(() => {
    let filteredDisks = allDisks;

    if (selectedAmbiente !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.ambiente === selectedAmbiente);
    }

    if (selectedHosting !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.hosting === selectedHosting);
    }

    if (selectedInstance !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.instanceName === selectedInstance);
    }

    if (selectedEstado !== 'All') {
      filteredDisks = filteredDisks.filter(d => d.estado === selectedEstado);
    }

    setDisks(filteredDisks);

    // Calcular resumen basado en discos filtrados
    const criticos = filteredDisks.filter(d => d.estado === 'Critico').length;
    const advertencia = filteredDisks.filter(d => d.estado === 'Advertencia').length;
    const saludables = filteredDisks.filter(d => d.estado === 'Saludable').length;

    setSummary({
      discosCriticos: criticos,
      discosAdvertencia: advertencia,
      discosSaludables: saludables,
      totalDiscos: filteredDisks.length,
      ultimaCaptura: allDisks[0]?.captureDate,
    });
  }, [selectedAmbiente, selectedHosting, selectedInstance, selectedEstado, allDisks]);

  // Resetear filtros dependientes cuando cambia un filtro padre
  useEffect(() => {
    // Cuando cambia el ambiente, resetear hosting e instancia
    setSelectedHosting('All');
    setSelectedInstance('All');
  }, [selectedAmbiente]);

  useEffect(() => {
    // Cuando cambia el hosting, resetear instancia
    setSelectedInstance('All');
  }, [selectedHosting]);

  const getDiskSeverity = (estado?: string): 'critical' | 'warning' | 'success' => {
    if (estado === 'Critico') return 'critical';
    if (estado === 'Advertencia') return 'warning';
    return 'success';
  };

  // Preparar opciones para el Combobox de instancias
  const instanceOptions: ComboboxOption[] = useMemo(() => {
    return [
      { value: 'All', label: 'Todas las instancias' },
      ...availableInstances.map(inst => ({ value: inst, label: inst }))
    ];
  }, [availableInstances]);

  if (loading && !summary) {
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
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Monitoreo de almacenamiento por servidor</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Discos Críticos"
          value={summary?.discosCriticos ?? 0}
          icon={HardDrive}
          description="< 10% libre"
          variant={(summary?.discosCriticos ?? 0) === 0 ? 'success' : 'critical'}
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
              <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
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
                onValueChange={setSelectedHosting}
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
                onValueChange={setSelectedInstance}
                placeholder="Todas las instancias"
                searchPlaceholder="Buscar instancia..."
                emptyText="No se encontraron instancias"
              />
            </div>

            {/* Filtro 4: Estado (independiente) */}
            <div>
              <label className="text-sm font-medium mb-2 block">Estado</label>
              <Select value={selectedEstado} onValueChange={setSelectedEstado}>
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
        <CardHeader>
          <CardTitle>Detalle por Disco</CardTitle>
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
                    onClick={() => requestSort('libreGB')}
                  >
                    Libre (GB) {getSortIndicator('libreGB')}
                  </TableHead>
                  <TableHead 
                    className="text-xs text-right cursor-pointer hover:bg-accent"
                    onClick={() => requestSort('porcentajeLibre')}
                  >
                    % Libre {getSortIndicator('porcentajeLibre')}
                  </TableHead>
                  <TableHead className="text-xs">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedData.map((disk) => {
                  const severity = getDiskSeverity(disk.estado);
                  const usedPct = 100 - (disk.porcentajeLibre ?? 0);
                  
                  return (
                    <TableRow key={disk.id}>
                      <TableCell className="font-mono text-xs py-2">{disk.servidor}</TableCell>
                      <TableCell className="font-mono text-xs font-bold py-2">{disk.drive}</TableCell>
                      <TableCell className="text-right font-mono text-xs py-2">
                        {disk.totalGB?.toFixed(2) ?? 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs py-2">
                        {disk.libreGB?.toFixed(2) ?? 'N/A'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-bold py-2">
                        <span className={cn({
                          'text-destructive': severity === 'critical',
                          'text-warning': severity === 'warning',
                          'text-success': severity === 'success',
                        })}>
                          {disk.porcentajeLibre?.toFixed(1) ?? 'N/A'}%
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="w-24">
                          <Progress 
                            value={usedPct} 
                            className={cn('h-2', {
                              '[&>div]:bg-destructive': severity === 'critical',
                              '[&>div]:bg-warning': severity === 'warning',
                              '[&>div]:bg-success': severity === 'success',
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
