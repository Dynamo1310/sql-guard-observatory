import { useState, useEffect, useMemo } from 'react';
import { Save, Filter } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { healthScoreV3Api, HealthScoreV3Dto } from '@/services/api';
import { useTableSort } from '@/hooks/use-table-sort';

interface BackupRowData {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  score: number;
  status: 'ok' | 'warning' | 'critical';
  issue: string;
}

export default function Backups() {
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAmbiente, setFilterAmbiente] = useState<string>('Produccion');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
    } catch (error) {
      console.error('Error al cargar datos de backups:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obtener ambientes únicos
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return ['All', ...unique.sort()];
  }, [healthScores]);

  // Filtrar por ambiente
  const filteredScores = useMemo(() => {
    if (filterAmbiente === 'All') return healthScores;
    return healthScores.filter(s => s.ambiente === filterAmbiente);
  }, [healthScores, filterAmbiente]);

  // Convertir a datos de tabla de backups
  const backupData: BackupRowData[] = useMemo(() => {
    return filteredScores.map(s => {
      const score = s.score_Backups ?? 100;
      let status: 'ok' | 'warning' | 'critical' = 'ok';
      let issue = 'OK';
      
      if (score < 50) {
        status = 'critical';
        issue = 'FULL vencido';
      } else if (score < 100) {
        status = 'warning';
        issue = 'LOG vencido';
      }
      
      return {
        instanceName: s.instanceName,
        ambiente: s.ambiente,
        hostingSite: s.hostingSite,
        score,
        status,
        issue
      };
    }).sort((a, b) => a.score - b.score);
  }, [filteredScores]);

  // Estadísticas
  const stats = useMemo(() => {
    const ok = backupData.filter(b => b.status === 'ok').length;
    const warning = backupData.filter(b => b.status === 'warning').length;
    const critical = backupData.filter(b => b.status === 'critical').length;
    return { ok, warning, critical };
  }, [backupData]);

  const { sortedData, requestSort, getSortIndicator } = useTableSort(backupData);

  const getStatusVariant = (status: string): 'success' | 'warning' | 'critical' => {
    if (status === 'ok') return 'success';
    if (status === 'warning') return 'warning';
    return 'critical';
  };

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Estado de Backups</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Cargando datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Estado de Backups</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Monitoreo de respaldos y cumplimiento de RPO
          <span className="ml-2 text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            {filterAmbiente === 'All' ? 'Todos' : filterAmbiente} ({backupData.length} instancias)
          </span>
        </p>
      </div>

      {/* Filtro */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Ambiente:</span>
              <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
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
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          title="Backups OK"
          value={stats.ok}
          icon={Save}
          description="RPO cumplido (score 100%)"
          variant="success"
        />
        <KPICard
          title="Advertencias"
          value={stats.warning}
          icon={Save}
          description="LOG backup vencido"
          variant={stats.warning === 0 ? 'success' : 'warning'}
        />
        <KPICard
          title="Críticos"
          value={stats.critical}
          icon={Save}
          description="FULL backup vencido"
          variant={stats.critical === 0 ? 'success' : 'critical'}
        />
      </div>

      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Estado de Backups por Instancia</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('instanceName')}
                >
                  Instancia {getSortIndicator('instanceName')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('ambiente')}
                >
                  Ambiente {getSortIndicator('ambiente')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('hostingSite')}
                >
                  Hosting {getSortIndicator('hostingSite')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent text-center"
                  onClick={() => requestSort('score')}
                >
                  Score {getSortIndicator('score')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('issue')}
                >
                  Problema {getSortIndicator('issue')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('status')}
                >
                  Estado {getSortIndicator('status')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay datos de backups disponibles
                  </TableCell>
                </TableRow>
              ) : (
                sortedData.map((backup, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs py-2">{backup.instanceName}</TableCell>
                    <TableCell className="text-xs py-2">{backup.ambiente || '-'}</TableCell>
                    <TableCell className="text-xs py-2">{backup.hostingSite || '-'}</TableCell>
                    <TableCell className="text-center py-2">
                      <StatusBadge status={getStatusVariant(backup.status)}>
                        {backup.score}%
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="text-xs py-2">{backup.issue}</TableCell>
                    <TableCell className="py-2">
                      <StatusBadge status={getStatusVariant(backup.status)}>
                        {backup.status === 'ok' ? 'OK' : backup.status === 'warning' ? 'Advertencia' : 'Crítico'}
                      </StatusBadge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
