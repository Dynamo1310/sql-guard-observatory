import { useEffect, useState, useMemo, useCallback } from 'react';
import { Wrench, Database, Search, RefreshCw } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

  // Filtros seleccionados
  const [selectedAmbiente, setSelectedAmbiente] = useState<string>('Produccion');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
      
      // Cargar detalles de mantenimiento para todas las instancias
      await loadAllMaintenanceDetails(data);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
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
    return ['All', ...unique.sort()];
  }, [healthScores]);

  // Filtrar por ambiente
  const filteredScores = useMemo(() => {
    let result = healthScores;
    if (selectedAmbiente !== 'All') {
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

  const getStatusVariant = (status: string): 'success' | 'warning' | 'critical' => {
    if (status === 'ok') return 'success';
    if (status === 'warning') return 'warning';
    return 'critical';
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Mantenimiento de Bases de Datos</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Mantenimiento de Bases de Datos</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Estado de CHECKDB e Index Optimize
            <span className="ml-2 text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded-full font-medium">
              {selectedAmbiente === 'All' ? 'Todos' : selectedAmbiente} ({filteredScores.length} instancias)
            </span>
            {loadingDetails && (
              <span className="ml-2 text-xs bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded-full font-medium">
                Cargando detalles...
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ambiente:</span>
              <Select value={selectedAmbiente} onValueChange={setSelectedAmbiente}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ambientes.map(amb => (
                    <SelectItem key={amb} value={amb}>
                      {amb === 'All' ? 'Todos' : amb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar instancia..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs: CHECKDB e Index Optimize */}
      <Tabs defaultValue="checkdb" className="space-y-4">
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
        <TabsContent value="checkdb" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <KPICard
              title="CHECKDB OK"
              value={checkdbStats.ok}
              icon={Database}
              description="Ejecutado en últimos 7 días"
              variant="success"
            />
            <KPICard
              title="Advertencias"
              value={checkdbStats.warning}
              icon={Database}
              description="Entre 8 y 14 días"
              variant={checkdbStats.warning === 0 ? 'success' : 'warning'}
            />
            <KPICard
              title="Vencidos"
              value={checkdbStats.critical}
              icon={Database}
              description="Más de 14 días"
              variant={checkdbStats.critical === 0 ? 'success' : 'critical'}
            />
          </div>

          <Card className="gradient-card shadow-card">
            <CardHeader>
              <CardTitle>Estado de CHECKDB por Instancia</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortCheckdb('instanceName')}
                    >
                      Instancia {getSortIndicatorCheckdb('instanceName')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortCheckdb('ambiente')}
                    >
                      Ambiente {getSortIndicatorCheckdb('ambiente')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortCheckdb('hostingSite')}
                    >
                      Hosting {getSortIndicatorCheckdb('hostingSite')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortCheckdb('lastDate')}
                    >
                      Último CHECKDB {getSortIndicatorCheckdb('lastDate')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent text-center"
                      onClick={() => requestSortCheckdb('daysAgo')}
                    >
                      Días {getSortIndicatorCheckdb('daysAgo')}
                    </TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCheckdb.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay datos disponibles
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedCheckdb.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs py-2">{row.instanceName}</TableCell>
                        <TableCell className="text-xs py-2">{row.ambiente || '-'}</TableCell>
                        <TableCell className="text-xs py-2">{row.hostingSite || '-'}</TableCell>
                        <TableCell className="font-mono text-xs py-2">{formatDate(row.lastDate)}</TableCell>
                        <TableCell className="text-center py-2">
                          <StatusBadge status={getStatusVariant(row.status)}>
                            {row.daysAgo === 999 ? 'N/A' : `${row.daysAgo}d`}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={getStatusVariant(row.status)}>
                            {row.status === 'ok' ? 'OK' : row.status === 'warning' ? 'Atrasado' : 'Vencido'}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Index Optimize */}
        <TabsContent value="indexoptimize" className="space-y-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            <KPICard
              title="Index Optimize OK"
              value={indexStats.ok}
              icon={Wrench}
              description="Ejecutado en últimos 7 días"
              variant="success"
            />
            <KPICard
              title="Advertencias"
              value={indexStats.warning}
              icon={Wrench}
              description="Entre 8 y 14 días"
              variant={indexStats.warning === 0 ? 'success' : 'warning'}
            />
            <KPICard
              title="Vencidos"
              value={indexStats.critical}
              icon={Wrench}
              description="Más de 14 días"
              variant={indexStats.critical === 0 ? 'success' : 'critical'}
            />
          </div>

          <Card className="gradient-card shadow-card">
            <CardHeader>
              <CardTitle>Estado de Index Optimize por Instancia</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortIndex('instanceName')}
                    >
                      Instancia {getSortIndicatorIndex('instanceName')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortIndex('ambiente')}
                    >
                      Ambiente {getSortIndicatorIndex('ambiente')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortIndex('hostingSite')}
                    >
                      Hosting {getSortIndicatorIndex('hostingSite')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent"
                      onClick={() => requestSortIndex('lastDate')}
                    >
                      Último Index Optimize {getSortIndicatorIndex('lastDate')}
                    </TableHead>
                    <TableHead 
                      className="text-xs cursor-pointer hover:bg-accent text-center"
                      onClick={() => requestSortIndex('daysAgo')}
                    >
                      Días {getSortIndicatorIndex('daysAgo')}
                    </TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedIndex.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No hay datos disponibles
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedIndex.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs py-2">{row.instanceName}</TableCell>
                        <TableCell className="text-xs py-2">{row.ambiente || '-'}</TableCell>
                        <TableCell className="text-xs py-2">{row.hostingSite || '-'}</TableCell>
                        <TableCell className="font-mono text-xs py-2">{formatDate(row.lastDate)}</TableCell>
                        <TableCell className="text-center py-2">
                          <StatusBadge status={getStatusVariant(row.status)}>
                            {row.daysAgo === 999 ? 'N/A' : `${row.daysAgo}d`}
                          </StatusBadge>
                        </TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={getStatusVariant(row.status)}>
                            {row.status === 'ok' ? 'OK' : row.status === 'warning' ? 'Atrasado' : 'Vencido'}
                          </StatusBadge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
