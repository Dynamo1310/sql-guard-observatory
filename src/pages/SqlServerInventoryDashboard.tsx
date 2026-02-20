/**
 * Dashboard de Inventario SQL Server
 * Visualización gráfica de todas las instancias SQL Server
 */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Database, RefreshCw, Server, Shield, Clock, MapPin, Monitor } from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { sqlServerInventoryApi, CacheMetadata } from '@/services/sqlServerInventoryApi';
import { SqlServerInstance } from '@/types';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart';

const getSimpleVersion = (majorVersion: string): string => {
  const match = majorVersion.match(/\d{4}/);
  return match ? match[0] : majorVersion;
};

const VERSION_COLORS: Record<string, string> = {
  '2022': '#8b5cf6',
  '2019': '#2563eb',
  '2017': '#06b6d4',
  '2016': '#10b981',
  '2014': '#f59e0b',
  '2012': '#ef4444',
  'Otro': '#6b7280',
};

const AMBIENTE_COLORS: Record<string, string> = {
  'Produccion': '#ef4444',
  'Production': '#ef4444',
  'Testing': '#f59e0b',
  'Test': '#f59e0b',
  'Desarrollo': '#10b981',
  'Development': '#10b981',
  'Dev': '#10b981',
  'Otro': '#6b7280',
};

const ALWAYSON_COLORS: Record<string, string> = {
  'Enabled': '#10b981',
  'Disabled': '#94a3b8',
};

const EDITION_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#818cf8'];
const HOSTING_SITE_COLORS = ['#8b5cf6', '#a78bfa', '#c4b5fd', '#7c3aed', '#6d28d9', '#5b21b6'];
const HOSTING_TYPE_COLORS = ['#06b6d4', '#22d3ee', '#67e8f9', '#0891b2', '#0e7490', '#155e75'];

const cleanEdition = (edition: string): string => {
  if (!edition) return 'Desconocida';
  if (edition.includes('Enterprise')) return 'Enterprise';
  if (edition.includes('Standard')) return 'Standard';
  if (edition.includes('Express')) return 'Express';
  if (edition.includes('Developer')) return 'Developer';
  if (edition.includes('Web')) return 'Web';
  return edition.length > 20 ? edition.substring(0, 20) + '...' : edition;
};

const GenericTooltip = ({ active, payload, total, unitLabel }: { active?: boolean; payload?: any[]; total: number; unitLabel?: string }) => {
  if (!active || !payload?.length) return null;
  const data = payload[0];
  const value = data.value;
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: data.payload?.fill || data.fill }} />
        <span className="font-medium">{data.name || data.payload?.name}</span>
      </div>
      <div className="text-muted-foreground mt-1">
        {value} {unitLabel || 'instancias'} ({percentage}%)
      </div>
    </div>
  );
};

const BarTooltip = ({ active, payload, label, total, unitLabel }: { active?: boolean; payload?: any[]; label?: string; total: number; unitLabel?: string }) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value || 0;
  const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
  return (
    <div className="bg-background border rounded-lg shadow-lg px-3 py-2 text-sm">
      <div className="font-medium mb-1">{label}</div>
      <div className="text-muted-foreground">
        {value} {unitLabel || 'instancias'} ({percentage}%)
      </div>
    </div>
  );
};

