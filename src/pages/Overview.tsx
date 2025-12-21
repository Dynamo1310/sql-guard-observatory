import { useState, useEffect, useMemo } from 'react';
import { HardDrive, Save, Wrench, Heart, AlertTriangle } from 'lucide-react';
import { KPICard } from '@/components/dashboard/KPICard';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreV3Api, HealthScoreV3Dto, HealthScoreV3DetailDto, disksApi, DiskDto } from '@/services/api';
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

interface CriticalDiskData {
  instanceName: string;
  drive: string;
  porcentajeLibre: number;
  realPorcentajeLibre: number;
  libreGB: number;
  realLibreGB: number;
  espacioInternoEnArchivosGB: number;
  estado: string;
}

interface MaintenanceOverdueData {
  instanceName: string;
  displayName: string; // AGName si pertenece a un AG, sino instanceName
  tipo: string; // "CHECKDB", "IndexOptimize", "Ambos"
  lastCheckdb: string | null;
  lastIndexOptimize: string | null;
  checkdbVencido: boolean;
  indexOptimizeVencido: boolean;
  agName?: string; // Nombre del AG si pertenece a uno
}

export default function Overview() {
  const navigate = useNavigate();
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [disks, setDisks] = useState<DiskDto[]>([]);
  const [instanceDetails, setInstanceDetails] = useState<Record<string, HealthScoreV3DetailDto>>({});
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [healthData, disksData] = await Promise.all([
        healthScoreV3Api.getAllHealthScores(),
        disksApi.getDisks()
      ]);
      setHealthScores(healthData);
      setDisks(disksData);
      
      // Cargar detalles de mantenimiento solo para instancias de producción
      const prodInstances = healthData.filter(h => h.ambiente === 'Produccion');
      await loadMaintenanceDetails(prodInstances);
    } catch (error) {
      console.error('Error al cargar datos del overview:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMaintenanceDetails = async (scores: HealthScoreV3Dto[]) => {
    const details: Record<string, HealthScoreV3DetailDto> = {};
    
    // Cargar en paralelo (lotes de 10)
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
  };

  // Filtrar solo instancias de Producción
  const productionScores = useMemo(() => {
    return healthScores.filter(s => s.ambiente === 'Produccion');
  }, [healthScores]);

  // Filtrar discos de Producción
  const productionDisks = useMemo(() => {
    return disks.filter(d => d.ambiente === 'Produccion');
  }, [disks]);

  // Calcular estadísticas de producción
  const stats = useMemo(() => {
    const total = productionScores.length;
    const healthy = productionScores.filter(s => s.healthStatus === 'Healthy').length;
    const warning = productionScores.filter(s => s.healthStatus === 'Warning').length;
    const risk = productionScores.filter(s => s.healthStatus === 'Risk').length;
    // Instancias críticas: score < 60
    const critical = productionScores.filter(s => s.healthScore < 60).length;
    const avgScore = total > 0 ? Math.round(productionScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;
    
    // Backups atrasados: donde score_Backups < 100
    const backupsOverdue = productionScores.filter(s => (s.score_Backups ?? 100) < 100).length;
    
    // Discos críticos: según vista de discos (isAlerted = true, que indica growth + espacio real <= 10%)
    const criticalDisks = productionDisks.filter(d => d.isAlerted === true).length;

    return { total, healthy, warning, risk, critical, avgScore, backupsOverdue, criticalDisks };
  }, [productionScores, productionDisks]);

  // Instancias críticas de producción (score < 60)
  const criticalInstances: CriticalInstanceData[] = useMemo(() => {
    return productionScores
      .filter(s => s.healthScore < 60)
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

  // Discos críticos de producción (isAlerted = true)
  const criticalDisksData: CriticalDiskData[] = useMemo(() => {
    return productionDisks
      .filter(d => d.isAlerted === true)
      .map(d => ({
        instanceName: d.instanceName,
        drive: d.drive || 'N/A',
        porcentajeLibre: d.porcentajeLibre ?? 0,
        realPorcentajeLibre: d.realPorcentajeLibre ?? d.porcentajeLibre ?? 0,
        libreGB: d.libreGB ?? 0,
        realLibreGB: d.realLibreGB ?? d.libreGB ?? 0,
        espacioInternoEnArchivosGB: d.espacioInternoEnArchivosGB ?? 0,
        estado: d.estado || 'Crítico'
      }))
      .sort((a, b) => a.realPorcentajeLibre - b.realPorcentajeLibre);
  }, [productionDisks]);

  // Mantenimiento atrasado de producción - Usa los campos CheckdbOk e IndexOptimizeOk 
  // directamente de la tabla InstanceHealth_Maintenance (la misma que usa HealthScore)
  // Agrupa por AGName si la instancia pertenece a un AG
  const maintenanceOverdueData: MaintenanceOverdueData[] = useMemo(() => {
    const tempResults: MaintenanceOverdueData[] = [];
    const agProcessed = new Set<string>(); // Para evitar duplicados de AG
    
    productionScores.forEach(s => {
      const details = instanceDetails[s.instanceName];
      const maintenance = details?.maintenanceDetails;
      
      // Usar directamente los flags de la tabla InstanceHealth_Maintenance
      const checkdbVencido = maintenance?.checkdbOk === false;
      const indexOptimizeVencido = maintenance?.indexOptimizeOk === false;
      
      const lastCheckdb = maintenance?.lastCheckdb || null;
      const lastIndexOptimize = maintenance?.lastIndexOptimize || null;
      const agName = maintenance?.agName || undefined;
      
      // Si pertenece a un AG y ya lo procesamos, saltar
      if (agName && agProcessed.has(agName)) {
        return;
      }
      
      if (checkdbVencido || indexOptimizeVencido) {
        let tipo = '';
        if (checkdbVencido && indexOptimizeVencido) {
          tipo = 'CHECKDB e IndexOptimize';
        } else if (checkdbVencido) {
          tipo = 'CHECKDB';
        } else {
          tipo = 'IndexOptimize';
        }
        
        // Si pertenece a un AG, marcar como procesado y usar el nombre del AG
        if (agName) {
          agProcessed.add(agName);
        }
        
        tempResults.push({
          instanceName: s.instanceName,
          displayName: agName || s.instanceName, // Mostrar AGName si existe, sino instanceName
          tipo,
          lastCheckdb,
          lastIndexOptimize,
          checkdbVencido,
          indexOptimizeVencido,
          agName
        });
      }
    });
    
    // Ordenar: primero los que tienen ambos vencidos, luego por nombre
    return tempResults.sort((a, b) => {
      const aHasBoth = a.checkdbVencido && a.indexOptimizeVencido;
      const bHasBoth = b.checkdbVencido && b.indexOptimizeVencido;
      if (aHasBoth && !bHasBoth) return -1;
      if (!aHasBoth && bHasBoth) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [productionScores, instanceDetails]);

  // Ordenamiento para cada tabla
  const { sortedData: sortedCriticalInstances, requestSort: requestSortCritical, getSortIndicator: getSortIndicatorCritical } = useTableSort(criticalInstances);
  const { sortedData: sortedBackupIssues, requestSort: requestSortBackups, getSortIndicator: getSortIndicatorBackups } = useTableSort(backupIssues);
  const { sortedData: sortedCriticalDisks, requestSort: requestSortDisks, getSortIndicator: getSortIndicatorDisks } = useTableSort(criticalDisksData);
  const { sortedData: sortedMaintenanceOverdue, requestSort: requestSortMaintenance, getSortIndicator: getSortIndicatorMaintenance } = useTableSort(maintenanceOverdueData);

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
          description={`${stats.healthy} Healthy, ${stats.warning} Warn, ${stats.risk} Risk, ${stats.critical} Crit`}
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
          value={maintenanceOverdueData.length}
          icon={Wrench}
          description={`Instancias con mantenimiento vencido`}
          variant={
            maintenanceOverdueData.length === 0 
              ? 'success' 
              : maintenanceOverdueData.length < 5 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/jobs')}
        />
        <KPICard
          title="Discos Críticos"
          value={stats.criticalDisks}
          icon={HardDrive}
          description="Con riesgo real (alertados)"
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
          description="Backups vencidos (Producción)"
          variant={
            stats.backupsOverdue === 0 
              ? 'success' 
              : stats.backupsOverdue < 3 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/backups')}
        />
        <KPICard
          title="Instancias Críticas"
          value={stats.critical}
          icon={AlertTriangle}
          description="Health Score < 60 (Producción)"
          variant={
            stats.critical === 0 
              ? 'success' 
              : stats.critical < 5 
                ? 'warning' 
                : 'critical'
          }
          onClick={() => navigate('/healthscore')}
        />
      </div>

      {/* Primera fila: Instancias Críticas y Backups Atrasados */}
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
                      <TableCell className="text-xs py-2">
                        <StatusBadge status={issue.score < 50 ? 'critical' : 'warning'}>
                          {issue.issues.join(', ')}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      ✅ Todos los backups de Producción están al día
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Segunda fila: Discos Críticos y Mantenimiento Atrasado */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="gradient-card shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Discos Críticos
              <span className="text-xs font-normal bg-orange-500/20 text-orange-600 px-2 py-0.5 rounded-full">
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
                    onClick={() => requestSortDisks('instanceName')}
                  >
                    Instancia {getSortIndicatorDisks('instanceName')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortDisks('drive')}
                  >
                    Disco {getSortIndicatorDisks('drive')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortDisks('porcentajeLibre')}
                  >
                    % Disco {getSortIndicatorDisks('porcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortDisks('realPorcentajeLibre')}
                  >
                    % Real {getSortIndicatorDisks('realPorcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortDisks('libreGB')}
                  >
                    Libre (GB) {getSortIndicatorDisks('libreGB')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCriticalDisks.length > 0 ? (
                  sortedCriticalDisks.map((disk, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">{disk.instanceName}</TableCell>
                      <TableCell className="text-xs py-2 text-center font-medium">{disk.drive}</TableCell>
                      <TableCell className="py-2 text-center">
                        <span className="text-xs text-muted-foreground">
                          {disk.porcentajeLibre.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <StatusBadge status={disk.realPorcentajeLibre < 5 ? 'critical' : 'warning'}>
                          {disk.realPorcentajeLibre.toFixed(1)}%
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-xs py-2 text-center">
                        <div className="flex flex-col items-center">
                          <span>{disk.libreGB.toFixed(1)} GB</span>
                          {disk.espacioInternoEnArchivosGB > 0.01 && (
                            <span className="text-[10px] text-green-600 dark:text-green-400">
                              +{disk.espacioInternoEnArchivosGB.toFixed(1)} GB int.
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      ✅ No hay discos críticos en Producción
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
              <Wrench className="h-5 w-5" />
              Mantenimiento Atrasado
              <span className="text-xs font-normal bg-purple-500/20 text-purple-600 px-2 py-0.5 rounded-full">
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
                    onClick={() => requestSortMaintenance('displayName')}
                  >
                    Instancia/AG {getSortIndicatorMaintenance('displayName')}
                  </TableHead>
                  <TableHead 
                    className="text-xs cursor-pointer hover:bg-accent text-center"
                    onClick={() => requestSortMaintenance('tipo')}
                  >
                    Tipo {getSortIndicatorMaintenance('tipo')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMaintenanceOverdue.length > 0 ? (
                  sortedMaintenanceOverdue.map((item, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs py-2">
                        {item.displayName}
                        {item.agName && <span className="ml-1 text-muted-foreground">(AG)</span>}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <StatusBadge status={item.checkdbVencido && item.indexOptimizeVencido ? 'critical' : 'warning'}>
                          {item.tipo}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">
                      ✅ Todo el mantenimiento de Producción está al día
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
