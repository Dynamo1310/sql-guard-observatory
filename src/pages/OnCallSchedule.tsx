import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  CalendarDays, 
  Wand2, 
  ArrowRightLeft,
  Users,
  Clock,
  ShieldAlert,
  Download,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KPICard } from '@/components/dashboard/KPICard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  OnCallCalendar, 
  OnCallOperatorDialog, 
  OnCallSwapDialog, 
  OnCallSwapApprovalCard,
  OnCallCurrentBadge,
  OnCallGenerateDialog,
  OnCallEscalationDialog
} from '@/components/oncall';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  onCallApi,
  OnCallOperatorDto,
  MonthCalendarDto,
  OnCallCurrentDto,
  OnCallSwapRequestDto,
  OnCallScheduleDto,
  OnCallWeekDto,
} from '@/services/api';

export default function OnCallSchedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [operators, setOperators] = useState<OnCallOperatorDto[]>([]);
  const [calendar, setCalendar] = useState<MonthCalendarDto | null>(null);
  const [currentOnCall, setCurrentOnCall] = useState<OnCallCurrentDto | null>(null);
  const [swapRequests, setSwapRequests] = useState<OnCallSwapRequestDto[]>([]);
  const [isEscalation, setIsEscalation] = useState(false);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  
  // Dialog states
  const [showOperatorDialog, setShowOperatorDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [showEscalationDialog, setShowEscalationDialog] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<OnCallWeekDto | null>(null);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    loadCalendar(currentMonth.year, currentMonth.month);
  }, [currentMonth]);

  const loadAllData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadOperators(),
        loadCurrentOnCall(),
        loadSwapRequests(),
        checkEscalationStatus(),
      ]);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadOperators = async () => {
    const data = await onCallApi.getOperators();
    setOperators(data);
  };

  const loadCalendar = async (year: number, month: number) => {
    try {
      const data = await onCallApi.getMonthCalendar(year, month);
      setCalendar(data);
      
      // Calcular días restantes de planificación
      const now = new Date();
      const scheduledWeeks = data.onCallWeeks.filter(w => w.scheduleId);
      if (scheduledWeeks.length > 0) {
        const lastScheduled = scheduledWeeks.reduce((latest, w) => {
          const wEnd = new Date(w.weekEndDate);
          return wEnd > latest ? wEnd : latest;
        }, new Date(0));
        
        const diffTime = lastScheduled.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setDaysRemaining(diffDays > 0 ? diffDays : 0);
      }
    } catch (err: any) {
      console.error('Error loading calendar:', err);
    }
  };

  const loadCurrentOnCall = async () => {
    const data = await onCallApi.getCurrentOnCall();
    setCurrentOnCall(data);
  };

  const loadSwapRequests = async () => {
    const data = await onCallApi.getSwapRequests();
    setSwapRequests(data);
  };

  const checkEscalationStatus = async () => {
    try {
      const { isEscalation } = await onCallApi.isEscalationUser();
      setIsEscalation(isEscalation);
    } catch (err) {
      console.error('Error checking escalation status:', err);
    }
  };

  const handleMonthChange = (year: number, month: number) => {
    setCurrentMonth({ year, month });
  };

  const handleWeekClick = (week: OnCallWeekDto) => {
    // Cualquier usuario puede hacer click para ver opciones de la guardia
    setSelectedWeek(week);
    setShowSwapDialog(true);
  };

  const handleOperatorsChange = async () => {
    await loadOperators();
    await loadCalendar(currentMonth.year, currentMonth.month);
  };

  const handleEscalationChange = async () => {
    await loadCurrentOnCall();
    await checkEscalationStatus();
  };

  const handleScheduleGenerated = async () => {
    await loadCalendar(currentMonth.year, currentMonth.month);
    await loadCurrentOnCall();
  };

  const handleSwapCreated = async () => {
    await loadSwapRequests();
  };

  const handleRequestProcessed = async () => {
    await loadSwapRequests();
    await loadCalendar(currentMonth.year, currentMonth.month);
    await loadCurrentOnCall();
  };

  // Stats
  const pendingSwaps = swapRequests.filter(r => r.status === 'Pending').length;
  const myGuards = calendar?.onCallWeeks.filter(w => w.userId === user?.id).length || 0;
  const totalWeeks = calendar?.onCallWeeks.length || 0;

  // Exportar calendario a CSV
  const exportCalendar = () => {
    if (!calendar || calendar.onCallWeeks.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    let csv = 'Semana,Inicio,Fin,Operador\n';
    calendar.onCallWeeks
      .filter(w => w.scheduleId)
      .forEach(w => {
        csv += `${w.weekNumber},${new Date(w.weekStartDate).toLocaleDateString()},${new Date(w.weekEndDate).toLocaleDateString()},${w.operatorDisplayName || 'Sin asignar'}\n`;
      });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `guardias_${currentMonth.year}_${currentMonth.month}.csv`;
    link.click();
    
    toast.success('Calendario exportado');
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-teal-500" />
              Planificador de Guardias
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">
              Calendario de guardias y gestión de turnos
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCalendar}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Button variant="outline" onClick={() => setShowOperatorDialog(true)}>
            <Users className="mr-2 h-4 w-4" />
            Operadores
          </Button>
          <Button onClick={() => setShowGenerateDialog(true)} className="bg-teal-600 hover:bg-teal-700">
            <Wand2 className="mr-2 h-4 w-4" />
            Generar Calendario
          </Button>
          {isEscalation && (
            <Button variant="outline" onClick={() => setShowEscalationDialog(true)} className="border-amber-500/50 text-amber-600 hover:bg-amber-500/10">
              <ShieldAlert className="mr-2 h-4 w-4" />
              Escalamiento
            </Button>
          )}
        </div>
      </div>

      {/* Días restantes warning */}
      {daysRemaining !== null && daysRemaining < 14 && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <div className="flex-1">
              <p className="font-medium text-amber-600">
                Planificación por vencer
              </p>
              <p className="text-sm text-muted-foreground">
                Quedan <strong>{daysRemaining}</strong> días de guardias planificadas. 
                Se recomienda generar más semanas.
              </p>
            </div>
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              {daysRemaining} días
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Current On-Call */}
      <OnCallCurrentBadge currentOnCall={currentOnCall} loading={loading} />

      {/* Pending Approvals */}
      <OnCallSwapApprovalCard
        requests={swapRequests}
        currentUserId={user?.id}
        isEscalation={isEscalation}
        onRequestProcessed={handleRequestProcessed}
      />

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Operadores Activos"
          value={operators.filter(o => o.isActive).length}
          icon={Users}
          variant="default"
        />
        <KPICard
          title="Mis Guardias (visible)"
          value={myGuards}
          icon={CalendarDays}
          variant="default"
        />
        <KPICard
          title="Semanas Programadas"
          value={totalWeeks}
          icon={Clock}
          variant="default"
        />
        <KPICard
          title="Intercambios Pendientes"
          value={pendingSwaps}
          icon={ArrowRightLeft}
          variant={pendingSwaps > 0 ? "warning" : "default"}
        />
      </div>

      {/* Calendar */}
      <OnCallCalendar
        calendar={calendar}
        loading={loading}
        onMonthChange={handleMonthChange}
        onWeekClick={handleWeekClick}
        currentUserId={user?.id}
      />

      {/* Dialogs */}
      <OnCallOperatorDialog
        open={showOperatorDialog}
        onOpenChange={setShowOperatorDialog}
        operators={operators}
        onOperatorsChange={handleOperatorsChange}
      />

      <OnCallGenerateDialog
        open={showGenerateDialog}
        onOpenChange={setShowGenerateDialog}
        operators={operators}
        onScheduleGenerated={handleScheduleGenerated}
      />

      <OnCallEscalationDialog
        open={showEscalationDialog}
        onOpenChange={setShowEscalationDialog}
        onEscalationChange={handleEscalationChange}
      />

      {selectedWeek && (
        <OnCallSwapDialog
          open={showSwapDialog}
          onOpenChange={setShowSwapDialog}
          schedule={{
            id: selectedWeek.scheduleId,
            userId: selectedWeek.userId,
            domainUser: selectedWeek.domainUser,
            displayName: selectedWeek.displayName,
            weekStartDate: selectedWeek.weekStartDate,
            weekEndDate: selectedWeek.weekEndDate,
            weekNumber: selectedWeek.weekNumber,
            year: new Date(selectedWeek.weekStartDate).getFullYear(),
            isOverride: false,
            createdAt: new Date().toISOString(),
          }}
          operators={operators}
          currentUserId={user?.id}
          currentDomainUser={user?.domainUser}
          isEscalation={isEscalation}
          onSwapCreated={handleSwapCreated}
        />
      )}
    </div>
  );
}

