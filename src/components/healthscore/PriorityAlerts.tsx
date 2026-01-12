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
          bg: 'bg-destructive/5 hover:bg-destructive/10',
          border: 'border-destructive/20',
          text: 'text-destructive',
          badge: 'bg-destructive text-destructive-foreground',
        };
      case 'high':
        return {
          bg: 'bg-warning/5 hover:bg-warning/10',
          border: 'border-warning/20',
          text: 'text-warning',
          badge: 'bg-warning text-warning-foreground',
        };
      default:
        return {
          bg: 'bg-warning/5 hover:bg-warning/10',
          border: 'border-warning/20',
          text: 'text-warning',
          badge: 'bg-warning text-warning-foreground',
        };
    }
  };

  const getAmbienteBadge = (ambiente?: string) => {
    const priority = getAmbientePriority(ambiente);
    if (priority === 0) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-destructive text-destructive-foreground border-0 font-medium">
          PROD
        </Badge>
      );
    }
    if (priority === 1) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-primary text-primary-foreground border-0 font-medium">
          TEST
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground font-medium">
        DEV
      </Badge>
    );
  };

  return (
    <Card className={cn(
      'border transition-all duration-200',
      criticalCount > 0 ? 'border-destructive/30 bg-destructive/[0.02]' :
      highCount > 0 ? 'border-warning/30 bg-warning/[0.02]' :
      'border-warning/30 bg-warning/[0.02]',
      className
    )}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-accent/5 transition-colors rounded-t-xl">
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-lg',
                criticalCount > 0 ? 'bg-destructive/10' :
                highCount > 0 ? 'bg-warning/10' : 'bg-warning/10'
              )}>
                <Zap className={cn(
                  'h-5 w-5',
                  criticalCount > 0 ? 'text-destructive' :
                  highCount > 0 ? 'text-warning' : 'text-warning'
                )} />
              </div>
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  Acciones Prioritarias
                  <Badge variant="secondary" className="font-mono text-xs">
                    {alerts.length}
                  </Badge>
                  {prodAlerts > 0 && (
                    <Badge className="text-[10px] bg-destructive text-destructive-foreground border-0">
                      {prodAlerts} en PROD
                    </Badge>
                  )}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {criticalCount > 0 && <span className="text-destructive font-medium">{criticalCount} críticas</span>}
                  {criticalCount > 0 && highCount > 0 && ' · '}
                  {highCount > 0 && <span className="text-warning font-medium">{highCount} urgentes</span>}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm" className="h-8 w-8">
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 px-4">
            <div className="space-y-2">
              {visibleAlerts.map((alert, idx) => {
                const styles = getSeverityStyles(alert.severity);
                return (
                  <button
                    key={`${alert.instanceName}-${idx}`}
                    onClick={() => onAlertClick(alert.instanceName)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200',
                      'text-left group hover:-translate-y-0.5 hover:shadow-sm',
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
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-medium">
                          {alert.category}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        {alert.message}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
              
              {hasMore && (
                <p className="text-xs text-center text-muted-foreground pt-2">
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
    
    // NOTA: Database States fue eliminado del HealthScore
    
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
    
    // NOTA: ErroresCriticos fue eliminado del HealthScore
    
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
