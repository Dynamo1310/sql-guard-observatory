/**
 * Vista de Célula
 * Muestra el backlog, aprobaciones y estadísticas de parcheos por célula
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, RefreshCw, Server, Clock, CheckCircle2, XCircle, TrendingUp,
  Calendar, AlertTriangle, BarChart3
} from 'lucide-react';
import { patchPlanApi, PatchPlanDto, PatchPlanStatus, PatchDashboardStatsDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    [PatchPlanStatus.Planificado]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100',
    [PatchPlanStatus.EnCoordinacion]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100',
    [PatchPlanStatus.Aprobado]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
    [PatchPlanStatus.EnProceso]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100',
    [PatchPlanStatus.Parcheado]: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100',
    [PatchPlanStatus.Fallido]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
  };
  return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
};

export default function PatchCellView() {
  const [selectedCell, setSelectedCell] = useState<string>('');

  // Query para células
  const { data: cellTeams, isLoading: loadingCells } = useQuery({
    queryKey: ['cellTeams'],
    queryFn: () => patchPlanApi.getCellTeams(),
    staleTime: 5 * 60 * 1000,
  });

  // Query para planes de la célula seleccionada
  const { data: cellPlans, isLoading: loadingPlans, refetch, isFetching } = useQuery({
    queryKey: ['cellPlans', selectedCell],
    queryFn: () => patchPlanApi.getByCell(selectedCell),
    enabled: !!selectedCell,
    staleTime: 2 * 60 * 1000,
  });

  // Query para estadísticas
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => patchPlanApi.getDashboardStats(),
    staleTime: 5 * 60 * 1000,
  });

  // Métricas de la célula
  const cellStats = useMemo(() => {
    if (!cellPlans) return null;
    
    const now = new Date();
    const backlog = cellPlans.filter(p => 
      [PatchPlanStatus.Planificado, PatchPlanStatus.EnCoordinacion, PatchPlanStatus.Aprobado, PatchPlanStatus.EnProceso].includes(p.status as any)
    );
    const completed = cellPlans.filter(p => p.status === PatchPlanStatus.Parcheado);
    const failed = cellPlans.filter(p => p.status === PatchPlanStatus.Fallido);
    const overdue = backlog.filter(p => new Date(p.scheduledDate) < now);
    const rescheduled = cellPlans.filter(p => p.rescheduledCount > 0);

    return {
      total: cellPlans.length,
      backlog: backlog.length,
      completed: completed.length,
      failed: failed.length,
      overdue: overdue.length,
      rescheduled: rescheduled.length,
      completionRate: cellPlans.length > 0 ? Math.round((completed.length / cellPlans.length) * 100) : 0,
    };
  }, [cellPlans]);

  // Estadísticas de la célula desde el dashboard
  const cellDashboardStats = useMemo(() => {
    if (!stats || !selectedCell) return null;
    return stats.cellStats.find(c => c.cellTeam === selectedCell);
  }, [stats, selectedCell]);

  // Set primera célula por defecto
  useMemo(() => {
    if (cellTeams && cellTeams.length > 0 && !selectedCell) {
      setSelectedCell(cellTeams[0]);
    }
  }, [cellTeams, selectedCell]);

  if (loadingCells) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Vista por Célula
          </h1>
          <p className="text-muted-foreground mt-1">
            Backlog, aprobaciones y estadísticas de parcheos por célula
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCell} onValueChange={setSelectedCell}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleccionar célula" />
            </SelectTrigger>
            <SelectContent>
              {cellTeams?.map(cell => (
                <SelectItem key={cell} value={cell}>{cell}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {selectedCell && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Backlog</CardDescription>
                <CardTitle className="text-2xl">{cellStats?.backlog || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Clock className="h-4 w-4 mr-1" />
                  Pendientes
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Completados</CardDescription>
                <CardTitle className="text-2xl text-green-600">{cellStats?.completed || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Exitosos
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Fallidos</CardDescription>
                <CardTitle className="text-2xl text-red-600">{cellStats?.failed || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4 mr-1" />
                  Con errores
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Atrasados</CardDescription>
                <CardTitle className="text-2xl text-orange-600">{cellStats?.overdue || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  Vencidos
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Reprogramados</CardDescription>
                <CardTitle className="text-2xl">{cellStats?.rescheduled || 0}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4 mr-1" />
                  Movidos
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>% Completado</CardDescription>
                <CardTitle className="text-2xl">{cellStats?.completionRate || 0}%</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center text-sm text-muted-foreground">
                  <TrendingUp className="h-4 w-4 mr-1" />
                  Tasa éxito
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabla de planes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Planes de Parcheo - {selectedCell}
              </CardTitle>
              <CardDescription>
                {cellPlans?.length || 0} planes registrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPlans ? (
                <Skeleton className="h-[300px]" />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Servidor</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Ventana</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>DBA</TableHead>
                        <TableHead>Prioridad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cellPlans?.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No hay planes para esta célula
                          </TableCell>
                        </TableRow>
                      ) : (
                        cellPlans?.map(plan => (
                          <TableRow key={plan.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <div className="font-medium">{plan.serverName}</div>
                                  {plan.instanceName && (
                                    <div className="text-xs text-muted-foreground">{plan.instanceName}</div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {new Date(plan.scheduledDate).toLocaleDateString('es-ES', {
                                day: '2-digit', month: 'short', year: 'numeric'
                              })}
                            </TableCell>
                            <TableCell>
                              {plan.windowStartTime} - {plan.windowEndTime}
                            </TableCell>
                            <TableCell>{getStatusBadge(plan.status)}</TableCell>
                            <TableCell>{plan.assignedDbaName || '-'}</TableCell>
                            <TableCell>
                              {plan.priority && (
                                <Badge variant="outline">{plan.priority}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!selectedCell && cellTeams && cellTeams.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No hay células configuradas. Los planes de parcheo deben tener una célula asignada.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
