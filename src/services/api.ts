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

// ==================== HEALTHSCORE V2 API ====================

export interface HealthScoreV2Dto {
  instance: string;
  healthRaw: number;
  capApplied: string | null;
  healthFinal: number;
  top3Penalizaciones: string;
  colorSemaforo: string;
  calculadoAt: string;
  statusText: string;
  statusColor: string;
}

export interface CategoryScoreDto {
  name: string;
  displayName: string;
  score: number;
  notes: string;
  weight: number;
  icon: string;
  statusColor: string;
}

export interface HealthTrendPointDto {
  timestamp: string;
  healthScore: number | null;
}

export interface HealthScoreDetailV2Dto {
  instance: string;
  healthFinal: number;
  healthRaw: number;
  capApplied: string | null;
  colorSemaforo: string;
  calculadoAt: string;
  categories: CategoryScoreDto[];
  trends24h: HealthTrendPointDto[];
  trends7d: HealthTrendPointDto[];
}

export interface HealthScoreSummaryV2Dto {
  totalInstances: number;
  healthyInstances: number;
  warningInstances: number;
  criticalInstances: number;
  emergencyInstances: number;
  averageHealth: number;
  instances: HealthScoreV2Dto[];
  recentAlerts: AlertaRecienteDto[];
}

export interface AlertaRecienteDto {
  alertaID: number;
  instance: string;
  estadoAnterior: string | null;
  estadoNuevo: string;
  healthScoreAnterior: number | null;
  healthScoreNuevo: number;
  causa: string | null;
  detectadoAt: string;
  timeSinceDetection: string;
}

export interface CollectorLogDto {
  collectorName: string;
  instance: string;
  level: string;
  message: string;
  loggedAt: string;
}

export const healthScoreV2Api = {
  /**
   * Obtiene el Health Score V2 de todas las instancias
   */
  async getAllHealthScores(): Promise<HealthScoreV2Dto[]> {
    const response = await fetch(`${API_URL}/api/v2/healthscore`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreV2Dto[]>(response);
  },

  /**
   * Obtiene el detalle completo de una instancia (categorías + tendencias)
   */
  async getHealthScoreDetail(instance: string): Promise<HealthScoreDetailV2Dto> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/${encodeURIComponent(instance)}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreDetailV2Dto>(response);
  },

  /**
   * Obtiene solo las categorías de una instancia
   */
  async getCategoryScores(instance: string): Promise<CategoryScoreDto[]> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/${encodeURIComponent(instance)}/categories`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<CategoryScoreDto[]>(response);
  },

  /**
   * Obtiene tendencias de las últimas 24 horas
   */
  async getTrends24h(instance: string): Promise<HealthTrendPointDto[]> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/${encodeURIComponent(instance)}/trends/24h`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthTrendPointDto[]>(response);
  },

  /**
   * Obtiene tendencias de los últimos 7 días
   */
  async getTrends7d(instance: string): Promise<HealthTrendPointDto[]> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/${encodeURIComponent(instance)}/trends/7d`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthTrendPointDto[]>(response);
  },

  /**
   * Obtiene resumen general para el dashboard
   */
  async getSummary(): Promise<HealthScoreSummaryV2Dto> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/summary`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreSummaryV2Dto>(response);
  },

  /**
   * Obtiene alertas recientes
   */
  async getAlerts(top: number = 10): Promise<AlertaRecienteDto[]> {
    const response = await fetch(`${API_URL}/api/v2/healthscore/alerts?top=${top}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<AlertaRecienteDto[]>(response);
  },

  /**
   * Obtiene logs de collectors
   */
  async getCollectorLogs(
    instance?: string,
    level?: string,
    top: number = 50
  ): Promise<CollectorLogDto[]> {
    const params = new URLSearchParams();
    if (instance) params.append('instance', instance);
    if (level) params.append('level', level);
    params.append('top', top.toString());

    const response = await fetch(`${API_URL}/api/v2/healthscore/collectors/logs?${params}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<CollectorLogDto[]>(response);
  },
};

// ==================== HEALTHSCORE V3 API ====================

export interface HealthScoreV3Dto {
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  sqlVersion?: string;
  healthScore: number;
  healthStatus: 'Healthy' | 'Warning' | 'Risk' | 'Critical';
  generatedAtUtc: string;
  
  // Scores por categoría (cada uno sobre 100) - 12 CATEGORÍAS
  // TAB 1: Availability & DR (40%)
  score_Backups?: number;           // 18%
  score_AlwaysOn?: number;          // 14%
  score_LogChain?: number;          // 5%
  score_DatabaseStates?: number;    // 3%
  
  // TAB 2: Performance (35%)
  score_CPU?: number;               // 10%
  score_Memoria?: number;           // 8%
  score_IO?: number;                // 10%
  score_Discos?: number;            // 7%
  
  // TAB 3: Maintenance & Config (25%)
  score_ErroresCriticos?: number;   // 7%
  score_Maintenance?: number;       // 5%
  score_ConfiguracionTempdb?: number; // 8%
  score_Autogrowth?: number;        // 5%
  
  // Contribuciones ponderadas (0-peso máximo)
  // TAB 1: Availability & DR
  backupsContribution?: number;           // Max: 18
  alwaysOnContribution?: number;          // Max: 14
  logChainContribution?: number;          // Max: 5
  databaseStatesContribution?: number;    // Max: 3
  
  // TAB 2: Performance
  cpuContribution?: number;               // Max: 10
  memoriaContribution?: number;           // Max: 8
  ioContribution?: number;                // Max: 10
  discosContribution?: number;            // Max: 7
  
