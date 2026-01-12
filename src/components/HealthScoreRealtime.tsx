import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Activity, Database, HardDrive, Clock } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface HealthScoreData {
  instanceName: string;
  healthScore: number;
  healthStatus: 'Healthy' | 'Warning' | 'Critical';
  connectSuccess: boolean;
  connectLatencyMs: number;
  worstFreePct: number;
  alwaysOnEnabled: boolean;
  alwaysOnWorstState: string;
  lastFullBackup: string | null;
  lastLogBackup: string | null;
  fullBackupBreached: boolean;
  logBackupBreached: boolean;
  collectedAt: {
    score: string;
    realTime: string;
    backup: string;
    maintenance: string;
  };
}

interface RealtimeStats {
  count: number;
  data: HealthScoreData[];
  timestamp: string;
}

type RefreshMode = 'sse' | 'polling';

export function HealthScoreRealtime() {
  const [data, setData] = useState<RealtimeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<RefreshMode>('polling'); // SSE o polling
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const API_BASE_URL = getApiUrl();

  // Función para obtener datos (usada en polling)
  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreRealtime/latest`, {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setData(result);
        setLastUpdate(new Date());
        setError(null);
      } else {
        setError(result.error || 'Error desconocido');
      }
    } catch (err: any) {
      console.error('Error fetching health scores:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Iniciar Server-Sent Events (SSE)
  const startSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('Iniciando SSE stream...');
    const eventSource = new EventSource(`${API_BASE_URL}/api/HealthScoreRealtime/stream`);

    eventSource.onmessage = (event) => {
      try {
        const result = JSON.parse(event.data);
        setData(result);
        setLastUpdate(new Date());
        setError(null);
        setLoading(false);
      } catch (err: any) {
        console.error('Error parsing SSE data:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      setError('Conexión SSE perdida');
      eventSource.close();
      
      // Fallback a polling después de 5 segundos
      setTimeout(() => {
        console.log('SSE falló, cambiando a polling...');
        setMode('polling');
      }, 5000);
    };

    eventSource.onopen = () => {
      console.log('SSE conectado');
      setError(null);
    };

    eventSourceRef.current = eventSource;
  };

  // Iniciar polling
  const startPolling = () => {
    // Fetch inmediato
    fetchData();

    // Luego cada 10 segundos
    pollingIntervalRef.current = setInterval(() => {
      fetchData();
    }, 10000);
  };

  // Effect para iniciar/detener streaming según el modo
  useEffect(() => {
    if (mode === 'sse') {
      startSSE();
    } else {
      startPolling();
    }

    // Cleanup
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [mode]);

  // Función para obtener color según Health Status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Healthy':
        return 'bg-success/20 text-success border-success/30';
      case 'Warning':
        return 'bg-warning/20 text-warning border-warning/30';
      case 'Critical':
        return 'bg-destructive/20 text-destructive border-destructive/30';
      default:
        return 'bg-muted/20 text-muted-foreground border-border/30';
    }
  };

  // Función para formatear tiempo relativo
  const formatRelativeTime = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Hace ${diffHours}h`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `Hace ${diffDays}d`;
  };

  if (loading && !data) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 animate-spin" />
          <span>Cargando métricas en tiempo real...</span>
        </div>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card className="p-6 border-destructive/20 bg-destructive/5">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <span>Error: {error}</span>
        </div>
      </Card>
    );
  }

  const healthyCount = data?.data.filter(d => d.healthStatus === 'Healthy').length || 0;
  const warningCount = data?.data.filter(d => d.healthStatus === 'Warning').length || 0;
  const criticalCount = data?.data.filter(d => d.healthStatus === 'Critical').length || 0;

  return (
    <div className="space-y-4">
      {/* Header con stats y controles */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Health Score en Tiempo Real
          </h2>
          
          {lastUpdate && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Actualizado: {lastUpdate.toLocaleTimeString()}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as RefreshMode)}
            className="px-3 py-1 border rounded-md text-sm"
          >
            <option value="polling">Polling (10s)</option>
            <option value="sse">SSE Stream (5s)</option>
          </select>
        </div>
      </div>

      {/* Resumen por estado */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Instancias</div>
          <div className="text-3xl font-bold">{data?.count || 0}</div>
        </Card>
        
        <Card className="p-4 border-success/20 bg-success/5">
          <div className="text-sm text-success">Healthy</div>
          <div className="text-3xl font-bold text-success">{healthyCount}</div>
        </Card>
        
        <Card className="p-4 border-warning/20 bg-warning/5">
          <div className="text-sm text-warning">Warning</div>
          <div className="text-3xl font-bold text-warning">{warningCount}</div>
        </Card>
        
        <Card className="p-4 border-destructive/20 bg-destructive/5">
          <div className="text-sm text-destructive">Critical</div>
          <div className="text-3xl font-bold text-destructive">{criticalCount}</div>
        </Card>
      </div>

      {/* Lista de instancias */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data?.data.map((instance) => (
          <Card key={instance.instanceName} className="p-4 hover:shadow-lg transition-shadow">
            <div className="space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm truncate">
                    {instance.instanceName}
                  </span>
                </div>
                
                <Badge className={getStatusColor(instance.healthStatus)}>
                  {instance.healthScore}
                </Badge>
              </div>

              {/* Métricas clave */}
              <div className="space-y-2 text-xs">
                {/* Conectividad */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Latencia:</span>
                  <span className={instance.connectLatencyMs > 1000 ? 'text-destructive font-semibold' : 'text-foreground'}>
                    {instance.connectLatencyMs}ms
                  </span>
                </div>

                {/* Disco */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Disco:
                  </span>
                  <span className={instance.worstFreePct < 10 ? 'text-destructive font-semibold' : 'text-foreground'}>
                    {instance.worstFreePct.toFixed(1)}% libre
                  </span>
                </div>

                {/* Backups */}
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">FULL Backup:</span>
                  <span className={instance.fullBackupBreached ? 'text-destructive font-semibold' : 'text-foreground'}>
                    {formatRelativeTime(instance.lastFullBackup)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">LOG Backup:</span>
                  <span className={instance.logBackupBreached ? 'text-destructive font-semibold' : 'text-foreground'}>
                    {formatRelativeTime(instance.lastLogBackup)}
                  </span>
                </div>

                {/* AlwaysOn */}
                {instance.alwaysOnEnabled && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">AlwaysOn:</span>
                    <Badge 
                      variant="outline" 
                      className={
                        instance.alwaysOnWorstState === 'OK' 
                          ? 'border-success text-success' 
                          : 'border-warning text-warning'
                      }
                    >
                      {instance.alwaysOnWorstState}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Footer con timestamp */}
              <div className="text-xs text-muted-foreground pt-2 border-t">
                Actualizado: {formatRelativeTime(instance.collectedAt.realTime)}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-md text-sm text-warning">
          ⚠️ {error} (mostrando últimos datos disponibles)
        </div>
      )}
    </div>
  );
}

