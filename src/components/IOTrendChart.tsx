import { useEffect, useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Loader2, HardDrive, Layers } from 'lucide-react';
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

// Colores azules para cada disco
const DISK_COLORS = [
  '#1d4ed8',
  '#2563eb',
  '#3b82f6',
  '#60a5fa',
  '#93c5fd',
  '#bfdbfe',
  '#1e40af',
  '#1e3a8a',
  '#3730a3',
  '#4f46e5',
];

// Obtener color por índice de disco
const getDiskColor = (index: number) => DISK_COLORS[index % DISK_COLORS.length];

// Modos de visualización
type ViewMode = 'all-disks' | 'single-disk' | 'average';

export function IOTrendChart({ instanceName, hours = 24, refreshTrigger = 0 }: Props) {
  const [data, setData] = useState<IODataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('all-disks'); // Por defecto: todos los discos
  const [selectedVolume, setSelectedVolume] = useState<string>('');
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
    const sortedVolumes = Array.from(volumesSet).sort();
    setAvailableVolumes(sortedVolumes);
    
    // Si no hay volumen seleccionado y hay discos disponibles, seleccionar el primero
    if (!selectedVolume && sortedVolumes.length > 0) {
      setSelectedVolume(sortedVolumes[0]);
    }
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
    if (latency >= 20) return 'hsl(var(--destructive))';
    if (latency >= 10) return 'hsl(var(--warning))';
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

  // Preparar datos del gráfico según el modo de visualización
  const chartData = useMemo(() => {
    return data.map(d => {
      const baseData: Record<string, any> = {
        time: formatTimestamp(d.timestamp),
        fullTimestamp: new Date(d.timestamp).toLocaleString('es-ES'),
        // Promedio general (para modo average)
        avgRead: Number(d.avgReadLatency.toFixed(2)),
        avgWrite: Number(d.avgWriteLatency.toFixed(2)),
        logWrite: Number(d.logFileAvgWrite.toFixed(2)),
        dataRead: Number(d.dataFileAvgRead.toFixed(2)),
      };
      
      // Si hay datos por volumen, extraerlos
      if (d.ioByVolumeJson) {
        try {
          const parsed = JSON.parse(d.ioByVolumeJson);
          const volumes: VolumeIO[] = Array.isArray(parsed) ? parsed : [parsed];
          
          volumes.forEach(vol => {
            const mountKey = vol.MountPoint.toUpperCase().replace(/[:\\]/g, '');
            // Latencia por disco
            baseData[`read_${mountKey}`] = Number(vol.AvgReadLatencyMs.toFixed(2));
            baseData[`write_${mountKey}`] = Number(vol.AvgWriteLatencyMs.toFixed(2));
            // IOPS por disco
            baseData[`readIOPS_${mountKey}`] = Number(vol.ReadIOPS.toFixed(1));
            baseData[`writeIOPS_${mountKey}`] = Number(vol.WriteIOPS.toFixed(1));
            baseData[`totalIOPS_${mountKey}`] = Number(vol.TotalIOPS.toFixed(1));
          });
        } catch (e) {
          console.error('Error parsing volume data:', e);
        }
      }
      
      return baseData;
    });
  }, [data]);
  
  // Obtener claves de volúmenes para las líneas del gráfico
  const volumeKeys = useMemo(() => {
    return availableVolumes.map(vol => vol.replace(/[:\\]/g, ''));
  }, [availableVolumes]);

  // Obtener valores más recientes por disco
  const latestVolumeData = useMemo(() => {
    const latestData = data[data.length - 1];
    const result: Record<string, { read: number; write: number }> = {};
    
    if (latestData?.ioByVolumeJson) {
      try {
        const parsed = JSON.parse(latestData.ioByVolumeJson);
        const volumes: VolumeIO[] = Array.isArray(parsed) ? parsed : [parsed];
        volumes.forEach(vol => {
          result[vol.MountPoint.toUpperCase()] = {
            read: vol.AvgReadLatencyMs,
            write: vol.AvgWriteLatencyMs
          };
        });
      } catch (e) {
        console.error('Error parsing latest volume data:', e);
      }
    }
    
    // Agregar promedio
    result['AVG'] = {
      read: latestData?.avgReadLatency || 0,
      write: latestData?.avgWriteLatency || 0
    };
    
    return result;
  }, [data]);
  
  // Obtener latencia más alta actual (para alertas)
  const maxLatency = useMemo(() => {
    let maxRead = 0;
    let maxWrite = 0;
    Object.values(latestVolumeData).forEach(v => {
      maxRead = Math.max(maxRead, v.read);
      maxWrite = Math.max(maxWrite, v.write);
    });
    return { read: maxRead, write: maxWrite };
  }, [latestVolumeData]);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-muted-foreground" />
              Latencia I/O - Últimas {hours}h
            </h3>
            <p className="text-sm text-muted-foreground">{instanceName}</p>
          </div>
          
          {/* Selector de modo de visualización */}
          {availableVolumes.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Modo de vista */}
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <select 
                  value={viewMode}
                  onChange={(e) => setViewMode(e.target.value as ViewMode)}
                  className="px-3 py-1.5 border border-border rounded-md text-sm bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="all-disks">📊 Todos los discos</option>
                  <option value="single-disk">💾 Disco individual</option>
                  <option value="average">📈 Promedio general</option>
                </select>
              </div>
              
              {/* Selector de disco (solo en modo single-disk) */}
              {viewMode === 'single-disk' && (
                <select 
                  value={selectedVolume}
                  onChange={(e) => setSelectedVolume(e.target.value)}
                  className="px-3 py-1.5 border border-border rounded-md text-sm bg-background hover:border-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {availableVolumes.map(volume => (
                    <option key={volume} value={volume}>
                      {volume}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
          
          {/* Latencia actual por disco */}
          <div className="text-right space-y-1">
            {viewMode === 'all-disks' && availableVolumes.slice(0, 3).map((vol, idx) => {
              const volData = latestVolumeData[vol];
              if (!volData) return null;
              return (
                <div key={vol} className="text-xs flex items-center gap-2 justify-end">
                  <span className="font-medium" style={{ color: getDiskColor(idx) }}>{vol}:</span>
                  <span style={{ color: getLatencyColor(volData.read) }}>R:{volData.read.toFixed(0)}ms</span>
                  <span style={{ color: getLatencyColor(volData.write) }}>W:{volData.write.toFixed(0)}ms</span>
                </div>
              );
            })}
            {viewMode === 'single-disk' && selectedVolume && latestVolumeData[selectedVolume] && (
              <div className="text-sm">
                <div><span className="text-xs text-muted-foreground">Read: </span>
                  <span className="font-bold" style={{ color: getLatencyColor(latestVolumeData[selectedVolume].read) }}>
                    {latestVolumeData[selectedVolume].read.toFixed(1)}ms
                  </span>
                </div>
                <div><span className="text-xs text-muted-foreground">Write: </span>
                  <span className="font-bold" style={{ color: getLatencyColor(latestVolumeData[selectedVolume].write) }}>
                    {latestVolumeData[selectedVolume].write.toFixed(1)}ms
                  </span>
                </div>
              </div>
            )}
            {viewMode === 'average' && (
              <div className="text-sm">
                <div><span className="text-xs text-muted-foreground">Avg Read: </span>
                  <span className="font-bold" style={{ color: getLatencyColor(latestVolumeData['AVG']?.read || 0) }}>
                    {(latestVolumeData['AVG']?.read || 0).toFixed(1)}ms
                  </span>
                </div>
                <div><span className="text-xs text-muted-foreground">Avg Write: </span>
                  <span className="font-bold" style={{ color: getLatencyColor(latestVolumeData['AVG']?.write || 0) }}>
                    {(latestVolumeData['AVG']?.write || 0).toFixed(1)}ms
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gráfico de Latencia */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-2">
            Latencia (ms) - {viewMode === 'all-disks' ? 'Por Disco' : viewMode === 'single-disk' ? `Disco ${selectedVolume}` : 'Promedio'}
          </h4>
          <ResponsiveContainer width="100%" height={viewMode === 'all-disks' ? 280 : 200}>
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
                    const dataPoint = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-lg shadow-lg p-3 max-w-xs">
                        <p className="text-sm font-semibold mb-2 text-foreground">{dataPoint.fullTimestamp}</p>
                        {viewMode === 'all-disks' && (
                          <div className="space-y-1">
                            {availableVolumes.map((vol, idx) => {
                              const key = vol.replace(/[:\\]/g, '');
                              const readVal = dataPoint[`read_${key}`];
                              const writeVal = dataPoint[`write_${key}`];
                              if (readVal === undefined) return null;
                              return (
                                <div key={vol} className="text-xs flex items-center gap-2 text-foreground">
                                  <span className="font-medium w-12" style={{ color: getDiskColor(idx) }}>{vol}:</span>
                                  <span style={{ color: getLatencyColor(readVal) }}>R:{readVal}ms</span>
                                  <span style={{ color: getLatencyColor(writeVal) }}>W:{writeVal}ms</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {viewMode === 'single-disk' && selectedVolume && (
                          <div className="space-y-1 text-foreground">
                            <p className="text-sm">
                              Read: <span className="font-bold">{dataPoint[`read_${selectedVolume.replace(/[:\\]/g, '')}`]}ms</span>
                            </p>
                            <p className="text-sm">
                              Write: <span className="font-bold">{dataPoint[`write_${selectedVolume.replace(/[:\\]/g, '')}`]}ms</span>
                            </p>
                          </div>
                        )}
                        {viewMode === 'average' && (
                          <div className="space-y-1 text-foreground">
                            <p className="text-sm">
                              Avg Read: <span className="font-bold">{dataPoint.avgRead}ms</span>
                            </p>
                            <p className="text-sm">
                              Avg Write: <span className="font-bold">{dataPoint.avgWrite}ms</span>
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Log Write: <span className="font-bold">{dataPoint.logWrite}ms</span>
                            </p>
                          </div>
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
              
              {/* Modo: Todos los discos - línea por disco */}
              {viewMode === 'all-disks' && volumeKeys.map((volKey, idx) => (
                <Line 
                  key={`read_${volKey}`}
                  type="monotone" 
                  dataKey={`read_${volKey}`}
                  stroke={getDiskColor(idx)}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name={`${availableVolumes[idx]} Read`}
                />
              ))}
              {viewMode === 'all-disks' && volumeKeys.map((volKey, idx) => (
                <Line 
                  key={`write_${volKey}`}
                  type="monotone" 
                  dataKey={`write_${volKey}`}
                  stroke={getDiskColor(idx)}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name={`${availableVolumes[idx]} Write`}
                />
              ))}
              
              {/* Modo: Disco individual */}
              {viewMode === 'single-disk' && selectedVolume && (
                <>
                  <Line 
                    type="monotone" 
                    dataKey={`read_${selectedVolume.replace(/[:\\]/g, '')}`}
                    stroke="hsl(var(--foreground))"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    name="Read"
                  />
                  <Line 
                    type="monotone" 
                    dataKey={`write_${selectedVolume.replace(/[:\\]/g, '')}`}
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    name="Write"
                  />
                </>
              )}
              
              {/* Modo: Promedio */}
              {viewMode === 'average' && (
                <>
                  <Line 
                    type="monotone" 
                    dataKey="avgRead"
                    stroke="hsl(var(--foreground))"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    name="Avg Read"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="avgWrite"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    name="Avg Write"
                  />
                  <Line 
                    type="monotone" 
                    dataKey="logWrite"
                    stroke="#93c5fd"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2 }}
                    name="Log Write"
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de IOPS (solo cuando hay un disco específico seleccionado) */}
        {viewMode === 'single-disk' && selectedVolume && (
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-2">IOPS - Disco {selectedVolume}</h4>
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
                      const dataPoint = payload[0].payload;
                      const volKey = selectedVolume.replace(/[:\\]/g, '');
                      return (
                        <div className="bg-card border border-border rounded-lg shadow-lg p-3">
                          <p className="text-sm font-semibold text-foreground">{dataPoint.fullTimestamp}</p>
                          <p className="text-sm text-foreground">
                            Read IOPS: <span className="font-bold">{dataPoint[`readIOPS_${volKey}`]}</span>
                          </p>
                          <p className="text-sm text-foreground">
                            Write IOPS: <span className="font-bold">{dataPoint[`writeIOPS_${volKey}`]}</span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Total IOPS: <span className="font-bold">{dataPoint[`totalIOPS_${volKey}`]}</span>
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
                  dataKey={`readIOPS_${selectedVolume.replace(/[:\\]/g, '')}`}
                  stroke="hsl(var(--foreground))" 
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name="Read IOPS"
                />
                <Line 
                  type="monotone" 
                  dataKey={`writeIOPS_${selectedVolume.replace(/[:\\]/g, '')}`}
                  stroke="#3b82f6" 
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2 }}
                  name="Write IOPS"
                />
                <Line 
                  type="monotone" 
                  dataKey={`totalIOPS_${selectedVolume.replace(/[:\\]/g, '')}`}
                  stroke="#93c5fd" 
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
        {(maxLatency.read >= 10 || maxLatency.write >= 10) && (
          <div className={`p-3 rounded-lg border ${
            maxLatency.read >= 20 || maxLatency.write >= 20 ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-warning/5 border-warning/20 text-warning'
          }`}>
            <p className="text-sm font-semibold">
              {maxLatency.read >= 20 || maxLatency.write >= 20 ? '⚠️ Alerta Crítica' : '⚠️ Advertencia'}
            </p>
            <p className="text-xs opacity-80">
              Latencia de I/O elevada. 
              {maxLatency.read >= 10 && ` Max Read: ${maxLatency.read.toFixed(1)}ms.`}
              {maxLatency.write >= 10 && ` Max Write: ${maxLatency.write.toFixed(1)}ms.`}
              {' '}Revisar subsistema de almacenamiento.
            </p>
          </div>
        )}

        {/* Información sobre thresholds */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>💡 <strong>Buena latencia:</strong> &lt;10ms (SSD) | &lt;20ms (HDD)</p>
          <p>⚠️ <strong>Log Write crítico:</strong> &gt;10ms puede afectar transacciones</p>
        </div>
      </div>
    </Card>
  );
}