  // TAB 3: Maintenance & Config
  erroresCriticosContribution?: number;   // Max: 7
  mantenimientosContribution?: number;    // Max: 5
  configuracionTempdbContribution?: number; // Max: 8
  autogrowthContribution?: number;        // Max: 5
}

export interface BackupsDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  lastFullBackup?: string;
  lastLogBackup?: string;
  fullBackupBreached: boolean;
  logBackupBreached: boolean;
}

export interface AlwaysOnDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  alwaysOnEnabled: boolean;
  alwaysOnWorstState?: string;
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

export interface ConectividadDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  connectSuccess: boolean;
  connectLatencyMs: number;
  authType?: string;
  loginFailuresLast1h: number;
  errorMessage?: string;
}

export interface ErroresCriticosDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  severity20PlusCount: number;
  severity20PlusLast1h: number;
  mostRecentError?: string;
  errorDetails?: string;
}

export interface CPUDetails {
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

export interface IODetails {
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

export interface DiscosDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  worstFreePct: number;
  dataDiskAvgFreePct: number;
  logDiskAvgFreePct: number;
  tempDBDiskFreePct: number;
  volumesJson?: string;
}

export interface MemoriaDetails {
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

export interface MaintenanceDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  lastCheckdb?: string;
  lastIndexOptimize?: string;
  checkdbOk: boolean;
  indexOptimizeOk: boolean;
}

export interface ConfiguracionTempdbDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  
  // TempDB - Archivos
  tempDBFileCount: number;
  tempDBAllSameSize: boolean;
  tempDBAllSameGrowth: boolean;
  tempDBTotalSizeMB: number;
  tempDBUsedSpaceMB: number;
  tempDBFreeSpacePct: number;
  
  // TempDB - Rendimiento
  tempDBAvgReadLatencyMs: number;
  tempDBAvgWriteLatencyMs: number;
  tempDBPageLatchWaits: number;
  tempDBContentionScore: number;  // Score compuesto (0-100)
  tempDBVersionStoreMB: number;
  
  // TempDB - Configuración
  tempDBAvgFileSizeMB: number;
  tempDBMinFileSizeMB: number;
  tempDBMaxFileSizeMB: number;
  tempDBGrowthConfigOK: boolean;
  
  // Max Memory
  maxServerMemoryMB: number;
  totalPhysicalMemoryMB: number;
  maxMemoryPctOfPhysical: number;
  maxMemoryWithinOptimal: boolean;
  cpuCount: number;
  configDetails?: string;
}

export interface LogChainDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  brokenChainCount: number;
  fullDBsWithoutLogBackup: number;
  maxHoursSinceLogBackup: number;
  logChainDetails?: string;  // JSON
}

export interface DatabaseStatesDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  offlineCount: number;
  suspectCount: number;
  emergencyCount: number;
  recoveryPendingCount: number;
  singleUserCount: number;
  restoringCount: number;
  suspectPageCount: number;
  databaseStateDetails?: string;  // JSON
}

export interface AutogrowthDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  autogrowthEventsLast24h: number;
  filesNearLimit: number;
  filesWithBadGrowth: number;
  worstPercentOfMax: number;
  autogrowthDetails?: string;  // JSON
}

export interface HealthScoreV3DetailDto extends HealthScoreV3Dto {
  // TAB 1: Availability & DR
  backupsDetails?: BackupsDetails;
  alwaysOnDetails?: AlwaysOnDetails;
  logChainDetails?: LogChainDetails;
  databaseStatesDetails?: DatabaseStatesDetails;
  
  // TAB 2: Performance
  cpuDetails?: CPUDetails;
  memoriaDetails?: MemoriaDetails;
  ioDetails?: IODetails;
  discosDetails?: DiscosDetails;
  
  // TAB 3: Maintenance & Config
  erroresCriticosDetails?: ErroresCriticosDetails;
  maintenanceDetails?: MaintenanceDetails;
  configuracionTempdbDetails?: ConfiguracionTempdbDetails;
  autogrowthDetails?: AutogrowthDetails;
}

export interface HealthScoreV3SummaryDto {
  totalInstances: number;
  healthyCount: number;
  warningCount: number;
  riskCount: number;
  criticalCount: number;
  avgScore: number;
  lastUpdate?: string;
}

export const healthScoreV3Api = {
  /**
   * Obtiene el Health Score V3 de todas las instancias
   */
  async getAllHealthScores(): Promise<HealthScoreV3Dto[]> {
    const response = await fetch(`${API_URL}/api/v3/healthscore`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreV3Dto[]>(response);
  },

  /**
   * Obtiene el detalle completo de una instancia
   */
  async getHealthScoreDetail(instance: string): Promise<HealthScoreV3Dto> {
    const response = await fetch(`${API_URL}/api/v3/healthscore/${encodeURIComponent(instance)}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreV3Dto>(response);
  },

  /**
   * Obtiene todos los detalles de una instancia con métricas subyacentes
   */
  async getHealthScoreDetails(instance: string): Promise<HealthScoreV3DetailDto> {
    const response = await fetch(`${API_URL}/api/v3/healthscore/${encodeURIComponent(instance)}/details`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreV3DetailDto>(response);
  },

  /**
   * Obtiene resumen general
   */
  async getSummary(): Promise<HealthScoreV3SummaryDto> {
    const response = await fetch(`${API_URL}/api/v3/healthscore/summary`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<HealthScoreV3SummaryDto>(response);
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

