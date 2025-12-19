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
        'flex items-center gap-2 px-3 py-2 rounded-lg transition-colors',
        'border',
        isActive 
          ? cn(bgClass, 'border-current') 
          : 'bg-muted/50 border-transparent hover:bg-muted'
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
      bgClass: 'bg-muted',
    },
    {
      key: 'Healthy',
      label: 'Healthy',
      value: stats.healthy,
      icon: CheckCircle2,
      colorClass: 'text-green-600',
      bgClass: 'bg-green-500/10',
    },
    {
      key: 'Warning',
      label: 'Warning',
      value: stats.warning,
      icon: AlertTriangle,
      colorClass: 'text-yellow-600',
      bgClass: 'bg-yellow-500/10',
    },
    {
      key: 'Risk',
      label: 'Risk',
      value: stats.risk,
      icon: AlertCircle,
      colorClass: 'text-orange-600',
      bgClass: 'bg-orange-500/10',
    },
    {
      key: 'Critical',
      label: 'Critical',
      value: stats.critical,
      icon: XCircle,
      colorClass: 'text-red-600',
      bgClass: 'bg-red-500/10',
    },
  ];

  const getAvgScoreColor = () => {
    if (stats.avgScore >= 90) return 'text-green-600';
    if (stats.avgScore >= 75) return 'text-yellow-600';
    if (stats.avgScore >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  return (
    <div className={cn(
      'flex items-center gap-2 p-2 rounded-lg bg-muted/30 border flex-wrap',
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
      <div className="hidden lg:block h-8 w-px bg-border mx-1" />

      {/* Average score */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50">
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
