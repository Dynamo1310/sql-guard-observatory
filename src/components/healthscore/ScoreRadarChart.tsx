import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import { HealthScoreV3Dto } from '@/services/api';
import { CATEGORIES, getCategoryScore } from './types';

interface ScoreRadarChartProps {
  score: HealthScoreV3Dto;
  className?: string;
  showLegend?: boolean;
}

export function ScoreRadarChart({ score, className, showLegend = false }: ScoreRadarChartProps) {
  // Prepare data for radar chart
  const data = CATEGORIES.map(cat => ({
    category: cat.shortName,
    fullName: cat.name,
    score: getCategoryScore(score, cat.key),
    weight: cat.weight,
    fullMark: 100,
  }));

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-popover/95 backdrop-blur-sm border rounded-lg p-2 shadow-lg">
          <p className="font-semibold text-xs">{data.fullName}</p>
          <p className="text-xs text-muted-foreground">
            Score: <span className={cn(
              'font-mono font-bold',
              data.score >= 80 ? 'text-green-600' :
              data.score >= 60 ? 'text-yellow-600' : 'text-red-600'
            )}>{data.score}</span>/100
          </p>
          <p className="text-[10px] text-muted-foreground">
            Peso: {data.weight}%
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={cn('w-full h-[280px]', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid 
            gridType="polygon" 
            stroke="currentColor"
            className="text-border"
          />
          <PolarAngleAxis 
            dataKey="category" 
            tick={{ 
              fontSize: 10, 
              fill: 'currentColor',
              className: 'text-muted-foreground'
            }}
          />
          <PolarRadiusAxis 
            angle={90} 
            domain={[0, 100]} 
            tick={{ fontSize: 8 }}
            tickCount={5}
            className="text-muted-foreground"
          />
          <Radar
            name="Score"
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
          {showLegend && <Legend />}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Simplified version for smaller displays
interface ScoreMiniRadarProps {
  score: HealthScoreV3Dto;
  size?: number;
  className?: string;
}

export function ScoreMiniRadar({ score, size = 120, className }: ScoreMiniRadarProps) {
  const data = CATEGORIES.map(cat => ({
    category: cat.shortName,
    score: getCategoryScore(score, cat.key),
    fullMark: 100,
  }));

  return (
    <div className={cn('flex items-center justify-center', className)} style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="80%">
          <PolarGrid gridType="polygon" stroke="currentColor" className="text-border/50" />
          <Radar
            dataKey="score"
            stroke="hsl(var(--primary))"
            fill="hsl(var(--primary))"
            fillOpacity={0.3}
            strokeWidth={1.5}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}




