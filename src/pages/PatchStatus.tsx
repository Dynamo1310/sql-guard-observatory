import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, AlertTriangle, 
  Server, CheckCircle2, XCircle, Clock, Download, TrendingUp, 
  Activity, Database, ShieldOff
} from 'lucide-react';
import { patchingApi, ServerPatchStatusDto } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from 'recharts';

const CURRENT_YEAR = new Date().getFullYear();

export default function PatchStatus() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ambienteFilter, setAmbienteFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(CURRENT_YEAR);

  const [isRefreshing, setIsRefreshing] = useState(false);

  // Query para obtener años disponibles
  const { data: complianceYears } = useQuery({
    queryKey: ['complianceYears'],
    queryFn: patchingApi.getComplianceYears,
  });

  const { 
    data: rawServers, 
    isLoading, 
    isError, 
    error,
    refetch, 
    isFetching 
  } = useQuery({
    queryKey: ['patchStatus', selectedYear],
    queryFn: () => patchingApi.getStatus(false, selectedYear),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Filtrar servidores que no responden (solo mostrar los que tienen conexión exitosa)
  const servers = useMemo(() => {
    if (!rawServers) return [];
    return rawServers.filter(s => s.connectionSuccess === true);
  }, [rawServers]);

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    try {
      await patchingApi.getStatus(true, selectedYear);
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Años disponibles para el selector
  const availableYears = useMemo(() => {
    const years = new Set(complianceYears || []);
    years.add(CURRENT_YEAR);
    years.add(CURRENT_YEAR + 1);
    return Array.from(years).sort((a, b) => b - a);
  }, [complianceYears]);

  // Estado de carga combinado
  const showLoading = isLoading || isRefreshing;

  // Calcular métricas
  const metrics = useMemo(() => {
    if (!servers) return null;
    
    const total = servers.length;
    const updated = servers.filter(s => s.patchStatus === 'Updated').length;
    const compliant = servers.filter(s => s.patchStatus === 'Compliant').length;
    const nonCompliant = servers.filter(s => s.patchStatus === 'NonCompliant').length;
    const outdated = servers.filter(s => s.patchStatus === 'Outdated').length;
    const critical = servers.filter(s => s.patchStatus === 'Critical' || s.pendingCUsForCompliance >= 3).length;
    const errors = servers.filter(s => s.patchStatus === 'Error' || s.patchStatus === 'Unknown').length;
    
    // Versiones Legacy (fuera de soporte extendido): 2005, 2008, 2008 R2, 2012, 2014
    const legacyVersions = ['2005', '2008', '2008 R2', '2012', '2014'];
    const legacyServers = servers.filter(s => legacyVersions.includes(s.majorVersion)).length;
    
    const complianceRate = total > 0 ? Math.round(((updated + compliant) / total) * 100) : 0;
    
    return { total, updated, compliant, nonCompliant, outdated, critical, errors, legacyServers, complianceRate };
  }, [servers]);

  // Datos para gráfico de pie
  const pieData = useMemo(() => {
    if (!metrics) return [];
    return [
      { name: 'Actualizado', value: metrics.updated, color: 'var(--color-updated)' },
      { name: 'Compliance', value: metrics.compliant, color: 'var(--color-compliant)' },
      { name: 'No Compliance', value: metrics.nonCompliant, color: 'var(--color-noncompliant)' },
      { name: 'Crítico', value: metrics.critical, color: 'var(--color-critical)' },
      { name: 'Error', value: metrics.errors, color: 'var(--color-error)' },
    ].filter(d => d.value > 0);
  }, [metrics]);

  // Datos para gráfico de barras por versión
  const versionData = useMemo(() => {
    if (!servers) return [];
    
    const byVersion = servers.reduce((acc, s) => {
      const version = s.majorVersion || 'Otro';
      if (!acc[version]) {
        acc[version] = { 
          version: version, 
          versionLabel: version.includes('R2') ? version : `${version}`,
          compliant: 0, 
          nonCompliant: 0, 
          total: 0 
        };
      }
      acc[version].total++;
      if (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant') {
        acc[version].compliant++;
      } else {
        acc[version].nonCompliant++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(byVersion).sort((a: any, b: any) => b.total - a.total);
  }, [servers]);

  // Datos para gráfico de % Compliance por Ambiente
  const ambienteComplianceData = useMemo(() => {
    if (!servers) return [];
    
    const byAmbiente = servers.reduce((acc, s) => {
      const ambiente = s.ambiente || 'Sin definir';
      if (!acc[ambiente]) {
        acc[ambiente] = { ambiente, total: 0, compliant: 0, nonCompliant: 0 };
      }
      acc[ambiente].total++;
      if (s.patchStatus === 'Updated' || s.patchStatus === 'Compliant') {
        acc[ambiente].compliant++;
      } else {
        acc[ambiente].nonCompliant++;
      }
      return acc;
    }, {} as Record<string, any>);
    
    return Object.values(byAmbiente)
      .map((a: any) => ({
        ...a,
        complianceRate: a.total > 0 ? Math.round((a.compliant / a.total) * 100) : 0,
        nonComplianceRate: a.total > 0 ? Math.round((a.nonCompliant / a.total) * 100) : 0,
      }))
      .sort((a: any, b: any) => a.complianceRate - b.complianceRate); // Menor compliance primero (prioridad)
  }, [servers]);

  // Top servidores NO compliance (solo los que realmente no cumplen con el requisito)
  const topNonCompliant = useMemo(() => {
    if (!servers) return [];
    return servers
      .filter(s => s.patchStatus === 'NonCompliant' || s.patchStatus === 'Critical' || s.patchStatus === 'Outdated')
      .sort((a, b) => b.pendingCUsForCompliance - a.pendingCUsForCompliance)
      .slice(0, 8);
  }, [servers]);

  // Función para obtener los pendientes a mostrar
  const getPendingCount = (server: ServerPatchStatusDto) => {
    if (server.patchStatus === 'Compliant') {
      return server.pendingCUsForLatest; // Mostrar pendientes para última versión
    }
    return server.pendingCUsForCompliance; // Mostrar pendientes para compliance
  };

  // Filtros únicos
  const uniqueAmbientes = useMemo(() => {
    if (!servers) return [];
    return [...new Set(servers.map(s => s.ambiente).filter(Boolean))].sort();
  }, [servers]);

  const uniqueVersions = useMemo(() => {
    if (!servers) return [];
    return [...new Set(servers.map(s => s.majorVersion).filter(Boolean))].sort();
  }, [servers]);

  // Filtrar servidores
  const filteredServers = useMemo(() => {
    if (!servers) return [];
    
    return servers.filter(server => {
      const matchesSearch = searchTerm === '' || 
        server.serverName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        server.instanceName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAmbiente = ambienteFilter === 'all' || server.ambiente === ambienteFilter;
      const matchesStatus = statusFilter === 'all' || server.patchStatus === statusFilter;
      const matchesVersion = versionFilter === 'all' || server.majorVersion === versionFilter;
      
      return matchesSearch && matchesAmbiente && matchesStatus && matchesVersion;
    });
  }, [servers, searchTerm, ambienteFilter, statusFilter, versionFilter]);

  // Exportar CSV
  const exportToCSV = () => {
    if (!filteredServers.length) return;
    
    const headers = ['Servidor', 'Instancia', 'Ambiente', 'Versión', 'Build Actual', 'CU Actual', 'Build Requerido', 'CU Requerido', 'CUs Pend. Compliance', 'CUs Pend. Última', 'Estado'];
    const rows = filteredServers.map(s => [
      s.serverName, s.instanceName, s.ambiente, s.majorVersion, s.currentBuild,
      s.currentCU || s.currentSP, s.requiredBuild, s.requiredCU, s.pendingCUsForCompliance, s.pendingCUsForLatest, s.patchStatus
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `patch_compliance_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const getStatusBadge = (status: string, pendingCUs: number) => {
    switch (status) {
      case 'Updated':
        return <Badge className="bg-emerald-500 dark:bg-emerald-600 text-white border-0">Actualizado</Badge>;
      case 'Compliant':
        return <Badge className="bg-blue-500 dark:bg-blue-600 text-white border-0">Compliance</Badge>;
      case 'NonCompliant':
        return <Badge className="bg-orange-500 dark:bg-orange-600 text-white border-0">No Compliance</Badge>;
      case 'Critical':
        return <Badge className="bg-red-500 dark:bg-red-600 text-white border-0">Crítico</Badge>;
      case 'Outdated':
        return <Badge className="bg-amber-500 dark:bg-amber-600 text-white border-0">Desactualizado</Badge>;
      case 'Error':
        return <Badge className="bg-gray-500 dark:bg-gray-600 text-white border-0">Error</Badge>;
      default:
        return <Badge variant="secondary">Desconocido</Badge>;
    }
  };

  if (isError) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-destructive">
              <ShieldX className="h-6 w-6" />
              <div>
                <p className="font-medium">Error al cargar el estado de parcheo</p>
                <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
              </div>
            </div>
            <Button onClick={() => refetch()} variant="outline" className="mt-4">
              <RefreshCw className="w-4 h-4 mr-2" /> Reintentar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* CSS Variables for colors */}
      <style>{`
        :root {
          --color-updated: #10b981;
          --color-compliant: #3b82f6;
          --color-noncompliant: #f97316;
          --color-critical: #ef4444;
          --color-error: #6b7280;
        }
      `}</style>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Estado de Parcheo SQL Server</h1>
              <p className="text-muted-foreground text-sm">
                Última actualización: {servers?.[0]?.lastChecked 
                  ? new Date(servers[0].lastChecked).toLocaleString('es-AR')
                  : 'N/A'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {/* Selector de año de compliance */}
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map(year => (
                <SelectItem key={year} value={year.toString()}>
                  Compliance {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleForceRefresh} 
            disabled={showLoading || isFetching}
            variant="default"
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${showLoading || isFetching ? 'animate-spin' : ''}`} />
            {showLoading || isFetching ? 'Actualizando...' : 'Actualizar'}
          </Button>
          <Button 
            onClick={exportToCSV} 
            variant="outline"
            disabled={!filteredServers.length}
            className="gap-2"
          >
            <Download className="w-4 h-4" /> CSV
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {showLoading ? (
          Array(7).fill(0).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold">{metrics?.total || 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <Database className="h-6 w-6 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-primary">{metrics?.complianceRate || 0}%</p>
                    <p className="text-xs text-muted-foreground">Compliance</p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics?.updated || 0}</p>
                    <p className="text-xs text-muted-foreground">Actualizado</p>
                  </div>
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{metrics?.compliant || 0}</p>
                    <p className="text-xs text-muted-foreground">Compliance</p>
                  </div>
                  <ShieldCheck className="h-6 w-6 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-orange-500/30 bg-orange-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{metrics?.nonCompliant || 0}</p>
                    <p className="text-xs text-muted-foreground">No Compliance</p>
                  </div>
                  <ShieldOff className="h-6 w-6 text-orange-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">{metrics?.critical || 0}</p>
                    <p className="text-xs text-muted-foreground">Crítico</p>
                  </div>
                  <ShieldAlert className="h-6 w-6 text-red-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center justify-between cursor-help">
                      <div>
                        <p className={`text-2xl font-bold ${(metrics?.legacyServers || 0) > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                          {metrics?.legacyServers || 0}
                        </p>
                        <p className="text-xs text-muted-foreground">Legacy</p>
                      </div>
                      <Clock className="h-6 w-6 text-amber-500" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Servidores con versiones fuera de soporte</p>
                    <p className="text-xs text-muted-foreground">2005, 2008, 2008 R2, 2012, 2014</p>
                  </TooltipContent>
                </Tooltip>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de Dona */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribución por Estado</CardTitle>
          </CardHeader>
          <CardContent>
            {showLoading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Skeleton className="h-32 w-32 rounded-full" />
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap justify-center gap-3 mt-2 text-xs">
              {pieData.map((entry, idx) => (
                <span key={idx} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  {entry.name}: {entry.value}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Gráfico por Versión */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Compliance por Versión</CardTitle>
          </CardHeader>
          <CardContent>
            {showLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={versionData} layout="vertical" barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} className="fill-muted-foreground" />
                  <YAxis 
                    dataKey="versionLabel" 
                    type="category" 
                    tick={{ fontSize: 10 }} 
                    width={70}
                    className="fill-muted-foreground"
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="compliant" stackId="a" fill="var(--color-compliant)" name="Compliance" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="nonCompliant" stackId="a" fill="var(--color-noncompliant)" name="No Compliance" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* % Compliance por Ambiente */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">% Compliance por Ambiente</CardTitle>
          </CardHeader>
          <CardContent>
            {showLoading ? (
              <Skeleton className="h-[200px] w-full" />
            ) : ambienteComplianceData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                Sin datos de ambientes
              </div>
            ) : (
              <div className="space-y-3 py-2">
                {ambienteComplianceData.map((amb: any) => (
                  <div key={amb.ambiente} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate max-w-[120px]">{amb.ambiente}</span>
                      <span className={`font-bold ${
                        amb.complianceRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                        amb.complianceRate >= 70 ? 'text-blue-600 dark:text-blue-400' :
                        amb.complianceRate >= 50 ? 'text-orange-600 dark:text-orange-400' :
                        'text-red-600 dark:text-red-400'
                      }`}>
                        {amb.complianceRate}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${
                          amb.complianceRate >= 90 ? 'bg-emerald-500' :
                          amb.complianceRate >= 70 ? 'bg-blue-500' :
                          amb.complianceRate >= 50 ? 'bg-orange-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${amb.complianceRate}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{amb.compliant} en compliance</span>
                      <span>{amb.nonCompliant} pendientes</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Fila inferior */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Top No Compliance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Top No Compliance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {showLoading ? (
              <div className="p-4 space-y-2">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : topNonCompliant.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
                ¡Todos en compliance!
              </div>
            ) : (
              <div className="divide-y">
                {topNonCompliant.map((server, idx) => (
                  <div key={server.instanceName} className="px-4 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                        idx < 3 ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400' : 'bg-muted text-muted-foreground'
                      }`}>
                        {idx + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium truncate max-w-[120px]">{server.serverName}</p>
                        <p className="text-xs text-muted-foreground">{server.ambiente}</p>
                      </div>
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`font-bold ${
                        server.pendingCUsForCompliance >= 3
                          ? 'border-red-500 text-red-600 dark:text-red-400' 
                          : 'border-orange-500 text-orange-600 dark:text-orange-400'
                      }`}
                    >
                      {server.pendingCUsForCompliance} CUs
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabla de Detalle */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
              <CardTitle className="text-sm font-medium">
                Detalle de Servidores ({filteredServers.length})
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
                <Select value={ambienteFilter} onValueChange={setAmbienteFilter}>
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue placeholder="Ambiente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {uniqueAmbientes.map(amb => (
                      <SelectItem key={amb} value={amb}>{amb}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-32 text-sm">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Updated">Actualizado</SelectItem>
                    <SelectItem value="Compliant">Compliance</SelectItem>
                    <SelectItem value="NonCompliant">No Compliance</SelectItem>
                    <SelectItem value="Critical">Crítico</SelectItem>
                    <SelectItem value="Error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={versionFilter} onValueChange={setVersionFilter}>
                  <SelectTrigger className="h-8 w-28 text-sm">
                    <SelectValue placeholder="Versión" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {uniqueVersions.map(ver => (
                      <SelectItem key={ver} value={ver}>{ver}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {showLoading ? (
              <div className="p-4 space-y-2">
                {Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10">
                    <TableRow>
                      <TableHead className="text-xs">Servidor</TableHead>
                      <TableHead className="text-xs">Ambiente</TableHead>
                      <TableHead className="text-xs">Versión</TableHead>
                      <TableHead className="text-xs">Build Actual</TableHead>
                      <TableHead className="text-xs">CU Actual</TableHead>
                      <TableHead className="text-xs">Requerido</TableHead>
                      <TableHead className="text-xs text-center">
                        <Tooltip>
                          <TooltipTrigger className="cursor-help">Pend.</TooltipTrigger>
                          <TooltipContent>
                            CUs pendientes para compliance o última versión
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-xs">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredServers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          No hay servidores que coincidan con los filtros
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredServers.map((server, idx) => (
                        <TableRow key={`${server.instanceName}-${idx}`} className="hover:bg-muted/50">
                          <TableCell className="py-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${server.connectionSuccess ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                  <span className="text-sm font-medium truncate max-w-[130px]">{server.serverName}</span>
                                  {server.isDmzServer && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30">
                                      DMZ
                                    </Badge>
                                  )}
                                  {server.hostingSite?.toLowerCase() === 'aws' && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/30">
                                      AWS
                                    </Badge>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Instancia: {server.instanceName}</p>
                                <p>Conexión: {server.connectionSuccess ? 'OK' : 'Error'}</p>
                                {server.isDmzServer && <p className="text-amber-500 text-xs">📡 Datos desde inventario (DMZ)</p>}
                                {server.hostingSite?.toLowerCase() === 'aws' && <p className="text-orange-500 text-xs">☁️ Hosting: AWS</p>}
                                {server.errorMessage && <p className="text-destructive text-xs">{server.errorMessage}</p>}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">{server.ambiente}</TableCell>
                          <TableCell className="py-2 text-xs text-muted-foreground">{server.majorVersion}</TableCell>
                          <TableCell className="py-2 font-mono text-xs">{server.currentBuild || '-'}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-xs">{server.currentCU || server.currentSP || '-'}</Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="secondary" className="text-xs">{server.requiredCU || '-'}</Badge>
                          </TableCell>
                          <TableCell className="py-2 text-center">
                            {(() => {
                              const pendingCount = getPendingCount(server);
                              if (pendingCount > 0) {
                                return (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <span className={`font-bold text-sm ${
                                        server.patchStatus === 'Compliant' 
                                          ? 'text-blue-600 dark:text-blue-400' 
                                          : pendingCount >= 3 
                                            ? 'text-red-600 dark:text-red-400' 
                                            : 'text-orange-600 dark:text-orange-400'
                                      }`}>
                                        {pendingCount}
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {server.patchStatus === 'Compliant' 
                                        ? `${pendingCount} CU(s) pendiente(s) para última versión`
                                        : `${pendingCount} CU(s) pendiente(s) para compliance`
                                      }
                                    </TooltipContent>
                                  </Tooltip>
                                );
                              }
                              return <span className="text-emerald-600 dark:text-emerald-400">0</span>;
                            })()}
                          </TableCell>
                          <TableCell className="py-2">{getStatusBadge(server.patchStatus, server.pendingCUsForCompliance)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-emerald-500" /> Actualizado (última CU)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-blue-500" /> Compliance (cumple requisito)
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-orange-500" /> No Compliance
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" /> Crítico (3+ CUs atrasado)
        </span>
      </div>
    </div>
  );
}
