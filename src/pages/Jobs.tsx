/**
 * Página de Mantenimiento - CHECKDB e Index Optimize
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Wrench, Database, Search, RefreshCw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { healthScoreV3Api, HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';
import { toast } from 'sonner';
import { useTableSort } from '@/hooks/use-table-sort';

interface MaintenanceRowData {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  lastDate?: string;
  daysAgo: number;
  isOk: boolean;
  status: 'ok' | 'warning' | 'critical';
}

export default function Jobs() {
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [instanceDetails, setInstanceDetails] = useState<Record<string, HealthScoreV3DetailDto>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtros seleccionados
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('Produccion');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = useCallback(async (showLoading: boolean = true) => {
    try {
      if (showLoading) setLoading(true);
      else setIsRefreshing(true);
      
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
      
      // Cargar detalles de mantenimiento para todas las instancias
      await loadAllMaintenanceDetails(data);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const loadAllMaintenanceDetails = async (scores: HealthScoreV3Dto[]) => {
    setLoadingDetails(true);
    const details: Record<string, HealthScoreV3DetailDto> = {};
    
    // Cargar detalles en paralelo (en lotes de 10 para no sobrecargar)
    const batchSize = 10;
    for (let i = 0; i < scores.length; i += batchSize) {
      const batch = scores.slice(i, i + batchSize);
      const promises = batch.map(async (score) => {
        try {
          const detail = await healthScoreV3Api.getHealthScoreDetails(score.instanceName);
          return { instanceName: score.instanceName, detail };
        } catch {
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      results.forEach(result => {
        if (result) {
          details[result.instanceName] = result.detail;
        }
      });
    }
    
    setInstanceDetails(details);
    setLoadingDetails(false);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Obtener ambientes únicos
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return ['all', ...unique.sort()];
  }, [healthScores]);

  // Filtrar por ambiente
  const filteredScores = useMemo(() => {
    let result = healthScores;
    if (selectedAmbiente !== 'all') {
      result = result.filter(s => s.ambiente === selectedAmbiente);
    }
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(s => 
        s.instanceName.toLowerCase().includes(query) ||
        s.ambiente?.toLowerCase().includes(query) ||
        s.hostingSite?.toLowerCase().includes(query)
      );
    }
    return result;
  }, [healthScores, selectedAmbiente, searchQuery]);

  // Calcular días desde una fecha
  const getDaysAgo = (dateStr?: string): number => {
    if (!dateStr) return 999;
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = now.getTime() - date.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  // Determinar estado basado en días
  const getStatusFromDays = (days: number, threshold: number): 'ok' | 'warning' | 'critical' => {
    if (days <= threshold) return 'ok';
    if (days <= threshold * 2) return 'warning';
    return 'critical';
  };

  // Datos de CHECKDB
  const checkdbData: MaintenanceRowData[] = useMemo(() => {
    return filteredScores.map(s => {
      const details = instanceDetails[s.instanceName];
      const lastCheckdb = details?.maintenanceDetails?.lastCheckdb;
      const daysAgo = getDaysAgo(lastCheckdb);
      const isOk = details?.maintenanceDetails?.checkdbOk ?? (daysAgo <= 7);
      
      return {
        instanceName: s.instanceName,
        ambiente: s.ambiente,
        hostingSite: s.hostingSite,
        lastDate: lastCheckdb,
        daysAgo,
        isOk,
        status: getStatusFromDays(daysAgo, 7) // 7 días = OK, 14 = warning, >14 = critical
      };
    }).sort((a, b) => b.daysAgo - a.daysAgo);
  }, [filteredScores, instanceDetails]);

  // Datos de Index Optimize
  const indexOptimizeData: MaintenanceRowData[] = useMemo(() => {
    return filteredScores.map(s => {
      const details = instanceDetails[s.instanceName];
      const lastIndexOptimize = details?.maintenanceDetails?.lastIndexOptimize;
      const daysAgo = getDaysAgo(lastIndexOptimize);
      const isOk = details?.maintenanceDetails?.indexOptimizeOk ?? (daysAgo <= 7);
      
      return {
        instanceName: s.instanceName,
        ambiente: s.ambiente,
        hostingSite: s.hostingSite,
        lastDate: lastIndexOptimize,
        daysAgo,
        isOk,
        status: getStatusFromDays(daysAgo, 7) // 7 días = OK, 14 = warning, >14 = critical
      };
    }).sort((a, b) => b.daysAgo - a.daysAgo);
  }, [filteredScores, instanceDetails]);

  // Estadísticas
  const checkdbStats = useMemo(() => ({
    ok: checkdbData.filter(d => d.status === 'ok').length,
    warning: checkdbData.filter(d => d.status === 'warning').length,
    critical: checkdbData.filter(d => d.status === 'critical').length,
  }), [checkdbData]);

  const indexStats = useMemo(() => ({
    ok: indexOptimizeData.filter(d => d.status === 'ok').length,
    warning: indexOptimizeData.filter(d => d.status === 'warning').length,
    critical: indexOptimizeData.filter(d => d.status === 'critical').length,
  }), [indexOptimizeData]);

  // Ordenamiento
  const { sortedData: sortedCheckdb, requestSort: requestSortCheckdb, getSortIndicator: getSortIndicatorCheckdb } = useTableSort(checkdbData);
  const { sortedData: sortedIndex, requestSort: requestSortIndex, getSortIndicator: getSortIndicatorIndex } = useTableSort(indexOptimizeData);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Sin datos';
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Get status badge
  const getStatusBadge = (status: string, daysAgo: number) => {
    if (status === 'ok') {
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          OK
        </Badge>
      );
    }
    if (status === 'warning') {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Atrasado
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        Vencido
      </Badge>
    );
  };

  // Get days badge
  const getDaysBadge = (daysAgo: number, status: string) => {
    const colorClass = status === 'ok' ? 'text-emerald-500' : status === 'warning' ? 'text-warning' : 'text-red-500';
    return (
      <span className={`font-bold ${colorClass}`}>
        {daysAgo === 999 ? 'N/A' : `${daysAgo}d`}
      </span>
    );
  };

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-80" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Filters skeleton */}
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        
        {/* Tabs skeleton */}
        <Skeleton className="h-10 w-64" />
        
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(3)].map((_, i) => (
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
            <Wrench className="h-8 w-8" />
            Mantenimiento de Bases de Datos
          </h1>
          <p className="text-muted-foreground">
            Estado de CHECKDB e Index Optimize
            {loadingDetails && (
              <span className="ml-2 text-xs">(Cargando detalles...)</span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadData(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar instancia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent>
            {ambientes.map(amb => (
              <SelectItem key={amb} value={amb}>
                {amb === 'all' ? 'Todos' : amb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredScores.length} instancias
      </div>

      {/* Tabs: CHECKDB e Index Optimize */}
      <Tabs defaultValue="checkdb" className="space-y-6">
        <TabsList>
          <TabsTrigger value="checkdb" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            CHECKDB
          </TabsTrigger>
          <TabsTrigger value="indexoptimize" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Index Optimize
          </TabsTrigger>
        </TabsList>

        {/* Tab: CHECKDB */}
        <TabsContent value="checkdb" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">CHECKDB OK</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{checkdbStats.ok}</div>
                <p className="text-xs text-muted-foreground">
                  Ejecutado en últimos 7 días
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Advertencias</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${checkdbStats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${checkdbStats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                  {checkdbStats.warning}
                </div>
                <p className="text-xs text-muted-foreground">
                  Entre 8 y 14 días
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
                <XCircle className={`h-4 w-4 ${checkdbStats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${checkdbStats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {checkdbStats.critical}
                </div>
                <p className="text-xs text-muted-foreground">
                  Más de 14 días
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                Estado de CHECKDB por Instancia
              </CardTitle>
              <CardDescription>
                Historial de ejecución de CHECKDB para verificación de integridad
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-auto">
                {sortedCheckdb.length === 0 ? (
                  <div className="text-center py-12">
                    <Database className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No hay datos</h3>
                    <p className="text-muted-foreground">
                      No hay datos disponibles con los filtros seleccionados.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortCheckdb('instanceName')}>
                          Instancia {getSortIndicatorCheckdb('instanceName')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortCheckdb('ambiente')}>
                          Ambiente {getSortIndicatorCheckdb('ambiente')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortCheckdb('hostingSite')}>
                          Hosting {getSortIndicatorCheckdb('hostingSite')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortCheckdb('lastDate')}>
                          Último CHECKDB {getSortIndicatorCheckdb('lastDate')}
                        </TableHead>
                        <TableHead className="text-center cursor-pointer hover:bg-accent" onClick={() => requestSortCheckdb('daysAgo')}>
                          Días {getSortIndicatorCheckdb('daysAgo')}
                        </TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedCheckdb.map((row, idx) => (
                        <TableRow key={idx} className={cn({
                          'bg-destructive/10 dark:bg-destructive/20': row.status === 'critical',
                        })}>
                          <TableCell className="font-medium">{row.instanceName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {row.ambiente || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.hostingSite || 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(row.lastDate)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getDaysBadge(row.daysAgo, row.status)}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(row.status, row.daysAgo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Index Optimize */}
        <TabsContent value="indexoptimize" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Index Optimize OK</CardTitle>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{indexStats.ok}</div>
                <p className="text-xs text-muted-foreground">
                  Ejecutado en últimos 7 días
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Advertencias</CardTitle>
                <AlertTriangle className={`h-4 w-4 ${indexStats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${indexStats.warning > 0 ? 'text-warning' : 'text-emerald-500'}`}>
                  {indexStats.warning}
                </div>
                <p className="text-xs text-muted-foreground">
                  Entre 8 y 14 días
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
                <XCircle className={`h-4 w-4 ${indexStats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${indexStats.critical > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                  {indexStats.critical}
                </div>
                <p className="text-xs text-muted-foreground">
                  Más de 14 días
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Estado de Index Optimize por Instancia
              </CardTitle>
              <CardDescription>
                Historial de ejecución de tareas de mantenimiento de índices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[500px] overflow-auto">
                {sortedIndex.length === 0 ? (
                  <div className="text-center py-12">
                    <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No hay datos</h3>
                    <p className="text-muted-foreground">
                      No hay datos disponibles con los filtros seleccionados.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortIndex('instanceName')}>
                          Instancia {getSortIndicatorIndex('instanceName')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortIndex('ambiente')}>
                          Ambiente {getSortIndicatorIndex('ambiente')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortIndex('hostingSite')}>
                          Hosting {getSortIndicatorIndex('hostingSite')}
                        </TableHead>
                        <TableHead className="cursor-pointer hover:bg-accent" onClick={() => requestSortIndex('lastDate')}>
                          Último Index Optimize {getSortIndicatorIndex('lastDate')}
                        </TableHead>
                        <TableHead className="text-center cursor-pointer hover:bg-accent" onClick={() => requestSortIndex('daysAgo')}>
                          Días {getSortIndicatorIndex('daysAgo')}
                        </TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedIndex.map((row, idx) => (
                        <TableRow key={idx} className={cn({
                          'bg-destructive/10 dark:bg-destructive/20': row.status === 'critical',
                        })}>
                          <TableCell className="font-medium">{row.instanceName}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {row.ambiente || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {row.hostingSite || 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(row.lastDate)}
                          </TableCell>
                          <TableCell className="text-center">
                            {getDaysBadge(row.daysAgo, row.status)}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(row.status, row.daysAgo)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
