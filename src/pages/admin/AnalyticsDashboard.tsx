import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '@/services/analyticsApi';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Users, Activity, Clock, AlertTriangle, Navigation, TrendingUp, BarChart3, RefreshCw } from 'lucide-react';

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '14', label: 'Últimos 14 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function KpiCard({ title, value, subtitle, icon: Icon, loading }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <Icon className="h-8 w-8 text-primary/70" />
          <div>
            {loading ? (
              <>
                <Skeleton className="h-7 w-16 mb-1" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">{value}</p>
                {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  );
}

function HeatmapGrid({ cells }: { cells: { dayOfWeek: number; hour: number; eventCount: number }[] }) {
  const maxCount = Math.max(...cells.map(c => c.eventCount), 1);

  const getColor = (count: number) => {
    if (count === 0) return 'bg-muted/30';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'bg-emerald-200 dark:bg-emerald-900/40';
    if (ratio < 0.5) return 'bg-emerald-400 dark:bg-emerald-700/60';
    if (ratio < 0.75) return 'bg-emerald-500 dark:bg-emerald-600';
    return 'bg-emerald-700 dark:bg-emerald-500';
  };

  const grid: Record<string, number> = {};
  cells.forEach(c => { grid[`${c.dayOfWeek}-${c.hour}`] = c.eventCount; });

  return (
    <div className="space-y-1">
      <div className="flex gap-0.5">
        <div className="w-10 shrink-0" />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
            {h % 2 === 0 ? h : ''}
          </div>
        ))}
      </div>
      {Array.from({ length: 7 }, (_, d) => (
        <div key={d} className="flex gap-0.5 items-center">
          <div className="w-10 shrink-0 text-xs text-muted-foreground text-right pr-2">{DAY_NAMES[d]}</div>
          {Array.from({ length: 24 }, (_, h) => {
            const count = grid[`${d}-${h}`] || 0;
            return (
              <div
                key={h}
                className={`flex-1 h-5 rounded-sm ${getColor(count)} transition-colors`}
                title={`${DAY_NAMES[d]} ${h}:00 — ${count} eventos`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function FunnelChart({ funnel }: { funnel: { name: string; steps: { stepName: string; users: number; conversionRate: number }[] } }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{funnel.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {funnel.steps.map((step, i) => {
            const width = funnel.steps[0].users > 0
              ? Math.max((step.users / funnel.steps[0].users) * 100, 8)
              : 0;
            return (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{step.stepName}</span>
                  <span className="font-medium">{step.users} usuarios ({step.conversionRate}%)</span>
                </div>
                <div className="h-6 bg-muted rounded-sm overflow-hidden">
                  <div
                    className="h-full bg-primary/80 rounded-sm transition-all duration-500"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AnalyticsDashboard() {
  const [period, setPeriod] = useState('30');

  const dateRange = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - parseInt(period));
    return { from, to };
  }, [period]);

  const { data: overview, isLoading: loadingOverview, refetch: refetchOverview } = useQuery({
    queryKey: ['analytics-overview', period],
    queryFn: () => analyticsApi.getOverview(dateRange.from, dateRange.to),
    staleTime: 60_000,
  });

  const { data: friction, isLoading: loadingFriction } = useQuery({
    queryKey: ['analytics-friction', period],
    queryFn: () => analyticsApi.getFriction(dateRange.from, dateRange.to),
    staleTime: 60_000,
  });

  const { data: journeys, isLoading: loadingJourneys } = useQuery({
    queryKey: ['analytics-journeys', period],
    queryFn: () => analyticsApi.getJourneys(dateRange.from, dateRange.to),
    staleTime: 60_000,
  });

  const { data: heatmap, isLoading: loadingHeatmap } = useQuery({
    queryKey: ['analytics-heatmap', period],
    queryFn: () => analyticsApi.getHeatmap(dateRange.from, dateRange.to),
    staleTime: 60_000,
  });

  const handleRefresh = () => {
    refetchOverview();
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-muted-foreground">
              Telemetría de uso, adopción y detección de fricción
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loadingOverview}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loadingOverview ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <TrendingUp className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="friction" className="gap-1.5">
            <AlertTriangle className="h-4 w-4" />
            Fricción
          </TabsTrigger>
          <TabsTrigger value="journeys" className="gap-1.5">
            <Navigation className="h-4 w-4" />
            User Journey
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB: OVERVIEW ===== */}
        <TabsContent value="overview" className="space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard title="DAU" value={overview?.dailyActiveUsers ?? 0} subtitle="Usuarios activos hoy" icon={Users} loading={loadingOverview} />
            <KpiCard title="WAU" value={overview?.weeklyActiveUsers ?? 0} subtitle="Últimos 7 días" icon={Users} loading={loadingOverview} />
            <KpiCard title="MAU" value={overview?.monthlyActiveUsers ?? 0} subtitle="Últimos 30 días" icon={Users} loading={loadingOverview} />
            <KpiCard title="Sesiones hoy" value={overview?.todaySessions ?? 0} subtitle="Sesiones iniciadas" icon={Activity} loading={loadingOverview} />
            <KpiCard title="Duración mediana" value={`${overview?.medianSessionDurationMinutes ?? 0} min`} subtitle="Por sesión" icon={Clock} loading={loadingOverview} />
          </div>

          {/* Charts row */}
          <div className="grid gap-4 lg:grid-cols-2">
            {loadingOverview ? (
              <>
                <CardSkeleton rows={8} />
                <CardSkeleton rows={8} />
              </>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tendencia diaria</CardTitle>
                    <CardDescription>Usuarios activos y sesiones por día</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {overview?.dailyTrend && overview.dailyTrend.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={overview.dailyTrend}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
                          <Tooltip />
                          <Area type="monotone" dataKey="activeUsers" name="Usuarios" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                          <Area type="monotone" dataKey="sessions" name="Sesiones" stackId="2" stroke="hsl(var(--chart-2, 220 70% 50%))" fill="hsl(var(--chart-2, 220 70% 50%))" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                        Sin datos de tendencia aún
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top rutas</CardTitle>
                    <CardDescription>Páginas más visitadas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {overview?.topRoutes && overview.topRoutes.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={overview.topRoutes.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" tick={{ fontSize: 11 }} />
                          <YAxis dataKey="route" type="category" width={130} tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Bar dataKey="pageViews" name="Page Views" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                        Sin datos de rutas aún
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Actions table + Heatmap */}
          <div className="grid gap-4 lg:grid-cols-2">
            {loadingOverview ? (
              <CardSkeleton rows={6} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top acciones</CardTitle>
                  <CardDescription>Eventos más frecuentes (excluyendo navegación)</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Evento</TableHead>
                        <TableHead className="text-right">Cantidad</TableHead>
                        <TableHead className="text-right">Usuarios</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {overview?.topEvents && overview.topEvents.length > 0 ? (
                        overview.topEvents.map((ev, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-sm">{ev.eventName}</TableCell>
                            <TableCell className="text-right">{ev.count.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{ev.uniqueUsers}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                            Sin datos de acciones aún
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {loadingHeatmap ? (
              <CardSkeleton rows={8} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Heatmap de uso</CardTitle>
                  <CardDescription>Actividad por día de la semana y hora (UTC)</CardDescription>
                </CardHeader>
                <CardContent>
                  {heatmap?.cells && heatmap.cells.length > 0 ? (
                    <HeatmapGrid cells={heatmap.cells} />
                  ) : (
                    <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
                      Sin datos de actividad por hora aún
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ===== TAB: FRICCIÓN ===== */}
        <TabsContent value="friction" className="space-y-6">
          {loadingFriction ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <CardSkeleton rows={6} />
              <CardSkeleton rows={6} />
              <CardSkeleton rows={6} />
              <CardSkeleton rows={6} />
            </div>
          ) : friction ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Top errores</CardTitle>
                    <CardDescription>Errores de API y UI por módulo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Ruta</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Usuarios</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {friction.topErrors.length > 0 ? (
                          friction.topErrors.map((err, i) => (
                            <TableRow key={i}>
                              <TableCell>
                                <Badge variant={err.eventName === 'api_error' ? 'destructive' : 'secondary'}>
                                  {err.eventName === 'api_error' ? 'API' : 'UI'}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{err.route || '—'}</TableCell>
                              <TableCell className="text-right font-medium">{err.count}</TableCell>
                              <TableCell className="text-right">{err.uniqueUsers}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin errores registrados</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Empty states</CardTitle>
                    <CardDescription>Pantallas donde los usuarios ven "sin datos"</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ruta</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Usuarios</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {friction.topEmptyStates.length > 0 ? (
                          friction.topEmptyStates.map((es, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{es.route}</TableCell>
                              <TableCell className="text-right">{es.count}</TableCell>
                              <TableCell className="text-right">{es.uniqueUsers}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin empty states registrados</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Pantallas con alto tiempo</CardTitle>
                    <CardDescription>Posible fricción o confusión</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ruta</TableHead>
                          <TableHead className="text-right">Promedio</TableHead>
                          <TableHead className="text-right">Vistas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {friction.slowScreens.length > 0 ? (
                          friction.slowScreens.map((s, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{s.route}</TableCell>
                              <TableCell className="text-right">{(s.avgDurationMs / 1000).toFixed(1)}s</TableCell>
                              <TableCell className="text-right">{s.viewCount}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin datos de screen time</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Endpoints lentos</CardTitle>
                    <CardDescription>Requests que exceden 5 segundos</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Endpoint</TableHead>
                          <TableHead className="text-right">Promedio</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {friction.slowEndpoints.length > 0 ? (
                          friction.slowEndpoints.map((e, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-mono text-xs max-w-[200px] truncate">{e.endpoint}</TableCell>
                              <TableCell className="text-right">{(e.avgDurationMs / 1000).toFixed(1)}s</TableCell>
                              <TableCell className="text-right">{e.count}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground py-8">Sin slow requests registrados</TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {friction.permissionDenials.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Permisos denegados</CardTitle>
                    <CardDescription>Usuarios intentando acceder a rutas sin permiso</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ruta</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead className="text-right">Usuarios</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {friction.permissionDenials.map((pd, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{pd.route}</TableCell>
                            <TableCell className="text-right">{pd.count}</TableCell>
                            <TableCell className="text-right">{pd.uniqueUsers}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No hay datos de fricción disponibles</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ===== TAB: USER JOURNEY ===== */}
        <TabsContent value="journeys" className="space-y-6">
          {loadingJourneys ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <CardSkeleton rows={5} />
              <CardSkeleton rows={5} />
            </div>
          ) : journeys ? (
            <>
              {journeys.funnels.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {journeys.funnels.map((funnel, i) => (
                    <FunnelChart key={i} funnel={funnel} />
                  ))}
                </div>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Paths más comunes</CardTitle>
                  <CardDescription>Secuencias de navegación más frecuentes entre sesiones</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recorrido</TableHead>
                        <TableHead className="text-right">Sesiones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {journeys.commonPaths.length > 0 ? (
                        journeys.commonPaths.map((cp, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <div className="flex flex-wrap items-center gap-1">
                                {cp.path.map((step, j) => (
                                  <span key={j} className="inline-flex items-center gap-1">
                                    <Badge variant="outline" className="font-mono text-xs">{step}</Badge>
                                    {j < cp.path.length - 1 && <span className="text-muted-foreground text-xs">→</span>}
                                  </span>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{cp.sessionCount}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                            Se necesitan más sesiones para detectar patrones
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <p className="text-muted-foreground">No hay datos de recorridos disponibles</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
