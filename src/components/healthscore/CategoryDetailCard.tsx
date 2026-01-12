import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';
import { CategoryInfo, getCategoryScore, getCategoryContribution } from './types';
import { formatDateUTC3 } from '@/lib/utils';
import {
  Database, Shield, Link, AlertTriangle, Cpu, MemoryStick, Zap, HardDrive,
  XCircle, Wrench, Settings, TrendingUp, CheckCircle2
} from 'lucide-react';

interface CategoryDetailCardProps {
  category: CategoryInfo;
  score: HealthScoreV3Dto;
  details?: HealthScoreV3DetailDto;
  className?: string;
}

const iconMap: Record<string, any> = {
  Database, Shield, Link, AlertTriangle, Cpu, MemoryStick, Zap, HardDrive,
  XCircle, Wrench, Settings, TrendingUp
};

export function CategoryDetailCard({ category, score, details, className }: CategoryDetailCardProps) {
  const categoryScore = getCategoryScore(score, category.key);
  const contribution = getCategoryContribution(score, category.key);
  const Icon = iconMap[category.icon] || Database;
  
  const getScoreStatus = (s: number) => {
    if (s >= 90) return { label: 'Excelente', color: 'text-success', bg: 'bg-success' };
    if (s >= 75) return { label: 'Bueno', color: 'text-warning', bg: 'bg-warning' };
    if (s >= 60) return { label: 'Regular', color: 'text-warning', bg: 'bg-warning' };
    return { label: 'Crítico', color: 'text-destructive', bg: 'bg-destructive' };
  };
  
  const status = getScoreStatus(categoryScore);

  return (
    <Card className={cn(
      'border transition-all duration-200 hover:shadow-sm',
      categoryScore < 60 && 'border-destructive/20 bg-destructive/[0.02]',
      categoryScore >= 60 && categoryScore < 75 && 'border-warning/20 bg-warning/[0.02]',
      categoryScore >= 75 && categoryScore < 90 && 'border-warning/20 bg-warning/[0.02]',
      categoryScore >= 90 && 'border-success/20 bg-success/[0.02]',
      className
    )}>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className={cn(
              'p-1.5 rounded-md',
              categoryScore >= 90 && 'bg-success/10',
              categoryScore >= 60 && categoryScore < 90 && 'bg-warning/10',
              categoryScore < 60 && 'bg-destructive/10',
            )}>
              <Icon className={cn('h-4 w-4', category.color)} />
            </div>
            <span className="truncate font-medium">{category.shortName}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-xl font-bold', status.color)}>
              {categoryScore}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        
        {/* Score progress bar */}
        <Progress 
          value={categoryScore} 
          className={cn('h-1.5 mt-2.5', `[&>div]:${status.bg}`)}
        />
        
        {/* Contribution */}
        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
          <span>Contribución: {contribution.toFixed(1)}/{category.weight}</span>
          <Badge variant="outline" className={cn('text-[9px] px-1.5 py-0 font-medium', status.color)}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-4 pb-3">
        {/* Category-specific details */}
        <CategoryDetails category={category} score={score} details={details} />
      </CardContent>
    </Card>
  );
}

// Category-specific details component
interface CategoryDetailsProps {
  category: CategoryInfo;
  score: HealthScoreV3Dto;
  details?: HealthScoreV3DetailDto;
}

