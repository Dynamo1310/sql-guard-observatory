import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  ArrowLeft, TrendingUp, Cpu, MemoryStick, HardDrive, Activity,
  AlertTriangle, Gauge, Timer, Layers, RefreshCw
} from 'lucide-react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, ReferenceLine
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { getApiUrl, getAuthHeader, healthScoreV3Api } from '@/services/api';

// Configuraciones de gráficos shadcn - Paleta Azul
const healthScoreChartConfig = {
  score: { label: "Health Score", color: "#2563eb" },
} satisfies ChartConfig;

const cpuChartConfig = {
  sql: { label: "SQL Server", color: "#2563eb" },
  otros: { label: "Otros", color: "#93c5fd" },
} satisfies ChartConfig;

const memoryChartConfig = {
  memoria: { label: "% Usado", color: "#2563eb" },
  buffer: { label: "Buffer Cache %", color: "#60a5fa" },
} satisfies ChartConfig;

const pleChartConfig = {
  ple: { label: "PLE (seg)", color: "#3b82f6" },
} satisfies ChartConfig;

const diskChartConfig = {
  worstFreePct: { label: "Peor Disco", color: "#2563eb" },
} satisfies ChartConfig;

const ioChartConfig = {
  avgReadLatency: { label: "Read Avg", color: "#2563eb" },
  avgWriteLatency: { label: "Write Avg", color: "#60a5fa" },
} satisfies ChartConfig;

// Colores azules para múltiples discos
const DISK_COLORS = [
  '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd',
  '#bfdbfe', '#1e40af', '#1e3a8a', '#3730a3', '#4f46e5'
];

// Colores semánticos para líneas de referencia
const SEMANTIC_COLORS = {
  warning: 'hsl(var(--warning))',
  danger: 'hsl(var(--destructive))',
};

