import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HealthScoreV3 } from '@/services/healthScoreV3Service';
import healthScoreV3Service from '@/services/healthScoreV3Service';

interface HealthScoreCardProps {
  score: HealthScoreV3;
  onClick?: () => void;
}

interface CategoryInfo {
  name: string;
  icon: string;
  weight: number;
  color: string;
}

// 8 categorías activas del HealthScore V3
const categories: Record<string, CategoryInfo> = {
  backups: {
    name: 'Backups (RPO/RTO)',
    icon: '🗄️',
    weight: 23,
    color: 'text-foreground',
  },
  alwaysOn: {
    name: 'AlwaysOn (AG)',
    icon: '♻️',
    weight: 17,
    color: 'text-foreground',
  },
  cpu: {
    name: 'CPU',
    icon: '⚙️',
    weight: 12,
    color: 'text-foreground',
  },
  memoria: {
    name: 'Memoria (PLE/Grants)',
    icon: '🧠',
    weight: 10,
    color: 'text-foreground',
  },
  io: {
    name: 'IO (Latencia/IOPS)',
    icon: '💽',
    weight: 13,
    color: 'text-foreground',
  },
  discos: {
    name: 'Espacio en Discos',
    icon: '🧱',
    weight: 9,
    color: 'text-foreground',
  },
  waits: {
    name: 'Wait Statistics',
    icon: '⏱️',
    weight: 10,
    color: 'text-foreground',
  },
  mantenimientos: {
    name: 'Mantenimientos',
    icon: '🧹',
    weight: 6,
    color: 'text-foreground',
  },
};

const HealthScoreCard: React.FC<HealthScoreCardProps> = ({ score, onClick }) => {
  const statusColor = healthScoreV3Service.getHealthStatusColor(score.healthScore);
  const statusEmoji = healthScoreV3Service.getHealthStatusEmoji(score.healthScore);
  const statusLabel = healthScoreV3Service.getHealthStatusLabel(score.healthScore);

  const getScoreColor = (value: number): string => {
    if (value >= 85) return 'bg-success';
    if (value >= 75) return 'bg-warning';
    if (value >= 65) return 'bg-warning/70';
    return 'bg-destructive';
  };

  // 8 categorías activas
  const categoryScores = [
    { key: 'backups', value: score.backupsScore },
    { key: 'alwaysOn', value: score.alwaysOnScore },
    { key: 'cpu', value: score.cpuScore },
    { key: 'memoria', value: score.memoriaScore },
    { key: 'io', value: score.ioScore },
    { key: 'discos', value: score.discosScore },
    { key: 'waits', value: score.waitsScore },
    { key: 'mantenimientos', value: score.mantenimientosScore },
  ];

  return (
    <Card
      className={`hover:shadow-lg transition-shadow cursor-pointer border-l-4 ${
        statusColor === 'green'
          ? 'border-l-green-500'
          : statusColor === 'yellow'
          ? 'border-l-yellow-500'
          : statusColor === 'orange'
          ? 'border-l-orange-500'
          : 'border-l-red-500'
      }`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg font-bold">
              {score.instanceName}
            </CardTitle>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline">{score.ambiente}</Badge>
              <Badge variant="outline">{score.hostingSite}</Badge>
              <Badge variant="outline">{score.sqlVersion}</Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">
              {statusEmoji} {score.healthScore}
            </div>
            <div className="text-sm text-muted-foreground">/ 100 pts</div>
            <Badge
              className={`mt-1 ${
                statusColor === 'green'
                  ? 'bg-success/10 text-success'
                  : statusColor === 'yellow'
                  ? 'bg-warning/10 text-warning'
                  : statusColor === 'orange'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {statusLabel}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Grid de categorías */}
        <div className="grid grid-cols-2 gap-2">
          {categoryScores.map((item) => {
            const category = categories[item.key];
            return (
              <TooltipProvider key={item.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex flex-col gap-1 p-2 rounded hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium flex items-center gap-1">
                          <span>{category.icon}</span>
                          <span className="truncate">{category.name.split(' ')[0]}</span>
                        </span>
                        <span className="text-xs font-bold">{item.value}</span>
                      </div>
                      <Progress
                        value={item.value}
                        className="h-1.5"
                        indicatorClassName={getScoreColor(item.value)}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-sm">
                      <div className="font-bold">{category.name}</div>
                      <div>Score: {item.value}/100</div>
                      <div>Peso: {category.weight}%</div>
                      <div>
                        Contribución: {((item.value * category.weight) / 100).toFixed(1)} pts
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            );
          })}
        </div>

        {/* Barra de score total */}
        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">Score Total</span>
            <span className="text-sm text-muted-foreground">
              Cap: {score.globalCap}
            </span>
          </div>
          <Progress
            value={score.healthScore}
            className="h-3"
            indicatorClassName={getScoreColor(score.healthScore)}
          />
        </div>

        {/* Timestamp */}
        <div className="mt-2 text-xs text-muted-foreground text-right">
          Actualizado: {new Date(score.collectedAtUtc).toLocaleString('es-ES')}
        </div>
      </CardContent>
    </Card>
  );
};

export default HealthScoreCard;

