import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Loader2, Activity } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface MemoryDataPoint {
  timestamp: string;
  memoryUsedPct: number;
  bufferCacheHitRatio: number;
  pageLifeExpectancy: number;
  memoryGrantsPending: number;
}

interface Props {
  instanceName: string;
  hours?: number;
}

export function MemoryTrendChart({ instanceName, hours = 24 }: Props) {
  const [data, setData] = useState<MemoryDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = getApiUrl();

  useEffect(() => {
    fetchTrendData();
  }, [instanceName, hours]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/memory/${instanceName}?hours=${hours}`, {
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
      console.error('Error fetching memory trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getMemoryColor = (pct: number) => {
    if (pct >= 95) return '#ef4444'; // red
    if (pct >= 85) return '#eab308'; // yellow
    return '#22c55e'; // green
  };

  const getPLEColor = (ple: number) => {
    if (ple < 300) return '#ef4444'; // red
    if (ple < 600) return '#eab308'; // yellow
    return '#22c55e'; // green
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <div className="text-red-700">Error: {error}</div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">No hay datos disponibles</div>
      </Card>
    );
  }

  const chartData = data.map(d => ({
    time: formatTimestamp(d.timestamp),
    memoryUsed: Number(d.memoryUsedPct.toFixed(1)),
    bufferCache: Number(d.bufferCacheHitRatio.toFixed(1)),
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES'),
    ple: d.pageLifeExpectancy
  }));

  const latestMemory = data[data.length - 1]?.memoryUsedPct || 0;
  const latestPLE = data[data.length - 1]?.pageLifeExpectancy || 0;
  const latestBufferCache = data[data.length - 1]?.bufferCacheHitRatio || 0;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Memoria - Últimas {hours}h
            </h3>
            <p className="text-sm text-gray-500">{instanceName}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: getMemoryColor(latestMemory) }}>
              {latestMemory.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Memoria en uso</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
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
              label={{ value: '%', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3">
                      <p className="text-sm font-semibold">{data.fullTimestamp}</p>
                      <p className="text-sm">
                        Memoria Usada: <span className="font-bold text-blue-600">
                          {data.memoryUsed}%
                        </span>
                      </p>
                      <p className="text-sm">
                        Buffer Cache: <span className="font-bold text-green-600">
                          {data.bufferCache}%
                        </span>
                      </p>
                      <p className="text-sm">
                        PLE: <span className="font-bold" style={{ color: getPLEColor(data.ple) }}>
                          {data.ple}s
                        </span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <ReferenceLine y={85} stroke="#eab308" strokeDasharray="3 3" label="Advertencia" />
            <ReferenceLine y={95} stroke="#ef4444" strokeDasharray="3 3" label="Crítico" />
            <Line 
              type="monotone" 
              dataKey="memoryUsed" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Memoria Usada"
            />
            <Line 
              type="monotone" 
              dataKey="bufferCache" 
              stroke="#22c55e" 
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Buffer Cache Hit"
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Estadísticas adicionales */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-blue-50 p-2 rounded">
            <div className="text-gray-600">Memoria Usada</div>
            <div className="font-bold text-blue-700">{latestMemory.toFixed(1)}%</div>
          </div>
          <div className="bg-green-50 p-2 rounded">
            <div className="text-gray-600">Buffer Cache</div>
            <div className="font-bold text-green-700">{latestBufferCache.toFixed(1)}%</div>
          </div>
          <div className="bg-purple-50 p-2 rounded">
            <div className="text-gray-600">PLE</div>
            <div className="font-bold text-purple-700" style={{ color: getPLEColor(latestPLE) }}>
              {latestPLE}s
            </div>
          </div>
        </div>

        {/* Alertas */}
        {(latestMemory >= 85 || latestPLE < 600) && (
          <div className={`p-3 rounded-lg ${
            latestMemory >= 95 || latestPLE < 300 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            <p className="text-sm font-semibold">
              {latestMemory >= 95 || latestPLE < 300 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs">
              {latestMemory >= 85 && `Memoria alta (${latestMemory.toFixed(1)}%). `}
              {latestPLE < 600 && `PLE bajo (${latestPLE}s). Posible presión de memoria.`}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