function CategoryDetails({ category, score, details }: CategoryDetailsProps) {
  if (!details) {
    return <p className="text-xs text-muted-foreground">Cargando detalles...</p>;
  }

  const renderMetric = (label: string, value: string | number | undefined, warning?: boolean, critical?: boolean) => {
    if (value === undefined || value === null) return null;
    return (
      <div className="flex items-center justify-between text-[11px] py-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-mono',
          critical && 'text-destructive font-semibold',
          warning && !critical && 'text-warning',
        )}>
          {value}
        </span>
      </div>
    );
  };

  switch (category.key) {
    case 'backups':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('Full Backup', 
            details.backupsDetails?.fullBackupBreached ? 'Vencido' : 'OK',
            false,
            details.backupsDetails?.fullBackupBreached
          )}
          {details.backupsDetails?.lastFullBackup && renderMetric(
            'Último Full',
            formatDateUTC3(details.backupsDetails.lastFullBackup)
          )}
          {renderMetric('Log Backup',
            details.backupsDetails?.logBackupBreached ? 'Vencido' : 'OK',
            false,
            details.backupsDetails?.logBackupBreached
          )}
        </div>
      );

    case 'alwaysOn':
      if (!details.alwaysOnDetails?.alwaysOnEnabled) {
        return <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">AlwaysOn no habilitado</p>;
      }
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('Estado', details.alwaysOnDetails.alwaysOnWorstState)}
          {renderMetric('Sincronizadas',
            `${details.alwaysOnDetails.synchronizedCount}/${details.alwaysOnDetails.databaseCount}`
          )}
          {renderMetric('Suspendidas',
            details.alwaysOnDetails.suspendedCount,
            details.alwaysOnDetails.suspendedCount > 0,
            details.alwaysOnDetails.suspendedCount > 0
          )}
          {renderMetric('Lag máx',
            `${details.alwaysOnDetails.maxSecondsBehind}s`,
            details.alwaysOnDetails.maxSecondsBehind > 30
          )}
        </div>
      );

    case 'waits':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('Bloqueados',
            details.waitsDetails?.blockedSessionCount ?? 0,
            (details.waitsDetails?.blockedSessionCount ?? 0) > 3,
            (details.waitsDetails?.blockedSessionCount ?? 0) > 10
          )}
          {renderMetric('Max bloqueo',
            `${details.waitsDetails?.maxBlockTimeSeconds ?? 0}s`,
            (details.waitsDetails?.maxBlockTimeSeconds ?? 0) > 30,
            (details.waitsDetails?.maxBlockTimeSeconds ?? 0) > 60
          )}
          {details.waitsDetails?.topWait1Type && renderMetric('Top Wait',
            details.waitsDetails.topWait1Type,
            false
          )}
          {renderMetric('CXPACKET',
            `${((details.waitsDetails?.cxPacketWaitMs ?? 0) / 1000).toFixed(1)}s`,
            (details.waitsDetails?.cxPacketWaitMs ?? 0) > 10000
          )}
        </div>
      );

    // NOTA: databaseStates fue eliminado del HealthScore

    case 'cpu':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('SQL Process',
            `${details.cpuDetails?.sqlProcessUtilization ?? 0}%`,
            (details.cpuDetails?.sqlProcessUtilization ?? 0) > 60,
            (details.cpuDetails?.sqlProcessUtilization ?? 0) > 80
          )}
          {renderMetric('P95',
            `${details.cpuDetails?.p95CPUPercent ?? 0}%`
          )}
          {renderMetric('Runnable Tasks',
            details.cpuDetails?.runnableTasks ?? 0,
            (details.cpuDetails?.runnableTasks ?? 0) > 5,
            (details.cpuDetails?.runnableTasks ?? 0) > 10
          )}
        </div>
      );

    case 'memoria':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('PLE',
            `${details.memoriaDetails?.pageLifeExpectancy ?? 0}s`,
            (details.memoriaDetails?.pageLifeExpectancy ?? 0) < 300,
            (details.memoriaDetails?.pageLifeExpectancy ?? 0) < 100
          )}
          {renderMetric('Cache Hit',
            `${details.memoriaDetails?.bufferCacheHitRatio?.toFixed(1) ?? 0}%`
          )}
          {renderMetric('Grants Pending',
            details.memoriaDetails?.memoryGrantsPending ?? 0,
            (details.memoriaDetails?.memoryGrantsPending ?? 0) > 0,
            (details.memoriaDetails?.memoryGrantsPending ?? 0) > 5
          )}
          {renderMetric('Presión',
            details.memoriaDetails?.memoryPressure ? 'Sí' : 'No',
            false,
            details.memoriaDetails?.memoryPressure
          )}
        </div>
      );

    case 'io':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('Lectura',
            `${details.ioDetails?.avgReadLatencyMs?.toFixed(1) ?? 0}ms`,
            (details.ioDetails?.avgReadLatencyMs ?? 0) > 10,
            (details.ioDetails?.avgReadLatencyMs ?? 0) > 20
          )}
          {renderMetric('Escritura',
            `${details.ioDetails?.avgWriteLatencyMs?.toFixed(1) ?? 0}ms`,
            (details.ioDetails?.avgWriteLatencyMs ?? 0) > 10,
            (details.ioDetails?.avgWriteLatencyMs ?? 0) > 15
          )}
          {renderMetric('IOPS Total',
            Math.round(details.ioDetails?.totalIOPS ?? 0).toLocaleString()
          )}
        </div>
      );

    case 'discos':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('Peor volumen',
            `${details.discosDetails?.worstFreePct?.toFixed(1) ?? 0}%`,
            (details.discosDetails?.worstFreePct ?? 100) < 20,
            (details.discosDetails?.worstFreePct ?? 100) < 10
          )}
          {renderMetric('Data Disk',
            `${details.discosDetails?.dataDiskAvgFreePct?.toFixed(1) ?? 0}%`
          )}
          {renderMetric('Log Disk',
            `${details.discosDetails?.logDiskAvgFreePct?.toFixed(1) ?? 0}%`
          )}
        </div>
      );

    // NOTA: erroresCriticos fue eliminado del HealthScore

    case 'maintenance':
      return (
        <div className="space-y-1 mt-2 pt-2 border-t border-border/30">
          {renderMetric('CHECKDB',
            details.maintenanceDetails?.checkdbOk ? 'OK' : 'Vencido',
            false,
            !details.maintenanceDetails?.checkdbOk
          )}
          {renderMetric('IndexOptimize',
            details.maintenanceDetails?.indexOptimizeOk ? 'OK' : 'Vencido',
            !details.maintenanceDetails?.indexOptimizeOk
          )}
        </div>
      );

    // NOTA: configuracionTempdb y autogrowth fueron eliminados del HealthScore

    default:
      return <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">Sin detalles disponibles</p>;
  }
}
