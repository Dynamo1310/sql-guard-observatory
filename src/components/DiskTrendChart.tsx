import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts';
import { Loader2, HardDrive } from 'lucide-react';
import { getApiUrl, getAuthHeader } from '@/services/api';

interface DiskDataPoint {
  timestamp: string;
  worstFreePct: number;
  dataDiskAvgFreePct: number;
  logDiskAvgFreePct: number;
  tempDBDiskFreePct: number;
  volumesJson: string | null;
}

interface Props {
  instanceName: string;
  hours?: number;
}

export function DiskTrendChart({ instanceName, hours = 24 }: Props) {
  const [data, setData] = useState<DiskDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE_URL = getApiUrl();

  useEffect(() => {
    fetchTrendData();
  }, [instanceName, hours]);

  const fetchTrendData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/disk/${instanceName}?hours=${hours}`, {
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

  // Procesar los datos de volúmenes individuales
  const chartData = data.map(d => {
    const point: any = {
      time: formatTimestamp(d.timestamp),
      fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES')
    };

    // Parsear el JSON de volúmenes
    if (d.volumesJson) {
      try {
        const volumes = JSON.parse(d.volumesJson);
        volumes.forEach((vol: any) => {
          const key = `${vol.MountPoint} (${vol.VolumeName})`;
          point[key] = Number(vol.FreePct.toFixed(1));
        });
      } catch (e) {
        console.error('Error parsing volumes JSON:', e);
      }
    }

    return point;
  });

  // Extraer todos los volúmenes únicos para la leyenda
  const allVolumeKeys = new Set<string>();
  chartData.forEach(d => {
    Object.keys(d).forEach(key => {
      if (key !== 'time' && key !== 'fullTimestamp') {
        allVolumeKeys.add(key);
      }
    });
  });

  // Obtener datos del último punto
  const latestData = data[data.length - 1];
  const latestFreePct = latestData?.worstFreePct || 100;
  
  let latestVolumes: any[] = [];
  if (latestData?.volumesJson) {
    try {
      latestVolumes = JSON.parse(latestData.volumesJson);
    } catch (e) {
      console.error('Error parsing latest volumes:', e);
    }
  }

  // Colores para cada volumen
  const volumeColors = [
    '#ef4444', // red
    '#3b82f6', // blue
    '#22c55e', // green
    '#8b5cf6', // purple
    '#f97316', // orange
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16'  // lime
  ];

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
              label={{ value: '% Libre', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-white border rounded-lg shadow-lg p-3 max-w-xs">
                      <p className="text-sm font-semibold mb-2">{data.fullTimestamp}</p>
                      <div className="space-y-1">
                        {Array.from(allVolumeKeys).map((key) => {
                          const value = data[key];
                          if (value !== undefined) {
                            return (
                              <p key={key} className="text-xs">
                                <span className="font-medium">{key}: </span>
                                <span className={`font-bold ${
                                  value < 10 ? 'text-red-600' : 
                                  value < 20 ? 'text-yellow-600' : 
                                  'text-green-600'
                                }`}>
                                  {value}%
                                </span>
                              </p>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <ReferenceLine y={20} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "20%", fontSize: 10 }} />
            <ReferenceLine y={10} stroke="#eab308" strokeDasharray="3 3" label={{ value: "10%", fontSize: 10 }} />
            <ReferenceLine y={5} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "5%", fontSize: 10 }} />
            
            {/* Línea para cada volumen */}
            {Array.from(allVolumeKeys).map((volumeKey, index) => (
              <Line 
                key={volumeKey}
                type="monotone" 
                dataKey={volumeKey} 
                stroke={volumeColors[index % volumeColors.length]} 
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2 }}
                name={volumeKey}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Estadísticas por volumen individual */}
        {latestVolumes.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 text-xs">
            {latestVolumes
              .sort((a, b) => a.FreePct - b.FreePct) // Ordenar por espacio libre (menos a más)
              .map((vol) => {
                const isCritical = vol.FreePct < 10;
                const isWarning = vol.FreePct >= 10 && vol.FreePct < 20;
                const isOk = vol.FreePct >= 20;
                
                return (
                  <div 
                    key={vol.MountPoint} 
                    className={`p-2 rounded border ${
                      isCritical ? 'bg-red-50 border-red-200' :
                      isWarning ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="font-semibold text-gray-700">{vol.MountPoint}</div>
                    <div className="text-gray-600 truncate" title={vol.VolumeName}>{vol.VolumeName}</div>
                    <div className={`font-bold text-base ${
                      isCritical ? 'text-red-700' :
                      isWarning ? 'text-yellow-700' :
                      'text-blue-700'
                    }`}>
                      {vol.FreePct.toFixed(1)}%
                    </div>
                    <div className="text-gray-500">{vol.FreeGB.toFixed(0)} GB libre</div>
                  </div>
                );
              })}
          </div>
        )}

        {/* Alertas */}
        {latestFreePct < 20 && (
          <div className={`p-3 rounded-lg ${latestFreePct < 10 ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>
            <p className="text-sm font-semibold">
              {latestFreePct < 10 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs">
              El disco más lleno tiene {latestFreePct.toFixed(1)}% libre. Considerar limpieza o expansión.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

