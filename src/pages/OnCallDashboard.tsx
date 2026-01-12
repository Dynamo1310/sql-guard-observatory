import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Phone, 
  Users, 
  Calendar, 
  AlertTriangle, 
  Clock, 
  TrendingUp,
  Activity,
  ShieldAlert,
  FileText,
  Bell,
  ArrowRight,
  ArrowRightLeft,
  RefreshCw,
  Settings
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { onCallApi, OnCallCurrentDto, OnCallOperatorDto, activationsApi, ActivationSummaryDto } from '@/services/api';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function OnCallDashboard() {
  const [currentOnCall, setCurrentOnCall] = useState<OnCallCurrentDto | null>(null);
  const [operators, setOperators] = useState<OnCallOperatorDto[]>([]);
  const [summary, setSummary] = useState<ActivationSummaryDto | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [current, ops] = await Promise.all([
        onCallApi.getCurrentOnCall().catch(() => null),
        onCallApi.getOperators().catch(() => []),
      ]);
      
      setCurrentOnCall(current);
      setOperators(ops);

      // Calcular días restantes de planificación
      const now = new Date();
      const currentYear = now.getFullYear();
      const calendar = await onCallApi.getMonthCalendar(currentYear, 12).catch(() => null);
      if (calendar?.onCallWeeks) {
        const scheduledWeeks = calendar.onCallWeeks.filter(w => w.scheduleId);
        if (scheduledWeeks.length > 0) {
          const lastScheduled = scheduledWeeks
            .sort((a, b) => new Date(b.weekEndDate).getTime() - new Date(a.weekEndDate).getTime())[0];
          
          const lastDate = new Date(lastScheduled.weekEndDate);
          const diffTime = lastDate.getTime() - now.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          setDaysRemaining(diffDays > 0 ? diffDays : 0);
        }
      }

      // Cargar resumen de activaciones (último mes)
      try {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
        const sum = await activationsApi.getSummary(startDate.toISOString());
        setSummary(sum);
      } catch {
        // API no disponible todavía
      }
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const menuItems = [
    { 
      title: 'Planificador', 
      description: 'Calendario y generación de guardias', 
      icon: Calendar, 
      href: '/oncall/planner',
      color: 'text-primary'
    },
    { 
      title: 'Intercambios', 
      description: 'Aprobar o rechazar cambios de turno', 
      icon: ArrowRightLeft, 
      href: '/oncall/swaps',
      color: 'text-violet-500'
    },
    { 
      title: 'Operadores', 
      description: 'Gestionar operadores de guardia', 
      icon: Users, 
      href: '/oncall/operators',
      color: 'text-cyan-500'
    },
    { 
      title: 'Escalamiento', 
      description: 'Usuarios con permisos especiales', 
      icon: ShieldAlert, 
      href: '/oncall/escalation',
      color: 'text-warning'
    },
    { 
      title: 'Activaciones', 
      description: 'Registro de incidentes atendidos', 
      icon: Activity, 
      href: '/oncall/activations',
      color: 'text-emerald-500'
    },
    { 
      title: 'Notificaciones', 
      description: 'Configurar notificaciones por email', 
      icon: Bell, 
      href: '/oncall/alerts',
      color: 'text-red-500'
    },
    { 
      title: 'Reportes', 
      description: 'Histórico y exportación de datos', 
      icon: FileText, 
      href: '/oncall/reports',
      color: 'text-info'
    },
    { 
      title: 'Configuración', 
      description: 'Aprobación de calendarios y feriados', 
      icon: Settings, 
      href: '/oncall/settings',
      color: 'text-slate-500'
    },
  ];

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* KPIs Skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20 mb-2" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Menu Skeleton */}
        <div>
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(7)].map((_, i) => (
              <Card key={i}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-10 w-10 rounded-lg" />
                    <Skeleton className="h-4 w-4" />
                  </div>
                  <Skeleton className="h-5 w-24 mt-2" />
                  <Skeleton className="h-4 w-40" />
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        {/* Rotation Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-6 w-24" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeOperators = operators.filter(o => o.isActive).length;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Phone className="h-8 w-8" />
            Guardias DBA
          </h1>
          <p className="text-muted-foreground">
            Sistema de gestión de guardias y activaciones del equipo DBA
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Estado actual - KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Operador activo */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Guardia Actual</CardTitle>
            <Phone className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {currentOnCall ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                </div>
                <div>
                  <p className="text-lg font-bold text-primary">{currentOnCall.displayName}</p>
                  <p className="text-xs text-muted-foreground">{currentOnCall.domainUser}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">Sin guardia asignada</p>
            )}
          </CardContent>
        </Card>

        {/* Operadores activos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores</CardTitle>
            <Users className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{activeOperators}</div>
            <p className="text-xs text-muted-foreground">en rotación</p>
          </CardContent>
        </Card>

        {/* Días restantes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Planificación</CardTitle>
            <Clock className={cn('h-4 w-4', daysRemaining !== null && daysRemaining < 14 ? 'text-warning' : 'text-violet-500')} />
          </CardHeader>
          <CardContent>
            <div className={cn(
              'text-2xl font-bold',
              daysRemaining !== null && daysRemaining < 14 ? 'text-warning' : 'text-violet-500'
            )}>
              {daysRemaining !== null ? daysRemaining : '—'}
            </div>
            <p className="text-xs text-muted-foreground">días restantes</p>
            {daysRemaining !== null && daysRemaining < 14 && (
              <Badge variant="soft-warning" className="mt-2">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Requiere atención
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Activaciones del mes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activaciones (30 días)</CardTitle>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{summary?.totalActivations ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {summary ? `${summary.totalHours}h ${summary.totalMinutes}m` : '0h 0m'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Menú de navegación */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Gestión</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => (
            <Link key={item.href} to={item.href}>
              <Card className="h-full hover:bg-accent/50 transition-all duration-200 cursor-pointer group hover:-translate-y-0.5">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                      <item.icon className={cn('h-5 w-5', item.color)} />
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                  <CardTitle className="text-base mt-2">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Próximas guardias */}
      {operators.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-cyan-500" />
              Orden de Rotación
            </CardTitle>
            <CardDescription>Operadores en orden de turno</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {operators
                .filter(o => o.isActive)
                .sort((a, b) => a.rotationOrder - b.rotationOrder)
                .map((op, idx) => (
                  <Badge 
                    key={op.id} 
                    variant={currentOnCall?.userId === op.userId ? 'default' : 'outline'}
                  >
                    {idx + 1}. {op.displayName}
                  </Badge>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
