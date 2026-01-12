import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Loader2 } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface TrendDataPoint {
  timestamp: string;
  healthScore: number;
  healthStatus: string;
  breakdown?: {
    availability: number;
    backup: number;
    disk: number;
    alwaysOn: number;
    errorlog: number;
  };
}

interface Props {
  instanceName: string;
  hours?: number;
  refreshTrigger?: number;
}

export function HealthScoreTrendChart({ instanceName, hours = 24, refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<TrendDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = getApiUrl();

  // Carga inicial
  useEffect(() => {
    fetchTrendData();
  }, [instanceName, hours]);

  // Actualización silenciosa cuando cambia refreshTrigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchTrendDataSilently();
    }
  }, [refreshTrigger]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${hours}`, {
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
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || 'Error desconocido');
      }
    } catch (err: any) {
      console.error('Error fetching trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Actualización silenciosa sin cambiar el estado de loading
  const fetchTrendDataSilently = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/healthscore/${instanceName}?hours=${hours}`, {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        }
      });
      
      if (!response.ok) return;

      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
        setError(null);
      }
    } catch (err: any) {
      // Silenciar errores en actualizaciones automáticas
      console.debug('Error en actualización silenciosa:', err);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getStatusColor = (score: number) => {
    if (score >= 90) return 'hsl(var(--foreground))';
    if (score >= 70) return 'hsl(var(--warning))';
    return 'hsl(var(--destructive))';
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-destructive/50 bg-destructive/5">
        <div className="text-destructive">Error: {error}</div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">No hay datos disponibles</div>
      </Card>
    );
  }

  // Preparar datos para el gráfico
  const chartData = data.map(d => ({
    time: formatTimestamp(d.timestamp),
    score: d.healthScore,
    status: d.healthStatus,
    // Para tooltip
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
  }));

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Health Score - Últimas {hours}h</h3>
          <p className="text-sm text-muted-foreground">{instanceName}</p>
        </div>

        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                      <p className="text-sm font-semibold text-foreground">{data.fullTimestamp}</p>
                      <p className="text-sm text-foreground">
                        Score: <span className="font-bold" style={{ color: getStatusColor(data.score) }}>
                          {data.score}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">Estado: {data.status}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="score" 
              stroke="hsl(var(--foreground))" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2 }}
              name="Health Score"
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Leyenda de thresholds */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-foreground"></div>
            <span>Healthy (≥90)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-warning"></div>
            <span>Warning (70-89)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-0.5 bg-destructive"></div>
            <span>Critical (&lt;70)</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

