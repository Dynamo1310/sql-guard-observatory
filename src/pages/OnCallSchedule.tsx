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
  ArrowLeft,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  OnCallCalendar, 
  OnCallOperatorDialog, 
  OnCallSwapDialog, 
  OnCallSwapApprovalCard,
  OnCallCurrentBadge,
  OnCallGenerateDialog,
  OnCallEscalationDialog,
  OnCallActivationDialog,
  OnCallDayOverrideDialog,
  OnCallBatchApprovalCard
} from '@/components/oncall';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  onCallApi,
  OnCallOperatorDto,
  MonthCalendarDto,
  OnCallCurrentDto,
  OnCallSwapRequestDto,
  OnCallWeekDto,
  OnCallConfigDto,
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
  const [config, setConfig] = useState<OnCallConfigDto | null>(null);
  
  // Dialog states
  const [showOperatorDialog, setShowOperatorDialog] = useState(false);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showSwapDialog, setShowSwapDialog] = useState(false);
  const [showEscalationDialog, setShowEscalationDialog] = useState(false);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [showDayOverrideDialog, setShowDayOverrideDialog] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<OnCallWeekDto | null>(null);
  const [selectedDateForActivation, setSelectedDateForActivation] = useState<Date | null>(null);
  const [selectedDateForOverride, setSelectedDateForOverride] = useState<Date | null>(null);
  const [originalOperatorForOverride, setOriginalOperatorForOverride] = useState<{ userId: string; displayName: string } | null>(null);

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
        loadConfig(),
      ]);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const configData = await onCallApi.getConfig();
      setConfig(configData);
    } catch (err) {
      console.error('Error al cargar configuración:', err);
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
      
      // Calcular días restantes de planificación - buscar en TODAS las guardias futuras
      await calculateDaysRemaining();
    } catch (err: any) {
      console.error('Error loading calendar:', err);
    }
  };

  const calculateDaysRemaining = async () => {
    try {
      // Cargar todas las guardias futuras (hasta 24 meses)
      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 24);
      
      const allSchedules = await onCallApi.getSchedules(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      
      if (allSchedules.length > 0) {
        // Encontrar la última guardia programada
        const lastScheduled = allSchedules.reduce((latest, s) => {
          const sEnd = new Date(s.weekEndDate);
          return sEnd > latest ? sEnd : latest;
        }, new Date(0));
        
        const now = new Date();
        const diffTime = lastScheduled.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        setDaysRemaining(diffDays > 0 ? diffDays : 0);
      } else {
        setDaysRemaining(0);
      }
    } catch (err) {
      console.error('Error calculating days remaining:', err);
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
    setSelectedWeek(week);
    setShowSwapDialog(true);
  };

  const handleDayClick = (date: Date, isRightClick: boolean = false) => {
    // Buscar quién está de guardia en esa fecha
    const dayData = calendar?.days.find(d => {
      const dayDate = new Date(d.date);
      return dayDate.toDateString() === date.toDateString();
    });

    // Si es escalamiento y hace clic derecho o CTRL+clic, abrir dialog de cobertura
    if (isEscalation && isRightClick) {
      setSelectedDateForOverride(date);
      setOriginalOperatorForOverride(
        dayData?.onCallUserId 
          ? { userId: dayData.onCallUserId, displayName: dayData.onCallDisplayName || 'Desconocido' }
          : null
      );
      setShowDayOverrideDialog(true);
      return;
    }

    // Validar que el usuario puede agregar activaciones en este día
    const isUserOnCallThisDay = dayData?.onCallUserId === user?.id;
    
    if (!isUserOnCallThisDay && !isEscalation) {
      toast.error('Solo puedes cargar activaciones en tus semanas de guardia asignadas');
      return;
    }

    setSelectedDateForActivation(date);
    setShowActivationDialog(true);
  };

  // Función para que escalamiento cree cobertura desde cualquier lugar
  const handleCreateDayOverride = (date: Date, originalOperator?: { userId: string; displayName: string }) => {
    if (!isEscalation) {
      toast.error('Solo Team Escalamiento puede crear coberturas de día');
      return;
    }
    setSelectedDateForOverride(date);
    setOriginalOperatorForOverride(originalOperator || null);
    setShowDayOverrideDialog(true);
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
  const activeOperators = operators.filter(o => o.isActive).length;

  // Exportar calendario a Excel
  const exportCalendar = async () => {
    if (!calendar || calendar.onCallWeeks.length === 0) {
      toast.error('No hay datos para exportar');
      return;
    }

    try {
      toast.info('Generando Excel con formato visual...');
      
      // Importar exceljs dinámicamente
      const ExcelJS = await import('exceljs');
      
      // Obtener escalamientos
      const escalationUsers = currentOnCall?.escalationUsers || [];
      
      // Cargar todas las guardias (12 meses hacia adelante)
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 12);
      
      const allSchedulesData = await onCallApi.getSchedules(
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      
      // Convertir a formato de semanas con colores
      let allSchedules = allSchedulesData.map(s => {
        const op = operators.find(o => o.userId === s.userId);
        return {
          scheduleId: s.id,
          weekStartDate: s.weekStartDate,
          weekEndDate: s.weekEndDate,
          weekNumber: s.weekNumber,
          userId: s.userId,
          domainUser: s.domainUser,
          displayName: s.displayName,
          colorCode: op?.colorCode || '#CCCCCC',
          isCurrentWeek: false
        };
      });
      
      // Crear workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SQL Guard Observatory';
      workbook.created = new Date();
      
      // Agrupar guardias por año
      const schedulesByYear = allSchedules.reduce((acc, schedule) => {
        const year = new Date(schedule.weekStartDate).getFullYear();
        if (!acc[year]) acc[year] = [];
        acc[year].push(schedule);
        return acc;
      }, {} as Record<number, typeof allSchedules>);
      
      // Función helper para convertir hex a ARGB (exceljs usa ARGB)
      const hexToArgb = (hex: string): string => {
        if (!hex) return 'FFFFFFFF';
        const cleanHex = hex.replace('#', '');
        return 'FF' + cleanHex.toUpperCase();
      };
      
      // Función para obtener color más oscuro para texto
      const getContrastColor = (bgColor: string): string => {
        if (!bgColor) return '000000';
        const hex = bgColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '000000' : 'FFFFFF';
      };
      
      // Nombres de los meses en español
      const monthNames = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 
                          'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
      const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
      
      // Función para obtener el operador de un día específico
      // Las guardias empiezan los miércoles a las 19:00 y terminan el miércoles siguiente a las 19:00
      // Por lo tanto: el día de inicio SÍ cuenta, el día de fin NO cuenta (ya es del siguiente operador)
      // Ejemplo: Si empieza el mié 17/12 y termina el mié 24/12, el 24 ya es del siguiente operador
      const getOperatorForDate = (date: Date): { userId: string; color: string; displayName: string } | null => {
        const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        for (const schedule of allSchedules) {
          const start = new Date(schedule.weekStartDate);
          const end = new Date(schedule.weekEndDate);
          
          // Normalizar fechas a medianoche para comparación de días
          const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
          const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
          
          // La fecha está dentro del rango si: startDay <= checkDate < endDay
          // El día de fin (endDay) NO se incluye porque ese día ya entra el nuevo operador
          if (checkDate >= startDay && checkDate < endDay) {
            const op = operators.find(o => o.userId === schedule.userId);
            return {
              userId: schedule.userId,
              color: schedule.colorCode || op?.colorCode || '#CCCCCC',
              displayName: schedule.displayName
            };
          }
        }
        return null;
      };
      
      // Crear una hoja por cada año
      for (const [yearStr, schedules] of Object.entries(schedulesByYear)) {
        const year = parseInt(yearStr);
        const worksheet = workbook.addWorksheet(yearStr);
        
        // Configurar anchos de columna
        // Col A=número, B=nombre, C=teléfono, D=espacio, E-K=calendario1, L=espacio, M-S=calendario2, etc.
        const colWidths = [4, 20, 16, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3];
        colWidths.forEach((width, idx) => {
          worksheet.getColumn(idx + 1).width = width;
        });
        
        // Fila 1: Año
        let currentRow = 1;
        worksheet.mergeCells(currentRow, 1, currentRow, 38);
        const yearCell = worksheet.getCell(currentRow, 1);
        yearCell.value = year;
        yearCell.font = { bold: true, size: 18 };
        yearCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFA500' } };
        yearCell.alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(currentRow).height = 25;
        currentRow += 2;
        
        // Team Guardia
        const teamGuardiaRow = currentRow;
        worksheet.getCell(currentRow, 1).value = '';
        worksheet.getCell(currentRow, 2).value = 'Team Guardia';
        worksheet.getCell(currentRow, 2).font = { bold: true, italic: true, color: { argb: 'FFFF6600' } };
        currentRow++;
        
        // Lista de operadores con colores
        operators.forEach((op, idx) => {
          const numCell = worksheet.getCell(currentRow, 1);
          numCell.value = idx + 1;
          numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(op.colorCode || '#CCCCCC') } };
          numCell.font = { color: { argb: 'FF' + getContrastColor(op.colorCode || '#CCCCCC') } };
          numCell.alignment = { horizontal: 'center' };
          numCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          const nameCell = worksheet.getCell(currentRow, 2);
          nameCell.value = op.displayName;
          nameCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          const phoneCell = worksheet.getCell(currentRow, 3);
          phoneCell.value = op.phoneNumber || '';
          phoneCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          currentRow++;
        });
        
        currentRow++;
        
        // Team Escalamiento
        worksheet.getCell(currentRow, 2).value = 'Team Escalamiento';
        worksheet.getCell(currentRow, 2).font = { bold: true, italic: true, color: { argb: 'FFFF6600' } };
        currentRow++;
        
        escalationUsers.forEach((esc, idx) => {
          const numCell = worksheet.getCell(currentRow, 1);
          numCell.value = '';
          numCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(esc.colorCode || '#FFFF99') } };
          numCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          const nameCell = worksheet.getCell(currentRow, 2);
          nameCell.value = esc.displayName;
          nameCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          const phoneCell = worksheet.getCell(currentRow, 3);
          phoneCell.value = esc.phoneNumber || '';
          phoneCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          
          currentRow++;
        });
        
        // Generar calendarios mensuales
        // Determinar qué meses mostrar basado en las guardias del año
        const monthsWithData = new Set<number>();
        schedules.forEach(s => {
          const start = new Date(s.weekStartDate);
          const end = new Date(s.weekEndDate);
          if (start.getFullYear() === year) monthsWithData.add(start.getMonth() + 1);
          if (end.getFullYear() === year) monthsWithData.add(end.getMonth() + 1);
        });
        
        // Generar calendario para cada mes con datos
        const monthsArray = Array.from(monthsWithData).sort((a, b) => a - b);
        
        // Posicionar calendarios en filas
        // 4 calendarios por fila, cada calendario ocupa 8 columnas (7 días + 1 espacio)
        const calendarsPerRow = 4;
        const calendarWidth = 8; // 7 días + 1 columna de espacio
        const calendarHeight = 10; // título + días semana + 6 semanas max + espacio
        
        let calIdx = 0;
        for (const month of monthsArray) {
          // Columna 5 (E) es donde empieza el primer calendario (después del espacio en D)
          const colOffset = 5 + (calIdx % calendarsPerRow) * calendarWidth;
          const rowOffset = teamGuardiaRow + Math.floor(calIdx / calendarsPerRow) * calendarHeight;
          
          // Nombre del mes
          const monthTitleCell = worksheet.getCell(rowOffset, colOffset);
          monthTitleCell.value = monthNames[month];
          monthTitleCell.font = { bold: true };
          monthTitleCell.alignment = { horizontal: 'center' };
          worksheet.mergeCells(rowOffset, colOffset, rowOffset, colOffset + 6);
          
          // Días de la semana
          for (let d = 0; d < 7; d++) {
            const dayCell = worksheet.getCell(rowOffset + 1, colOffset + d);
            dayCell.value = dayNames[d];
            dayCell.font = { bold: true, size: 9 };
            dayCell.alignment = { horizontal: 'center' };
            dayCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
          }
          
          // Días del mes
          const firstDay = new Date(year, month - 1, 1);
          const lastDay = new Date(year, month, 0);
          const startDayOfWeek = firstDay.getDay(); // 0 = domingo
          const daysInMonth = lastDay.getDate();
          
          let dayNum = 1;
          for (let week = 0; week < 6 && dayNum <= daysInMonth; week++) {
            for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
              const cellRow = rowOffset + 2 + week;
              const cellCol = colOffset + dayOfWeek;
              const cell = worksheet.getCell(cellRow, cellCol);
              
              if (week === 0 && dayOfWeek < startDayOfWeek) {
                // Día vacío antes del primer día
                cell.value = '';
              } else if (dayNum <= daysInMonth) {
                cell.value = dayNum;
                cell.alignment = { horizontal: 'center' };
                cell.font = { size: 9 };
                
                // Obtener operador para este día
                const dateToCheck = new Date(year, month - 1, dayNum);
                const opForDay = getOperatorForDate(dateToCheck);
                
                if (opForDay) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(opForDay.color) } };
                  cell.font = { size: 9, color: { argb: 'FF' + getContrastColor(opForDay.color) } };
                }
                
                dayNum++;
              }
              
              cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
            }
          }
          
          calIdx++;
        }
      }
      
      // Generar buffer y descargar
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Guardias_DBA_${Object.keys(schedulesByYear).join('_')}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      
      toast.success('Calendario exportado con formato visual y colores');
    } catch (err: any) {
      console.error('Error exporting to Excel:', err);
      toast.error('Error al exportar: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
        {/* Header Skeleton */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <Skeleton className="h-8 w-8 sm:h-9 sm:w-9" />
            <div>
              <Skeleton className="h-5 sm:h-6 w-40 sm:w-52 mb-1" />
              <Skeleton className="h-3 sm:h-4 w-28 sm:w-36 hidden sm:block" />
            </div>
          </div>
          <div className="flex gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
            <Skeleton className="h-8 w-8 sm:w-20" />
            <Skeleton className="h-8 w-8 sm:w-24" />
            <Skeleton className="h-8 w-8 sm:w-20" />
          </div>
        </div>

        {/* Layout principal skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px] gap-3 sm:gap-4">
          {/* Calendario Skeleton */}
          <div className="order-2 lg:order-1">
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <div className="flex justify-between items-center">
                  <Skeleton className="h-5 sm:h-6 w-28 sm:w-32" />
                  <div className="flex gap-1.5 sm:gap-2">
                    <Skeleton className="h-7 w-7 sm:h-8 sm:w-8" />
                    <Skeleton className="h-7 w-7 sm:h-8 sm:w-8" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-2 sm:p-4">
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {[...Array(7)].map((_, i) => (
                    <Skeleton key={`header-${i}`} className="h-6 sm:h-8 w-full" />
                  ))}
                  {[...Array(35)].map((_, i) => (
                    <Skeleton key={i} className="h-10 sm:h-14 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Panel lateral skeleton */}
          <div className="space-y-3 sm:space-y-4 order-1 lg:order-2">
            {/* Current On-Call skeleton */}
            <Card>
              <CardContent className="py-3 sm:py-4 px-3 sm:px-4">
                <div className="flex items-center gap-2 sm:gap-3">
                  <Skeleton className="h-9 w-9 sm:h-10 sm:w-10 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3 sm:h-4 w-20 sm:w-24 mb-1" />
                    <Skeleton className="h-4 sm:h-5 w-28 sm:w-32" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPIs skeleton */}
            <Card>
              <CardHeader className="pb-2 sm:pb-3 pt-3 sm:pt-4 px-3 sm:px-4">
                <Skeleton className="h-3 sm:h-4 w-16 sm:w-20" />
              </CardHeader>
              <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
                <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 sm:gap-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex flex-col lg:flex-row items-center gap-1 lg:gap-3 p-2 sm:p-2.5 rounded-lg border">
                      <Skeleton className="h-7 w-7 sm:h-8 sm:w-8 rounded-md" />
                      <div className="text-center lg:text-left">
                        <Skeleton className="h-4 sm:h-5 w-6 sm:w-8 mb-1 mx-auto lg:mx-0" />
                        <Skeleton className="h-2 w-12 sm:w-16" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      {/* Calendarios Pendientes de Aprobación */}
      <OnCallBatchApprovalCard onBatchProcessed={loadAllData} />

      {/* Header Compacto */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold tracking-tight flex items-center gap-2">
              <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              <span className="hidden xs:inline">Planificador de Guardias</span>
              <span className="xs:hidden">Planificador</span>
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
              Calendario y gestión de turnos
            </p>
          </div>
        </div>
        
        {/* Botones de acción agrupados */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap w-full sm:w-auto justify-end">
          <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={exportCalendar}>
            <Download className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline text-xs">Exportar</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={() => setShowOperatorDialog(true)}>
            <Users className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden md:inline text-xs">Operadores</span>
          </Button>
          {isEscalation && (
            <Button variant="outline" size="sm" className="h-8 px-2 sm:px-3" onClick={() => setShowEscalationDialog(true)}>
              <ShieldAlert className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden lg:inline text-xs">Escalamiento</span>
            </Button>
          )}
          <Button size="sm" className="h-8 px-2 sm:px-3" onClick={() => setShowGenerateDialog(true)}>
            <Wand2 className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden xs:inline text-xs">Generar</span>
          </Button>
        </div>
      </div>

      {/* Alerta de días restantes - más compacta */}
      {daysRemaining !== null && daysRemaining < 14 && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="py-2 sm:py-2.5 px-3 sm:px-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2 flex-1">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-xs sm:text-sm">
                <span className="font-medium">Planificación por vencer:</span>{' '}
                <span className="text-muted-foreground">
                  Quedan <strong className="text-warning">{daysRemaining}</strong> días.
                </span>
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs w-full sm:w-auto" onClick={() => setShowGenerateDialog(true)}>
              <Wand2 className="h-3 w-3 mr-1" />
              Generar semanas
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Layout principal: Calendario + Panel lateral */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px] gap-3 sm:gap-4">
        {/* Columna principal - Calendario */}
        <div className="space-y-3 sm:space-y-4 order-2 lg:order-1">
          <OnCallCalendar
            calendar={calendar}
            loading={loading}
            onMonthChange={handleMonthChange}
            onWeekClick={handleWeekClick}
            onDayClick={handleDayClick}
            currentUserId={user?.id}
            isEscalation={isEscalation}
          />
        </div>

        {/* Panel lateral derecho */}
        <div className="space-y-3 sm:space-y-4 order-1 lg:order-2">
          {/* Guardia Actual - Compacto */}
          <OnCallCurrentBadge currentOnCall={currentOnCall} loading={loading} />

          {/* KPIs en formato compacto - horizontal en móvil, grid en desktop */}
          <Card>
            <CardHeader className="pb-2 sm:pb-3 pt-3 sm:pt-4 px-3 sm:px-4">
              <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                Resumen
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-4 pb-3 sm:pb-4 pt-0">
              {/* Grid 4 columnas en móvil, 2 en panel lateral */}
              <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 sm:gap-3">
                {/* Operadores Activos */}
                <div className="flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-3 p-2 sm:p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                  <div className="p-1.5 sm:p-2 rounded-md bg-cyan-500/20">
                    <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-cyan-500" />
                  </div>
                  <div className="text-center lg:text-left">
                    <p className="text-base sm:text-lg font-bold text-cyan-500">{activeOperators}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">Operadores</p>
                  </div>
                </div>

                {/* Mis Guardias */}
                <div className="flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-3 p-2 sm:p-2.5 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="p-1.5 sm:p-2 rounded-md bg-primary/20">
                    <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                  </div>
                  <div className="text-center lg:text-left">
                    <p className="text-base sm:text-lg font-bold text-primary">{myGuards}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">Mis Guardias</p>
                  </div>
                </div>

                {/* Semanas Programadas */}
                <div className="flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-3 p-2 sm:p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                  <div className="p-1.5 sm:p-2 rounded-md bg-violet-500/20">
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-violet-500" />
                  </div>
                  <div className="text-center lg:text-left">
                    <p className="text-base sm:text-lg font-bold text-violet-500">{totalWeeks}</p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">Semanas</p>
                  </div>
                </div>

                {/* Intercambios Pendientes */}
                <div className={cn(
                  "flex flex-col lg:flex-row items-center lg:items-center gap-1 lg:gap-3 p-2 sm:p-2.5 rounded-lg border",
                  pendingSwaps > 0 
                    ? "bg-warning/10 border-warning/20" 
                    : "bg-emerald-500/10 border-emerald-500/20"
                )}>
                  <div className={cn(
                    "p-1.5 sm:p-2 rounded-md",
                    pendingSwaps > 0 ? "bg-warning/20" : "bg-emerald-500/20"
                  )}>
                    <ArrowRightLeft className={cn(
                      'h-3.5 w-3.5 sm:h-4 sm:w-4', 
                      pendingSwaps > 0 ? 'text-warning' : 'text-emerald-500'
                    )} />
                  </div>
                  <div className="text-center lg:text-left">
                    <p className={cn(
                      "text-base sm:text-lg font-bold",
                      pendingSwaps > 0 ? 'text-warning' : 'text-emerald-500'
                    )}>
                      {pendingSwaps}
                    </p>
                    <p className="text-[9px] sm:text-[10px] text-muted-foreground leading-tight">Intercambios</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Aprobaciones Pendientes */}
          <OnCallSwapApprovalCard
            requests={swapRequests}
            currentUserId={user?.id}
            isEscalation={isEscalation}
            onRequestProcessed={handleRequestProcessed}
          />
        </div>
      </div>

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
          minDaysForSwapRequest={config?.minDaysForSwapRequest ?? 7}
          minDaysForEscalationModify={config?.minDaysForEscalationModify ?? 0}
        />
      )}

      <OnCallActivationDialog
        open={showActivationDialog}
        onOpenChange={setShowActivationDialog}
        selectedDate={selectedDateForActivation}
        onActivationCreated={() => {
          // Opcional: recargar datos si es necesario
          loadCalendar(currentMonth.year, currentMonth.month);
        }}
      />

      {/* Dialog para coberturas de día - Solo Team Escalamiento */}
      <OnCallDayOverrideDialog
        open={showDayOverrideDialog}
        onOpenChange={setShowDayOverrideDialog}
        selectedDate={selectedDateForOverride}
        originalOperator={originalOperatorForOverride || undefined}
        operators={operators}
        onOverrideCreated={() => {
          loadCalendar(currentMonth.year, currentMonth.month);
          toast.success('Cobertura de día creada');
        }}
      />
    </div>
  );
}
