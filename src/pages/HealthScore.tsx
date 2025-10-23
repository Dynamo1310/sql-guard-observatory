import { useState, useEffect, useMemo } from 'react';
import { Activity, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight, HardDrive, Database, AlertCircle, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreApi, HealthScoreDto } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function HealthScore() {
  const [healthScores, setHealthScores] = useState<HealthScoreDto[]>([]);
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
      const data = await healthScoreApi.getHealthScores();
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
    const critical = filteredScores.filter(s => s.healthStatus === 'Critical').length;
    const avgScore = total > 0 ? Math.round(filteredScores.reduce((sum, s) => sum + s.healthScore, 0) / total) : 0;

    return { total, healthy, warning, critical, avgScore };
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
      case 'Healthy': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'Warning': return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'Critical': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, string> = {
      'Healthy': 'bg-success/10 text-success border-success/20',
      'Warning': 'bg-warning/10 text-warning border-warning/20',
      'Critical': 'bg-destructive/10 text-destructive border-destructive/20',
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
                  📊 ¿Qué es el Health Score v2.0?
                </p>
                <p className="text-sm text-muted-foreground">
                  Es un número <span className="font-bold text-foreground">de 0 a 150 puntos</span> que mide qué tan saludable está tu instancia SQL Server. 
                  Piénsalo como un <span className="font-semibold">examen médico</span>: revisa conectividad, backups, recursos, mantenimiento y más.
                </p>
              </div>

              {/* Explicación simple de estados */}
              <Card className="bg-gradient-to-r from-green-500/5 via-yellow-500/5 to-red-500/5 border-dashed">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    🎯 ¿Cómo interpretar el puntaje?
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-success/10 border border-success/30 rounded-lg p-3">
                      <CheckCircle2 className="h-6 w-6 text-success mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-success">✅ HEALTHY</p>
                      <p className="text-center text-lg font-mono font-bold text-success">135-150 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">(≥90% del máximo)</p>
                      <p className="text-center text-xs text-muted-foreground mt-2">Todo funciona bien</p>
                    </div>
                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                      <AlertTriangle className="h-6 w-6 text-warning mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-warning">⚠️ WARNING</p>
                      <p className="text-center text-lg font-mono font-bold text-warning">105-134 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">(70-89% del máximo)</p>
                      <p className="text-center text-xs text-muted-foreground mt-2">Requiere atención</p>
                    </div>
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3">
                      <XCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
                      <p className="text-center text-xs font-bold text-destructive">🚨 CRITICAL</p>
                      <p className="text-center text-lg font-mono font-bold text-destructive">{'<'}105 pts</p>
                      <p className="text-center text-xs text-muted-foreground mt-1">({'<'}70% del máximo)</p>
                      <p className="text-center text-xs text-muted-foreground mt-2">Acción inmediata</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tiers explicados */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span>🔍</span> ¿Cómo se calculan los 150 puntos?
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  El score se divide en <span className="font-semibold text-foreground">4 categorías (Tiers)</span> según su importancia:
                </p>
              </div>

              {/* Tier 1: Disponibilidad */}
              <Card className="bg-red-500/5 border-red-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-500/10 flex items-center justify-center">
                      <Activity className="h-6 w-6 text-red-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-sm">🚨 Tier 1: Disponibilidad</h4>
                          <p className="text-xs text-muted-foreground">Lo más crítico - sin esto, nada funciona</p>
                        </div>
                        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-lg px-3">50 pts</Badge>
                      </div>
                      <div className="grid gap-2 mt-3">
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🔌 Conectividad (20 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Puedo conectarme? ¿Responde rápido?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">20 pts</span>: Conecta + latencia ≤10ms (excelente)</li>
                            <li>• <span className="text-warning font-medium">15-18 pts</span>: Conecta + latencia 10-100ms</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: No conecta o {'>'} 100ms</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🚫 Blocking (10 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Hay usuarios esperando bloqueados?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">10 pts</span>: 0 queries bloqueados ✅</li>
                            <li>• <span className="text-warning font-medium">7 pts</span>: 1-3 bloqueados (tolerable)</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: 10+ bloqueados 💥</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🧠 Memoria / PLE (10 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Hay suficiente RAM? (Page Life Expectancy)</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">10 pts</span>: PLE ≥300 seg (5+ min = excelente)</li>
                            <li>• <span className="text-warning font-medium">3-7 pts</span>: PLE 100-299 seg</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: PLE {'<'}100 seg (memory pressure!)</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🔄 AlwaysOn (10 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Los nodos del AG están sincronizados?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">10 pts</span>: Sin AG (N/A) o sincronizado</li>
                            <li>• <span className="text-warning font-medium">5 pts</span>: Parcialmente sincronizado</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: No sincronizado</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tier 2: Continuidad */}
              <Card className="bg-orange-500/5 border-orange-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <Database className="h-6 w-6 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-sm">💾 Tier 2: Continuidad</h4>
                          <p className="text-xs text-muted-foreground">¿Puedo recuperarme de un desastre?</p>
                        </div>
                        <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-lg px-3">40 pts</Badge>
                      </div>
                      <div className="grid gap-2 mt-3">
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">💾 FULL Backup (15 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Tengo backup completo reciente?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">15 pts</span>: Todas las DBs con backup {'<'}24h</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Alguna DB sin backup o {'>'} 24h</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">📝 LOG Backup (15 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Tengo backup de logs reciente? (solo DBs FULL recovery)</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">15 pts</span>: Todas las DBs FULL con LOG {'<'}2h</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Alguna DB FULL sin LOG o {'>'} 2h</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <p className="text-xs text-muted-foreground italic">
                            💡 <span className="font-semibold">Tip para juniors:</span> Los backups son tu seguro de vida. Sin ellos, un disco roto = pérdida total de datos.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tier 3: Recursos */}
              <Card className="bg-yellow-500/5 border-yellow-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                      <HardDrive className="h-6 w-6 text-yellow-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-sm">💻 Tier 3: Recursos</h4>
                          <p className="text-xs text-muted-foreground">¿Tengo suficiente espacio e I/O rápido?</p>
                        </div>
                        <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-lg px-3">40 pts</Badge>
                      </div>
                      <div className="grid gap-2 mt-3">
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">💿 Disk Space (15 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Hay espacio libre en los discos?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">15 pts</span>: Peor disco ≥30% libre</li>
                            <li>• <span className="text-warning font-medium">10 pts</span>: Peor disco 20-29% libre</li>
                            <li>• <span className="text-warning font-medium">5 pts</span>: Peor disco 10-19% libre</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Peor disco {'<'}10% libre 💥</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">⚡ IOPS / Latencia (15 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Los discos responden rápido?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">15 pts</span>: Latencia ≤10ms (SSD excelente)</li>
                            <li>• <span className="text-success font-medium">12 pts</span>: Latencia 11-20ms (SSD normal)</li>
                            <li>• <span className="text-warning font-medium">7 pts</span>: Latencia 21-50ms (HDD o SSD lento)</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Latencia {'>'} 50ms (muy lento)</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🐌 Query Performance (10 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Hay queries lentos ejecutándose ahora?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">10 pts</span>: 0 queries {'>'} 30 segundos</li>
                            <li>• <span className="text-warning font-medium">7 pts</span>: 1-3 queries lentos</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: 10+ queries lentos</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <p className="text-xs text-muted-foreground italic">
                            💡 <span className="font-semibold">Tip para juniors:</span> Latencia {'<'}10ms = SSD, {'>'}20ms = probablemente HDD. IOPS bajo = usuarios esperando.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tier 4: Mantenimiento */}
              <Card className="bg-green-500/5 border-green-500/20">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                      <AlertCircle className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h4 className="font-semibold text-sm">🔧 Tier 4: Mantenimiento</h4>
                          <p className="text-xs text-muted-foreground">¿El mantenimiento está al día?</p>
                        </div>
                        <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 text-lg px-3">20 pts</Badge>
                      </div>
                      <div className="grid gap-2 mt-3">
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🔍 CHECKDB (10 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Revisé integridad de datos?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">10 pts</span>: IntegrityCheck OK en últimos 7 días</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Falló o {'>'} 7 días sin ejecutar</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">🔧 IndexOptimize (5 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Optimicé los índices?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">5 pts</span>: IndexOptimize OK en últimos 7 días</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: Falló o {'>'} 7 días sin ejecutar</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">⚠️ Errorlog (5 pts)</span>
                          </div>
                          <p className="text-xs text-muted-foreground">¿Hay errores críticos en las últimas 24h?</p>
                          <ul className="text-xs space-y-1 text-muted-foreground mt-1 ml-3">
                            <li>• <span className="text-success font-medium">5 pts</span>: 0 errores severity ≥20</li>
                            <li>• <span className="text-warning font-medium">3 pts</span>: 1-2 errores severity ≥20</li>
                            <li>• <span className="text-destructive font-medium">0 pts</span>: 3+ errores severity ≥20</li>
                          </ul>
                        </div>
                        <div className="bg-background/50 rounded p-2">
                          <p className="text-xs text-muted-foreground italic">
                            💡 <span className="font-semibold">Tip para juniors:</span> Severity 20+ = errores MUY graves (corrupción, crashes, etc.). Si ves uno, léelo!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Resumen visual */}
              <Card className="bg-blue-500/5 border-blue-500/20">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <span>📊</span> Resumen: ¿Cómo se suman los puntos?
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between bg-red-500/5 p-2 rounded">
                      <span className="font-medium">🚨 Tier 1: Disponibilidad</span>
                      <span className="font-mono font-bold text-red-500">50 pts (33%)</span>
                    </div>
                    <div className="flex items-center justify-between bg-orange-500/5 p-2 rounded">
                      <span className="font-medium">💾 Tier 2: Continuidad</span>
                      <span className="font-mono font-bold text-orange-500">40 pts (27%)</span>
                    </div>
                    <div className="flex items-center justify-between bg-yellow-500/5 p-2 rounded">
                      <span className="font-medium">💻 Tier 3: Recursos</span>
                      <span className="font-mono font-bold text-yellow-500">40 pts (27%)</span>
                    </div>
                    <div className="flex items-center justify-between bg-green-500/5 p-2 rounded">
                      <span className="font-medium">🔧 Tier 4: Mantenimiento</span>
                      <span className="font-mono font-bold text-green-500">20 pts (13%)</span>
                    </div>
                    <div className="flex items-center justify-between bg-blue-500/10 p-3 rounded border-2 border-blue-500/30 mt-3">
                      <span className="font-bold">TOTAL HEALTH SCORE</span>
                      <span className="font-mono text-xl font-bold text-blue-500">150 pts (100%)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Guía rápida de acción */}
              <Card className="bg-gradient-to-r from-red-500/10 via-yellow-500/10 to-green-500/10 border-dashed">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <span>🚨</span> Guía Rápida: ¿Qué hago si veo...?
                  </h4>
                  <div className="grid gap-2 text-xs">
                    <div className="flex items-start gap-2 bg-destructive/5 p-2 rounded">
                      <span className="font-bold text-destructive">{'<'}105 pts:</span>
                      <span className="text-muted-foreground">Problema SERIO → Escalar a senior inmediatamente</span>
                    </div>
                    <div className="flex items-start gap-2 bg-warning/5 p-2 rounded">
                      <span className="font-bold text-warning">105-119 pts:</span>
                      <span className="text-muted-foreground">Investigar HOY → Fix en próximas horas</span>
                    </div>
                    <div className="flex items-start gap-2 bg-warning/5 p-2 rounded">
                      <span className="font-bold text-warning">120-134 pts:</span>
                      <span className="text-muted-foreground">Revisar breakdown → Planear fix en próximos días</span>
                    </div>
                    <div className="flex items-start gap-2 bg-success/5 p-2 rounded">
                      <span className="font-bold text-success">135-150 pts:</span>
                      <span className="text-muted-foreground">Todo bien ✅ → Monitoreo normal</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Estadísticas Resumidas */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-2 lg:grid-cols-5">
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

        <Card className="gradient-card shadow-card border-success/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Healthy</p>
                <p className="text-2xl font-bold font-mono text-success">{stats.healthy}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-warning/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Warning</p>
                <p className="text-2xl font-bold font-mono text-warning">{stats.warning}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Critical</p>
                <p className="text-2xl font-bold font-mono text-destructive">{stats.critical}</p>
              </div>
              <XCircle className="h-8 w-8 text-destructive" />
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
                  <SelectItem value="Healthy">Healthy</SelectItem>
                  <SelectItem value="Warning">Warning</SelectItem>
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
                          score.healthScore >= 135 && 'text-success',
                          score.healthScore >= 105 && score.healthScore < 135 && 'text-warning',
                          score.healthScore < 105 && 'text-destructive'
                        )}>
                          {score.healthScore}
                          <span className="text-xs text-muted-foreground">/150</span>
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          <Progress 
                            value={(score.healthScore / 150) * 100} 
                            className={cn(
                              'h-2 w-24',
                              score.healthScore >= 135 && '[&>div]:bg-success',
                              score.healthScore >= 105 && score.healthScore < 135 && '[&>div]:bg-warning',
                              score.healthScore < 105 && '[&>div]:bg-destructive'
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
                                  {new Date(score.generatedAtUtc).toLocaleString('es-AR')}
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

                            {/* v2.0: Breakdown por Tiers */}
                            {(score.tier1_Availability || score.tier2_Continuity || score.tier3_Resources || score.tier4_Maintenance) && (
                              <Card className="bg-gradient-to-r from-red-500/5 via-orange-500/5 via-yellow-500/5 to-green-500/5">
                                <CardHeader className="pb-3">
                                  <CardTitle className="text-sm flex items-center justify-between">
                                    <span>📊 Breakdown por Tiers (150 pts)</span>
                                    <span className="text-lg font-mono font-bold">{score.healthScore}/150</span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                    <div className="bg-red-500/5 border border-red-500/20 rounded p-2">
                                      <p className="text-xs text-muted-foreground mb-1">🚨 T1: Disponibilidad</p>
                                      <p className="text-lg font-mono font-bold text-red-500">{score.tier1_Availability || 0}/50</p>
                                    </div>
                                    <div className="bg-orange-500/5 border border-orange-500/20 rounded p-2">
                                      <p className="text-xs text-muted-foreground mb-1">💾 T2: Continuidad</p>
                                      <p className="text-lg font-mono font-bold text-orange-500">{score.tier2_Continuity || 0}/40</p>
                                    </div>
                                    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded p-2">
                                      <p className="text-xs text-muted-foreground mb-1">💻 T3: Recursos</p>
                                      <p className="text-lg font-mono font-bold text-yellow-500">{score.tier3_Resources || 0}/40</p>
                                    </div>
                                    <div className="bg-green-500/5 border border-green-500/20 rounded p-2">
                                      <p className="text-xs text-muted-foreground mb-1">🔧 T4: Mantenimiento</p>
                                      <p className="text-lg font-mono font-bold text-green-500">{score.tier4_Maintenance || 0}/20</p>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )}

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
                                            {new Date(score.backupSummary.lastFullBackup).toLocaleString('es-AR', { 
                                              year: 'numeric', 
                                              month: '2-digit', 
                                              day: '2-digit', 
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      {score.backupSummary.lastDiffBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">DIFF</span>
                                          <span className="font-mono">
                                            {new Date(score.backupSummary.lastDiffBackup).toLocaleString('es-AR', { 
                                              year: 'numeric', 
                                              month: '2-digit', 
                                              day: '2-digit', 
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            })}
                                          </span>
                                        </div>
                                      )}
                                      {score.backupSummary.lastLogBackup && (
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="text-muted-foreground">LOG</span>
                                          <span className="font-mono">
                                            {new Date(score.backupSummary.lastLogBackup).toLocaleString('es-AR', { 
                                              year: 'numeric', 
                                              month: '2-digit', 
                                              day: '2-digit', 
                                              hour: '2-digit', 
                                              minute: '2-digit' 
                                            })}
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
                                  {score.diskSummary && (
                                    <>
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Peor Volumen</span>
                                        <span className={cn(
                                          'font-mono font-bold',
                                          (score.diskSummary.worstVolumeFreePct || 0) < 10 && 'text-destructive',
                                          (score.diskSummary.worstVolumeFreePct || 0) >= 10 && (score.diskSummary.worstVolumeFreePct || 0) < 20 && 'text-warning',
                                          (score.diskSummary.worstVolumeFreePct || 0) >= 20 && 'text-success'
                                        )}>
                                          {score.diskSummary.worstVolumeFreePct?.toFixed(1)}% libre
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
                                      {/* Blocking */}
                                      <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">🚫 Blocking</span>
                                        <Badge variant={(score.resourceSummary.blockingCount || 0) > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {score.resourceSummary.blockingCount || 0} bloqueados
                                        </Badge>
                                      </div>
                                      {(score.resourceSummary.maxBlockTimeSeconds || 0) > 0 && (
                                        <p className="text-xs text-muted-foreground pl-4">
                                          Máx tiempo: {score.resourceSummary.maxBlockTimeSeconds}s
                                        </p>
                                      )}
                                      
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
                                      
                                      {/* Queries lentos */}
                                      <div className="flex items-center justify-between mt-2">
                                        <span className="text-muted-foreground">🐌 Queries Lentos</span>
                                        <Badge variant={(score.resourceSummary.slowQueriesCount || 0) > 0 ? 'destructive' : 'outline'} className="text-xs">
                                          {score.resourceSummary.slowQueriesCount || 0} activos
                                        </Badge>
                                      </div>
                                      {(score.resourceSummary.longRunningQueriesCount || 0) > 0 && (
                                        <p className="text-xs text-destructive pl-4">
                                          {score.resourceSummary.longRunningQueriesCount} muy lentos ({'>'} 5 min)
                                        </p>
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
                                          <Badge variant={score.alwaysOnSummary.worstState === 'OK' ? 'outline' : 'destructive'} className="text-xs">
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

