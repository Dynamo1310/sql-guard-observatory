import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AlertTriangle, ChevronDown, ChevronUp, Lightbulb, ArrowRight, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PriorityAlert, getAmbientePriority } from './types';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface PriorityAlertsProps {
  alerts: PriorityAlert[];
  onAlertClick: (instanceName: string) => void;
  className?: string;
  maxVisible?: number;
}

export function PriorityAlerts({ alerts, onAlertClick, className, maxVisible = 6 }: PriorityAlertsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // Sort alerts by: 1) Ambiente (Prod > Test > Dev), 2) Severity, 3) Score
  const sortedAlerts = [...alerts].sort((a, b) => {
    // First by ambiente priority (Prod=0, Test=1, Dev=2)
    const ambienteDiff = getAmbientePriority(a.ambiente) - getAmbientePriority(b.ambiente);
    if (ambienteDiff !== 0) return ambienteDiff;
    
    // Then by severity
    const severityOrder = { critical: 0, high: 1, medium: 2 };
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    
    // Finally by score (lower score = higher priority)
    return a.healthScore - b.healthScore;
  });

  const visibleAlerts = sortedAlerts.slice(0, maxVisible);
  const hasMore = sortedAlerts.length > maxVisible;
  
  if (alerts.length === 0) {
    return null;
  }

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const highCount = alerts.filter(a => a.severity === 'high').length;
  const prodAlerts = alerts.filter(a => getAmbientePriority(a.ambiente) === 0).length;

  const getSeverityStyles = (severity: PriorityAlert['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-500/10 hover:bg-red-500/20',
          border: 'border-red-500/30',
          text: 'text-red-500',
          badge: 'bg-red-500 text-white',
        };
      case 'high':
        return {
          bg: 'bg-orange-500/10 hover:bg-orange-500/20',
          border: 'border-orange-500/30',
          text: 'text-orange-500',
          badge: 'bg-orange-500 text-white',
        };
      default:
        return {
          bg: 'bg-amber-500/10 hover:bg-amber-500/20',
          border: 'border-amber-500/30',
          text: 'text-amber-500',
          badge: 'bg-amber-500 text-white',
        };
    }
  };

  const getAmbienteBadge = (ambiente?: string) => {
    const priority = getAmbientePriority(ambiente);
    if (priority === 0) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-rose-600 text-white border-0">
          PROD
        </Badge>
      );
    }
    if (priority === 1) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-violet-600 text-white border-0">
          TEST
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
        DEV
      </Badge>
    );
  };

  return (
    <Card className={cn(
      'border-2',
      criticalCount > 0 ? 'border-red-500/40 bg-red-500/5' :
      highCount > 0 ? 'border-orange-500/40 bg-orange-500/5' :
      'border-amber-500/40 bg-amber-500/5',
      className
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/5 transition-colors">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-lg',
                criticalCount > 0 ? 'bg-red-500/20' :
                highCount > 0 ? 'bg-orange-500/20' : 'bg-amber-500/20'
              )}>
                <Zap className={cn(
                  'h-5 w-5',
                  criticalCount > 0 ? 'text-red-500' :
                  highCount > 0 ? 'text-orange-500' : 'text-amber-500'
                )} />
              </div>
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  Acciones Prioritarias
                  <Badge variant="secondary" className="font-mono text-xs">
                    {alerts.length}
                  </Badge>
                  {prodAlerts > 0 && (
                    <Badge className="text-[10px] bg-rose-600 text-white border-0">
                      {prodAlerts} en PROD
                    </Badge>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {criticalCount > 0 && <span className="text-red-500 font-medium">{criticalCount} críticas</span>}
                  {criticalCount > 0 && highCount > 0 && ' · '}
                  {highCount > 0 && <span className="text-orange-500 font-medium">{highCount} urgentes</span>}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 pb-3">
            <div className="space-y-2">
              {visibleAlerts.map((alert, idx) => {
                const styles = getSeverityStyles(alert.severity);
                return (
                  <button
                    key={`${alert.instanceName}-${idx}`}
                    onClick={() => onAlertClick(alert.instanceName)}
                    className={cn(
                      'w-full flex items-center gap-3 p-2.5 rounded-lg border transition-colors',
                      'text-left group',
                      styles.bg,
                      styles.border
                    )}
                  >
                    <Lightbulb className={cn('h-4 w-4 flex-shrink-0', styles.text)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getAmbienteBadge(alert.ambiente)}
                        <span className="font-mono text-xs font-medium truncate">
                          {alert.instanceName}
                        </span>
                        <Badge className={cn('text-[10px] px-1.5 py-0', styles.badge)}>
                          {alert.healthScore}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {alert.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {alert.message}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
              
              {hasMore && (
                <p className="text-xs text-center text-muted-foreground pt-1">
                  + {sortedAlerts.length - maxVisible} alertas más
                </p>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// Helper function to generate priority alerts from instance details
export function generatePriorityAlerts(
  instances: Array<{
    score: { instanceName: string; healthScore: number; healthStatus: string; ambiente?: string };
    details?: any;
  }>
): PriorityAlert[] {
  const alerts: PriorityAlert[] = [];
  
  for (const { score, details } of instances) {
    if (!details) continue;
    
    const baseAlert = {
      instanceName: score.instanceName,
      healthScore: score.healthScore,
      healthStatus: score.healthStatus,
      ambiente: score.ambiente,
    };
    
    // Check backups
    if (details.backupsDetails?.fullBackupBreached) {
      alerts.push({
        ...baseAlert,
        message: 'Backup Full vencido - Ejecutar backup completo',
        severity: 'critical',
        category: 'Backups',
      });
    }
    
    if (details.backupsDetails?.logBackupBreached) {
      alerts.push({
        ...baseAlert,
        message: 'Backup Log vencido - Ejecutar backup de log',
        severity: 'high',
        category: 'Backups',
      });
    }
    
    // Check AlwaysOn
    if (details.alwaysOnDetails?.suspendedCount > 0) {
      alerts.push({
        ...baseAlert,
        message: `${details.alwaysOnDetails.suspendedCount} réplica(s) suspendida(s)`,
        severity: 'critical',
        category: 'AlwaysOn',
      });
    }
    
    // Check Database States
    if (details.databaseStatesDetails) {
      const problematic = 
        (details.databaseStatesDetails.offlineCount || 0) +
        (details.databaseStatesDetails.suspectCount || 0) +
        (details.databaseStatesDetails.emergencyCount || 0);
      
      if (problematic > 0) {
        alerts.push({
          ...baseAlert,
          message: `${problematic} base(s) en estado crítico`,
          severity: 'critical',
          category: 'DB States',
        });
      }
    }
    
    // Check CPU
    if (details.cpuDetails?.sqlProcessUtilization > 90) {
      alerts.push({
        ...baseAlert,
        message: `CPU crítica: ${details.cpuDetails.sqlProcessUtilization}%`,
        severity: 'high',
        category: 'CPU',
      });
    }
    
    // Check Disk Space
    if (details.discosDetails?.worstFreePct < 10) {
      alerts.push({
        ...baseAlert,
        message: `Espacio crítico: ${details.discosDetails.worstFreePct.toFixed(1)}% libre`,
        severity: 'critical',
        category: 'Discos',
      });
    }
    
    // Check Critical Errors
    if (details.erroresCriticosDetails?.severity20PlusLast1h > 0) {
      alerts.push({
        ...baseAlert,
        message: `${details.erroresCriticosDetails.severity20PlusLast1h} error(es) crítico(s) en última hora`,
        severity: 'critical',
        category: 'Errores',
      });
    }
    
    // Check Memory
    if (details.memoriaDetails?.pageLifeExpectancy < 100) {
      alerts.push({
        ...baseAlert,
        message: `PLE crítico: ${details.memoriaDetails.pageLifeExpectancy}s`,
        severity: 'high',
        category: 'Memoria',
      });
    }
  }
  
  return alerts;
}
