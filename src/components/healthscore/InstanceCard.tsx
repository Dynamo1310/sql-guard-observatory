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
      case 'Healthy': return 'border-green-500/30 hover:border-green-500/50';
      case 'Warning': return 'border-yellow-500/30 hover:border-yellow-500/50';
      case 'Risk': return 'border-orange-500/30 hover:border-orange-500/50';
      case 'Critical': return 'border-red-500/40 hover:border-red-500/60';
      default: return 'border-border';
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'Healthy': return 'bg-green-500/5';
      case 'Warning': return 'bg-yellow-500/5';
      case 'Risk': return 'bg-orange-500/5';
      case 'Critical': return 'bg-red-500/10';
      default: return '';
    }
  };

  const getAmbienteBadge = () => {
    if (isProd) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-rose-600 text-white border-0">
          PROD
        </Badge>
      );
    }
    if (getAmbientePriority(score.ambiente) === 1) {
      return (
        <Badge className="text-[9px] px-1.5 py-0 bg-violet-600 text-white border-0">
          TEST
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-muted-foreground">
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
        'hover:shadow-lg hover:-translate-y-0.5',
        'border',
        getStatusBorder(score.healthStatus),
        getStatusBg(score.healthStatus),
        isUpdating && 'ring-2 ring-blue-500/50',
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
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
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
                  'flex items-center gap-2 px-2 py-1 rounded text-xs',
                  'bg-muted/50 border',
                  cat.borderColor
                )}
              >
                <TrendingDown className={cn('h-3 w-3 flex-shrink-0', cat.color)} />
                <span className={cn('flex-shrink-0 font-medium', cat.color)}>
                  {cat.shortName}
                </span>
                <div className="flex-1 h-1.5 bg-background/50 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      catScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                    )}
                    style={{ width: `${catScore}%` }}
                  />
                </div>
                <span className={cn(
                  'font-mono text-[10px] font-bold',
                  catScore < 60 ? 'text-red-500' : 'text-yellow-600'
                )}>
                  {catScore}
                </span>
              </div>
            ))}
          </div>
        )}
        
        {/* Healthy indicator */}
        {problemCategories.length === 0 && score.healthScore >= 90 && (
          <div className="text-xs text-green-600 flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            Todas las categorías saludables
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t">
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
    if (score >= 90) return '#16a34a';
    if (score >= 75) return '#eab308';
    if (score >= 60) return '#f97316';
    return '#dc2626';
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
          className="text-muted/20"
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
