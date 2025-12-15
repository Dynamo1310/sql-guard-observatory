import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FileText, 
  ArrowLeft,
  Loader2,
  Download,
  Calendar,
  TrendingUp,
  Clock,
  Users,
  Filter,
  Activity,
  AlertTriangle,
  CheckCircle,
  BarChart3
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
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
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart
} from 'recharts';

// Colores para gráficos (evitando rojos y naranjas fuertes)
const COLORS = ['#06b6d4', '#8b5cf6', '#10b981', '#3b82f6', '#6366f1', '#14b8a6', '#0ea5e9'];
const SEVERITY_COLORS: Record<string, string> = {
  'Critical': '#dc2626',
  'High': '#f59e0b',
  'Medium': '#3b82f6',
  'Low': '#10b981',
};
const CATEGORY_COLORS: Record<string, string> = {
  'Incident': '#8b5cf6',
  'Maintenance': '#06b6d4',
  'Support': '#10b981',
  'Other': '#6366f1',
};

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
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];
      
      byWeek[weekKey] = (byWeek[weekKey] || 0) + 1;
    });
    
    return Object.entries(byWeek)
      .map(([week, count]) => ({
        week: new Date(week).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }),
        activaciones: count
      }))
      .slice(-12); // Últimas 12 semanas
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

  if (loading) {
    return (
      <div className="container py-6 flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-indigo-500" />
              Reportes y Dashboard
            </h1>
            <p className="text-muted-foreground">
              Análisis visual de activaciones y guardias
            </p>
          </div>
        </div>
        <Button onClick={handleExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Exportar CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activaciones</CardTitle>
            <Activity className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-cyan-600">{summary?.totalActivations || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              En el período seleccionado
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Horas Totales</CardTitle>
            <Clock className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {Math.round((summary?.totalHours || 0) * 10) / 10}h
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Promedio: {summary?.totalActivations ? Math.round((summary.totalHours / summary.totalActivations) * 10) / 10 : 0}h/activación
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resueltas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">
              {activations.filter(a => a.resolvedAt).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {activations.length > 0 
                ? `${Math.round(activations.filter(a => a.resolvedAt).length / activations.length * 100)}% del total`
                : '0%'
              }
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">
              {activations.filter(a => !a.resolvedAt).length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Activaciones sin resolver
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
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
                <CardTitle className="text-base">Activaciones por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getActivationsByCategory()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {getActivationsByCategory().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Por Severidad */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activaciones por Severidad</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getActivationsBySeverity()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={80} />
                    <Tooltip />
                    <Bar dataKey="value" name="Cantidad">
                      {getActivationsBySeverity().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={SEVERITY_COLORS[entry.name] || COLORS[index]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Tendencia mensual */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendencia Mensual</CardTitle>
              <CardDescription>Activaciones y horas por mes</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={getActivationsByMonth()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="activations"
                    name="Activaciones"
                    stroke="#06b6d4"
                    fill="#06b6d4"
                    fillOpacity={0.3}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="hours"
                    name="Horas"
                    stroke="#8b5cf6"
                    fill="#8b5cf6"
                    fillOpacity={0.3}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Operators Tab */}
        <TabsContent value="operators" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Activaciones por Operador */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activaciones por Operador</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={getActivationsByOperator()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" name="Activaciones" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Horas por Operador */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Horas por Operador</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={getHoursByOperator()} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="hours" name="Horas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Ranking */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranking de Operadores</CardTitle>
              <CardDescription>Ordenado por cantidad de horas dedicadas</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {getHoursByOperator().slice(0, 5).map((op, index) => (
                  <div key={op.name} className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${
                      index === 0 ? 'bg-amber-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-amber-700' : 'bg-slate-500'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{op.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {op.hours} horas totales
                      </div>
                    </div>
                    <Badge variant="outline" className="text-purple-600 border-purple-500/30">
                      {Math.round(op.hours / (summary?.totalHours || 1) * 100)}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tendencia Semanal</CardTitle>
              <CardDescription>Activaciones por semana (últimas 12 semanas)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={getWeeklyTrend()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="activaciones"
                    name="Activaciones"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    dot={{ fill: '#06b6d4', strokeWidth: 2, r: 5 }}
                    activeDot={{ r: 8 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Estadísticas adicionales */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Promedio Semanal</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(getWeeklyTrend().reduce((sum, w) => sum + w.activaciones, 0) / Math.max(getWeeklyTrend().length, 1)).toFixed(1)}
                </div>
                <p className="text-xs text-muted-foreground">activaciones/semana</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Semana más activa</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.max(...getWeeklyTrend().map(w => w.activaciones), 0)}
                </div>
                <p className="text-xs text-muted-foreground">activaciones máximo</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Semana más tranquila</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.min(...getWeeklyTrend().map(w => w.activaciones), 0)}
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
              <CardTitle className="text-base">Detalle de Activaciones</CardTitle>
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
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
                          No hay activaciones en el período seleccionado
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
                          <td className="p-3">{a.operatorDisplayName}</td>
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
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Resuelto</Badge>
                            ) : (
                              <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30">Abierto</Badge>
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
