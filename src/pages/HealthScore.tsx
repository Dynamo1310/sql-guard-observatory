/**
 * Página de HealthScore - Monitoreo de instancias SQL Server
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { healthScoreV3Api, HealthScoreV3Dto } from '@/services/api';
import { useHealthScoreNotifications } from '@/hooks/useSignalRNotifications';
import { useSignalR } from '@/contexts/SignalRContext';
import { useToast } from '@/hooks/use-toast';

// UI Components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  Activity, RefreshCw, Server, Search, CheckCircle2, 
  AlertTriangle, AlertCircle, TrendingUp, Wifi, WifiOff,
  ChevronRight, Database, Shield, Cpu, HardDrive, Zap,
  Wrench, Clock, ExternalLink, MemoryStick
} from 'lucide-react';

// Las 8 categorias activas del Health Score V3
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

// Group categories by group name
const groupedCategories = {
  'Disponibilidad (40%)': CATEGORIES.filter(c => c.group === 'Disponibilidad'),
  'Rendimiento (54%)': CATEGORIES.filter(c => c.group === 'Rendimiento'),
  'Mantenimiento (6%)': CATEGORIES.filter(c => c.group === 'Mantenimiento'),
};

export default function HealthScore() {
  // Data state
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  
  // SignalR
  const { connectionState } = useSignalR();
  const [isUpdating, setIsUpdating] = useState(false);

  // Filter state
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Expanded instances
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(new Set());

  // Fetch health scores
  const fetchHealthScores = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
    } catch (error) {
      console.error('Error al cargar health scores:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los health scores',
        variant: 'destructive',
      });
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [toast]);

  // SignalR update handler
  const handleHealthScoreUpdate = useCallback((data: any) => {
    if (data.collectorName === 'Consolidate' && !isUpdating) {
      setIsUpdating(true);
      setTimeout(async () => {
        await fetchHealthScores(false);
        setIsUpdating(false);
      }, 2000);
    }
  }, [fetchHealthScores, isUpdating]);

  useHealthScoreNotifications(handleHealthScoreUpdate);

  // Initial fetch
  useEffect(() => {
    fetchHealthScores();
  }, [fetchHealthScores]);

  // Unique environments
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return unique.sort();
  }, [healthScores]);

  // Filtered instances
  const filteredScores = useMemo(() => {
    return healthScores.filter(score => {
      if (filterStatus !== 'all' && score.healthStatus !== filterStatus) return false;
      if (filterAmbiente !== 'all' && score.ambiente !== filterAmbiente) return false;
      if (searchQuery && !score.instanceName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    }).sort((a, b) => a.healthScore - b.healthScore);
  }, [healthScores, filterStatus, filterAmbiente, searchQuery]);

  // Stats
  const stats = useMemo(() => {
    const total = healthScores.length;
    const healthy = healthScores.filter(s => s.healthStatus === 'Healthy').length;
    const warning = healthScores.filter(s => s.healthStatus === 'Warning').length;
    const risk = healthScores.filter(s => s.healthStatus === 'Risk').length;
    const critical = healthScores.filter(s => s.healthStatus === 'Critical').length;
    const avgScore = total > 0 ? Math.round(healthScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;
    return { total, healthy, warning, risk, critical, avgScore };
  }, [healthScores]);

  // Toggle expanded instance
  const toggleExpanded = (instanceName: string) => {
    setExpandedInstances(prev => {
      const next = new Set(prev);
      if (next.has(instanceName)) {
        next.delete(instanceName);
      } else {
        next.add(instanceName);
      }
      return next;
    });
  };

  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-emerald-500';
    if (score >= 75) return 'text-warning';
    if (score >= 60) return 'text-orange-500';
    return 'text-red-500';
  };

  // Get bar color
  const getBarColor = (score: number) => {
    if (score >= 90) return 'bg-emerald-500';
    if (score >= 75) return 'bg-warning';
    if (score >= 60) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Get category score
  const getCategoryScore = (instance: HealthScoreV3Dto, key: string): number | undefined => {
    return instance[key as keyof HealthScoreV3Dto] as number | undefined;
  };

  // Get worst categories for preview
  const getWorstCategories = (instance: HealthScoreV3Dto) => {
    return CATEGORIES
      .map(cat => ({ ...cat, score: getCategoryScore(instance, cat.key) }))
      .filter(cat => cat.score !== undefined)
      .sort((a, b) => (a.score ?? 100) - (b.score ?? 100))
      .slice(0, 2);
  };

  // Loading State
  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-5 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        {/* Stats cards skeleton */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        
        {/* Filters skeleton */}
        <div className="flex gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        
        {/* Instance cards skeleton */}
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(9)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-8 w-8" />
            HealthScore
          </h1>
          <p className="text-muted-foreground">
            Monitoreo de instancias SQL Server
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <Badge variant="outline" className={cn(
            "gap-1",
            connectionState === 'Connected' ? 'text-emerald-500 border-emerald-500/30' : 'text-muted-foreground'
          )}>
            {connectionState === 'Connected' ? (
              <><Wifi className="h-3 w-3" /> Conectado</>
            ) : (
              <><WifiOff className="h-3 w-3" /> Desconectado</>
            )}
          </Badge>
          <Button
            variant="outline"
            onClick={() => fetchHealthScores()}
            disabled={isUpdating}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isUpdating && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score Promedio</CardTitle>
            <TrendingUp className={`h-4 w-4 ${getScoreColor(stats.avgScore)}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getScoreColor(stats.avgScore)}`}>
              {stats.avgScore}
            </div>
            <p className="text-xs text-muted-foreground">
              de 100 puntos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Instancias</CardTitle>
            <Server className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              monitoreadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.healthy}</div>
            <p className="text-xs text-muted-foreground">
              score ≥ 90
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warning</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.warning}</div>
            <p className="text-xs text-muted-foreground">
              score 75-89
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.risk}</div>
            <p className="text-xs text-muted-foreground">
              score 60-74
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.critical}</div>
            <p className="text-xs text-muted-foreground">
              score &lt; 60
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar instancia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Healthy">Healthy</SelectItem>
            <SelectItem value="Warning">Warning</SelectItem>
            <SelectItem value="Risk">Risk</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Ambiente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {ambientes.map(amb => (
              <SelectItem key={amb} value={amb!}>{amb}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        {filteredScores.length === healthScores.length 
          ? `${healthScores.length} instancias`
          : `${filteredScores.length} de ${healthScores.length} instancias`
        }
      </div>

      {/* Instance Cards Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredScores.length > 0 ? (
          filteredScores.map((instance) => {
            const isExpanded = expandedInstances.has(instance.instanceName);
            const worstCategories = getWorstCategories(instance);
            
            return (
              <Collapsible 
                key={instance.instanceName} 
                open={isExpanded} 
                onOpenChange={() => toggleExpanded(instance.instanceName)}
              >
                <Card className={cn(
                  'transition-shadow',
                  isExpanded && 'shadow-md'
                )}>
                  {/* Header - Always visible */}
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/50 rounded-t-lg">
                      {/* Score Circle */}
                      <div className={cn(
                        'text-2xl font-bold tabular-nums w-14 h-14 rounded-full flex items-center justify-center',
                        'border-2',
                        instance.healthScore >= 90 && 'border-emerald-500/30 text-emerald-500',
                        instance.healthScore >= 75 && instance.healthScore < 90 && 'border-warning/30 text-warning',
                        instance.healthScore >= 60 && instance.healthScore < 75 && 'border-orange-500/30 text-orange-500',
                        instance.healthScore < 60 && 'border-red-500/30 text-red-500',
                      )}>
                        {instance.healthScore}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{instance.instanceName}</span>
                          <Badge variant="outline" className="text-xs">
                            {instance.ambiente || 'N/A'}
                          </Badge>
                        </div>
                        {!isExpanded && worstCategories.length > 0 && (
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            {worstCategories.map(cat => (
                              <span key={cat.key} className={cn(
                                cat.score !== undefined && cat.score < 60 && 'text-red-500',
                                cat.score !== undefined && cat.score >= 60 && cat.score < 75 && 'text-orange-500',
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
                        'h-5 w-5 text-muted-foreground transition-transform shrink-0',
                        isExpanded && 'rotate-90'
                      )} />
                    </button>
                  </CollapsibleTrigger>

                  {/* Expanded Content */}
                  <CollapsibleContent>
                    <div className="border-t px-4 pb-4 pt-3 space-y-4">
                      {/* Category Groups */}
                      {Object.entries(groupedCategories).map(([groupName, categories]) => (
                        <div key={groupName}>
                          <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                            {groupName}
                          </h4>
                          <div className="space-y-2">
                            {categories.map(cat => {
                              const score = getCategoryScore(instance, cat.key);
                              if (score === undefined) return null;
                              const Icon = cat.icon;
                              
                              return (
                                <div key={cat.key} className="flex items-center gap-3">
                                  <Icon className={cn('h-3.5 w-3.5 shrink-0', getScoreColor(score))} />
                                  <span className="text-sm w-28 truncate">{cat.label}</span>
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div 
                                      className={cn('h-full rounded-full transition-all', getBarColor(score))}
                                      style={{ width: `${score}%` }}
                                    />
                                  </div>
                                  <span className={cn('text-sm tabular-nums w-8 text-right font-medium', getScoreColor(score))}>
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
                          {instance.sqlVersion || 'N/A'} • {instance.hostingSite || 'N/A'}
                        </span>
                        <Link 
                          to={`/instance-trends/${encodeURIComponent(instance.instanceName)}`}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          Ver tendencias
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardContent className="text-center py-12">
              <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No hay instancias</h3>
              <p className="text-muted-foreground">
                No se encontraron instancias con los filtros seleccionados.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
