import { useState, useEffect, useMemo } from 'react';
import { HardDrive, Save, Wrench, Heart, AlertTriangle } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreV3Api, HealthScoreV3Dto } from '@/services/api';
import { useNavigate } from 'react-router-dom';

// Interfaces para datos derivados
interface CriticalInstanceData {
  instanceName: string;
  ambiente?: string;
  healthScore: number;
  issues: string[];
}

interface BackupIssueData {
  instanceName: string;
  score: number;
  issues: string[];
}

export default function Overview() {
  const navigate = useNavigate();
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchHealthScores();
  }, []);

  const fetchHealthScores = async () => {
    try {
      setLoading(true);
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
    } catch (error) {
      console.error('Error al cargar datos del overview:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filtrar solo instancias de Producción
  const productionScores = useMemo(() => {
    return healthScores.filter(s => s.ambiente === 'Produccion');
  }, [healthScores]);

  // Calcular estadísticas de producción
  const stats = useMemo(() => {
    const total = productionScores.length;
    const healthy = productionScores.filter(s => s.healthStatus === 'Healthy').length;
    const warning = productionScores.filter(s => s.healthStatus === 'Warning' || s.healthStatus === 'Risk').length;
    const critical = productionScores.filter(s => s.healthStatus === 'Critical').length;
    const avgScore = total > 0 ? Math.round(productionScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;
    
    // Backups atrasados: donde score_Backups < 100
    const backupsOverdue = productionScores.filter(s => (s.score_Backups ?? 100) < 100).length;
    
    // Mantenimiento atrasado: donde score_Maintenance < 100
    const maintenanceOverdue = productionScores.filter(s => (s.score_Maintenance ?? 100) < 100).length;
    
    // Discos críticos: donde score_Discos < 50 (indica problemas serios de espacio)
    const criticalDisks = productionScores.filter(s => (s.score_Discos ?? 100) < 50).length;

    return { total, healthy, warning, critical, avgScore, backupsOverdue, maintenanceOverdue, criticalDisks };
  }, [productionScores]);

  // Instancias críticas de producción (healthStatus === 'Critical' o score < 70)
  const criticalInstances: CriticalInstanceData[] = useMemo(() => {
    return productionScores
      .filter(s => s.healthStatus === 'Critical' || s.healthScore < 70)
      .map(s => {
        const issues: string[] = [];
        if ((s.score_Backups ?? 100) < 100) issues.push('Backups');
        if ((s.score_AlwaysOn ?? 100) < 100) issues.push('AlwaysOn');
        if ((s.score_CPU ?? 100) < 50) issues.push('CPU Alto');
        if ((s.score_Memoria ?? 100) < 50) issues.push('Memoria');
        if ((s.score_Discos ?? 100) < 50) issues.push('Discos');
        if ((s.score_ErroresCriticos ?? 100) < 100) issues.push('Errores Críticos');
        if ((s.score_Maintenance ?? 100) < 100) issues.push('Mantenimiento');
        if (issues.length === 0) issues.push('Score bajo');
        
        return {
          instanceName: s.instanceName,
          ambiente: s.ambiente,
          healthScore: s.healthScore,
          issues
        };
      })
      .sort((a, b) => a.healthScore - b.healthScore);
  }, [productionScores]);

  // Backups atrasados de producción
  const backupIssues: BackupIssueData[] = useMemo(() => {
    return productionScores
      .filter(s => (s.score_Backups ?? 100) < 100)
      .map(s => {
        const issues: string[] = [];
        const backupScore = s.score_Backups ?? 100;
        if (backupScore < 50) {
          issues.push('FULL vencido');
        } else if (backupScore < 100) {
          issues.push('LOG vencido');
        }
        
        return {
          instanceName: s.instanceName,
          score: backupScore,
          issues
        };
      })
      .sort((a, b) => a.score - b.score);
  }, [productionScores]);

  // Ordenamiento para cada tabla
  const { sortedData: sortedCriticalInstances, requestSort: requestSortCritical, getSortIndicator: getSortIndicatorCritical } = useTableSort(criticalInstances);
  const { sortedData: sortedBackupIssues, requestSort: requestSortBackups, getSortIndicator: getSortIndicatorBackups } = useTableSort(backupIssues);

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

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Overview</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Panel de control - Estado general del sistema 
          <span className="ml-2 text-xs bg-blue-500/20 text-blue-600 px-2 py-0.5 rounded-full font-medium">
            Solo Producción ({stats.total} instancias)
          </span>
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        <KPICard
          title="Health Score"
          value={stats.avgScore > 0 ? `${stats.avgScore}` : '-'}
          icon={Heart}
          description={`${stats.healthy} Healthy, ${stats.warning} Warning, ${stats.critical} Critical`}
          variant={
            stats.avgScore >= 90 
              ? 'success' 
              : stats.avgScore >= 70 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/healthscore')}
        />
        <KPICard
          title="Mantenimiento Atrasado"
          value={stats.maintenanceOverdue}
          icon={Wrench}
          description="CHECKDB o IndexOptimize vencido"
          variant={
            stats.maintenanceOverdue === 0 
              ? 'success' 
              : stats.maintenanceOverdue < 5 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/jobs')}
        />
        <KPICard
          title="Discos Críticos"
          value={stats.criticalDisks}
          icon={HardDrive}
          description="Score disco < 50%"
          variant={
            stats.criticalDisks === 0 
              ? 'success' 
              : stats.criticalDisks < 3 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/disks')}
        />
        <KPICard
          title="Backups Atrasados"
          value={stats.backupsOverdue}
          icon={Save}
          description="RPO violado (Producción)"
          variant={
            stats.backupsOverdue === 0 
              ? 'success' 
              : stats.backupsOverdue < 3 
                ? 'warning' 
                : 'critical'
          }
        />
        <KPICard
          title="Instancias Críticas"
          value={stats.critical}
          icon={AlertTriangle}
          description="Health Score < 70 (Producción)"
          variant={
            stats.critical === 0 
              ? 'success' 
              : stats.critical < 5 
                ? 'warning' 
                : 'critical'
          }
        />
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Instancias Críticas
              <span className="text-xs font-normal bg-red-500/20 text-red-600 px-2 py-0.5 rounded-full">
                Producción
              </span>
            </CardTitle>
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
                      <TableCell className="py-2 text-center">
                        <StatusBadge status="critical">{instance.healthScore}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {instance.issues.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      ✅ No hay instancias críticas en Producción
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Backups Atrasados
              <span className="text-xs font-normal bg-amber-500/20 text-amber-600 px-2 py-0.5 rounded-full">
                Producción
              </span>
            </CardTitle>
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
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortBackups('score')}
                  >
                    Score {getSortIndicatorBackups('score')}
                  </TableHead>
                  <TableHead className="text-xs">
                    Problema
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBackupIssues.length > 0 ? (
                  sortedBackupIssues.map((issue, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">{issue.instanceName}</TableCell>
                      <TableCell className="py-2 text-center">
                        <StatusBadge status={issue.score < 50 ? 'critical' : 'warning'}>
                          {issue.score}%
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {issue.issues.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      ✅ Todos los backups de Producción están al día
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
