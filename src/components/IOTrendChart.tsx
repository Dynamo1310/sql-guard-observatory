import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Loader2, HardDrive } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface IODataPoint {
  timestamp: string;
  avgReadLatency: number;
  avgWriteLatency: number;
  logFileAvgWrite: number;
  dataFileAvgRead: number;
}

interface Props {
  instanceName: string;
  hours?: number;
}

export function IOTrendChart({ instanceName, hours = 24 }: Props) {
  const [data, setData] = useState<IODataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = getApiUrl();

  useEffect(() => {
    fetchTrendData();
  }, [instanceName, hours]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/io/${instanceName}?hours=${hours}`, {
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
      console.error('Error fetching I/O trend data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const getLatencyColor = (latency: number) => {
    if (latency >= 20) return '#ef4444'; // red
    if (latency >= 10) return '#eab308'; // yellow
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
    read: Number(d.avgReadLatency.toFixed(2)),
    write: Number(d.avgWriteLatency.toFixed(2)),
    logWrite: Number(d.logFileAvgWrite.toFixed(2)),
    dataRead: Number(d.dataFileAvgRead.toFixed(2)),
    fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
  }));

  const latestRead = data[data.length - 1]?.avgReadLatency || 0;
  const latestWrite = data[data.length - 1]?.avgWriteLatency || 0;

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Latencia I/O - Últimas {hours}h
            </h3>
            <p className="text-sm text-gray-500">{instanceName}</p>
          </div>
          <div className="text-right">
            <div className="text-sm">
              <span className="text-xs text-gray-500">Read: </span>
              <span className="font-bold" style={{ color: getLatencyColor(latestRead) }}>
                {latestRead.toFixed(1)}ms
              </span>
            </div>
            <div className="text-sm">
              <span className="text-xs text-gray-500">Write: </span>
              <span className="font-bold" style={{ color: getLatencyColor(latestWrite) }}>
                {latestWrite.toFixed(1)}ms
              </span>
            </div>
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
              tick={{ fontSize: 12 }}
              label={{ value: 'ms', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3">
                      <p className="text-sm font-semibold">{data.fullTimestamp}</p>
                      <p className="text-sm">
                        Read Avg: <span className="font-bold text-blue-600">
                          {data.read}ms
                        </span>
                      </p>
                      <p className="text-sm">
                        Write Avg: <span className="font-bold text-green-600">
                          {data.write}ms
                        </span>
                      </p>
                      <p className="text-sm">
                        Log Write: <span className="font-bold text-orange-600">
                          {data.logWrite}ms
                        </span>
                      </p>
                      <p className="text-sm">
                        Data Read: <span className="font-bold text-purple-600">
                          {data.dataRead}ms
                        </span>
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend />
            <ReferenceLine y={10} stroke="#eab308" strokeDasharray="3 3" label="Advertencia" />
            <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" label="Crítico" />
            <Line 
              type="monotone" 
              dataKey="read" 
              stroke="#3b82f6" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Read Avg"
            />
            <Line 
              type="monotone" 
              dataKey="write" 
              stroke="#22c55e" 
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Write Avg"
            />
            <Line 
              type="monotone" 
              dataKey="logWrite" 
              stroke="#f97316" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Log Write"
              strokeDasharray="5 5"
            />
            <Line 
              type="monotone" 
              dataKey="dataRead" 
              stroke="#8b5cf6" 
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2 }}
              name="Data Read"
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>

        {/* Alertas */}
        {(latestRead >= 10 || latestWrite >= 10) && (
          <div className={`p-3 rounded-lg ${
            latestRead >= 20 || latestWrite >= 20 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            <p className="text-sm font-semibold">
              {latestRead >= 20 || latestWrite >= 20 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs">
              Latencia de I/O elevada. 
              {latestRead >= 10 && ` Read: ${latestRead.toFixed(1)}ms.`}
              {latestWrite >= 10 && ` Write: ${latestWrite.toFixed(1)}ms.`}
              {' '}Revisar subsistema de almacenamiento.
            </p>
          </div>
        )}

        {/* Información sobre thresholds */}
        <div className="text-xs text-gray-500 space-y-1">
          <p>💡 <strong>Buena latencia:</strong> &lt;10ms (SSD) | &lt;20ms (HDD)</p>
          <p>⚠️ <strong>Log Write crítico:</strong> &gt;10ms puede afectar transacciones</p>
        </div>
      </div>
    </Card>
  );
}

