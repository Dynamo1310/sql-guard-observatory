import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PriorityAlert, getAmbientePriority } from './types';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface AlertRibbonProps {
  alerts: PriorityAlert[];
  onAlertClick: (instanceName: string) => void;
  className?: string;
}

export function AlertRibbon({ alerts, onAlertClick, className }: AlertRibbonProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedAlerts = [...alerts].sort((a, b) => {
    const ambienteDiff = getAmbientePriority(a.ambiente) - getAmbientePriority(b.ambiente);
    if (ambienteDiff !== 0) return ambienteDiff;
    const severityOrder = { critical: 0, high: 1, medium: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const visibleAlerts = isExpanded ? sortedAlerts : sortedAlerts.slice(0, 3);

  return (
    <div className={cn(
      'rounded-lg border border-destructive/30 bg-destructive/5',
      className
    )}>
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-foreground">
            {alerts.length} alerta{alerts.length !== 1 ? 's' : ''} activa{alerts.length !== 1 ? 's' : ''}
          </span>
          {criticalCount > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-destructive text-destructive-foreground">
              {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {alerts.length > 3 && (
          isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {/* Alert List */}
      <div className="px-4 pb-3 space-y-1">
        {visibleAlerts.map((alert, idx) => (
          <button
            key={`${alert.instanceName}-${idx}`}
            onClick={() => onAlertClick(alert.instanceName)}
            className={cn(
              'w-full flex items-center justify-between px-3 py-2 rounded text-left text-sm',
              'hover:bg-destructive/10 transition-colors'
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={cn(
                'w-1.5 h-1.5 rounded-full flex-shrink-0',
                alert.severity === 'critical' ? 'bg-destructive' : 
                alert.severity === 'high' ? 'bg-warning' : 'bg-warning/70'
              )} />
              <span className="font-mono text-xs truncate">{alert.instanceName}</span>
            </div>
            <span className="text-xs text-muted-foreground truncate ml-2 max-w-[200px]">
              {alert.message}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
