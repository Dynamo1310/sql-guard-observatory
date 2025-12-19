import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';
import { ScoreCircle } from './InstanceCard';
import { ScoreRadarChart } from './ScoreRadarChart';
import { SuggestedActions } from './SuggestedActions';
import { CategoryDetailCard } from './CategoryDetailCard';
import { CATEGORIES, getStatusColor, getStatusBgColor, getAmbientePriority } from './types';
import { 
  TrendingUp, Server, Clock, Database, Cpu, Wrench, RefreshCw
} from 'lucide-react';
import { formatDateUTC3 } from '@/lib/utils';

interface InstanceDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  score: HealthScoreV3Dto | null;
  details: HealthScoreV3DetailDto | null;
  isLoading: boolean;
  onRefresh?: () => void;
}

export function InstanceDetailSheet({
  isOpen,
  onClose,
  score,
  details,
  isLoading,
  onRefresh,
}: InstanceDetailSheetProps) {
  const navigate = useNavigate();

  if (!score) return null;

  const availabilityCategories = CATEGORIES.filter(c => c.group === 'availability');
  const performanceCategories = CATEGORIES.filter(c => c.group === 'performance');
  const maintenanceCategories = CATEGORIES.filter(c => c.group === 'maintenance');
  const isProd = getAmbientePriority(score.ambiente) === 0;

  const handleViewTrends = () => {
    navigate(`/instance-trends/${encodeURIComponent(score.instanceName)}`);
    onClose();
  };

  const getAmbienteBadge = () => {
    if (isProd) {
      return <Badge className="text-xs px-2 py-0.5 bg-rose-600 text-white border-0">PRODUCCIÓN</Badge>;
    }
    if (getAmbientePriority(score.ambiente) === 1) {
      return <Badge className="text-xs px-2 py-0.5 bg-violet-600 text-white border-0">TESTING</Badge>;
    }
    return <Badge variant="outline" className="text-xs px-2 py-0.5">{score.ambiente || 'DESARROLLO'}</Badge>;
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-xl md:max-w-2xl lg:max-w-3xl p-0 flex flex-col">
        {/* Header */}
        <SheetHeader className="p-4 pb-0 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Server className="h-5 w-5 text-muted-foreground" />
                <SheetTitle className="font-mono text-lg truncate">
                  {score.instanceName}
                </SheetTitle>
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {getAmbienteBadge()}
                <Badge variant="outline" className="text-xs">
                  {score.hostingSite || 'N/A'}
                </Badge>
                {score.sqlVersion && (
                  <Badge variant="outline" className="text-xs flex items-center gap-1">
                    <Database className="h-3 w-3" />
                    {score.sqlVersion}
                  </Badge>
                )}
              </div>
            </div>
            
            {/* Score Circle */}
            <div className="flex flex-col items-center gap-1">
              <ScoreCircle score={score.healthScore} size="lg" />
              <Badge 
                variant="outline" 
                className={cn(
                  'text-xs font-semibold',
                  getStatusBgColor(score.healthStatus),
                  getStatusColor(score.healthStatus)
                )}
              >
                {score.healthStatus}
              </Badge>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-4">
            <Button onClick={handleViewTrends} variant="default" size="sm" className="flex-1">
              <TrendingUp className="h-4 w-4 mr-2" />
              Ver Tendencias
            </Button>
            {onRefresh && (
              <Button onClick={onRefresh} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
            )}
          </div>

          {/* Last update */}
          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
            <Clock className="h-3 w-3" />
            Actualizado: {formatDateUTC3(score.generatedAtUtc)}
          </div>
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1 px-4">
          <div className="py-4 space-y-6">
            {/* Radar Chart */}
            <div className="bg-card rounded-lg border p-4">
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Distribución de Score
              </h3>
              <ScoreRadarChart score={score} />
            </div>

            {/* Suggested Actions */}
            {details && (
              <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-4">
                <SuggestedActions details={details} maxItems={5} />
              </div>
            )}

            {/* Category Details Tabs */}
            <Tabs defaultValue="availability" className="w-full">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="availability" className="text-xs">
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                  Availability
                </TabsTrigger>
                <TabsTrigger value="performance" className="text-xs">
                  <Cpu className="h-3.5 w-3.5 mr-1.5" />
                  Performance
                </TabsTrigger>
                <TabsTrigger value="maintenance" className="text-xs">
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />
                  Maintenance
                </TabsTrigger>
              </TabsList>

              <TabsContent value="availability" className="mt-0">
                {isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {availabilityCategories.map(cat => (
                      <CategoryDetailCard key={cat.key} category={cat} score={score} details={details ?? undefined} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="performance" className="mt-0">
                {isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {performanceCategories.map(cat => (
                      <CategoryDetailCard key={cat.key} category={cat} score={score} details={details ?? undefined} />
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="maintenance" className="mt-0">
                {isLoading ? (
                  <LoadingState />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {maintenanceCategories.map(cat => (
                      <CategoryDetailCard key={cat.key} category={cat} score={score} details={details ?? undefined} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            {/* TempDB IO Diagnosis */}
            {score.tempDBIODiagnosis && (
              <div className={cn(
                'rounded-lg border p-3',
                score.tempDBIOSeverity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' :
                score.tempDBIOSeverity === 'HIGH' ? 'bg-orange-500/10 border-orange-500/30' :
                score.tempDBIOSeverity === 'MEDIUM' ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-blue-500/10 border-blue-500/30'
              )}>
                <h4 className="text-xs font-semibold mb-1">Diagnóstico TempDB I/O</h4>
                <p className="text-xs text-muted-foreground">{score.tempDBIODiagnosis}</p>
                {score.tempDBIOSuggestion && (
                  <p className="text-xs mt-1 font-medium">{score.tempDBIOSuggestion}</p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-8">
      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Cargando detalles...</span>
    </div>
  );
}
