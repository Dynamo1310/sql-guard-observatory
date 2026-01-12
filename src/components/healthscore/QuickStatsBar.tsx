import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, AlertCircle, XCircle, Server, TrendingUp } from 'lucide-react';
import { HealthScoreStats } from './types';

interface QuickStatsBarProps {
  stats: HealthScoreStats;
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  className?: string;
}

interface StatBadgeProps {
  label: string;
  value: number;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  isActive: boolean;
  onClick: () => void;
}

function StatBadge({ label, value, icon: Icon, colorClass, bgClass, isActive, onClick }: StatBadgeProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200',
        'border hover:-translate-y-0.5',
        isActive 
          ? cn(bgClass, 'border-current shadow-sm') 
          : 'bg-muted/30 border-border/30 hover:bg-muted/50 hover:border-border/50'
      )}
    >
      <Icon className={cn('h-4 w-4', isActive ? colorClass : 'text-muted-foreground')} />
      <div className="flex flex-col items-start">
        <span className={cn(
          'font-mono text-lg font-bold leading-none',
          isActive ? colorClass : 'text-foreground'
        )}>
          {value}
        </span>
        <span className={cn(
          'text-[10px] leading-none mt-0.5',
          isActive ? colorClass : 'text-muted-foreground'
        )}>
          {label}
        </span>
      </div>
    </button>
  );
}

export function QuickStatsBar({ stats, activeFilter, onFilterChange, className }: QuickStatsBarProps) {
  const statItems = [
    {
      key: 'All',
      label: 'Total',
      value: stats.total,
      icon: Server,
      colorClass: 'text-foreground',
      bgClass: 'bg-muted/50',
    },
    {
      key: 'Healthy',
      label: 'Healthy',
      value: stats.healthy,
      icon: CheckCircle2,
      colorClass: 'text-success',
      bgClass: 'bg-success/10',
    },
    {
      key: 'Warning',
      label: 'Warning',
      value: stats.warning,
      icon: AlertTriangle,
      colorClass: 'text-warning',
      bgClass: 'bg-warning/10',
    },
    {
      key: 'Risk',
      label: 'Risk',
      value: stats.risk,
      icon: AlertCircle,
      colorClass: 'text-warning',
      bgClass: 'bg-warning/10',
    },
    {
      key: 'Critical',
      label: 'Critical',
      value: stats.critical,
      icon: XCircle,
      colorClass: 'text-destructive',
      bgClass: 'bg-destructive/10',
    },
  ];

  const getAvgScoreColor = () => {
    if (stats.avgScore >= 90) return 'text-success';
    if (stats.avgScore >= 75) return 'text-warning';
    if (stats.avgScore >= 60) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className={cn(
      'flex items-center gap-2 p-3 rounded-xl bg-muted/20 border border-border/30 flex-wrap',
      className
    )}>
      {/* Quick filter badges */}
      {statItems.map((item) => (
        <StatBadge
          key={item.key}
          label={item.label}
          value={item.value}
          icon={item.icon}
          colorClass={item.colorClass}
          bgClass={item.bgClass}
          isActive={activeFilter === item.key}
          onClick={() => onFilterChange(item.key)}
        />
      ))}

      {/* Separator */}
      <div className="hidden lg:block h-8 w-px bg-border/50 mx-1" />

      {/* Average score */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 border border-border/30">
        <TrendingUp className={cn('h-4 w-4', getAvgScoreColor())} />
        <div className="flex flex-col">
          <span className="text-[10px] text-muted-foreground">Promedio</span>
          <span className={cn('font-mono text-lg font-bold leading-none', getAvgScoreColor())}>
            {stats.avgScore}
          </span>
        </div>
      </div>
    </div>
  );
}
