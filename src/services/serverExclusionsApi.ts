import { getApiUrl, getAuthHeader } from './api';

const API_URL = getApiUrl();

// Tipos
export interface ServerAlertExclusion {
  id: number;
  serverName: string;
  reason: string | null;
  isActive: boolean;
  createdAtUtc: string;
  createdBy: string | null;
  expiresAtUtc: string | null;
}

export interface CreateServerAlertExclusion {
  serverName: string;
  reason?: string;
  expiresAtUtc?: string;
}

export interface ServerExclusionCheck {
  serverName: string;
  isExcluded: boolean;
}

// Helper para manejar respuesta
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
    }
    const error = await response.json().catch(() => ({ message: 'Error en la comunicación con el servidor' }));
    throw new Error(error.message || `Error ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

/**
 * API de Exclusiones Globales de Servidores para Alertas
 * Gestiona servidores dados de baja que no deben generar alertas
 */
export const serverExclusionsApi = {
  /**
   * Obtiene todas las exclusiones de servidores
   */
  getExclusions: async (): Promise<ServerAlertExclusion[]> => {
    const response = await fetch(`${API_URL}/api/server-exclusions`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<ServerAlertExclusion[]>(response);
  },

  /**
   * Agrega una nueva exclusión de servidor
   */
  addExclusion: async (data: CreateServerAlertExclusion): Promise<ServerAlertExclusion> => {
    const response = await fetch(`${API_URL}/api/server-exclusions`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    return handleResponse<ServerAlertExclusion>(response);
  },

  /**
   * Elimina una exclusión de servidor
   */
  removeExclusion: async (id: number): Promise<void> => {
    const response = await fetch(`${API_URL}/api/server-exclusions/${id}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al eliminar exclusión' }));
      throw new Error(error.message || `Error ${response.status}`);
    }
  },

  /**
   * Verifica si un servidor está excluido
   */
  checkServer: async (serverName: string): Promise<ServerExclusionCheck> => {
    const response = await fetch(`${API_URL}/api/server-exclusions/check/${encodeURIComponent(serverName)}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleResponse<ServerExclusionCheck>(response);
  },
};

export default serverExclusionsApi;
