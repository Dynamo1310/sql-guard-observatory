import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HealthScoreV3Dto } from '@/services/api';
import { getScoreColor, getWorstCategory, getCategoryScore, CATEGORIES, getAmbientePriority } from './types';
import { Clock, TrendingDown, Server } from 'lucide-react';

interface InstanceCardProps {
  score: HealthScoreV3Dto;
  onClick: () => void;
  isUpdating?: boolean;
  className?: string;
}

export function InstanceCard({ score, onClick, isUpdating, className }: InstanceCardProps) {
  const worstCategory = getWorstCategory(score);
  const worstScore = worstCategory ? getCategoryScore(score, worstCategory.key) : 100;
  const isProd = getAmbientePriority(score.ambiente) === 0;
  
  // Get top 3 problem categories (score < 80)
  const problemCategories = CATEGORIES
    .map(cat => ({ cat, score: getCategoryScore(score, cat.key) }))
    .filter(c => c.score < 80)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'Healthy': return 'border-success/20 hover:border-success/40';
      case 'Warning': return 'border-warning/20 hover:border-warning/40';
      case 'Risk': return 'border-warning/20 hover:border-warning/40';
      case 'Critical': return 'border-destructive/20 hover:border-destructive/40';
      default: return 'border-border/50';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'Healthy': return 'bg-success/[0.02]';
      case 'Warning': return 'bg-warning/[0.02]';
      case 'Risk': return 'bg-warning/[0.02]';
      case 'Critical': return 'bg-destructive/[0.03]';
      default: return '';
    }
  };

  const getAmbienteBadge = () => {
    if (isProd) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-destructive text-destructive-foreground border-0 font-medium">
          PROD
        </Badge>
      );
    }
    if (getAmbientePriority(score.ambiente) === 1) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-primary text-primary-foreground border-0 font-medium">
          TEST
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground font-medium">
        {score.ambiente || 'DEV'}
      </Badge>
    );
  };

  return (
    <Card
      onClick={onClick}
      className={cn(
        'relative overflow-hidden cursor-pointer',
        'transition-all duration-200',
        'hover:shadow-md hover:-translate-y-0.5',
        getStatusBorder(score.healthStatus),
        getStatusBg(score.healthStatus),
        isUpdating && 'ring-2 ring-primary/50',
        className
      )}
    >
      <div className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <h3 
                className="font-mono text-sm font-semibold truncate" 
                title={score.instanceName}
              >
                {score.instanceName}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {getAmbienteBadge()}
              <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-medium">
                {score.hostingSite || 'N/A'}
              </Badge>
            </div>
          </div>
          
          {/* Score Circle */}
          <ScoreCircle score={score.healthScore} size="md" />
        </div>

        {/* Problem categories */}
        {problemCategories.length > 0 && (
          <div className="space-y-1.5">
            {problemCategories.map(({ cat, score: catScore }) => (
              <div
                key={cat.key}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs',
                  'bg-muted/30 border border-border/30'
                )}
              >
                <TrendingDown className={cn('h-3 w-3 flex-shrink-0', cat.color)} />
                <span className={cn('flex-shrink-0 font-medium text-foreground/80')}>
                  {cat.shortName}
                </span>
                <div className="flex-1 h-1.5 bg-muted/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      catScore >= 60 ? 'bg-warning' : 'bg-destructive'
                    )}
                    style={{ width: `${catScore}%` }}
                  />
                </div>
                <span className={cn(
                  'font-mono text-[10px] font-bold',
                  catScore < 60 ? 'text-destructive' : 'text-warning'
                )}>
                  {catScore}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {/* Healthy indicator */}
        {problemCategories.length === 0 && score.healthScore >= 90 && (
          <div className="text-xs text-success flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-success/5 border border-success/10">
            <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
            Todas las categorías saludables
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/30">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatRelativeTime(score.generatedAtUtc)}
          </div>
          {worstCategory && worstScore < 80 && (
            <span className={cn('font-medium', worstCategory.color)}>
              Peor: {worstCategory.shortName}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

// Simple Score Circle
interface ScoreCircleProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ScoreCircle({ score, size = 'md', className }: ScoreCircleProps) {
  const sizeConfig = {
    sm: { container: 'h-10 w-10', text: 'text-sm', strokeWidth: 2, radius: 16 },
    md: { container: 'h-14 w-14', text: 'text-lg', strokeWidth: 3, radius: 24 },
    lg: { container: 'h-20 w-20', text: 'text-2xl', strokeWidth: 4, radius: 36 },
  };
  
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const getStrokeColor = (score: number): string => {
    if (score >= 90) return 'hsl(var(--success))';
    if (score >= 75) return 'hsl(var(--warning))';
    if (score >= 60) return 'hsl(24 95% 53%)';
    return 'hsl(var(--destructive))';
  };

  const viewBoxSize = (config.radius + config.strokeWidth) * 2;

  return (
    <div className={cn('relative flex items-center justify-center', config.container, className)}>
      <svg 
        className="absolute inset-0 -rotate-90" 
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      >
        <circle
          cx={config.radius + config.strokeWidth}
          cy={config.radius + config.strokeWidth}
          r={config.radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          className="text-muted/30"
        />
        <circle
          cx={config.radius + config.strokeWidth}
          cy={config.radius + config.strokeWidth}
          r={config.radius}
          fill="none"
          stroke={getStrokeColor(score)}
          strokeWidth={config.strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-500"
        />
      </svg>
      
      <span className={cn(
        'font-mono font-bold relative z-10',
        config.text,
        getScoreColor(score)
      )}>
        {score}
      </span>
    </div>
  );
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `${diffMins}m`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}
