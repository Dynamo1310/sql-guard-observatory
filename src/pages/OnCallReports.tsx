import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ArrowLeft,
  Download,
  Clock,
  Activity,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  RefreshCw,
  Filter,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  onCallApi, 
  activationsApi,
  OnCallWeekDto,
  OnCallActivationDto,
  ActivationSummaryDto
} from '@/services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
  Legend
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';

// Paleta Azul para gráficos
const BLUE_PALETTE = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe'];
const SEVERITY_COLORS: Record<string, string> = {
  'Critical': '#1d4ed8',
  'High': '#2563eb',
  'Medium': '#60a5fa',
  'Low': '#93c5fd',
};
const CATEGORY_COLORS: Record<string, string> = {
  'Incident': '#1d4ed8',
  'Maintenance': '#3b82f6',
  'Support': '#60a5fa',
  'Other': '#93c5fd',
};

// Configuración de gráficos shadcn - Paleta Azul
const categoryChartConfig = {
  value: { label: "Cantidad" },
  Incident: { label: "Incidente", color: "#1d4ed8" },
  Maintenance: { label: "Mantenimiento", color: "#3b82f6" },
  Support: { label: "Soporte", color: "#60a5fa" },
  Other: { label: "Otro", color: "#93c5fd" },
} satisfies ChartConfig;

const severityChartConfig = {
  value: { label: "Cantidad" },
  Critical: { label: "Crítico", color: "#1d4ed8" },
  High: { label: "Alto", color: "#2563eb" },
  Medium: { label: "Medio", color: "#60a5fa" },
  Low: { label: "Bajo", color: "#93c5fd" },
} satisfies ChartConfig;

const monthlyTrendConfig = {
  activations: { label: "Activaciones", color: "#2563eb" },
  hours: { label: "Horas", color: "#60a5fa" },
} satisfies ChartConfig;

const operatorActivationsConfig = {
  value: { label: "Activaciones", color: "#3b82f6" },
} satisfies ChartConfig;

const operatorHoursConfig = {
  hours: { label: "Horas", color: "#2563eb" },
} satisfies ChartConfig;

const weeklyTrendConfig = {
  activaciones: { label: "Activaciones", color: "#2563eb" },
} satisfies ChartConfig;

