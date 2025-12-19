import { useState, useEffect, useMemo, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { healthScoreV3Api, HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';
import { useHealthScoreNotifications } from '@/hooks/useSignalRNotifications';
import { useToast } from '@/hooks/use-toast';

// Components
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  LiveIndicator,
  QuickStatsBar,
  PriorityAlerts,
  InstanceGrid,
  InstanceTable,
  InstanceDetailSheet,
  HelpDialog,
  generatePriorityAlerts,
} from '@/components/healthscore';
import type { HealthScoreStats, ViewMode, PriorityAlert } from '@/components/healthscore/types';

// Icons
import { LayoutGrid, List, Search, Filter, X, RefreshCw, Activity } from 'lucide-react';

export default function HealthScore() {
  // Data state
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [instanceDetails, setInstanceDetails] = useState<Record<string, HealthScoreV3DetailDto>>({});
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('All');
  const [filterHosting, setFilterHosting] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Detail sheet state
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [updatingInstances, setUpdatingInstances] = useState<Set<string>>(new Set());
  
  // SignalR update tracking
  const [isUpdating, setIsUpdating] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch all health scores
  const fetchHealthScores = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setLoading(true);
    try {
      const data = await healthScoreV3Api.getAllHealthScores();
      setHealthScores(data);
      setLastUpdate(new Date());
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

  // Load instance details
  const loadInstanceDetails = useCallback(async (instanceName: string, showLoading: boolean = true) => {
    if (showLoading) {
      setLoadingDetails(prev => ({ ...prev, [instanceName]: true }));
    }
    try {
      const details = await healthScoreV3Api.getHealthScoreDetails(instanceName);
      setInstanceDetails(prev => ({ ...prev, [instanceName]: details }));
      return details;
    } catch (error) {
      console.error('Error al cargar detalles:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los detalles de la instancia',
        variant: 'destructive',
      });
      return null;
    } finally {
      if (showLoading) {
        setLoadingDetails(prev => ({ ...prev, [instanceName]: false }));
      }
    }
  }, [toast]);

  // Handle SignalR updates
  const handleHealthScoreUpdate = useCallback(async (data: any) => {
    if (data.collectorName === 'Consolidate' && !isUpdating) {
      setIsUpdating(true);
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await fetchHealthScores(false);
        if (selectedInstance) {
          await loadInstanceDetails(selectedInstance, false);
        }
      } finally {
        setIsUpdating(false);
      }
    }
  }, [fetchHealthScores, selectedInstance, loadInstanceDetails, isUpdating]);

  useHealthScoreNotifications(handleHealthScoreUpdate);

  // Initial fetch
  useEffect(() => {
    fetchHealthScores();
  }, [fetchHealthScores]);

  // Load details for priority alerts (only critical/risk instances)
  useEffect(() => {
    const loadPriorityDetails = async () => {
      const priorityInstances = healthScores
        .filter(s => s.healthStatus === 'Critical' || s.healthStatus === 'Risk')
        .slice(0, 10);
      
      for (const instance of priorityInstances) {
        if (!instanceDetails[instance.instanceName]) {
          await loadInstanceDetails(instance.instanceName, false);
        }
      }
    };
    
    if (healthScores.length > 0) {
      loadPriorityDetails();
    }
  }, [healthScores, instanceDetails, loadInstanceDetails]);

  // Filter options
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return ['All', ...unique.sort()];
  }, [healthScores]);

  const hostings = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.hostingSite).filter(Boolean))];
    return ['All', ...unique.sort()];
  }, [healthScores]);

  // Filtered data
  const filteredScores = useMemo(() => {
    return healthScores.filter(score => {
      if (filterStatus !== 'All' && score.healthStatus !== filterStatus) return false;
      if (filterAmbiente !== 'All' && score.ambiente !== filterAmbiente) return false;
      if (filterHosting !== 'All' && score.hostingSite !== filterHosting) return false;
      if (searchQuery && !score.instanceName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [healthScores, filterStatus, filterAmbiente, filterHosting, searchQuery]);

  // Stats
  const stats: HealthScoreStats = useMemo(() => {
    const data = filterStatus === 'All' ? healthScores : filteredScores;
    const total = data.length;
    const healthy = data.filter(s => s.healthStatus === 'Healthy').length;
    const warning = data.filter(s => s.healthStatus === 'Warning').length;
    const risk = data.filter(s => s.healthStatus === 'Risk').length;
    const critical = data.filter(s => s.healthStatus === 'Critical').length;
    const avgScore = total > 0 ? Math.round(data.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;
    return { total, healthy, warning, risk, critical, avgScore };
  }, [healthScores, filteredScores, filterStatus]);

  // Priority alerts with ambiente info
  const priorityAlerts: PriorityAlert[] = useMemo(() => {
    const criticalInstances = healthScores
      .filter(s => s.healthStatus === 'Critical' || s.healthStatus === 'Risk')
      .map(score => ({
        score: { 
          instanceName: score.instanceName, 
          healthScore: score.healthScore, 
          healthStatus: score.healthStatus,
          ambiente: score.ambiente 
        },
        details: instanceDetails[score.instanceName],
      }));
    
    return generatePriorityAlerts(criticalInstances);
  }, [healthScores, instanceDetails]);

  // Handle instance selection
  const handleInstanceClick = async (instanceName: string) => {
    setSelectedInstance(instanceName);
    if (!instanceDetails[instanceName]) {
      await loadInstanceDetails(instanceName);
    }
  };

  const handleSheetClose = () => {
    setSelectedInstance(null);
  };

  const handleRefreshDetails = async () => {
    if (selectedInstance) {
      await loadInstanceDetails(selectedInstance);
    }
  };

  const selectedScore = selectedInstance 
    ? healthScores.find(s => s.instanceName === selectedInstance) ?? null
    : null;
  const selectedDetails = selectedInstance ? instanceDetails[selectedInstance] ?? null : null;
  const isLoadingDetails = selectedInstance ? loadingDetails[selectedInstance] ?? false : false;

  const clearFilters = () => {
    setFilterStatus('All');
    setFilterAmbiente('All');
    setFilterHosting('All');
    setSearchQuery('');
  };

  const hasActiveFilters = filterStatus !== 'All' || filterAmbiente !== 'All' || filterHosting !== 'All' || searchQuery !== '';

  // Loading State
  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Activity className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">HealthScore</h1>
        </div>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Cargando datos...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Activity className="h-7 w-7 text-primary" />
            <h1 className="text-2xl sm:text-3xl font-bold">HealthScore</h1>
            <LiveIndicator />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Estado de salud de las instancias SQL Server
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <HelpDialog />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchHealthScores()}
            disabled={isUpdating}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isUpdating && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </header>

      {/* Quick Stats Bar */}
      <QuickStatsBar
        stats={stats}
        activeFilter={filterStatus}
        onFilterChange={setFilterStatus}
      />

      {/* Priority Alerts */}
      {priorityAlerts.length > 0 && (
        <PriorityAlerts
          alerts={priorityAlerts}
          onAlertClick={handleInstanceClick}
          maxVisible={6}
        />
      )}

      {/* Filters Card */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar instancia..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          
          {/* Mobile filter toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filtros
            {hasActiveFilters && (
              <span className="ml-2 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>

          {/* Filters */}
          <div className={cn(
            'flex flex-col sm:flex-row gap-2',
            !showFilters && 'hidden sm:flex'
          )}>
            <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                {ambientes.map(amb => (
                  <SelectItem key={amb} value={amb}>
                    {amb === 'All' ? 'Todos' : amb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterHosting} onValueChange={setFilterHosting}>
              <SelectTrigger className="w-full sm:w-[140px]">
                <SelectValue placeholder="Hosting" />
              </SelectTrigger>
              <SelectContent>
                {hostings.map(host => (
                  <SelectItem key={host} value={host}>
                    {host === 'All' ? 'Todos' : host}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex items-center border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Mostrando {filteredScores.length} de {healthScores.length} instancias
        </span>
        {lastUpdate && (
          <span className="text-xs">
            Última actualización: {lastUpdate.toLocaleTimeString('es-AR')}
          </span>
        )}
      </div>

      {/* Main Content */}
      {viewMode === 'grid' ? (
        <InstanceGrid
          instances={filteredScores}
          onInstanceClick={handleInstanceClick}
          updatingInstances={updatingInstances}
        />
      ) : (
        <InstanceTable
          instances={filteredScores}
          onInstanceClick={handleInstanceClick}
          updatingInstances={updatingInstances}
        />
      )}

      {/* Empty state */}
      {filteredScores.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Search className="h-12 w-12 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-lg font-medium">No se encontraron instancias</p>
            <p className="text-sm text-muted-foreground mt-1">Prueba ajustando los filtros de búsqueda</p>
          </div>
          {hasActiveFilters && (
            <Button variant="outline" onClick={clearFilters}>
              Limpiar filtros
            </Button>
          )}
        </div>
      )}

      {/* Detail Sheet */}
      <InstanceDetailSheet
        isOpen={selectedInstance !== null}
        onClose={handleSheetClose}
        score={selectedScore}
        details={selectedDetails}
        isLoading={isLoadingDetails}
        onRefresh={handleRefreshDetails}
      />
    </div>
  );
}
