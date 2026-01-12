import { Phone, ShieldAlert, Mail, Circle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OnCallCurrentDto } from '@/services/api';
import { cn } from '@/lib/utils';

interface OnCallCurrentBadgeProps {
  currentOnCall: OnCallCurrentDto | null;
  loading: boolean;
}

export function OnCallCurrentBadge({ currentOnCall, loading }: OnCallCurrentBadgeProps) {
  if (loading) {
    return (
      <Card className="bg-emerald-500/5 border-emerald-500/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted animate-pulse" />
            <div className="space-y-2">
              <div className="w-32 h-4 bg-muted rounded animate-pulse" />
              <div className="w-24 h-3 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!currentOnCall?.isCurrentlyOnCall) {
    return (
      <Card className="bg-muted/20 border-border/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
              <Phone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Sin guardia activa</p>
              <p className="text-xs text-muted-foreground">
                No hay guardias configuradas para este momento
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatDateRange = () => {
    const start = new Date(currentOnCall.weekStartDate);
    const end = new Date(currentOnCall.weekEndDate);
    const formatDate = (d: Date) => d.toLocaleDateString('es-AR', { 
      weekday: 'short', 
      day: '2-digit', 
      month: '2-digit' 
    });
    return `${formatDate(start)} - ${formatDate(end)}`;
  };

  // Color verde más suave y profesional (emerald-500)
  const greenColor = '#10b981';
  const greenColorRgb = '16, 185, 129'; // RGB de emerald-500

  return (
    <div className="space-y-3">
      {/* Current on-call - Estilo verde más suave */}
      <Card 
        className="transition-all duration-200 shadow-md ring-1 border-emerald-500/30 bg-emerald-500/10"
        style={{
          '--tw-ring-color': 'rgba(16, 185, 129, 0.2)',
        } as React.CSSProperties}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            {/* Icono con animación */}
            <div className="relative flex-shrink-0">
              <div className="w-14 h-14 rounded-full flex items-center justify-center ring-2 bg-emerald-500/20 ring-emerald-500/40">
                <Phone className="h-7 w-7 text-emerald-500" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full animate-pulse border-2 border-background bg-emerald-500" />
            </div>
            
            {/* Info del operador */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-bold text-lg" style={{ color: greenColor }}>{currentOnCall.displayName}</p>
                <Badge 
                  className="font-bold text-white shadow-sm hover:opacity-90"
                  style={{ backgroundColor: greenColor }}
                >
                  <Circle className="h-2.5 w-2.5 mr-1 fill-current" />
                  EN GUARDIA
                </Badge>
              </div>
              <p className="text-sm font-medium" style={{ color: `rgba(${greenColorRgb}, 0.85)` }}>
                {formatDateRange()} • Semana {currentOnCall.weekNumber}
              </p>
              
              {/* Contacto: teléfono y email */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                {currentOnCall.phoneNumber && (
                  <a 
                    href={`tel:${currentOnCall.phoneNumber}`}
                    className="flex items-center gap-1.5 text-sm px-2.5 py-1 rounded-full font-mono font-semibold animate-pulse transition-colors"
                    style={{ 
                      backgroundColor: `rgba(${greenColorRgb}, 0.25)`,
                      color: greenColor,
                    }}
                  >
                    <Phone className="h-3.5 w-3.5 animate-bounce" />
                    {currentOnCall.phoneNumber}
                  </a>
                )}
                {currentOnCall.email && (
                  <a 
                    href={`mailto:${currentOnCall.email}`}
                    className="flex items-center gap-1 text-sm hover:underline truncate max-w-[200px]"
                    style={{ color: `rgba(${greenColorRgb}, 0.7)` }}
                    title={currentOnCall.email}
                  >
                    <Mail className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{currentOnCall.email}</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Team Escalamiento */}
      {currentOnCall.escalationUsers.length > 0 && (
        <Card className="transition-all duration-200">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-amber-600 dark:text-amber-400 mb-2 italic">
                  Team Escalamiento
                </p>
                <div className="space-y-2">
                  {currentOnCall.escalationUsers.map((user) => (
                    <div 
                      key={user.userId}
                      className="flex items-center gap-2 p-2 rounded-md border transition-colors hover:bg-muted/50"
                      style={{
                        borderColor: user.colorCode || '#f59e0b',
                        borderLeftWidth: '3px',
                      }}
                    >
                      <span 
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: user.colorCode || '#f59e0b' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{user.displayName}</p>
                        {user.phoneNumber && (
                          <a 
                            href={`tel:${user.phoneNumber}`}
                            className="text-xs font-mono text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <Phone className="h-3 w-3" />
                            {user.phoneNumber}
                          </a>
                        )}
                      </div>
                      {user.email && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a 
                              href={`mailto:${user.email}`}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Mail className="h-4 w-4" />
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{user.email}</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
