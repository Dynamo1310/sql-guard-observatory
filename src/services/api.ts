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
  /** URL de la foto de perfil (data:image/...) */
  profilePhotoUrl?: string | null;
  /** Indica si el usuario tiene foto de perfil */
  hasProfilePhoto?: boolean;
}

export interface UserDto {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  role: string;
  roleId?: number;
  roleColor?: string;
  roleIcon?: string;
  active: boolean;
  /** URL de la foto de perfil */
  profilePhotoUrl?: string | null;
  /** Indica si el usuario tiene foto de perfil */
  hasProfilePhoto?: boolean;
  /** Origen de la foto: AD, Manual, None */
  profilePhotoSource?: string;
  createdAt: string;
  /** Fecha y hora de la última conexión */
  lastLoginAt?: string | null;
}

export interface CreateUserRequest {
  domainUser: string;
  displayName: string;
  email?: string;
  role?: string;
  roleId?: number;
}

export interface UpdateUserRequest {
  displayName: string;
  email?: string;
  role?: string;
  roleId?: number;
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

// =============================================
// Tipos de Foto de Perfil
// =============================================

export interface ProfilePhotoResponse {
  photoUrl?: string | null;
  hasPhoto: boolean;
  source?: string;
}

export interface ProfilePhotoSyncResponse {
  success: boolean;
  message: string;
  photoBase64?: string | null;
  source?: string;
  updatedAt?: string;
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
        profilePhotoUrl: data.profilePhotoUrl,
        hasProfilePhoto: data.hasProfilePhoto,
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
        profilePhotoUrl: data.profilePhotoUrl,
        hasProfilePhoto: data.hasProfilePhoto,
      }));

      // Pre-cargar permisos, autorización, Overview y menuBadges en paralelo
      // Esto "calienta" el backend completamente y guarda en caché para carga instantánea
      try {
        const [permissionsData, authData] = await Promise.all([
          permissionsApi.getMyPermissions(),
          adminRolesApi.getMyAuthorization(),
          // Pre-cargar Overview y MenuBadges para calentar esos endpoints (no guardamos en localStorage)
          fetch(`${API_URL}/api/overview-data`, { headers: getAuthHeader() }).catch(() => null),
          fetch(`${API_URL}/api/menubadges`, { headers: getAuthHeader() }).catch(() => null)
        ]);

        // Guardar en caché (mismas claves que AuthContext)
        localStorage.setItem('cached_permissions', JSON.stringify(permissionsData.permissions));
        localStorage.setItem('cached_authorization', JSON.stringify({
          roleId: authData.roleId,
          roleName: authData.roleName,
          roleColor: authData.roleColor,
          roleIcon: authData.roleIcon,
          rolePriority: authData.rolePriority,
          capabilities: authData.capabilities,
          assignableRoles: authData.assignableRoles.map((r: any) => ({
            id: r.id,
            name: r.name,
            color: r.color,
            icon: r.icon,
            priority: r.priority,
          })),
          manageableGroupIds: authData.manageableGroupIds || [],
          isSuperAdmin: authData.isSuperAdmin,
          isAdmin: authData.isAdmin,
          isReader: authData.isReader,
          canCreateUsers: authData.canCreateUsers,
          canDeleteUsers: authData.canDeleteUsers,
          canCreateGroups: authData.canCreateGroups,
        }));
      } catch (error) {
        console.warn('[Auth] Error pre-cargando datos (se cargarán después):', error);
      }
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

  // =============================================
  // Foto de Perfil
  // =============================================

  /**
   * Obtiene la foto de perfil del usuario actual
   */
  async getMyPhoto(): Promise<ProfilePhotoResponse> {
    const response = await fetch(`${API_URL}/api/auth/me/photo`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ProfilePhotoResponse>(response);
  },

  /**
   * Sube la foto de perfil del usuario actual
   */
  async uploadMyPhoto(file: File): Promise<ProfilePhotoSyncResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/auth/me/photo/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleResponse<ProfilePhotoSyncResponse>(response);
  },

  /**
   * Sube la foto de perfil de un usuario específico
   */
  async uploadUserPhoto(userId: string, file: File): Promise<ProfilePhotoSyncResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/auth/users/${userId}/photo/upload`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
      body: formData,
    });
    return handleResponse<ProfilePhotoSyncResponse>(response);
  },

  /**
   * Elimina la foto de perfil del usuario actual
   */
  async deleteMyPhoto(): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/auth/me/photo`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  /**
   * Elimina la foto de perfil de un usuario específico
   */
  async deleteUserPhoto(userId: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/auth/users/${userId}/photo`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
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
// Los permisos ahora se manejan solo mediante grupos de seguridad

export interface AvailableViewsDto {
  views: ViewInfo[];
  roles: string[]; // Deprecado - ya no se usan roles para permisos
}

export interface ViewInfo {
  viewName: string;
  displayName: string;
  description: string;
  category: string;
}

export const permissionsApi = {
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

// ==================== ADMIN ASSIGNMENTS API ====================

export interface UserAuthorizationInfoDto {
  userId: string;
  role: string;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isReader: boolean;
  canCreateUsers: boolean;
  canDeleteUsers: boolean;
  canCreateGroups: boolean;
  manageableGroupIds: number[];
  permissions: string[];
}

export interface AssignedGroupDto {
  assignmentId: number;
  groupId: number;
  groupName: string;
  groupColor?: string;
  groupIcon?: string;
  memberCount: number;
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManagePermissions: boolean;
}

export interface UserAdminAssignmentsDto {
  userId: string;
  userDisplayName: string;
  userRole?: string;
  assignedGroups: AssignedGroupDto[];
}

export interface GroupAdminDto {
  assignmentId: number;
  userId: string;
  userDisplayName: string;
  userEmail?: string;
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManagePermissions: boolean;
  assignedByDisplayName?: string;
  createdAt: string;
}

export interface GroupAdminsDto {
  groupId: number;
  groupName: string;
  admins: GroupAdminDto[];
}

export interface GroupAssignmentRequest {
  groupId: number;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageMembers?: boolean;
  canManagePermissions?: boolean;
}

export interface AdminAssignmentRequest {
  userId: string;
  canEdit?: boolean;
  canDelete?: boolean;
  canManageMembers?: boolean;
  canManagePermissions?: boolean;
}

export interface AvailableAdminDto {
  userId: string;
  displayName: string;
  email?: string;
  role: string;
  isAlreadyAssigned: boolean;
}

export interface AvailableGroupForAssignmentDto {
  groupId: number;
  groupName: string;
  groupColor?: string;
  groupIcon?: string;
  isAlreadyAssigned: boolean;
}

export interface GroupPermissionsCheckDto {
  canManage: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManagePermissions: boolean;
}

export const adminAssignmentsApi = {
  // Información de autorización del usuario actual
  async getMyAuthorization(): Promise<UserAuthorizationInfoDto> {
    const response = await fetch(`${API_URL}/api/admin-assignments/my-authorization`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<UserAuthorizationInfoDto>(response);
  },

  // Asignaciones por usuario
  async getUserAssignments(userId: string): Promise<UserAdminAssignmentsDto> {
    const response = await fetch(`${API_URL}/api/admin-assignments/user/${userId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<UserAdminAssignmentsDto>(response);
  },

  async updateUserAssignments(userId: string, assignments: GroupAssignmentRequest[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin-assignments/user/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ assignments }),
    });
    return handleResponse<void>(response);
  },

  async addGroupToUser(userId: string, groupId: number, permissions?: Partial<GroupAssignmentRequest>): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin-assignments/user/${userId}/group/${groupId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(permissions || {}),
    });
    return handleResponse<void>(response);
  },

  async removeGroupFromUser(userId: string, groupId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin-assignments/user/${userId}/group/${groupId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader(),
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al remover asignación' }));
      throw new Error(error.message);
    }
  },

  // Asignaciones por grupo
  async getGroupAdmins(groupId: number): Promise<GroupAdminsDto> {
    const response = await fetch(`${API_URL}/api/admin-assignments/group/${groupId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<GroupAdminsDto>(response);
  },

  async updateGroupAdmins(groupId: number, admins: AdminAssignmentRequest[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin-assignments/group/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ admins }),
    });
    return handleResponse<void>(response);
  },

  // Usuarios/grupos disponibles
  async getAvailableAdminsForGroup(groupId: number): Promise<AvailableAdminDto[]> {
    const response = await fetch(`${API_URL}/api/admin-assignments/group/${groupId}/available-admins`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<AvailableAdminDto[]>(response);
  },

  async getAvailableGroupsForUser(userId: string): Promise<AvailableGroupForAssignmentDto[]> {
    const response = await fetch(`${API_URL}/api/admin-assignments/user/${userId}/available-groups`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<AvailableGroupForAssignmentDto[]>(response);
  },

  // Verificaciones de permisos
  async canManageGroup(groupId: number): Promise<GroupPermissionsCheckDto> {
    const response = await fetch(`${API_URL}/api/admin-assignments/can-manage-group/${groupId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<GroupPermissionsCheckDto>(response);
  },

  async canModifyUser(targetUserId: string): Promise<{ canModify: boolean }> {
    const response = await fetch(`${API_URL}/api/admin-assignments/can-modify-user/${targetUserId}`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<{ canModify: boolean }>(response);
  },
};

// ==================== ADMIN ROLES API ====================

export interface AdminRoleDto {
  id: number;
  name: string;
  description?: string;
  color: string;
  icon: string;
  priority: number;
  isSystem: boolean;
  isActive: boolean;
  usersCount: number;
  enabledCapabilities: string[];
  assignableRoleIds: number[];
  createdAt?: string;
  updatedAt?: string;
  createdByUserName?: string;
}

export interface AdminRoleSimpleDto {
  id: number;
  name: string;
  color: string;
  icon: string;
  priority: number;
}

export interface CreateAdminRoleRequest {
  name: string;
  description?: string;
  color: string;
  icon: string;
  priority: number;
  enabledCapabilities: string[];
  assignableRoleIds: number[];
}

export interface UpdateAdminRoleRequest {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  priority?: number;
  isActive?: boolean;
  enabledCapabilities?: string[];
  assignableRoleIds?: number[];
}

export interface CapabilityDto {
  key: string;
  name: string;
  description: string;
  category: string;
  isEnabled: boolean;
}

export interface CapabilityCategoryDto {
  category: string;
  capabilities: CapabilityDto[];
}

export interface UserAuthorizationDto {
  userId: string;
  roleId?: number;
  roleName: string;
  roleColor: string;
  roleIcon: string;
  rolePriority: number;
  capabilities: string[];
  assignableRoles: AdminRoleDto[];
  manageableGroupIds: number[];
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isReader: boolean;
  canCreateUsers: boolean;
  canDeleteUsers: boolean;
  canCreateGroups: boolean;
}

export const adminRolesApi = {
  // Obtener todos los roles
  async getRoles(): Promise<AdminRoleDto[]> {
    const response = await fetch(`${API_URL}/api/admin/roles`, {
      headers: getAuthHeader(),
    });
    return handleResponse<AdminRoleDto[]>(response);
  },

  // Obtener un rol por ID
  async getRole(id: number): Promise<AdminRoleDto> {
    const response = await fetch(`${API_URL}/api/admin/roles/${id}`, {
      headers: getAuthHeader(),
    });
    return handleResponse<AdminRoleDto>(response);
  },

  // Obtener roles que el usuario actual puede asignar
  async getAssignableRoles(): Promise<AdminRoleSimpleDto[]> {
    const response = await fetch(`${API_URL}/api/admin/roles/assignable`, {
      headers: getAuthHeader(),
    });
    return handleResponse<AdminRoleSimpleDto[]>(response);
  },

  // Obtener todas las capacidades disponibles
  async getCapabilities(): Promise<CapabilityCategoryDto[]> {
    const response = await fetch(`${API_URL}/api/admin/roles/capabilities`, {
      headers: getAuthHeader(),
    });
    return handleResponse<CapabilityCategoryDto[]>(response);
  },

  // Crear un nuevo rol
  async createRole(request: CreateAdminRoleRequest): Promise<AdminRoleDto> {
    const response = await fetch(`${API_URL}/api/admin/roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<AdminRoleDto>(response);
  },

  // Actualizar un rol
  async updateRole(id: number, request: UpdateAdminRoleRequest): Promise<AdminRoleDto> {
    const response = await fetch(`${API_URL}/api/admin/roles/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<AdminRoleDto>(response);
  },

  // Eliminar un rol
  async deleteRole(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/admin/roles/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader(),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al eliminar rol' }));
      throw new Error(error.message);
    }
  },

  // Obtener información de autorización del usuario actual
  async getMyAuthorization(): Promise<UserAuthorizationDto> {
    const response = await fetch(`${API_URL}/api/admin/roles/my-authorization`, {
      headers: getAuthHeader(),
    });
    return handleResponse<UserAuthorizationDto>(response);
  },

  // Obtener usuarios de un rol
  async getRoleUsers(roleId: number): Promise<{ id: string; userName: string; displayName: string; email?: string; isActive: boolean }[]> {
    const response = await fetch(`${API_URL}/api/admin/roles/${roleId}/users`, {
      headers: getAuthHeader(),
    });
    return handleResponse<{ id: string; userName: string; displayName: string; email?: string; isActive: boolean }[]>(response);
  },
};

// ==================== MENU BADGES API ====================

export interface MenuBadgeDto {
  menuKey: string;
  displayName: string;
  isNew: boolean;
  badgeText: string;
  badgeColor: string;
  category: string;
}

export interface UpdateMenuBadgeRequest {
  menuKey: string;
  isNew: boolean;
  badgeText?: string;
  badgeColor?: string;
}

export const menuBadgesApi = {
  async getAllBadges(): Promise<MenuBadgeDto[]> {
    const response = await fetch(`${API_URL}/api/menubadges`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<MenuBadgeDto[]>(response);
  },

  async updateBadge(menuKey: string, request: UpdateMenuBadgeRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/menubadges/${menuKey}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<void>(response);
  },

  async updateAllBadges(requests: UpdateMenuBadgeRequest[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/menubadges`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(requests),
    });
    return handleResponse<void>(response);
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

  // Scores por categoria (cada uno sobre 100) - 12 CATEGORIAS
  // TAB 1: Availability & DR (35%)
  score_Backups?: number;           // 18%
  score_AlwaysOn?: number;          // 14%
  score_DatabaseStates?: number;    // 3%

  // TAB 2: Performance (43%)
  score_CPU?: number;               // 10%
  score_Memoria?: number;           // 8%
  score_IO?: number;                // 10%
  score_Discos?: number;            // 7%
  score_Waits?: number;             // 8%

  // TAB 3: Maintenance & Config (22%)
  score_ErroresCriticos?: number;   // 7%
  score_Maintenance?: number;       // 5%
  score_ConfiguracionTempdb?: number; // 5%
  score_Autogrowth?: number;        // 5%

  // Diagnostico Inteligente de I/O para TempDB (v3.1)
  tempDBIODiagnosis?: string;
  tempDBIOSuggestion?: string;
  tempDBIOSeverity?: string;

  // Contribuciones ponderadas (0-peso maximo)
  // TAB 1: Availability & DR
  backupsContribution?: number;           // Max: 18
  alwaysOnContribution?: number;          // Max: 14
  databaseStatesContribution?: number;    // Max: 3

  // TAB 2: Performance
  cpuContribution?: number;               // Max: 10
  memoriaContribution?: number;           // Max: 8
  ioContribution?: number;                // Max: 10
  discosContribution?: number;            // Max: 7
  waitsContribution?: number;             // Max: 8

  // TAB 3: Maintenance & Config
  erroresCriticosContribution?: number;   // Max: 7
  mantenimientosContribution?: number;    // Max: 5
  configuracionTempdbContribution?: number; // Max: 5
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

// ==================== OVERVIEW DATA API (OPTIMIZADO) ====================

// DTOs para el endpoint optimizado /api/overview-data
export interface OverviewDataOptimizedDto {
  // KPIs
  totalInstances: number;
  healthyCount: number;
  warningCount: number;
  riskCount: number;
  criticalCount: number;
  avgScore: number;
  backupsOverdue: number;
  criticalDisksCount: number;
  maintenanceOverdueCount: number;

  // Listas para tablas
  criticalInstances: OverviewCriticalInstanceDto[];
  backupIssues: OverviewBackupIssueDto[];
  criticalDisks: OverviewCriticalDiskDto[];
  maintenanceOverdue: OverviewMaintenanceOverdueDto[];

  // Timestamp
  lastUpdate?: string;
}

export interface OverviewCriticalInstanceDto {
  instanceName: string;
  ambiente?: string;
  healthScore: number;
  issues: string[];
  score_Backups?: number;
  score_AlwaysOn?: number;
  score_CPU?: number;
  score_Memoria?: number;
  score_Discos?: number;
  score_Maintenance?: number;
}

export interface OverviewBackupIssueDto {
  instanceName: string;
  score: number;
  issues: string[];
  // Campos detallados de breach
  fullBackupBreached: boolean;
  logBackupBreached: boolean;
  lastFullBackup?: string;
  lastLogBackup?: string;
  breachedDatabases: string[];
}

export interface OverviewCriticalDiskDto {
  instanceName: string;
  drive: string;
  porcentajeLibre: number;
  realPorcentajeLibre: number;
  libreGB: number;
  realLibreGB: number;
  espacioInternoEnArchivosGB: number;
  estado: string;
}

export interface OverviewMaintenanceOverdueDto {
  instanceName: string;
  displayName: string;
  tipo: string;
  lastCheckdb?: string;
  lastIndexOptimize?: string;
  checkdbVencido: boolean;
  indexOptimizeVencido: boolean;
  agName?: string;
}

/**
 * API optimizada para la página Overview
 * Obtiene todos los datos en una sola llamada
 */
export const overviewApi = {
  /**
   * Obtiene todos los datos del Overview en una sola llamada
   * Solo incluye datos de PRODUCCIÓN
   */
  async getOverviewData(): Promise<OverviewDataOptimizedDto> {
    const response = await fetch(`${API_URL}/api/overview-data`, {
      headers: {
        ...getAuthHeader(),
      },
    });
    return handleResponse<OverviewDataOptimizedDto>(response);
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
  profilePhotoUrl?: string | null;
  colorCode?: string;
  phoneNumber?: string;
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
  phoneNumber?: string;
  colorCode?: string;
  weekStartDate: string;
  weekEndDate: string;
  weekNumber: number;
  isCurrentlyOnCall: boolean;
  escalationUsers: EscalationUserDto[];
}

export interface EscalationUserDto {
  id: number;
  userId: string;
  domainUser: string;
  displayName: string;
  email?: string;
  order: number;
  colorCode?: string;
  phoneNumber?: string;
}

export interface WhitelistUserDto {
  id: string;
  domainUser: string;
  displayName: string;
  email?: string;
  isOperator: boolean;
  isEscalation: boolean;
  profilePhotoUrl?: string | null;
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

// ==================== CONFIG DTOs ====================

export interface OnCallConfigDto {
  requiresApproval: boolean;
  approverId?: string;
  approverDisplayName?: string;
  approverGroupId?: number;
  approverGroupName?: string;
  /** Días mínimos de anticipación para que operadores soliciten intercambios */
  minDaysForSwapRequest: number;
  /** Días mínimos de anticipación para que escalamiento modifique guardias */
  minDaysForEscalationModify: number;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface UpdateOnCallConfigRequest {
  requiresApproval: boolean;
  approverId?: string;
  approverGroupId?: number;
  /** Días mínimos de anticipación para que operadores soliciten intercambios */
  minDaysForSwapRequest: number;
  /** Días mínimos de anticipación para que escalamiento modifique guardias */
  minDaysForEscalationModify: number;
}

// ==================== HOLIDAY DTOs ====================

export interface OnCallHolidayDto {
  id: number;
  date: string;
  name: string;
  isRecurring: boolean;
  createdAt: string;
  createdByDisplayName?: string;
}

export interface CreateHolidayRequest {
  date: string;
  name: string;
  isRecurring: boolean;
}

export interface OnCallDayOverrideDto {
  id: number;
  date: string;
  originalUserId: string;
  originalDisplayName: string;
  coverUserId: string;
  coverDisplayName: string;
  coverPhoneNumber?: string;
  coverColorCode?: string;
  reason?: string;
  createdAt: string;
  createdByDisplayName: string;
  isActive: boolean;
}

export interface CreateDayOverrideRequest {
  date: string;
  coverUserId: string;
  reason?: string;
}

export interface UpdateHolidayRequest {
  date: string;
  name: string;
  isRecurring: boolean;
}

export const onCallApi = {
  // Operators
  async getOperators(): Promise<OnCallOperatorDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/operators`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallOperatorDto[]>(response);
  },

  async addOperator(userId: string, colorCode?: string, phoneNumber?: string): Promise<OnCallOperatorDto> {
    const response = await fetch(`${API_URL}/api/oncall/operators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userId, colorCode, phoneNumber }),
    });
    return handleResponse<OnCallOperatorDto>(response);
  },

  async updateOperatorColor(id: number, colorCode: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/operators/${id}/color`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ colorCode }),
    });
    return handleResponse<{ message: string }>(response);
  },

  async updateOperatorPhone(id: number, phoneNumber?: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/operators/${id}/phone`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ phoneNumber }),
    });
    return handleResponse<{ message: string }>(response);
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

  async getUserSchedules(userId: string): Promise<OnCallScheduleDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/schedule/user/${userId}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallScheduleDto[]>(response);
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

  async addEscalationUser(userId: string, colorCode?: string, phoneNumber?: string): Promise<EscalationUserDto> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ userId, colorCode, phoneNumber }),
    });
    return handleResponse<EscalationUserDto>(response);
  },

  async updateEscalationUser(id: number, colorCode?: string, phoneNumber?: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/escalation-users/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ colorCode, phoneNumber }),
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

  // Configuration
  async getConfig(): Promise<OnCallConfigDto> {
    const response = await fetch(`${API_URL}/api/oncall/config`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallConfigDto>(response);
  },

  async updateConfig(data: UpdateOnCallConfigRequest): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string }>(response);
  },

  // Holidays
  async getHolidays(): Promise<OnCallHolidayDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/holidays`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallHolidayDto[]>(response);
  },

  async createHoliday(data: CreateHolidayRequest): Promise<OnCallHolidayDto> {
    const response = await fetch(`${API_URL}/api/oncall/holidays`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallHolidayDto>(response);
  },

  async updateHoliday(id: number, data: UpdateHolidayRequest): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/holidays/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<{ message: string }>(response);
  },

  async deleteHoliday(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/holidays/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  // Day Overrides (Coberturas por día - solo Team Escalamiento)
  async getDayOverrides(startDate?: string, endDate?: string): Promise<OnCallDayOverrideDto[]> {
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const url = `${API_URL}/api/oncall/day-overrides${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallDayOverrideDto[]>(response);
  },

  async createDayOverride(data: CreateDayOverrideRequest): Promise<OnCallDayOverrideDto> {
    const response = await fetch(`${API_URL}/api/oncall/day-overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallDayOverrideDto>(response);
  },

  async deleteDayOverride(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/day-overrides/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  // Schedule Batches (Aprobación de calendarios)
  async getPendingBatches(): Promise<OnCallScheduleBatchDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/batches/pending`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallScheduleBatchDto[]>(response);
  },

  async approveBatch(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/batches/${id}/approve`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async rejectBatch(id: number, reason: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/batches/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ reason }),
    });
    return handleResponse<{ message: string }>(response);
  },
};

