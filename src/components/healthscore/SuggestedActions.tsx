import { cn } from '@/lib/utils';
import { Lightbulb, AlertTriangle, AlertCircle, XCircle, ChevronRight } from 'lucide-react';
import { HealthScoreV3DetailDto } from '@/services/api';

interface SuggestedAction {
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;
}

interface SuggestedActionsProps {
  details: HealthScoreV3DetailDto;
  className?: string;
  maxItems?: number;
  compact?: boolean;
}

export function SuggestedActions({ details, className, maxItems = 10, compact = false }: SuggestedActionsProps) {
  const suggestions = generateSuggestions(details);
  
  if (suggestions.length === 0) {
    return (
      <div className={cn(
        'flex items-center gap-2 text-green-600',
        compact ? 'text-xs' : 'text-sm',
        className
      )}>
        <div className="h-2 w-2 rounded-full bg-green-500" />
        No hay acciones pendientes - Todo en orden
      </div>
    );
  }

  const displayedSuggestions = suggestions.slice(0, maxItems);
  const hasMore = suggestions.length > maxItems;

  const getSeverityStyles = (severity: SuggestedAction['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          icon: XCircle,
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-600',
          iconColor: 'text-red-500',
        };
      case 'high':
        return {
          icon: AlertTriangle,
          bg: 'bg-orange-500/10',
          border: 'border-orange-500/30',
          text: 'text-orange-600',
          iconColor: 'text-orange-500',
        };
      case 'medium':
        return {
          icon: AlertCircle,
          bg: 'bg-yellow-500/10',
          border: 'border-yellow-500/30',
          text: 'text-yellow-600',
          iconColor: 'text-yellow-500',
        };
      default:
        return {
          icon: Lightbulb,
          bg: 'bg-blue-500/10',
          border: 'border-blue-500/30',
          text: 'text-blue-600',
          iconColor: 'text-blue-500',
        };
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <span className={cn('font-semibold', compact ? 'text-xs' : 'text-sm')}>
          Acciones Sugeridas
        </span>
        <span className="text-xs text-muted-foreground">
          ({suggestions.length})
        </span>
      </div>
      
      <div className="space-y-1.5">
        {displayedSuggestions.map((suggestion, idx) => {
          const styles = getSeverityStyles(suggestion.severity);
          const Icon = styles.icon;
          
          return (
            <div
              key={idx}
              className={cn(
                'flex items-start gap-2 rounded-lg border p-2',
                styles.bg,
                styles.border
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0 mt-0.5', styles.iconColor)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-[10px] font-medium px-1.5 py-0.5 rounded',
                    styles.bg,
                    styles.text
                  )}>
                    {suggestion.category}
                  </span>
                </div>
                <p className={cn(
                  'text-muted-foreground mt-0.5',
                  compact ? 'text-[10px]' : 'text-xs'
                )}>
                  {suggestion.message}
                </p>
              </div>
            </div>
          );
        })}
        
        {hasMore && (
          <p className="text-xs text-center text-muted-foreground pt-1">
            + {suggestions.length - maxItems} más sugerencias
          </p>
        )}
      </div>
    </div>
  );
}

