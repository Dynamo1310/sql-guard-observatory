/**
 * API Service para Inventario de PostgreSQL
 * Usa el proxy del backend con caché local
 */

import { PostgreSqlInstance, PostgreSqlDatabase } from '@/types';
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
 * Parámetros de búsqueda para instancias PostgreSQL
 */
export interface PgInstancesQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  ambiente?: string;
  version?: string;
}

/**
 * Parámetros de búsqueda para bases de datos PostgreSQL
 */
export interface PgDatabasesQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  server?: string;
  status?: string;
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
 * API de Inventario de PostgreSQL con caché y paginación
 */
export const postgresqlInventoryApi = {
  /**
   * Obtiene el listado de instancias PostgreSQL desde el caché con paginación
   */
  getInstances: async (params: PgInstancesQueryParams = {}): Promise<CachedDataResponse<PostgreSqlInstance>> => {
    const queryString = buildQueryString({
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      search: params.search,
      ambiente: params.ambiente,
      version: params.version,
    });
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/postgresql/instances${queryString}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<PostgreSqlInstance>>(response);
  },

  /**
   * Actualiza el caché de instancias PostgreSQL desde la API externa
   */
  refreshInstances: async (): Promise<CachedDataResponse<PostgreSqlInstance>> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/postgresql/instances/refresh`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<PostgreSqlInstance>>(response);
  },

  /**
   * Obtiene el listado de bases de datos PostgreSQL desde el caché con paginación
   */
  getDatabases: async (params: PgDatabasesQueryParams = {}): Promise<CachedDataResponse<PostgreSqlDatabase>> => {
    const queryString = buildQueryString({
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      search: params.search,
      server: params.server,
      status: params.status,
    });
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/postgresql/databases${queryString}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<PostgreSqlDatabase>>(response);
  },

  /**
   * Actualiza el caché de bases de datos PostgreSQL desde la API externa
   */
  refreshDatabases: async (): Promise<CachedDataResponse<PostgreSqlDatabase>> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/postgresql/databases/refresh`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<PostgreSqlDatabase>>(response);
  },
};

export default postgresqlInventoryApi;



