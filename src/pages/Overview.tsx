import { useState, useEffect, useMemo } from 'react';
import { HardDrive, Save, Wrench, Heart, AlertTriangle, LayoutDashboard, RefreshCw } from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setIsRefreshing(true);
      
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
      setIsRefreshing(false);
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
    
    // Discos críticos: isAlerted = true
    // El backend ya marca isAlerted = true para discos de logs con % físico < 10%
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
  // El backend ya marca isAlerted = true para discos de logs con % físico < 10%
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
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        
        {/* KPI Cards skeleton */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        
        {/* Primera fila de tablas skeleton */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="border-border/50">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton key={j} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Segunda fila de tablas skeleton */}
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="border-border/50">
              <CardHeader className="pb-3">
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <Skeleton key={j} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-slide-up">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <LayoutDashboard className="h-8 w-8" />
            Overview
          </h1>
          <p className="text-muted-foreground">
            Panel de control - Estado general del sistema
            <Badge variant="outline" className="ml-2 font-medium text-muted-foreground">
              Solo Producción ({stats.total} instancias)
            </Badge>
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => fetchData(false)}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Estadísticas */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Card 
          className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-emerald-500/30 animate-slide-up delay-50"
          onClick={() => navigate('/healthscore')}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium">Health Score</CardTitle>
            <Heart className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${
              stats.avgScore >= 90 ? 'text-emerald-500' : stats.avgScore >= 70 ? 'text-warning' : 'text-red-500'
            }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${
              stats.avgScore >= 90 ? 'text-emerald-500' : stats.avgScore >= 70 ? 'text-warning' : 'text-red-500'
            }`}>{stats.avgScore > 0 ? stats.avgScore : '-'}</div>
            <p className="text-xs text-muted-foreground">
              {stats.healthy} Healthy, {stats.warning} Warn, {stats.risk} Risk
            </p>
          </CardContent>
        </Card>

        <Card 
          className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-violet-500/30 animate-slide-up delay-100"
          onClick={() => navigate('/jobs')}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium">Mantenimiento</CardTitle>
            <Wrench className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${
              maintenanceOverdueData.length === 0 ? 'text-emerald-500' : maintenanceOverdueData.length < 5 ? 'text-warning' : 'text-red-500'
            }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${
              maintenanceOverdueData.length === 0 ? 'text-emerald-500' : maintenanceOverdueData.length < 5 ? 'text-warning' : 'text-red-500'
            }`}>{maintenanceOverdueData.length}</div>
            <p className="text-xs text-muted-foreground">
              Instancias con mant. vencido
            </p>
          </CardContent>
        </Card>

        <Card 
          className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-cyan-500/30 animate-slide-up delay-150"
          onClick={() => navigate('/disks')}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium">Discos Críticos</CardTitle>
            <HardDrive className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${
              stats.criticalDisks === 0 ? 'text-emerald-500' : stats.criticalDisks < 3 ? 'text-warning' : 'text-red-500'
            }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${
              stats.criticalDisks === 0 ? 'text-emerald-500' : stats.criticalDisks < 3 ? 'text-warning' : 'text-red-500'
            }`}>{stats.criticalDisks}</div>
            <p className="text-xs text-muted-foreground">
              Con riesgo real (alertados)
            </p>
          </CardContent>
        </Card>

        <Card 
          className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-warning/30 animate-slide-up delay-200"
          onClick={() => navigate('/backups')}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium">Backups Atrasados</CardTitle>
            <Save className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${
              stats.backupsOverdue === 0 ? 'text-emerald-500' : stats.backupsOverdue < 3 ? 'text-warning' : 'text-red-500'
            }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${
              stats.backupsOverdue === 0 ? 'text-emerald-500' : stats.backupsOverdue < 3 ? 'text-warning' : 'text-red-500'
            }`}>{stats.backupsOverdue}</div>
            <p className="text-xs text-muted-foreground">
              Backups vencidos (Producción)
            </p>
          </CardContent>
        </Card>

        <Card 
          className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-destructive/30 animate-slide-up delay-250"
          onClick={() => navigate('/healthscore')}
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-out bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <CardTitle className="text-sm font-medium">Inst. Críticas</CardTitle>
            <AlertTriangle className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${
              stats.critical === 0 ? 'text-emerald-500' : stats.critical < 5 ? 'text-warning' : 'text-red-500'
            }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${
              stats.critical === 0 ? 'text-emerald-500' : stats.critical < 5 ? 'text-warning' : 'text-red-500'
            }`}>{stats.critical}</div>
            <p className="text-xs text-muted-foreground">
              Health Score &lt; 60
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Primera fila: Instancias Críticas y Backups Atrasados */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="animate-slide-up delay-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Instancias Críticas
              <Badge variant="outline" className="font-medium text-muted-foreground">
                Producción
              </Badge>
            </CardTitle>
            <CardDescription>
              Instancias con Health Score menor a 60 que requieren atención inmediata
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => requestSortCritical('instanceName')}
                  >
                    Instancia {getSortIndicatorCritical('instanceName')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => requestSortCritical('healthScore')}
                  >
                    Score {getSortIndicatorCritical('healthScore')}
                  </TableHead>
                  <TableHead>
                    Problemas
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedCriticalInstances.length > 0 ? (
                  sortedCriticalInstances.map((instance, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{instance.instanceName}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status="critical">{instance.healthScore}</StatusBadge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {instance.issues.join(', ')}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-12">
                      <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No hay instancias críticas</h3>
                      <p className="text-muted-foreground">
                        Todas las instancias de Producción están saludables.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-350">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-warning" />
              Backups Atrasados
              <Badge variant="outline" className="font-medium text-muted-foreground">
                Producción
              </Badge>
            </CardTitle>
            <CardDescription>
              Instancias con backups FULL o LOG vencidos en Producción
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => requestSortBackups('instanceName')}
                  >
                    Instancia {getSortIndicatorBackups('instanceName')}
                  </TableHead>
                  <TableHead>
                    Problema
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedBackupIssues.length > 0 ? (
                  sortedBackupIssues.map((issue, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{issue.instanceName}</TableCell>
                      <TableCell className="text-sm">
                        <StatusBadge status={issue.score < 50 ? 'critical' : 'warning'}>
                          {issue.issues.join(', ')}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-12">
                      <Save className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No hay backups atrasados</h3>
                      <p className="text-muted-foreground">
                        Todos los backups de Producción están al día.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segunda fila: Discos Críticos y Mantenimiento Atrasado */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <Card className="animate-slide-up delay-400">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-cyan-500" />
              Discos Críticos
              <Badge variant="outline" className="font-medium text-muted-foreground">
                Producción
              </Badge>
            </CardTitle>
            <CardDescription>
              Discos con riesgo real de quedarse sin espacio
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => requestSortDisks('instanceName')}
                  >
                    Instancia {getSortIndicatorDisks('instanceName')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => requestSortDisks('drive')}
                  >
                    Disco {getSortIndicatorDisks('drive')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => requestSortDisks('porcentajeLibre')}
                  >
                    % Disco {getSortIndicatorDisks('porcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => requestSortDisks('realPorcentajeLibre')}
                  >
                    % Real {getSortIndicatorDisks('realPorcentajeLibre')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
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
                      <TableCell className="font-medium">{disk.instanceName}</TableCell>
                      <TableCell className="text-center font-medium">{disk.drive}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm text-muted-foreground">
                          {disk.porcentajeLibre.toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={disk.realPorcentajeLibre < 5 ? 'critical' : 'warning'}>
                          {disk.realPorcentajeLibre.toFixed(1)}%
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-sm text-center">
                        <div className="flex flex-col items-center">
                          <span>{disk.libreGB.toFixed(1)} GB</span>
                          {disk.espacioInternoEnArchivosGB > 0.01 && (
                            <span className="text-xs text-success">
                              +{disk.espacioInternoEnArchivosGB.toFixed(1)} GB int.
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <HardDrive className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No hay discos críticos</h3>
                      <p className="text-muted-foreground">
                        Todos los discos de Producción están en buen estado.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="animate-slide-up delay-450">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-violet-500" />
              Mantenimiento Atrasado
              <Badge variant="outline" className="font-medium text-muted-foreground">
                Producción
              </Badge>
            </CardTitle>
            <CardDescription>
              Instancias con CHECKDB o IndexOptimize vencidos según los umbrales configurados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => requestSortMaintenance('displayName')}
                  >
                    Instancia/AG {getSortIndicatorMaintenance('displayName')}
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
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
                      <TableCell className="font-medium">
                        {item.displayName}
                        {item.agName && <span className="ml-1 text-sm text-muted-foreground">(AG)</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={item.checkdbVencido && item.indexOptimizeVencido ? 'critical' : 'warning'}>
                          {item.tipo}
                        </StatusBadge>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-12">
                      <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No hay mantenimiento atrasado</h3>
                      <p className="text-muted-foreground">
                        Todo el mantenimiento de Producción está al día.
                      </p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
