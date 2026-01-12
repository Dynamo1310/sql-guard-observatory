import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2, Cpu } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface CpuDataPoint {
  timestamp: string;
  cpuTotal: number;
  sqlServerCpu: number;
  otherProcessesCpu: number;
}

interface Props {
  instanceName: string;
  hours?: number;
  refreshTrigger?: number;
}

export function CpuTrendChart({ instanceName, hours = 24, refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<CpuDataPoint[]>([]);
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
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/cpu/${instanceName}?hours=${hours}`, {
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
      console.error('Error fetching CPU trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Actualización silenciosa sin cambiar el estado de loading
  const fetchTrendDataSilently = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/cpu/${instanceName}?hours=${hours}`, {
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
      console.debug('Error en actualización silenciosa:', err);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getCpuColor = (cpu: number) => {
    if (cpu >= 90) return 'hsl(var(--destructive))';
    if (cpu >= 70) return 'hsl(var(--warning))';
    return 'hsl(var(--foreground))';
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

  const chartData = data.map(d => ({
    time: formatTimestamp(d.timestamp),
    'SQL Server': Number(d.sqlServerCpu.toFixed(1)),
    'Otros Procesos': Number(d.otherProcessesCpu.toFixed(1)),
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
  }));

  const latestCpu = data[data.length - 1]?.cpuTotal || 0;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              Uso de CPU - Últimas {hours}h
            </h3>
            <p className="text-sm text-muted-foreground">{instanceName}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: getCpuColor(latestCpu) }}>
              {latestCpu.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">CPU Total actual</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorSqlServer" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorOthers" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#93c5fd" stopOpacity={0.1}/>
              </linearGradient>
            </defs>
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
              label={{ value: '% CPU', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  const sqlServer = payload[0].value || 0;
                  const others = payload[1]?.value || 0;
                  const total = Number(sqlServer) + Number(others);
                  
                  return (
                    <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                      <p className="text-sm font-semibold text-foreground">{data.fullTimestamp}</p>
                      <p className="text-sm text-foreground">
                        CPU Total: <span className="font-bold" style={{ color: getCpuColor(total) }}>
                          {total.toFixed(1)}%
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground">SQL Server: {sqlServer}%</p>
                      <p className="text-sm text-muted-foreground">Otros Procesos: {others}%</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <Area 
              type="monotone" 
              dataKey="SQL Server" 
              stackId="1"
              stroke="#2563eb" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorSqlServer)"
              dot={false}
            />
            <Area 
              type="monotone" 
              dataKey="Otros Procesos" 
              stackId="1"
              stroke="#93c5fd" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorOthers)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Alertas */}
        {latestCpu >= 70 && (
          <div className={`p-3 rounded-lg border ${latestCpu >= 90 ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-warning/5 border-warning/20 text-warning'}`}>
            <p className="text-sm font-semibold">
              {latestCpu >= 90 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs opacity-80">
              Uso de CPU elevado ({latestCpu.toFixed(1)}%). Revisar procesos y queries costosas.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

