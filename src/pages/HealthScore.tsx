import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight, HardDrive, Database, AlertCircle, Info, TrendingUp, Shield, Server, Wrench, Cpu, Zap, MemoryStick, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, formatDateUTC3 } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreV3Api, HealthScoreV3Dto, HealthScoreV3DetailDto } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function HealthScore() {
  const navigate = useNavigate();
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [instanceDetails, setInstanceDetails] = useState<Record<string, HealthScoreV3DetailDto>>({});
  const [loadingDetails, setLoadingDetails] = useState<Record<string, boolean>>({});
  const [showExplanation, setShowExplanation] = useState(false);
  
  // Filtros
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [filterAmbiente, setFilterAmbiente] = useState<string>('All');
  const [filterHosting, setFilterHosting] = useState<string>('All');

  const { sortedData, requestSort, getSortIndicator } = useTableSort(healthScores);

  useEffect(() => {
    fetchHealthScores();
  }, []);

  const fetchHealthScores = async () => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  // Opciones de filtros
  const ambientes = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.ambiente).filter(Boolean))];
    return ['All', ...unique.sort()];
  }, [healthScores]);

  const hostings = useMemo(() => {
    const unique = [...new Set(healthScores.map(h => h.hostingSite).filter(Boolean))];
    return ['All', ...unique.sort()];
  }, [healthScores]);

  // Aplicar filtros
  const filteredScores = useMemo(() => {
    return sortedData.filter(score => {
      if (filterStatus !== 'All' && score.healthStatus !== filterStatus) return false;
      if (filterAmbiente !== 'All' && score.ambiente !== filterAmbiente) return false;
      if (filterHosting !== 'All' && score.hostingSite !== filterHosting) return false;
      return true;
    });
  }, [sortedData, filterStatus, filterAmbiente, filterHosting]);

  // Estadísticas
  const stats = useMemo(() => {
    const total = filteredScores.length;
    const healthy = filteredScores.filter(s => s.healthStatus === 'Healthy').length;
    const warning = filteredScores.filter(s => s.healthStatus === 'Warning').length;
    const risk = filteredScores.filter(s => s.healthStatus === 'Risk').length;
    const critical = filteredScores.filter(s => s.healthStatus === 'Critical').length;
    const avgScore = total > 0 ? Math.round(filteredScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;

    return { total, healthy, warning, risk, critical, avgScore };
  }, [filteredScores]);

  const toggleRow = async (instanceName: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(instanceName)) {
      newExpanded.delete(instanceName);
    } else {
      newExpanded.add(instanceName);
      // Cargar detalles si no los tenemos aún
      if (!instanceDetails[instanceName] && !loadingDetails[instanceName]) {
        setLoadingDetails(prev => ({ ...prev, [instanceName]: true }));
        try {
          const details = await healthScoreV3Api.getHealthScoreDetails(instanceName);
          setInstanceDetails(prev => ({ ...prev, [instanceName]: details }));
        } catch (error) {
          console.error('Error al cargar detalles:', error);
          toast({
            title: 'Error',
            description: 'No se pudieron cargar los detalles de la instancia',
            variant: 'destructive',
          });
        } finally {
          setLoadingDetails(prev => ({ ...prev, [instanceName]: false }));
        }
      }
    }
    setExpandedRows(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Healthy': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'Warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'Risk': return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'Critical': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'Healthy': 'bg-green-600/20 text-green-700 border-green-600/40 font-semibold',
      'Warning': 'bg-amber-500/20 text-amber-600 border-amber-500/40 font-semibold',
      'Risk': 'bg-orange-600/20 text-orange-700 border-orange-600/40 font-semibold',
      'Critical': 'bg-red-600/20 text-red-700 border-red-600/40 font-semibold',
    };

    return (
      <Badge variant="outline" className={cn('font-medium', variants[status] || '')}>
        {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-3xl font-bold">HealthScore</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">HealthScore</h1>
        <p className="text-sm sm:text-base text-muted-foreground mt-1">
          Estado de salud de las instancias SQL Server
        </p>
      </div>

      {/* Explicación del Cálculo */}
      <Collapsible open={showExplanation} onOpenChange={setShowExplanation}>
        <Card className="gradient-card shadow-card border-blue-500/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-base sm:text-lg">¿Cómo se calcula el HealthScore?</CardTitle>
                </div>
                {showExplanation ? (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4">
              <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">
                  Health Score v3.0 - Metodología de Evaluación
                </p>
                <p className="text-sm text-muted-foreground">
                  Métrica de <span className="font-bold text-foreground">0 a 100 puntos</span> que evalúa la salud de instancias SQL Server mediante 
                  análisis de <span className="font-bold">12 categorías ponderadas</span> de disponibilidad, continuidad, rendimiento y configuración.
                </p>
              </div>

              {/* Umbrales de estado */}
              <Card className="bg-gradient-to-r from-green-500/5 via-yellow-500/5 via-orange-500/5 to-red-500/5 border-dashed">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3">Health Status Levels</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-green-600/20 border-2 border-green-600/40 rounded-lg p-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-green-600">HEALTHY</p>
                      <p className="text-center text-lg font-mono font-bold text-green-600">90-100 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Optimal performance</p>
                    </div>
                    <div className="bg-amber-500/20 border-2 border-amber-500/40 rounded-lg p-3">
                      <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-amber-500">WARNING</p>
                      <p className="text-center text-lg font-mono font-bold text-amber-500">75-89 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Requires attention</p>
                    </div>
                    <div className="bg-orange-600/20 border-2 border-orange-600/40 rounded-lg p-3">
                      <AlertCircle className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-orange-600">RISK</p>
                      <p className="text-center text-lg font-mono font-bold text-orange-600">60-74 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Action required</p>
                    </div>
                    <div className="bg-red-600/20 border-2 border-red-600/40 rounded-lg p-3">
                      <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-red-600">CRITICAL</p>
                      <p className="text-center text-lg font-mono font-bold text-red-600">{'<'}60 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Immediate action</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Categorías explicadas */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">12 Weighted Categories</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Each category contributes to the total score based on operational impact. Scores are on a 0-100 scale per category.
                </p>
              </div>

              {/* Grid de 12 categorías */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* TAB 1: AVAILABILITY & DR (40%) */}
                
                {/* 1. Backups */}
                <Card className="bg-green-500/5 border-green-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-green-500" />
                      <span className="font-semibold text-sm">1. Backups (RPO/RTO)</span>
                      <Badge variant="outline" className="ml-auto bg-green-500/10 text-green-700 border-green-500/30">18%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">FULL within SLA, LOG chain integrity</p>
                  </CardContent>
                </Card>

                {/* 2. AlwaysOn */}
                <Card className="bg-purple-500/5 border-purple-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      <span className="font-semibold text-sm">2. AlwaysOn (AG)</span>
                      <Badge variant="outline" className="ml-auto bg-purple-500/10 text-purple-700 border-purple-500/30">14%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Synchronization state, queue sizes, lag</p>
                  </CardContent>
                </Card>

                {/* 3. Log Chain */}
                <Card className="bg-amber-500/5 border-amber-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="font-semibold text-sm">3. Log Chain Integrity</span>
                      <Badge variant="outline" className="ml-auto bg-amber-500/10 text-amber-700 border-amber-500/30">5%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Log backup chain, time since last log, PITR readiness</p>
                  </CardContent>
                </Card>

                {/* 4. Database States */}
                <Card className="bg-rose-500/5 border-rose-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                      <span className="font-semibold text-sm">4. Database States</span>
                      <Badge variant="outline" className="ml-auto bg-rose-500/10 text-rose-700 border-rose-500/30">3%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Offline/Suspect/Emergency, suspect pages</p>
                  </CardContent>
                </Card>

                {/* TAB 2: PERFORMANCE (35%) */}
                
                {/* 5. CPU */}
                <Card className="bg-orange-500/5 border-orange-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold text-sm">5. CPU</span>
                      <Badge variant="outline" className="ml-auto bg-orange-500/10 text-orange-700 border-orange-500/30">10%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">p95 utilization, runnable tasks</p>
                  </CardContent>
                </Card>

                {/* 6. Memoria */}
                <Card className="bg-pink-500/5 border-pink-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MemoryStick className="h-4 w-4 text-pink-500" />
                      <span className="font-semibold text-sm">6. Memory (PLE + Grants)</span>
                      <Badge variant="outline" className="ml-auto bg-pink-500/10 text-pink-700 border-pink-500/30">8%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Page Life Expectancy, memory grants, pressure</p>
                  </CardContent>
                </Card>

                {/* 7. I/O */}
                <Card className="bg-cyan-500/5 border-cyan-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-cyan-500" />
                      <span className="font-semibold text-sm">7. I/O (Latency / IOPS)</span>
                      <Badge variant="outline" className="ml-auto bg-cyan-500/10 text-cyan-700 border-cyan-500/30">10%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Data/Log file latency, IOPS performance</p>
                  </CardContent>
                </Card>

                {/* 8. Discos */}
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold text-sm">8. Disk Space</span>
                      <Badge variant="outline" className="ml-auto bg-yellow-500/10 text-yellow-700 border-yellow-500/30">7%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Free space % weighted by role (Data/Log/Backup)</p>
                  </CardContent>
                </Card>

                {/* TAB 3: MAINTENANCE & CONFIG (25%) */}
                
                {/* 9. Errores Críticos */}
                <Card className="bg-red-500/5 border-red-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="font-semibold text-sm">9. Critical Errors (sev≥20)</span>
                      <Badge variant="outline" className="ml-auto bg-red-500/10 text-red-700 border-red-500/30">7%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Severity 20+ events in last 24h</p>
                  </CardContent>
                </Card>

                {/* 10. Maintenance */}
                <Card className="bg-teal-500/5 border-teal-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="h-4 w-4 text-teal-500" />
                      <span className="font-semibold text-sm">10. Maintenance</span>
                      <Badge variant="outline" className="ml-auto bg-teal-500/10 text-teal-700 border-teal-500/30">5%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">CHECKDB, Index Optimize, Statistics updates</p>
                  </CardContent>
                </Card>

                {/* 11. Configuración & TempDB */}
                <Card className="bg-indigo-500/5 border-indigo-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-sm">11. Configuration & TempDB</span>
                      <Badge variant="outline" className="ml-auto bg-indigo-500/10 text-indigo-700 border-indigo-500/30">8%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">TempDB setup, max memory config, contention</p>
                  </CardContent>
                </Card>

                {/* 12. Autogrowth & Capacity */}
                <Card className="bg-lime-500/5 border-lime-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-lime-500" />
                      <span className="font-semibold text-sm">12. Autogrowth & Capacity</span>
                      <Badge variant="outline" className="ml-auto bg-lime-500/10 text-lime-700 border-lime-500/30">5%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Autogrowth events, files near maxsize, capacity planning</p>
                  </CardContent>
                </Card>
              </div>

              {/* Resumen visual */}
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3">Scoring Summary</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span>Each category scored 0-100</span>
                      <span className="font-mono text-muted-foreground">Individual scale</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Weighted average by importance</span>
                      <span className="font-mono text-muted-foreground">18% + 14% + 5% + 3% ...</span>
                    </div>
                    <div className="flex items-center justify-between bg-blue-500/10 p-2 rounded border border-blue-500/30 mt-3">
                      <span className="font-bold">Final Health Score (12 categories)</span>
                      <span className="font-mono text-lg font-bold text-blue-500">0-100 pts</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Estadísticas Resumidas */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="gradient-card shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Instances</p>
                <p className="text-2xl font-bold font-mono">{stats.total}</p>
              </div>
              <Server className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-green-600/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold font-mono text-green-600">{stats.healthy}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-amber-500/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Warning</p>
                <p className="text-2xl font-bold font-mono text-amber-500">{stats.warning}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-orange-600/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Risk</p>
                <p className="text-2xl font-bold font-mono text-orange-600">{stats.risk}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-red-600/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold font-mono text-red-600">{stats.critical}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Avg Score</p>
                <p className="text-2xl font-bold font-mono">{stats.avgScore}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="gradient-card shadow-card">
        <CardContent className="p-4">
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Healthy">Healthy</SelectItem>
                  <SelectItem value="Warning">Warning</SelectItem>
                  <SelectItem value="Risk">Risk</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Ambiente</label>
              <Select value={filterAmbiente} onValueChange={setFilterAmbiente}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ambientes.map(amb => (
                    <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-2 block">Hosting</label>
              <Select value={filterHosting} onValueChange={setFilterHosting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {hostings.map(host => (
                    <SelectItem key={host} value={host}>{host}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabla de Instancias */}
      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Instancias ({filteredScores.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('instanceName')}
                >
                  Instancia {getSortIndicator('instanceName')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('ambiente')}
                >
                  Ambiente {getSortIndicator('ambiente')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('hostingSite')}
                >
                  Hosting {getSortIndicator('hostingSite')}
                </TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent text-center"
                  onClick={() => requestSort('healthScore')}
                >
                  Score {getSortIndicator('healthScore')}
                </TableHead>
                <TableHead className="text-xs">Score Visual</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
                <TableHead className="text-xs text-right">
                  Última Actualización
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredScores.length > 0 ? (
                filteredScores.map((score) => (
                  <>
                    <TableRow key={score.instanceName} className="cursor-pointer hover:bg-accent/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleRow(score.instanceName)}
                        >
                          {expandedRows.has(score.instanceName) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2 font-medium">
                        {score.instanceName}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        {score.ambiente || '-'}
                      </TableCell>
                      <TableCell className="text-xs py-2">
                        <Badge variant="outline" className="text-xs">
                          {score.hostingSite || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn(
                          'font-mono text-sm font-bold',
                          score.healthScore >= 90 && 'text-green-600',
                          score.healthScore >= 75 && score.healthScore < 90 && 'text-amber-500',
                          score.healthScore >= 60 && score.healthScore < 75 && 'text-orange-600',
                          score.healthScore < 60 && 'text-red-600'
                        )}>
                          {score.healthScore}
                          <span className="text-xs text-muted-foreground">/100</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(score.healthScore / 100) * 100} 
                            className={cn(
                              'h-2 w-24',
                              score.healthScore >= 90 && '[&>div]:bg-green-600',
                              score.healthScore >= 75 && score.healthScore < 90 && '[&>div]:bg-amber-500',
                              score.healthScore >= 60 && score.healthScore < 75 && '[&>div]:bg-orange-600',
                              score.healthScore < 60 && '[&>div]:bg-red-600'
                            )}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(score.healthStatus)}
                          {getStatusBadge(score.healthStatus)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs py-2 text-muted-foreground">
                        {new Date(score.generatedAtUtc).toLocaleString('es-AR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </TableCell>
                    </TableRow>
                    
                    {/* Fila Expandida con Detalles */}
                    {expandedRows.has(score.instanceName) && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-accent/20 p-6">
                          {loadingDetails[score.instanceName] ? (
                            <div className="flex items-center justify-center py-8">
                              <div className="text-muted-foreground">Cargando detalles...</div>
                              </div>
                          ) : instanceDetails[score.instanceName] ? (
                          <div className="space-y-4">
                            {/* Header Compacto Inline */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <Server className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{instanceDetails[score.instanceName].sqlVersion || 'N/A'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Activity className="h-4 w-4 text-blue-600" />
                                  <span className="text-sm">Score: {score.healthScore}/100</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Actualizado: {formatDateUTC3(instanceDetails[score.instanceName].generatedAtUtc)}
                                </div>
                              </div>
                              <Button
                                onClick={() => navigate(`/instance-trends/${encodeURIComponent(score.instanceName)}`)}
                                className="flex items-center gap-2"
                                variant="outline"
                                size="sm"
                              >
                                <TrendingUp className="h-4 w-4" />
                                Ver Tendencias
                              </Button>
                            </div>

                            {/* Breakdown Compacto - 12 Categorías (4×3) */}
                            <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border rounded-lg p-2">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-semibold flex items-center gap-1.5">
                                  <Activity className="h-3 w-3" />
                                  Contribuciones por Categoría
                                </span>
                                <span className="text-lg font-mono font-bold">{score.healthScore}<span className="text-[10px] text-muted-foreground">/100</span></span>
                              </div>
                              <div className="grid grid-cols-4 gap-1">
                                {/* Fila 1: Availability & DR */}
                                <div className="bg-gradient-to-r from-green-500/10 to-green-500/5 border border-green-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Database className="h-3 w-3 text-green-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Backups</span>
                                  <span className="text-xs font-mono font-bold text-green-600 whitespace-nowrap">{score.backupsContribution || 0}<span className="text-[9px]">/18</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-purple-500/10 to-purple-500/5 border border-purple-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Shield className="h-3 w-3 text-purple-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">AlwaysOn</span>
                                  <span className="text-xs font-mono font-bold text-purple-600 whitespace-nowrap">{score.alwaysOnContribution || 0}<span className="text-[9px]">/14</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-amber-500/10 to-amber-500/5 border border-amber-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <AlertCircle className="h-3 w-3 text-amber-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">LogChain</span>
                                  <span className="text-xs font-mono font-bold text-amber-600 whitespace-nowrap">{score.logChainContribution || 0}<span className="text-[9px]">/5</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-rose-500/10 to-rose-500/5 border border-rose-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <AlertTriangle className="h-3 w-3 text-rose-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">DB States</span>
                                  <span className="text-xs font-mono font-bold text-rose-600 whitespace-nowrap">{score.databaseStatesContribution || 0}<span className="text-[9px]">/3</span></span>
                                </div>
                                
                                {/* Fila 2: Performance */}
                                <div className="bg-gradient-to-r from-orange-500/10 to-orange-500/5 border border-orange-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Cpu className="h-3 w-3 text-orange-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">CPU</span>
                                  <span className="text-xs font-mono font-bold text-orange-600 whitespace-nowrap">{score.cpuContribution || 0}<span className="text-[9px]">/10</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-pink-500/10 to-pink-500/5 border border-pink-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <MemoryStick className="h-3 w-3 text-pink-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Memory</span>
                                  <span className="text-xs font-mono font-bold text-pink-600 whitespace-nowrap">{score.memoriaContribution || 0}<span className="text-[9px]">/8</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-cyan-500/10 to-cyan-500/5 border border-cyan-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Zap className="h-3 w-3 text-cyan-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">I/O</span>
                                  <span className="text-xs font-mono font-bold text-cyan-600 whitespace-nowrap">{score.ioContribution || 0}<span className="text-[9px]">/10</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <HardDrive className="h-3 w-3 text-yellow-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Discos</span>
                                  <span className="text-xs font-mono font-bold text-yellow-600 whitespace-nowrap">{score.discosContribution || 0}<span className="text-[9px]">/7</span></span>
                                </div>
                                
                                {/* Fila 3: Maintenance & Config */}
                                <div className="bg-gradient-to-r from-red-500/10 to-red-500/5 border border-red-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <XCircle className="h-3 w-3 text-red-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Errores</span>
                                  <span className="text-xs font-mono font-bold text-red-600 whitespace-nowrap">{score.erroresCriticosContribution || 0}<span className="text-[9px]">/7</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-teal-500/10 to-teal-500/5 border border-teal-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Wrench className="h-3 w-3 text-teal-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Mant</span>
                                  <span className="text-xs font-mono font-bold text-teal-600 whitespace-nowrap">{score.mantenimientosContribution || 0}<span className="text-[9px]">/5</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-indigo-500/10 to-indigo-500/5 border border-indigo-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <Settings className="h-3 w-3 text-indigo-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Config</span>
                                  <span className="text-xs font-mono font-bold text-indigo-600 whitespace-nowrap">{score.configuracionTempdbContribution || 0}<span className="text-[9px]">/8</span></span>
                                </div>
                                <div className="bg-gradient-to-r from-lime-500/10 to-lime-500/5 border border-lime-500/30 rounded px-2 py-1 flex items-center gap-1.5">
                                  <TrendingUp className="h-3 w-3 text-lime-600 flex-shrink-0" />
                                  <span className="text-[10px] text-muted-foreground truncate flex-1">Autogrowth</span>
                                  <span className="text-xs font-mono font-bold text-lime-600 whitespace-nowrap">{score.autogrowthContribution || 0}<span className="text-[9px]">/5</span></span>
                                </div>
                              </div>
                            </div>

                            {/* Tabs para organizar detalles */}
                            <Tabs defaultValue="availability" className="w-full">
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="availability" className="text-xs sm:text-sm">
                                  <Database className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                  Availability
                                </TabsTrigger>
                                <TabsTrigger value="performance" className="text-xs sm:text-sm">
                                  <Cpu className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                  Performance
                                </TabsTrigger>
                                <TabsTrigger value="errors" className="text-xs sm:text-sm">
                                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                                  Errors & Config
                                </TabsTrigger>
                              </TabsList>

                              {/* Tab 1: Availability & DR */}
                              <TabsContent value="availability" className="mt-3">
                                {/* Acciones Sugeridas */}
                                {(() => {
                                  const suggestions: string[] = [];
                                  const details = instanceDetails[score.instanceName];
                                  
                                  // Backups inteligentes
                                  if (details.backupsDetails?.fullBackupBreached && details.backupsDetails?.lastFullBackup) {
                                    const hoursSince = Math.floor((new Date().getTime() - new Date(details.backupsDetails.lastFullBackup).getTime()) / (1000 * 60 * 60));
                                    suggestions.push(`⚠️ Backup Full vencido (hace ${hoursSince}h) → Ejecutar backup completo inmediatamente`);
                                  } else if (details.backupsDetails?.fullBackupBreached) {
                                    suggestions.push('⚠️ Backup Full vencido → Ejecutar backup completo inmediatamente');
                                  }
                                  
                                  if (details.backupsDetails?.logBackupBreached && details.backupsDetails?.lastLogBackup) {
                                    const hoursSince = Math.floor((new Date().getTime() - new Date(details.backupsDetails.lastLogBackup).getTime()) / (1000 * 60 * 60));
                                    suggestions.push(`⚠️ Backup Log vencido (hace ${hoursSince}h) → Ejecutar backup de log de transacciones`);
                                  } else if (details.backupsDetails?.logBackupBreached) {
                                    suggestions.push('⚠️ Backup Log vencido → Ejecutar backup de log de transacciones');
                                  }
                                  
                                  // AlwaysOn inteligente
                                  if (details.alwaysOnDetails && details.alwaysOnDetails.alwaysOnEnabled) {
                                    if (details.alwaysOnDetails.suspendedCount > 0) {
                                      suggestions.push(`🔧 ${details.alwaysOnDetails.suspendedCount} réplica(s) suspendida(s) → Revisar estado de red y latencia entre nodos`);
                                    }
                                    if (details.alwaysOnDetails.maxSendQueueKB > 50000) {
                                      const queueGB = (details.alwaysOnDetails.maxSendQueueKB / 1024 / 1024).toFixed(1);
                                      suggestions.push(`🔧 Cola de envío crítica (${queueGB}GB) → Revisar ancho de banda o detener cargas pesadas temporalmente`);
                                    } else if (details.alwaysOnDetails.maxSendQueueKB > 10000) {
                                      const queueMB = (details.alwaysOnDetails.maxSendQueueKB / 1024).toFixed(0);
                                      suggestions.push(`🔧 Cola de envío alta (${queueMB}MB) → Revisar ancho de banda entre nodos`);
                                    }
                                    if (details.alwaysOnDetails.maxSecondsBehind > 60) {
                                      const lagMin = Math.floor(details.alwaysOnDetails.maxSecondsBehind / 60);
                                      suggestions.push(`⏱️ Lag de sincronización alto (${lagMin}min) → Revisar latencia de red y REDO queue`);
                                    }
                                  }
                                  
                                  // Log Chain inteligente
                                  if (details.logChainDetails && details.logChainDetails.brokenChainCount > 0) {
                                    const broken = details.logChainDetails.brokenChainCount;
                                    suggestions.push(`❌ ${broken} cadena(s) de log rota(s) → Ejecutar backup full en DBs afectadas para reiniciar cadena`);
                                  }
                                  if (details.logChainDetails && details.logChainDetails.fullDBsWithoutLogBackup > 0) {
                                    const count = details.logChainDetails.fullDBsWithoutLogBackup;
                                    suggestions.push(`⚠️ ${count} DB(s) FULL sin backup de log → Configurar backup de log o cambiar a SIMPLE`);
                                  }
                                  
                                  // Database States inteligente
                                  if (details.databaseStatesDetails) {
                                    const problematic: string[] = [];
                                    if (details.databaseStatesDetails.offlineCount > 0) problematic.push(`${details.databaseStatesDetails.offlineCount} Offline`);
                                    if (details.databaseStatesDetails.suspectCount > 0) problematic.push(`${details.databaseStatesDetails.suspectCount} Suspect`);
                                    if (details.databaseStatesDetails.emergencyCount > 0) problematic.push(`${details.databaseStatesDetails.emergencyCount} Emergency`);
                                    
                                    if (problematic.length > 0) {
                                      suggestions.push(`🚨 Bases en estado crítico (${problematic.join(', ')}) → Revisar error log y restaurar urgentemente`);
                                    }
                                  }
                                  
                                  return suggestions.length > 0 ? (
                                    <div className="mb-3 bg-amber-500/5 border border-amber-500/30 rounded-lg p-2">
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-semibold text-amber-600">💡 Acciones sugeridas:</span>
                                        <div className="flex-1 space-y-0.5">
                                          {suggestions.map((suggestion, idx) => (
                                            <p key={idx} className="text-[11px] text-muted-foreground">{suggestion}</p>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
                              
                              {/* Backups */}
                              <Card className="border-green-500/20">
                                <CardHeader className="pb-1 bg-green-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Database className="h-3.5 w-3.5 text-green-600" />
                                    <span className="text-xs">Backups</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_Backups || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].backupsDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Full</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].backupsDetails.fullBackupBreached ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].backupsDetails.fullBackupBreached ? 'Vencido 🔴' : 'OK'}
                                        </span>
                                      </div>
                                      {instanceDetails[score.instanceName].backupsDetails.lastFullBackup && (
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Últ Full</span>
                                          <span className="font-mono text-[10px]">
                                            {formatDateUTC3(instanceDetails[score.instanceName].backupsDetails.lastFullBackup)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Log</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].backupsDetails.logBackupBreached ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].backupsDetails.logBackupBreached ? 'Vencido 🔴' : 'OK'}
                                        </span>
                                      </div>
                                      {instanceDetails[score.instanceName].backupsDetails.lastLogBackup && (
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Últ Log</span>
                                          <span className="font-mono text-[10px]">
                                            {formatDateUTC3(instanceDetails[score.instanceName].backupsDetails.lastLogBackup)}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de backups</p>
                                  )}
                                </CardContent>
                              </Card>

                                {/* AlwaysOn */}
                                <Card className="border-purple-500/20">
                                  <CardHeader className="pb-1 bg-purple-500/5 py-1.5">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                      <Shield className="h-3.5 w-3.5 text-purple-600" />
                                      <span className="text-xs">AlwaysOn AG</span>
                                      <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                        {score.score_AlwaysOn || 0}/100
                                      </span>
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                    {instanceDetails[score.instanceName].alwaysOnDetails ? (
                                      <>
                                        <div className="flex items-center justify-between">
                                          <span className="text-muted-foreground">Status</span>
                                          <span className="font-mono">{instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnEnabled ? 'Enabled' : 'Disabled'}</span>
                                        </div>
                                        {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnEnabled && (
                                          <>
                                          <div className="flex items-center justify-between">
                                              <span className="text-muted-foreground">Estado</span>
                                            <span className={`font-mono ${
                                              instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState !== 'HEALTHY' ? 
                                                (instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState === 'WARNING' ? 'text-amber-500' : 'text-red-500 font-semibold') 
                                                : ''
                                            }`}>
                                                {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState || 'N/A'}
                                                {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState !== 'HEALTHY' && ' ⚠️'}
                                            </span>
                                          </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                              <span className="text-muted-foreground">Sinc</span>
                                              <span className="font-mono">{instanceDetails[score.instanceName].alwaysOnDetails.synchronizedCount}/{instanceDetails[score.instanceName].alwaysOnDetails.databaseCount}</span>
                                        </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                              <span className="text-muted-foreground">Suspendidas</span>
                                              <span className={`font-mono ${instanceDetails[score.instanceName].alwaysOnDetails.suspendedCount > 0 ? 'text-red-500 font-semibold' : ''}`}>
                                                {instanceDetails[score.instanceName].alwaysOnDetails.suspendedCount}
                                                {instanceDetails[score.instanceName].alwaysOnDetails.suspendedCount > 0 && ' 🔴'}
                                              </span>
                                    </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                              <span className="text-muted-foreground">Lag máx</span>
                                              <span className={`font-mono ${instanceDetails[score.instanceName].alwaysOnDetails.maxSecondsBehind > 30 ? 'text-amber-500' : ''}`}>
                                                {instanceDetails[score.instanceName].alwaysOnDetails.maxSecondsBehind}s
                                              </span>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px]">
                                              <span className="text-muted-foreground">Cola envío</span>
                                              <span className="font-mono">{(instanceDetails[score.instanceName].alwaysOnDetails.maxSendQueueKB / 1024).toFixed(1)}MB</span>
                                            </div>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">Sin datos de AlwaysOn</p>
                                    )}
                                  </CardContent>
                                </Card>

                              {/* Log Chain Integrity */}
                              <Card className="border-amber-500/20">
                                <CardHeader className="pb-1 bg-amber-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                                    <span className="text-xs">Log Chain</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_LogChain || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].logChainDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Rotas</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].logChainDetails.brokenChainCount > 0 ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].logChainDetails.brokenChainCount}
                                          {instanceDetails[score.instanceName].logChainDetails.brokenChainCount > 0 && ' 🔴'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Sin LOG bkp</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].logChainDetails.fullDBsWithoutLogBackup > 0 ? 'text-amber-500' : ''}`}>
                                          {instanceDetails[score.instanceName].logChainDetails.fullDBsWithoutLogBackup}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Máx horas</span>
                                        <span className={`font-mono ${
                                          instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup > 24 ? 'text-red-500 font-semibold' :
                                          instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup > 12 ? 'text-amber-500' : ''
                                        }`}>
                                          {instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup.toFixed(1)}h
                                          {instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup > 24 && ' ⚠️'}
                                        </span>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de log chain</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Database States */}
                              <Card className="border-rose-500/20">
                                <CardHeader className="pb-1 bg-rose-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />
                                    <span className="text-xs">DB States</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_DatabaseStates || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].databaseStatesDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Problemáticas</span>
                                        <span className={`font-mono ${
                                          (instanceDetails[score.instanceName].databaseStatesDetails.offlineCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.suspectCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount) > 0 ? 'text-red-500 font-semibold' : ''
                                        }`}>
                                          {instanceDetails[score.instanceName].databaseStatesDetails.offlineCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.suspectCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount}
                                          {(instanceDetails[score.instanceName].databaseStatesDetails.offlineCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.suspectCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount) > 0 && ' 🔴'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Off/Susp/Emrg</span>
                                        <span className="font-mono">
                                          {instanceDetails[score.instanceName].databaseStatesDetails.offlineCount}/
                                          {instanceDetails[score.instanceName].databaseStatesDetails.suspectCount}/
                                          {instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Suspect Pages</span>
                                        <Badge variant={instanceDetails[score.instanceName].databaseStatesDetails.suspectPageCount > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].databaseStatesDetails.suspectPageCount}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Single User DBs</span>
                                        <Badge variant={instanceDetails[score.instanceName].databaseStatesDetails.singleUserCount > 0 ? 'default' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].databaseStatesDetails.singleUserCount}
                                        </Badge>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de database states</p>
                                  )}
                                </CardContent>
                              </Card>
                                </div>
                              </TabsContent>

                              {/* Tab 2: Performance & Resources */}
                              <TabsContent value="performance" className="mt-3">
                                {/* Acciones Sugeridas */}
                                {(() => {
                                  const suggestions: string[] = [];
                                  const details = instanceDetails[score.instanceName];
                                  
                                  // CPU inteligente
                                  if (details.cpuDetails) {
                                    const cpu = details.cpuDetails.sqlProcessUtilization;
                                    const runnable = details.cpuDetails.runnableTasks;
                                    
                                    if (cpu > 90 && runnable > 10) {
                                      suggestions.push(`🔥 CPU crítica (${cpu}%, ${runnable} tareas en cola) → Identificar queries más costosas urgentemente y considerar más cores`);
                                    } else if (cpu > 80 && runnable > 5) {
                                      suggestions.push(`🔥 CPU alta (${cpu}%, ${runnable} tareas esperando) → Revisar queries más costosas y optimizar índices`);
                                    } else if (cpu > 80) {
                                      suggestions.push(`🔥 CPU alta (${cpu}%) → Revisar queries más costosas y optimizar índices`);
                                    } else if (runnable > 10) {
                                      suggestions.push(`⚡ Muchas tareas en cola de CPU (${runnable}) → Considerar aumentar cores o reducir MAXDOP`);
                                    } else if (runnable > 5) {
                                      suggestions.push(`⚡ Tareas en cola de CPU (${runnable}) → Considerar aumentar cores o revisar MAXDOP`);
                                    }
                                  }
                                  
                                  // Memoria inteligente
                                  if (details.memoriaDetails) {
                                    const ple = details.memoriaDetails.pageLifeExpectancy;
                                    const pleTarget = details.memoriaDetails.pleTarget;
                                    const maxMem = details.memoriaDetails.maxServerMemoryMB;
                                    const totalMem = details.memoriaDetails.totalServerMemoryMB;
                                    const grants = details.memoriaDetails.memoryGrantsPending;
                                    
                                    if (ple < 100 && ple > 0) {
                                      const plePct = pleTarget > 0 ? ((ple / pleTarget) * 100).toFixed(0) : 'N/A';
                                      suggestions.push(`💾 PLE crítico (${ple}s, ${plePct}% del target) → Incrementar Max Server Memory urgentemente`);
                                    } else if (ple < 300 && ple > 0) {
                                      const plePct = pleTarget > 0 ? ((ple / pleTarget) * 100).toFixed(0) : 'N/A';
                                      suggestions.push(`💾 PLE bajo (${ple}s, ${plePct}% del target) → Incrementar Max Server Memory si es posible`);
                                    }
                                    
                                    if (grants > 5) {
                                      suggestions.push(`⏳ ${grants} queries esperando memoria → Revisar queries con JOINs grandes o aumentar Max Memory`);
                                    } else if (grants > 0) {
                                      suggestions.push(`⏳ ${grants} query(ies) esperando memoria → Monitorear queries pesadas`);
                                    }
                                    
                                    if (details.memoriaDetails.stolenServerMemoryMB && totalMem) {
                                      const stolenPct = (details.memoriaDetails.stolenServerMemoryMB / totalMem) * 100;
                                      const stolenGB = (details.memoriaDetails.stolenServerMemoryMB / 1024).toFixed(1);
                                      if (stolenPct > 50) {
                                        suggestions.push(`💡 Stolen Memory muy alta (${stolenGB}GB, ${stolenPct.toFixed(0)}%) → Limpiar plan cache: DBCC FREESYSTEMCACHE`);
                                      } else if (stolenPct > 30) {
                                        suggestions.push(`💡 Stolen Memory alta (${stolenGB}GB, ${stolenPct.toFixed(0)}%) → Revisar planes en caché y CLR usage`);
                                      }
                                    }
                                  }
                                  
                                  // I/O inteligente
                                  if (details.ioDetails) {
                                    const readLat = details.ioDetails.avgReadLatencyMs;
                                    const writeLat = details.ioDetails.avgWriteLatencyMs;
                                    
                                    if (readLat > 50) {
                                      suggestions.push(`📊 Latencia de lectura crítica (${readLat.toFixed(1)}ms) → Migrar a SSD/NVMe urgentemente`);
                                    } else if (readLat > 20) {
                                      suggestions.push(`📊 Latencia de lectura alta (${readLat.toFixed(1)}ms) → Revisar discos y considerar SSD`);
                                    } else if (readLat > 15) {
                                      suggestions.push(`📊 Latencia de lectura moderada (${readLat.toFixed(1)}ms) → Monitorear subsistema de almacenamiento`);
                                    }
                                    
                                    if (writeLat > 30) {
                                      suggestions.push(`✍️ Latencia de escritura crítica (${writeLat.toFixed(1)}ms) → Revisar RAID, write cache y migrar a SSD`);
                                    } else if (writeLat > 15) {
                                      suggestions.push(`✍️ Latencia de escritura alta (${writeLat.toFixed(1)}ms) → Revisar subsistema de almacenamiento`);
                                    } else if (writeLat > 10) {
                                      suggestions.push(`✍️ Latencia de escritura moderada (${writeLat.toFixed(1)}ms) → Monitorear discos`);
                                    }
                                  }
                                  
                                  // Discos inteligente
                                  if (details.discosDetails) {
                                    const worstPct = details.discosDetails.worstFreePct;
                                    if (worstPct < 10) {
                                      suggestions.push(`💾 Espacio crítico en disco (${worstPct.toFixed(1)}% libre) → Liberar espacio o expandir volumen URGENTEMENTE`);
                                    } else if (worstPct < 15) {
                                      suggestions.push(`💾 Espacio muy bajo en disco (${worstPct.toFixed(1)}% libre) → Liberar espacio o expandir volumen pronto`);
                                    } else if (worstPct < 20) {
                                      suggestions.push(`💾 Espacio bajo en disco (${worstPct.toFixed(1)}% libre) → Planificar expansión de volumen`);
                                    }
                                  }
                                  
                                  return suggestions.length > 0 ? (
                                    <div className="mb-3 bg-amber-500/5 border border-amber-500/30 rounded-lg p-2">
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-semibold text-amber-600">💡 Acciones sugeridas:</span>
                                        <div className="flex-1 space-y-0.5">
                                          {suggestions.map((suggestion, idx) => (
                                            <p key={idx} className="text-[11px] text-muted-foreground">{suggestion}</p>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">

                              {/* CPU */}
                              <Card className="border-orange-500/20">
                                <CardHeader className="pb-1 bg-orange-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Cpu className="h-3.5 w-3.5 text-orange-600" />
                                    <span className="text-xs">CPU</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_CPU || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].cpuDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">SQL Process</span>
                                        <span className={`font-mono ${
                                          instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization > 80 ? 'text-red-500 font-semibold' : 
                                          instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization > 60 ? 'text-amber-500' : 
                                          ''
                                        }`}>
                                          {instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization}%
                                          {instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization > 80 && ' 🔴'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">P95</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].cpuDetails.p95CPUPercent}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Runnable</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].cpuDetails.runnableTasks > 5 ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].cpuDetails.runnableTasks}
                                          {instanceDetails[score.instanceName].cpuDetails.runnableTasks > 5 && ' ⚠️'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Avg 10min</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].cpuDetails.avgCPUPercentLast10Min}%</span>
                                        </div>
                                      
                                      {/* CPU Waits - Minimalista */}
                                      {instanceDetails[score.instanceName].waitsDetails && instanceDetails[score.instanceName].waitsDetails!.totalWaitMs > 0 && (() => {
                                        const cxPct = (instanceDetails[score.instanceName].waitsDetails!.cxPacketWaitMs / instanceDetails[score.instanceName].waitsDetails!.totalWaitMs) * 100;
                                        const sosPct = (instanceDetails[score.instanceName].waitsDetails!.sosSchedulerYieldMs / instanceDetails[score.instanceName].waitsDetails!.totalWaitMs) * 100;
                                        const hasWaits = cxPct > 0.1 || sosPct > 0.1;
                                        
                                        return hasWaits && (
                                          <div className="mt-2 pt-1.5 border-t border-orange-500/10 space-y-0.5">
                                            {cxPct > 0.1 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">CXPACKET</span>
                                                <span className={`font-mono ${cxPct > 15 ? 'text-red-500 font-semibold' : cxPct > 10 ? 'text-amber-500' : ''}`}>
                                                  {cxPct.toFixed(1)}%
                                                  {cxPct > 15 && ' ⚠️'}
                                                </span>
                                              </div>
                                            )}
                                            {sosPct > 0.1 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">SOS_YIELD</span>
                                                <span className={`font-mono ${sosPct > 15 ? 'text-red-500 font-semibold' : sosPct > 10 ? 'text-amber-500' : ''}`}>
                                                  {sosPct.toFixed(1)}%
                                                  {sosPct > 15 && ' 🔥'}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de CPU</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Memoria */}
                              <Card className="border-pink-500/20">
                                <CardHeader className="pb-1 bg-pink-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <MemoryStick className="h-3.5 w-3.5 text-pink-600" />
                                    <span className="text-xs">Memory</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_Memoria || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].memoriaDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">PLE</span>
                                        <span className={`font-mono ${
                                          instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy < 100 ? 'text-red-500 font-semibold' : 
                                          instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy < 300 ? 'text-amber-500' : 
                                          ''
                                        }`}>
                                          {instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy}s
                                          {instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy < 100 && ' 🔴'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Cache Hit</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].memoriaDetails.bufferCacheHitRatio.toFixed(1)}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Presión</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].memoriaDetails.memoryPressure ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].memoriaDetails.memoryPressure ? '⚠️ Sí' : 'No'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Grants pend</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].memoriaDetails.memoryGrantsPending > 0 ? 'text-amber-500' : ''}`}>
                                          {instanceDetails[score.instanceName].memoriaDetails.memoryGrantsPending}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Target / Total</span>
                                        <span className="font-mono">{(instanceDetails[score.instanceName].memoriaDetails.targetServerMemoryMB / 1024).toFixed(1)}/{(instanceDetails[score.instanceName].memoriaDetails.totalServerMemoryMB / 1024).toFixed(1)}GB</span>
                                      </div>
                                      
                                      {/* Memory Waits & Stolen Memory - Minimalista */}
                                      {(() => {
                                        const waits = instanceDetails[score.instanceName].waitsDetails;
                                        const mem = instanceDetails[score.instanceName].memoriaDetails;
                                        const resSemPct = waits && waits.totalWaitMs > 0 ? (waits.resourceSemaphoreWaitMs / waits.totalWaitMs) * 100 : 0;
                                        const stolenPct = mem.totalServerMemoryMB > 0 ? (mem.stolenServerMemoryMB / mem.totalServerMemoryMB) * 100 : 0;
                                        const hasWaitsOrStolen = resSemPct > 0.1 || mem.stolenServerMemoryMB > 0;
                                        
                                        return hasWaitsOrStolen && (
                                          <div className="mt-2 pt-1.5 border-t border-pink-500/10 space-y-0.5">
                                            {resSemPct > 0.1 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">RES_SEMAPHORE</span>
                                                <span className={`font-mono ${resSemPct > 5 ? 'text-red-500 font-semibold' : resSemPct > 2 ? 'text-amber-500' : ''}`}>
                                                  {resSemPct.toFixed(1)}%
                                                  {resSemPct > 5 && ' ⚠️'}
                                                </span>
                                              </div>
                                            )}
                                            {mem.stolenServerMemoryMB > 0 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">Robada</span>
                                                <span className={`font-mono ${stolenPct > 50 ? 'text-red-500 font-semibold' : stolenPct > 30 ? 'text-amber-500' : ''}`}>
                                                  {mem.stolenServerMemoryMB}MB ({stolenPct.toFixed(0)}%)
                                                  {stolenPct > 50 && ' 🔴'}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de memoria</p>
                                  )}
                                </CardContent>
                              </Card>
                              
                              {/* I/O Performance */}
                              <Card className="border-cyan-500/20">
                                <CardHeader className="pb-1 bg-cyan-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Zap className="h-3.5 w-3.5 text-cyan-600" />
                                    <span className="text-xs">I/O</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_IO || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].ioDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Lectura</span>
                                        <span className={`font-mono ${
                                          instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs > 20 ? 'text-red-500 font-semibold' : 
                                          instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs > 10 ? 'text-amber-500' : 
                                          ''
                                        }`}>
                                          {instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs.toFixed(1)}ms
                                          {instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs > 20 && ' 🐌'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Escritura</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.avgWriteLatencyMs.toFixed(1)}ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">IOPS</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.totalIOPS}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Data lect</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.dataFileAvgReadMs.toFixed(1)}ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Log escr</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.logFileAvgWriteMs.toFixed(1)}ms</span>
                                      </div>
                                      
                                      {/* I/O Waits - Minimalista */}
                                      {instanceDetails[score.instanceName].waitsDetails && instanceDetails[score.instanceName].waitsDetails!.totalWaitMs > 0 && (() => {
                                        const pageIOPct = (instanceDetails[score.instanceName].waitsDetails!.pageIOLatchWaitMs / instanceDetails[score.instanceName].waitsDetails!.totalWaitMs) * 100;
                                        const writeLogPct = (instanceDetails[score.instanceName].waitsDetails!.writeLogWaitMs / instanceDetails[score.instanceName].waitsDetails!.totalWaitMs) * 100;
                                        const hasWaits = pageIOPct > 0.1 || writeLogPct > 0.1;
                                        
                                        return hasWaits && (
                                          <div className="mt-2 pt-1.5 border-t border-cyan-500/10 space-y-0.5">
                                            {pageIOPct > 0.1 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">PAGEIOLATCH</span>
                                                <span className={`font-mono ${pageIOPct > 10 ? 'text-red-500 font-semibold' : pageIOPct > 5 ? 'text-amber-500' : ''}`}>
                                                  {pageIOPct.toFixed(1)}%
                                                  {pageIOPct > 10 && ' 🐌'}
                                                </span>
                                              </div>
                                            )}
                                            {writeLogPct > 0.1 && (
                                              <div className="flex items-center justify-between text-[11px]">
                                                <span className="text-muted-foreground">WRITELOG</span>
                                                <span className={`font-mono ${writeLogPct > 10 ? 'text-red-500 font-semibold' : writeLogPct > 5 ? 'text-amber-500' : ''}`}>
                                                  {writeLogPct.toFixed(1)}%
                                                  {writeLogPct > 10 && ' 🐌'}
                                                </span>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de I/O</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Discos */}
                              <Card className="border-yellow-500/20">
                                <CardHeader className="pb-1 bg-yellow-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <HardDrive className="h-3.5 w-3.5 text-yellow-600" />
                                    <span className="text-xs">Disk Space</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_Discos || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].discosDetails ? (
                                    <>
                                      {/* Resumen */}
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Peor volumen</span>
                                        <span className={cn(
                                          'font-mono font-semibold',
                                          instanceDetails[score.instanceName].discosDetails.worstFreePct < 10 && 'text-red-500',
                                          instanceDetails[score.instanceName].discosDetails.worstFreePct >= 10 && instanceDetails[score.instanceName].discosDetails.worstFreePct < 20 && 'text-amber-500'
                                        )}>
                                          {instanceDetails[score.instanceName].discosDetails.worstFreePct.toFixed(1)}% libre
                                          {instanceDetails[score.instanceName].discosDetails.worstFreePct < 10 && ' 🔴'}
                                          {instanceDetails[score.instanceName].discosDetails.worstFreePct >= 10 && instanceDetails[score.instanceName].discosDetails.worstFreePct < 20 && ' ⚠️'}
                                        </span>
                                      </div>
                                      
                                      {/* Detalle de volúmenes */}
                                      {(() => {
                                        try {
                                          if (!instanceDetails[score.instanceName].discosDetails.volumesJson) return null;
                                          
                                          const volumes = JSON.parse(instanceDetails[score.instanceName].discosDetails.volumesJson);
                                          if (!Array.isArray(volumes) || volumes.length === 0) return null;
                                          
                                          // Ordenar por espacio libre (menor a mayor)
                                          const sortedVolumes = [...volumes].sort((a, b) => (a.FreeSpacePct || 100) - (b.FreeSpacePct || 100));
                                          
                                          // Categorizar volúmenes
                                          const criticalVolumes = sortedVolumes.filter(v => v.FreeSpacePct < 10);
                                          const warningVolumes = sortedVolumes.filter(v => v.FreeSpacePct >= 10 && v.FreeSpacePct < 20);
                                          const okVolumes = sortedVolumes.filter(v => v.FreeSpacePct >= 20);
                                          
                                          return (
                                            <div className="pt-1 mt-1 border-t border-yellow-500/10 space-y-0.5">
                                              <p className="text-[10px] text-muted-foreground mb-1">Volúmenes ({volumes.length}):</p>
                                              
                                              {/* Críticos */}
                                              {criticalVolumes.map((vol, idx) => (
                                                <div key={`crit-${idx}`} className="flex items-center justify-between text-[11px] bg-red-500/5 px-1 rounded">
                                                  <span className="font-mono text-red-600 font-semibold">{vol.VolumeName}</span>
                                                  <span className="text-red-600 font-semibold">{vol.FreeSpacePct?.toFixed(1)}% 🔴</span>
                                                </div>
                                              ))}
                                              
                                              {/* Warning */}
                                              {warningVolumes.map((vol, idx) => (
                                                <div key={`warn-${idx}`} className="flex items-center justify-between text-[11px] bg-amber-500/5 px-1 rounded">
                                                  <span className="font-mono text-amber-600">{vol.VolumeName}</span>
                                                  <span className="text-amber-600">{vol.FreeSpacePct?.toFixed(1)}% ⚠️</span>
                                                </div>
                                              ))}
                                              
                                              {/* OK - Mostrar TODOS */}
                                              {okVolumes.map((vol, idx) => (
                                                <div key={`ok-${idx}`} className="flex items-center justify-between text-[11px]">
                                                  <span className="font-mono text-muted-foreground">{vol.VolumeName}</span>
                                                  <span className="text-muted-foreground">{vol.FreeSpacePct?.toFixed(1)}%</span>
                                                </div>
                                              ))}
                                            </div>
                                          );
                                        } catch (e) {
                                          return null;
                                        }
                                      })()}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de discos</p>
                                  )}
                                </CardContent>
                              </Card>
                                </div>
                              </TabsContent>

                              {/* Tab 3: Maintenance & Config */}
                              <TabsContent value="errors" className="mt-3">
                                {/* Acciones Sugeridas */}
                                {(() => {
                                  const suggestions: string[] = [];
                                  const details = instanceDetails[score.instanceName];
                                  
                                  // Errores críticos inteligente
                                  if (details.erroresCriticosDetails) {
                                    const sevCount = details.erroresCriticosDetails.severity20PlusCount;
                                    const lastHour = details.erroresCriticosDetails.severity20PlusLast1h;
                                    
                                    if (lastHour > 0 && sevCount > 10) {
                                      suggestions.push(`🚨 Errores críticos activos (${lastHour} en última hora, ${sevCount} en 24h) → Revisar error log URGENTEMENTE`);
                                    } else if (lastHour > 0) {
                                      suggestions.push(`🚨 ${lastHour} error(es) crítico(s) en última hora → Revisar error log inmediatamente`);
                                    } else if (sevCount > 10) {
                                      suggestions.push(`⚠️ ${sevCount} errores críticos en 24h → Revisar error log y tendencias`);
                                    } else if (sevCount > 0) {
                                      suggestions.push(`⚠️ ${sevCount} error(es) crítico(s) en 24h → Revisar error log`);
                                    }
                                  }
                                  
                                  // Bloqueos inteligente
                                  if (details.waitsDetails) {
                                    const blocked = details.waitsDetails.blockedSessionCount;
                                    const maxBlockTime = details.waitsDetails.maxBlockTimeSeconds;
                                    
                                    if (blocked > 20 || maxBlockTime > 300) {
                                      suggestions.push(`🔒 Bloqueos severos (${blocked} sesiones, máx ${Math.floor(maxBlockTime / 60)}min) → Identificar SPIDs bloqueadores urgentemente`);
                                    } else if (blocked > 10 || maxBlockTime > 60) {
                                      suggestions.push(`🔒 Bloqueos moderados (${blocked} sesiones, máx ${maxBlockTime}s) → Identificar SPIDs bloqueadores y optimizar queries`);
                                    } else if (blocked > 5 || maxBlockTime > 30) {
                                      suggestions.push(`⚠️ ${blocked} sesión(es) bloqueada(s) (máx ${maxBlockTime}s) → Monitorear bloqueos`);
                                    }
                                  }
                                  // TempDB - Evaluar archivos y contención
                                  if (details.configuracionTempdbDetails) {
                                    const fileCount = details.configuracionTempdbDetails.tempDBFileCount;
                                    const cpuCount = details.configuracionTempdbDetails.cpuCount;
                                    const optimalFiles = Math.min(Math.max(cpuCount, 4), 8); // Mínimo 4, máximo 8
                                    const tempdbScore = details.configuracionTempdbDetails.tempDBContentionScore; // Renombrado para evitar shadowing
                                    const sameSize = details.configuracionTempdbDetails.tempDBAllSameSize;
                                    
                                    // 1. Evaluar número de archivos INDEPENDIENTEMENTE del score
                                    if (fileCount < optimalFiles) {
                                      // Menos archivos de los necesarios
                                      if (tempdbScore < 40) {
                                        suggestions.push(`🔥 Contención crítica en TempDB → Agregar más archivos urgentemente (tiene ${fileCount}, óptimo: ${optimalFiles} para ${cpuCount} CPUs)`);
                                      } else if (tempdbScore < 70) {
                                        suggestions.push(`⚠️ Contención moderada en TempDB → Considerar agregar archivos (tiene ${fileCount}, óptimo: ${optimalFiles} para ${cpuCount} CPUs)`);
                                      } else {
                                        suggestions.push(`💡 TempDB con archivos insuficientes → Agregar archivos para mejorar (tiene ${fileCount}, óptimo: ${optimalFiles} para ${cpuCount} CPUs)`);
                                      }
                                    } else if (fileCount > optimalFiles) {
                                      // Más archivos de los necesarios (overhead innecesario)
                                      suggestions.push(`⚠️ TempDB con archivos de más → Considerar reducir a ${optimalFiles} archivos (tiene ${fileCount} para ${cpuCount} CPUs, overhead innecesario)`);
                                    } else {
                                      // Número de archivos OK, evaluar solo si hay problemas de contención
                                      if (tempdbScore < 70) {
                                        // Usar diagnóstico inteligente del consolidador (valida tipo de disco)
                                        if (score.tempDBIOSuggestion) {
                                          // Usar el diagnóstico inteligente que YA validó HDD vs SSD
                                          const emoji = tempdbScore < 40 ? '🔥' : '⚠️';
                                          const level = tempdbScore < 40 ? 'crítica' : 'moderada';
                                          suggestions.push(`${emoji} Contención ${level} en TempDB → ${score.tempDBIOSuggestion}`);
                                        } else {
                                          // Fallback si no hay diagnóstico inteligente
                                          const emoji = tempdbScore < 40 ? '🔥' : '⚠️';
                                          const level = tempdbScore < 40 ? 'crítica' : 'moderada';
                                          suggestions.push(`${emoji} Contención ${level} en TempDB → Revisar queries con sorts/spills a TempDB y carga de disco`);
                                        }
                                      }
                                    }
                                    
                                    // 2. Evaluar si archivos tienen el mismo tamaño
                                    if (!sameSize) {
                                      suggestions.push('⚠️ Archivos TempDB con distinto tamaño → Igualar tamaño de todos los archivos para proportional fill óptimo');
                                    }
                                  }
                                  
                                  // NOTA: La lógica de latencia de TempDB ahora está cubierta por el diagnóstico inteligente
                                  // (tempDBIOSuggestion) que SÍ valida el tipo de disco (HDD/SSD/NVMe)
                                  
                                  // Max Memory inteligente
                                  if (details.configuracionTempdbDetails && !details.configuracionTempdbDetails.maxMemoryWithinOptimal) {
                                    const maxMemGB = (details.configuracionTempdbDetails.maxServerMemoryMB / 1024).toFixed(1);
                                    const totalMemGB = (details.configuracionTempdbDetails.totalPhysicalMemoryMB / 1024).toFixed(1);
                                    const currentPct = details.configuracionTempdbDetails.maxMemoryPctOfPhysical.toFixed(0);
                                    const recommendedMin = Math.floor(details.configuracionTempdbDetails.totalPhysicalMemoryMB * 0.75 / 1024);
                                    const recommendedMax = Math.floor(details.configuracionTempdbDetails.totalPhysicalMemoryMB * 0.90 / 1024);
                                    
                                    if (details.configuracionTempdbDetails.maxMemoryPctOfPhysical > 95) {
                                      suggestions.push(`💾 Max Memory muy alto (${maxMemGB}GB, ${currentPct}% de ${totalMemGB}GB) → Reducir a ${recommendedMin}-${recommendedMax}GB para evitar presión en OS`);
                                    } else if (details.configuracionTempdbDetails.maxMemoryPctOfPhysical < 50) {
                                      suggestions.push(`💾 Max Memory muy bajo (${maxMemGB}GB, ${currentPct}% de ${totalMemGB}GB) → Incrementar a ${recommendedMin}-${recommendedMax}GB`);
                                    } else {
                                      suggestions.push(`💾 Max Memory no óptimo (${maxMemGB}GB, ${currentPct}% de ${totalMemGB}GB) → Ajustar a ${recommendedMin}-${recommendedMax}GB`);
                                    }
                                  }
                                  
                                  // Maintenance inteligente
                                  if (details.maintenanceDetails) {
                                    if (!details.maintenanceDetails.checkdbOk && details.maintenanceDetails.lastCheckdb) {
                                      const daysSince = Math.floor((new Date().getTime() - new Date(details.maintenanceDetails.lastCheckdb).getTime()) / (1000 * 60 * 60 * 24));
                                      suggestions.push(`⚠️ CHECKDB vencido (último hace ${daysSince} días) → Ejecutar DBCC CHECKDB para verificar integridad`);
                                    } else if (!details.maintenanceDetails.checkdbOk) {
                                      suggestions.push('⚠️ CHECKDB vencido → Ejecutar DBCC CHECKDB para verificar integridad');
                                    }
                                    
                                    if (!details.maintenanceDetails.indexOptimizeOk && details.maintenanceDetails.lastIndexOptimize) {
                                      const daysSince = Math.floor((new Date().getTime() - new Date(details.maintenanceDetails.lastIndexOptimize).getTime()) / (1000 * 60 * 60 * 24));
                                      suggestions.push(`🔧 Mantenimiento de índices vencido (último hace ${daysSince} días) → Ejecutar IndexOptimize`);
                                    } else if (!details.maintenanceDetails.indexOptimizeOk) {
                                      suggestions.push('🔧 Mantenimiento de índices vencido → Ejecutar IndexOptimize');
                                    }
                                  }
                                  
                                  // Autogrowth inteligente
                                  if (details.autogrowthDetails) {
                                    const events = details.autogrowthDetails.autogrowthEventsLast24h;
                                    const nearLimit = details.autogrowthDetails.filesNearLimit;
                                    const badGrowth = details.autogrowthDetails.filesWithBadGrowth;
                                    const worstPct = details.autogrowthDetails.worstPercentOfMax;
                                    
                                    if (nearLimit > 0 && worstPct > 95) {
                                      suggestions.push(`⚠️ ${nearLimit} archivo(s) al límite (${worstPct.toFixed(0)}% usado) → Aumentar MaxSize urgentemente o migrar datos`);
                                    } else if (nearLimit > 0) {
                                      suggestions.push(`⚠️ ${nearLimit} archivo(s) cerca del límite (${worstPct.toFixed(0)}% usado) → Aumentar MaxSize o planificar migración`);
                                    }
                                    
                                    if (events > 50) {
                                      suggestions.push(`📈 Muchos autogrowths (${events} en 24h) → Aumentar tamaño inicial de archivos urgentemente`);
                                    } else if (events > 20) {
                                      suggestions.push(`📈 Autogrowths frecuentes (${events} en 24h) → Aumentar tamaño inicial de archivos`);
                                    }
                                    
                                    if (badGrowth > 0) {
                                      suggestions.push(`⚠️ ${badGrowth} archivo(s) con crecimiento % → Cambiar a crecimiento fijo en MB para mejor rendimiento`);
                                    }
                                  }
                                  
                                  return suggestions.length > 0 ? (
                                    <div className="mb-3 bg-amber-500/5 border border-amber-500/30 rounded-lg p-2">
                                      <div className="flex items-start gap-2">
                                        <span className="text-xs font-semibold text-amber-600">💡 Acciones sugeridas:</span>
                                        <div className="flex-1 space-y-0.5">
                                          {suggestions.map((suggestion, idx) => (
                                            <p key={idx} className="text-[11px] text-muted-foreground">{suggestion}</p>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ) : null;
                                })()}
                                
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">

                              {/* Errores Críticos */}
                              <Card className="border-red-500/20">
                                <CardHeader className="pb-1 bg-red-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <XCircle className="h-3.5 w-3.5 text-red-600" />
                                    <span className="text-xs">Errores Críticos</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_ErroresCriticos || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].erroresCriticosDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Sev 20+ (24h)</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount > 0 ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount}
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount > 0 && ' 🔴'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Última Hora</span>
                                        <span className={`font-mono ${instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusLast1h > 0 ? 'text-red-500 font-semibold' : ''}`}>
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusLast1h}
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusLast1h > 0 && ' ⚠️'}
                                        </span>
                                      </div>
                                      {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount > 0 && instanceDetails[score.instanceName].erroresCriticosDetails.mostRecentError && (
                                        <div className="pt-1 mt-1 border-t border-red-500/10">
                                          <p className="text-[10px] text-muted-foreground">Últ: {formatDateUTC3(instanceDetails[score.instanceName].erroresCriticosDetails.mostRecentError)}</p>
                                        </div>
                                      )}
                                      {instanceDetails[score.instanceName].erroresCriticosDetails.errorDetails && (
                                        <div className="pt-1 border-t border-red-500/10">
                                          <p className="text-[10px] text-muted-foreground line-clamp-2">{instanceDetails[score.instanceName].erroresCriticosDetails.errorDetails}</p>
                                        </div>
                                      )}
                                      
                                      {/* Blocking - Minimalista */}
                                      {instanceDetails[score.instanceName].waitsDetails && instanceDetails[score.instanceName].waitsDetails!.blockedSessionCount > 0 && (() => {
                                        const blockedCount = instanceDetails[score.instanceName].waitsDetails!.blockedSessionCount;
                                        const maxBlockTime = instanceDetails[score.instanceName].waitsDetails!.maxBlockTimeSeconds;
                                        const isCritical = blockedCount > 10 || maxBlockTime > 30;
                                        const isHigh = blockedCount > 5 || maxBlockTime > 10;
                                        
                                        return (
                                          <div className="mt-2 pt-1.5 border-t border-red-500/10 space-y-0.5">
                                            <div className="flex items-center justify-between text-[11px]">
                                              <span className="text-muted-foreground">🔒 {blockedCount} bloq</span>
                                              <span className={`font-mono ${isCritical ? 'text-red-500 font-semibold' : isHigh ? 'text-amber-500' : ''}`}>
                                                {maxBlockTime}s
                                                {isCritical && ' 🚨'}
                                              </span>
                                            </div>
                                            {instanceDetails[score.instanceName].waitsDetails!.blockerSessionIds && (
                                              <div className="text-[10px] text-muted-foreground">
                                                SPIDs: {instanceDetails[score.instanceName].waitsDetails!.blockerSessionIds}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })()}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de errores críticos</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Configuración & TempDB */}
                              <Card className="border-indigo-500/20">
                                <CardHeader className="pb-1 bg-indigo-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Settings className="h-3.5 w-3.5 text-indigo-600" />
                                    <span className="text-xs">Config & TempDB</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_ConfiguracionTempdb || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].configuracionTempdbDetails ? (
                                    <>
                                      {/* TempDB Health Score Compuesto - Compacto */}
                                      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/30 rounded p-1.5">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-semibold text-indigo-600">TempDB Score</span>
                                          <span className={`text-xs font-mono font-bold ${
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore >= 90 ? '' :
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore >= 70 ? 'text-amber-500' :
                                            'text-red-500'
                                          }`}>
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore}/100
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore < 70 && ' ⚠️'}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Diagnóstico Inteligente de I/O (v3.1) */}
                                      {score.tempDBIOSuggestion && (
                                        <div className={`rounded-md p-2 border ${
                                          score.tempDBIOSeverity === 'CRITICAL' ? 'bg-red-500/10 border-red-500/30' :
                                          score.tempDBIOSeverity === 'HIGH' ? 'bg-orange-500/10 border-orange-500/30' :
                                          score.tempDBIOSeverity === 'MEDIUM' ? 'bg-yellow-500/10 border-yellow-500/30' :
                                          'bg-blue-500/10 border-blue-500/30'
                                        }`}>
                                          <div className="space-y-1">
                                            {score.tempDBIODiagnosis && (
                                              <div className="text-[10px] font-semibold text-muted-foreground">
                                                🧠 Diagnóstico: {score.tempDBIODiagnosis}
                                              </div>
                                            )}
                                            <div className={`text-[10px] ${
                                              score.tempDBIOSeverity === 'CRITICAL' ? 'text-red-400' :
                                              score.tempDBIOSeverity === 'HIGH' ? 'text-orange-400' :
                                              score.tempDBIOSeverity === 'MEDIUM' ? 'text-yellow-400' :
                                              'text-blue-400'
                                            }`}>
                                              {score.tempDBIOSuggestion}
                                            </div>
                                          </div>
                                        </div>
                                      )}

                                      {/* Tipo de Disco y Competencia */}
                                      {instanceDetails[score.instanceName].discosDetails?.volumesJson && (
                                        (() => {
                                          try {
                                            const volumes = JSON.parse(instanceDetails[score.instanceName].discosDetails.volumesJson);
                                            const tempdbVolume = volumes.find((v: any) => 
                                              v.MountPoint === instanceDetails[score.instanceName].configuracionTempdbDetails?.tempDBMountPoint
                                            );
                                            
                                            if (tempdbVolume) {
                                              return (
                                                <div className="space-y-1 bg-slate-500/5 border border-slate-500/20 rounded p-1.5">
                                                  {/* Tipo de Disco */}
                                                  {tempdbVolume.MediaType && tempdbVolume.MediaType !== 'Unknown' && (
                                                    <div className="flex items-center justify-between text-[11px]">
                                                      <span className="text-muted-foreground">💾 Tipo disco</span>
                                                      <span className={`font-semibold ${
                                                        tempdbVolume.MediaType === 'NVMe' ? 'text-green-400' :
                                                        tempdbVolume.MediaType === 'SSD' ? 'text-blue-400' :
                                                        tempdbVolume.MediaType === 'HDD' ? 'text-orange-400' :
                                                        'text-gray-400'
                                                      }`}>
                                                        {tempdbVolume.MediaType}
                                                        {tempdbVolume.BusType && ` (${tempdbVolume.BusType})`}
                                                      </span>
                                                    </div>
                                                  )}
                                                  
                                                  {/* Disco Dedicado o Compartido */}
                                                  {tempdbVolume.DatabaseCount > 0 && (
                                                    <div className="flex items-center justify-between text-[11px]">
                                                      <span className="text-muted-foreground">🗄️ DBs en disco</span>
                                                      <span className={`font-semibold ${
                                                        tempdbVolume.DatabaseCount === 1 ? 'text-green-400' : 
                                                        tempdbVolume.DatabaseCount <= 3 ? 'text-yellow-400' : 
                                                        'text-red-400'
                                                      }`}>
                                                        {tempdbVolume.DatabaseCount}
                                                        {tempdbVolume.DatabaseCount === 1 ? ' (DEDICADO) ✅' : 
                                                         tempdbVolume.DatabaseCount > 5 ? ' (COMPARTIDO) 🚨' :
                                                         ' (COMPARTIDO) ⚠️'}
                                                      </span>
                                                    </div>
                                                  )}
                                                  
                                                  {/* Health Status del Disco */}
                                                  {tempdbVolume.HealthStatus && 
                                                   tempdbVolume.HealthStatus !== 'Healthy' && 
                                                   tempdbVolume.HealthStatus !== 'Unknown' && (
                                                    <div className="flex items-center justify-between text-[11px]">
                                                      <span className="text-muted-foreground">⚕️ Estado disco</span>
                                                      <Badge variant={
                                                        tempdbVolume.HealthStatus === 'Unhealthy' ? 'destructive' : 'default'
                                                      } className="text-xs">
                                                        {tempdbVolume.HealthStatus}
                                                      </Badge>
                                                    </div>
                                                  )}
                                                  
                                                  {/* Lazy Writes (si es significativo) */}
                                                  {instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec && 
                                                   instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec > 20 && (
                                                    <div className="flex items-center justify-between text-[11px]">
                                                      <span className="text-muted-foreground">💾 Lazy Writes</span>
                                                      <span className={`font-semibold ${
                                                        instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec > 100 ? 'text-red-400' :
                                                        instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec > 50 ? 'text-yellow-400' :
                                                        'text-gray-400'
                                                      }`}>
                                                        {instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec}/s
                                                        {instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec > 100 && ' 🚨'}
                                                        {instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec > 50 && 
                                                         instanceDetails[score.instanceName].discosDetails.lazyWritesPerSec <= 100 && ' ⚠️'}
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              );
                                            }
                                          } catch (e) {
                                            // Error parseando JSON, ignorar
                                          }
                                          return null;
                                        })()
                                      )}

                                      {/* Archivos - Compacto */}
                                      <div className="space-y-0.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Archivos</span>
                                          <span className={`font-mono ${
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount === 1 ? 'text-amber-500' :
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount < Math.min(instanceDetails[score.instanceName].configuracionTempdbDetails.cpuCount, 8) ? 'text-amber-500' : ''
                                          }`}>
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount}
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount === 1 && ' ⚠️'}
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Tam/Crec/Cfg</span>
                                          <div className="flex gap-1 font-mono text-[10px]">
                                            <span className={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameSize ? '' : 'text-red-500'}>
                                              {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameSize ? '✓' : '✗'}
                                            </span>
                                            <span className={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameGrowth ? '' : 'text-red-500'}>
                                              {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameGrowth ? '✓' : '✗'}
                                            </span>
                                            <span className={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBGrowthConfigOK ? '' : 'text-amber-500'}>
                                              {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBGrowthConfigOK ? '✓' : '✗'}
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Latencia - Compacto */}
                                      <div className="space-y-0.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Lectura</span>
                                          <span className={`font-mono ${
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgReadLatencyMs > 20 ? 'text-red-500 font-semibold' :
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgReadLatencyMs > 10 ? 'text-amber-500' : ''
                                          }`}>
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgReadLatencyMs.toFixed(1)}ms
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Escritura</span>
                                          <span className={`font-mono ${
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgWriteLatencyMs > 20 ? 'text-red-500 font-semibold' :
                                            instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgWriteLatencyMs > 10 ? 'text-amber-500' : ''
                                          }`}>
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgWriteLatencyMs.toFixed(1)}ms
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgWriteLatencyMs > 50 && ' 🐌'}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Contención (PAGELATCH Waits) - Compacto */}
                                      <div className="space-y-0.5">
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">PAGELATCH</span>
                                          <Badge 
                                            variant={
                                              instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits === 0 ? 'outline' :
                                              instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits < 100 ? 'outline' :
                                              instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits < 1000 ? 'default' :
                                              instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits < 10000 ? 'default' :
                                              'destructive'
                                            }
                                            className="text-xs font-mono"
                                          >
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits.toLocaleString()}
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBPageLatchWaits >= 10000 && ' ⚠️'}
                                          </Badge>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground italic">
                                          {(() => {
                                            const tempdbScore = instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore;
                                            if (tempdbScore >= 90) return '✅ Óptimo';
                                            if (tempdbScore >= 70) return 'Bueno';
                                            if (tempdbScore >= 40) return '⚠️ Contención moderada (afecta 40% del score)';
                                            return '🔴 Contención crítica (afecta 40% del score)';
                                          })()}
                                        </p>
                                      </div>

                                      {/* Espacio y Recursos */}
                                      {(instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBTotalSizeMB > 0 || 
                                        instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct > 0 ||
                                        instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB > 0) ? (
                                        <div className="space-y-1">
                                          {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBTotalSizeMB > 0 && (
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">TempDB Size / Used</span>
                                              <span className="font-mono">{(instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBTotalSizeMB / 1024).toFixed(1)} / {(instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBUsedSpaceMB / 1024).toFixed(1)} GB</span>
                                            </div>
                                          )}
                                          {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct > 0 && (
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Free Space</span>
                                              <Badge 
                                                variant={
                                                  instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct >= 20 ? 'outline' :
                                                  instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct >= 10 ? 'default' :
                                                  'destructive'
                                                }
                                                className="text-xs font-mono"
                                              >
                                                {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct.toFixed(1)}%
                                                {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFreeSpacePct < 10 && ' ⚠️'}
                                              </Badge>
                                            </div>
                                          )}
                                          {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB > 0 && (
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Version Store</span>
                                              <Badge 
                                                variant={
                                                  instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB < 1024 ? 'outline' :
                                                  instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB < 2048 ? 'default' :
                                                  'destructive'
                                                }
                                                className="text-xs font-mono"
                                              >
                                                {(instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB / 1024).toFixed(2)} GB
                                                {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBVersionStoreMB > 2048 && ' ⚠️'}
                                              </Badge>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
                                          <p className="text-[10px] text-muted-foreground text-center">
                                            ℹ️ Métricas extendidas disponibles después de la próxima recolección
                                          </p>
                                        </div>
                                      )}

                                      {/* Max Memory */}
                                      <div className="pt-2 border-t space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Max Server Memory</span>
                                          <span className="font-mono">{(instanceDetails[score.instanceName].configuracionTempdbDetails.maxServerMemoryMB / 1024).toFixed(1)} GB</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">% of Physical</span>
                                          <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.maxMemoryWithinOptimal ? 'outline' : 'default'} className="text-xs">
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.maxMemoryPctOfPhysical.toFixed(1)}%
                                            {!instanceDetails[score.instanceName].configuracionTempdbDetails.maxMemoryWithinOptimal && ' ⚠️'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de configuración</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Maintenance */}
                              <Card className="border-teal-500/20">
                                <CardHeader className="pb-1 bg-teal-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Wrench className="h-3.5 w-3.5 text-teal-600" />
                                    <span className="text-xs">Maintenance</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_Maintenance || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].maintenanceDetails ? (
                                    <>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">CHECKDB</span>
                                        <Badge variant={instanceDetails[score.instanceName].maintenanceDetails.checkdbOk ? 'outline' : 'destructive'} className="text-xs">
                                          {instanceDetails[score.instanceName].maintenanceDetails.checkdbOk ? 'OK' : 'Vencido'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].maintenanceDetails.lastCheckdb && (
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Últ CheckDB</span>
                                          <span className="font-mono">{formatDateUTC3(instanceDetails[score.instanceName].maintenanceDetails.lastCheckdb)}</span>
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Index</span>
                                        <Badge variant={instanceDetails[score.instanceName].maintenanceDetails.indexOptimizeOk ? 'outline' : 'destructive'} className="text-xs">
                                          {instanceDetails[score.instanceName].maintenanceDetails.indexOptimizeOk ? 'OK' : 'Vencido'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].maintenanceDetails.lastIndexOptimize && (
                                        <div className="flex items-center justify-between text-[11px]">
                                          <span className="text-muted-foreground">Últ Index</span>
                                          <span className="font-mono">{formatDateUTC3(instanceDetails[score.instanceName].maintenanceDetails.lastIndexOptimize)}</span>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de maintenance</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Autogrowth & Capacity */}
                              <Card className="border-lime-500/20">
                                <CardHeader className="pb-1 bg-lime-500/5 py-1.5">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <TrendingUp className="h-3.5 w-3.5 text-lime-600" />
                                    <span className="text-xs">Autogrowth</span>
                                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                                      {score.score_Autogrowth || 0}/100
                                    </span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-1 text-xs pt-2 pb-2">
                                  {instanceDetails[score.instanceName].autogrowthDetails ? (
                                    <>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Eventos (24h)</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].autogrowthDetails.autogrowthEventsLast24h > 20 ? 'destructive' :
                                            instanceDetails[score.instanceName].autogrowthDetails.autogrowthEventsLast24h > 10 ? 'default' :
                                            'outline'
                                          }
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].autogrowthDetails.autogrowthEventsLast24h}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Archivos límite</span>
                                        <Badge variant={instanceDetails[score.instanceName].autogrowthDetails.filesNearLimit > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].autogrowthDetails.filesNearLimit}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">Crec incorrecto</span>
                                        <Badge variant={instanceDetails[score.instanceName].autogrowthDetails.filesWithBadGrowth > 0 ? 'default' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].autogrowthDetails.filesWithBadGrowth}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-[11px]">
                                        <span className="text-muted-foreground">% máx usado</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].autogrowthDetails.worstPercentOfMax > 90 ? 'destructive' :
                                            instanceDetails[score.instanceName].autogrowthDetails.worstPercentOfMax > 80 ? 'default' :
                                            'outline'
                                          }
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].autogrowthDetails.worstPercentOfMax.toFixed(1)}%
                                        </Badge>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de autogrowth</p>
                                  )}
                                </CardContent>
                              </Card>
                            </div>
                              </TabsContent>
                            </Tabs>
                          </div>
                          ) : (
                            <div className="flex items-center justify-center py-8">
                              <div className="text-muted-foreground">No hay detalles disponibles</div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No hay instancias que coincidan con los filtros
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

