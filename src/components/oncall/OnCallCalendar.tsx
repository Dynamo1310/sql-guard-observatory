import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MonthCalendarDto, CalendarDayDto, OnCallWeekDto } from '@/services/api';
import { cn } from '@/lib/utils';

interface OnCallCalendarProps {
  calendar: MonthCalendarDto | null;
  loading: boolean;
  onMonthChange: (year: number, month: number) => void;
  onWeekClick?: (week: OnCallWeekDto) => void;
  currentUserId?: string;
}

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

export function OnCallCalendar({ 
  calendar, 
  loading, 
  onMonthChange,
  onWeekClick,
  currentUserId 
}: OnCallCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
    onMonthChange(newDate.getFullYear(), newDate.getMonth() + 1);
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
    onMonthChange(newDate.getFullYear(), newDate.getMonth() + 1);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    onMonthChange(today.getFullYear(), today.getMonth() + 1);
  };

  const formatWeekDates = (startDate: string, endDate: string) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const formatDate = (d: Date) => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const formatTime = (d: Date) => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    return `${formatDate(start)} ${formatTime(start)} - ${formatDate(end)} ${formatTime(end)}`;
  };

  // Group days into weeks for rendering
  const weeks: CalendarDayDto[][] = [];
  if (calendar?.days) {
    for (let i = 0; i < calendar.days.length; i += 7) {
      weeks.push(calendar.days.slice(i, i + 7));
    }
  }

  return (
    <Card className="gradient-card shadow-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Calendario de Guardias
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>
              Hoy
            </Button>
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-lg font-semibold min-w-[160px] text-center capitalize">
              {calendar?.monthName || currentDate.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {/* Weekday headers */}
              {WEEKDAYS.map((day) => (
                <div key={day} className="bg-muted p-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
              
              {/* Calendar days */}
              {weeks.map((week, weekIndex) => (
                week.map((day, dayIndex) => {
                  const isMyGuard = day.onCallUserId === currentUserId;
                  const hasGuard = !!day.onCallUserId;
                  
                  return (
                    <Tooltip key={`${weekIndex}-${dayIndex}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "bg-card p-2 min-h-[60px] relative transition-colors",
                            !day.isCurrentMonth && "bg-muted/50 text-muted-foreground",
                            day.isToday && "ring-2 ring-primary ring-inset",
                            hasGuard && "cursor-pointer hover:bg-accent/50"
                          )}
                          style={{
                            backgroundColor: hasGuard && day.colorCode 
                              ? `${day.colorCode}20` 
                              : undefined
                          }}
                        >
                          <span className={cn(
                            "text-sm font-medium",
                            day.isToday && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                          )}>
                            {day.dayOfMonth}
                          </span>
                          
                          {/* Guard indicator */}
                          {hasGuard && (
                            <div className="mt-1">
                              {day.isOnCallStart && (
                                <div 
                                  className="text-[10px] font-medium px-1 py-0.5 rounded text-white truncate"
                                  style={{ backgroundColor: day.colorCode }}
                                >
                                  🚀 19:00
                                </div>
                              )}
                              {day.isOnCallEnd && (
                                <div 
                                  className="text-[10px] font-medium px-1 py-0.5 rounded text-white truncate"
                                  style={{ backgroundColor: day.colorCode }}
                                >
                                  ⏹️ 07:00
                                </div>
                              )}
                              {!day.isOnCallStart && !day.isOnCallEnd && (
                                <div 
                                  className="h-1.5 rounded-full mt-1"
                                  style={{ backgroundColor: day.colorCode }}
                                />
                              )}
                            </div>
                          )}
                          
                          {/* My guard badge */}
                          {isMyGuard && (
                            <div className="absolute top-1 right-1">
                              <div className="w-2 h-2 bg-yellow-400 rounded-full" title="Tu guardia" />
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      {hasGuard && (
                        <TooltipContent>
                          <p className="font-medium">{day.onCallDisplayName}</p>
                          <p className="text-xs text-muted-foreground">Guardia DBA</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  );
                })
              ))}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 pt-4 border-t">
              <div className="text-sm font-medium text-muted-foreground">Operadores:</div>
              {calendar?.onCallWeeks.filter((week, index, self) => 
                self.findIndex(w => w.userId === week.userId) === index
              ).map((week) => (
                <div key={week.userId} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: week.colorCode }}
                  />
                  <span className="text-sm">{week.displayName}</span>
                  {week.isCurrentWeek && (
                    <Badge variant="secondary" className="text-xs">En guardia</Badge>
                  )}
                </div>
              ))}
            </div>

            {/* Week list */}
            <div className="space-y-2 pt-4 border-t">
              <h4 className="text-sm font-medium text-muted-foreground">Próximas guardias:</h4>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {calendar?.onCallWeeks
                  .filter(week => new Date(week.weekEndDate) >= new Date())
                  .slice(0, 6)
                  .map((week) => (
                    <div 
                      key={week.scheduleId}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg border cursor-pointer transition-colors hover:bg-accent",
                        week.isCurrentWeek && "ring-2 ring-primary"
                      )}
                      onClick={() => onWeekClick?.(week)}
                    >
                      <div 
                        className="w-2 h-8 rounded-full"
                        style={{ backgroundColor: week.colorCode }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{week.displayName}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatWeekDates(week.weekStartDate, week.weekEndDate)}
                        </p>
                      </div>
                      {week.isCurrentWeek && (
                        <Badge>Actual</Badge>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}






