import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, AlertTriangle, CheckCircle2, XCircle, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatDateUTC3 } from '@/lib/utils';
import { healthScoreV2Api, HealthScoreDetailV2Dto, CategoryScoreDto } from '@/services/api';
import { useToast } from '@/hooks/use-toast';
import HealthScoreV2TrendChart from '@/components/HealthScoreV2TrendChart';

export default function HealthScoreV2Detail() {
  const { instance } = useParams<{ instance: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<HealthScoreDetailV2Dto | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (instance) {
      fetchDetail();
    }
  }, [instance]);

  const fetchDetail = async () => {
    if (!instance) return;
    
    try {
      setLoading(true);
      const data = await healthScoreV2Api.getHealthScoreDetail(decodeURIComponent(instance));
      setDetail(data);
    } catch (error) {
      console.error('Error al cargar detalle:', error);
      toast({
        title: 'Error',
        description: 'No se pudo cargar el detalle de la instancia',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (name: string) => {
    const icons: Record<string, string> = {
      'Backups': '💾',
      'AG': '🔄',
      'Conectividad': '🌐',
      'ErroresSev': '⚠️',
      'CPU': '⚙️',
      'IO': '💿',
      'Discos': '📀',
      'Memoria': '🧠',
      'Mantenimiento': '🔧',
      'ConfigRecursos': '⚙️',
    };
    return icons[name] || '📊';
  };

  const getScoreColor = (score: number): string => {
    if (score >= 85) return 'text-success';
    if (score >= 75) return 'text-warning';
    if (score >= 65) return 'text-orange-500';
    return 'text-destructive';
  };

  const getScoreProgressColor = (score: number): string => {
    if (score >= 85) return '[&>div]:bg-success';
    if (score >= 75) return '[&>div]:bg-warning';
    if (score >= 65) return '[&>div]:bg-orange-500';
    return '[&>div]:bg-destructive';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate('/healthscore-v2')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Cargando detalle...</div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => navigate('/healthscore-v2')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">No se encontraron datos para esta instancia</div>
        </div>
      </div>
    );
  }

  const getStatusIcon = (color: string) => {
    switch (color) {
      case 'Verde': return <CheckCircle2 className="h-6 w-6 text-success" />;
      case 'Amarillo': return <AlertTriangle className="h-6 w-6 text-warning" />;
      case 'Naranja': return <AlertTriangle className="h-6 w-6 text-orange-500" />;
      case 'Rojo': return <XCircle className="h-6 w-6 text-destructive" />;
      default: return <Activity className="h-6 w-6 text-muted-foreground" />;
    }
  };

  return (
    <div className="p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/healthscore-v2')} size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono">{detail.instance}</h1>
            <p className="text-sm text-muted-foreground">
              Actualizado: {formatDateUTC3(detail.calculadoAt)}
            </p>
          </div>
        </div>
        <Button onClick={fetchDetail} variant="outline" size="sm">
          <Activity className="h-4 w-4 mr-2" />
          Refrescar
        </Button>
      </div>

      {/* Resumen General */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        <Card className="gradient-card shadow-card border-blue-500/30">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Health Raw</p>
                <p className="text-4xl font-bold font-mono">{detail.healthRaw}</p>
                <p className="text-xs text-muted-foreground mt-1">Score antes de caps</p>
              </div>
              <Activity className="h-12 w-12 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "gradient-card shadow-card border-2",
          detail.healthFinal >= 85 && "border-success/30",
          detail.healthFinal >= 75 && detail.healthFinal < 85 && "border-warning/30",
          detail.healthFinal >= 65 && detail.healthFinal < 75 && "border-orange-500/30",
          detail.healthFinal < 65 && "border-destructive/30"
        )}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Health Final</p>
                <p className={cn("text-4xl font-bold font-mono", getScoreColor(detail.healthFinal))}>
                  {detail.healthFinal}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {detail.colorSemaforo === 'Verde' && '🟢 Saludable'}
                  {detail.colorSemaforo === 'Amarillo' && '🟡 Advertencia'}
                  {detail.colorSemaforo === 'Naranja' && '🟠 Crítico'}
                  {detail.colorSemaforo === 'Rojo' && '🔴 Emergencia'}
                </p>
              </div>
              {getStatusIcon(detail.colorSemaforo)}
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "gradient-card shadow-card",
          detail.capApplied ? "border-destructive/30" : "border-success/30"
        )}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Cap Aplicado</p>
                {detail.capApplied ? (
                  <>
                    <p className="text-lg font-semibold text-destructive">{detail.capApplied}</p>
                    <Badge variant="destructive" className="mt-2">
                      ⚠️ Hard-Stop Activo
                    </Badge>
                  </>
                ) : (
                  <>
                    <p className="text-lg font-semibold text-success">Sin caps</p>
                    <Badge variant="outline" className="mt-2 bg-success/10 text-success border-success/20">
                      ✓ Score sin límites
                    </Badge>
                  </>
                )}
              </div>
              {detail.capApplied ? (
                <AlertTriangle className="h-12 w-12 text-destructive opacity-50" />
              ) : (
                <CheckCircle2 className="h-12 w-12 text-success opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Categorías y Tendencias */}
      <Tabs defaultValue="categories" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="categories">📊 Categorías</TabsTrigger>
          <TabsTrigger value="trends">📈 Tendencias</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card className="gradient-card shadow-card">
            <CardHeader>
              <CardTitle>Desglose por Categorías (10 componentes)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {detail.categories.map((cat: CategoryScoreDto) => (
                  <Card key={cat.name} className="bg-accent/20">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{cat.icon}</span>
                            <div>
                              <p className="text-sm font-semibold">{cat.displayName}</p>
                              <p className="text-xs text-muted-foreground">Peso: {(cat.weight * 100).toFixed(0)}%</p>
                            </div>
                          </div>
                          <span className={cn("text-2xl font-bold font-mono", getScoreColor(cat.score))}>
                            {cat.score}
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <Progress 
                          value={cat.score} 
                          className={cn('h-2', getScoreProgressColor(cat.score))}
                        />

                        {/* Notes */}
                        <div className="bg-background/50 rounded p-2">
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {cat.notes}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          {/* Gráfico 24h */}
          <Card className="gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Tendencia 24 horas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.trends24h && detail.trends24h.length > 0 ? (
                <HealthScoreV2TrendChart 
                  data={detail.trends24h.map(t => ({
                    timestamp: t.timestamp,
                    healthScore: t.healthScore || 0
                  }))}
                  title="Health Score - Últimas 24 horas"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No hay datos de tendencias para las últimas 24 horas
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráfico 7d */}
          <Card className="gradient-card shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Tendencia 7 días
              </CardTitle>
            </CardHeader>
            <CardContent>
              {detail.trends7d && detail.trends7d.length > 0 ? (
                <HealthScoreV2TrendChart 
                  data={detail.trends7d.map(t => ({
                    timestamp: t.timestamp,
                    healthScore: t.healthScore || 0
                  }))}
                  title="Health Score - Últimos 7 días"
                />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  No hay datos de tendencias para los últimos 7 días
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

