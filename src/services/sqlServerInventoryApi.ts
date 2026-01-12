/**
 * API Service para Inventario de SQL Server
 * Usa el proxy del backend con caché local
 * 
 * Este servicio es específico para SQL Server.
 * En el futuro se crearán servicios similares para Redis, PostgreSQL, etc.
 */

import { SqlServerInstance, SqlServerDatabase } from '@/types';
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
 * Parámetros de búsqueda para instancias
 */
export interface InstancesQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  ambiente?: string;
  version?: string;
  alwaysOn?: string;
}

/**
 * Parámetros de búsqueda para bases de datos
 */
export interface DatabasesQueryParams {
  page?: number;
  pageSize?: number;
  search?: string;
  server?: string;
  status?: string;
  recoveryModel?: string;
}

/**
 * Resumen de servidor para exportación
 */
export interface ServerSummary {
  serverName: string;
  ambiente: string;
  instanceId: number;
  databaseCount: number;
}

/**
 * Base de datos para exportación
 */
export interface DatabaseExport {
  dbName: string;
  status: string;
  dataMB: number;
  recoveryModel: string;
  compatibilityLevel: string;
  collation: string;
  creationDate: string | null;
  dataFiles: number;
  userAccess: string;
  readOnly: boolean;
  autoShrink: boolean;
  autoClose: boolean;
}

/**
 * Servidor con sus bases de datos para exportación
 */
export interface ServerDatabasesExport {
  serverName: string;
  ambiente: string;
  databases: DatabaseExport[];
}

/**
 * Respuesta de exportación
 */
export interface ExportDataResponse {
  servers: ServerDatabasesExport[];
  exportedAt: string;
  totalDatabases: number;
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
 * API de Inventario de SQL Server con caché y paginación
 */
export const sqlServerInventoryApi = {
  /**
   * Obtiene el listado de instancias SQL Server desde el caché con paginación
   */
  getInstances: async (params: InstancesQueryParams = {}): Promise<CachedDataResponse<SqlServerInstance>> => {
    const queryString = buildQueryString({
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      search: params.search,
      ambiente: params.ambiente,
      version: params.version,
      alwaysOn: params.alwaysOn,
    });
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/instances${queryString}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<SqlServerInstance>>(response);
  },

  /**
   * Actualiza el caché de instancias SQL Server desde la API externa
   */
  refreshInstances: async (): Promise<CachedDataResponse<SqlServerInstance>> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/instances/refresh`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<SqlServerInstance>>(response);
  },

  /**
   * Obtiene el listado de bases de datos SQL Server desde el caché con paginación
   */
  getDatabases: async (params: DatabasesQueryParams = {}): Promise<CachedDataResponse<SqlServerDatabase>> => {
    const queryString = buildQueryString({
      page: params.page || 1,
      pageSize: params.pageSize || 50,
      search: params.search,
      server: params.server,
      status: params.status,
      recoveryModel: params.recoveryModel,
    });
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/databases${queryString}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<SqlServerDatabase>>(response);
  },

  /**
   * Actualiza el caché de bases de datos SQL Server desde la API externa
   */
  refreshDatabases: async (): Promise<CachedDataResponse<SqlServerDatabase>> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/databases/refresh`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<CachedDataResponse<SqlServerDatabase>>(response);
  },

  /**
   * Obtiene la lista de servidores SQL Server únicos para filtros y exportación
   */
  getServers: async (): Promise<ServerSummary[]> => {
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/servers`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<ServerSummary[]>(response);
  },

  /**
   * Exporta las bases de datos de los servidores seleccionados
   */
  getDatabasesForExport: async (servers: string[]): Promise<ExportDataResponse> => {
    const serversParam = servers.join(',');
    const response = await fetch(`${getApiUrl()}/api/inventoryproxy/sqlserver/databases/export?servers=${encodeURIComponent(serversParam)}`, {
      headers: {
        ...getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return handleInventoryResponse<ExportDataResponse>(response);
  },
};

export default sqlServerInventoryApi;