// ==================== SCHEDULE BATCH DTO ====================

export interface OnCallScheduleBatchDto {
  id: number;
  startDate: string;
  endDate: string;
  weeksGenerated: number;
  status: 'PendingApproval' | 'Approved' | 'Rejected';
  generatedByDisplayName: string;
  generatedAt: string;
  approverDisplayName?: string;
  approvedAt?: string;
  approvedByDisplayName?: string;
  rejectionReason?: string;
}

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
  serviceDeskUrl?: string;
  status: 'Pending' | 'Resolved';
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
  serviceDeskUrl?: string;
  status?: 'Pending' | 'Resolved';
}

export interface UpdateActivationRequest {
  activatedAt?: string;
  resolvedAt?: string;
  durationMinutes?: number;
  category?: string;
  severity?: string;
  title?: string;
  description?: string;
  resolution?: string;
  instanceName?: string;
  serviceDeskUrl?: string;
  status?: 'Pending' | 'Resolved';
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

// Categorías por defecto (fallback si no se cargan desde el backend)
export const defaultActivationCategories = ['Backups', 'Conectividad', 'Rendimiento', 'Espacio en Disco', 'Seguridad', 'Otro'];
export const activationCategories = defaultActivationCategories; // Para compatibilidad
export const activationSeverities = ['Low', 'Medium', 'High', 'Critical'];

// ==================== ACTIVATION CATEGORIES API ====================

export interface ActivationCategoryDto {
  id: number;
  name: string;
  icon?: string;
  isDefault: boolean;
  isActive: boolean;
  order: number;
  createdAt: string;
  createdByDisplayName?: string;
}

export interface CreateActivationCategoryRequest {
  name: string;
  icon?: string;
}

export interface UpdateActivationCategoryRequest {
  name: string;
  icon?: string;
  isActive: boolean;
}

export const activationCategoriesApi = {
  async getAll(): Promise<ActivationCategoryDto[]> {
    const response = await fetch(`${API_URL}/api/activations/categories`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ActivationCategoryDto[]>(response);
  },

  async getActive(): Promise<ActivationCategoryDto[]> {
    const categories = await this.getAll();
    return categories.filter(c => c.isActive).sort((a, b) => a.order - b.order);
  },

  async create(data: CreateActivationCategoryRequest): Promise<ActivationCategoryDto> {
    const response = await fetch(`${API_URL}/api/activations/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<ActivationCategoryDto>(response);
  },

  async update(id: number, data: UpdateActivationCategoryRequest): Promise<ActivationCategoryDto> {
    const response = await fetch(`${API_URL}/api/activations/categories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<ActivationCategoryDto>(response);
  },

  async delete(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/activations/categories/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async reorder(categoryIds: number[]): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/activations/categories/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ categoryIds }),
    });
    return handleResponse<{ message: string }>(response);
  },
};

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
  attachExcel: boolean;
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
  attachExcel?: boolean;
  recipients: { email: string; name?: string }[];
}

