// API Service para conectar con el backend .NET
// Detectar automáticamente si estamos en localhost o en el servidor
export const getApiUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Si no, detectar automáticamente basado en el hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  } else {
    // Backend en producción: asprbm-nov-01 puerto 5000
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
    // Si es 401 (Unauthorized), el token expiró o es inválido
    if (response.status === 401) {
      // Limpiar sesión
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Redirigir al login
      window.location.href = '/login';
      
      throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
    }
    
    const error: ApiError = await response.json().catch(() => ({
      message: 'Error en la comunicación con el servidor'
    }));
    throw new Error(error.message);
  }
  return response.json();
}

// Helper para obtener el token del localStorage
export function getAuthHeader(): HeadersInit {
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

// ==================== DISKS API ====================

export interface DiskDto {
  id: number;
  instanceName: string;
  ambiente?: string;
  hosting?: string;
  servidor: string;
  drive: string;
  totalGB?: number;
  libreGB?: number;
  porcentajeLibre?: number;
  estado?: string;
  captureDate: string;
}

export interface DiskSummaryDto {
  discosCriticos: number;
  discosAdvertencia: number;
  discosSaludables: number;
  totalDiscos: number;
  ultimaCaptura?: string;
}

export interface DiskFiltersDto {
  ambientes: string[];
  hostings: string[];
  instancias: string[];
  estados: string[];
}

export const disksApi = {
  async getDisks(ambiente?: string, hosting?: string, instance?: string, estado?: string): Promise<DiskDto[]> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    if (instance && instance !== 'All') params.append('instance', instance);
    if (estado && estado !== 'All') params.append('estado', estado);
    
    const url = `${API_URL}/api/disks${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<DiskDto[]>(response);
  },

  async getDisksSummary(ambiente?: string, hosting?: string, instance?: string, estado?: string): Promise<DiskSummaryDto> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    if (instance && instance !== 'All') params.append('instance', instance);
    if (estado && estado !== 'All') params.append('estado', estado);
    
    const url = `${API_URL}/api/disks/summary${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<DiskSummaryDto>(response);
  },

  async getFilters(): Promise<DiskFiltersDto> {
    const response = await fetch(`${API_URL}/api/disks/filters`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<DiskFiltersDto>(response);
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

// ==================== HEALTHSCORE API ====================

export interface HealthScoreDto {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  version?: string;
  connectSuccess: boolean;
  connectLatencyMs?: number;
  healthScore: number;
  healthStatus: 'Healthy' | 'Warning' | 'Critical';
  generatedAtUtc: string;
  // Detalles completos de JSON
  backupSummary?: {
    lastFullBackup?: string;
    lastDiffBackup?: string;
    lastLogBackup?: string;
    breaches?: string[];
  };
  maintenanceSummary?: {
    checkdbOk?: boolean;
    indexOptimizeOk?: boolean;
    lastCheckdb?: string;
    lastIndexOptimize?: string;
  };
  diskSummary?: {
    worstFreePct?: number;
    volumes?: Array<{
      drive?: string;
      totalGB?: number;
      freeGB?: number;
      freePct?: number;
    }>;
  };
  resourceSummary?: {
    cpuHighFlag?: boolean;
    memoryPressureFlag?: boolean;
    rawCounters?: Record<string, number>;
  };
  alwaysOnSummary?: {
    enabled?: boolean;
    worstState?: string;
    issues?: string[];
  };
  errorlogSummary?: {
    severity20PlusCount24h?: number;
    skipped?: boolean;
  };
}

export interface HealthScoreSummaryDto {
  totalInstances: number;
  healthyCount: number;
  warningCount: number;
  criticalCount: number;
  avgScore: number;
  lastUpdate?: string;
}

export interface OverviewDataDto {
  healthSummary: HealthScoreSummaryDto;
  criticalDisksCount: number;
  backupsOverdueCount: number;
  maintenanceOverdueCount: number;
  failedJobsCount: number;
  criticalInstances: CriticalInstanceDto[];
  backupIssues: BackupIssueDto[];
}

export interface CriticalInstanceDto {
  instanceName: string;
  ambiente: string | null;
  healthScore: number;
  healthStatus: string;
  issues: string[];
}

export interface BackupIssueDto {
  instanceName: string;
  ambiente: string | null;
  breaches: string[];
  lastFullBackup: string | null;
  lastLogBackup: string | null;
}

export const healthScoreApi = {
  async getHealthScores(): Promise<HealthScoreDto[]> {
    const response = await fetch(`${API_URL}/api/healthscore`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreDto[]>(response);
  },

  async getHealthScoreSummary(): Promise<HealthScoreSummaryDto> {
    const response = await fetch(`${API_URL}/api/healthscore/summary`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreSummaryDto>(response);
  },

  async getOverviewData(): Promise<OverviewDataDto> {
    const response = await fetch(`${API_URL}/api/healthscore/overview`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<OverviewDataDto>(response);
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

