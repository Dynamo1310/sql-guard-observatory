import { getApiUrl, getAuthHeader } from './api';

const API_URL = getApiUrl();

// Tipos
export interface CollectorConfig {
  name: string;
  displayName: string;
  description: string | null;
  isEnabled: boolean;
  intervalSeconds: number;
  timeoutSeconds: number;
  weight: number;
  parallelDegree: number;
  category: string;
  executionOrder: number;
  lastExecution: string | null;
  lastExecutionDurationMs: number | null;
  lastInstancesProcessed: number | null;
  lastError: string | null;
  lastErrorUtc: string | null;
}

export interface CollectorThreshold {
  id: number;
  collectorName: string;
  thresholdName: string;
  displayName: string;
  thresholdValue: number;
  thresholdOperator: string;
  resultingScore: number;
  actionType: string;
  description: string | null;
  defaultValue: number;
  evaluationOrder: number;
  thresholdGroup: string | null;
  isActive: boolean;
}

export interface UpdateCollectorConfig {
  isEnabled?: boolean;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  weight?: number;
  parallelDegree?: number;
}

export interface UpdateThreshold {
  thresholdName?: string;
  thresholdValue?: number;
  thresholdOperator?: string;
  resultingScore?: number;
  isActive?: boolean;
}

export interface CollectorExecutionLog {
  id: number;
  collectorName: string;
  startedAtUtc: string;
  completedAtUtc: string | null;
  durationMs: number | null;
  status: string;
  totalInstances: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  errorMessage: string | null;
  triggerType: string;
  triggeredBy: string | null;
}

export interface CollectorStatus {
  name: string;
  displayName: string;
  isEnabled: boolean;
  status: 'Running' | 'Idle' | 'Error';
  lastExecution: string | null;
  lastDurationMs: number | null;
  lastInstancesProcessed: number | null;
  lastError: string | null;
}

export interface CollectorsSummary {
  totalCollectors: number;
  enabledCollectors: number;
  runningCollectors: number;
  lastGlobalExecution: string | null;
  collectors: CollectorStatus[];
}

export interface ExecuteCollectorResult {
  started: boolean;
  message: string;
  executionLogId: number | null;
}

// Helper para manejar respuestas
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
    }
    const error = await response.json().catch(() => ({
      message: 'Error en la comunicación con el servidor'
    }));
    throw new Error(error.message);
  }
  return response.json();
}

// API de Collectors
export const collectorApi = {
  // Obtener todos los collectors
  async getAll(): Promise<CollectorConfig[]> {
    const response = await fetch(`${API_URL}/api/collectors`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CollectorConfig[]>(response);
  },

  // Obtener un collector específico
  async getOne(name: string): Promise<CollectorConfig> {
    const response = await fetch(`${API_URL}/api/collectors/${name}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CollectorConfig>(response);
  },

  // Actualizar configuración de un collector
  async update(name: string, config: UpdateCollectorConfig): Promise<void> {
    const response = await fetch(`${API_URL}/api/collectors/${name}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al actualizar collector' }));
      throw new Error(error.message);
    }
  },

  // Obtener umbrales de un collector
  async getThresholds(name: string): Promise<CollectorThreshold[]> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/thresholds`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CollectorThreshold[]>(response);
  },

  // Actualizar un umbral específico
  async updateThreshold(name: string, thresholdId: number, update: UpdateThreshold): Promise<void> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/thresholds/${thresholdId}`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(update),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al actualizar umbral' }));
      throw new Error(error.message);
    }
  },

  // Actualizar múltiples umbrales
  async updateThresholds(name: string, thresholds: UpdateThreshold[]): Promise<{ updated: number }> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/thresholds`, {
      method: 'PUT',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ thresholds }),
    });
    return handleResponse<{ updated: number }>(response);
  },

  // Resetear umbrales a valores por defecto
  async resetThresholds(name: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/thresholds/reset`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al restablecer umbrales' }));
      throw new Error(error.message);
    }
  },

  // Ejecutar un collector manualmente
  async execute(name: string): Promise<ExecuteCollectorResult> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/execute`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    return handleResponse<ExecuteCollectorResult>(response);
  },

  // Obtener logs de ejecución
  async getLogs(name: string, count = 10): Promise<CollectorExecutionLog[]> {
    const response = await fetch(`${API_URL}/api/collectors/${name}/logs?count=${count}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CollectorExecutionLog[]>(response);
  },

  // Obtener resumen de estado de collectors
  async getSummary(): Promise<CollectorsSummary> {
    const response = await fetch(`${API_URL}/api/collectors/summary`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<CollectorsSummary>(response);
  },
};
