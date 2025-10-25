import api from './api';

const API_BASE = '/api/healthscore/v3';

export interface HealthScoreV3 {
  id: number;
  instanceName: string;
  ambiente: string;
  hostingSite: string;
  sqlVersion: string;
  collectedAtUtc: string;
  healthScore: number;
  healthStatus: string;
  backupsScore: number;
  alwaysOnScore: number;
  conectividadScore: number;
  erroresCriticosScore: number;
  cpuScore: number;
  ioScore: number;
  discosScore: number;
  memoriaScore: number;
  mantenimientosScore: number;
  configuracionTempdbScore: number;
  globalCap: number;
}

export interface ScoreSummary {
  ambiente: string;
  totalInstances: number;
  avgHealthScore: number;
  optimoCount: number;
  advertenciaCount: number;
  riesgoCount: number;
  criticoCount: number;
}

export interface ConectividadMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  connectSuccess: boolean;
  connectLatencyMs: number;
  authType: string;
  loginFailuresLast1h: number;
  errorMessage?: string;
}

export interface AlwaysOnMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  alwaysOnEnabled: boolean;
  alwaysOnWorstState: string;
  databaseCount: number;
  synchronizedCount: number;
  suspendedCount: number;
  avgSendQueueKB: number;
  maxSendQueueKB: number;
  avgRedoQueueKB: number;
  maxRedoQueueKB: number;
  maxSecondsBehind: number;
  alwaysOnDetails?: string;
}

export interface ErroresCriticosMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  severity20PlusCount: number;
  severity20PlusLast1h: number;
  mostRecentError?: string;
  errorDetails?: string;
}

export interface CPUMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  sqlProcessUtilization: number;
  systemIdleProcess: number;
  otherProcessUtilization: number;
  runnableTasks: number;
  pendingDiskIOCount: number;
  avgCPUPercentLast10Min: number;
  p95CPUPercent: number;
}

export interface IOMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  avgReadLatencyMs: number;
  avgWriteLatencyMs: number;
  maxReadLatencyMs: number;
  maxWriteLatencyMs: number;
  dataFileAvgReadMs: number;
  dataFileAvgWriteMs: number;
  logFileAvgWriteMs: number;
  totalIOPS: number;
  readIOPS: number;
  writeIOPS: number;
  ioDetails?: string;
}

export interface DiscosMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  worstFreePct: number;
  dataDiskAvgFreePct: number;
  logDiskAvgFreePct: number;
  tempDBDiskFreePct: number;
  volumesJson?: string;
}

export interface MemoriaMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  pageLifeExpectancy: number;
  bufferCacheHitRatio: number;
  totalServerMemoryMB: number;
  targetServerMemoryMB: number;
  maxServerMemoryMB: number;
  bufferPoolSizeMB: number;
  memoryGrantsPending: number;
  memoryGrantsActive: number;
  pleTarget: number;
  memoryPressure: boolean;
}

export interface ConfiguracionTempdbMetrics {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  tempDBFileCount: number;
  tempDBAllSameSize: boolean;
  tempDBAllSameGrowth: boolean;
  tempDBAvgLatencyMs: number;
  tempDBPageLatchWaits: number;
  tempDBContentionScore: number;
  maxServerMemoryMB: number;
  totalPhysicalMemoryMB: number;
  maxMemoryPctOfPhysical: number;
  maxMemoryWithinOptimal: boolean;
  cpuCount: number;
  configDetails?: string;
}

export interface CompleteView {
  instanceName: string;
  score: HealthScoreV3;
  conectividad?: ConectividadMetrics;
  alwaysOn?: AlwaysOnMetrics;
  erroresCriticos?: ErroresCriticosMetrics;
  cpu?: CPUMetrics;
  io?: IOMetrics;
  discos?: DiscosMetrics;
  memoria?: MemoriaMetrics;
  configuracionTempdb?: ConfiguracionTempdbMetrics;
}

