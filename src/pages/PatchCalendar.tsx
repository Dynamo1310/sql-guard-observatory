/**
 * Calendario de Parcheos
 * Vista mensual de planes de parcheo programados
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, RefreshCw,
  Server, Clock, User, AlertTriangle
} from 'lucide-react';
import { patchPlanApi, patchConfigApi, PatchCalendarDto, PatchPlanStatus, PatchPriority } from '@/services/api';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const DAYS_OF_WEEK = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const getStatusColor = (status: string) => {
  switch (status) {
    case PatchPlanStatus.Planificado: return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
    case PatchPlanStatus.EnCoordinacion: return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    case PatchPlanStatus.Aprobado: return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    case PatchPlanStatus.EnProceso: return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100';
    case PatchPlanStatus.Parcheado: return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-100';
    case PatchPlanStatus.Fallido: return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-100';
  }
};

const getPriorityColor = (priority?: string) => {
  switch (priority) {
    case PatchPriority.Alta: return 'border-l-4 border-l-red-500';
    case PatchPriority.Media: return 'border-l-4 border-l-yellow-500';
    case PatchPriority.Baja: return 'border-l-4 border-l-green-500';
    default: return '';
  }
};

export default function PatchCalendar() {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [filterCellTeam, setFilterCellTeam] = useState<string>('all');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('all');

  // Query para datos del calendario
  const { data: calendarData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['patchCalendar', currentYear, currentMonth + 1],
    queryFn: () => patchPlanApi.getCalendarData(currentYear, currentMonth + 1),
    staleTime: 5 * 60 * 1000,
  });

  // Query para info de freezing
  const { data: freezingInfo } = useQuery({
    queryKey: ['freezingMonth', currentYear, currentMonth + 1],
    queryFn: () => patchConfigApi.getFreezingMonthInfo(currentYear, currentMonth + 1),
    staleTime: 10 * 60 * 1000,
  });

  // Query para células
  const { data: cellTeams } = useQuery({
    queryKey: ['cellTeams'],
    queryFn: () => patchPlanApi.getCellTeams(),
    staleTime: 10 * 60 * 1000,
  });

  // Filtrar datos
  const filteredData = useMemo(() => {
    if (!calendarData) return [];
    return calendarData.filter(item => {
      if (filterCellTeam !== 'all' && item.cellTeam !== filterCellTeam) return false;
      if (filterAmbiente !== 'all' && item.ambiente !== filterAmbiente) return false;
      return true;
    });
  }, [calendarData, filterCellTeam, filterAmbiente]);

  // Agrupar por día
  const plansByDay = useMemo(() => {
    const grouped: Record<number, PatchCalendarDto[]> = {};
    filteredData.forEach(plan => {
      const day = new Date(plan.scheduledDate).getDate();
      if (!grouped[day]) grouped[day] = [];
      grouped[day].push(plan);
    });
    return grouped;
  }, [filteredData]);

  // Fechas de freezing
  const freezingDays = useMemo(() => {
    if (!freezingInfo) return new Set<number>();
    const days = new Set<number>();
    freezingInfo.weeks.forEach(week => {
      if (week.isFreezingWeek) {
        const start = new Date(week.startDate).getDate();
        const end = new Date(week.endDate).getDate();
        for (let d = start; d <= end; d++) days.add(d);
      }
    });
    return days;
  }, [freezingInfo]);

  // Generar días del calendario
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (number | null)[] = [];
    for (let i = 0; i < startPadding; i++) days.push(null);
    for (let i = 1; i <= totalDays; i++) days.push(i);
    return days;
  }, [currentYear, currentMonth]);

  // Planes del día seleccionado
  const selectedDayPlans = selectedDate ? plansByDay[selectedDate.getDate()] || [] : [];

  // Navegación
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
  };

  if (isLoading) {
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
            <CalendarIcon className="h-8 w-8 text-primary" />
            Calendario de Parcheos
          </h1>
          <p className="text-muted-foreground mt-1">
            Vista mensual de planes de parcheo programados
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Filtros y navegación */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="text-xl font-semibold min-w-[200px] text-center">
                {MONTHS[currentMonth]} {currentYear}
              </h2>
              <Button variant="outline" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoy
              </Button>
            </div>
            
            <div className="flex gap-2">
              <Select value={filterCellTeam} onValueChange={setFilterCellTeam}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Célula" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las células</SelectItem>
                  {cellTeams?.map(cell => (
                    <SelectItem key={cell} value={cell}>{cell}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Ambiente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="PRD">Producción</SelectItem>
                  <SelectItem value="UAT">UAT</SelectItem>
                  <SelectItem value="DEV">Desarrollo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendario */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-7 gap-1">
            {/* Headers de días */}
            {DAYS_OF_WEEK.map(day => (
              <div key={day} className="p-2 text-center font-semibold text-muted-foreground text-sm">
                {day}
              </div>
            ))}

            {/* Días del mes */}
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="p-2 h-28" />;
              }

              const isToday = day === today.getDate() && 
                              currentMonth === today.getMonth() && 
                              currentYear === today.getFullYear();
              const isFreezing = freezingDays.has(day);
              const dayPlans = plansByDay[day] || [];

              return (
                <div
                  key={day}
                  className={cn(
                    "p-1 h-28 border rounded cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden",
                    isToday && "ring-2 ring-primary",
                    isFreezing && "bg-blue-50 dark:bg-blue-950/30"
                  )}
                  onClick={() => setSelectedDate(new Date(currentYear, currentMonth, day))}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-sm font-medium",
                      isToday && "text-primary font-bold"
                    )}>
                      {day}
                    </span>
                    {isFreezing && (
                      <Tooltip>
                        <TooltipTrigger>
                          <AlertTriangle className="h-3 w-3 text-blue-500" />
                        </TooltipTrigger>
                        <TooltipContent>Período de Freezing</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayPlans.slice(0, 3).map(plan => (
                      <div
                        key={plan.id}
                        className={cn(
                          "text-xs p-0.5 rounded truncate",
                          getStatusColor(plan.status),
                          getPriorityColor(plan.priority)
                        )}
                      >
                        {plan.serverName}
                      </div>
                    ))}
                    {dayPlans.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{dayPlans.length - 3} más
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Leyenda */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Leyenda</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-50 dark:bg-blue-950/30 border rounded" />
              <span className="text-sm">Freezing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-l-4 border-l-red-500 bg-muted rounded" />
              <span className="text-sm">Alta prioridad</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-l-4 border-l-yellow-500 bg-muted rounded" />
              <span className="text-sm">Media prioridad</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-l-4 border-l-green-500 bg-muted rounded" />
              <span className="text-sm">Baja prioridad</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de detalle del día */}
      <Dialog open={selectedDate !== null} onOpenChange={() => setSelectedDate(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Parcheos del {selectedDate?.toLocaleDateString('es-ES', { 
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' 
              })}
            </DialogTitle>
            <DialogDescription>
              {selectedDayPlans.length === 0 
                ? 'No hay parcheos programados para este día'
                : `${selectedDayPlans.length} parcheo(s) programado(s)`}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {selectedDayPlans.map(plan => (
              <Card key={plan.id} className={cn("p-3", getPriorityColor(plan.priority))}>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{plan.serverName}</span>
                    </div>
                    <Badge className={getStatusColor(plan.status)}>{plan.status}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {plan.windowStartTime} - {plan.windowEndTime}
                    </div>
                    {plan.assignedDbaName && (
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {plan.assignedDbaName}
                      </div>
                    )}
                  </div>
                  {plan.cellTeam && (
                    <div className="text-xs text-muted-foreground">
                      Célula: {plan.cellTeam}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
