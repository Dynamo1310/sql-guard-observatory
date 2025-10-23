import { useState, useEffect } from 'react';
import { Activity, HardDrive, Save, Wrench, Heart, AlertTriangle } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreApi, OverviewDataDto } from '@/services/api';
import { useNavigate } from 'react-router-dom';

export default function Overview() {
  const navigate = useNavigate();
  const [overviewData, setOverviewData] = useState<OverviewDataDto | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchOverviewData();
  }, []);

  const fetchOverviewData = async () => {
    try {
      setLoading(true);
      const data = await healthScoreApi.getOverviewData();
      setOverviewData(data);
    } catch (error) {
      console.error('Error al cargar datos del overview:', error);
    } finally {
      setLoading(false);
    }
  };

  // Ordenamiento para cada tabla
  const { sortedData: sortedCriticalInstances, requestSort: requestSortCritical, getSortIndicator: getSortIndicatorCritical } = useTableSort(overviewData?.criticalInstances || []);
  const { sortedData: sortedBackupIssues, requestSort: requestSortBackups, getSortIndicator: getSortIndicatorBackups } = useTableSort(overviewData?.backupIssues || []);

  if (loading) {
    return (
      <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Overview</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">Cargando datos...</p>
        </div>
      </div>
    );
  }

  const healthSummary = overviewData?.healthSummary;

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Overview</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">Panel de control - Estado general del sistema</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Health Score"
          value={healthSummary ? `${healthSummary.avgScore}` : '-'}
          icon={Heart}
          description={
            healthSummary 
              ? `${healthSummary.healthyCount} Healthy, ${healthSummary.warningCount} Warning, ${healthSummary.criticalCount} Critical` 
              : 'Sin datos'
          }
          variant={
            healthSummary 
              ? healthSummary.avgScore >= 90 
                ? 'success' 
                : healthSummary.avgScore >= 70 
                  ? 'warning' 
                  : 'critical'
              : 'default'
          }
          onClick={() => navigate('/healthscore')}
        />
        <KPICard
          title="Mantenimiento Atrasado"
          value={overviewData?.maintenanceOverdueCount || 0}
          icon={Wrench}
          description="CHECKDB o IndexOptimize vencido"
          variant={
            (overviewData?.maintenanceOverdueCount || 0) === 0 
              ? 'success' 
              : (overviewData?.maintenanceOverdueCount || 0) < 5 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/jobs')}
        />
        <KPICard
          title="Discos Críticos"
          value={overviewData?.criticalDisksCount || 0}
          icon={HardDrive}
          description="Menos de 15% libre"
          variant={
            (overviewData?.criticalDisksCount || 0) === 0 
              ? 'success' 
              : (overviewData?.criticalDisksCount || 0) < 3 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/disks')}
        />
        <KPICard
          title="Backups Atrasados"
          value={overviewData?.backupsOverdueCount || 0}
          icon={Save}
          description="RPO violado"
          variant={
            (overviewData?.backupsOverdueCount || 0) === 0 
              ? 'success' 
              : (overviewData?.backupsOverdueCount || 0) < 3 
                ? 'warning' 
                : 'critical'
          }
        />
        <KPICard
          title="Instancias Críticas"
          value={healthSummary?.criticalCount || 0}
          icon={AlertTriangle}
          description="Health Score < 70"
          variant={
            (healthSummary?.criticalCount || 0) === 0 
              ? 'success' 
              : (healthSummary?.criticalCount || 0) < 5 
                ? 'warning' 
                : 'critical'
          }
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle>Instancias con Problemas Críticos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortCritical('instanceName')}
                  >
                    Instancia {getSortIndicatorCritical('instanceName')}
                  </TableHead>
                  <TableHead className="text-xs">
                    Ambiente
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortCritical('healthScore')}
                  >
                    Score {getSortIndicatorCritical('healthScore')}
                  </TableHead>
                  <TableHead className="text-xs">
                    Problemas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCriticalInstances.length > 0 ? (
                  sortedCriticalInstances.map((instance, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">{instance.instanceName}</TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={
                          instance.ambiente?.toLowerCase().includes('prod') ? 'critical' :
                          instance.ambiente?.toLowerCase().includes('test') ? 'warning' :
                          'default'
                        }>
                          {instance.ambiente || 'N/A'}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <StatusBadge status="critical">{instance.healthScore}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {instance.issues.length > 0 ? instance.issues.join(', ') : 'Sin detalles'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      ✅ No hay instancias críticas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle>Backups Atrasados</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent"
                    onClick={() => requestSortBackups('instanceName')}
                  >
                    Instancia {getSortIndicatorBackups('instanceName')}
                  </TableHead>
                  <TableHead className="text-xs">
                    Problemas
                  </TableHead>
                  <TableHead className="text-xs">
                    Último FULL
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBackupIssues.length > 0 ? (
                  sortedBackupIssues.map((issue, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">{issue.instanceName}</TableCell>
                      <TableCell className="text-xs py-2">
                        {issue.breaches.length > 0 ? issue.breaches.join(', ') : 'Sin detalles'}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2">
                        {issue.lastFullBackup 
                          ? new Date(issue.lastFullBackup).toLocaleString('es-AR', { 
                              year: 'numeric', 
                              month: '2-digit', 
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          : 'Sin backup'}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      ✅ Todos los backups están al día
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
