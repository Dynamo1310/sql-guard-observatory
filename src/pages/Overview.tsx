import { useState, useEffect, useCallback } from 'react';
import { HardDrive, Save, Wrench, Heart, AlertTriangle, LayoutDashboard, RefreshCw, Eye, Database, UserPlus, X } from 'lucide-react';
import { StatusBadge } from '@/components/dashboard/StatusBadge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTableSort } from '@/hooks/use-table-sort';
import { overviewApi, OverviewDataOptimizedDto, overviewAssignmentsApi, OverviewAssignmentDto, AssignableUserDto } from '@/services/api';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Overview() {
  const navigate = useNavigate();
  const [data, setData] = useState<OverviewDataOptimizedDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Estado para asignaciones
  const [availableUsers, setAvailableUsers] = useState<AssignableUserDto[]>([]);
  const [assignments, setAssignments] = useState<OverviewAssignmentDto[]>([]);
  const [loadingAssignment, setLoadingAssignment] = useState<string | null>(null);

  // Cargar usuarios disponibles y asignaciones
  const loadAssignmentData = useCallback(async () => {
    try {
      const [users, activeAssignments] = await Promise.all([
        overviewAssignmentsApi.getAvailableUsers(),
        overviewAssignmentsApi.getActive()
      ]);
      setAvailableUsers(users);
      setAssignments(activeAssignments);
    } catch (error) {
      console.error('Error al cargar datos de asignaciones:', error);
    }
  }, []);

  useEffect(() => {
    fetchData();
    loadAssignmentData();
  }, [loadAssignmentData]);

  const fetchData = async (showLoading = true, retryCount = 0) => {
    try {
      if (showLoading) setLoading(true);
      setIsRefreshing(true);

      // Una sola llamada al API optimizado
      const overviewData = await overviewApi.getOverviewData();
      setData(overviewData);

      // Si recibimos datos vacíos (caché aún poblándose), reintentar después de 2 segundos
      // Máximo 3 reintentos
      if (overviewData.totalInstances === 0 && retryCount < 3) {
        console.log(`Overview: datos vacíos, reintentando en 2s (intento ${retryCount + 1}/3)...`);
        setTimeout(() => {
          fetchData(false, retryCount + 1);
        }, 2000);
      }
    } catch (error) {
      console.error('Error al cargar datos del overview:', error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  // Obtener la asignación para un problema específico
  const getAssignment = (issueType: string, instanceName: string, driveOrTipo?: string) => {
    return assignments.find(a =>
      a.issueType === issueType &&
      a.instanceName === instanceName &&
      (driveOrTipo ? a.driveOrTipo === driveOrTipo : !a.driveOrTipo)
    );
  };

  // Asignar un problema a un usuario
  const handleAssign = async (issueType: string, instanceName: string, userId: string, driveOrTipo?: string) => {
    const key = `${issueType}-${instanceName}-${driveOrTipo || ''}`;
    setLoadingAssignment(key);

    try {
      await overviewAssignmentsApi.create({
        issueType,
        instanceName,
        driveOrTipo,
        assignedToUserId: userId
      });

      // Recargar asignaciones
      await loadAssignmentData();

      const user = availableUsers.find(u => u.id === userId);
      toast.success(`Asignado a ${user?.displayName || 'usuario'}`);
    } catch (error: any) {
      console.error('Error al asignar:', error);
      toast.error('Error al asignar: ' + (error.message || 'Error desconocido'));
    } finally {
      setLoadingAssignment(null);
    }
  };

  // Quitar asignación
  const handleRemoveAssignment = async (assignmentId: number) => {
    try {
      await overviewAssignmentsApi.remove(assignmentId);
      await loadAssignmentData();
      toast.success('Asignación eliminada');
    } catch (error: any) {
      console.error('Error al eliminar asignación:', error);
      toast.error('Error al eliminar: ' + (error.message || 'Error desconocido'));
    }
  };

  // Ordenamiento para cada tabla
  const { sortedData: sortedCriticalInstances, requestSort: requestSortCritical, getSortIndicator: getSortIndicatorCritical } = useTableSort(data?.criticalInstances ?? []);
  const { sortedData: sortedBackupIssues, requestSort: requestSortBackups, getSortIndicator: getSortIndicatorBackups } = useTableSort(data?.backupIssues ?? []);
  const { sortedData: sortedCriticalDisks, requestSort: requestSortDisks, getSortIndicator: getSortIndicatorDisks } = useTableSort(data?.criticalDisks ?? []);
  const { sortedData: sortedMaintenanceOverdue, requestSort: requestSortMaintenance, getSortIndicator: getSortIndicatorMaintenance } = useTableSort(data?.maintenanceOverdue ?? []);

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

  // Valores por defecto si no hay datos
  const stats = {
    total: data?.totalInstances ?? 0,
    healthy: data?.healthyCount ?? 0,
    warning: data?.warningCount ?? 0,
    risk: data?.riskCount ?? 0,
    critical: data?.criticalCount ?? 0,
    avgScore: data?.avgScore ?? 0,
    backupsOverdue: data?.backupsOverdue ?? 0,
    criticalDisks: data?.criticalDisksCount ?? 0,
    maintenanceOverdue: data?.maintenanceOverdueCount ?? 0
  };

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
            <Heart className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${stats.avgScore >= 90 ? 'text-emerald-500' : stats.avgScore >= 70 ? 'text-warning' : 'text-red-500'
              }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${stats.avgScore >= 90 ? 'text-emerald-500' : stats.avgScore >= 70 ? 'text-warning' : 'text-red-500'
              }`}>{stats.avgScore > 0 ? Math.round(stats.avgScore) : '-'}</div>
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
            <Wrench className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${stats.maintenanceOverdue === 0 ? 'text-emerald-500' : stats.maintenanceOverdue < 5 ? 'text-warning' : 'text-red-500'
              }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${stats.maintenanceOverdue === 0 ? 'text-emerald-500' : stats.maintenanceOverdue < 5 ? 'text-warning' : 'text-red-500'
              }`}>{stats.maintenanceOverdue}</div>
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
            <HardDrive className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${stats.criticalDisks === 0 ? 'text-emerald-500' : stats.criticalDisks < 3 ? 'text-warning' : 'text-red-500'
              }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${stats.criticalDisks === 0 ? 'text-emerald-500' : stats.criticalDisks < 3 ? 'text-warning' : 'text-red-500'
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
            <Save className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${stats.backupsOverdue === 0 ? 'text-emerald-500' : stats.backupsOverdue < 3 ? 'text-warning' : 'text-red-500'
              }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${stats.backupsOverdue === 0 ? 'text-emerald-500' : stats.backupsOverdue < 3 ? 'text-warning' : 'text-red-500'
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
            <AlertTriangle className={`h-4 w-4 transition-transform duration-300 group-hover:scale-110 ${stats.critical === 0 ? 'text-emerald-500' : stats.critical < 5 ? 'text-warning' : 'text-red-500'
              }`} />
          </CardHeader>
          <CardContent className="relative">
            <div className={`text-2xl font-bold tabular-nums ${stats.critical === 0 ? 'text-emerald-500' : stats.critical < 5 ? 'text-warning' : 'text-red-500'
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
                      onClick={() => requestSortBackups('displayName')}
                    >
                      Instancia {getSortIndicatorBackups('displayName')}
                    </TableHead>
                    <TableHead>
                      Tipo
                    </TableHead>
                    <TableHead>
                      Asignado
                    </TableHead>
                    <TableHead className="text-center">
                      Detalle
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedBackupIssues.length > 0 ? (
                    sortedBackupIssues.map((issue, idx) => {
                      const issueKey = issue.displayName || issue.instanceName;
                      const assignment = getAssignment('Backup', issueKey);
                      const assignmentKey = `Backup-${issueKey}-`;
                      const isLoading = loadingAssignment === assignmentKey;

                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">
                            {issue.displayName || issue.instanceName}
                            {issue.agName && (
                              <span className="ml-1 text-xs text-muted-foreground">(AG)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={issue.fullBackupBreached ? "destructive" : "secondary"} className="mr-1">
                              {issue.fullBackupBreached && issue.logBackupBreached
                                ? "FULL + LOG"
                                : issue.fullBackupBreached
                                  ? "FULL"
                                  : "LOG"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {assignment ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs bg-primary/10">
                                  {assignment.assignedToUserName}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveAssignment(assignment.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Select
                                disabled={isLoading || availableUsers.length === 0}
                                onValueChange={(userId) => handleAssign('Backup', issueKey, userId)}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue placeholder={isLoading ? "..." : "Asignar"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableUsers.map(user => (
                                    <SelectItem key={user.id} value={user.id} className="text-xs">
                                      {user.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-80" align="end">
                                <div className="space-y-3">
                                  <div className="flex items-center gap-2">
                                    <Database className="h-4 w-4 text-muted-foreground" />
                                    <h4 className="font-semibold">Detalle de Backups</h4>
                                  </div>
                                  <div className="text-sm space-y-2">
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Último FULL:</span>
                                      <span className={issue.fullBackupBreached ? "text-destructive font-medium" : ""}>
                                        {issue.lastFullBackup
                                          ? new Date(issue.lastFullBackup).toLocaleString('es-AR', {
                                            dateStyle: 'short',
                                            timeStyle: 'short'
                                          })
                                          : 'Sin registro'}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-muted-foreground">Último LOG:</span>
                                      <span className={issue.logBackupBreached ? "text-warning font-medium" : ""}>
                                        {issue.lastLogBackup
                                          ? new Date(issue.lastLogBackup).toLocaleString('es-AR', {
                                            dateStyle: 'short',
                                            timeStyle: 'short'
                                          })
                                          : 'N/A'}
                                      </span>
                                    </div>
                                  </div>
                                  {issue.breachedDatabases && issue.breachedDatabases.length > 0 && (
                                    <div className="pt-2 border-t">
                                      <p className="text-xs text-muted-foreground mb-2">Bases afectadas:</p>
                                      <div className="max-h-32 overflow-y-auto space-y-1">
                                        {issue.breachedDatabases.map((db, i) => (
                                          <div key={i} className="text-xs bg-muted/50 px-2 py-1 rounded">
                                            {db}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </PopoverContent>
                            </Popover>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12">
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
                      onClick={() => requestSortDisks('realPorcentajeLibre')}
                    >
                      % Real {getSortIndicatorDisks('realPorcentajeLibre')}
                    </TableHead>
                    <TableHead>
                      Asignado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedCriticalDisks.length > 0 ? (
                    sortedCriticalDisks.map((disk, idx) => {
                      const assignment = getAssignment('Disk', disk.instanceName, disk.drive);
                      const assignmentKey = `Disk-${disk.instanceName}-${disk.drive}`;
                      const isLoading = loadingAssignment === assignmentKey;

                      return (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{disk.instanceName}</TableCell>
                          <TableCell className="text-center font-medium">{disk.drive}</TableCell>
                          <TableCell className="text-center">
                            <StatusBadge status={disk.realPorcentajeLibre < 5 ? 'critical' : 'warning'}>
                              {disk.realPorcentajeLibre.toFixed(1)}%
                            </StatusBadge>
                            <span className="text-xs text-muted-foreground ml-1">
                              ({disk.libreGB.toFixed(1)} GB)
                            </span>
                          </TableCell>
                          <TableCell>
                            {assignment ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs bg-primary/10">
                                  {assignment.assignedToUserName}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveAssignment(assignment.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Select
                                disabled={isLoading || availableUsers.length === 0}
                                onValueChange={(userId) => handleAssign('Disk', disk.instanceName, userId, disk.drive)}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue placeholder={isLoading ? "..." : "Asignar"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableUsers.map(user => (
                                    <SelectItem key={user.id} value={user.id} className="text-xs">
                                      {user.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-12">
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
                    <TableHead>
                      Asignado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedMaintenanceOverdue.length > 0 ? (
                    sortedMaintenanceOverdue.map((item, idx) => {
                      const assignment = getAssignment('Maintenance', item.instanceName, item.tipo);
                      const assignmentKey = `Maintenance-${item.instanceName}-${item.tipo}`;
                      const isLoading = loadingAssignment === assignmentKey;

                      return (
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
                          <TableCell>
                            {assignment ? (
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs bg-primary/10">
                                  {assignment.assignedToUserName}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleRemoveAssignment(assignment.id)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <Select
                                disabled={isLoading || availableUsers.length === 0}
                                onValueChange={(userId) => handleAssign('Maintenance', item.instanceName, userId, item.tipo)}
                              >
                                <SelectTrigger className="h-7 w-[130px] text-xs">
                                  <SelectValue placeholder={isLoading ? "..." : "Asignar"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableUsers.map(user => (
                                    <SelectItem key={user.id} value={user.id} className="text-xs">
                                      {user.displayName}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-12">
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
