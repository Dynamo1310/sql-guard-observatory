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
  role: string;
}

export interface UpdateUserRequest {
  displayName: string;
  role: string;
  active: boolean;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ActiveDirectoryUserDto {
  samAccountName: string;
  displayName: string;
  email: string;
  distinguishedName: string;
}

export interface GetGroupMembersResponse {
  groupName: string;
  count: number;
  members: ActiveDirectoryUserDto[];
}

export interface ImportUsersFromGroupRequest {
  groupName: string;
  selectedUsernames: string[];
  defaultRole: string;
}

export interface ImportUsersFromGroupResponse {
  message: string;
  imported: number;
  skipped: number;
  errors: string[];
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

  async windowsLogin(): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/api/auth/windows-login`, {
      method: 'GET',
      credentials: 'include', // Importante: enviar credenciales de Windows
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

  async changePassword(request: ChangePasswordRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<void>(response);
  },

  async refreshSession(): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/api/auth/refresh-session`, {
      method: 'POST',
      headers: {
        ...getAuthHeader(),
      },
    });
    
    // Si el servidor responde 401, es porque el token no es válido
    // En ese caso, no es un error fatal, simplemente no refrescamos
    if (response.status === 401) {
      throw new Error('Token no válido para refresh');
    }
    
    const data = await handleResponse<LoginResponse>(response);
    
    // Actualizar token en localStorage
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

  async getAdGroupMembers(groupName: string): Promise<GetGroupMembersResponse> {
    const response = await fetch(`${API_URL}/api/auth/ad-group-members?groupName=${encodeURIComponent(groupName)}`, {
      method: 'GET',
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<GetGroupMembersResponse>(response);
  },

  async importFromAdGroup(request: ImportUsersFromGroupRequest): Promise<ImportUsersFromGroupResponse> {
    const response = await fetch(`${API_URL}/api/auth/import-from-ad-group`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<ImportUsersFromGroupResponse>(response);
  },
};

// ==================== JOBS API ====================

export interface JobDto {
  id: number; // long en backend, pero number en TypeScript
  instanceName: string;
  ambiente: string;
  hosting: string;
  jobName: string;
  jobEnabled: string;
  jobStart: string | null;
  jobEnd: string | null;
  jobDurationSeconds: number;
  executionStatus: string;
  captureDate: string;
  insertedAtUtc: string;
}

export interface JobSummaryDto {
  totalJobs: number;
  jobsSucceeded: number;
  jobsFailed: number;
  jobsStopped: number;
  avgDurationMinutes: number;
}

export interface JobFiltersDto {
  ambientes: string[];
  hostings: string[];
  instances: string[];
}

export const jobsApi = {
  async getJobs(ambiente?: string, hosting?: string, instance?: string): Promise<JobDto[]> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    if (instance && instance !== 'All') params.append('instance', instance);
    
    const url = `${API_URL}/api/jobs${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobDto[]>(response);
  },

  async getJobsSummary(ambiente?: string, hosting?: string, instance?: string): Promise<JobSummaryDto> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    if (instance && instance !== 'All') params.append('instance', instance);
    
    const url = `${API_URL}/api/jobs/summary${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobSummaryDto>(response);
  },

  async getFilters(): Promise<JobFiltersDto> {
    const response = await fetch(`${API_URL}/api/jobs/filters`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<JobFiltersDto>(response);
  },
};

// ==================== PERMISSIONS API ====================

export interface RolePermissionDto {
  role: string;
  permissions: Record<string, boolean>;
}

export interface AvailableViewsDto {
  views: ViewInfo[];
  roles: string[];
}

export interface ViewInfo {
  viewName: string;
  displayName: string;
  description: string;
}

export const permissionsApi = {
  async getAllPermissions(): Promise<RolePermissionDto[]> {
    const response = await fetch(`${API_URL}/api/permissions`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<RolePermissionDto[]>(response);
  },

  async getRolePermissions(role: string): Promise<RolePermissionDto> {
    const response = await fetch(`${API_URL}/api/permissions/${role}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<RolePermissionDto>(response);
  },

  async updateRolePermissions(role: string, permissions: Record<string, boolean>): Promise<void> {
    const response = await fetch(`${API_URL}/api/permissions/${role}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ role, permissions }),
    });
    return handleResponse<void>(response);
  },

  async getAvailableViews(): Promise<AvailableViewsDto> {
    const response = await fetch(`${API_URL}/api/permissions/available`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<AvailableViewsDto>(response);
  },

  async getMyPermissions(): Promise<{ permissions: string[] }> {
    const response = await fetch(`${API_URL}/api/permissions/my-permissions`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<{ permissions: string[] }>(response);
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

