// API Service para conectar con el backend .NET
// Detectar automáticamente si estamos en localhost o en el servidor
const getApiUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Si no, detectar automáticamente basado en el hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  } else {
    // Si se accede por el nombre del servidor, usar el mismo servidor para el API
    return `http://${hostname}:5000`;
  }
};

const API_URL = getApiUrl();

interface ApiError {
  message: string;
}

// Helper para manejar errores de la API
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error: ApiError = await response.json().catch(() => ({
      message: 'Error en la comunicación con el servidor'
    }));
    throw new Error(error.message);
  }
  return response.json();
}

// Helper para obtener el token del localStorage
function getAuthHeader(): HeadersInit {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ==================== AUTH API ====================

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  domainUser: string;
  displayName: string;
  allowed: boolean;
  roles: string[];
}

export interface UserDto {
  id: string;
  domainUser: string;
  displayName: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface CreateUserRequest {
  domainUser: string;
  displayName: string;
  password: string;
  role: string;
}

export interface UpdateUserRequest {
  displayName: string;
  role: string;
  active: boolean;
}

export const authApi = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(credentials),
    });
    const data = await handleResponse<LoginResponse>(response);
    
    // Guardar token en localStorage
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({
        domainUser: data.domainUser,
        displayName: data.displayName,
        roles: data.roles,
      }));
    }
    
    return data;
  },

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  async getUsers(): Promise<UserDto[]> {
    const response = await fetch(`${API_URL}/api/auth/users`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<UserDto[]>(response);
  },

  async getUserById(userId: string): Promise<UserDto> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<UserDto>(response);
  },

  async createUser(user: CreateUserRequest): Promise<UserDto> {
    const response = await fetch(`${API_URL}/api/auth/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(user),
    });
    return handleResponse<UserDto>(response);
  },

  async updateUser(userId: string, user: UpdateUserRequest): Promise<UserDto> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(user),
    });
    return handleResponse<UserDto>(response);
  },

  async deleteUser(userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });
    
    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        message: 'Error al eliminar usuario'
      }));
      throw new Error(error.message);
    }
  },
};

// ==================== JOBS API ====================

export interface JobDto {
  server: string;
  job: string;
  lastStart: string;
  lastEnd: string;
  durationSec: number;
  state: 'Succeeded' | 'Failed' | 'Running' | 'Canceled';
  message: string;
}

export interface JobSummaryDto {
  okPct: number;
  fails24h: number;
  avgDurationSec: number;
  p95Sec: number;
  lastCapture: string;
}

export const jobsApi = {
  async getJobs(ambiente?: string, hosting?: string): Promise<JobDto[]> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    
    const url = `${API_URL}/api/jobs${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobDto[]>(response);
  },

  async getJobsSummary(): Promise<JobSummaryDto> {
    const response = await fetch(`${API_URL}/api/jobs/summary`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobSummaryDto>(response);
  },

  async getFailedJobs(limit: number = 5): Promise<JobDto[]> {
    const response = await fetch(`${API_URL}/api/jobs/failed?limit=${limit}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobDto[]>(response);
  },
};

// ==================== HELPER FUNCTIONS ====================

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('token');
}

export function getCurrentUser() {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

export function hasRole(role: string): boolean {
  const user = getCurrentUser();
  return user?.roles?.includes(role) || false;
}

export function isAdmin(): boolean {
  return hasRole('Admin');
}

