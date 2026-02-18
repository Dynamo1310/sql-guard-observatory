/**
 * HTTP Client con timeout, reintentos y manejo de errores centralizado
 * Optimizado para soportar alta concurrencia (200-500 usuarios)
 */

const DEFAULT_TIMEOUT = 30000; // 30 segundos
const MAX_RETRIES = 3;
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]; // Códigos que ameritan reintento

interface FetchOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

/**
 * Ejecuta un fetch con timeout
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calcula el delay para el siguiente reintento (backoff exponencial)
 */
function getRetryDelay(attempt: number, baseDelay: number = 1000): number {
  // Backoff exponencial: 1s, 2s, 4s, 8s... máximo 30s
  const delay = Math.min(baseDelay * Math.pow(2, attempt), 30000);
  // Agregar jitter aleatorio (±25%) para evitar thundering herd
  const jitter = delay * 0.25 * (Math.random() - 0.5);
  return delay + jitter;
}

/**
 * Determina si un error debe reintentar
 */
function shouldRetry(response: Response | null, error: unknown): boolean {
  // Error de red o timeout
  if (!response) {
    if (error instanceof Error) {
      // AbortError = timeout
      if (error.name === 'AbortError') return true;
      // Error de red
      if (error.message.includes('fetch')) return true;
    }
    return true;
  }

  // Códigos de error que ameritan reintento
  return RETRY_STATUS_CODES.includes(response.status);
}

/**
 * Fetch con reintentos y timeout
 */
export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    retryDelay = 1000,
    ...fetchOptions
  } = options;

  let lastError: unknown;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, fetchOptions, timeout);

      // Si la respuesta es exitosa o no debe reintentar, retornarla
      if (response.ok || !shouldRetry(response, null)) {
        return response;
      }

      lastResponse = response;
      
      // Si es el último intento, retornar la respuesta aunque sea error
      if (attempt === retries) {
        return response;
      }

      // Esperar antes del siguiente reintento
      await new Promise(resolve => 
        setTimeout(resolve, getRetryDelay(attempt, retryDelay))
      );
      
      console.warn(`Retry attempt ${attempt + 1}/${retries} for ${url} (status: ${response.status})`);
      
    } catch (error) {
      lastError = error;

      // Si es el último intento, lanzar el error
      if (attempt === retries) {
        throw error;
      }

      // Si no debe reintentar, lanzar el error
      if (!shouldRetry(null, error)) {
        throw error;
      }

      // Esperar antes del siguiente reintento
      await new Promise(resolve => 
        setTimeout(resolve, getRetryDelay(attempt, retryDelay))
      );
      
      console.warn(`Retry attempt ${attempt + 1}/${retries} for ${url}`, error);
    }
  }

  // Si llegamos aquí, algo salió mal
  if (lastResponse) {
    return lastResponse;
  }
  
  throw lastError;
}

/**
 * Reporta eventos de analytics (api_error, slow_request) de forma fire-and-forget.
 * Importación dinámica para evitar dependencias circulares.
 */
function reportAnalyticsEvent(eventName: string, props: Record<string, unknown>, extra?: Record<string, unknown>) {
  import('./analyticsService').then(({ track }) => {
    track(eventName, props, extra);
  }).catch(() => {});
}

const SLOW_THRESHOLD_MS = 5000;

/**
 * GET request con reintentos
 */
export async function get<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const start = Date.now();
  const response = await fetchWithRetry(url, {
    ...options,
    method: 'GET',
  });
  const elapsed = Date.now() - start;
  
  const logicalEndpoint = new URL(url, window.location.origin).pathname;

  if (!response.ok) {
    const errorText = await response.text();
    reportAnalyticsEvent('api_error', {
      status: response.status,
      endpoint: logicalEndpoint,
    }, { route: logicalEndpoint, success: false });
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  if (elapsed > SLOW_THRESHOLD_MS) {
    reportAnalyticsEvent('slow_request', {
      endpoint: logicalEndpoint,
      durationMs: elapsed,
    }, { route: logicalEndpoint, durationMs: elapsed });
  }
  
  return response.json();
}

/**
 * POST request con reintentos
 */
export async function post<T>(
  url: string, 
  data: unknown, 
  options: FetchOptions = {}
): Promise<T> {
  const start = Date.now();
  const response = await fetchWithRetry(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(data),
  });
  const elapsed = Date.now() - start;
  
  const logicalEndpoint = new URL(url, window.location.origin).pathname;

  if (!response.ok) {
    const errorText = await response.text();
    if (!logicalEndpoint.includes('/api/analytics/')) {
      reportAnalyticsEvent('api_error', {
        status: response.status,
        endpoint: logicalEndpoint,
      }, { route: logicalEndpoint, success: false });
    }
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  if (elapsed > SLOW_THRESHOLD_MS && !logicalEndpoint.includes('/api/analytics/')) {
    reportAnalyticsEvent('slow_request', {
      endpoint: logicalEndpoint,
      durationMs: elapsed,
    }, { route: logicalEndpoint, durationMs: elapsed });
  }
  
  return response.json();
}

/**
 * PUT request con reintentos
 */
export async function put<T>(
  url: string, 
  data: unknown, 
  options: FetchOptions = {}
): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...options,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: JSON.stringify(data),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

/**
 * DELETE request con reintentos
 */
export async function del<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...options,
    method: 'DELETE',
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  return response.json();
}

/**
 * Crear un cliente HTTP preconfigurado con base URL y headers
 */
export function createHttpClient(baseUrl: string, defaultHeaders: HeadersInit = {}) {
  const getAuthHeaders = (): HeadersInit => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  return {
    get: <T>(path: string, options: FetchOptions = {}) =>
      get<T>(`${baseUrl}${path}`, {
        ...options,
        headers: { ...defaultHeaders, ...getAuthHeaders(), ...options.headers },
      }),
    
    post: <T>(path: string, data: unknown, options: FetchOptions = {}) =>
      post<T>(`${baseUrl}${path}`, data, {
        ...options,
        headers: { ...defaultHeaders, ...getAuthHeaders(), ...options.headers },
      }),
    
    put: <T>(path: string, data: unknown, options: FetchOptions = {}) =>
      put<T>(`${baseUrl}${path}`, data, {
        ...options,
        headers: { ...defaultHeaders, ...getAuthHeaders(), ...options.headers },
      }),
    
    delete: <T>(path: string, options: FetchOptions = {}) =>
      del<T>(`${baseUrl}${path}`, {
        ...options,
        headers: { ...defaultHeaders, ...getAuthHeaders(), ...options.headers },
      }),
    
    // Método raw para casos especiales
    fetch: (path: string, options: FetchOptions = {}) =>
      fetchWithRetry(`${baseUrl}${path}`, {
        ...options,
        headers: { ...defaultHeaders, ...getAuthHeaders(), ...options.headers },
      }),
  };
}

// Exportar cliente por defecto (se puede configurar con la URL de la API)
export const getApiUrl = () => {
  return import.meta.env.VITE_API_URL || 'http://asprbm-nov-01:5000';
};

export const apiClient = createHttpClient(getApiUrl());
