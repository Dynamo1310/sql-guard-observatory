/**
 * Ejecución de Parcheos
 * UI similar a ServerRestart pero para parcheos (solo UI, sin funcionalidad)
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Play, RefreshCw, Server, Clock, User, Terminal, History, 
  AlertTriangle, CheckCircle2, XCircle, Pause, Square
} from 'lucide-react';
import { patchPlanApi, PatchPlanDto, PatchPlanStatus } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

const getStatusColor = (status: string) => {
  switch (status) {
    case PatchPlanStatus.Planificado: return 'text-blue-500';
    case PatchPlanStatus.EnCoordinacion: return 'text-yellow-500';
    case PatchPlanStatus.Aprobado: return 'text-green-500';
    case PatchPlanStatus.EnProceso: return 'text-purple-500';
    case PatchPlanStatus.Parcheado: return 'text-emerald-500';
    case PatchPlanStatus.Fallido: return 'text-red-500';
    default: return 'text-gray-500';
  }
};

export default function PatchExecution() {
  const [selectedPlans, setSelectedPlans] = useState<number[]>([]);
  const [filterDate, setFilterDate] = useState<string>('today');

  // Query para planes del día/próximos
  const { data: plans, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['patchPlansForExecution', filterDate],
    queryFn: async () => {
      const today = new Date();
      let fromDate: string;
      let toDate: string;

      if (filterDate === 'today') {
        fromDate = today.toISOString().split('T')[0];
        toDate = fromDate;
      } else if (filterDate === 'week') {
        fromDate = today.toISOString().split('T')[0];
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        toDate = nextWeek.toISOString().split('T')[0];
      } else {
        // Próximo mes
        fromDate = today.toISOString().split('T')[0];
        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        toDate = nextMonth.toISOString().split('T')[0];
      }

      return patchPlanApi.getAll({ fromDate, toDate });
    },
    staleTime: 2 * 60 * 1000,
  });

  // Filtrar solo planes aprobados o planificados
  const executablePlans = useMemo(() => {
    if (!plans) return [];
    return plans.filter(p => 
      [PatchPlanStatus.Planificado, PatchPlanStatus.Aprobado, PatchPlanStatus.EnProceso].includes(p.status as any)
    );
  }, [plans]);

  // Toggle selección
  const togglePlanSelection = (id: number) => {
    setSelectedPlans(prev => 
      prev.includes(id) 
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedPlans(executablePlans.map(p => p.id));
  };

  const deselectAll = () => {
    setSelectedPlans([]);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-[600px]" />
          <Skeleton className="h-[600px] lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Play className="h-8 w-8 text-primary" />
            Ejecución de Parcheos
          </h1>
          <p className="text-muted-foreground mt-1">
            Ejecuta y monitorea parcheos en tiempo real
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={filterDate} onValueChange={setFilterDate}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoy</SelectItem>
              <SelectItem value="week">Próxima semana</SelectItem>
              <SelectItem value="month">Próximo mes</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel izquierdo: Lista de servidores */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="h-5 w-5" />
                Servidores
              </CardTitle>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={selectAll}>Todos</Button>
                <Button variant="ghost" size="sm" onClick={deselectAll}>Ninguno</Button>
              </div>
            </div>
            <CardDescription>
              {executablePlans.length} servidores listos para parchear
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {executablePlans.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Server className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay parcheos programados</p>
                    <p className="text-sm">para el período seleccionado</p>
                  </div>
                ) : (
                  executablePlans.map(plan => (
                    <div
                      key={plan.id}
                      className={cn(
                        "p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
                        selectedPlans.includes(plan.id) && "bg-muted border-primary"
                      )}
                      onClick={() => togglePlanSelection(plan.id)}
                    >
                      <div className="flex items-start gap-2">
                        <Checkbox 
                          checked={selectedPlans.includes(plan.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{plan.serverName}</span>
                            <div className={cn("h-2 w-2 rounded-full", getStatusColor(plan.status).replace('text-', 'bg-'))} />
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(plan.scheduledDate).toLocaleDateString('es-ES', {
                              day: '2-digit', month: 'short'
                            })} • {plan.windowStartTime}
                          </div>
                          {plan.assignedDbaName && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <User className="h-3 w-3" />
                              {plan.assignedDbaName}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Panel derecho: Terminal y controles */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Terminal className="h-5 w-5" />
              Consola de Ejecución
            </CardTitle>
            <CardDescription>
              {selectedPlans.length > 0 
                ? `${selectedPlans.length} servidor(es) seleccionado(s)`
                : 'Selecciona servidores para comenzar'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Botones de control */}
            <div className="flex flex-wrap gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    disabled={selectedPlans.length === 0}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Iniciar Parcheo
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Próximamente: Ejecución automática de parcheos</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" disabled className="gap-2">
                    <Pause className="h-4 w-4" />
                    Pausar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Próximamente</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="destructive" disabled className="gap-2">
                    <Square className="h-4 w-4" />
                    Cancelar
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Próximamente</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" disabled className="gap-2">
                    <History className="h-4 w-4" />
                    Ver Logs
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Próximamente</p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Terminal placeholder */}
            <div className="bg-black rounded-lg p-4 font-mono text-sm h-[400px] overflow-y-auto">
              <div className="text-green-500">
                <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> SQL Nova Patch Execution Console v1.0
              </div>
              <div className="text-gray-500 mt-2">
                ------------------------------------
              </div>
              <div className="text-yellow-500 mt-2">
                <AlertTriangle className="h-4 w-4 inline mr-2" />
                Funcionalidad de ejecución próximamente...
              </div>
              <div className="text-gray-400 mt-4">
                Esta vista permitirá:
              </div>
              <div className="text-gray-500 mt-1 ml-4">
                • Ejecutar parcheos de forma manual o programada
              </div>
              <div className="text-gray-500 mt-1 ml-4">
                • Monitorear el progreso en tiempo real
              </div>
              <div className="text-gray-500 mt-1 ml-4">
                • Ver logs detallados de cada operación
              </div>
              <div className="text-gray-500 mt-1 ml-4">
                • Pausar o cancelar parcheos en curso
              </div>
              <div className="text-gray-500 mt-1 ml-4">
                • Rollback en caso de errores
              </div>
              <div className="mt-4">
                <span className="text-green-500">root@sqlnova:~$</span>
                <span className="text-white ml-2 animate-pulse">_</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historial de ejecuciones (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Ejecuciones
          </CardTitle>
          <CardDescription>
            Últimas ejecuciones de parcheo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>El historial de ejecuciones estará disponible</p>
            <p className="text-sm">cuando se implemente la funcionalidad de ejecución</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
