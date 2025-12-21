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
    if (s >= 90) return { label: 'Excellent', color: 'text-green-600', bg: 'bg-green-500' };
    if (s >= 75) return { label: 'Good', color: 'text-yellow-500', bg: 'bg-yellow-500' };
    if (s >= 60) return { label: 'Fair', color: 'text-orange-500', bg: 'bg-orange-500' };
    return { label: 'Poor', color: 'text-red-600', bg: 'bg-red-500' };
  };
  
  const status = getScoreStatus(categoryScore);

  return (
    <Card className={cn(
      'border',
      category.borderColor,
      category.bgColor,
      className
    )}>
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Icon className={cn('h-4 w-4', category.color)} />
            <span className="truncate">{category.shortName}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className={cn('font-mono text-lg font-bold', status.color)}>
              {categoryScore}
            </span>
            <span className="text-[10px] text-muted-foreground">/100</span>
          </div>
        </div>
        
        {/* Score progress bar */}
        <Progress 
          value={categoryScore} 
          className={cn('h-1.5 mt-2', `[&>div]:${status.bg}`)}
        />
        
        {/* Contribution */}
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
          <span>Contribución: {contribution.toFixed(1)}/{category.weight}</span>
          <Badge variant="outline" className={cn('text-[9px] px-1', status.color)}>
            {status.label}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 px-3 pb-3">
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
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn(
          'font-mono',
          critical && 'text-red-600 font-semibold',
          warning && !critical && 'text-amber-500',
        )}>
          {value}
        </span>
      </div>
    );
  };

  switch (category.key) {
    case 'backups':
      return (
        <div className="space-y-1">
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
        return <p className="text-xs text-muted-foreground">AlwaysOn no habilitado</p>;
      }
      return (
        <div className="space-y-1">
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

    case 'logChain':
      return (
        <div className="space-y-1">
          {renderMetric('Cadenas rotas',
            details.logChainDetails?.brokenChainCount ?? 0,
            false,
            (details.logChainDetails?.brokenChainCount ?? 0) > 0
          )}
          {renderMetric('Sin LOG backup',
            details.logChainDetails?.fullDBsWithoutLogBackup ?? 0,
            (details.logChainDetails?.fullDBsWithoutLogBackup ?? 0) > 0
          )}
          {details.logChainDetails?.maxHoursSinceLogBackup !== undefined && renderMetric(
            'Máx horas',
            `${details.logChainDetails.maxHoursSinceLogBackup.toFixed(1)}h`,
            details.logChainDetails.maxHoursSinceLogBackup > 12,
            details.logChainDetails.maxHoursSinceLogBackup > 24
          )}
        </div>
      );

    case 'databaseStates':
      return (
        <div className="space-y-1">
          {renderMetric('Offline',
            details.databaseStatesDetails?.offlineCount ?? 0,
            false,
            (details.databaseStatesDetails?.offlineCount ?? 0) > 0
          )}
          {renderMetric('Suspect',
            details.databaseStatesDetails?.suspectCount ?? 0,
            false,
            (details.databaseStatesDetails?.suspectCount ?? 0) > 0
          )}
          {renderMetric('Suspect Pages',
            details.databaseStatesDetails?.suspectPageCount ?? 0,
            false,
            (details.databaseStatesDetails?.suspectPageCount ?? 0) > 0
          )}
        </div>
      );

    case 'cpu':
      return (
        <div className="space-y-1">
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
        <div className="space-y-1">
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
        <div className="space-y-1">
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
        <div className="space-y-1">
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

    case 'erroresCriticos':
      return (
        <div className="space-y-1">
          {renderMetric('Sev 20+ (24h)',
            details.erroresCriticosDetails?.severity20PlusCount ?? 0,
            (details.erroresCriticosDetails?.severity20PlusCount ?? 0) > 0,
            (details.erroresCriticosDetails?.severity20PlusCount ?? 0) > 10
          )}
          {renderMetric('Última hora',
            details.erroresCriticosDetails?.severity20PlusLast1h ?? 0,
            false,
            (details.erroresCriticosDetails?.severity20PlusLast1h ?? 0) > 0
          )}
        </div>
      );

    case 'maintenance':
      return (
        <div className="space-y-1">
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

    case 'configuracionTempdb':
      return (
        <div className="space-y-1">
          {renderMetric('TempDB Score',
            details.configuracionTempdbDetails?.tempDBContentionScore ?? 0,
            (details.configuracionTempdbDetails?.tempDBContentionScore ?? 100) < 70,
            (details.configuracionTempdbDetails?.tempDBContentionScore ?? 100) < 40
          )}
          {renderMetric('Archivos',
            details.configuracionTempdbDetails?.tempDBFileCount ?? 0
          )}
          {renderMetric('Mismo tamaño',
            details.configuracionTempdbDetails?.tempDBAllSameSize ? 'Sí' : 'No',
            !details.configuracionTempdbDetails?.tempDBAllSameSize
          )}
        </div>
      );

    case 'autogrowth':
      return (
        <div className="space-y-1">
          {renderMetric('Eventos (24h)',
            details.autogrowthDetails?.autogrowthEventsLast24h ?? 0,
            (details.autogrowthDetails?.autogrowthEventsLast24h ?? 0) > 20,
            (details.autogrowthDetails?.autogrowthEventsLast24h ?? 0) > 50
          )}
          {renderMetric('Cerca límite',
            details.autogrowthDetails?.filesNearLimit ?? 0,
            (details.autogrowthDetails?.filesNearLimit ?? 0) > 0,
            (details.autogrowthDetails?.filesNearLimit ?? 0) > 0
          )}
          {renderMetric('Growth malo',
            details.autogrowthDetails?.filesWithBadGrowth ?? 0,
            (details.autogrowthDetails?.filesWithBadGrowth ?? 0) > 0
          )}
        </div>
      );

    default:
      return <p className="text-xs text-muted-foreground">Sin detalles disponibles</p>;
  }
}




