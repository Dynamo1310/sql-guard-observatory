// API Service para conectar con el backend .NET
// Backend productivo: asprbm-nov-01:5000
export const getApiUrl = () => {
  // Si hay variable de entorno, usarla
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // URL fija del backend productivo
  return 'http://asprbm-nov-01:5000';
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
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  allowed: boolean;
  roles: string[];
  isOnCallEscalation: boolean;
}

export interface UserDto {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  role: string;
  active: boolean;
  createdAt: string;
}

export interface CreateUserRequest {
  domainUser: string;
  displayName: string;
  email?: string;
  role: string;
}

export interface UpdateUserRequest {
  displayName: string;
  email?: string;
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
        id: data.id,
        domainUser: data.domainUser,
        displayName: data.displayName,
        email: data.email,
        roles: data.roles,
        isOnCallEscalation: data.isOnCallEscalation,
      }));
    }
    
    return data;
  },

  async windowsLogin(): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/api/auth/windows-login`, {
      method: 'GET',
      credentials: 'include',
    });
    
    const data = await handleResponse<LoginResponse>(response);
    
    if (data.token) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify({
        id: data.id,
        domainUser: data.domainUser,
        displayName: data.displayName,
        email: data.email,
        roles: data.roles,
        isOnCallEscalation: data.isOnCallEscalation,
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
    // Cache-busting
    params.append('_', new Date().getTime().toString());
    
    const url = `${API_URL}/api/jobs?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
      cache: 'no-cache',
    });
    return handleResponse<JobDto[]>(response);
  },

  async getJobsSummary(ambiente?: string, hosting?: string, instance?: string): Promise<JobSummaryDto> {
    const params = new URLSearchParams();
    if (ambiente && ambiente !== 'All') params.append('ambiente', ambiente);
    if (hosting && hosting !== 'All') params.append('hosting', hosting);
    if (instance && instance !== 'All') params.append('instance', instance);
    // Cache-busting
    params.append('_', new Date().getTime().toString());
    
    const url = `${API_URL}/api/jobs/summary?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        ...getAuthHeader(),
      },
      cache: 'no-cache',
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
  
  // Espacio físico en disco
  totalGB?: number;
  libreGB?: number;
  porcentajeLibre?: number;
  
  // Espacio REAL (v3.3) = Espacio físico + Espacio interno en archivos con growth
  realLibreGB?: number;
  realPorcentajeLibre?: number;
  espacioInternoEnArchivosGB?: number;
  
  // Información de archivos
  filesWithGrowth: number;
  filesWithoutGrowth: number;
  totalFiles: number;
  
  // Estado y alertas
  estado?: string;
  isAlerted: boolean;
  
  // Rol del disco
  isDataDisk: boolean;
  isLogDisk: boolean;
  isTempDBDisk: boolean;
  
  captureDate: string;
}

export interface DiskSummaryDto {
  discosCriticos: number;
  discosAdvertencia: number;
  discosSaludables: number;
  totalDiscos: number;
  
  // Nuevos contadores para diferenciar tipos de alertas
  discosAlertadosReales: number;  // Discos con growth + espacio real <= 10%
  discosBajosSinRiesgo: number;   // Discos <10% pero sin growth o con espacio interno
  
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
  
  // Diagnóstico Inteligente de I/O para TempDB (v3.1)
  tempDBIODiagnosis?: string;
  tempDBIOSuggestion?: string;
  tempDBIOSeverity?: string;
  
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
  
  // Métricas de I/O del Sistema (v3.1)
  pageLifeExpectancy?: number;
  pageReadsPerSec?: number;
  pageWritesPerSec?: number;
  lazyWritesPerSec?: number;
  checkpointPagesPerSec?: number;
  batchRequestsPerSec?: number;
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
  stolenServerMemoryMB: number;  // Memoria fuera del buffer pool
}

export interface MaintenanceDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  lastCheckdb?: string;
  lastIndexOptimize?: string;
  checkdbOk: boolean;
  indexOptimizeOk: boolean;
  agName?: string;  // Nombre del AG si la instancia pertenece a uno
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
  tempDBMountPoint?: string;
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

export interface WaitsDetails {
  id: number;
  instanceName: string;
  collectedAtUtc: string;
  
  // Blocking
  blockedSessionCount: number;
  maxBlockTimeSeconds: number;
  blockerSessionIds?: string;
  
  // Top Waits
  topWait1Type?: string;
  topWait1Count: number;
  topWait1Ms: number;
  
  // CPU/Parallelism Waits
  cxPacketWaitCount: number;
  cxPacketWaitMs: number;
  cxConsumerWaitCount: number;
  cxConsumerWaitMs: number;
  sosSchedulerYieldCount: number;
  sosSchedulerYieldMs: number;
  threadPoolWaitCount: number;
  threadPoolWaitMs: number;
  
  // Memory Waits
  resourceSemaphoreWaitCount: number;
  resourceSemaphoreWaitMs: number;
  
  // I/O Waits
  pageIOLatchWaitCount: number;
  pageIOLatchWaitMs: number;
  writeLogWaitCount: number;
  writeLogWaitMs: number;
  asyncIOCompletionCount: number;
  asyncIOCompletionMs: number;
  
  // Lock Waits
  lockWaitCount: number;
  lockWaitMs: number;
  
  // Config
  maxDOP?: number;
  
  // Totals
  totalWaits: number;
  totalWaitMs: number;
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
  waitsDetails?: WaitsDetails;  // NUEVO
  
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
    // Agregar timestamp para evitar caché
    const timestamp = new Date().getTime();
    const response = await fetch(`${API_URL}/api/v3/healthscore?_=${timestamp}`, {
      headers: {
        ...getAuthHeader(),
      },
      cache: 'no-cache', // Forzar no-cache
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

// ==================== ONCALL API ====================

export interface OnCallOperatorDto {
  id: number;
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  rotationOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface OnCallScheduleDto {
  id: number;
  userId: string;
  domainUser: string;
  displayName: string;
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  year: number;
  isOverride: boolean;
  modifiedByDisplayName?: string;
  createdAt: string;
}

export interface OnCallSwapRequestDto {
  id: number;
  requesterId: string;
  requesterDomainUser: string;
  requesterDisplayName: string;
  targetUserId: string;
  targetDomainUser: string;
  targetDisplayName: string;
  originalScheduleId: number;
  originalWeekStartDate: string;
  originalWeekEndDate: string;
  swapScheduleId?: number;
  swapWeekStartDate?: string;
  swapWeekEndDate?: string;
  status: string;
  rejectionReason?: string;
  requestReason?: string;
  requestedAt: string;
  respondedAt?: string;
  isEscalationOverride: boolean;
}

export interface OnCallCurrentDto {
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  isCurrentlyOnCall: boolean;
  escalationUsers: EscalationUserDto[];
}

export interface EscalationUserDto {
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  order: number;
}

export interface WhitelistUserDto {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  isOperator: boolean;
  isEscalation: boolean;
}

export interface MonthCalendarDto {
  year: number;
  month: number;
  monthName: string;
  days: CalendarDayDto[];
  onCallWeeks: OnCallWeekDto[];
}

export interface CalendarDayDto {
  date: string;
  dayOfMonth: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isOnCallStart: boolean;
  isOnCallEnd: boolean;
  onCallUserId?: string;
  onCallDisplayName?: string;
  colorCode?: string;
}

export interface OnCallWeekDto {
  scheduleId: number;
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  userId: string;
  domainUser: string;
  displayName: string;
  colorCode: string;
  isCurrentWeek: boolean;
}

export interface AddOperatorRequest {
  userId: string;
}

export interface ReorderOperatorsRequest {
  orders: { id: number; order: number }[];
}

export interface GenerateScheduleRequest {
  startDate: string;
  weeksToGenerate?: number;
}

export interface UpdateScheduleRequest {
  userId: string;
  reason?: string;
}

export interface CreateSwapRequestDto {
  originalScheduleId: number;
  targetUserId: string;
  swapScheduleId?: number;
  reason?: string;
}

export interface RejectSwapRequestDto {
  reason: string;
}

export const onCallApi = {
  // Operators
  async getOperators(): Promise<OnCallOperatorDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/operators`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallOperatorDto[]>(response);
  },

  async addOperator(userId: string): Promise<OnCallOperatorDto> {
    const response = await fetch(`${API_URL}/api/oncall/operators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userId }),
    });
    return handleResponse<OnCallOperatorDto>(response);
  },

  async removeOperator(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/oncall/operators/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al eliminar operador' }));
      throw new Error(error.message);
    }
  },

  async reorderOperators(orders: { id: number; order: number }[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/oncall/operators/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ orders }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al reordenar' }));
      throw new Error(error.message);
    }
  },

  // Calendar
  async getMonthCalendar(year: number, month: number): Promise<MonthCalendarDto> {
    const response = await fetch(`${API_URL}/api/oncall/calendar/${year}/${month}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<MonthCalendarDto>(response);
  },

  async getSchedules(startDate?: string, endDate?: string): Promise<OnCallScheduleDto[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    const url = `${API_URL}/api/oncall/schedule${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallScheduleDto[]>(response);
  },

  async generateSchedule(startDate: string, weeksToGenerate?: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/schedule/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ startDate, weeksToGenerate }),
    });
    return handleResponse<{ message: string }>(response);
  },

  async updateSchedule(id: number, userId: string, reason?: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/schedule/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userId, reason }),
    });
    return handleResponse<{ message: string }>(response);
  },

  async getCurrentOnCall(): Promise<OnCallCurrentDto> {
    const response = await fetch(`${API_URL}/api/oncall/current`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallCurrentDto>(response);
  },

  async getScheduleByDate(date: string): Promise<OnCallScheduleDto | null> {
    const response = await fetch(`${API_URL}/api/oncall/schedule-by-date?date=${encodeURIComponent(date)}`, {
      headers: { ...getAuthHeader() },
    });
    if (response.status === 404) {
      return null;
    }
    return handleResponse<OnCallScheduleDto>(response);
  },

  // Swap Requests
  async getSwapRequests(): Promise<OnCallSwapRequestDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/swap-requests`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallSwapRequestDto[]>(response);
  },

  async createSwapRequest(data: CreateSwapRequestDto): Promise<OnCallSwapRequestDto> {
    const response = await fetch(`${API_URL}/api/oncall/swap-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallSwapRequestDto>(response);
  },

  async approveSwapRequest(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/swap-requests/${id}/approve`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async rejectSwapRequest(id: number, reason: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/swap-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ reason }),
    });
    return handleResponse<{ message: string }>(response);
  },

  // Utilities
  async getWhitelistUsers(): Promise<WhitelistUserDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/whitelist-users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<WhitelistUserDto[]>(response);
  },

  async isEscalationUser(): Promise<{ isEscalation: boolean }> {
    const response = await fetch(`${API_URL}/api/oncall/is-escalation`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ isEscalation: boolean }>(response);
  },

  // Escalation Management
  async getEscalationUsers(): Promise<EscalationUserDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<EscalationUserDto[]>(response);
  },

  async addEscalationUser(userId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userId }),
    });
    return handleResponse<{ message: string }>(response);
  },

  async removeEscalationUser(userId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async updateEscalationOrder(userIds: string[]): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users/order`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userIds }),
    });
    return handleResponse<{ message: string }>(response);
  },
};

// ==================== SMTP SETTINGS API ====================

export interface SmtpSettingsDto {
  id: number;
  host: string;
  port: number;
  fromEmail: string;
  fromName: string;
  enableSsl: boolean;
  username?: string;
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface UpdateSmtpSettingsRequest {
  host: string;
  port: number;
  fromEmail: string;
  fromName: string;
  enableSsl: boolean;
  username?: string;
  password?: string;
}

export const smtpApi = {
  async getSettings(): Promise<SmtpSettingsDto> {
    const response = await fetch(`${API_URL}/api/smtp/settings`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SmtpSettingsDto>(response);
  },

  async updateSettings(data: UpdateSmtpSettingsRequest): Promise<SmtpSettingsDto> {
    const response = await fetch(`${API_URL}/api/smtp/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<SmtpSettingsDto>(response);
  },

  async testConnection(testEmail: string): Promise<{ message: string; success: boolean }> {
    const response = await fetch(`${API_URL}/api/smtp/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ testEmail }),
    });
    return handleResponse<{ message: string; success: boolean }>(response);
  },
};

// ==================== ACTIVATIONS API ====================

export interface OnCallActivationDto {
  id: number;
  scheduleId: number;
  scheduleWeekStart: string;
  scheduleWeekEnd: string;
  operatorUserId: string;
  operatorDomainUser: string;
  operatorDisplayName: string;
  activatedAt: string;
  resolvedAt?: string;
  durationMinutes?: number;
  category: string;
  severity: string;
  title: string;
  description?: string;
  resolution?: string;
  instanceName?: string;
  createdByDisplayName: string;
  createdAt: string;
}

export interface CreateActivationRequest {
  scheduleId: number;
  activatedAt: string;
  resolvedAt?: string;
  durationMinutes?: number;
  category: string;
  severity: string;
  title: string;
  description?: string;
  resolution?: string;
  instanceName?: string;
}

export interface UpdateActivationRequest {
  resolvedAt?: string;
  durationMinutes?: number;
  category?: string;
  severity?: string;
  title?: string;
  description?: string;
  resolution?: string;
  instanceName?: string;
}

export interface ActivationSummaryDto {
  totalActivations: number;
  totalHours: number;
  totalMinutes: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  byCategory: Record<string, number>;
  byOperator: Record<string, number>;
}

export const activationCategories = ['Database', 'Performance', 'Connectivity', 'Backup', 'Security', 'Other'];
export const activationSeverities = ['Low', 'Medium', 'High', 'Critical'];

export const activationsApi = {
  async getAll(startDate?: string, endDate?: string): Promise<OnCallActivationDto[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}/api/activations${query}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallActivationDto[]>(response);
  },

  async getById(id: number): Promise<OnCallActivationDto> {
    const response = await fetch(`${API_URL}/api/activations/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallActivationDto>(response);
  },

  async create(data: CreateActivationRequest): Promise<OnCallActivationDto> {
    const response = await fetch(`${API_URL}/api/activations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallActivationDto>(response);
  },

  async update(id: number, data: UpdateActivationRequest): Promise<OnCallActivationDto> {
    const response = await fetch(`${API_URL}/api/activations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallActivationDto>(response);
  },

  async delete(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/activations/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async getSummary(startDate?: string, endDate?: string): Promise<ActivationSummaryDto> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`${API_URL}/api/activations/summary${query}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ActivationSummaryDto>(response);
  },
};

// ==================== ALERT RULES API ====================

export interface AlertRecipientDto {
  id: number;
  email: string;
  name?: string;
  isEnabled: boolean;
}

export interface OnCallAlertRuleDto {
  id: number;
  name: string;
  description?: string;
  alertType: string;
  conditionDays?: number;
  isEnabled: boolean;
  createdByDisplayName: string;
  createdAt: string;
  updatedAt?: string;
  recipients: AlertRecipientDto[];
}

export interface CreateAlertRuleRequest {
  name: string;
  description?: string;
  alertType: string;
  conditionDays?: number;
  recipients: { email: string; name?: string }[];
}

export interface UpdateAlertRuleRequest {
  name?: string;
  description?: string;
  conditionDays?: number;
  isEnabled?: boolean;
}

export const alertTypes = [
  { value: 'ScheduleGenerated', label: 'Calendario Generado' },
  { value: 'DaysRemaining', label: 'Días Restantes' },
  { value: 'SwapRequested', label: 'Intercambio Solicitado' },
  { value: 'SwapApproved', label: 'Intercambio Aprobado' },
  { value: 'SwapRejected', label: 'Intercambio Rechazado' },
  { value: 'ScheduleModified', label: 'Guardia Modificada' },
  { value: 'ActivationCreated', label: 'Activación Registrada' },
  { value: 'Custom', label: 'Personalizada' },
];

export const alertsApi = {
  async getAll(): Promise<OnCallAlertRuleDto[]> {
    const response = await fetch(`${API_URL}/api/alerts`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallAlertRuleDto[]>(response);
  },

  async getById(id: number): Promise<OnCallAlertRuleDto> {
    const response = await fetch(`${API_URL}/api/alerts/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallAlertRuleDto>(response);
  },

  async create(data: CreateAlertRuleRequest): Promise<OnCallAlertRuleDto> {
    const response = await fetch(`${API_URL}/api/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallAlertRuleDto>(response);
  },

  async update(id: number, data: UpdateAlertRuleRequest): Promise<OnCallAlertRuleDto> {
    const response = await fetch(`${API_URL}/api/alerts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallAlertRuleDto>(response);
  },

  async delete(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/alerts/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async addRecipient(alertId: number, email: string, name?: string): Promise<AlertRecipientDto> {
    const response = await fetch(`${API_URL}/api/alerts/${alertId}/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ email, name }),
    });
    return handleResponse<AlertRecipientDto>(response);
  },

  async removeRecipient(alertId: number, recipientId: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/alerts/${alertId}/recipients/${recipientId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async toggleRecipient(alertId: number, recipientId: number, isEnabled: boolean): Promise<AlertRecipientDto> {
    const response = await fetch(`${API_URL}/api/alerts/${alertId}/recipients/${recipientId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ isEnabled }),
    });
    return handleResponse<AlertRecipientDto>(response);
  },
};

// ==================== INVENTORY API ====================

export interface InventoryInstanceDto {
  id: number;
  serverName: string;
  local_net_address: string;
  nombreInstancia: string;
  majorVersion: string;
  productLevel: string;
  edition: string;
  productUpdateLevel: string;
  productVersion: string;
  productUpdateReference: string;
  collation: string;
  alwaysOn: string;
  hostingSite: string;
  hostingType: string;
  ambiente: string;
}

export const inventoryApi = {
  // Usa el proxy del backend para evitar problemas de CORS
  async getAll(): Promise<InventoryInstanceDto[]> {
    const response = await fetch(`${API_URL}/api/production-alerts/inventory`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<InventoryInstanceDto[]>(response);
  },
};

// ==================== PRODUCTION DOWNTIME ALERTS API ====================

export interface ProductionAlertConfigDto {
  id: number;
  name: string;
  description?: string;
  isEnabled: boolean;
  checkIntervalMinutes: number;  // Intervalo de verificación (cada cuánto chequea conexiones)
  alertIntervalMinutes: number;  // Intervalo de alerta (cada cuánto envía mail si sigue caído)
  failedChecksBeforeAlert: number;  // Cantidad de chequeos fallidos consecutivos antes de alertar
  recipients: string[];
  ambientes: string[];  // Ambientes a monitorear (Produccion, Desarrollo, Testing)
  lastRunAt?: string;
  lastAlertSentAt?: string;
  createdAt: string;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface InstanceConnectionStatus {
  instanceName: string;
  serverName: string;
  ambiente: string;
  hostingSite: string;
  isConnected: boolean;
  lastCheckedAt?: string;
  lastError?: string;
  downSince?: string;
  consecutiveFailures: number;  // Contador de chequeos fallidos consecutivos
}

export interface ProductionAlertHistoryDto {
  id: number;
  configId: number;
  sentAt: string;
  recipientCount: number;
  instancesDown: string[];
  success: boolean;
  errorMessage?: string;
}

export interface CreateProductionAlertRequest {
  name: string;
  description?: string;
  checkIntervalMinutes: number;
  alertIntervalMinutes: number;
  failedChecksBeforeAlert: number;
  recipients: string[];
  ambientes: string[];
}

export interface UpdateProductionAlertRequest {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  checkIntervalMinutes?: number;
  alertIntervalMinutes?: number;
  failedChecksBeforeAlert?: number;
  recipients?: string[];
  ambientes?: string[];
}

export const productionAlertsApi = {
  async getConfig(): Promise<ProductionAlertConfigDto | null> {
    const response = await fetch(`${API_URL}/api/production-alerts/config`, {
      headers: { ...getAuthHeader() },
    });
    if (response.status === 404) return null;
    return handleResponse<ProductionAlertConfigDto>(response);
  },

  async createConfig(data: CreateProductionAlertRequest): Promise<ProductionAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/production-alerts/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<ProductionAlertConfigDto>(response);
  },

  async updateConfig(data: UpdateProductionAlertRequest): Promise<ProductionAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/production-alerts/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<ProductionAlertConfigDto>(response);
  },

  async getHistory(limit: number = 20): Promise<ProductionAlertHistoryDto[]> {
    const response = await fetch(`${API_URL}/api/production-alerts/history?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ProductionAlertHistoryDto[]>(response);
  },

  async getConnectionStatus(): Promise<InstanceConnectionStatus[]> {
    const response = await fetch(`${API_URL}/api/production-alerts/status`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<InstanceConnectionStatus[]>(response);
  },

  async testAlert(): Promise<{ success: boolean; message: string; instancesDown?: string[] }> {
    const response = await fetch(`${API_URL}/api/production-alerts/test`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ success: boolean; message: string; instancesDown?: string[] }>(response);
  },

  async runNow(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/production-alerts/run`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },

  async checkInstance(instanceName: string): Promise<{ isConnected: boolean; error?: string }> {
    const response = await fetch(`${API_URL}/api/production-alerts/check/${encodeURIComponent(instanceName)}`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ isConnected: boolean; error?: string }>(response);
  },
};

// ==================== SERVER RESTART API ====================

export interface RestartableServerDto {
  serverName: string;
  instanceName: string;
  ambiente?: string;
  hostingSite?: string;
  hostingType?: string;
  majorVersion?: string;
  edition?: string;
  isAlwaysOn: boolean;
  isStandalone: boolean;
  isConnected: boolean;
  lastCheckedAt?: string;
}

export interface ServerRestartTaskDto {
  id: number;
  taskId: string;
  servers: string[];
  serverCount: number;
  status: 'Pending' | 'Running' | 'Completed' | 'Failed' | 'Cancelled';
  startedAt: string;
  completedAt?: string;
  initiatedByUserId: string;
  initiatedByUserName?: string;
  successCount: number;
  failureCount: number;
  errorMessage?: string;
  details: ServerRestartDetailDto[];
  durationSeconds?: number;
}

export interface ServerRestartDetailDto {
  id: number;
  serverName: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
  restartResult?: string;
  pingResult?: string;
  servicioOSResult?: string;
  discosResult?: string;
  servicioMSSQLSERVERResult?: string;
  servicioSQLSERVERAGENTResult?: string;
}

export interface StartRestartRequest {
  servers: string[];
}

export interface StartRestartResponse {
  success: boolean;
  taskId: string;
  message: string;
  serverCount: number;
}

export interface RestartOutputMessage {
  taskId: string;
  line: string;
  type: 'info' | 'error' | 'warning' | 'success';
  serverName?: string;
  timestamp: string;
}

export interface RestartProgressMessage {
  taskId: string;
  currentServer: string;
  currentIndex: number;
  totalServers: number;
  phase: string;
  percentComplete: number;
  timestamp: string;
}

export interface RestartCompletedMessage {
  taskId: string;
  status: string;
  successCount: number;
  failureCount: number;
  completedAt: string;
  durationSeconds: number;
  errorMessage?: string;
}

export interface RestartStatusResponse {
  hasRunningTask: boolean;
  runningTask?: ServerRestartTaskDto;
}

export const serverRestartApi = {
  async getServers(): Promise<RestartableServerDto[]> {
    const response = await fetch(`${API_URL}/api/serverrestart/servers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<RestartableServerDto[]>(response);
  },

  async startRestart(request: StartRestartRequest): Promise<StartRestartResponse> {
    const response = await fetch(`${API_URL}/api/serverrestart/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    return handleResponse<StartRestartResponse>(response);
  },

  async getTasks(limit: number = 50): Promise<ServerRestartTaskDto[]> {
    const response = await fetch(`${API_URL}/api/serverrestart/tasks?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ServerRestartTaskDto[]>(response);
  },

  async getTask(taskId: string): Promise<ServerRestartTaskDto> {
    const response = await fetch(`${API_URL}/api/serverrestart/tasks/${taskId}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ServerRestartTaskDto>(response);
  },

  async cancelTask(taskId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/serverrestart/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async getStatus(): Promise<RestartStatusResponse> {
    const response = await fetch(`${API_URL}/api/serverrestart/status`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<RestartStatusResponse>(response);
  },
};

// ==================== OPERATIONAL SERVERS API ====================

export interface OperationalServerDto {
  id: number;
  serverName: string;
  instanceName?: string;
  description?: string;
  ambiente?: string;
  isFromInventory: boolean;
  enabled: boolean;
  enabledForRestart: boolean;
  enabledForFailover: boolean;
  enabledForPatching: boolean;
  createdAt: string;
  createdByUserName?: string;
  updatedAt?: string;
  updatedByUserName?: string;
  notes?: string;
}

export interface CreateOperationalServerRequest {
  serverName: string;
  instanceName?: string;
  description?: string;
  ambiente?: string;
  isFromInventory?: boolean;
  enabledForRestart?: boolean;
  enabledForFailover?: boolean;
  enabledForPatching?: boolean;
  notes?: string;
}

export interface UpdateOperationalServerRequest {
  description?: string;
  ambiente?: string;
  enabled: boolean;
  enabledForRestart: boolean;
  enabledForFailover: boolean;
  enabledForPatching: boolean;
  notes?: string;
}

export interface ImportServersFromInventoryRequest {
  serverNames: string[];
}

export interface ImportServersResponse {
  success: boolean;
  message: string;
  importedCount: number;
  skippedCount: number;
  errors: string[];
}

export interface InventoryServerInfoDto {
  serverName: string;
  instanceName?: string;
  ambiente?: string;
  majorVersion?: string;
  edition?: string;
  isAlwaysOn: boolean;
  alreadyAdded: boolean;
}

export interface OperationalServerAuditDto {
  id: number;
  operationalServerId: number;
  serverName: string;
  action: string;
  changedAt: string;
  changedByUserName?: string;
  oldValues?: string;
  newValues?: string;
}

export const operationalServersApi = {
  async getServers(): Promise<OperationalServerDto[]> {
    const response = await fetch(`${API_URL}/api/operationalservers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OperationalServerDto[]>(response);
  },

  async getServer(id: number): Promise<OperationalServerDto> {
    const response = await fetch(`${API_URL}/api/operationalservers/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OperationalServerDto>(response);
  },

  async getInventoryServers(): Promise<InventoryServerInfoDto[]> {
    const response = await fetch(`${API_URL}/api/operationalservers/inventory`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<InventoryServerInfoDto[]>(response);
  },

  async createServer(request: CreateOperationalServerRequest): Promise<OperationalServerDto> {
    const response = await fetch(`${API_URL}/api/operationalservers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    return handleResponse<OperationalServerDto>(response);
  },

  async importFromInventory(request: ImportServersFromInventoryRequest): Promise<ImportServersResponse> {
    const response = await fetch(`${API_URL}/api/operationalservers/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    return handleResponse<ImportServersResponse>(response);
  },

  async updateServer(id: number, request: UpdateOperationalServerRequest): Promise<OperationalServerDto> {
    const response = await fetch(`${API_URL}/api/operationalservers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    return handleResponse<OperationalServerDto>(response);
  },

  async toggleServer(id: number): Promise<{ enabled: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/operationalservers/${id}/toggle`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ enabled: boolean; message: string }>(response);
  },

  async deleteServer(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/operationalservers/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async getAuditHistory(limit: number = 100): Promise<OperationalServerAuditDto[]> {
    const response = await fetch(`${API_URL}/api/operationalservers/audit?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OperationalServerAuditDto[]>(response);
  },

  async checkPermission(): Promise<{ hasPermission: boolean }> {
    const response = await fetch(`${API_URL}/api/operationalservers/check-permission`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ hasPermission: boolean }>(response);
  },
};

// ==================== INDEX ANALYSIS API ====================

export interface IndexAnalysisInstanceDto {
  instanceName: string;
  serverName: string;
  ambiente: string;
  hostingSite: string;
  majorVersion?: string;
  edition?: string;
}

export interface DatabaseInfoDto {
  databaseId: number;
  databaseName: string;
  state: string;
  recoveryModel: string;
  sizeMB: number;
}

export interface FragmentedIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  fragmentationPct: number;
  pageCount: number;
  sizeMB: number;
  suggestion: string;
  isDisabled: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  fillFactor: number;
  rebuildScript?: string;
  reorganizeScript?: string;
}

export interface UnusedIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  userSeeks: number;
  userScans: number;
  userLookups: number;
  userUpdates: number;
  lastUserSeek?: string;
  lastUserScan?: string;
  lastUserLookup?: string;
  lastUserUpdate?: string;
  sizeMB: number;
  pageCount: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  isDisabled: boolean;
  columns: string;
  includedColumns?: string;
  dropScript?: string;
  severity: string;
}

export interface DuplicateIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  duplicateOfIndex: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  sizeMB: number;
  pageCount: number;
  isPrimaryKey: boolean;
  isUnique: boolean;
  duplicateType: string;
  dropScript?: string;
}

export interface MissingIndexDto {
  schemaName: string;
  tableName: string;
  equalityColumns: string;
  inequalityColumns?: string;
  includedColumns?: string;
  improvementMeasure: number;
  userSeeks: number;
  userScans: number;
  avgTotalUserCost: number;
  avgUserImpact: number;
  lastUserSeek?: string;
  lastUserScan?: string;
  createScript?: string;
  severity: string;
}

export interface DisabledIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  isPrimaryKey: boolean;
  isUnique: boolean;
  keyColumns: string;
  includedColumns?: string;
  createDate?: string;
  modifyDate?: string;
  rebuildScript?: string;
}

export interface OverlappingIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  overlappedByIndex: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  overlappingKeyColumns: string;
  overlappingIncludedColumns?: string;
  sizeMB: number;
  pageCount: number;
  userSeeks: number;
  userScans: number;
  userUpdates: number;
  overlapType: string;
  dropScript?: string;
}

export interface BadIndexDto {
  schemaName: string;
  tableName: string;
  indexName: string;
  indexType: string;
  keyColumns: string;
  includedColumns?: string;
  keyColumnCount: number;
  includedColumnCount: number;
  totalColumnCount: number;
  keySizeBytes: number;
  sizeMB: number;
  problem: string;
  severity: string;
  recommendation: string;
}

export interface IndexAnalysisSummaryDto {
  instanceName: string;
  databaseName: string;
  analyzedAt: string;
  totalIndexes: number;
  fragmentedCount: number;
  unusedCount: number;
  duplicateCount: number;
  missingCount: number;
  disabledCount: number;
  overlappingCount: number;
  badIndexCount: number;
  totalIndexSizeMB: number;
  wastedSpaceMB: number;
  potentialSavingsMB: number;
  healthScore: number;
  healthStatus: string;
  topRecommendations: string[];
}

export interface FullIndexAnalysisDto {
  summary: IndexAnalysisSummaryDto;
  fragmentedIndexes: FragmentedIndexDto[];
  unusedIndexes: UnusedIndexDto[];
  duplicateIndexes: DuplicateIndexDto[];
  missingIndexes: MissingIndexDto[];
  disabledIndexes: DisabledIndexDto[];
  overlappingIndexes: OverlappingIndexDto[];
  badIndexes: BadIndexDto[];
}

export interface IndexAnalysisRequestDto {
  instanceName: string;
  databaseName: string;
  minPageCount?: number;
  minFragmentationPct?: number;
  includeSystemDatabases?: boolean;
  includeHeaps?: boolean;
  generateScripts?: boolean;
}

export const indexAnalysisApi = {
  // Obtener instancias filtradas del inventario
  async getInstances(): Promise<IndexAnalysisInstanceDto[]> {
    const response = await fetch(`${API_URL}/api/index-analysis/instances`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<IndexAnalysisInstanceDto[]>(response);
  },

  // Obtener bases de datos de una instancia
  async getDatabases(instanceName: string): Promise<DatabaseInfoDto[]> {
    const response = await fetch(`${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/databases`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<DatabaseInfoDto[]>(response);
  },

  // Probar conexión a una instancia
  async testConnection(instanceName: string): Promise<{ instanceName: string; isConnected: boolean; error?: string }> {
    const response = await fetch(`${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/test-connection`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ instanceName: string; isConnected: boolean; error?: string }>(response);
  },

  // Obtener índices fragmentados
  async getFragmentedIndexes(
    instanceName: string,
    databaseName: string,
    minPageCount: number = 1000,
    minFragmentationPct: number = 10.0
  ): Promise<FragmentedIndexDto[]> {
    const params = new URLSearchParams();
    params.append('minPageCount', minPageCount.toString());
    params.append('minFragmentationPct', minFragmentationPct.toString());
    
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/fragmented?${params}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<FragmentedIndexDto[]>(response);
  },

  // Obtener índices sin uso
  async getUnusedIndexes(instanceName: string, databaseName: string, minPageCount: number = 1000): Promise<UnusedIndexDto[]> {
    const params = new URLSearchParams();
    params.append('minPageCount', minPageCount.toString());
    
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/unused?${params}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<UnusedIndexDto[]>(response);
  },

  // Obtener índices duplicados
  async getDuplicateIndexes(instanceName: string, databaseName: string): Promise<DuplicateIndexDto[]> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/duplicate`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<DuplicateIndexDto[]>(response);
  },

  // Obtener missing indexes
  async getMissingIndexes(instanceName: string, databaseName: string): Promise<MissingIndexDto[]> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/missing`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<MissingIndexDto[]>(response);
  },

  // Obtener índices deshabilitados
  async getDisabledIndexes(instanceName: string, databaseName: string): Promise<DisabledIndexDto[]> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/disabled`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<DisabledIndexDto[]>(response);
  },

  // Obtener índices solapados
  async getOverlappingIndexes(instanceName: string, databaseName: string): Promise<OverlappingIndexDto[]> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/overlapping`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<OverlappingIndexDto[]>(response);
  },

  // Obtener índices problemáticos
  async getBadIndexes(instanceName: string, databaseName: string): Promise<BadIndexDto[]> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/bad`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<BadIndexDto[]>(response);
  },

  // Obtener análisis completo
  async getFullAnalysis(
    instanceName: string,
    databaseName: string,
    options?: { minPageCount?: number; minFragmentationPct?: number; generateScripts?: boolean }
  ): Promise<FullIndexAnalysisDto> {
    const params = new URLSearchParams();
    if (options?.minPageCount) params.append('minPageCount', options.minPageCount.toString());
    if (options?.minFragmentationPct) params.append('minFragmentationPct', options.minFragmentationPct.toString());
    if (options?.generateScripts !== undefined) params.append('generateScripts', options.generateScripts.toString());
    
    const queryString = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/full${queryString}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<FullIndexAnalysisDto>(response);
  },

  // Analizar con opciones avanzadas (POST)
  async analyze(request: IndexAnalysisRequestDto): Promise<FullIndexAnalysisDto> {
    const response = await fetch(`${API_URL}/api/index-analysis/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<FullIndexAnalysisDto>(response);
  },

  // Obtener solo el resumen
  async getSummary(instanceName: string, databaseName: string): Promise<IndexAnalysisSummaryDto> {
    const response = await fetch(
      `${API_URL}/api/index-analysis/${encodeURIComponent(instanceName)}/${encodeURIComponent(databaseName)}/summary`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<IndexAnalysisSummaryDto>(response);
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