// Helper para formatear tiempo
const formatTime = (timestamp: string, range: number) => {
  const date = new Date(timestamp);
  if (range <= 24) {
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
};

const getHealthScoreColor = (score: number) => {
  if (score >= 90) return 'hsl(var(--foreground))';
  if (score >= 70) return 'hsl(var(--foreground))';
  if (score >= 50) return 'hsl(var(--warning))';
  return 'hsl(var(--destructive))';
};

export default function InstanceTrends() {
  const { instanceName } = useParams<{ instanceName: string }>();
  const navigate = useNavigate();
  const [timeRange, setTimeRange] = useState(24);
  const [selectedDisk, setSelectedDisk] = useState<string>('all');
  const [selectedIODisk, setSelectedIODisk] = useState<string>('C:');
  const lastRefreshRef = useRef<number>(0);
  
  const API_BASE_URL = getApiUrl();

  // Throttled refresh function
  const handleRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshRef.current > 5000) {
      lastRefreshRef.current = now;
    }
  }, []);

  // Obtener detalles actuales de la instancia
  const { data: instanceDetails, isLoading: loadingDetails } = useQuery({
    queryKey: ['instanceDetailsV3', instanceName],
    queryFn: () => healthScoreV3Api.getHealthScoreDetails(instanceName!),
    enabled: !!instanceName,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  // Obtener datos de tendencias de CPU
  const { data: cpuData, isLoading: loadingCpu } = useQuery({
    queryKey: ['cpuTrend', instanceName, timeRange],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/cpu/${instanceName}?hours=${timeRange}`, {
        headers: { ...getAuthHeader() }
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!instanceName,
    staleTime: 30000,
  });

  // Obtener datos de tendencias de Memoria
  const { data: memoryData, isLoading: loadingMemory } = useQuery({
    queryKey: ['memoryTrend', instanceName, timeRange],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/memory/${instanceName}?hours=${timeRange}`, {
        headers: { ...getAuthHeader() }
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!instanceName,
    staleTime: 30000,
  });

  // Obtener datos de tendencias de Disco
  const { data: diskData, isLoading: loadingDisk } = useQuery({
    queryKey: ['diskTrend', instanceName, timeRange],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/disk/${instanceName}?hours=${timeRange}`, {
        headers: { ...getAuthHeader() }
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!instanceName,
    staleTime: 30000,
  });

  // Obtener datos de tendencias de I/O
  const { data: ioData, isLoading: loadingIO } = useQuery({
    queryKey: ['ioTrend', instanceName, timeRange],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/io/${instanceName}?hours=${timeRange}`, {
        headers: { ...getAuthHeader() }
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!instanceName,
    staleTime: 30000,
  });

  // Obtener datos de tendencias de Health Score
  const { data: healthScoreData, isLoading: loadingHealthScore } = useQuery({
    queryKey: ['healthScoreTrend', instanceName, timeRange],
    queryFn: async () => {
      const res = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${timeRange}`, {
        headers: { ...getAuthHeader() }
      });
      const json = await res.json();
      return json.success ? json.data : [];
    },
    enabled: !!instanceName,
    staleTime: 30000,
  });

  if (!instanceName) {
    return (
      <div className="p-6">
        <Card className="p-6 border-destructive/50 bg-destructive/5">
          <p className="text-destructive">Instancia no especificada</p>
        </Card>
      </div>
    );
  }

  const timeRangeOptions = [
    { label: '6h', value: 6 },
    { label: '24h', value: 24 },
    { label: '7d', value: 168 },
    { label: '30d', value: 720 }
  ];

  // Extraer métricas actuales de instanceDetails (V3)
  const currentMetrics = useMemo(() => {
    if (!instanceDetails) return null;
    
    const cpu = instanceDetails.cpuDetails;
    const memoria = instanceDetails.memoriaDetails;
    const discos = instanceDetails.discosDetails;
    const io = instanceDetails.ioDetails;
    const waits = instanceDetails.waitsDetails;
    const errores = instanceDetails.erroresCriticosDetails;

    return {
      healthScore: instanceDetails.healthScore || 0,
      cpu: cpu?.sqlProcessUtilization || 0,
      cpuAvg: cpu?.avgCPUPercentLast10Min || 0,
      memoryUsed: memoria?.totalServerMemoryMB && memoria?.maxServerMemoryMB 
        ? Math.round((memoria.totalServerMemoryMB / memoria.maxServerMemoryMB) * 100) : 0,
      ple: memoria?.pageLifeExpectancy || 0,
      diskFree: discos?.worstFreePct || 0,
      ioReadLatency: io?.avgReadLatencyMs || 0,
      ioWriteLatency: io?.avgWriteLatencyMs || 0,
      blockedSessions: waits?.blockedSessionCount || 0,
      criticalErrors: errores?.severity20PlusCount || 0,
      ambiente: instanceDetails.ambiente,
      sqlVersion: instanceDetails.sqlVersion,
    };
  }, [instanceDetails]);

  // Extraer lista de discos disponibles
  const availableDisks = useMemo(() => {
    if (!diskData || diskData.length === 0) return [];
    const firstPoint = diskData[0];
    if (!firstPoint.volumesJson) return [];
    
    try {
      const volumes = JSON.parse(firstPoint.volumesJson);
      return volumes.map((v: any) => v.MountPoint || v.mountPoint).filter(Boolean);
    } catch {
      return [];
    }
  }, [diskData]);

  // Extraer lista de discos disponibles en datos de IO (normalizado a mayúsculas)
  const availableIODisks = useMemo(() => {
    if (!ioData || ioData.length === 0) return [];
    const disksSet = new Set<string>();
    
    ioData.forEach((d: any) => {
      if (d.ioByVolumeJson) {
        try {
          const volumes = JSON.parse(d.ioByVolumeJson);
          volumes.forEach((v: any) => {
            const vol = v.MountPoint || v.mountPoint || v.Volume || v.volume;
            if (vol) disksSet.add(vol.toUpperCase()); // Normalizar a mayúsculas
          });
        } catch { /* ignore */ }
      }
    });
    
    return Array.from(disksSet).sort();
  }, [ioData]);

  // Resetear estado cuando cambia la instancia
  const prevInstanceName = useRef(instanceName);
  const ioDisksInitialized = useRef(false);
  
  useEffect(() => {
    if (prevInstanceName.current !== instanceName) {
      prevInstanceName.current = instanceName;
      ioDisksInitialized.current = false;
      setSelectedIODisk('C:'); // Reset a valor por defecto
    }
  }, [instanceName]);

  // Establecer disco por defecto para IO (C: si existe, sino el primero disponible)
  useEffect(() => {
    if (!ioDisksInitialized.current) {
      if (availableIODisks.length > 0) {
        ioDisksInitialized.current = true;
        // Si C: está disponible, usarlo como default
        if (availableIODisks.includes('C:')) {
          setSelectedIODisk('C:');
        } else {
          // Si no hay C:, usar el primer disco disponible
          setSelectedIODisk(availableIODisks[0]);
        }
      }
    }
  }, [availableIODisks]);


  // Preparar datos de Health Score
  const healthScoreChartData = useMemo(() => {
    if (!healthScoreData) return [];
    return healthScoreData.map((d: any) => ({
      time: formatTime(d.timestamp, timeRange),
      score: d.healthScore,
    }));
  }, [healthScoreData, timeRange]);

  // Preparar datos de CPU
  const cpuChartData = useMemo(() => {
    if (!cpuData) return [];
    return cpuData.map((d: any) => ({
      time: formatTime(d.timestamp, timeRange),
      sql: d.sqlServerCpu || 0,
      otros: d.otherProcessesCpu || 0,
    }));
  }, [cpuData, timeRange]);

  // Preparar datos de Memoria
  const memoryChartData = useMemo(() => {
    if (!memoryData) return [];
    return memoryData.map((d: any) => ({
      time: formatTime(d.timestamp, timeRange),
      memoria: d.memoryUsedPct || 0,
      buffer: d.bufferCacheHitRatio || 0,
    }));
  }, [memoryData, timeRange]);

  // Preparar datos de PLE
  const pleChartData = useMemo(() => {
    if (!memoryData) return [];
    return memoryData.map((d: any) => ({
      time: formatTime(d.timestamp, timeRange),
      ple: d.pageLifeExpectancy || 0,
    }));
  }, [memoryData, timeRange]);

  // Preparar datos de disco con todos los volúmenes
  const diskChartData = useMemo(() => {
    if (!diskData) return [];
    
    return diskData.map((d: any) => {
      const point: any = {
        time: formatTime(d.timestamp, timeRange),
        worstFreePct: d.worstFreePct || 0,
      };
      
      if (d.volumesJson) {
        try {
          const volumes = JSON.parse(d.volumesJson);
          volumes.forEach((v: any) => {
            const mount = v.MountPoint || v.mountPoint;
            if (mount) {
              point[mount] = v.FreePct || v.freePct || 0;
            }
          });
        } catch { /* ignore */ }
      }
      
      return point;
    });
  }, [diskData, timeRange]);

  // Generar config dinámico para discos
  const dynamicDiskChartConfig = useMemo(() => {
    const config: ChartConfig = {
      worstFreePct: { label: "Peor Disco", color: "#3f3f46" },
    };
    availableDisks.forEach((disk: string, idx: number) => {
      config[disk] = { label: disk, color: DISK_COLORS[idx % DISK_COLORS.length] };
    });
    return config;
  }, [availableDisks]);

  // Preparar datos de I/O con todos los volúmenes (normalizado a mayúsculas)
  const ioChartData = useMemo(() => {
    if (!ioData) return [];
    
    return ioData.map((d: any) => {
      const point: any = {
        time: formatTime(d.timestamp, timeRange),
        avgReadLatency: d.avgReadLatency || 0,
        avgWriteLatency: d.avgWriteLatency || 0,
      };
      
      // Extraer datos por volumen de ioByVolumeJson
      if (d.ioByVolumeJson) {
        try {
          const volumes = JSON.parse(d.ioByVolumeJson);
          volumes.forEach((v: any) => {
            // El JSON usa MountPoint (ej: "C:", "D:")
            const vol = (v.MountPoint || v.mountPoint || v.Volume || v.volume || '').toUpperCase();
            if (vol) {
              // Propiedades: AvgReadLatencyMs, AvgWriteLatencyMs
              // Acumular valores si ya existe (para combinar h: y H:)
              const readVal = v.AvgReadLatencyMs || v.avgReadLatencyMs || v.ReadLatencyMs || v.readLatencyMs || 0;
              const writeVal = v.AvgWriteLatencyMs || v.avgWriteLatencyMs || v.WriteLatencyMs || v.writeLatencyMs || 0;
              
              // Si ya existe el disco, tomar el valor mayor (más relevante)
              if (point[`${vol}_read`] !== undefined) {
                point[`${vol}_read`] = Math.max(point[`${vol}_read`], readVal);
                point[`${vol}_write`] = Math.max(point[`${vol}_write`], writeVal);
              } else {
                point[`${vol}_read`] = readVal;
                point[`${vol}_write`] = writeVal;
              }
            }
          });
        } catch { /* ignore */ }
      }
      
      return point;
    });
  }, [ioData, timeRange]);

  // Generar config dinámico para IO
  const dynamicIOChartConfig = useMemo(() => {
    const config: ChartConfig = {
      avgReadLatency: { label: "Read Avg", color: "#3f3f46" },
      avgWriteLatency: { label: "Write Avg", color: "#71717a" },
    };
    availableIODisks.forEach((disk: string, idx: number) => {
      config[`${disk}_read`] = { label: `${disk} Read`, color: DISK_COLORS[idx * 2 % DISK_COLORS.length] };
      config[`${disk}_write`] = { label: `${disk} Write`, color: DISK_COLORS[(idx * 2 + 1) % DISK_COLORS.length] };
    });
    return config;
  }, [availableIODisks]);

  const showLoading = loadingDetails;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/healthscore')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-muted/50 border border-border">
                  <TrendingUp className="h-6 w-6 text-foreground" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">
                    Dashboard - {instanceName}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {currentMetrics?.ambiente && <Badge variant="outline" className="mr-2">{currentMetrics.ambiente}</Badge>}
                    {currentMetrics?.sqlVersion && <span className="text-xs">{currentMetrics.sqlVersion}</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Controles */}
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/50 rounded-lg p-1">
              {timeRangeOptions.map(option => (
                <Button
                  key={option.value}
                  variant={timeRange === option.value ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTimeRange(option.value)}
                  className="px-3"
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <Button 
              onClick={handleRefresh}
              variant="outline"
              size="sm"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {showLoading ? (
            Array(8).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <Skeleton className="h-8 w-16 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              {/* Health Score */}
              <Card className="border-l-4" style={{ borderLeftColor: getHealthScoreColor(currentMetrics?.healthScore || 0) }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold" style={{ color: getHealthScoreColor(currentMetrics?.healthScore || 0) }}>
                        {currentMetrics?.healthScore || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Health Score</p>
                    </div>
                    <Gauge className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* CPU */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.cpu || 0) >= 80 ? 'text-destructive' : (currentMetrics?.cpu || 0) >= 60 ? 'text-warning' : 'text-foreground'}`}>
                        {currentMetrics?.cpu || 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">CPU</p>
                    </div>
                    <Cpu className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Memoria */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.memoryUsed || 0) >= 95 ? 'text-destructive' : (currentMetrics?.memoryUsed || 0) >= 85 ? 'text-warning' : 'text-foreground'}`}>
                        {currentMetrics?.memoryUsed || 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">Memoria</p>
                    </div>
                    <MemoryStick className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* PLE */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.ple || 0) < 300 ? 'text-destructive' : (currentMetrics?.ple || 0) < 600 ? 'text-warning' : 'text-foreground'}`}>
                        {currentMetrics?.ple || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">PLE (seg)</p>
                    </div>
                    <Timer className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Disco */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.diskFree || 0) < 10 ? 'text-destructive' : (currentMetrics?.diskFree || 0) < 20 ? 'text-warning' : 'text-foreground'}`}>
                        {(currentMetrics?.diskFree || 0).toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Disco Libre</p>
                    </div>
                    <HardDrive className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* I/O Latencia */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.ioReadLatency || 0) > 20 ? 'text-destructive' : (currentMetrics?.ioReadLatency || 0) > 10 ? 'text-warning' : 'text-foreground'}`}>
                        {(currentMetrics?.ioReadLatency || 0).toFixed(0)}ms
                      </p>
                      <p className="text-xs text-muted-foreground">I/O Read</p>
                    </div>
                    <Activity className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Blocking */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.blockedSessions || 0) > 5 ? 'text-destructive' : (currentMetrics?.blockedSessions || 0) > 0 ? 'text-warning' : 'text-foreground'}`}>
                        {currentMetrics?.blockedSessions || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Blocking</p>
                    </div>
                    <Layers className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>

              {/* Errores */}
              <Card className="border-l-4 border-l-border">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-2xl font-bold ${(currentMetrics?.criticalErrors || 0) > 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {currentMetrics?.criticalErrors || 0}
                      </p>
                      <p className="text-xs text-muted-foreground">Errores 24h</p>
                    </div>
                    <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Gráficos principales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Health Score Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                Tendencia Health Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingHealthScore ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={healthScoreChartConfig} className="h-[200px] w-full">
                  <AreaChart data={healthScoreChartData}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-score)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--color-score)" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ReferenceLine y={70} stroke={SEMANTIC_COLORS.warning} strokeDasharray="3 3" />
                    <ReferenceLine y={90} stroke="#2563eb" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="score" stroke="var(--color-score)" strokeWidth={2} fillOpacity={1} fill="url(#colorScore)" />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* CPU Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4 text-muted-foreground" />
                Uso de CPU
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCpu ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={cpuChartConfig} className="h-[200px] w-full">
                  <AreaChart data={cpuChartData}>
                    <defs>
                      <linearGradient id="colorSql" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-sql)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--color-sql)" stopOpacity={0.1}/>
                      </linearGradient>
                      <linearGradient id="colorOtros" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-otros)" stopOpacity={0.6}/>
                        <stop offset="95%" stopColor="var(--color-otros)" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Area type="monotone" dataKey="sql" stackId="1" stroke="var(--color-sql)" strokeWidth={2} fill="url(#colorSql)" />
                    <Area type="monotone" dataKey="otros" stackId="1" stroke="var(--color-otros)" strokeWidth={2} fill="url(#colorOtros)" />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Segunda fila de gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Memoria Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <MemoryStick className="h-4 w-4 text-muted-foreground" />
                Memoria & Buffer Cache
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMemory ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={memoryChartConfig} className="h-[200px] w-full">
                  <LineChart data={memoryChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Line type="monotone" dataKey="memoria" stroke="var(--color-memoria)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="buffer" stroke="var(--color-buffer)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* PLE Trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Page Life Expectancy
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingMemory ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={pleChartConfig} className="h-[200px] w-full">
                  <AreaChart data={pleChartData}>
                    <defs>
                      <linearGradient id="colorPLE" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-ple)" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="var(--color-ple)" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ReferenceLine y={300} stroke={SEMANTIC_COLORS.danger} strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="ple" stroke="var(--color-ple)" strokeWidth={2} fillOpacity={1} fill="url(#colorPLE)" />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tercera fila - Disco e I/O por volumen */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Espacio en Disco por Volumen */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  Espacio en Disco (% Libre)
                </CardTitle>
                {availableDisks.length > 0 && (
                  <Select value={selectedDisk} onValueChange={setSelectedDisk}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Disco" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="worst">Peor</SelectItem>
                      {availableDisks.map((disk: string) => (
                        <SelectItem key={disk} value={disk}>{disk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingDisk ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={dynamicDiskChartConfig} className="h-[200px] w-full">
                  <LineChart data={diskChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <ReferenceLine y={10} stroke={SEMANTIC_COLORS.danger} strokeDasharray="3 3" />
                    <ReferenceLine y={20} stroke={SEMANTIC_COLORS.warning} strokeDasharray="3 3" />
                    {selectedDisk === 'worst' ? (
                      <Line type="monotone" dataKey="worstFreePct" stroke="var(--color-worstFreePct)" strokeWidth={2} dot={false} />
                    ) : selectedDisk === 'all' ? (
                      availableDisks.map((disk: string, idx: number) => (
                        <Line key={disk} type="monotone" dataKey={disk} stroke={DISK_COLORS[idx % DISK_COLORS.length]} strokeWidth={2} dot={false} />
                      ))
                    ) : (
                      <Line type="monotone" dataKey={selectedDisk} stroke="#2563eb" strokeWidth={2} dot={false} />
                    )}
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>

          {/* Latencia I/O por Volumen */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Latencia I/O (ms)
                </CardTitle>
                {availableIODisks.length > 0 && (
                  <Select value={selectedIODisk} onValueChange={setSelectedIODisk}>
                    <SelectTrigger className="w-[140px] h-8 text-xs">
                      <SelectValue placeholder="Disco" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="avg">Promedio</SelectItem>
                      {availableIODisks.map((disk: string) => (
                        <SelectItem key={disk} value={disk}>{disk}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingIO ? (
                <Skeleton className="h-[200px] w-full" />
              ) : (
                <ChartContainer config={dynamicIOChartConfig} className="h-[200px] w-full">
                  <LineChart data={ioChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <ReferenceLine y={20} stroke={SEMANTIC_COLORS.danger} strokeDasharray="3 3" />
                    {selectedIODisk === 'avg' || !availableIODisks.includes(selectedIODisk) ? (
                      <>
                        <Line type="monotone" dataKey="avgReadLatency" stroke="var(--color-avgReadLatency)" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="avgWriteLatency" stroke="var(--color-avgWriteLatency)" strokeWidth={2} dot={false} />
                      </>
                    ) : (
                      <>
                        <Line type="monotone" dataKey={`${selectedIODisk}_read`} stroke="#2563eb" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey={`${selectedIODisk}_write`} stroke="#60a5fa" strokeWidth={2} dot={false} />
                      </>
                    )}
                  </LineChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground pt-2">
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-foreground" /> Normal
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-warning" /> Advertencia
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive" /> Crítico
          </span>
        </div>
      </div>
    </div>
  );
}