export interface UpdateAlertRuleRequest {
  name?: string;
  description?: string;
  conditionDays?: number;
  isEnabled?: boolean;
  attachExcel?: boolean;
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

// ==================== EMAIL TEMPLATES API ====================

export interface OnCallEmailTemplateDto {
  id: number;
  alertType: string;
  name: string;
  subject: string;
  body: string;
  attachExcel: boolean;
  isEnabled: boolean;
  isDefault: boolean;
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleDescription?: string;
  recipients?: string;
  createdAt: string;
  createdByDisplayName?: string;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface CreateEmailTemplateRequest {
  alertType: string;
  name: string;
  subject: string;
  body: string;
  attachExcel: boolean;
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleDescription?: string;
  recipients?: string;
  isEnabled?: boolean;
}

export interface UpdateEmailTemplateRequest {
  name: string;
  subject: string;
  body: string;
  attachExcel: boolean;
  isEnabled: boolean;
  isScheduled: boolean;
  scheduleCron?: string;
  scheduleDescription?: string;
  recipients?: string;
}

export interface PlaceholderDto {
  key: string;
  description: string;
  example: string;
}

export interface EmailTemplatePlaceholderInfo {
  alertType: string;
  alertTypeName: string;
  placeholders: PlaceholderDto[];
}

export const emailTemplatesApi = {
  async getAll(): Promise<OnCallEmailTemplateDto[]> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallEmailTemplateDto[]>(response);
  },

