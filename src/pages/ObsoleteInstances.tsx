/**
 * Página de Instancias Obsoletas - SQL Server
 * Muestra instancias con versiones fuera de soporte y próximas a quedar obsoletas
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  AlertTriangle, Clock, Server, RefreshCw, Download, Search,
  CalendarX2, ShieldAlert, Database, TrendingDown,
  ExternalLink, Info
} from 'lucide-react';
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { patchingApi, ServerPatchStatusDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

// Definición de versiones obsoletas y próximas a quedar obsoletas
const OBSOLETE_VERSIONS = [
  { version: '2005', name: 'SQL Server 2005', endOfSupport: '2016-04-12', yearsOutOfSupport: 8 },
  { version: '2008', name: 'SQL Server 2008', endOfSupport: '2019-07-09', yearsOutOfSupport: 5 },
  { version: '2008 R2', name: 'SQL Server 2008 R2', endOfSupport: '2019-07-09', yearsOutOfSupport: 5 },
  { version: '2012', name: 'SQL Server 2012', endOfSupport: '2022-07-12', yearsOutOfSupport: 2 },
  { version: '2014', name: 'SQL Server 2014', endOfSupport: '2024-07-09', yearsOutOfSupport: 0 },
];

const NEAR_OBSOLETE_VERSIONS = [
  { version: '2016', name: 'SQL Server 2016', endOfSupport: '2026-07-14' },
];

// Función para calcular meses restantes hasta fin de soporte
const getMonthsRemaining = (endOfSupportDate: string): number => {
  const today = new Date();
  const endDate = new Date(endOfSupportDate);
  const diffTime = endDate.getTime() - today.getTime();
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44)); // 30.44 días promedio por mes
  return Math.max(0, diffMonths);
};

// Todas las versiones obsoletas como array simple
const OBSOLETE_VERSION_NAMES = OBSOLETE_VERSIONS.map(v => v.version);
const NEAR_OBSOLETE_VERSION_NAMES = NEAR_OBSOLETE_VERSIONS.map(v => v.version);

// Configuración del gráfico de pie por versión obsoleta - Escala de rojos/naranjas (más viejo = más oscuro)
const obsoleteChartConfig = {
  '2005': { label: 'SQL 2005', color: '#7f1d1d' },   // red-900 (más antigua)
  '2008': { label: 'SQL 2008', color: '#b91c1c' },   // red-700
  '2008 R2': { label: 'SQL 2008 R2', color: '#dc2626' }, // red-600
  '2012': { label: 'SQL 2012', color: '#f97316' },   // orange-500
  '2014': { label: 'SQL 2014', color: '#fb923c' },   // orange-400 (más reciente)
} satisfies ChartConfig;

// Configuración del gráfico de barras por ambiente
const ambienteChartConfig = {
  obsolete: { label: 'Obsoletos', color: '#dc2626' },
  nearObsolete: { label: 'Próx. Obsoletos', color: '#f59e0b' },
  supported: { label: 'Con Soporte', color: '#22c55e' },
} satisfies ChartConfig;

export default function ObsoleteInstances() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all'); // all, obsolete, near-obsolete

  const { 
    data: rawServers, 
    isLoading, 
    isError, 
    error,
    refetch, 
    isFetching 
  } = useQuery({
    queryKey: ['patchStatus'],
    queryFn: () => patchingApi.getStatus(false),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Filtrar servidores que responden
  const servers = useMemo(() => {
    if (!rawServers) return [];
    return rawServers.filter(s => s.connectionSuccess === true);
  }, [rawServers]);

  // Calcular métricas de obsolescencia
  const metrics = useMemo(() => {
    if (!servers.length) return null;

    const total = servers.length;
    const obsolete = servers.filter(s => OBSOLETE_VERSION_NAMES.includes(s.majorVersion)).length;
    const nearObsolete = servers.filter(s => NEAR_OBSOLETE_VERSION_NAMES.includes(s.majorVersion)).length;
    const supported = total - obsolete - nearObsolete;
    const obsoleteRate = total > 0 ? Math.round((obsolete / total) * 100) : 0;
    const riskRate = total > 0 ? Math.round(((obsolete + nearObsolete) / total) * 100) : 0;

    return { total, obsolete, nearObsolete, supported, obsoleteRate, riskRate };
  }, [servers]);

  // Datos para el gráfico de pie por versión obsoleta
  const pieData = useMemo(() => {
    if (!servers.length) return [];

    const byVersion = servers.reduce((acc, s) => {
      if (OBSOLETE_VERSION_NAMES.includes(s.majorVersion)) {
        if (!acc[s.majorVersion]) {
          acc[s.majorVersion] = 0;
        }
        acc[s.majorVersion]++;
      }
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(byVersion)
      .map(([version, count]) => ({
        version,
        value: count,
        fill: obsoleteChartConfig[version as keyof typeof obsoleteChartConfig]?.color || '#dc2626',
      }))
      .sort((a, b) => {
        const orderA = OBSOLETE_VERSION_NAMES.indexOf(a.version);
        const orderB = OBSOLETE_VERSION_NAMES.indexOf(b.version);
        return orderA - orderB;
      });
  }, [servers]);

  // Datos para el gráfico de barras por ambiente
  const ambienteData = useMemo(() => {
    if (!servers.length) return [];

    const byAmbiente = servers.reduce((acc, s) => {
      const ambiente = s.ambiente || 'Sin definir';
      if (!acc[ambiente]) {
        acc[ambiente] = { ambiente, obsolete: 0, nearObsolete: 0, supported: 0, total: 0 };
      }
      acc[ambiente].total++;
      
      if (OBSOLETE_VERSION_NAMES.includes(s.majorVersion)) {
        acc[ambiente].obsolete++;
      } else if (NEAR_OBSOLETE_VERSION_NAMES.includes(s.majorVersion)) {
        acc[ambiente].nearObsolete++;
      } else {
        acc[ambiente].supported++;
      }
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(byAmbiente)
      .filter((a: any) => a.obsolete > 0 || a.nearObsolete > 0)
      .sort((a: any, b: any) => (b.obsolete + b.nearObsolete) - (a.obsolete + a.nearObsolete));
  }, [servers]);

  // Servidores filtrados (obsoletos y próximos a obsoletos)
  const filteredServers = useMemo(() => {
    if (!servers.length) return [];

    return servers.filter(server => {
      // Solo mostrar obsoletos y próximos a obsoletos
      const isObsolete = OBSOLETE_VERSION_NAMES.includes(server.majorVersion);
      const isNearObsolete = NEAR_OBSOLETE_VERSION_NAMES.includes(server.majorVersion);
      
      if (statusFilter === 'obsolete' && !isObsolete) return false;
      if (statusFilter === 'near-obsolete' && !isNearObsolete) return false;
      if (statusFilter === 'all' && !isObsolete && !isNearObsolete) return false;

      const matchesSearch = searchTerm === '' || 
        server.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        server.instanceName.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesAmbiente = ambienteFilter === 'all' || server.ambiente === ambienteFilter;
      const matchesVersion = versionFilter === 'all' || server.majorVersion === versionFilter;

      return matchesSearch && matchesAmbiente && matchesVersion;
    });
  }, [servers, searchTerm, ambienteFilter, versionFilter, statusFilter]);

  // Filtros únicos
  const uniqueAmbientes = useMemo(() => {
    if (!servers.length) return [];
    const obsoleteServers = servers.filter(s => 
      OBSOLETE_VERSION_NAMES.includes(s.majorVersion) || 
      NEAR_OBSOLETE_VERSION_NAMES.includes(s.majorVersion)
    );
    return [...new Set(obsoleteServers.map(s => s.ambiente).filter(Boolean))].sort();
  }, [servers]);

  const uniqueVersions = useMemo(() => {
    if (!servers.length) return [];
    return [...OBSOLETE_VERSION_NAMES, ...NEAR_OBSOLETE_VERSION_NAMES];
  }, [servers]);

  // Exportar CSV
  const exportToCSV = () => {
    if (!filteredServers.length) return;

    const headers = ['Servidor', 'Instancia', 'Ambiente', 'Versión', 'Build', 'Fin Soporte', 'Estado', 'Riesgo'];
    const rows = filteredServers.map(s => {
      const versionInfo = OBSOLETE_VERSIONS.find(v => v.version === s.majorVersion) ||
                         NEAR_OBSOLETE_VERSIONS.find(v => v.version === s.majorVersion);
      const isObsolete = OBSOLETE_VERSION_NAMES.includes(s.majorVersion);
      
      return [
        s.serverName,
        s.instanceName,
        s.ambiente,
        s.majorVersion,
        s.currentBuild,
        versionInfo ? ('endOfSupport' in versionInfo ? versionInfo.endOfSupport : versionInfo.endOfSupport) : 'N/A',
        isObsolete ? 'Obsoleto' : 'Próximo a Obsoleto',
        isObsolete ? 'CRÍTICO' : 'ADVERTENCIA',
      ];
    });

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `instancias_obsoletas_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getVersionBadge = (version: string) => {
    const isObsolete = OBSOLETE_VERSION_NAMES.includes(version);
    const isNearObsolete = NEAR_OBSOLETE_VERSION_NAMES.includes(version);
    
    if (isObsolete) {
      return <Badge variant="destructive">Obsoleto</Badge>;
    }
    if (isNearObsolete) {
      return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Próx. Obsoleto</Badge>;
    }
    return <Badge variant="secondary">Con Soporte</Badge>;
  };

  const getVersionInfo = (version: string) => {
    return OBSOLETE_VERSIONS.find(v => v.version === version) ||
           NEAR_OBSOLETE_VERSIONS.find(v => v.version === version);
  };

  // Error state
  if (isError) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center text-center py-12">
              <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error al cargar instancias</h3>
              <p className="text-muted-foreground mb-4">{(error as Error)?.message}</p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-5 w-80" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
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
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-[200px] w-full" />
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
            <div className="relative">
              <SqlServerIcon className="h-8 w-8" />
              <ShieldAlert className="h-4 w-4 text-red-500 absolute -bottom-1 -right-1" />
            </div>
            Instancias Obsoletas
          </h1>
          <p className="text-muted-foreground">
            Versiones de SQL Server fuera de soporte o próximas a quedar sin soporte
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" disabled={isFetching}>
            <RefreshCw className={cn('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
            Actualizar
          </Button>
          <Button onClick={exportToCSV} variant="outline" disabled={!filteredServers.length}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monitoreadas</CardTitle>
            <Database className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{metrics?.total || 0}</div>
            <p className="text-xs text-muted-foreground">instancias activas</p>
          </CardContent>
        </Card>

        <Card className="border-red-500/20 bg-red-500/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Obsoletas</CardTitle>
            <ShieldAlert className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-500">{metrics?.obsolete || 0}</span>
              <span className="text-lg font-semibold text-red-500/70">
                ({metrics?.obsoleteRate || 0}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">sin soporte de Microsoft</p>
          </CardContent>
        </Card>

        <Card className="border-warning/20 bg-warning/5">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próx. Obsoletas</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-warning">{metrics?.nearObsolete || 0}</span>
              <span className="text-lg font-semibold text-warning/70">
                ({metrics?.total ? Math.round((metrics.nearObsolete / metrics.total) * 100) : 0}%)
              </span>
            </div>
            <p className="text-xs text-muted-foreground">soporte termina pronto</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Riesgo Total</CardTitle>
            <TrendingDown className={`h-4 w-4 ${(metrics?.riskRate ?? 0) > 20 ? 'text-red-500' : 'text-warning'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(metrics?.riskRate ?? 0) > 20 ? 'text-red-500' : 'text-warning'}`}>
              {metrics?.riskRate || 0}%
            </div>
            <p className="text-xs text-muted-foreground">del parque en riesgo</p>
          </CardContent>
        </Card>
      </div>

      {/* Info de versiones */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4 text-primary" />
            Ciclo de Vida de Versiones SQL Server
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Versiones obsoletas */}
            <div>
              <h4 className="font-semibold text-red-500 mb-2 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Sin Soporte (Obsoletas)
              </h4>
              <div className="space-y-1.5">
                {OBSOLETE_VERSIONS.map(v => {
                  const count = servers.filter(s => s.majorVersion === v.version).length;
                  return (
                    <div key={v.version} className="flex justify-between items-center text-sm p-2 rounded bg-red-500/5 border border-red-500/10">
                      <div className="flex items-center gap-2">
                        <SqlServerIcon className="h-4 w-4" />
                        <span className="font-medium">{v.name}</span>
                        <span className="text-muted-foreground">
                          (fin: {new Date(v.endOfSupport).toLocaleDateString('es-ES')})
                        </span>
                      </div>
                      <Badge variant={count > 0 ? "destructive" : "secondary"}>
                        {count} inst.
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Próximas a obsoletas */}
            <div>
              <h4 className="font-semibold text-warning mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Próximas a quedar Obsoletas
              </h4>
              <div className="space-y-1.5">
                {NEAR_OBSOLETE_VERSIONS.map(v => {
                  const count = servers.filter(s => s.majorVersion === v.version).length;
                  return (
                    <div key={v.version} className="flex justify-between items-center text-sm p-2 rounded bg-warning/5 border border-warning/10">
                      <div className="flex items-center gap-2">
                        <SqlServerIcon className="h-4 w-4" />
                        <span className="font-medium">{v.name}</span>
                        <span className="text-muted-foreground">
                          (fin: {new Date(v.endOfSupport).toLocaleDateString('es-ES')})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-warning">~{getMonthsRemaining(v.endOfSupport)} meses</span>
                        <Badge variant={count > 0 ? "outline" : "secondary"} className={count > 0 ? "border-warning text-warning" : ""}>
                          {count} inst.
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>
                    Consulta las fechas de fin de soporte en{' '}
                    <a 
                      href="https://learn.microsoft.com/en-us/lifecycle/products/?products=sql-server" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      Microsoft Lifecycle
                    </a>
                  </span>
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      {(metrics?.obsolete || 0) > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Distribución por versión obsoleta */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Server className="h-4 w-4 text-red-500" />
                Distribución por Versión Obsoleta
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer config={obsoleteChartConfig} className="mx-auto h-[200px]">
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={<ChartTooltipContent hideLabel nameKey="version" />}
                  />
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="version"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    strokeWidth={0}
                  />
                </PieChart>
              </ChartContainer>
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs mt-2">
                {pieData.map((item) => (
                  <div key={item.version} className="flex items-center gap-1.5">
                    <SqlServerIcon className="h-3.5 w-3.5" />
                    <div 
                      className="w-2.5 h-2.5 rounded-sm" 
                      style={{ backgroundColor: obsoleteChartConfig[item.version as keyof typeof obsoleteChartConfig]?.color }}
                    />
                    <span className="text-muted-foreground">
                      {item.version} ({item.value})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Por ambiente */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Database className="h-4 w-4 text-primary" />
                Obsoletas por Ambiente
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {ambienteData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                  Sin datos de ambientes con obsoletos
                </div>
              ) : (
                <ChartContainer 
                  config={ambienteChartConfig} 
                  className="w-full"
                  style={{ height: Math.max(200, ambienteData.length * 35 + 40) }}
                >
                  <BarChart data={ambienteData} layout="vertical" barSize={18} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis 
                      dataKey="ambiente" 
                      type="category" 
                      tick={{ fontSize: 10 }} 
                      width={80}
                      interval={0}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent />}
                    />
                    <Bar dataKey="obsolete" stackId="a" fill="var(--color-obsolete)" radius={[0, 0, 0, 0]} name="Obsoletos" />
                    <Bar dataKey="nearObsolete" stackId="a" fill="var(--color-nearObsolete)" radius={[0, 4, 4, 0]} name="Próx. Obsoletos" />
                  </BarChart>
                </ChartContainer>
              )}
              <div className="flex justify-center gap-4 text-xs mt-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-600" />
                  <span className="text-muted-foreground">Obsoletos</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-amber-500" />
                  <span className="text-muted-foreground">Próx. Obsoletos</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabla de detalle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5 text-red-500" />
            Detalle de Instancias
          </CardTitle>
          <CardDescription>
            {filteredServers.length} instancias {statusFilter === 'all' ? 'obsoletas o próximas' : statusFilter === 'obsolete' ? 'obsoletas' : 'próximas a obsoletas'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[150px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar servidor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="obsolete">Obsoletos</SelectItem>
                <SelectItem value="near-obsolete">Próx. Obsoletos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Ambiente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {uniqueAmbientes.map(amb => (
                  <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={versionFilter} onValueChange={setVersionFilter}>
              <SelectTrigger className="h-8 w-[120px]">
                <SelectValue placeholder="Versión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {uniqueVersions.map(ver => (
                  <SelectItem key={ver} value={ver}>SQL {ver}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tabla */}
          <div className="max-h-[400px] overflow-auto">
            {filteredServers.length === 0 ? (
              <div className="text-center py-12">
                <CalendarX2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No hay instancias obsoletas</h3>
                <p className="text-muted-foreground">
                  ¡Excelente! No tienes instancias con versiones fuera de soporte.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Ambiente</TableHead>
                    <TableHead>Versión</TableHead>
                    <TableHead>Build</TableHead>
                    <TableHead>Fin Soporte</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredServers.map((server, idx) => {
                    const versionInfo = getVersionInfo(server.majorVersion);
                    const isObsolete = OBSOLETE_VERSION_NAMES.includes(server.majorVersion);
                    
                    return (
                      <TableRow 
                        key={`${server.instanceName}-${idx}`} 
                        className={cn({
                          'bg-red-500/5': isObsolete,
                          'bg-warning/5': !isObsolete,
                        })}
                      >
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <SqlServerIcon className="h-4 w-4" />
                                  <div className={cn('w-2 h-2 rounded-full absolute -bottom-0.5 -right-0.5 border border-background', {
                                    'bg-red-500': isObsolete,
                                    'bg-warning': !isObsolete,
                                  })} />
                                </div>
                                <span className="font-medium truncate max-w-[130px]">{server.serverName}</span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Instancia: {server.instanceName}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{server.ambiente}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">SQL {server.majorVersion}</span>
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {server.currentBuild || '-'}
                        </TableCell>
                        <TableCell>
                          {versionInfo && (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className={cn('text-sm', {
                                  'text-red-500': isObsolete,
                                  'text-warning': !isObsolete,
                                })}>
                                  {new Date(versionInfo.endOfSupport).toLocaleDateString('es-ES')}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {'yearsOutOfSupport' in versionInfo 
                                  ? `Fuera de soporte hace ${versionInfo.yearsOutOfSupport} años`
                                  : `Soporte termina en ~${getMonthsRemaining(versionInfo.endOfSupport)} meses`
                                }
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                        <TableCell>{getVersionBadge(server.majorVersion)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Obsoleto (sin soporte)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-warning" /> Próximo a Obsoleto
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" /> Con Soporte
        </span>
      </div>
    </div>
  );
}

