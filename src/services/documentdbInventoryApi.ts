/**
 * API Service para Inventario de DocumentDB
 * Usa el proxy del backend con caché local
 */

import { DocumentDbInstance } from '@/types';
import { getApiUrl, getAuthHeader } from './api';

/**
 * Metadatos del caché
 */
export interface CacheMetadata {
  lastUpdatedAt: string | null;
  updatedByUserName: string | null;
  recordCount: number | null;
}

/**
 * Información de paginación
 */
export interface PaginationInfo {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

/**
 * Respuesta con datos cacheados y paginación
 */
export interface CachedDataResponse<T> {
  data: T[];
  cacheInfo: CacheMetadata;
  pagination: PaginationInfo;
}

/**
 * Parámetros de búsqueda para instancias DocumentDB
 */
export interface DocDbInstancesQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  ambiente?: string;
  version?: string;
  clusterMode?: string;
}

/**
 * Construye query string desde parámetros
 */
function buildQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== 'All') {
      searchParams.append(key, String(value));
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

/**
 * Maneja la respuesta de la API de inventario
 */
async function handleInventoryResponse<T>(response: Response): Promise<T> {
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
 * API de Inventario de DocumentDB con caché y paginación
 */
export const documentdbInventoryApi = {
  /**
   * Obtiene el listado de instancias DocumentDB desde el caché con paginación
   */
  getInstances: async (params: DocDbInstancesQueryParams = {}): Promise<CachedDataResponse<DocumentDbInstance>> => {
    const queryString = buildQueryString({
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      search: params.search,
      ambiente: params.ambiente,
      version: params.version,
      clusterMode: params.clusterMode,
    });
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/documentdb/instances${queryString}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<DocumentDbInstance>>(response);
  },

  /**
   * Actualiza el caché de instancias DocumentDB desde la API externa
   */
  refreshInstances: async (): Promise<CachedDataResponse<DocumentDbInstance>> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/documentdb/instances/refresh`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<DocumentDbInstance>>(response);
  },
};

export default documentdbInventoryApi;