  async getById(id: number): Promise<OnCallEmailTemplateDto> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OnCallEmailTemplateDto>(response);
  },

  async getPlaceholders(): Promise<EmailTemplatePlaceholderInfo[]> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates/placeholders`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<EmailTemplatePlaceholderInfo[]>(response);
  },

  async create(data: CreateEmailTemplateRequest): Promise<OnCallEmailTemplateDto> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallEmailTemplateDto>(response);
  },

  async update(id: number, data: UpdateEmailTemplateRequest): Promise<OnCallEmailTemplateDto> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OnCallEmailTemplateDto>(response);
  },

  async delete(id: number): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/email-templates/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async sendWeeklyNotification(): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/notifications/weekly/send`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async sendPreWeekNotification(): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/notifications/preweek/send`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ message: string }>(response);
  },

  async sendTestEmail(templateId: number, testEmail: string): Promise<{ message: string }> {
    const response = await fetch(`${API_URL}/api/oncall/notifications/test/${templateId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ testEmail }),
    });
    return handleResponse<{ message: string }>(response);
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

  async getSqlServerInstances(
    page: number = 1,
    pageSize: number = 1000,
    search?: string,
    ambiente?: string
  ): Promise<SqlServerInstancesResponse> {
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('pageSize', pageSize.toString());
    if (search) params.append('search', search);
    if (ambiente) params.append('ambiente', ambiente);

    const response = await fetch(`${API_URL}/api/inventoryproxy/sqlserver/instances?${params.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SqlServerInstancesResponse>(response);
  },

  async refreshSqlServerInstances(): Promise<SqlServerInstancesResponse> {
    const response = await fetch(`${API_URL}/api/inventoryproxy/sqlserver/instances/refresh`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SqlServerInstancesResponse>(response);
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

// ==================== OVERVIEW SUMMARY ALERTS API ====================

export interface OverviewSummaryAlertConfigDto {
  id: number;
  name: string;
  description?: string;
  isEnabled: boolean;
  recipients: string[];
  includeOnlyProduction: boolean;
  schedules: OverviewSummaryAlertScheduleDto[];
  createdAt: string;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface OverviewSummaryAlertScheduleDto {
  id: number;
  configId: number;
  timeOfDay: string; // formato "HH:mm"
  isEnabled: boolean;
  daysOfWeek: number[]; // 0=Domingo, 1=Lunes, ..., 6=Sábado
  lastSentAt?: string;
  createdAt: string;
}

export interface UpdateOverviewSummaryAlertConfigRequest {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  recipients?: string[];
  includeOnlyProduction?: boolean;
}

export interface CreateOverviewSummaryAlertScheduleRequest {
  timeOfDay: string;
  isEnabled?: boolean;
  daysOfWeek: number[];
}

export interface UpdateOverviewSummaryAlertScheduleRequest {
  timeOfDay?: string;
  isEnabled?: boolean;
  daysOfWeek?: number[];
}

export interface OverviewSummaryAlertHistoryDto {
  id: number;
  configId: number;
  scheduleId?: number;
  scheduleTime?: string;
  sentAt: string;
  recipientCount: number;
  success: boolean;
  errorMessage?: string;
  triggerType: string; // Scheduled, Manual, Test
  summaryData?: OverviewSummaryDataDto;
}

export interface OverviewSummaryDataDto {
  totalInstances: number;
  healthyCount: number;
  warningCount: number;
  riskCount: number;
  criticalCount: number;
  averageHealthScore: number;
  backupsOverdue: number;
  criticalDisks: number;
  maintenanceOverdue: number;
  criticalInstances: CriticalInstanceSummary[];
  backupIssues: BackupIssueSummary[];
  criticalDisksList: CriticalDiskSummary[];
  maintenanceOverdueList: MaintenanceOverdueSummary[];
  generatedAt: string;
}

export interface CriticalInstanceSummary {
  instanceName: string;
  healthScore: number;
  issues: string[];
}

export interface BackupIssueSummary {
  instanceName: string;
  score: number;
  issues: string[];
}

export interface CriticalDiskSummary {
  instanceName: string;
  drive: string;
  realPorcentajeLibre: number;
  realLibreGB: number;
}

export interface MaintenanceOverdueSummary {
  instanceName: string;
  displayName: string;
  tipo: string;
  agName?: string;
}

export interface OverviewSummaryAlertResult {
  success: boolean;
  message: string;
}

export const overviewSummaryAlertsApi = {
  async getConfig(): Promise<OverviewSummaryAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/overview-alerts/config`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewSummaryAlertConfigDto>(response);
  },

  async updateConfig(data: UpdateOverviewSummaryAlertConfigRequest): Promise<OverviewSummaryAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/overview-alerts/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OverviewSummaryAlertConfigDto>(response);
  },

  async addSchedule(data: CreateOverviewSummaryAlertScheduleRequest): Promise<OverviewSummaryAlertScheduleDto> {
    const response = await fetch(`${API_URL}/api/overview-alerts/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OverviewSummaryAlertScheduleDto>(response);
  },

  async updateSchedule(id: number, data: UpdateOverviewSummaryAlertScheduleRequest): Promise<OverviewSummaryAlertScheduleDto> {
    const response = await fetch(`${API_URL}/api/overview-alerts/schedules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse<OverviewSummaryAlertScheduleDto>(response);
  },

  async deleteSchedule(id: number): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/overview-alerts/schedules/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },

  async getHistory(limit: number = 20): Promise<OverviewSummaryAlertHistoryDto[]> {
    const response = await fetch(`${API_URL}/api/overview-alerts/history?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewSummaryAlertHistoryDto[]>(response);
  },

  async getPreview(): Promise<OverviewSummaryDataDto> {
    const response = await fetch(`${API_URL}/api/overview-alerts/preview`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewSummaryDataDto>(response);
  },

  async sendTestEmail(): Promise<OverviewSummaryAlertResult> {
    const response = await fetch(`${API_URL}/api/overview-alerts/test`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewSummaryAlertResult>(response);
  },

  async runNow(): Promise<OverviewSummaryAlertResult> {
    const response = await fetch(`${API_URL}/api/overview-alerts/run`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewSummaryAlertResult>(response);
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

// ==================== PATCHING API ====================

export interface ServerPatchStatusDto {
  serverName: string;
  instanceName: string;
  ambiente: string;
  hostingSite: string;
  majorVersion: string;
  currentBuild: string;
  currentCU: string;
  currentSP: string;
  kbReference: string;
  requiredBuild: string;
  requiredCU: string;
  latestBuild: string;
  latestCU: string;
  latestKBReference: string;
  pendingCUsForCompliance: number;
  pendingCUsForLatest: number;
  patchStatus: 'Updated' | 'Compliant' | 'NonCompliant' | 'Outdated' | 'Critical' | 'Error' | 'Unknown';
  connectionSuccess: boolean;
  isDmzServer: boolean;
  errorMessage?: string;
  lastChecked?: string;
}

export interface PatchComplianceConfigDto {
  id: number;
  complianceYear: number;
  sqlVersion: string;
  requiredBuild: string;
  requiredCU?: string;
  requiredKB?: string;
  description?: string;
  // Configuración específica para AWS (solo aplica para SQL 2017+)
  awsRequiredBuild?: string;
  awsRequiredCU?: string;
  awsRequiredKB?: string;
  isActive: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface BuildReferenceDto {
  version: string;
  cu?: string;
  sp?: string;
  kb?: string;
  displayName: string;
}

export interface PatchingSummaryDto {
  totalServers: number;
  updatedCount: number;
  compliantCount: number;
  nonCompliantCount: number;
  outdatedCount: number;
  criticalCount: number;
  errorCount: number;
  unknownCount: number;
  totalPendingCUs: number;
  complianceRate: number;
  lastChecked: string;
}

export const patchingApi = {
  // Estado de parcheo
  async getStatus(forceRefresh = false, year?: number): Promise<ServerPatchStatusDto[]> {
    const params = new URLSearchParams();
    if (forceRefresh) params.append('forceRefresh', 'true');
    if (year) params.append('year', year.toString());
    const url = `${API_URL}/api/patching/status${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ServerPatchStatusDto[]>(response);
  },

  async getServerStatus(instanceName: string): Promise<ServerPatchStatusDto> {
    const response = await fetch(
      `${API_URL}/api/patching/status/${encodeURIComponent(instanceName)}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<ServerPatchStatusDto>(response);
  },

  async refreshCache(): Promise<void> {
    const response = await fetch(`${API_URL}/api/patching/refresh`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  async getSummary(): Promise<PatchingSummaryDto> {
    const response = await fetch(`${API_URL}/api/patching/summary`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchingSummaryDto>(response);
  },

  // Años de compliance disponibles
  async getComplianceYears(): Promise<number[]> {
    const response = await fetch(`${API_URL}/api/patching/compliance/years`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<number[]>(response);
  },

  // Configuración de compliance
  async getComplianceConfigs(year?: number): Promise<PatchComplianceConfigDto[]> {
    const url = year
      ? `${API_URL}/api/patching/compliance?year=${year}`
      : `${API_URL}/api/patching/compliance`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchComplianceConfigDto[]>(response);
  },

  async saveComplianceConfig(config: PatchComplianceConfigDto): Promise<PatchComplianceConfigDto> {
    const response = await fetch(`${API_URL}/api/patching/compliance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(config),
    });
    return handleResponse<PatchComplianceConfigDto>(response);
  },

  async deleteComplianceConfig(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/patching/compliance/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Referencias de builds
  async getAvailableBuilds(sqlVersion: string): Promise<BuildReferenceDto[]> {
    const response = await fetch(
      `${API_URL}/api/patching/builds/${encodeURIComponent(sqlVersion)}`,
      { headers: { ...getAuthHeader() } }
    );
    return handleResponse<BuildReferenceDto[]>(response);
  },

  async getSupportedVersions(): Promise<string[]> {
    const response = await fetch(`${API_URL}/api/patching/versions`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<string[]>(response);
  },
};

// ==================== PATCH PLAN API ====================

// Tipos del Planner de Parcheos
export interface PatchPlanDto {
  id: number;
  serverName: string;
  instanceName?: string;
  currentVersion: string;
  targetVersion: string;
  isCoordinated: boolean;
  productOwnerNote?: string;
  scheduledDate: string;
  windowStartTime: string;
  windowEndTime: string;
  assignedDbaId?: string;
  assignedDbaName?: string;
  wasPatched?: boolean;
  status: string;
  patchedAt?: string;
  patchedByUserName?: string;
  notes?: string;
  createdAt: string;
  createdByUserName?: string;
  updatedAt?: string;
  // Nuevos campos
  patchMode: string;
  coordinationOwnerId?: string;
  coordinationOwnerName?: string;
  coordinationOwnerEmail?: string;
  cellTeam?: string;
  estimatedDuration?: number;
  priority?: string;
  clusterName?: string;
  isAlwaysOn: boolean;
  ambiente?: string;
  contactedAt?: string;
  responseReceivedAt?: string;
  rescheduledCount: number;
  waiverReason?: string;
}

export interface CreatePatchPlanRequest {
  serverName: string;
  instanceName?: string;
  currentVersion: string;
  targetVersion: string;
  isCoordinated: boolean;
  productOwnerNote?: string;
  scheduledDate: string;
  windowStartTime: string;
  windowEndTime: string;
  assignedDbaId?: string;
  notes?: string;
  // Nuevos campos
  status?: string;
  patchMode?: string;
  coordinationOwnerId?: string;
  coordinationOwnerName?: string;
  coordinationOwnerEmail?: string;
  cellTeam?: string;
  estimatedDuration?: number;
  priority?: string;
  clusterName?: string;
  isAlwaysOn?: boolean;
  ambiente?: string;
}

export interface UpdatePatchPlanRequest {
  serverName?: string;
  instanceName?: string;
  currentVersion?: string;
  targetVersion?: string;
  isCoordinated?: boolean;
  productOwnerNote?: string;
  scheduledDate?: string;
  windowStartTime?: string;
  windowEndTime?: string;
  assignedDbaId?: string;
  wasPatched?: boolean;
  notes?: string;
  // Nuevos campos
  status?: string;
  patchMode?: string;
  coordinationOwnerId?: string;
  coordinationOwnerName?: string;
  coordinationOwnerEmail?: string;
  cellTeam?: string;
  estimatedDuration?: number;
  priority?: string;
  clusterName?: string;
  isAlwaysOn?: boolean;
  ambiente?: string;
  waiverReason?: string;
}

export interface MarkPatchStatusRequest {
  wasPatched: boolean;
  notes?: string;
}

export interface AvailableDbaDto {
  id: string;
  displayName: string;
  email?: string;
  domainUser?: string;
}

export interface PatchPlanFilterParams {
  fromDate?: string;
  toDate?: string;
  assignedDbaId?: string;
  status?: string;
  serverName?: string;
  cellTeam?: string;
  ambiente?: string;
  priority?: string;
  patchMode?: string;
}

export interface ReschedulePatchPlanRequest {
  newScheduledDate: string;
  newWindowStartTime?: string;
  newWindowEndTime?: string;
  reason?: string;
}

export interface PatchCalendarDto {
  id: number;
  serverName: string;
  instanceName?: string;
  status: string;
  priority?: string;
  cellTeam?: string;
  ambiente?: string;
  scheduledDate: string;
  windowStartTime: string;
  windowEndTime: string;
  assignedDbaName?: string;
  estimatedDuration?: number;
  isAlwaysOn: boolean;
  clusterName?: string;
}

export interface PatchDashboardStatsDto {
  totalPlans: number;
  completedPlans: number;
  pendingPlans: number;
  failedPlans: number;
  completionPercentage: number;
  delayedPlans: number;
  highPriorityPending: number;
  mediumPriorityPending: number;
  lowPriorityPending: number;
  cellStats: CellStatsDto[];
  inWindowExecutions: number;
  outOfWindowExecutions: number;
  averageLeadTimeDays: number;
}

export interface CellStatsDto {
  cellTeam: string;
  backlog: number;
  completed: number;
  rescheduled: number;
  waivers: number;
}

export interface SuggestedWindowDto {
  date: string;
  startTime: string;
  endTime: string;
  availableMinutes: number;
  reason: string;
  isRecommended: boolean;
}

export interface NonCompliantServerDto {
  serverName: string;
  instanceName?: string;
  ambiente?: string;
  majorVersion?: string;
  currentBuild?: string;
  currentCU?: string;
  requiredBuild?: string;
  requiredCU?: string;
  pendingCUsForCompliance: number;
  patchStatus: string;
  isAlwaysOn: boolean;
  clusterName?: string;
  lastChecked?: string;
}

// Constantes de estados y modos
export const PatchPlanStatus = {
  Planificado: 'Planificado',
  EnCoordinacion: 'EnCoordinacion',
  SinRespuesta: 'SinRespuesta',
  Aprobado: 'Aprobado',
  EnProceso: 'EnProceso',
  Parcheado: 'Parcheado',
  Fallido: 'Fallido',
  Cancelado: 'Cancelado',
  Reprogramado: 'Reprogramado',
} as const;

export const PatchModeType = {
  Manual: 'Manual',
  Automatico: 'Automatico',
  ManualNova: 'ManualNova',
} as const;

export const PatchPriority = {
  Alta: 'Alta',
  Media: 'Media',
  Baja: 'Baja',
} as const;

export const patchPlanApi = {
  // Obtener todos los planes (con filtros opcionales)
  async getAll(filters?: PatchPlanFilterParams): Promise<PatchPlanDto[]> {
    const params = new URLSearchParams();
    if (filters?.fromDate) params.append('fromDate', filters.fromDate);
    if (filters?.toDate) params.append('toDate', filters.toDate);
    if (filters?.assignedDbaId) params.append('assignedDbaId', filters.assignedDbaId);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.serverName) params.append('serverName', filters.serverName);
    if (filters?.cellTeam) params.append('cellTeam', filters.cellTeam);
    if (filters?.ambiente) params.append('ambiente', filters.ambiente);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.patchMode) params.append('patchMode', filters.patchMode);

    const url = `${API_URL}/api/patchplan${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchPlanDto[]>(response);
  },

  // Obtener plan por ID
  async getById(id: number): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Obtener DBAs disponibles (del grupo IDD General)
  async getAvailableDbas(): Promise<AvailableDbaDto[]> {
    const response = await fetch(`${API_URL}/api/patchplan/dbas`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<AvailableDbaDto[]>(response);
  },

  // Crear nuevo plan
  async create(data: CreatePatchPlanRequest): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Actualizar plan
  async update(id: number, data: UpdatePatchPlanRequest): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Eliminar plan
  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Marcar estado del parcheo (completado/fallido)
  async markStatus(id: number, data: MarkPatchStatusRequest): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Obtener servidores no-compliance
  async getNonCompliantServers(): Promise<NonCompliantServerDto[]> {
    const response = await fetch(`${API_URL}/api/patchplan/non-compliant-servers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<NonCompliantServerDto[]>(response);
  },

  // Sugerir ventanas disponibles
  async suggestWindow(serverName: string, durationMinutes?: number, fromDate?: string, maxSuggestions?: number): Promise<SuggestedWindowDto[]> {
    const params = new URLSearchParams({ serverName });
    if (durationMinutes) params.append('durationMinutes', durationMinutes.toString());
    if (fromDate) params.append('fromDate', fromDate);
    if (maxSuggestions) params.append('maxSuggestions', maxSuggestions.toString());

    const response = await fetch(`${API_URL}/api/patchplan/suggest-window?${params.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SuggestedWindowDto[]>(response);
  },

  // Obtener datos del calendario
  async getCalendarData(year: number, month: number): Promise<PatchCalendarDto[]> {
    const response = await fetch(`${API_URL}/api/patchplan/calendar/${year}/${month}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchCalendarDto[]>(response);
  },

  // Obtener planes por célula
  async getByCell(cellTeam: string): Promise<PatchPlanDto[]> {
    const response = await fetch(`${API_URL}/api/patchplan/by-cell/${encodeURIComponent(cellTeam)}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchPlanDto[]>(response);
  },

  // Obtener estadísticas del dashboard
  async getDashboardStats(): Promise<PatchDashboardStatsDto> {
    const response = await fetch(`${API_URL}/api/patchplan/dashboard-stats`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchDashboardStatsDto>(response);
  },

  // Reprogramar plan
  async reschedule(id: number, data: ReschedulePatchPlanRequest): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}/reschedule`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Actualizar solo el estado
  async updateStatus(id: number, newStatus: string): Promise<PatchPlanDto> {
    const response = await fetch(`${API_URL}/api/patchplan/${id}/update-status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(newStatus),
    });
    return handleResponse<PatchPlanDto>(response);
  },

  // Obtener células únicas
  async getCellTeams(): Promise<string[]> {
    const response = await fetch(`${API_URL}/api/patchplan/cell-teams`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<string[]>(response);
  },
};

// ==================== VAULT API ====================

// Tipos del Vault
export interface CredentialDto {
  id: number;
  name: string;
  credentialType: string;
  username: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
  groupId?: number;
  groupName?: string;
  groupColor?: string;
  ownerUserId: string;
  ownerDisplayName?: string;
  createdAt: string;
  updatedAt?: string;
  createdByDisplayName?: string;
  updatedByDisplayName?: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  servers: CredentialServerDto[];
}

export interface CredentialServerDto {
  id: number;
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
  createdAt: string;
  fullServerName: string;
}

export interface CreateCredentialRequest {
  name: string;
  credentialType: string;
  username: string;
  password: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
  groupId?: number;
  servers?: CreateCredentialServerRequest[];
}

export interface CreateCredentialServerRequest {
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
}

export interface UpdateCredentialRequest {
  name: string;
  credentialType: string;
  username: string;
  newPassword?: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
  groupId?: number;
}

export interface RevealPasswordResponse {
  password: string;
  expiresInSeconds: number;
}

export interface VaultStatsDto {
  totalCredentials: number;
  sharedCredentials: number;
  privateCredentials: number;
  expiringCredentials: number;
  expiredCredentials: number;
  sqlAuthCount: number;
  windowsAdCount: number;
  otherTypeCount: number;
  totalServersLinked: number;
  lastActivity?: string;
}

export interface CredentialAuditLogDto {
  id: number;
  credentialId: number;
  credentialName: string;
  action: string;
  changedFields?: string;
  performedByUserId: string;
  performedByUserName?: string;
  performedAt: string;
  ipAddress?: string;
}

export interface AvailableServerDto {
  serverName: string;
  instanceName?: string;
  environment?: string;
  hostingSite?: string;
  fullServerName: string;
  isAws: boolean;
  isDmz: boolean;
}

// Tipos de grupos
export interface CredentialGroupDto {
  id: number;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  ownerUserId: string;
  ownerUserName: string;
  createdAt: string;
  updatedAt?: string;
  credentialsCount: number;
  membersCount: number;
  members: CredentialGroupMemberDto[];
  userRole: string;
}

export interface CredentialGroupMemberDto {
  id: number;
  userId: string;
  userName: string;
  displayName?: string;
  email?: string;
  role: string;
  receiveNotifications: boolean;
  addedAt: string;
  addedByUserName?: string;
}

export interface CreateCredentialGroupRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  initialMembers?: AddGroupMemberRequest[];
}

export interface UpdateCredentialGroupRequest {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
}

export interface AddGroupMemberRequest {
  userId: string;
  role: string;
  receiveNotifications: boolean;
}

export interface UpdateGroupMemberRequest {
  role: string;
  receiveNotifications?: boolean;
}

export interface VaultUserDto {
  id: string;
  userName: string;
  displayName?: string;
  email?: string;
}

export interface CredentialFilterRequest {
  searchTerm?: string;
  credentialType?: string;
  serverName?: string;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  isPrivate?: boolean;
  groupId?: number;
  includeDeleted?: boolean;
  /** Si es true, solo devuelve credenciales donde el usuario es propietario */
  ownerOnly?: boolean;
}

// API del Vault
export const vaultApi = {
  // Credenciales
  async getCredentials(filter?: CredentialFilterRequest): Promise<CredentialDto[]> {
    const params = new URLSearchParams();
    if (filter?.searchTerm) params.append('searchTerm', filter.searchTerm);
    if (filter?.credentialType) params.append('credentialType', filter.credentialType);
    if (filter?.serverName) params.append('serverName', filter.serverName);
    if (filter?.isExpired !== undefined) params.append('isExpired', String(filter.isExpired));
    if (filter?.isExpiringSoon !== undefined) params.append('isExpiringSoon', String(filter.isExpiringSoon));
    if (filter?.isPrivate !== undefined) params.append('isPrivate', String(filter.isPrivate));
    if (filter?.groupId !== undefined) params.append('groupId', String(filter.groupId));
    if (filter?.includeDeleted) params.append('includeDeleted', 'true');

    const url = params.toString()
      ? `${API_URL}/api/vault/credentials?${params.toString()}`
      : `${API_URL}/api/vault/credentials`;

    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialDto[]>(response);
  },

  async getCredentialById(id: number): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialDto>(response);
  },

  async createCredential(request: CreateCredentialRequest): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialDto>(response);
  },

  async updateCredential(id: number, request: UpdateCredentialRequest): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialDto>(response);
  },

  async deleteCredential(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  async revealPassword(id: number): Promise<RevealPasswordResponse> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/reveal`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<RevealPasswordResponse>(response);
  },

  async registerPasswordCopy(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/copied`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Servidores
  async addServer(credentialId: number, request: CreateCredentialServerRequest): Promise<CredentialServerDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialServerDto>(response);
  },

  async removeServer(credentialId: number, serverId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/servers/${serverId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  async getAvailableServers(): Promise<AvailableServerDto[]> {
    const response = await fetch(`${API_URL}/api/vault/servers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<AvailableServerDto[]>(response);
  },

  // Estadísticas
  async getStats(): Promise<VaultStatsDto> {
    const response = await fetch(`${API_URL}/api/vault/stats`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<VaultStatsDto>(response);
  },

  async getExpiringCredentials(daysAhead: number = 30): Promise<CredentialDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/expiring?daysAhead=${daysAhead}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialDto[]>(response);
  },

  // Auditoría
  async getCredentialAudit(credentialId: number): Promise<CredentialAuditLogDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/audit`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialAuditLogDto[]>(response);
  },

  async getFullAudit(limit: number = 100): Promise<CredentialAuditLogDto[]> {
    const response = await fetch(`${API_URL}/api/vault/audit?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialAuditLogDto[]>(response);
  },

  // Grupos
  async getGroups(): Promise<CredentialGroupDto[]> {
    const response = await fetch(`${API_URL}/api/vault/groups`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialGroupDto[]>(response);
  },

  async getGroupById(id: number): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  async createGroup(request: CreateCredentialGroupRequest): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  async updateGroup(id: number, request: UpdateCredentialGroupRequest): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  async deleteGroup(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Miembros de grupos
  async addGroupMember(groupId: number, request: AddGroupMemberRequest): Promise<CredentialGroupMemberDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialGroupMemberDto>(response);
  },

  async updateGroupMember(groupId: number, memberId: number, request: UpdateGroupMemberRequest): Promise<CredentialGroupMemberDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<CredentialGroupMemberDto>(response);
  },

  async removeGroupMember(groupId: number, memberId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Usuarios disponibles
  async getAvailableUsers(): Promise<VaultUserDto[]> {
    const response = await fetch(`${API_URL}/api/vault/users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<VaultUserDto[]>(response);
  },
};

// ==================== SECURITY GROUPS API ====================

import type {
  SecurityGroup,
  SecurityGroupDetail,
  GroupMember,
  CreateGroupRequest,
  UpdateGroupRequest,
  GroupPermission,
  ADSyncConfig,
  UpdateADSyncConfigRequest,
  ADSyncResult,
  UserGroupMembership,
  AvailableUser,
  UserWithGroups,
} from '@/types';

export const groupsApi = {
  // CRUD de grupos
  async getGroups(): Promise<SecurityGroup[]> {
    const response = await fetch(`${API_URL}/api/groups`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SecurityGroup[]>(response);
  },

  async getGroup(id: number): Promise<SecurityGroupDetail> {
    const response = await fetch(`${API_URL}/api/groups/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<SecurityGroupDetail>(response);
  },

  async createGroup(request: CreateGroupRequest): Promise<SecurityGroup> {
    const response = await fetch(`${API_URL}/api/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<SecurityGroup>(response);
  },

  async updateGroup(id: number, request: UpdateGroupRequest): Promise<SecurityGroup> {
    const response = await fetch(`${API_URL}/api/groups/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<SecurityGroup>(response);
  },

  async deleteGroup(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al eliminar grupo' }));
      throw new Error(error.message);
    }
  },

  // Miembros del grupo
  async getMembers(groupId: number): Promise<GroupMember[]> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/members`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<GroupMember[]>(response);
  },

  async addMembers(groupId: number, userIds: string[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ userIds }),
    });
    return handleResponse<void>(response);
  },

  async removeMember(groupId: number, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/members/${userId}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al remover miembro' }));
      throw new Error(error.message);
    }
  },

  async getAvailableUsersForGroup(groupId: number): Promise<AvailableUser[]> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/available-users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<AvailableUser[]>(response);
  },

  // Permisos del grupo
  async getPermissions(groupId: number): Promise<GroupPermission> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/permissions`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<GroupPermission>(response);
  },

  async updatePermissions(groupId: number, permissions: Record<string, boolean>): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ permissions }),
    });
    return handleResponse<void>(response);
  },

  // Sincronización con AD
  async getADSyncConfig(groupId: number): Promise<{ configured: boolean; config?: ADSyncConfig }> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/ad-sync`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ configured: boolean; config?: ADSyncConfig }>(response);
  },

  async updateADSyncConfig(groupId: number, request: UpdateADSyncConfigRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/ad-sync`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<void>(response);
  },

  async executeADSync(groupId: number): Promise<ADSyncResult> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/ad-sync/execute`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<ADSyncResult>(response);
  },

  async removeADSyncConfig(groupId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/groups/${groupId}/ad-sync`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Error al remover configuración' }));
      throw new Error(error.message);
    }
  },

  // Utilidades
  async getUsersWithGroups(): Promise<UserWithGroups[]> {
    const response = await fetch(`${API_URL}/api/groups/users-with-groups`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<UserWithGroups[]>(response);
  },

  async getMyGroups(): Promise<UserGroupMembership[]> {
    const response = await fetch(`${API_URL}/api/groups/my-groups`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<UserGroupMembership[]>(response);
  },
};

// ==================== LOGS API ====================

export interface LogFileDto {
  name: string;
  size: string;
  sizeBytes: number;
  lastModified: string;
  path: string;
  isActive: boolean;
  isServiceLog: boolean;
  canOperate: boolean;
}

export interface LogListResponse {
  success: boolean;
  files: LogFileDto[];
  totalFiles: number;
}

export interface LogContentResponse {
  success: boolean;
  fileName: string;
  content: string;
  lines: number;
}

export interface LogActionResponse {
  success: boolean;
  message: string;
  error?: string;
}

export const logsApi = {
  async list(): Promise<LogListResponse> {
    const response = await fetch(`${API_URL}/api/logs/list`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogListResponse>(response);
  },

  async getContent(fileName: string): Promise<LogContentResponse> {
    const response = await fetch(`${API_URL}/api/logs/content/${encodeURIComponent(fileName)}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogContentResponse>(response);
  },

  async clear(fileName: string): Promise<LogActionResponse> {
    const response = await fetch(`${API_URL}/api/logs/clear/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogActionResponse>(response);
  },

  async delete(fileName: string): Promise<LogActionResponse> {
    const response = await fetch(`${API_URL}/api/logs/delete/${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogActionResponse>(response);
  },

  async clearAll(): Promise<LogActionResponse> {
    const response = await fetch(`${API_URL}/api/logs/clear-all`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogActionResponse>(response);
  },

  async purge(daysOld: number = 30): Promise<LogActionResponse> {
    const response = await fetch(`${API_URL}/api/logs/purge?daysOld=${daysOld}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<LogActionResponse>(response);
  },
};

// ==================== INVENTORY PROXY API ====================

export interface SqlServerInstanceDto {
  id: number;
  ServerName: string;
  local_net_address: string;
  NombreInstancia: string;
  MajorVersion: string;
  ProductLevel: string;
  Edition: string;
  ProductUpdateLevel: string;
  ProductVersion: string;
  ProductUpdateReference: string;
  Collation: string;
  AlwaysOn: string;
  hostingSite: string;
  hostingType: string;
  ambiente: string;
}

export interface InventoryCacheInfo {
  lastUpdatedAt?: string;
  updatedByUserName?: string;
  recordCount?: number;
}

export interface InventoryPagination {
  page: number;
  pageSize: number;
  totalRecords: number;
  totalPages: number;
}

export interface SqlServerInstancesResponse {
  data: SqlServerInstanceDto[];
  cacheInfo: InventoryCacheInfo;
  pagination: InventoryPagination;
}

// ==================== PATCH CONFIG API ====================

// Tipos de configuración de parcheos
export interface PatchingFreezingConfigDto {
  id: number;
  weekOfMonth: number;
  isFreezingWeek: boolean;
  description?: string;
  updatedAt?: string;
}

export interface UpdateFreezingConfigRequest {
  weeks: FreezingWeekConfig[];
}

export interface FreezingWeekConfig {
  weekOfMonth: number;
  isFreezingWeek: boolean;
  description?: string;
}

export interface FreezingMonthInfoDto {
  year: number;
  month: number;
  monthName: string;
  weeks: FreezingWeekInfoDto[];
}

export interface FreezingWeekInfoDto {
  weekOfMonth: number;
  startDate: string;
  endDate: string;
  isFreezingWeek: boolean;
  description?: string;
  daysInWeek: number;
}

export interface PatchNotificationSettingDto {
  id: number;
  notificationType: string;
  isEnabled: boolean;
  hoursBefore?: number;
  recipientType: string;
  emailSubjectTemplate?: string;
  emailBodyTemplate?: string;
  description?: string;
  updatedAt?: string;
}

export interface UpdateNotificationSettingRequest {
  notificationType: string;
  isEnabled: boolean;
  hoursBefore?: number;
  recipientType: string;
  emailSubjectTemplate?: string;
  emailBodyTemplate?: string;
  description?: string;
}

export interface PatchNotificationHistoryDto {
  id: number;
  patchPlanId: number;
  serverName: string;
  notificationType: string;
  recipientEmail: string;
  recipientName?: string;
  subject?: string;
  sentAt: string;
  wasSuccessful: boolean;
  errorMessage?: string;
}

export const patchConfigApi = {
  // Freezing Config
  async getFreezingConfig(): Promise<PatchingFreezingConfigDto[]> {
    const response = await fetch(`${API_URL}/api/patchconfig/freezing`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchingFreezingConfigDto[]>(response);
  },

  async getFreezingMonthInfo(year: number, month: number): Promise<FreezingMonthInfoDto> {
    const response = await fetch(`${API_URL}/api/patchconfig/freezing/month/${year}/${month}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<FreezingMonthInfoDto>(response);
  },

  async updateFreezingConfig(request: UpdateFreezingConfigRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/patchconfig/freezing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<void>(response);
  },

  async checkDateFreezing(date: string): Promise<{ date: string; isFreezing: boolean }> {
    const response = await fetch(`${API_URL}/api/patchconfig/freezing/check?date=${date}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ date: string; isFreezing: boolean }>(response);
  },

  // Notification Settings
  async getNotificationSettings(): Promise<PatchNotificationSettingDto[]> {
    const response = await fetch(`${API_URL}/api/patchconfig/notifications`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchNotificationSettingDto[]>(response);
  },

  async updateNotificationSetting(request: UpdateNotificationSettingRequest): Promise<PatchNotificationSettingDto> {
    const response = await fetch(`${API_URL}/api/patchconfig/notifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(request),
    });
    return handleResponse<PatchNotificationSettingDto>(response);
  },

  async getNotificationHistory(patchPlanId?: number, limit?: number): Promise<PatchNotificationHistoryDto[]> {
    const params = new URLSearchParams();
    if (patchPlanId) params.append('patchPlanId', patchPlanId.toString());
    if (limit) params.append('limit', limit.toString());

    const url = `${API_URL}/api/patchconfig/notifications/history${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<PatchNotificationHistoryDto[]>(response);
  },
};

// ==================== DATABASE OWNERS API ====================

// Tipos del Knowledge Base de Owners
export interface DatabaseOwnerDto {
  id: number;
  serverName: string;
  instanceName?: string;
  databaseName: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  cellTeam?: string;
  department?: string;
  applicationName?: string;
  businessCriticality?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  createdByUserName?: string;
  updatedAt?: string;
  updatedByUserName?: string;
  serverAmbiente?: string;
  sqlVersion?: string;
  isAlwaysOn?: string;
  hostingSite?: string;
}

export interface CreateDatabaseOwnerRequest {
  serverName: string;
  instanceName?: string;
  databaseName: string;
  ownerName: string;
  ownerEmail?: string;
  ownerPhone?: string;
  cellTeam?: string;
  department?: string;
  applicationName?: string;
  businessCriticality?: string;
  notes?: string;
}

export interface UpdateDatabaseOwnerRequest {
  ownerName?: string;
  ownerEmail?: string;
  ownerPhone?: string;
  cellTeam?: string;
  department?: string;
  applicationName?: string;
  businessCriticality?: string;
  notes?: string;
  isActive?: boolean;
}

export interface DatabaseOwnerFilterParams {
  serverName?: string;
  databaseName?: string;
  cellTeam?: string;
  ownerName?: string;
  businessCriticality?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

export interface DatabaseOwnerPagedResult {
  items: DatabaseOwnerDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DatabaseOwnerServerDto {
  serverName: string;
  instanceName?: string;
  ambiente?: string;
  majorVersion?: string;
}

export interface AvailableDatabaseDto {
  databaseName: string;
  status?: string;
  dataMB?: number;
  recoveryModel?: string;
  hasOwnerAssigned: boolean;
}

export interface CellTeamDto {
  cellTeam: string;
  databaseCount: number;
}

export const databaseOwnersApi = {
  // Obtener todos con paginación y filtros
  async getAll(filters?: DatabaseOwnerFilterParams): Promise<DatabaseOwnerPagedResult> {
    const params = new URLSearchParams();
    if (filters?.serverName) params.append('serverName', filters.serverName);
    if (filters?.databaseName) params.append('databaseName', filters.databaseName);
    if (filters?.cellTeam) params.append('cellTeam', filters.cellTeam);
    if (filters?.ownerName) params.append('ownerName', filters.ownerName);
    if (filters?.businessCriticality) params.append('businessCriticality', filters.businessCriticality);
    if (filters?.isActive !== undefined) params.append('isActive', filters.isActive.toString());
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.pageSize) params.append('pageSize', filters.pageSize.toString());

    const url = `${API_URL}/api/database-owners${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<DatabaseOwnerPagedResult>(response);
  },

  // Obtener por ID
  async getById(id: number): Promise<DatabaseOwnerDto> {
    const response = await fetch(`${API_URL}/api/database-owners/${id}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<DatabaseOwnerDto>(response);
  },

  // Buscar owner por servidor/base de datos
  async find(serverName: string, instanceName?: string, databaseName?: string): Promise<DatabaseOwnerDto | null> {
    const params = new URLSearchParams({ serverName });
    if (instanceName) params.append('instanceName', instanceName);
    if (databaseName) params.append('databaseName', databaseName);

    try {
      const response = await fetch(`${API_URL}/api/database-owners/find?${params.toString()}`, {
        headers: { ...getAuthHeader() },
      });
      if (response.status === 404) return null;
      return handleResponse<DatabaseOwnerDto>(response);
    } catch {
      return null;
    }
  },

  // Crear owner
  async create(data: CreateDatabaseOwnerRequest): Promise<DatabaseOwnerDto> {
    const response = await fetch(`${API_URL}/api/database-owners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<DatabaseOwnerDto>(response);
  },

  // Actualizar owner
  async update(id: number, data: UpdateDatabaseOwnerRequest): Promise<DatabaseOwnerDto> {
    const response = await fetch(`${API_URL}/api/database-owners/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<DatabaseOwnerDto>(response);
  },

  // Eliminar owner
  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/database-owners/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Obtener servidores disponibles
  async getAvailableServers(): Promise<DatabaseOwnerServerDto[]> {
    const response = await fetch(`${API_URL}/api/database-owners/servers`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<DatabaseOwnerServerDto[]>(response);
  },

  // Obtener bases de datos de un servidor
  async getDatabasesForServer(serverName: string, instanceName?: string): Promise<AvailableDatabaseDto[]> {
    const params = instanceName ? `?instanceName=${instanceName}` : '';
    const response = await fetch(`${API_URL}/api/database-owners/databases/${encodeURIComponent(serverName)}${params}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<AvailableDatabaseDto[]>(response);
  },

  // Obtener células únicas
  async getCellTeams(): Promise<CellTeamDto[]> {
    const response = await fetch(`${API_URL}/api/database-owners/cells`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<CellTeamDto[]>(response);
  },
};

// ==================== OVERVIEW ASSIGNMENTS ====================

export interface OverviewAssignmentDto {
  id: number;
  issueType: string;
  instanceName: string;
  driveOrTipo?: string;
  assignedToUserId: string;
  assignedToUserName: string;
  assignedByUserId: string;
  assignedByUserName: string;
  assignedAt: string;
  resolvedAt?: string;
  notes?: string;
}

export interface CreateOverviewAssignmentRequest {
  issueType: string;
  instanceName: string;
  driveOrTipo?: string;
  assignedToUserId: string;
  notes?: string;
}

export interface AssignableUserDto {
  id: string;
  displayName: string;
  email?: string;
  domainUser?: string;
}

export const overviewAssignmentsApi = {
  // Obtener todas las asignaciones activas
  async getActive(): Promise<OverviewAssignmentDto[]> {
    const response = await fetch(`${API_URL}/api/overview-assignments`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewAssignmentDto[]>(response);
  },

  // Obtener asignaciones por tipo
  async getByType(issueType: string): Promise<OverviewAssignmentDto[]> {
    const response = await fetch(`${API_URL}/api/overview-assignments/type/${issueType}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<OverviewAssignmentDto[]>(response);
  },

  // Obtener usuarios disponibles del grupo IDD (General)
  async getAvailableUsers(): Promise<AssignableUserDto[]> {
    const response = await fetch(`${API_URL}/api/overview-assignments/available-users`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<AssignableUserDto[]>(response);
  },

  // Crear o actualizar asignación
  async create(data: CreateOverviewAssignmentRequest): Promise<OverviewAssignmentDto> {
    const response = await fetch(`${API_URL}/api/overview-assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<OverviewAssignmentDto>(response);
  },

  // Eliminar asignación
  async remove(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/overview-assignments/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<void>(response);
  },

  // Resolver asignación
  async resolve(id: number, notes?: string): Promise<OverviewAssignmentDto> {
    const response = await fetch(`${API_URL}/api/overview-assignments/${id}/resolve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify({ notes }),
    });
    return handleResponse<OverviewAssignmentDto>(response);
  },

  // Buscar asignación específica
  async find(issueType: string, instanceName: string, driveOrTipo?: string): Promise<OverviewAssignmentDto | null> {
    const params = new URLSearchParams({ issueType, instanceName });
    if (driveOrTipo) params.append('driveOrTipo', driveOrTipo);

    const response = await fetch(`${API_URL}/api/overview-assignments/find?${params.toString()}`, {
      headers: { ...getAuthHeader() },
    });
    const result = await handleResponse<OverviewAssignmentDto | null>(response);
    return result;
  },
};

// ==================== BACKUP ALERTS ====================

export interface BackupAlertConfigDto {
  id: number;
  name: string;
  description?: string;
  isEnabled: boolean;
  checkIntervalMinutes: number;
  alertIntervalMinutes: number;
  recipients: string[];
  ccRecipients: string[];
  lastRunAt?: string;
  lastAlertSentAt?: string;
  createdAt: string;
  updatedAt?: string;
  updatedByDisplayName?: string;
}

export interface CreateBackupAlertRequest {
  name?: string;
  description?: string;
  checkIntervalMinutes?: number;
  alertIntervalMinutes?: number;
  recipients?: string[];
  ccRecipients?: string[];
}

export interface UpdateBackupAlertRequest {
  name?: string;
  description?: string;
  isEnabled?: boolean;
  checkIntervalMinutes?: number;
  alertIntervalMinutes?: number;
  recipients?: string[];
  ccRecipients?: string[];
}

export interface BackupAlertHistoryDto {
  id: number;
  configId: number;
  sentAt: string;
  recipientCount: number;
  ccCount: number;
  instancesAffected: string[];
  success: boolean;
  errorMessage?: string;
}

export interface BackupAlertStatusDto {
  unassignedIssues: BackupIssueSummaryDto[];
  assignedIssues: BackupIssueSummaryDto[];
}

export interface BackupIssueSummaryDto {
  instanceName: string;
  fullBackupBreached: boolean;
  logBackupBreached: boolean;
  assignedToUserName?: string;
  assignedAt?: string;
}

export const backupAlertsApi = {
  // Obtener configuración
  async getConfig(): Promise<BackupAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/backup-alerts/config`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<BackupAlertConfigDto>(response);
  },

  // Crear configuración
  async createConfig(data: CreateBackupAlertRequest): Promise<BackupAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/backup-alerts/config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<BackupAlertConfigDto>(response);
  },

  // Actualizar configuración
  async updateConfig(data: UpdateBackupAlertRequest): Promise<BackupAlertConfigDto> {
    const response = await fetch(`${API_URL}/api/backup-alerts/config`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: JSON.stringify(data),
    });
    return handleResponse<BackupAlertConfigDto>(response);
  },

  // Obtener historial
  async getHistory(limit: number = 10): Promise<BackupAlertHistoryDto[]> {
    const response = await fetch(`${API_URL}/api/backup-alerts/history?limit=${limit}`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<BackupAlertHistoryDto[]>(response);
  },

  // Obtener estado actual de backups (asignados vs no asignados)
  async getStatus(): Promise<BackupAlertStatusDto> {
    const response = await fetch(`${API_URL}/api/backup-alerts/status`, {
      headers: { ...getAuthHeader() },
    });
    return handleResponse<BackupAlertStatusDto>(response);
  },

  // Enviar email de prueba
  async testAlert(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/backup-alerts/test`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ success: boolean; message: string }>(response);
  },

  // Ejecutar verificación manualmente
  async runNow(): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_URL}/api/backup-alerts/run`, {
      method: 'POST',
      headers: { ...getAuthHeader() },
    });
    return handleResponse<{ success: boolean; message: string }>(response);
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