// Generate suggestions from instance details
function generateSuggestions(details: HealthScoreV3DetailDto): SuggestedAction[] {
  const suggestions: SuggestedAction[] = [];
  
  // Backups
  if (details.backupsDetails?.fullBackupBreached) {
    const hoursSince = details.backupsDetails.lastFullBackup
      ? Math.floor((new Date().getTime() - new Date(details.backupsDetails.lastFullBackup).getTime()) / (1000 * 60 * 60))
      : null;
    suggestions.push({
      message: hoursSince 
        ? `Backup Full vencido (hace ${hoursSince}h) - Ejecutar backup completo inmediatamente`
        : 'Backup Full vencido - Ejecutar backup completo inmediatamente',
      severity: 'critical',
      category: 'Backups',
    });
  }
  
  if (details.backupsDetails?.logBackupBreached) {
    suggestions.push({
      message: 'Backup Log vencido - Ejecutar backup de log de transacciones',
      severity: 'high',
      category: 'Backups',
    });
  }
  
  // AlwaysOn
  if (details.alwaysOnDetails?.alwaysOnEnabled) {
    if (details.alwaysOnDetails.suspendedCount > 0) {
      suggestions.push({
        message: `${details.alwaysOnDetails.suspendedCount} réplica(s) suspendida(s) - Revisar estado de red y latencia`,
        severity: 'critical',
        category: 'AlwaysOn',
      });
    }
    if (details.alwaysOnDetails.maxSendQueueKB > 50000) {
      suggestions.push({
        message: `Cola de envío crítica (${(details.alwaysOnDetails.maxSendQueueKB / 1024 / 1024).toFixed(1)}GB) - Revisar ancho de banda`,
        severity: 'high',
        category: 'AlwaysOn',
      });
    }
    if (details.alwaysOnDetails.maxSecondsBehind > 60) {
      suggestions.push({
        message: `Lag de sincronización alto (${Math.floor(details.alwaysOnDetails.maxSecondsBehind / 60)}min)`,
        severity: 'medium',
        category: 'AlwaysOn',
      });
    }
  }
  
  // Log Chain
  if (details.logChainDetails?.brokenChainCount > 0) {
    suggestions.push({
      message: `${details.logChainDetails.brokenChainCount} cadena(s) de log rota(s) - Ejecutar backup full en DBs afectadas`,
      severity: 'critical',
      category: 'Log Chain',
    });
  }
  
  // Database States
  if (details.databaseStatesDetails) {
    const problematic = 
      (details.databaseStatesDetails.offlineCount || 0) +
      (details.databaseStatesDetails.suspectCount || 0) +
      (details.databaseStatesDetails.emergencyCount || 0);
    
    if (problematic > 0) {
      suggestions.push({
        message: `${problematic} base(s) en estado crítico - Revisar error log urgentemente`,
        severity: 'critical',
        category: 'DB States',
      });
    }
  }
  
  // CPU
  if (details.cpuDetails) {
    if (details.cpuDetails.sqlProcessUtilization > 90) {
      suggestions.push({
        message: `CPU crítica (${details.cpuDetails.sqlProcessUtilization}%) - Identificar queries costosas`,
        severity: 'high',
        category: 'CPU',
      });
    } else if (details.cpuDetails.sqlProcessUtilization > 80) {
      suggestions.push({
        message: `CPU alta (${details.cpuDetails.sqlProcessUtilization}%) - Revisar queries costosas`,
        severity: 'medium',
        category: 'CPU',
      });
    }
  }
  
  // Memory
  if (details.memoriaDetails) {
    if (details.memoriaDetails.pageLifeExpectancy < 100) {
      suggestions.push({
        message: `PLE crítico (${details.memoriaDetails.pageLifeExpectancy}s) - Incrementar Max Server Memory`,
        severity: 'critical',
        category: 'Memoria',
      });
    } else if (details.memoriaDetails.pageLifeExpectancy < 300) {
      suggestions.push({
        message: `PLE bajo (${details.memoriaDetails.pageLifeExpectancy}s) - Considerar más memoria`,
        severity: 'medium',
        category: 'Memoria',
      });
    }
    
    if (details.memoriaDetails.memoryGrantsPending > 5) {
      suggestions.push({
        message: `${details.memoriaDetails.memoryGrantsPending} queries esperando memoria`,
        severity: 'high',
        category: 'Memoria',
      });
    }
  }
  
  // I/O
  if (details.ioDetails) {
    if (details.ioDetails.avgReadLatencyMs > 50) {
      suggestions.push({
        message: `Latencia de lectura crítica (${details.ioDetails.avgReadLatencyMs.toFixed(1)}ms) - Migrar a SSD`,
        severity: 'high',
        category: 'I/O',
      });
    } else if (details.ioDetails.avgReadLatencyMs > 20) {
      suggestions.push({
        message: `Latencia de lectura alta (${details.ioDetails.avgReadLatencyMs.toFixed(1)}ms)`,
        severity: 'medium',
        category: 'I/O',
      });
    }
  }
  
  // Disks
  if (details.discosDetails) {
    if (details.discosDetails.worstFreePct < 10) {
      suggestions.push({
        message: `Espacio crítico (${details.discosDetails.worstFreePct.toFixed(1)}% libre) - Expandir volumen`,
        severity: 'critical',
        category: 'Discos',
      });
    } else if (details.discosDetails.worstFreePct < 20) {
      suggestions.push({
        message: `Espacio bajo (${details.discosDetails.worstFreePct.toFixed(1)}% libre)`,
        severity: 'medium',
        category: 'Discos',
      });
    }
  }
  
  // Critical Errors
  if (details.erroresCriticosDetails) {
    if (details.erroresCriticosDetails.severity20PlusLast1h > 0) {
      suggestions.push({
        message: `${details.erroresCriticosDetails.severity20PlusLast1h} error(es) crítico(s) en última hora`,
        severity: 'critical',
        category: 'Errores',
      });
    } else if (details.erroresCriticosDetails.severity20PlusCount > 10) {
      suggestions.push({
        message: `${details.erroresCriticosDetails.severity20PlusCount} errores críticos en 24h - Revisar log`,
        severity: 'high',
        category: 'Errores',
      });
    }
  }
  
  // Maintenance
  if (details.maintenanceDetails) {
    if (!details.maintenanceDetails.checkdbOk) {
      suggestions.push({
        message: 'CHECKDB vencido - Ejecutar DBCC CHECKDB',
        severity: 'medium',
        category: 'Maintenance',
      });
    }
    if (!details.maintenanceDetails.indexOptimizeOk) {
      suggestions.push({
        message: 'Mantenimiento de índices vencido - Ejecutar IndexOptimize',
        severity: 'low',
        category: 'Maintenance',
      });
    }
  }
  
  // Configuration
  if (details.configuracionTempdbDetails) {
    if (details.configuracionTempdbDetails.tempDBContentionScore < 70) {
      suggestions.push({
        message: 'Contención en TempDB - Revisar configuración de archivos',
        severity: 'medium',
        category: 'TempDB',
      });
    }
  }
  
  // Autogrowth
  if (details.autogrowthDetails) {
    if (details.autogrowthDetails.filesNearLimit > 0) {
      suggestions.push({
        message: `${details.autogrowthDetails.filesNearLimit} archivo(s) cerca del límite - Aumentar MaxSize`,
        severity: 'high',
        category: 'Autogrowth',
      });
    }
    if (details.autogrowthDetails.autogrowthEventsLast24h > 50) {
      suggestions.push({
        message: `Muchos autogrowths (${details.autogrowthDetails.autogrowthEventsLast24h} en 24h)`,
        severity: 'medium',
        category: 'Autogrowth',
      });
    }
  }
  
  // Sort by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return suggestions.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}




