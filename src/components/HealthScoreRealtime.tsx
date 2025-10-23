import { useEffect, useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Activity, Database, HardDrive, Clock } from 'lucide-react';

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

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  // Función para obtener datos (usada en polling)
  const fetchData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreRealtime/latest`);
      
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
        return 'bg-green-500/20 text-green-700 border-green-500/30';
      case 'Warning':
        return 'bg-yellow-500/20 text-yellow-700 border-yellow-500/30';
      case 'Critical':
        return 'bg-red-500/20 text-red-700 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-700 border-gray-500/30';
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
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="flex items-center gap-2 text-red-700">
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
            <Activity className="h-6 w-6 text-blue-500" />
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
          <div className="text-sm text-gray-500">Total Instancias</div>
          <div className="text-3xl font-bold">{data?.count || 0}</div>
        </Card>
        
        <Card className="p-4 border-green-200 bg-green-50">
          <div className="text-sm text-green-600">Healthy</div>
          <div className="text-3xl font-bold text-green-700">{healthyCount}</div>
        </Card>
        
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <div className="text-sm text-yellow-600">Warning</div>
          <div className="text-3xl font-bold text-yellow-700">{warningCount}</div>
        </Card>
        
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="text-sm text-red-600">Critical</div>
          <div className="text-3xl font-bold text-red-700">{criticalCount}</div>
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
                  <Database className="h-4 w-4 text-gray-400" />
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
                  <span className="text-gray-500">Latencia:</span>
                  <span className={instance.connectLatencyMs > 1000 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {instance.connectLatencyMs}ms
                  </span>
                </div>

                {/* Disco */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1">
                    <HardDrive className="h-3 w-3" />
                    Disco:
                  </span>
                  <span className={instance.worstFreePct < 10 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {instance.worstFreePct.toFixed(1)}% libre
                  </span>
                </div>

                {/* Backups */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">FULL Backup:</span>
                  <span className={instance.fullBackupBreached ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {formatRelativeTime(instance.lastFullBackup)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-gray-500">LOG Backup:</span>
                  <span className={instance.logBackupBreached ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                    {formatRelativeTime(instance.lastLogBackup)}
                  </span>
                </div>

                {/* AlwaysOn */}
                {instance.alwaysOnEnabled && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">AlwaysOn:</span>
                    <Badge 
                      variant="outline" 
                      className={
                        instance.alwaysOnWorstState === 'OK' 
                          ? 'border-green-500 text-green-700' 
                          : 'border-yellow-500 text-yellow-700'
                      }
                    >
                      {instance.alwaysOnWorstState}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Footer con timestamp */}
              <div className="text-xs text-gray-400 pt-2 border-t">
                Actualizado: {formatRelativeTime(instance.collectedAt.realTime)}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-700">
          ⚠️ {error} (mostrando últimos datos disponibles)
        </div>
      )}
    </div>
  );
}

