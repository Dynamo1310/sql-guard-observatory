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
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { onCallApi, OnCallCurrentDto, OnCallOperatorDto, activationsApi, ActivationSummaryDto } from '@/services/api';
import { toast } from 'sonner';

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const menuItems = [
    { 
      title: 'Planificador', 
      description: 'Calendario y generación de guardias', 
      icon: Calendar, 
      href: '/oncall/planner',
      color: 'bg-teal-500/10 text-teal-500'
    },
    { 
      title: 'Intercambios', 
      description: 'Aprobar o rechazar cambios de turno', 
      icon: ArrowRightLeft, 
      href: '/oncall/swaps',
      color: 'bg-cyan-500/10 text-cyan-500'
    },
    { 
      title: 'Operadores', 
      description: 'Gestionar operadores de guardia', 
      icon: Users, 
      href: '/oncall/operators',
      color: 'bg-blue-500/10 text-blue-500'
    },
    { 
      title: 'Escalamiento', 
      description: 'Usuarios con permisos especiales', 
      icon: ShieldAlert, 
      href: '/oncall/escalation',
      color: 'bg-amber-500/10 text-amber-500'
    },
    { 
      title: 'Activaciones', 
      description: 'Registro de incidentes atendidos', 
      icon: Activity, 
      href: '/oncall/activations',
      color: 'bg-purple-500/10 text-purple-500'
    },
    { 
      title: 'Alertas', 
      description: 'Configurar notificaciones por email', 
      icon: Bell, 
      href: '/oncall/alerts',
      color: 'bg-rose-500/10 text-rose-500'
    },
    { 
      title: 'Reportes', 
      description: 'Histórico y exportación de datos', 
      icon: FileText, 
      href: '/oncall/reports',
      color: 'bg-indigo-500/10 text-indigo-500'
    },
  ];

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Phone className="h-8 w-8 text-teal-500" />
          Guardias DBA
        </h1>
        <p className="text-muted-foreground mt-2">
          Sistema de gestión de guardias y activaciones del equipo DBA
        </p>
      </div>

      {/* Estado actual */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Operador activo */}
        <Card className="border-teal-500/30">
          <CardHeader className="pb-2">
            <CardDescription>Guardia Actual</CardDescription>
          </CardHeader>
          <CardContent>
            {currentOnCall ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center">
                    <Phone className="h-5 w-5 text-teal-500" />
                  </div>
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-teal-500 rounded-full animate-pulse" />
                </div>
                <div>
                  <p className="font-semibold">{currentOnCall.displayName}</p>
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
          <CardHeader className="pb-2">
            <CardDescription>Operadores</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{operators.filter(o => o.isActive).length}</p>
                <p className="text-xs text-muted-foreground">en rotación</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Días restantes */}
        <Card className={daysRemaining !== null && daysRemaining < 14 ? 'border-amber-500/50' : ''}>
          <CardHeader className="pb-2">
            <CardDescription>Planificación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                daysRemaining !== null && daysRemaining < 14 
                  ? 'bg-amber-500/20' 
                  : 'bg-slate-500/20'
              }`}>
                <Clock className={`h-5 w-5 ${
                  daysRemaining !== null && daysRemaining < 14 
                    ? 'text-amber-500' 
                    : 'text-slate-500'
                }`} />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {daysRemaining !== null ? daysRemaining : '—'}
                </p>
                <p className="text-xs text-muted-foreground">días restantes</p>
              </div>
            </div>
            {daysRemaining !== null && daysRemaining < 14 && (
              <Badge variant="outline" className="mt-2 text-amber-600 border-amber-500/50">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Requiere atención
              </Badge>
            )}
          </CardContent>
        </Card>

        {/* Activaciones del mes */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Activaciones (30 días)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary?.totalActivations ?? 0}</p>
                <p className="text-xs text-muted-foreground">
                  {summary ? `${summary.totalHours}h ${summary.totalMinutes}m` : '0h 0m'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menú de navegación */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Gestión</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {menuItems.map((item) => (
            <Link key={item.href} to={item.href}>
              <Card className="h-full hover:bg-accent/50 transition-colors cursor-pointer group">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center`}>
                      <item.icon className="h-5 w-5" />
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
            <CardTitle className="text-base">Orden de Rotación</CardTitle>
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
                    className={currentOnCall?.userId === op.userId ? 'bg-teal-500' : ''}
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

