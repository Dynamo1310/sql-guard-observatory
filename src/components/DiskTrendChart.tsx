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
  refreshTrigger?: number;
}

export function DiskTrendChart({ instanceName, hours = 24, refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<DiskDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllVolumes, setShowAllVolumes] = useState(false);

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

  // Actualización silenciosa sin cambiar el estado de loading
  const fetchTrendDataSilently = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/HealthScoreTrends/disk/${instanceName}?hours=${hours}`, {
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

  const getAreaColor = (freePct: number) => {
    if (freePct >= 20) return 'hsl(var(--foreground))';
    if (freePct >= 10) return 'hsl(var(--warning))';
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

  // Colores para cada volumen - Paleta Azul
  const volumeColors = [
    '#1d4ed8',
    '#2563eb',
    '#3b82f6',
    '#60a5fa',
    '#93c5fd',
    '#bfdbfe',
    '#1e40af',
    '#1e3a8a'
  ];

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              Espacio en Disco - Últimas {hours}h
            </h3>
            <p className="text-sm text-muted-foreground">{instanceName}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold" style={{ color: getAreaColor(latestFreePct) }}>
              {latestFreePct.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">Espacio libre actual</div>
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
                    <div className="bg-card border border-border rounded-lg shadow-lg p-3 max-w-xs">
                      <p className="text-sm font-semibold mb-2 text-foreground">{data.fullTimestamp}</p>
                      <div className="space-y-1">
                        {Array.from(allVolumeKeys).map((key) => {
                          const value = data[key];
                          if (value !== undefined) {
                            return (
                              <p key={key} className="text-xs text-foreground">
                                <span className="font-medium">{key}: </span>
                                <span className={`font-bold ${
                                  value < 10 ? 'text-destructive' : 
                                  value < 20 ? 'text-warning' : 
                                  'text-foreground'
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
        {latestVolumes.length > 0 && (() => {
          const sortedVolumes = latestVolumes.sort((a, b) => a.FreePct - b.FreePct);
          const criticalVolumes = sortedVolumes.filter(v => v.FreePct < 10);
          const warningVolumes = sortedVolumes.filter(v => v.FreePct >= 10 && v.FreePct < 20);
          const okVolumes = sortedVolumes.filter(v => v.FreePct >= 20);
          
          const volumesToShow = showAllVolumes 
            ? sortedVolumes 
            : [...criticalVolumes, ...warningVolumes, ...okVolumes.slice(0, 5)];
          
          const hiddenCount = sortedVolumes.length - volumesToShow.length;
          
          return (
            <div className="space-y-2">
              {/* Grid de volúmenes */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                {volumesToShow.map((vol) => {
                  const isCritical = vol.FreePct < 10;
                  const isWarning = vol.FreePct >= 10 && vol.FreePct < 20;
                  
                  return (
                    <div 
                      key={vol.MountPoint} 
                      className={`p-2 rounded border ${
                        isCritical ? 'bg-destructive/5 border-destructive/20' :
                        isWarning ? 'bg-warning/5 border-warning/20' :
                        'bg-muted/50 border-border/50'
                      }`}
                    >
                      <div className="font-semibold text-muted-foreground truncate text-[10px]" title={vol.MountPoint}>{vol.MountPoint}</div>
                      <div className={`font-bold text-sm ${
                        isCritical ? 'text-destructive' :
                        isWarning ? 'text-warning' :
                        'text-foreground'
                      }`}>
                        {vol.FreePct.toFixed(1)}%
                      </div>
                      <div className="text-muted-foreground text-[10px]">{vol.FreeGB.toFixed(0)}GB</div>
                    </div>
                  );
                })}
              </div>
              
              {/* Botón para mostrar/ocultar todos */}
              {hiddenCount > 0 && (
                <button
                  onClick={() => setShowAllVolumes(!showAllVolumes)}
                  className="w-full py-2 px-4 text-sm text-foreground hover:bg-muted/50 rounded border border-border transition-colors"
                >
                  {showAllVolumes ? (
                    <>Ocultar {hiddenCount} volúmenes OK</>
                  ) : (
                    <>Mostrar {hiddenCount} volúmenes más ({okVolumes.length} OK en total)</>
                  )}
                </button>
              )}
            </div>
          );
        })()}

        {/* Alertas */}
        {latestFreePct < 20 && (
          <div className={`p-3 rounded-lg border ${latestFreePct < 10 ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-warning/5 border-warning/20 text-warning'}`}>
            <p className="text-sm font-semibold">
              {latestFreePct < 10 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs opacity-80">
              El disco más lleno tiene {latestFreePct.toFixed(1)}% libre. Considerar limpieza o expansión.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

