import { Phone, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { OnCallCurrentDto } from '@/services/api';

interface OnCallCurrentBadgeProps {
  currentOnCall: OnCallCurrentDto | null;
  loading: boolean;
}

export function OnCallCurrentBadge({ currentOnCall, loading }: OnCallCurrentBadgeProps) {
  if (loading) {
    return (
      <Card className="bg-primary/5 border-primary/20">
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
      <Card className="bg-muted/50 border-muted">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
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

  return (
    <div className="space-y-3">
      {/* Current on-call */}
      <Card className="bg-teal-500/10 border-teal-500/30">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center animate-pulse-green">
                  <Phone className="h-6 w-6 text-white" />
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-teal-400 rounded-full animate-blink border-2 border-white dark:border-slate-900" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-lg">{currentOnCall.displayName}</p>
                  <Badge className="bg-teal-500 hover:bg-teal-600">En Guardia</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {formatDateRange()} • Semana {currentOnCall.weekNumber}
                </p>
              </div>
            </div>
            
            {currentOnCall.email && (
              <a 
                href={`mailto:${currentOnCall.email}`}
                className="text-sm text-teal-600 hover:underline hidden sm:block"
              >
                {currentOnCall.email}
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Escalation users */}
      {currentOnCall.escalationUsers.length > 0 && (
        <Card className="bg-amber-500/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-700 dark:text-amber-400 mb-2">
                  Guardias de Escalamiento
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentOnCall.escalationUsers.map((user) => (
                    <Tooltip key={user.userId}>
                      <TooltipTrigger asChild>
                        <Badge 
                          variant="outline" 
                          className="bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400 cursor-help"
                        >
                          {user.displayName}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{user.domainUser}</p>
                        {user.email && <p className="text-xs">{user.email}</p>}
                      </TooltipContent>
                    </Tooltip>
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

