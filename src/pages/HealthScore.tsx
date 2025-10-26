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
      case 'Warning': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'Risk': return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'Critical': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'Healthy': 'bg-green-500/10 text-green-700 border-green-500/20',
      'Warning': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      'Risk': 'bg-orange-500/10 text-orange-700 border-orange-500/20',
      'Critical': 'bg-red-500/10 text-red-700 border-red-500/20',
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
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-green-600">HEALTHY</p>
                      <p className="text-center text-lg font-mono font-bold text-green-600">≥85 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Optimal performance</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-yellow-600">WARNING</p>
                      <p className="text-center text-lg font-mono font-bold text-yellow-600">70-84 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Requires attention</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                      <AlertCircle className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-orange-600">RISK</p>
                      <p className="text-center text-lg font-mono font-bold text-orange-600">50-69 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Action required</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-red-600">CRITICAL</p>
                      <p className="text-center text-lg font-mono font-bold text-red-600">{'<'}50 pts</p>
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

        <Card className="gradient-card shadow-card border-green-500/30">
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

        <Card className="gradient-card shadow-card border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Warning</p>
                <p className="text-2xl font-bold font-mono text-yellow-600">{stats.warning}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-orange-500/30">
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

        <Card className="gradient-card shadow-card border-red-500/30">
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
                          score.healthScore >= 85 && 'text-green-600',
                          score.healthScore >= 70 && score.healthScore < 85 && 'text-yellow-600',
                          score.healthScore >= 50 && score.healthScore < 70 && 'text-orange-600',
                          score.healthScore < 50 && 'text-red-600'
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
                              score.healthScore >= 85 && '[&>div]:bg-green-600',
                              score.healthScore >= 70 && score.healthScore < 85 && '[&>div]:bg-yellow-600',
                              score.healthScore >= 50 && score.healthScore < 70 && '[&>div]:bg-orange-600',
                              score.healthScore < 50 && '[&>div]:bg-red-600'
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
                            <div className="bg-gradient-to-r from-blue-500/5 to-purple-500/5 border rounded-lg p-3">
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold flex items-center gap-2">
                                  <Activity className="h-4 w-4" />
                                  Category Contributions
                                </span>
                                <span className="text-xl font-mono font-bold">{score.healthScore}<span className="text-xs text-muted-foreground">/100</span></span>
                              </div>
                              <div className="grid grid-cols-4 gap-2">
                                {/* Fila 1: Availability & DR */}
                                <div className="bg-gradient-to-br from-green-500/10 to-green-500/5 border border-green-500/30 rounded p-2 text-center">
                                  <Database className="h-3 w-3 text-green-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-green-600">{score.backupsContribution || 0}<span className="text-xs">/18</span></p>
                                  <p className="text-[10px] text-muted-foreground">Backups</p>
                                </div>
                                <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/30 rounded p-2 text-center">
                                  <Shield className="h-3 w-3 text-purple-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-purple-600">{score.alwaysOnContribution || 0}<span className="text-xs">/14</span></p>
                                  <p className="text-[10px] text-muted-foreground">AlwaysOn</p>
                                </div>
                                <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/30 rounded p-2 text-center">
                                  <AlertCircle className="h-3 w-3 text-amber-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-amber-600">{score.logChainContribution || 0}<span className="text-xs">/5</span></p>
                                  <p className="text-[10px] text-muted-foreground">LogChain</p>
                                </div>
                                <div className="bg-gradient-to-br from-rose-500/10 to-rose-500/5 border border-rose-500/30 rounded p-2 text-center">
                                  <AlertTriangle className="h-3 w-3 text-rose-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-rose-600">{score.databaseStatesContribution || 0}<span className="text-xs">/3</span></p>
                                  <p className="text-[10px] text-muted-foreground">DB States</p>
                                </div>
                                
                                {/* Fila 2: Performance */}
                                <div className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border border-orange-500/30 rounded p-2 text-center">
                                  <Cpu className="h-3 w-3 text-orange-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-orange-600">{score.cpuContribution || 0}<span className="text-xs">/10</span></p>
                                  <p className="text-[10px] text-muted-foreground">CPU</p>
                                </div>
                                <div className="bg-gradient-to-br from-pink-500/10 to-pink-500/5 border border-pink-500/30 rounded p-2 text-center">
                                  <MemoryStick className="h-3 w-3 text-pink-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-pink-600">{score.memoriaContribution || 0}<span className="text-xs">/8</span></p>
                                  <p className="text-[10px] text-muted-foreground">Memory</p>
                                </div>
                                <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/30 rounded p-2 text-center">
                                  <Zap className="h-3 w-3 text-cyan-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-cyan-600">{score.ioContribution || 0}<span className="text-xs">/10</span></p>
                                  <p className="text-[10px] text-muted-foreground">I/O</p>
                                </div>
                                <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-500/5 border border-yellow-500/30 rounded p-2 text-center">
                                  <HardDrive className="h-3 w-3 text-yellow-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-yellow-600">{score.discosContribution || 0}<span className="text-xs">/7</span></p>
                                  <p className="text-[10px] text-muted-foreground">Disk</p>
                                </div>
                                
                                {/* Fila 3: Maintenance & Config */}
                                <div className="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/30 rounded p-2 text-center">
                                  <XCircle className="h-3 w-3 text-red-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-red-600">{score.erroresCriticosContribution || 0}<span className="text-xs">/7</span></p>
                                  <p className="text-[10px] text-muted-foreground">Errors</p>
                                </div>
                                <div className="bg-gradient-to-br from-teal-500/10 to-teal-500/5 border border-teal-500/30 rounded p-2 text-center">
                                  <Wrench className="h-3 w-3 text-teal-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-teal-600">{score.mantenimientosContribution || 0}<span className="text-xs">/5</span></p>
                                  <p className="text-[10px] text-muted-foreground">Maint</p>
                                </div>
                                <div className="bg-gradient-to-br from-indigo-500/10 to-indigo-500/5 border border-indigo-500/30 rounded p-2 text-center">
                                  <Settings className="h-3 w-3 text-indigo-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-indigo-600">{score.configuracionTempdbContribution || 0}<span className="text-xs">/8</span></p>
                                  <p className="text-[10px] text-muted-foreground">Config</p>
                                </div>
                                <div className="bg-gradient-to-br from-lime-500/10 to-lime-500/5 border border-lime-500/30 rounded p-2 text-center">
                                  <TrendingUp className="h-3 w-3 text-lime-600 mx-auto mb-1" />
                                  <p className="text-lg font-mono font-bold text-lime-600">{score.autogrowthContribution || 0}<span className="text-xs">/5</span></p>
                                  <p className="text-[10px] text-muted-foreground">Autogrowth</p>
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
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">
                              
                              {/* Backups */}
                              <Card className="border-green-500/20">
                                <CardHeader className="pb-2 bg-green-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Database className="h-4 w-4 text-green-600" />
                                    <span>Backup Status</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      Score: {score.score_Backups || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].backupsDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Full Backup Status</span>
                                        <Badge variant={instanceDetails[score.instanceName].backupsDetails.fullBackupBreached ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].backupsDetails.fullBackupBreached ? 'Overdue' : 'OK'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].backupsDetails.lastFullBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Last FULL Backup</span>
                                          <span className="font-mono">
                                            {formatDateUTC3(instanceDetails[score.instanceName].backupsDetails.lastFullBackup)}
                                          </span>
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Log Backup Status</span>
                                        <Badge variant={instanceDetails[score.instanceName].backupsDetails.logBackupBreached ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].backupsDetails.logBackupBreached ? 'Overdue' : 'OK'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].backupsDetails.lastLogBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Last LOG Backup</span>
                                          <span className="font-mono">
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
                                  <CardHeader className="pb-2 bg-purple-500/5 py-2">
                                    <CardTitle className="text-sm flex items-center gap-2">
                                      <Shield className="h-4 w-4 text-purple-600" />
                                      <span>AlwaysOn AG</span>
                                      <Badge variant="outline" className="ml-auto text-xs">
                                        Score: {score.score_AlwaysOn || 0}/100
                                      </Badge>
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                    {instanceDetails[score.instanceName].alwaysOnDetails ? (
                                      <>
                                        <div className="flex items-center justify-between">
                                          <span className="text-muted-foreground font-medium">Status</span>
                                          <Badge variant="outline" className="text-xs">
                                            {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnEnabled ? 'Enabled' : 'Disabled'}
                                          </Badge>
                                        </div>
                                        {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnEnabled && (
                                          <>
                                          <div className="flex items-center justify-between">
                                              <span className="text-muted-foreground font-medium">Health State</span>
                                            <Badge 
                                              variant={
                                                  instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState === 'HEALTHY' ? 'outline' : 
                                                  instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState === 'WARNING' ? 'default' :
                                                'destructive'
                                              } 
                                                className="text-xs"
                                              >
                                                {instanceDetails[score.instanceName].alwaysOnDetails.alwaysOnWorstState || 'N/A'}
                                            </Badge>
                                          </div>
                                        <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Synchronized Databases</span>
                                              <span className="font-mono font-medium">{instanceDetails[score.instanceName].alwaysOnDetails.synchronizedCount} / {instanceDetails[score.instanceName].alwaysOnDetails.databaseCount}</span>
                                        </div>
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Suspended</span>
                                              <Badge variant={instanceDetails[score.instanceName].alwaysOnDetails.suspendedCount > 0 ? 'destructive' : 'outline'} className="text-xs">
                                                {instanceDetails[score.instanceName].alwaysOnDetails.suspendedCount}
                                              </Badge>
                                    </div>
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Max Lag</span>
                                              <Badge variant={instanceDetails[score.instanceName].alwaysOnDetails.maxSecondsBehind > 30 ? 'default' : 'outline'} className="text-xs">
                                                {instanceDetails[score.instanceName].alwaysOnDetails.maxSecondsBehind}s
                                              </Badge>
                                            </div>
                                            <div className="flex items-center justify-between text-xs">
                                              <span className="text-muted-foreground">Max Send Queue</span>
                                              <span className="font-mono">{(instanceDetails[score.instanceName].alwaysOnDetails.maxSendQueueKB / 1024).toFixed(1)} MB</span>
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
                                <CardHeader className="pb-2 bg-amber-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-amber-600" />
                                    <span>Log Chain Integrity</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_LogChain || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].logChainDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Broken Chains</span>
                                        <Badge variant={instanceDetails[score.instanceName].logChainDetails.brokenChainCount > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].logChainDetails.brokenChainCount}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">FULL DBs w/o LOG Backup</span>
                                        <Badge variant={instanceDetails[score.instanceName].logChainDetails.fullDBsWithoutLogBackup > 0 ? 'default' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].logChainDetails.fullDBsWithoutLogBackup}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Max Hours Since LOG Backup</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup > 24 ? 'destructive' :
                                            instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup > 12 ? 'default' :
                                            'outline'
                                          }
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].logChainDetails.maxHoursSinceLogBackup.toFixed(1)}h
                                        </Badge>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de log chain</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Database States */}
                              <Card className="border-rose-500/20">
                                <CardHeader className="pb-2 bg-rose-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-rose-600" />
                                    <span>Database States</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_DatabaseStates || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].databaseStatesDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Problematic States</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].databaseStatesDetails.offlineCount > 0 ||
                                            instanceDetails[score.instanceName].databaseStatesDetails.suspectCount > 0 ||
                                            instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount > 0
                                            ? 'destructive' : 'outline'
                                          } 
                                          className="text-xs"
                                        >
                                          {instanceDetails[score.instanceName].databaseStatesDetails.offlineCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.suspectCount + 
                                           instanceDetails[score.instanceName].databaseStatesDetails.emergencyCount}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Offline/Suspect/Emergency</span>
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
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">

                              {/* CPU */}
                              <Card className="border-orange-500/20">
                                <CardHeader className="pb-2 bg-orange-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Cpu className="h-4 w-4 text-orange-600" />
                                    <span>CPU</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_CPU || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].cpuDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">SQL Process Utilization</span>
                                        <Badge 
                                          variant={instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization > 80 ? 'destructive' : instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization > 60 ? 'default' : 'outline'} 
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].cpuDetails.sqlProcessUtilization}%
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">P95 CPU Utilization</span>
                                        <span className="font-mono font-medium">{instanceDetails[score.instanceName].cpuDetails.p95CPUPercent}%</span>
                                              </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Runnable Tasks</span>
                                        <Badge variant={instanceDetails[score.instanceName].cpuDetails.runnableTasks > 5 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].cpuDetails.runnableTasks}
                                        </Badge>
                                            </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Avg CPU (10min)</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].cpuDetails.avgCPUPercentLast10Min}%</span>
                                        </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de CPU</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Memoria */}
                              <Card className="border-pink-500/20">
                                <CardHeader className="pb-2 bg-pink-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <MemoryStick className="h-4 w-4 text-pink-600" />
                                    <span>Memory</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_Memoria || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].memoriaDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Page Life Expectancy</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy >= 300 ? 'outline' : 
                                            instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy >= 100 ? 'default' : 
                                            'destructive'
                                          } 
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].memoriaDetails.pageLifeExpectancy}s
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Buffer Cache Hit Ratio</span>
                                        <span className="font-mono font-medium">{instanceDetails[score.instanceName].memoriaDetails.bufferCacheHitRatio.toFixed(2)}%</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Memory Pressure</span>
                                        <Badge variant={instanceDetails[score.instanceName].memoriaDetails.memoryPressure ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].memoriaDetails.memoryPressure ? 'Detected' : 'Normal'}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Memory Grants Pending</span>
                                        <Badge variant={instanceDetails[score.instanceName].memoriaDetails.memoryGrantsPending > 0 ? 'default' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].memoriaDetails.memoryGrantsPending}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Target / Total Memory</span>
                                        <span className="font-mono">{(instanceDetails[score.instanceName].memoriaDetails.targetServerMemoryMB / 1024).toFixed(1)} / {(instanceDetails[score.instanceName].memoriaDetails.totalServerMemoryMB / 1024).toFixed(1)} GB</span>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de memoria</p>
                                  )}
                                </CardContent>
                              </Card>
                              
                              {/* I/O Performance */}
                              <Card className="border-cyan-500/20">
                                <CardHeader className="pb-2 bg-cyan-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Zap className="h-4 w-4 text-cyan-600" />
                                    <span>I/O</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_IO || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].ioDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Avg Read Latency</span>
                                        <Badge 
                                          variant={
                                            instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs <= 10 ? 'outline' : 
                                            instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs <= 20 ? 'default' : 
                                            'destructive'
                                          } 
                                          className="text-xs font-mono"
                                        >
                                          {instanceDetails[score.instanceName].ioDetails.avgReadLatencyMs.toFixed(1)} ms
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Avg Write Latency</span>
                                        <span className="font-mono font-medium">{instanceDetails[score.instanceName].ioDetails.avgWriteLatencyMs.toFixed(1)} ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Total IOPS</span>
                                        <span className="font-mono font-medium">{instanceDetails[score.instanceName].ioDetails.totalIOPS}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Data File Read</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.dataFileAvgReadMs.toFixed(1)} ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Log File Write</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].ioDetails.logFileAvgWriteMs.toFixed(1)} ms</span>
                                      </div>
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de I/O</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Discos */}
                              <Card className="border-yellow-500/20">
                                <CardHeader className="pb-2 bg-yellow-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <HardDrive className="h-4 w-4 text-yellow-600" />
                                    <span>Disk Space</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_Discos || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].discosDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Peor Volumen</span>
                                        <span className={cn(
                                          'font-mono font-bold',
                                          instanceDetails[score.instanceName].discosDetails.worstFreePct < 10 && 'text-destructive',
                                          instanceDetails[score.instanceName].discosDetails.worstFreePct >= 10 && instanceDetails[score.instanceName].discosDetails.worstFreePct < 20 && 'text-warning',
                                          instanceDetails[score.instanceName].discosDetails.worstFreePct >= 20 && 'text-success'
                                        )}>
                                          {instanceDetails[score.instanceName].discosDetails.worstFreePct.toFixed(1)}% libre
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs mt-2">
                                        <span className="text-muted-foreground">Data disks avg</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].discosDetails.dataDiskAvgFreePct.toFixed(1)}%</span>
                                              </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Log disks avg</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].discosDetails.logDiskAvgFreePct.toFixed(1)}%</span>
                                            </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">TempDB disk</span>
                                        <span className="font-mono">{instanceDetails[score.instanceName].discosDetails.tempDBDiskFreePct.toFixed(1)}%</span>
                                        </div>
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
                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-3">

                              {/* Errores Críticos */}
                              <Card className="border-red-500/20">
                                <CardHeader className="pb-2 bg-red-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <XCircle className="h-4 w-4 text-red-600" />
                                    <span>Errores Críticos</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_ErroresCriticos || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].erroresCriticosDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Severity 20+ (24h)</span>
                                        <Badge variant={instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount > 0 ? 'destructive' : 'outline'} className="text-xs font-mono">
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Last Hour</span>
                                        <Badge variant={instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusLast1h > 0 ? 'destructive' : 'outline'} className="text-xs font-mono">
                                          {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusLast1h}
                                          </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].erroresCriticosDetails.severity20PlusCount > 0 && instanceDetails[score.instanceName].erroresCriticosDetails.mostRecentError && (
                                        <div className="pt-2 border-t">
                                          <p className="text-xs text-muted-foreground mb-1">Most Recent Error:</p>
                                          <p className="text-xs font-mono">{formatDateUTC3(instanceDetails[score.instanceName].erroresCriticosDetails.mostRecentError)}</p>
                                        </div>
                                      )}
                                      {instanceDetails[score.instanceName].erroresCriticosDetails.errorDetails && (
                                        <div className="pt-2 border-t">
                                          <p className="text-xs text-muted-foreground line-clamp-3">{instanceDetails[score.instanceName].erroresCriticosDetails.errorDetails}</p>
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de errores críticos</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Configuración & TempDB */}
                              <Card className="border-indigo-500/20">
                                <CardHeader className="pb-2 bg-indigo-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Settings className="h-4 w-4 text-indigo-600" />
                                    <span>Configuración & TempDB</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_ConfiguracionTempdb || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].configuracionTempdbDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">TempDB Files</span>
                                        <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount >= instanceDetails[score.instanceName].configuracionTempdbDetails.cpuCount ? 'outline' : 'default'} className="text-xs">
                                          {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBFileCount}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Same Size & Growth</span>
                                        <div className="flex gap-1">
                                          <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameSize ? 'outline' : 'destructive'} className="text-xs">
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameSize ? '✓' : '✗'}
                                          </Badge>
                                          <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameGrowth ? 'outline' : 'destructive'} className="text-xs">
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAllSameGrowth ? '✓' : '✗'}
                                          </Badge>
                                  </div>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">TempDB Latency</span>
                                        <span className="font-mono font-medium">{instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBAvgLatencyMs.toFixed(1)}ms</span>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Contention Score</span>
                                        <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore > 50 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].configuracionTempdbDetails.tempDBContentionScore}
                                        </Badge>
                                      </div>
                                      <div className="pt-2 border-t">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Max Server Memory</span>
                                          <span className="font-mono">{(instanceDetails[score.instanceName].configuracionTempdbDetails.maxServerMemoryMB / 1024).toFixed(1)} GB</span>
                                        </div>
                                        <div className="flex items-center justify-between text-xs mt-1">
                                          <span className="text-muted-foreground">% of Physical</span>
                                          <Badge variant={instanceDetails[score.instanceName].configuracionTempdbDetails.maxMemoryWithinOptimal ? 'outline' : 'default'} className="text-xs">
                                            {instanceDetails[score.instanceName].configuracionTempdbDetails.maxMemoryPctOfPhysical.toFixed(1)}%
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
                                <CardHeader className="pb-2 bg-teal-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Wrench className="h-4 w-4 text-teal-600" />
                                    <span>Maintenance</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_Maintenance || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].maintenanceDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">CHECKDB Status</span>
                                        <Badge variant={instanceDetails[score.instanceName].maintenanceDetails.checkdbOk ? 'outline' : 'destructive'} className="text-xs">
                                          {instanceDetails[score.instanceName].maintenanceDetails.checkdbOk ? 'OK' : 'Overdue'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].maintenanceDetails.lastCheckdb && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Last CHECKDB</span>
                                          <span className="font-mono">{formatDateUTC3(instanceDetails[score.instanceName].maintenanceDetails.lastCheckdb)}</span>
                                        </div>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Index Optimize</span>
                                        <Badge variant={instanceDetails[score.instanceName].maintenanceDetails.indexOptimizeOk ? 'outline' : 'destructive'} className="text-xs">
                                          {instanceDetails[score.instanceName].maintenanceDetails.indexOptimizeOk ? 'OK' : 'Overdue'}
                                        </Badge>
                                      </div>
                                      {instanceDetails[score.instanceName].maintenanceDetails.lastIndexOptimize && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">Last Optimize</span>
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
                                <CardHeader className="pb-2 bg-lime-500/5 py-2">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <TrendingUp className="h-4 w-4 text-lime-600" />
                                    <span>Autogrowth & Capacity</span>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                      {score.score_Autogrowth || 0}/100
                                    </Badge>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm pt-3 pb-3">
                                  {instanceDetails[score.instanceName].autogrowthDetails ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground font-medium">Autogrowth Events (24h)</span>
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
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Files Near Limit</span>
                                        <Badge variant={instanceDetails[score.instanceName].autogrowthDetails.filesNearLimit > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].autogrowthDetails.filesNearLimit}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Files With Bad Growth</span>
                                        <Badge variant={instanceDetails[score.instanceName].autogrowthDetails.filesWithBadGrowth > 0 ? 'default' : 'outline'} className="text-xs">
                                          {instanceDetails[score.instanceName].autogrowthDetails.filesWithBadGrowth}
                                        </Badge>
                                      </div>
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="text-muted-foreground">Worst % of Max</span>
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