export default function SqlServerInventoryDashboard() {
  const [instances, setInstances] = useState<SqlServerInstance[]>([]);
  const [cacheInfo, setCacheInfo] = useState<CacheMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sqlServerInventoryApi.getInstances({ page: 1, pageSize: 10000 });
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
    } catch (error) {
      console.error('Error al cargar instancias:', error);
      toast({ title: 'Error', description: 'No se pudieron cargar las instancias de SQL Server', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await sqlServerInventoryApi.refreshInstances();
      setInstances(response.data);
      setCacheInfo(response.cacheInfo);
      toast({ title: 'Inventario actualizado', description: `Se actualizó el inventario con ${response.cacheInfo.recordCount || response.data.length} instancias` });
      fetchData();
    } catch (error) {
      console.error('Error al actualizar instancias:', error);
      toast({ title: 'Error', description: 'No se pudo actualizar el inventario desde el servidor', variant: 'destructive' });
    } finally {
      setIsRefreshing(false);
    }
  }, [toast, fetchData]);

  useEffect(() => { fetchData(); }, []);

  const formatLastUpdated = (dateStr: string | null) => {
    if (!dateStr) return 'Nunca';
    const date = new Date(dateStr);
    return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const stats = useMemo(() => {
    const total = instances.length;
    const byVersion: Record<string, number> = {};
    const byAmbiente: Record<string, number> = {};
    const byEdition: Record<string, number> = {};
    const byHostingSite: Record<string, number> = {};
    const byHostingType: Record<string, number> = {};
    let alwaysOnEnabled = 0;
    let alwaysOnDisabled = 0;
    const uniqueSites = new Set<string>();

    for (const i of instances) {
      const v = getSimpleVersion(i.MajorVersion);
      byVersion[v] = (byVersion[v] || 0) + 1;

      const amb = i.ambiente || 'Otro';
      byAmbiente[amb] = (byAmbiente[amb] || 0) + 1;

      const ed = cleanEdition(i.Edition);
      byEdition[ed] = (byEdition[ed] || 0) + 1;

      const site = i.hostingSite || 'Desconocido';
      byHostingSite[site] = (byHostingSite[site] || 0) + 1;
      uniqueSites.add(site);

      const hType = i.hostingType || 'Desconocido';
      byHostingType[hType] = (byHostingType[hType] || 0) + 1;

      if (i.AlwaysOn === 'Enabled') alwaysOnEnabled++;
      else alwaysOnDisabled++;
    }

    const productionCount = (byAmbiente['Produccion'] || 0) + (byAmbiente['Production'] || 0);

    return { total, byVersion, byAmbiente, byEdition, byHostingSite, byHostingType, alwaysOnEnabled, alwaysOnDisabled, productionCount, uniqueSites: uniqueSites.size };
  }, [instances]);

  // --- Chart data ---
  const versionData = useMemo(() =>
    Object.entries(stats.byVersion)
      .map(([name, value]) => ({ name, value, fill: VERSION_COLORS[name] || VERSION_COLORS['Otro'] }))
      .sort((a, b) => b.value - a.value),
    [stats.byVersion]
  );

  const ambienteData = useMemo(() =>
    Object.entries(stats.byAmbiente)
      .map(([name, value]) => ({ name, value, fill: AMBIENTE_COLORS[name] || AMBIENTE_COLORS['Otro'] }))
      .sort((a, b) => b.value - a.value),
    [stats.byAmbiente]
  );

  const editionData = useMemo(() =>
    Object.entries(stats.byEdition)
      .map(([name, value], idx) => ({ name, value, fill: EDITION_COLORS[idx % EDITION_COLORS.length] }))
      .sort((a, b) => b.value - a.value),
    [stats.byEdition]
  );

  const alwaysOnData = useMemo(() => [
    { name: 'Enabled', value: stats.alwaysOnEnabled, fill: ALWAYSON_COLORS['Enabled'] },
    { name: 'Disabled', value: stats.alwaysOnDisabled, fill: ALWAYSON_COLORS['Disabled'] },
  ].filter(d => d.value > 0), [stats.alwaysOnEnabled, stats.alwaysOnDisabled]);

  const hostingSiteData = useMemo(() =>
    Object.entries(stats.byHostingSite)
      .map(([name, value], idx) => ({ name, value, fill: HOSTING_SITE_COLORS[idx % HOSTING_SITE_COLORS.length] }))
      .sort((a, b) => b.value - a.value),
    [stats.byHostingSite]
  );

  const hostingTypeData = useMemo(() =>
    Object.entries(stats.byHostingType)
      .map(([name, value], idx) => ({ name, value, fill: HOSTING_TYPE_COLORS[idx % HOSTING_TYPE_COLORS.length] }))
      .sort((a, b) => b.value - a.value),
    [stats.byHostingType]
  );

  // --- Chart configs ---
  const versionChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    versionData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg satisfies ChartConfig;
  }, [versionData]);

  const ambienteChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    ambienteData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg satisfies ChartConfig;
  }, [ambienteData]);

  const editionChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    editionData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg satisfies ChartConfig;
  }, [editionData]);

  const alwaysOnChartConfig = useMemo(() => ({
    Enabled: { label: 'Habilitado', color: ALWAYSON_COLORS['Enabled'] },
    Disabled: { label: 'Deshabilitado', color: ALWAYSON_COLORS['Disabled'] },
  }) satisfies ChartConfig, []);

  const hostingSiteChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    hostingSiteData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg satisfies ChartConfig;
  }, [hostingSiteData]);

  const hostingTypeChartConfig = useMemo(() => {
    const cfg: Record<string, { label: string; color: string }> = {};
    hostingTypeData.forEach(d => { cfg[d.name] = { label: d.name, color: d.fill }; });
    return cfg satisfies ChartConfig;
  }, [hostingTypeData]);

  if (loading && instances.length === 0) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-72" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-[200px] w-full" /></CardContent>
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
            <SqlServerIcon className="h-8 w-8" />
            Dashboard - Inventario SQL Server
          </h1>
          <p className="text-muted-foreground">
            Visión general de todas las instancias SQL Server registradas
          </p>
        </div>
        <div className="flex items-center gap-4">
          {cacheInfo?.lastUpdatedAt && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>{formatLastUpdated(cacheInfo.lastUpdatedAt)}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Última actualización por: {cacheInfo.updatedByUserName || 'Sistema'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Button variant="outline" onClick={refreshData} disabled={isRefreshing}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Actualizando...' : 'Actualizar'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Instancias</CardTitle>
            <SqlServerIcon className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Instancias SQL Server</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Producción</CardTitle>
            <Database className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{stats.productionCount}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? `${((stats.productionCount / stats.total) * 100).toFixed(0)}% del total` : 'Sin datos'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AlwaysOn Activo</CardTitle>
            <Shield className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{stats.alwaysOnEnabled}</div>
            <p className="text-xs text-muted-foreground">
              {stats.total > 0 ? `${((stats.alwaysOnEnabled / stats.total) * 100).toFixed(0)}% del total` : 'Sin datos'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Versiones</CardTitle>
            <Database className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">{Object.keys(stats.byVersion).length}</div>
            <p className="text-xs text-muted-foreground">
              {Object.entries(stats.byVersion).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([v, c]) => `${v}: ${c}`).join(', ')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sitios Hosting</CardTitle>
            <MapPin className="h-4 w-4 text-cyan-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-cyan-500">{stats.uniqueSites}</div>
            <p className="text-xs text-muted-foreground">Sitios únicos</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Pie Chart - Distribución por Versión */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-primary" />
              Distribución por Versión
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer config={versionChartConfig} className="mx-auto h-[200px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<GenericTooltip total={stats.total} />} />
                <Pie data={versionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                  {versionData.map((entry, idx) => (
                    <Cell key={`v-${idx}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-1">
              {versionData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5 px-1.5 py-0.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />
                  <span className="text-muted-foreground">{item.name} ({item.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart - Distribución por Ambiente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4 text-primary" />
              Distribución por Ambiente
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer config={ambienteChartConfig} className="mx-auto h-[200px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<GenericTooltip total={stats.total} />} />
                <Pie data={ambienteData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                  {ambienteData.map((entry, idx) => (
                    <Cell key={`a-${idx}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-1">
              {ambienteData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5 px-1.5 py-0.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />
                  <span className="text-muted-foreground">{item.name} ({item.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Donut Chart - AlwaysOn */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              AlwaysOn
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer config={alwaysOnChartConfig} className="mx-auto h-[200px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<GenericTooltip total={stats.total} />} />
                <Pie data={alwaysOnData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                  {alwaysOnData.map((entry, idx) => (
                    <Cell key={`ao-${idx}`} fill={entry.fill} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-1">
              {alwaysOnData.map((item) => (
                <div key={item.name} className="flex items-center gap-1.5 px-1.5 py-0.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.fill }} />
                  <span className="text-muted-foreground">
                    {item.name === 'Enabled' ? 'Habilitado' : 'Deshabilitado'} ({item.value})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Bar Chart - Instancias por Edición */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4 text-primary" />
              Instancias por Edición
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              config={editionChartConfig}
              className="w-full"
              style={{ height: Math.max(180, editionData.length * 32 + 40) }}
            >
              <BarChart data={editionData} layout="vertical" barSize={18} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                  interval={0}
                />
                <ChartTooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} content={<BarTooltip total={stats.total} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {editionData.map((entry, idx) => (
                    <Cell key={`ed-${idx}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Bar Chart - Instancias por Sitio de Hosting */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary" />
              Instancias por Sitio de Hosting
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              config={hostingSiteChartConfig}
              className="w-full"
              style={{ height: Math.max(180, hostingSiteData.length * 32 + 40) }}
            >
              <BarChart data={hostingSiteData} layout="vertical" barSize={18} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                  interval={0}
                />
                <ChartTooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} content={<BarTooltip total={stats.total} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {hostingSiteData.map((entry, idx) => (
                    <Cell key={`hs-${idx}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Bar Chart - Instancias por Tipo de Hosting */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 text-primary" />
              Instancias por Tipo de Hosting
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ChartContainer
              config={hostingTypeChartConfig}
              className="w-full"
              style={{ height: Math.max(180, hostingTypeData.length * 32 + 40) }}
            >
              <BarChart data={hostingTypeData} layout="vertical" barSize={18} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  width={80}
                  interval={0}
                />
                <ChartTooltip cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }} content={<BarTooltip total={stats.total} />} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {hostingTypeData.map((entry, idx) => (
                    <Cell key={`ht-${idx}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
