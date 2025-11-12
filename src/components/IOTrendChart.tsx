import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Loader2, HardDrive } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface VolumeIO {
  MountPoint: string;
  AvgReadLatencyMs: number;
  AvgWriteLatencyMs: number;
  MaxReadLatencyMs: number;
  MaxWriteLatencyMs: number;
  ReadIOPS: number;
  WriteIOPS: number;
  TotalIOPS: number;
}

interface IODataPoint {
  timestamp: string;
  avgReadLatency: number;
  avgWriteLatency: number;
  logFileAvgWrite: number;
  dataFileAvgRead: number;
  ioByVolumeJson: string | null;
}

interface Props {
  instanceName: string;
  hours?: number;
  refreshTrigger?: number;
}

export function IOTrendChart({ instanceName, hours = 24, refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<IODataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVolume, setSelectedVolume] = useState<string>('ALL');
  const [availableVolumes, setAvailableVolumes] = useState<string[]>([]);

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
  
  useEffect(() => {
    // Extraer volúmenes únicos de los datos
    const volumesSet = new Set<string>();
    data.forEach(d => {
      if (d.ioByVolumeJson) {
        try {
          const parsed = JSON.parse(d.ioByVolumeJson);
          // Normalizar: si es objeto, convertir a array
          const volumes: VolumeIO[] = Array.isArray(parsed) ? parsed : [parsed];
          volumes.forEach(v => volumesSet.add(v.MountPoint.toUpperCase()));
        } catch (e) {
          console.error('Error parsing ioByVolumeJson:', e);
        }
      }
    });
    setAvailableVolumes(Array.from(volumesSet).sort());
  }, [data]);

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

  // Actualización silenciosa sin cambiar el estado de loading
  const fetchTrendDataSilently = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/io/${instanceName}?hours=${hours}`, {
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

  // Preparar datos del gráfico según el volumen seleccionado
  const chartData = data.map(d => {
    let readValue = d.avgReadLatency;
    let writeValue = d.avgWriteLatency;
    let readIOPS = 0;
    let writeIOPS = 0;
    let totalIOPS = 0;
    
    // Si hay un volumen específico seleccionado, usar sus métricas
    if (selectedVolume !== 'ALL' && d.ioByVolumeJson) {
      try {
        const parsed = JSON.parse(d.ioByVolumeJson);
        // Normalizar: si es objeto, convertir a array
        const volumes: VolumeIO[] = Array.isArray(parsed) ? parsed : [parsed];
        const volumeData = volumes.find(v => v.MountPoint.toUpperCase() === selectedVolume);
        if (volumeData) {
          readValue = volumeData.AvgReadLatencyMs;
          writeValue = volumeData.AvgWriteLatencyMs;
          readIOPS = volumeData.ReadIOPS;
          writeIOPS = volumeData.WriteIOPS;
          totalIOPS = volumeData.TotalIOPS;
        }
      } catch (e) {
        console.error('Error parsing volume data:', e);
      }
    }
    
    return {
      time: formatTimestamp(d.timestamp),
      read: Number(readValue.toFixed(2)),
      write: Number(writeValue.toFixed(2)),
      logWrite: Number(d.logFileAvgWrite.toFixed(2)),
      dataRead: Number(d.dataFileAvgRead.toFixed(2)),
      readIOPS: Number(readIOPS.toFixed(1)),
      writeIOPS: Number(writeIOPS.toFixed(1)),
      totalIOPS: Number(totalIOPS.toFixed(1)),
      fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
    };
  });

  // Obtener valores más recientes
  const latestData = data[data.length - 1];
  let latestRead = latestData?.avgReadLatency || 0;
  let latestWrite = latestData?.avgWriteLatency || 0;
  
  if (selectedVolume !== 'ALL' && latestData?.ioByVolumeJson) {
    try {
      const parsed = JSON.parse(latestData.ioByVolumeJson);
      // Normalizar: si es objeto, convertir a array
      const volumes: VolumeIO[] = Array.isArray(parsed) ? parsed : [parsed];
      const volumeData = volumes.find(v => v.MountPoint.toUpperCase() === selectedVolume);
      if (volumeData) {
        latestRead = volumeData.AvgReadLatencyMs;
        latestWrite = volumeData.AvgWriteLatencyMs;
      }
    } catch (e) {
      console.error('Error parsing latest volume data:', e);
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Latencia I/O {selectedVolume !== 'ALL' ? `- Disco ${selectedVolume}` : '(Promedio)'} - Últimas {hours}h
            </h3>
            <p className="text-sm text-gray-500">{instanceName}</p>
          </div>
          
          {/* Selector de disco */}
          {availableVolumes.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Disco:</label>
              <select 
                value={selectedVolume}
                onChange={(e) => setSelectedVolume(e.target.value)}
                className="px-3 py-1.5 border rounded-md text-sm bg-white hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ALL">Todos (Promedio)</option>
                {availableVolumes.map(volume => (
                  <option key={volume} value={volume}>
                    {volume}
                  </option>
                ))}
              </select>
            </div>
          )}
          
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

        {/* Gráfico de Latencia */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Latencia (ms)</h4>
          <ResponsiveContainer width="100%" height={200}>
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
                          Read: <span className="font-bold text-blue-600">{data.read}ms</span>
                        </p>
                        <p className="text-sm">
                          Write: <span className="font-bold text-green-600">{data.write}ms</span>
                        </p>
                        {selectedVolume === 'ALL' && (
                          <>
                            <p className="text-sm">
                              Log Write: <span className="font-bold text-orange-600">{data.logWrite}ms</span>
                            </p>
                            <p className="text-sm">
                              Data Read: <span className="font-bold text-purple-600">{data.dataRead}ms</span>
                            </p>
                          </>
                        )}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend />
              <ReferenceLine y={10} stroke="#eab308" strokeDasharray="3 3" label={{ value: "10ms", fontSize: 10 }} />
              <ReferenceLine y={20} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "20ms", fontSize: 10 }} />
              <Line 
                type="monotone" 
                dataKey="read" 
                stroke="#3b82f6" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                name="Read"
              />
              <Line 
                type="monotone" 
                dataKey="write" 
                stroke="#22c55e" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                name="Write"
              />
              {selectedVolume === 'ALL' && (
                <>
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
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de IOPS (solo cuando hay un disco específico seleccionado) */}
        {selectedVolume !== 'ALL' && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-2">IOPS (Operaciones/seg)</h4>
            <ResponsiveContainer width="100%" height={180}>
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
                  label={{ value: 'IOPS', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip 
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white border rounded-lg shadow-lg p-3">
                          <p className="text-sm font-semibold">{data.fullTimestamp}</p>
                          <p className="text-sm">
                            Read IOPS: <span className="font-bold text-blue-600">{data.readIOPS}</span>
                          </p>
                          <p className="text-sm">
                            Write IOPS: <span className="font-bold text-green-600">{data.writeIOPS}</span>
                          </p>
                          <p className="text-sm">
                            Total IOPS: <span className="font-bold text-purple-600">{data.totalIOPS}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="readIOPS" 
                  stroke="#3b82f6" 
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name="Read IOPS"
                />
                <Line 
                  type="monotone" 
                  dataKey="writeIOPS" 
                  stroke="#22c55e" 
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name="Write IOPS"
                />
                <Line 
                  type="monotone" 
                  dataKey="totalIOPS" 
                  stroke="#8b5cf6" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name="Total IOPS"
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

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