export default function OnCallReports() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  
  // Datos
  const [schedules, setSchedules] = useState<OnCallWeekDto[]>([]);
  const [activations, setActivations] = useState<OnCallActivationDto[]>([]);
  const [summary, setSummary] = useState<ActivationSummaryDto | null>(null);
  
  // Filtros
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [filterOperator, setFilterOperator] = useState<string>('__all__');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      
      const [calendarData, activationsData, summaryData] = await Promise.all([
        onCallApi.getMonthCalendar(year, month),
        activationsApi.getAll(),
        activationsApi.getSummary()
      ]);
      
      setSchedules(calendarData.onCallWeeks || []);
      setActivations(activationsData);
      setSummary(summaryData);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Preparar datos para gráficos
  const getActivationsByOperator = () => {
    const byOperator: Record<string, number> = {};
    activations.forEach(a => {
      const name = a.operatorDisplayName || 'Sin asignar';
      byOperator[name] = (byOperator[name] || 0) + 1;
    });
    return Object.entries(byOperator).map(([name, value]) => ({ name, value }));
  };

  const getActivationsByCategory = () => {
    const byCategory: Record<string, number> = {};
    activations.forEach(a => {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    });
    return Object.entries(byCategory).map(([name, value]) => ({ name, value }));
  };

  const getActivationsBySeverity = () => {
    const bySeverity: Record<string, number> = {};
    activations.forEach(a => {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    });
    return Object.entries(bySeverity).map(([name, value]) => ({ name, value }));
  };

  const getActivationsByMonth = () => {
    const byMonth: Record<string, { month: string, activations: number, hours: number }> = {};
    
    activations.forEach(a => {
      const date = new Date(a.activatedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
      
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { month: monthName, activations: 0, hours: 0 };
      }
      byMonth[monthKey].activations += 1;
      byMonth[monthKey].hours += a.durationMinutes ? a.durationMinutes / 60 : 0;
    });
    
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  };

  const getHoursByOperator = () => {
    const byOperator: Record<string, number> = {};
    activations.forEach(a => {
      const name = a.operatorDisplayName || 'Sin asignar';
      byOperator[name] = (byOperator[name] || 0) + (a.durationMinutes || 0) / 60;
    });
    return Object.entries(byOperator)
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours);
  };

  const getWeeklyTrend = () => {
    const byWeek: Record<string, number> = {};
    
    activations.forEach(a => {
      const date = new Date(a.activatedAt);
      const weekStart = new Date(date);
      // Las semanas de guardia empiezan los miércoles (día 3)
      const day = date.getDay();
      const daysToWednesday = (day - 3 + 7) % 7; // Días desde el miércoles anterior
      weekStart.setDate(date.getDate() - daysToWednesday);
      const weekKey = weekStart.toISOString().split('T')[0];
      
      byWeek[weekKey] = (byWeek[weekKey] || 0) + 1;
    });
    
    return Object.entries(byWeek)
      .sort(([a], [b]) => a.localeCompare(b)) // Ordenar por fecha ascendente
      .slice(-12) // Tomar las últimas 12 semanas
      .map(([week, count]) => ({
        week: new Date(week).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
        activaciones: count
      }));
  };

  // Filtrar activaciones
  const filteredActivations = activations.filter(a => {
    const actDate = new Date(a.activatedAt);
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59);
    
    if (actDate < start || actDate > end) return false;
    if (filterOperator !== '__all__' && a.operatorUserId !== filterOperator) return false;
    
    return true;
  });

  // Exportar a CSV
  const handleExport = async () => {
    try {
      setExporting(true);
      
      const headers = ['Fecha', 'Operador', 'Categoría', 'Severidad', 'Título', 'Duración (min)', 'Estado'];
      const rows = filteredActivations.map(a => [
        new Date(a.activatedAt).toLocaleDateString('es-AR'),
        a.operatorDisplayName,
        a.category,
        a.severity,
        a.title,
        a.durationMinutes?.toString() || '',
        a.resolvedAt ? 'Resuelto' : 'Abierto'
      ]);
      
      const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte_guardias_${startDate}_${endDate}.csv`;
      link.click();
      
      toast.success('Reporte exportado correctamente');
    } catch (err: any) {
      toast.error('Error al exportar: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Obtener operadores únicos
  const operators = [...new Map(activations.map(a => [a.operatorUserId, { id: a.operatorUserId, name: a.operatorDisplayName }])).values()];

  // Stats
  const resolvedCount = activations.filter(a => a.resolvedAt).length;
  const pendingCount = activations.filter(a => !a.resolvedAt).length;

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-56 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-10 w-36" />
        </div>

        {/* KPIs Skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-10 w-16 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <Card>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-24" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-48" />
            </div>
          </CardContent>
        </Card>

        {/* Charts Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[300px] w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-8 w-8" />
              Reportes y Dashboard
            </h1>
            <p className="text-muted-foreground">
              Análisis visual de activaciones y guardias
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activaciones</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{summary?.totalActivations || 0}</div>
            <p className="text-xs text-muted-foreground">En el período seleccionado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Horas Totales</CardTitle>
            <Clock className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-violet-500">
              {Math.round((summary?.totalHours || 0) * 10) / 10}h
            </div>
            <p className="text-xs text-muted-foreground">
              Promedio: {summary?.totalActivations ? Math.round((summary.totalHours / summary.totalActivations) * 10) / 10 : 0}h/activación
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resueltas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">{resolvedCount}</div>
            <p className="text-xs text-muted-foreground">
              {activations.length > 0 
                ? `${Math.round(resolvedCount / activations.length * 100)}% del total`
                : '0%'
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <AlertTriangle className={cn('h-4 w-4', pendingCount > 0 ? 'text-warning' : 'text-muted-foreground')} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', pendingCount > 0 ? 'text-warning' : 'text-muted-foreground')}>
              {pendingCount}
            </div>
            <p className="text-xs text-muted-foreground">Activaciones sin resolver</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
          <CardDescription>Filtra los datos por rango de fechas y operador</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <Label>Desde</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label>Hasta</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label>Operador</Label>
              <Select value={filterOperator} onValueChange={setFilterOperator}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos los operadores</SelectItem>
                  {operators.map(op => (
                    <SelectItem key={op.id} value={op.id}>{op.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs de gráficos */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="overview">Resumen</TabsTrigger>
          <TabsTrigger value="operators">Por Operador</TabsTrigger>
          <TabsTrigger value="trends">Tendencias</TabsTrigger>
          <TabsTrigger value="details">Detalle</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Por Categoría */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Activaciones por Categoría
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={categoryChartConfig} className="mx-auto aspect-square h-[300px]">
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent hideLabel nameKey="name" />}
                    />
                    <Pie
                      data={getActivationsByCategory()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      dataKey="value"
                      nameKey="name"
                    >
                      {getActivationsByCategory().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || BLUE_PALETTE[index % BLUE_PALETTE.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Por Severidad */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Activaciones por Severidad
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={severityChartConfig} className="h-[300px] w-full">
                  <BarChart data={getActivationsBySeverity()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="value" name="Cantidad" radius={[0, 4, 4, 0]}>
                      {getActivationsBySeverity().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || BLUE_PALETTE[index % BLUE_PALETTE.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tendencia mensual */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-violet-500" />
                Tendencia Mensual
              </CardTitle>
              <CardDescription>Activaciones y horas por mes</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={monthlyTrendConfig} className="h-[300px] w-full">
                <AreaChart data={getActivationsByMonth()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="activations"
                    name="Activaciones"
                    stroke="var(--color-activations)"
                    fill="var(--color-activations)"
                    fillOpacity={0.3}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="hours"
                    name="Horas"
                    stroke="var(--color-hours)"
                    fill="var(--color-hours)"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operators Tab */}
        <TabsContent value="operators" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Activaciones por Operador */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-cyan-500" />
                  Activaciones por Operador
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={operatorActivationsConfig} className="h-[350px] w-full">
                  <BarChart data={getActivationsByOperator()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="value" name="Activaciones" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            {/* Horas por Operador */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-violet-500" />
                  Horas por Operador
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer config={operatorHoursConfig} className="h-[350px] w-full">
                  <BarChart data={getHoursByOperator()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="hours" name="Horas" fill="var(--color-hours)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>

          {/* Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                Ranking de Operadores
              </CardTitle>
              <CardDescription>Ordenado por cantidad de horas dedicadas</CardDescription>
            </CardHeader>
            <CardContent>
              {getHoursByOperator().length === 0 ? (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Sin datos de operadores</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {getHoursByOperator().slice(0, 5).map((op, index) => (
                    <div key={op.name} className="flex items-center gap-4">
                      <div className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold',
                        index === 0 ? 'bg-primary' : index === 1 ? 'bg-muted-foreground' : index === 2 ? 'bg-muted-foreground/70' : 'bg-muted text-muted-foreground'
                      )}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{op.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {op.hours} horas totales
                        </div>
                      </div>
                      <Badge variant="outline">
                        {Math.round(op.hours / (summary?.totalHours || 1) * 100)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Tendencia Semanal
              </CardTitle>
              <CardDescription>Activaciones por semana (últimas 12 semanas)</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={weeklyTrendConfig} className="h-[400px] w-full">
                <BarChart data={getWeeklyTrend()}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="activaciones"
                    name="Activaciones"
                    fill="var(--color-activaciones)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Estadísticas adicionales */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Promedio Semanal</CardTitle>
                <Activity className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {(getWeeklyTrend().reduce((sum, w) => sum + w.activaciones, 0) / Math.max(getWeeklyTrend().length, 1)).toFixed(1)}
                </div>
                <p className="text-xs text-muted-foreground">activaciones/semana</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Semana más activa</CardTitle>
                <AlertTriangle className="h-4 w-4 text-warning" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-warning">
                  {Math.max(...getWeeklyTrend().map(w => w.activaciones), 0)}
                </div>
                <p className="text-xs text-muted-foreground">activaciones máximo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Semana más tranquila</CardTitle>
                <CheckCircle className="h-4 w-4 text-emerald-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">
                  {getWeeklyTrend().length > 0 ? Math.min(...getWeeklyTrend().map(w => w.activaciones)) : 0}
                </div>
                <p className="text-xs text-muted-foreground">activaciones mínimo</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Detalle de Activaciones
              </CardTitle>
              <CardDescription>
                {filteredActivations.length} registros en el período seleccionado
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-3 font-medium">Fecha</th>
                      <th className="text-left p-3 font-medium">Operador</th>
                      <th className="text-left p-3 font-medium">Categoría</th>
                      <th className="text-left p-3 font-medium">Severidad</th>
                      <th className="text-left p-3 font-medium">Título</th>
                      <th className="text-right p-3 font-medium">Duración</th>
                      <th className="text-left p-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredActivations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12">
                          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                          <p className="text-lg font-semibold mb-2">Sin datos</p>
                          <p className="text-muted-foreground">No hay activaciones en el período seleccionado</p>
                        </td>
                      </tr>
                    ) : (
                      filteredActivations.map((a) => (
                        <tr key={a.id} className="border-b hover:bg-muted/30">
                          <td className="p-3">
                            {new Date(a.activatedAt).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: 'short',
                              year: '2-digit'
                            })}
                          </td>
                          <td className="p-3 font-medium">{a.operatorDisplayName}</td>
                          <td className="p-3">
                            <Badge variant="outline" style={{ borderColor: CATEGORY_COLORS[a.category] + '50', color: CATEGORY_COLORS[a.category] }}>
                              {a.category}
                            </Badge>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline" style={{ borderColor: SEVERITY_COLORS[a.severity] + '50', color: SEVERITY_COLORS[a.severity] }}>
                              {a.severity}
                            </Badge>
                          </td>
                          <td className="p-3 max-w-[200px] truncate" title={a.title}>{a.title}</td>
                          <td className="p-3 text-right">
                            {a.durationMinutes ? `${Math.round(a.durationMinutes / 60 * 10) / 10}h` : '-'}
                          </td>
                          <td className="p-3">
                            {a.resolvedAt ? (
                              <Badge variant="soft-success">Resuelto</Badge>
                            ) : (
                              <Badge variant="soft-warning">Abierto</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
