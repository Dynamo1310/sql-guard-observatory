import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight, TrendingUp, Info, Shield, Database, Server, Wrench, Zap, HardDrive, Brain, Clock, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn, formatDateUTC3 } from '@/lib/utils';
import { useTableSort } from '@/hooks/use-table-sort';
import { healthScoreV2Api, HealthScoreV2Dto } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export default function HealthScoreV2() {
  const navigate = useNavigate();
  const [healthScores, setHealthScores] = useState<HealthScoreV2Dto[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showExplanation, setShowExplanation] = useState(false);

  const { sortedData, requestSort, getSortIndicator } = useTableSort(healthScores);

  useEffect(() => {
    fetchHealthScores();
    const interval = setInterval(fetchHealthScores, 30000); // Refrescar cada 30s
    return () => clearInterval(interval);
  }, []);

  const fetchHealthScores = async () => {
    try {
      const data = await healthScoreV2Api.getAllHealthScores();
      setHealthScores(data);
      if (loading) setLoading(false);
    } catch (error) {
      console.error('Error al cargar health scores V2:', error);
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los health scores V2',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  // Estadísticas
  const stats = useMemo(() => {
    const total = healthScores.length;
    const healthy = healthScores.filter(s => s.colorSemaforo === 'Verde').length;
    const warning = healthScores.filter(s => s.colorSemaforo === 'Amarillo').length;
    const critical = healthScores.filter(s => s.colorSemaforo === 'Naranja').length;
    const emergency = healthScores.filter(s => s.colorSemaforo === 'Rojo').length;
    const avgScore = total > 0 ? Math.round(healthScores.reduce((sum, s) => sum + s.healthFinal, 0) / total) : 0;

    return { total, healthy, warning, critical, emergency, avgScore };
  }, [healthScores]);

  const toggleRow = (instance: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(instance)) {
      newExpanded.delete(instance);
    } else {
      newExpanded.add(instance);
    }
    setExpandedRows(newExpanded);
  };

  const getStatusIcon = (color: string) => {
    switch (color) {
      case 'Verde': return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'Amarillo': return <AlertTriangle className="h-4 w-4 text-warning" />;
      case 'Naranja': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'Rojo': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (color: string) => {
    const variants: Record<string, string> = {
      'Verde': 'bg-success/10 text-success border-success/20',
      'Amarillo': 'bg-warning/10 text-warning border-warning/20',
      'Naranja': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
      'Rojo': 'bg-destructive/10 text-destructive border-destructive/20',
    };

    const labels: Record<string, string> = {
      'Verde': '🟢 Saludable',
      'Amarillo': '🟡 Advertencia',
      'Naranja': '🟠 Crítico',
      'Rojo': '🔴 Emergencia',
    };

    return (
      <Badge variant="outline" className={cn('font-medium', variants[color] || '')}>
        {labels[color] || color}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <h1 className="text-3xl font-bold">HealthScore V2</h1>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">HealthScore V2 🎯</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Sistema de scoring avanzado con 10 categorías y caps globales
          </p>
        </div>
        <Button onClick={fetchHealthScores} variant="outline" size="sm">
          <Activity className="h-4 w-4 mr-2" />
          Refrescar
        </Button>
      </div>

      {/* Explicación del Sistema V2 */}
      <Collapsible open={showExplanation} onOpenChange={setShowExplanation}>
        <Card className="gradient-card shadow-card border-blue-500/20">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  <CardTitle className="text-base sm:text-lg">¿Qué hay de nuevo en V2?</CardTitle>
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-blue-500/5 border-blue-500/20">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-500" />
                      10 Categorías Ponderadas
                    </h4>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• <strong>Backups (18%)</strong>: RPO/RTO, cadena de logs</li>
                      <li>• <strong>AlwaysOn (14%)</strong>: Sincronización AG, colas</li>
                      <li>• <strong>Conectividad (10%)</strong>: Reach, Auth, RTT</li>
                      <li>• <strong>CPU (10%)</strong>: p95, runnable tasks</li>
                      <li>• <strong>IO (10%)</strong>: Latencias data/log</li>
                      <li>• <strong>Discos (8%)</strong>: Espacio libre por rol</li>
                      <li>• <strong>Memoria (7%)</strong>: PLE, grants pending</li>
                      <li>• <strong>Errores Sev≥20 (7%)</strong>: Errores críticos</li>
                      <li>• <strong>Mantenimiento (6%)</strong>: CHECKDB, Index, Stats</li>
                      <li>• <strong>Config & Tempdb (10%)</strong>: Archivos, memory</li>
                    </ul>
                  </CardContent>
                </Card>

                <Card className="bg-orange-500/5 border-orange-500/20">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      Caps Globales (Hard-Stops)
                    </h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      El score se limita automáticamente cuando:
                    </p>
                    <ul className="text-xs space-y-1 text-muted-foreground">
                      <li>• Cadena de LOG rota → <strong>cap 60</strong></li>
                      <li>• AG DB SUSPENDED → <strong>cap 60</strong></li>
                      <li>• Errores sev≥20 (1h) → <strong>cap 70</strong></li>
                      <li>• PLE {'<'}15% objetivo → <strong>cap 60</strong></li>
                      <li>• Latencia LOG {'>'}20ms → <strong>cap 70</strong></li>
                      <li>• PAGELATCH tempdb → <strong>cap 65</strong></li>
                    </ul>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-gradient-to-r from-green-500/5 via-yellow-500/5 to-red-500/5 border-dashed">
                <CardContent className="p-4">
                  <h4 className="font-semibold text-sm mb-3">Semáforo de Estados</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-success/10 border border-success/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-mono font-bold text-success">🟢 ≥85</p>
                      <p className="text-xs text-muted-foreground mt-1">Saludable</p>
                    </div>
                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-mono font-bold text-warning">🟡 75-84</p>
                      <p className="text-xs text-muted-foreground mt-1">Advertencia</p>
                    </div>
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-mono font-bold text-orange-500">🟠 65-74</p>
                      <p className="text-xs text-muted-foreground mt-1">Crítico</p>
                    </div>
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 text-center">
                      <p className="text-lg font-mono font-bold text-destructive">🔴 {'<'}65</p>
                      <p className="text-xs text-muted-foreground mt-1">Emergencia</p>
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
                <p className="text-xs text-muted-foreground">🟢 Verde</p>
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
                <p className="text-xs text-muted-foreground">🟡 Amarillo</p>
                <p className="text-2xl font-bold font-mono text-warning">{stats.warning}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-warning" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-orange-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🟠 Naranja</p>
                <p className="text-2xl font-bold font-mono text-orange-500">{stats.critical}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card shadow-card border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">🔴 Rojo</p>
                <p className="text-2xl font-bold font-mono text-destructive">{stats.emergency}</p>
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

      {/* Tabla de Instancias */}
      <Card className="gradient-card shadow-card">
        <CardHeader>
          <CardTitle>Instancias ({healthScores.length})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent"
                  onClick={() => requestSort('instance')}
                >
                  Instancia {getSortIndicator('instance')}
                </TableHead>
                <TableHead className="text-xs">Semáforo</TableHead>
                <TableHead 
                  className="text-xs cursor-pointer hover:bg-accent text-center"
                  onClick={() => requestSort('healthFinal')}
                >
                  Health Final {getSortIndicator('healthFinal')}
                </TableHead>
                <TableHead className="text-xs text-center">Raw</TableHead>
                <TableHead className="text-xs">Score Visual</TableHead>
                <TableHead className="text-xs">Cap Aplicado</TableHead>
                <TableHead className="text-xs">Actualizado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedData.length > 0 ? (
                sortedData.map((score) => (
                  <>
                    <TableRow key={score.instance} className="cursor-pointer hover:bg-accent/50">
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleRow(score.instance)}
                        >
                          {expandedRows.has(score.instance) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2 font-medium">
                        {score.instance}
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(score.colorSemaforo)}
                          {getStatusBadge(score.colorSemaforo)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className={cn(
                          'font-mono text-sm font-bold',
                          score.healthFinal >= 85 && 'text-success',
                          score.healthFinal >= 75 && score.healthFinal < 85 && 'text-warning',
                          score.healthFinal >= 65 && score.healthFinal < 75 && 'text-orange-500',
                          score.healthFinal < 65 && 'text-destructive'
                        )}>
                          {score.healthFinal}
                          <span className="text-xs text-muted-foreground">/100</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-center py-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {score.healthRaw}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <Progress 
                          value={score.healthFinal} 
                          className={cn(
                            'h-2 w-24',
                            score.healthFinal >= 85 && '[&>div]:bg-success',
                            score.healthFinal >= 75 && score.healthFinal < 85 && '[&>div]:bg-warning',
                            score.healthFinal >= 65 && score.healthFinal < 75 && '[&>div]:bg-orange-500',
                            score.healthFinal < 65 && '[&>div]:bg-destructive'
                          )}
                        />
                      </TableCell>
                      <TableCell className="py-2">
                        {score.capApplied ? (
                          <Badge variant="destructive" className="text-xs">
                            ⚠️ {score.capApplied}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs py-2 text-muted-foreground">
                        {new Date(score.calculadoAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                    </TableRow>
                    
                    {/* Fila Expandida con Detalles */}
                    {expandedRows.has(score.instance) && (
                      <TableRow>
                        <TableCell colSpan={8} className="bg-accent/20 p-6">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-lg font-semibold">{score.instance}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {score.top3Penalizaciones || 'Todas las categorías en buen estado'}
                                </p>
                              </div>
                              <Button
                                onClick={() => navigate(`/healthscore-v2/${encodeURIComponent(score.instance)}`)}
                                className="flex items-center gap-2"
                                size="sm"
                              >
                                <TrendingUp className="h-4 w-4" />
                                Ver Detalle Completo
                              </Button>
                            </div>

                            {/* Cards de Info Rápida */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <Card className="bg-blue-500/5 border-blue-500/20">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Health Raw</p>
                                      <p className="text-2xl font-bold font-mono">{score.healthRaw}</p>
                                    </div>
                                    <Activity className="h-8 w-8 text-blue-500 opacity-50" />
                                  </div>
                                </CardContent>
                              </Card>

                              <Card className="bg-purple-500/5 border-purple-500/20">
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Health Final</p>
                                      <p className="text-2xl font-bold font-mono" style={{ color: score.statusColor }}>
                                        {score.healthFinal}
                                      </p>
                                    </div>
                                    {getStatusIcon(score.colorSemaforo)}
                                  </div>
                                </CardContent>
                              </Card>

                              <Card className={cn(
                                "border-2",
                                score.capApplied ? "bg-destructive/5 border-destructive/30" : "bg-success/5 border-success/30"
                              )}>
                                <CardContent className="p-4">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-xs text-muted-foreground">Cap Aplicado</p>
                                      <p className="text-sm font-medium">
                                        {score.capApplied || 'Sin caps'}
                                      </p>
                                    </div>
                                    {score.capApplied ? (
                                      <AlertTriangle className="h-8 w-8 text-destructive opacity-50" />
                                    ) : (
                                      <CheckCircle2 className="h-8 w-8 text-success opacity-50" />
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            </div>

                            <div className="flex justify-center">
                              <Button
                                onClick={() => navigate(`/healthscore-v2/${encodeURIComponent(score.instance)}`)}
                                variant="outline"
                                className="flex items-center gap-2"
                              >
                                <Shield className="h-4 w-4" />
                                Ver Desglose por Categorías →
                              </Button>
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
                    No hay instancias disponibles
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

