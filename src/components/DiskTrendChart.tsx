import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Loader2, HardDrive } from 'lucide-react';

interface DiskDataPoint {
  timestamp: string;
  freePct: number;
}

interface Props {
  instanceName: string;
  hours?: number;
}

export function DiskTrendChart({ instanceName, hours = 24 }: Props) {
  const [data, setData] = useState<DiskDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchTrendData();
  }, [instanceName, hours]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/disk/${instanceName}?hours=${hours}`);
      
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
      console.error('Error fetching disk trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getAreaColor = (freePct: number) => {
    if (freePct >= 20) return '#22c55e'; // green
    if (freePct >= 10) return '#eab308'; // yellow
    return '#ef4444'; // red
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
    freePct: d.freePct,
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
  }));

  const latestFreePct = data[data.length - 1]?.freePct || 100;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Espacio en Disco - Últimas {hours}h
            </h3>
            <p className="text-sm text-gray-500">{instanceName}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: getAreaColor(latestFreePct) }}>
              {latestFreePct.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500">Espacio libre actual</div>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="colorFreePct" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
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
              label={{ value: '% Libre', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3">
                      <p className="text-sm font-semibold">{data.fullTimestamp}</p>
                      <p className="text-sm">
                        Espacio libre: <span className="font-bold" style={{ color: getAreaColor(data.freePct) }}>
                          {data.freePct.toFixed(1)}%
                        </span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" label="Saludable" />
            <ReferenceLine y={10} stroke="#eab308" strokeDasharray="3 3" label="Crítico" />
            <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" label="Emergencia" />
            <Area 
              type="monotone" 
              dataKey="freePct" 
              stroke="#3b82f6" 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorFreePct)" 
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Alertas */}
        {latestFreePct < 20 && (
          <div className={`p-3 rounded-lg ${latestFreePct < 10 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
            <p className="text-sm font-semibold">
              {latestFreePct < 10 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs">
              Espacio en disco por debajo del {latestFreePct < 10 ? '10%' : '20%'}. Considerar limpieza o expansión.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

