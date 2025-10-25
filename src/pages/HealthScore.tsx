import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight, HardDrive, Database, AlertCircle, Info, TrendingUp, Shield, Server, Wrench, Cpu, Zap, MemoryStick, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, formatDateUTC3 } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreV3Api, HealthScoreV3Dto } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function HealthScore() {
  const navigate = useNavigate();
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
    const verde = filteredScores.filter(s => s.healthStatus === 'Verde').length;
    const amarillo = filteredScores.filter(s => s.healthStatus === 'Amarillo').length;
    const naranja = filteredScores.filter(s => s.healthStatus === 'Naranja').length;
    const rojo = filteredScores.filter(s => s.healthStatus === 'Rojo').length;
    const avgScore = total > 0 ? Math.round(filteredScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;

    return { total, verde, amarillo, naranja, rojo, avgScore };
  }, [filteredScores]);

  const toggleRow = (instanceName: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(instanceName)) {
      newExpanded.delete(instanceName);
    } else {
      newExpanded.add(instanceName);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Verde': return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'Amarillo': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'Naranja': return <AlertCircle className="h-4 w-4 text-orange-600" />;
      case 'Rojo': return <XCircle className="h-4 w-4 text-red-600" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'Verde': 'bg-green-500/10 text-green-700 border-green-500/20',
      'Amarillo': 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20',
      'Naranja': 'bg-orange-500/10 text-orange-700 border-orange-500/20',
      'Rojo': 'bg-red-500/10 text-red-700 border-red-500/20',
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
                  análisis de <span className="font-bold">10 categorías</span> clave de disponibilidad, continuidad, rendimiento y configuración.
                </p>
              </div>

              {/* Umbrales de estado */}
              <Card className="bg-gradient-to-r from-green-500/5 via-yellow-500/5 via-orange-500/5 to-red-500/5 border-dashed">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3">Semáforo de 4 Colores</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                      <CheckCircle2 className="h-6 w-6 text-green-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-green-600">🟢 VERDE</p>
                      <p className="text-center text-lg font-mono font-bold text-green-600">≥85 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Óptimo</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                      <AlertTriangle className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-yellow-600">🟡 AMARILLO</p>
                      <p className="text-center text-lg font-mono font-bold text-yellow-600">70-84 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Advertencia</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                      <AlertCircle className="h-6 w-6 text-orange-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-orange-600">🟠 NARANJA</p>
                      <p className="text-center text-lg font-mono font-bold text-orange-600">50-69 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Riesgo</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                      <XCircle className="h-6 w-6 text-red-600 mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-red-600">🔴 ROJO</p>
                      <p className="text-center text-lg font-mono font-bold text-red-600">{'<'}50 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">Crítico</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Categorías explicadas */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">10 Categorías de Evaluación v3.0</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Cada categoría aporta hasta 10 puntos (100 pts total). Ponderación basada en impacto operacional.
                </p>
              </div>

              {/* Grid de 10 categorías */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* 1. Conectividad */}
                <Card className="bg-blue-500/5 border-blue-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="h-4 w-4 text-blue-500" />
                      <span className="font-semibold text-sm">1. Conectividad</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Latencia {'<'}200ms + sin blocking masivo</p>
                  </CardContent>
                </Card>

                {/* 2. AlwaysOn */}
                <Card className="bg-purple-500/5 border-purple-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      <span className="font-semibold text-sm">2. AlwaysOn</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Si aplica: sincronización OK, lag {'<'}5 seg</p>
                  </CardContent>
                </Card>

                {/* 3. Backups */}
                <Card className="bg-green-500/5 border-green-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Database className="h-4 w-4 text-green-500" />
                      <span className="font-semibold text-sm">3. Backups</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">FULL {'<'}24h + LOG {'<'}2h (si aplica)</p>
                  </CardContent>
                </Card>

                {/* 4. Errores Críticos */}
                <Card className="bg-red-500/5 border-red-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span className="font-semibold text-sm">4. Errores Críticos</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Severity ≥20 en últimas 24h</p>
                  </CardContent>
                </Card>

                {/* 5. CPU */}
                <Card className="bg-orange-500/5 border-orange-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold text-sm">5. CPU</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Uso SQL {'<'}80% + sin runnable tasks</p>
                  </CardContent>
                </Card>

                {/* 6. I/O */}
                <Card className="bg-cyan-500/5 border-cyan-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-cyan-500" />
                      <span className="font-semibold text-sm">6. I/O (Latencia / IOPS)</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Latencia data {'<'}20ms + log {'<'}10ms</p>
                  </CardContent>
                </Card>

                {/* 7. Discos */}
                <Card className="bg-yellow-500/5 border-yellow-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <HardDrive className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold text-sm">7. Espacio en Discos</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">Volúmenes críticos con ≥20% libre</p>
                  </CardContent>
                </Card>

                {/* 8. Memoria */}
                <Card className="bg-pink-500/5 border-pink-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <MemoryStick className="h-4 w-4 text-pink-500" />
                      <span className="font-semibold text-sm">8. Memoria (PLE + Grants)</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">PLE ≥300 seg + grants sin pendientes</p>
                  </CardContent>
                </Card>

                {/* 9. Configuración & TempDB */}
                <Card className="bg-indigo-500/5 border-indigo-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Settings className="h-4 w-4 text-indigo-500" />
                      <span className="font-semibold text-sm">9. Configuración & TempDB</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">TempDB bien configurado + max memory óptimo</p>
                  </CardContent>
                </Card>

                {/* 10. Maintenance */}
                <Card className="bg-teal-500/5 border-teal-500/20">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="h-4 w-4 text-teal-500" />
                      <span className="font-semibold text-sm">10. Maintenance</span>
                      <Badge variant="outline" className="ml-auto">10 pts</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">CHECKDB + Index Optimize ({'<'}7 días)</p>
                  </CardContent>
                </Card>
              </div>

              {/* Resumen visual */}
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3">Resumen de Puntuación</h4>
                  <div className="text-center">
                    <p className="text-2xl font-mono font-bold text-blue-500">10 categorías × 10 pts = 100 pts</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Todas las categorías tienen el mismo peso. El score final es la suma de todas.
                    </p>
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
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold font-mono">{stats.total}</p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🟢 Verde</p>
                <p className="text-2xl font-bold font-mono text-green-600">{stats.verde}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-yellow-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🟡 Amarillo</p>
                <p className="text-2xl font-bold font-mono text-yellow-600">{stats.amarillo}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🟠 Naranja</p>
                <p className="text-2xl font-bold font-mono text-orange-600">{stats.naranja}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-red-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🔴 Rojo</p>
                <p className="text-2xl font-bold font-mono text-red-600">{stats.rojo}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Score Promedio</p>
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
              <label className="text-xs text-muted-foreground mb-2 block">Estado</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">Todos</SelectItem>
                  <SelectItem value="Verde">🟢 Verde</SelectItem>
                  <SelectItem value="Amarillo">🟡 Amarillo</SelectItem>
                  <SelectItem value="Naranja">🟠 Naranja</SelectItem>
                  <SelectItem value="Rojo">🔴 Rojo</SelectItem>
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
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent text-right"
                  onClick={() => requestSort('connectLatencyMs')}
                >
                  Latencia {getSortIndicator('connectLatencyMs')}
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
                      <TableCell className="text-right font-mono text-xs py-2">
                        {score.connectSuccess ? (
                          `${score.connectLatencyMs || 0}ms`
                        ) : (
                          <span className="text-destructive">Failed</span>
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Fila Expandida con Detalles */}
                    {expandedRows.has(score.instanceName) && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-accent/20 p-6">
                          <div className="space-y-6">
                            {/* Header con Info General */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div>
                                <p className="text-xs text-muted-foreground">Versión</p>
                                <p className="text-sm font-medium">{score.version || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Última Actualización</p>
                                <p className="text-sm font-medium">
                                  {formatDateUTC3(score.generatedAtUtc)}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Conectividad</p>
                                <div className="flex items-center gap-2">
                                  {score.connectSuccess ? (
                                    <CheckCircle2 className="h-4 w-4 text-success" />
                                  ) : (
                                    <XCircle className="h-4 w-4 text-destructive" />
                                  )}
                                  <span className="text-sm font-medium">
                                    {score.connectSuccess ? 'Conectado' : 'Sin conexión'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Botón Ver Tendencias */}
                            <div className="flex justify-end">
                              <Button
                                onClick={() => navigate(`/instance-trends/${encodeURIComponent(score.instanceName)}`)}
                                className="flex items-center gap-2"
                                variant="outline"
                                size="sm"
                              >
                                <TrendingUp className="h-4 w-4" />
                                Ver Tendencias Históricas
                              </Button>
                            </div>

                            {/* v3.0: Breakdown por 10 Categorías */}
                            <Card className="bg-gradient-to-r from-blue-500/5 via-purple-500/5 to-green-500/5">
                              <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center justify-between">
                                  <span>📊 Breakdown por Categorías v3.0</span>
                                  <span className="text-lg font-mono font-bold">{score.healthScore}/100</span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                  <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Activity className="h-3 w-3 text-blue-500" />
                                      <p className="text-xs text-muted-foreground">Conectividad</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-blue-500">{score.score_Conectividad || 0}/10</p>
                                  </div>
                                  <div className="bg-purple-500/5 border border-purple-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Shield className="h-3 w-3 text-purple-500" />
                                      <p className="text-xs text-muted-foreground">AlwaysOn</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-purple-500">{score.score_AlwaysOn || 0}/10</p>
                                  </div>
                                  <div className="bg-green-500/5 border border-green-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Database className="h-3 w-3 text-green-500" />
                                      <p className="text-xs text-muted-foreground">Backups</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-green-500">{score.score_Backups || 0}/10</p>
                                  </div>
                                  <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <XCircle className="h-3 w-3 text-red-500" />
                                      <p className="text-xs text-muted-foreground">Errores Crític.</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-red-500">{score.score_ErroresCriticos || 0}/10</p>
                                  </div>
                                  <div className="bg-orange-500/5 border border-orange-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Cpu className="h-3 w-3 text-orange-500" />
                                      <p className="text-xs text-muted-foreground">CPU</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-orange-500">{score.score_CPU || 0}/10</p>
                                  </div>
                                  <div className="bg-cyan-500/5 border border-cyan-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Zap className="h-3 w-3 text-cyan-500" />
                                      <p className="text-xs text-muted-foreground">I/O</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-cyan-500">{score.score_IO || 0}/10</p>
                                  </div>
                                  <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <HardDrive className="h-3 w-3 text-yellow-500" />
                                      <p className="text-xs text-muted-foreground">Discos</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-yellow-500">{score.score_Discos || 0}/10</p>
                                  </div>
                                  <div className="bg-pink-500/5 border border-pink-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <MemoryStick className="h-3 w-3 text-pink-500" />
                                      <p className="text-xs text-muted-foreground">Memoria</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-pink-500">{score.score_Memoria || 0}/10</p>
                                  </div>
                                  <div className="bg-indigo-500/5 border border-indigo-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Settings className="h-3 w-3 text-indigo-500" />
                                      <p className="text-xs text-muted-foreground">Config / TempDB</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-indigo-500">{score.score_ConfiguracionTempdb || 0}/10</p>
                                  </div>
                                  <div className="bg-teal-500/5 border border-teal-500/20 rounded p-2">
                                    <div className="flex items-center gap-1 mb-1">
                                      <Wrench className="h-3 w-3 text-teal-500" />
                                      <p className="text-xs text-muted-foreground">Maintenance</p>
                                    </div>
                                    <p className="text-base font-mono font-bold text-teal-500">{score.score_Maintenance || 0}/10</p>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>

                            {/* Grids de Detalles */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Backups & Maintenance */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    Backups & Mantenimiento
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  {score.maintenanceSummary && (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">CHECKDB</span>
                                        <Badge variant={score.maintenanceSummary.checkdbOk ? 'outline' : 'destructive'} className="text-xs">
                                          {score.maintenanceSummary.checkdbOk ? '✓ OK' : '✗ Vencido'}
                                        </Badge>
                                      </div>
                                      {score.maintenanceSummary.lastCheckdb && (
                                        <p className="text-xs text-muted-foreground pl-4">
                                          Último: {score.maintenanceSummary.lastCheckdb}
                                        </p>
                                      )}
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Index Optimize</span>
                                        <Badge variant={score.maintenanceSummary.indexOptimizeOk ? 'outline' : 'destructive'} className="text-xs">
                                          {score.maintenanceSummary.indexOptimizeOk ? '✓ OK' : '✗ Vencido'}
                                        </Badge>
                                      </div>
                                      {score.maintenanceSummary.lastIndexOptimize && (
                                        <p className="text-xs text-muted-foreground pl-4">
                                          Último: {score.maintenanceSummary.lastIndexOptimize}
                                        </p>
                                      )}
                                    </>
                                  )}
                                  
                                  {/* Backups - Información adicional */}
                                  {score.backupSummary && (
                                    <div className="mt-2 pt-2 border-t space-y-1">
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Últimos Backups:</p>
                                      {score.backupSummary.lastFullBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">FULL</span>
                                          <span className="font-mono">
                                            {formatDateUTC3(score.backupSummary.lastFullBackup)}
                                          </span>
                                        </div>
                                      )}
                                      {score.backupSummary.lastDiffBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">DIFF</span>
                                          <span className="font-mono">
                                            {formatDateUTC3(score.backupSummary.lastDiffBackup)}
                                          </span>
                                        </div>
                                      )}
                                      {score.backupSummary.lastLogBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">LOG</span>
                                          <span className="font-mono">
                                            {formatDateUTC3(score.backupSummary.lastLogBackup)}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  
                                  {score.backupSummary?.breaches && score.backupSummary.breaches.length > 0 && (
                                    <div className="mt-2 pt-2 border-t">
                                      <p className="text-xs font-medium text-destructive mb-1">Problemas de Backup:</p>
                                      {score.backupSummary.breaches.map((breach, idx) => (
                                        <p key={idx} className="text-xs text-muted-foreground pl-2">• {breach}</p>
                                      ))}
                                    </div>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Discos */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <HardDrive className="h-4 w-4" />
                                    Almacenamiento
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  {score.diskSummary && score.diskSummary.worstFreePct !== null && score.diskSummary.worstFreePct !== undefined ? (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Peor Volumen</span>
                                        <span className={cn(
                                          'font-mono font-bold',
                                          (score.diskSummary.worstFreePct || 0) < 10 && 'text-destructive',
                                          (score.diskSummary.worstFreePct || 0) >= 10 && (score.diskSummary.worstFreePct || 0) < 20 && 'text-warning',
                                          (score.diskSummary.worstFreePct || 0) >= 20 && 'text-success'
                                        )}>
                                          {score.diskSummary.worstFreePct?.toFixed(1)}% libre
                                        </span>
                                      </div>
                                      {score.diskSummary.volumes && score.diskSummary.volumes.length > 0 && (
                                        <div className="mt-2 pt-2 border-t space-y-1">
                                          {score.diskSummary.volumes.map((vol, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs">
                                              <span className="font-mono">{vol.drive}</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-muted-foreground">
                                                  {vol.freeGB?.toFixed(1)} / {vol.totalGB?.toFixed(1)} GB
                                                </span>
                                                <span className={cn(
                                                  'font-mono font-bold',
                                                  (vol.freePct || 0) < 10 && 'text-destructive',
                                                  (vol.freePct || 0) >= 10 && (vol.freePct || 0) < 20 && 'text-warning',
                                                  (vol.freePct || 0) >= 20 && 'text-success'
                                                )}>
                                                  {vol.freePct?.toFixed(1)}%
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <p className="text-xs text-muted-foreground">Sin datos de discos</p>
                                  )}
                                </CardContent>
                              </Card>

                              {/* Recursos v2.0: Nuevas métricas */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <Activity className="h-4 w-4" />
                                    Performance & Recursos (v2.0)
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  {score.resourceSummary && (
                                    <>
                                      {/* Memory / PLE */}
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-muted-foreground">🧠 Page Life Exp</span>
                                        <Badge 
                                          variant={
                                            (score.resourceSummary.pageLifeExpectancy || 0) >= 300 ? 'outline' : 
                                            (score.resourceSummary.pageLifeExpectancy || 0) >= 100 ? 'default' : 
                                            'destructive'
                                          } 
                                          className="text-xs"
                                        >
                                          {score.resourceSummary.pageLifeExpectancy || 0} seg
                                        </Badge>
                                      </div>
                                      {(score.resourceSummary.pageLifeExpectancy || 0) < 300 && (
                                        <p className="text-xs text-warning pl-4">
                                          {(score.resourceSummary.pageLifeExpectancy || 0) < 100 ? '⚠️ Memory pressure crítica!' : '⚠️ Memory pressure'}
                                        </p>
                                      )}
                                      
                                      {/* IOPS / Latencia */}
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-muted-foreground">⚡ I/O Latencia</span>
                                        <Badge 
                                          variant={
                                            (score.resourceSummary.avgReadLatencyMs || 0) <= 10 ? 'outline' : 
                                            (score.resourceSummary.avgReadLatencyMs || 0) <= 20 ? 'default' : 
                                            'destructive'
                                          } 
                                          className="text-xs"
                                        >
                                          {score.resourceSummary.avgReadLatencyMs?.toFixed(1) || 0}ms read
                                        </Badge>
                                      </div>
                                      {(score.resourceSummary.avgWriteLatencyMs || 0) > 0 && (
                                        <p className="text-xs text-muted-foreground pl-4">
                                          Write: {score.resourceSummary.avgWriteLatencyMs?.toFixed(1)}ms
                                        </p>
                                      )}
                                      {(score.resourceSummary.avgReadLatencyMs || 0) <= 10 && (
                                        <p className="text-xs text-success pl-4">✅ SSD excelente</p>
                                      )}
                                      {(score.resourceSummary.avgReadLatencyMs || 0) > 20 && (
                                        <p className="text-xs text-warning pl-4">⚠️ Disco lento (HDD o SSD saturado)</p>
                                      )}
                                    </>
                                  )}
                                </CardContent>
                              </Card>

                              {/* AlwaysOn & Errorlog */}
                              <Card>
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4" />
                                    AlwaysOn & Errores
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                  {score.alwaysOnSummary && (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">AlwaysOn</span>
                                        <Badge variant="outline" className="text-xs">
                                          {score.alwaysOnSummary.enabled ? 'Habilitado' : 'Deshabilitado'}
                                        </Badge>
                                      </div>
                                      {score.alwaysOnSummary.enabled && (
                                        <div className="flex items-center justify-between">
                                          <span className="text-muted-foreground">Estado</span>
                                          <Badge 
                                            variant={
                                              score.alwaysOnSummary.worstState === 'OK' || score.alwaysOnSummary.worstState === 'HEALTHY' ? 'outline' : 
                                              score.alwaysOnSummary.worstState === 'WARNING' || score.alwaysOnSummary.worstState === 'PARTIALLY_HEALTHY' ? 'default' :
                                              'destructive'
                                            } 
                                            className={cn(
                                              'text-xs',
                                              (score.alwaysOnSummary.worstState === 'OK' || score.alwaysOnSummary.worstState === 'HEALTHY') && 'border-green-500 text-green-700',
                                              (score.alwaysOnSummary.worstState === 'WARNING' || score.alwaysOnSummary.worstState === 'PARTIALLY_HEALTHY') && 'border-yellow-500 text-yellow-700 bg-yellow-50'
                                            )}
                                          >
                                            {score.alwaysOnSummary.worstState}
                                          </Badge>
                                        </div>
                                      )}
                                      {score.alwaysOnSummary.issues && score.alwaysOnSummary.issues.length > 0 && (
                                        <div className="mt-2 pt-2 border-t">
                                          <p className="text-xs font-medium text-destructive mb-1">Issues:</p>
                                          {score.alwaysOnSummary.issues.map((issue, idx) => (
                                            <p key={idx} className="text-xs text-muted-foreground pl-2">• {issue}</p>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  )}
                                  <div className="pt-2 border-t">
                                    {score.errorlogSummary && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Errores Críticos (24h)</span>
                                        <Badge variant={(score.errorlogSummary.severity20PlusCount24h || 0) > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {score.errorlogSummary.severity20PlusCount24h || 0}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>
                          </div>
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

