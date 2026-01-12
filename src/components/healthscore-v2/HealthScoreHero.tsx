import { cn } from '@/lib/utils';
import { HealthScoreStats } from './types';
import { Server, CheckCircle2, AlertTriangle, AlertCircle, XCircle } from 'lucide-react';

interface HealthScoreHeroProps {
  stats: HealthScoreStats;
  onFilterChange?: (status: string) => void;
  activeFilter?: string;
  className?: string;
}

export function HealthScoreHero({ stats, onFilterChange, activeFilter = 'All', className }: HealthScoreHeroProps) {
  const getScoreColor = (score: number) => {
    // Estilo monocromático - los números son el foco
    if (score >= 90) return 'text-foreground';
    if (score >= 75) return 'text-foreground';
    if (score >= 60) return 'text-foreground';
    return 'text-foreground';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return 'Excelente';
    if (score >= 75) return 'Bueno';
    if (score >= 60) return 'Regular';
    return 'Crítico';
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Main Score */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-8">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Score Promedio</p>
          <div className="flex items-baseline gap-3">
            <span className={cn('text-5xl sm:text-6xl font-light tabular-nums', getScoreColor(stats.avgScore))}>
              {stats.avgScore}
            </span>
            <span className="text-lg text-muted-foreground">/100</span>
          </div>
          <p className={cn('text-sm mt-1', getScoreColor(stats.avgScore))}>
            {getScoreLabel(stats.avgScore)}
          </p>
        </div>

        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard
            label="Total"
            value={stats.total}
            icon={Server}
            onClick={() => onFilterChange?.('All')}
            isActive={activeFilter === 'All'}
          />
          <MetricCard
            label="Healthy"
            value={stats.healthy}
            icon={CheckCircle2}
            color="emerald"
            onClick={() => onFilterChange?.('Healthy')}
            isActive={activeFilter === 'Healthy'}
          />
          <MetricCard
            label="Warning"
            value={stats.warning}
            icon={AlertTriangle}
            color="amber"
            onClick={() => onFilterChange?.('Warning')}
            isActive={activeFilter === 'Warning'}
          />
          <MetricCard
            label="Critical"
            value={stats.critical + stats.risk}
            icon={XCircle}
            color="red"
            onClick={() => onFilterChange?.('Critical')}
            isActive={activeFilter === 'Critical' || activeFilter === 'Risk'}
            pulse={stats.critical > 0}
          />
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
        {stats.healthy > 0 && (
          <div 
            className="bg-success h-full transition-all duration-500" 
            style={{ width: `${(stats.healthy / stats.total) * 100}%` }}
          />
        )}
        {stats.warning > 0 && (
          <div 
            className="bg-warning h-full transition-all duration-500" 
            style={{ width: `${(stats.warning / stats.total) * 100}%` }}
          />
        )}
        {stats.risk > 0 && (
          <div 
            className="bg-warning/70 h-full transition-all duration-500" 
            style={{ width: `${(stats.risk / stats.total) * 100}%` }}
          />
        )}
        {stats.critical > 0 && (
          <div 
            className="bg-destructive h-full transition-all duration-500" 
            style={{ width: `${(stats.critical / stats.total) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color?: 'emerald' | 'amber' | 'orange' | 'red';
  onClick?: () => void;
  isActive?: boolean;
  pulse?: boolean;
}

function MetricCard({ label, value, icon: Icon, color, onClick, isActive, pulse }: MetricCardProps) {
  // Indicador sutil de color solo para el punto de estado
  const dotColorClasses = {
    emerald: 'bg-success',
    amber: 'bg-warning',
    orange: 'bg-warning',
    red: 'bg-destructive',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'text-left p-3 rounded-lg transition-colors',
        'hover:bg-muted/50',
        isActive && 'bg-muted ring-1 ring-border',
        pulse && value > 0 && 'animate-pulse'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        {color && <div className={cn('w-2 h-2 rounded-full', dotColorClasses[color])} />}
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-light tabular-nums text-foreground">
        {value}
      </span>
    </button>
  );
}
