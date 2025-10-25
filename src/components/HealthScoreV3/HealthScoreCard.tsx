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

const categories: Record<string, CategoryInfo> = {
  backups: {
    name: 'Backups (RPO/RTO)',
    icon: '🗄️',
    weight: 18,
    color: 'text-blue-600',
  },
  alwaysOn: {
    name: 'AlwaysOn (AG)',
    icon: '♻️',
    weight: 14,
    color: 'text-green-600',
  },
  conectividad: {
    name: 'Conectividad',
    icon: '🌐',
    weight: 10,
    color: 'text-purple-600',
  },
  erroresCriticos: {
    name: 'Errores Críticos',
    icon: '🚨',
    weight: 7,
    color: 'text-red-600',
  },
  cpu: {
    name: 'CPU',
    icon: '⚙️',
    weight: 10,
    color: 'text-orange-600',
  },
  io: {
    name: 'IO (Latencia/IOPS)',
    icon: '💽',
    weight: 10,
    color: 'text-indigo-600',
  },
  discos: {
    name: 'Espacio en Discos',
    icon: '🧱',
    weight: 8,
    color: 'text-yellow-600',
  },
  memoria: {
    name: 'Memoria (PLE/Grants)',
    icon: '🧠',
    weight: 7,
    color: 'text-pink-600',
  },
  mantenimientos: {
    name: 'Mantenimientos',
    icon: '🧹',
    weight: 6,
    color: 'text-teal-600',
  },
  configuracion: {
    name: 'Configuración & TempDB',
    icon: '🧩',
    weight: 10,
    color: 'text-cyan-600',
  },
};

const HealthScoreCard: React.FC<HealthScoreCardProps> = ({ score, onClick }) => {
  const statusColor = healthScoreV3Service.getHealthStatusColor(score.healthScore);
  const statusEmoji = healthScoreV3Service.getHealthStatusEmoji(score.healthScore);
  const statusLabel = healthScoreV3Service.getHealthStatusLabel(score.healthScore);

  const getScoreColor = (value: number): string => {
    if (value >= 85) return 'bg-green-500';
    if (value >= 75) return 'bg-yellow-500';
    if (value >= 65) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const categoryScores = [
    { key: 'backups', value: score.backupsScore },
    { key: 'alwaysOn', value: score.alwaysOnScore },
    { key: 'conectividad', value: score.conectividadScore },
    { key: 'erroresCriticos', value: score.erroresCriticosScore },
    { key: 'cpu', value: score.cpuScore },
    { key: 'io', value: score.ioScore },
    { key: 'discos', value: score.discosScore },
    { key: 'memoria', value: score.memoriaScore },
    { key: 'mantenimientos', value: score.mantenimientosScore },
    { key: 'configuracion', value: score.configuracionTempdbScore },
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
                  ? 'bg-green-100 text-green-800'
                  : statusColor === 'yellow'
                  ? 'bg-yellow-100 text-yellow-800'
                  : statusColor === 'orange'
                  ? 'bg-orange-100 text-orange-800'
                  : 'bg-red-100 text-red-800'
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

