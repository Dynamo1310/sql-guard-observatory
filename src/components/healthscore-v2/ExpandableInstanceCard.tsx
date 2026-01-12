import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { HealthScoreInstance, getStatusFromScore } from './types';
import { 
  ChevronRight, 
  Database, 
  Shield, 
  Cpu,
  MemoryStick,
  Zap,
  HardDrive,
  Wrench,
  CheckCircle2,
  ExternalLink,
  Clock
} from 'lucide-react';

interface ExpandableInstanceCardProps {
  instance: HealthScoreInstance;
  isExpanded: boolean;
  onToggle: () => void;
  className?: string;
}

// 8 categorías activas del Health Score V3
const CATEGORIES = [
  // Availability & DR (40%)
  { key: 'score_Backups', label: 'Backups', icon: Database, weight: 23, group: 'Disponibilidad' },
  { key: 'score_AlwaysOn', label: 'AlwaysOn', icon: Shield, weight: 17, group: 'Disponibilidad' },
  
  // Performance (54%)
  { key: 'score_CPU', label: 'CPU', icon: Cpu, weight: 12, group: 'Rendimiento' },
  { key: 'score_Memoria', label: 'Memoria', icon: MemoryStick, weight: 10, group: 'Rendimiento' },
  { key: 'score_IO', label: 'I/O', icon: Zap, weight: 13, group: 'Rendimiento' },
  { key: 'score_Discos', label: 'Discos', icon: HardDrive, weight: 9, group: 'Rendimiento' },
  { key: 'score_Waits', label: 'Waits', icon: Clock, weight: 10, group: 'Rendimiento' },
  
  // Maintenance (6%)
  { key: 'score_Maintenance', label: 'Maintenance', icon: Wrench, weight: 6, group: 'Mantenimiento' },
];

export function ExpandableInstanceCard({ instance, isExpanded, onToggle, className }: ExpandableInstanceCardProps) {
  const status = getStatusFromScore(instance.healthScore);
  
  const statusConfig = {
    healthy: { color: 'text-foreground', bg: 'bg-success', border: 'border-border' },
    warning: { color: 'text-warning', bg: 'bg-warning', border: 'border-warning/30' },
    risk: { color: 'text-warning', bg: 'bg-warning', border: 'border-warning/30' },
    critical: { color: 'text-destructive', bg: 'bg-destructive', border: 'border-destructive/30' },
  };

  const config = statusConfig[status];
  const details = instance.healthScoreDetails || {};

  // Get score for a category
  const getScore = (key: string): number | undefined => {
    return details[key as keyof typeof details] as number | undefined;
  };

  // Find worst categories for preview
  const worstCategories = CATEGORIES
    .map(cat => ({ ...cat, score: getScore(cat.key) }))
    .filter(cat => cat.score !== undefined)
    .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
    .slice(0, 2);

  // Group categories
  const groupedCategories = {
    'Disponibilidad': CATEGORIES.filter(c => c.group === 'Disponibilidad'),
    'Rendimiento': CATEGORIES.filter(c => c.group === 'Rendimiento'),
    'Mantenimiento': CATEGORIES.filter(c => c.group === 'Mantenimiento'),
  };

  return (
    <div className={cn(
      'border rounded-lg bg-card transition-shadow hover:shadow-sm',
      isExpanded && 'shadow-md',
      className
    )}>
      {/* Header - Always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 p-4 text-left"
      >
        {/* Score */}
        <div className={cn('text-2xl font-light tabular-nums w-12 text-center', config.color)}>
          {instance.healthScore}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{instance.nombreInstancia}</span>
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
              {instance.ambiente}
            </span>
          </div>
          {!isExpanded && worstCategories.length > 0 && (
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {worstCategories.map(cat => (
                <span key={cat.key} className={cn(
                  cat.score !== undefined && cat.score < 60 && 'text-destructive',
                  cat.score !== undefined && cat.score >= 60 && cat.score < 75 && 'text-warning',
                  cat.score !== undefined && cat.score >= 75 && cat.score < 90 && 'text-warning'
                )}>
                  {cat.label}: {cat.score}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Expand Icon */}
        <ChevronRight className={cn(
          'h-5 w-5 text-muted-foreground transition-transform',
          isExpanded && 'rotate-90'
        )} />
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3 space-y-4">
          {/* Category Groups */}
          {Object.entries(groupedCategories).map(([groupName, categories]) => (
            <div key={groupName}>
              <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                {groupName}
              </h4>
              <div className="space-y-1.5">
                {categories.map(cat => {
                  const score = getScore(cat.key);
                  if (score === undefined) return null;
                  const Icon = cat.icon;
                  
                  return (
                    <div key={cat.key} className="flex items-center gap-3">
                      <Icon className={cn('h-3.5 w-3.5', getScoreColor(score))} />
                      <span className="text-sm w-28 truncate">{cat.label}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn('h-full rounded-full transition-all', getBarColor(score))}
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <span className={cn('text-sm tabular-nums w-8 text-right', getScoreColor(score))}>
                        {score}
                      </span>
                      <span className="text-xs text-muted-foreground w-8">
                        {cat.weight}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Footer with links */}
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-muted-foreground">
              SQL Server {instance.majorVersion} • {instance.hostingSite}
            </span>
            <Link 
              to={`/instance-trends/${encodeURIComponent(instance.nombreInstancia)}`}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver tendencias
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function getBarColor(score: number): string {
  if (score >= 90) return 'bg-foreground/60';
  if (score >= 75) return 'bg-warning';
  if (score >= 60) return 'bg-warning';
  return 'bg-destructive';
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-foreground';
  if (score >= 75) return 'text-warning';
  if (score >= 60) return 'text-warning';
  return 'text-destructive';
}