const healthScoreV3Service = {
  // ==================== SCORE GENERAL ====================
  
  /**
   * Obtiene el último Health Score para todas las instancias
   */
  getLatestScores: async (): Promise<HealthScoreV3[]> => {
    const response = await api.get(`${API_BASE}/scores/latest`);
    return response.data;
  },

  /**
   * Obtiene el Health Score de una instancia específica
   */
  getScoreByInstance: async (instanceName: string): Promise<HealthScoreV3> => {
    const response = await api.get(`${API_BASE}/scores/${encodeURIComponent(instanceName)}`);
    return response.data;
  },

  /**
   * Obtiene el historial de Health Score de una instancia
   */
  getScoreHistory: async (
    instanceName: string,
    hours: number = 24
  ): Promise<HealthScoreV3[]> => {
    const response = await api.get(
      `${API_BASE}/scores/${encodeURIComponent(instanceName)}/history?hours=${hours}`
    );
    return response.data;
  },

  /**
   * Obtiene resumen agregado por ambiente
   */
  getSummary: async (): Promise<ScoreSummary[]> => {
    const response = await api.get(`${API_BASE}/scores/summary`);
    return response.data;
  },

  // ==================== CATEGORÍAS INDIVIDUALES ====================

  /**
   * Obtiene métricas de Conectividad
   */
  getConectividad: async (
    instanceName: string,
    limit: number = 10
  ): Promise<ConectividadMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/conectividad?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de AlwaysOn
   */
  getAlwaysOn: async (
    instanceName: string,
    limit: number = 10
  ): Promise<AlwaysOnMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/alwayson?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de Errores Críticos
   */
  getErroresCriticos: async (
    instanceName: string,
    limit: number = 10
  ): Promise<ErroresCriticosMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/errores?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de CPU
   */
  getCPU: async (
    instanceName: string,
    limit: number = 10
  ): Promise<CPUMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/cpu?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de IO
   */
  getIO: async (
    instanceName: string,
    limit: number = 10
  ): Promise<IOMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/io?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de Discos
   */
  getDiscos: async (
    instanceName: string,
    limit: number = 10
  ): Promise<DiscosMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/discos?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de Memoria
   */
  getMemoria: async (
    instanceName: string,
    limit: number = 10
  ): Promise<MemoriaMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/memoria?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene métricas de Configuración & TempDB
   */
  getConfiguracionTempdb: async (
    instanceName: string,
    limit: number = 10
  ): Promise<ConfiguracionTempdbMetrics[]> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/configuracion?limit=${limit}`
    );
    return response.data;
  },

  /**
   * Obtiene vista completa detallada (todas las categorías)
   */
  getCompleteView: async (instanceName: string): Promise<CompleteView> => {
    const response = await api.get(
      `${API_BASE}/${encodeURIComponent(instanceName)}/complete`
    );
    return response.data;
  },

  // ==================== UTILIDADES ====================

  /**
   * Obtiene el color del semáforo según el score
   */
  getHealthStatusColor: (score: number): string => {
    if (score >= 85) return 'green';    // 🟢 Óptimo
    if (score >= 75) return 'yellow';   // 🟡 Advertencia
    if (score >= 65) return 'orange';   // 🟠 Riesgo
    return 'red';                        // 🔴 Crítico
  },

  /**
   * Obtiene el emoji del semáforo según el score
   */
  getHealthStatusEmoji: (score: number): string => {
    if (score >= 85) return '🟢';
    if (score >= 75) return '🟡';
    if (score >= 65) return '🟠';
    return '🔴';
  },

  /**
   * Obtiene el label del estado según el score
   */
  getHealthStatusLabel: (score: number): string => {
    if (score >= 85) return 'Óptimo';
    if (score >= 75) return 'Advertencia';
    if (score >= 65) return 'Riesgo';
    return 'Crítico';
  },
};

export default healthScoreV3Service;

