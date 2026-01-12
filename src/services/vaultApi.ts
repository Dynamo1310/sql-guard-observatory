/**
 * API Service para el Vault de Credenciales DBA
 */
import { getApiUrl, getAuthHeader } from './api';

const API_URL = getApiUrl();

// =============================================
// Tipos e Interfaces
// =============================================

export type CredentialType = 'SqlAuth' | 'WindowsAD' | 'Other';

export interface CredentialServerDto {
  id: number;
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
  createdAt: string;
  fullServerName: string;
}

export interface CredentialGroupShareDto {
  id: number;
  groupId: number;
  groupName: string;
  groupColor?: string;
  permission: string;
  sharedByUserId: string;
  sharedByUserName?: string;
  sharedAt: string;
  /** Si true, los miembros del grupo pueden re-compartir esta credencial */
  allowReshare: boolean;
}

export interface CredentialUserShareDto {
  id: number;
  userId: string;
  userName: string;
  displayName?: string;
  email?: string;
  permission: string;
  sharedByUserId: string;
  sharedByUserName?: string;
  sharedAt: string;
  /** Si true, el usuario puede re-compartir esta credencial */
  allowReshare: boolean;
}

export interface CredentialDto {
  id: number;
  name: string;
  credentialType: CredentialType;
  username: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
  ownerUserId: string;
  ownerDisplayName?: string;
  createdAt: string;
  updatedAt?: string;
  createdByDisplayName?: string;
  updatedByDisplayName?: string;
  isExpired: boolean;
  isExpiringSoon: boolean;
  servers: CredentialServerDto[];
  groupShares: CredentialGroupShareDto[];
  userShares: CredentialUserShareDto[];
  currentUserPermission?: string;
  
  // Enterprise v2.1.1 - Permisos bitmask
  permissionBitMask: number;
  canReveal: boolean;
  canUse: boolean;
  canEdit: boolean;
  canUpdateSecret: boolean;  // NO "canRotate"
  canShare: boolean;
  canDelete: boolean;
  canViewAudit: boolean;
  /** Si true, el usuario puede re-compartir esta credencial con otros */
  canReshare: boolean;
}

export interface SharedWithMeCredentialDto extends CredentialDto {
  sharedByUserId?: string;
  sharedByUserName?: string;
  sharedAt?: string;
  myPermission: string;
  // Los campos de permisos bitmask se heredan de CredentialDto
}

export interface CreateCredentialRequest {
  name: string;
  credentialType: CredentialType;
  username: string;
  password: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
  shareWithGroupIds?: number[];
  shareWithUserIds?: string[];
  servers?: CreateCredentialServerRequest[];
}

export interface CreateCredentialServerRequest {
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
}

export interface UpdateCredentialRequest {
  name: string;
  credentialType: CredentialType;
  username: string;
  newPassword?: string;
  domain?: string;
  description?: string;
  notes?: string;
  expiresAt?: string;
  isPrivate: boolean;
}

export interface RevealPasswordResponse {
  password: string;
  expiresInSeconds: number;
}

// Enterprise v2.1.1 - Update Secret (MANUAL)
export interface UpdateSecretRequest {
  newPassword: string;
}

export interface UpdateSecretResponse {
  success: boolean;
  message: string;
  updatedAt: string;
  reason?: string;  // Solo en errores
}

// Enterprise v2.1.1 - Use Without Reveal
export interface UseCredentialRequest {
  targetServer: string;
  targetInstance?: string;
  purpose?: string;
}

export interface UseCredentialResponse {
  success: boolean;
  usageId: string;
  message?: string;
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
  actionDescription: string;
}

/** DTO para logs de acceso (Reveal, Copy, Use) - incluye Vault y Sistema */
export interface CredentialAccessLogDto {
  id: number;
  /** ID de credencial del Vault (null si es Sistema) */
  credentialId?: number;
  /** ID de credencial de Sistema (null si es Vault) */
  systemCredentialId?: number;
  /** Nombre de la credencial */
  credentialName?: string;
  /** Fuente: "Vault" o "System" */
  credentialSource: string;
  accessType: string;
  accessResult: string;
  denialReason?: string;
  targetServerName?: string;
  userId: string;
  userName?: string;
  accessedAt: string;
  ipAddress?: string;
}

export interface VaultStatsDto {
  totalCredentials: number;
  sharedCredentials: number;
  privateCredentials: number;
  expiringCredentials: number;
  expiredCredentials: number;
  sqlAuthCredentials: number;
  windowsCredentials: number;
  otherCredentials: number;
  totalServersLinked: number;
  lastActivity?: string;
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

export interface AddServerToCredentialRequest {
  serverName: string;
  instanceName?: string;
  connectionPurpose?: string;
}

// =============================================
// Tipos para Notificaciones del Vault
// =============================================

export interface VaultNotificationTypeDto {
  code: string;
  displayName: string;
  description: string;
  defaultEnabled: boolean;
  category: string;
  displayOrder: number;
}

export interface VaultNotificationPreferenceDto {
  id: number;
  notificationType: string;
  isEnabled: boolean;
  displayName: string;
  description: string;
  category: string;
  displayOrder: number;
}

export interface NotificationPreferenceUpdateDto {
  notificationType: string;
  isEnabled: boolean;
}

// =============================================
// Tipos para Filtros
// =============================================

export interface CredentialFilterRequest {
  searchTerm?: string;
  credentialType?: CredentialType;
  serverName?: string;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  isPrivate?: boolean;
  groupId?: number;
  includeDeleted?: boolean;
  /** Si es true, solo devuelve credenciales donde el usuario es propietario */
  ownerOnly?: boolean;
}

// =============================================
// Tipos de Grupos
// =============================================

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

// Roles de grupo disponibles
// Simplificado: Owner (implícito al crear), Admin y Member
export const GROUP_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member'
} as const;

// Roles que pueden ser asignados manualmente (Owner es implícito)
export const ASSIGNABLE_GROUP_ROLES = {
  ADMIN: 'Admin',
  MEMBER: 'Member'
} as const;

export type GroupRole = typeof GROUP_ROLES[keyof typeof GROUP_ROLES];

// Permisos de compartición
export const SHARE_PERMISSIONS = {
  VIEW: 'View',
  EDIT: 'Edit',
  ADMIN: 'Admin'
} as const;

export type SharePermission = typeof SHARE_PERMISSIONS[keyof typeof SHARE_PERMISSIONS];

export interface ShareCredentialRequest {
  groupIds?: number[];
  userIds?: string[];
  permission: SharePermission;
  /** Si true, los destinatarios pueden re-compartir esta credencial */
  allowReshare?: boolean;
}

// =============================================
// Helper Functions
// =============================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
      throw new Error('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
    }
    
    if (response.status === 403) {
      throw new Error('No tienes permisos para realizar esta acción.');
    }
    
    const error = await response.json().catch(() => ({
      message: 'Error en la comunicación con el servidor'
    }));
    throw new Error(error.message || 'Error desconocido');
  }
  
  // Para respuestas 204 No Content
  if (response.status === 204) {
    return {} as T;
  }
  
  return response.json();
}

function buildQueryString(filter?: CredentialFilterRequest): string {
  if (!filter) return '';
  
  const params = new URLSearchParams();
  
  if (filter.searchTerm) params.append('searchTerm', filter.searchTerm);
  if (filter.credentialType) params.append('credentialType', filter.credentialType);
  if (filter.serverName) params.append('serverName', filter.serverName);
  if (filter.isExpired !== undefined) params.append('isExpired', String(filter.isExpired));
  if (filter.isExpiringSoon !== undefined) params.append('isExpiringSoon', String(filter.isExpiringSoon));
  if (filter.isPrivate !== undefined) params.append('isPrivate', String(filter.isPrivate));
  if (filter.groupId !== undefined) params.append('groupId', String(filter.groupId));
  if (filter.includeDeleted) params.append('includeDeleted', String(filter.includeDeleted));
  
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

// =============================================
// Vault API
// =============================================

export const vaultApi = {
  // ==================== Credenciales ====================

  /**
   * Obtiene todas las credenciales visibles para el usuario
   */
  async getCredentials(filter?: CredentialFilterRequest): Promise<CredentialDto[]> {
    const queryString = buildQueryString(filter);
    const response = await fetch(`${API_URL}/api/vault/credentials${queryString}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialDto[]>(response);
  },

  /**
   * Obtiene una credencial por ID (sin password)
   */
  async getCredentialById(id: number): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialDto>(response);
  },

  /**
   * Crea una nueva credencial
   */
  async createCredential(request: CreateCredentialRequest): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialDto>(response);
  },

  /**
   * Actualiza una credencial existente
   */
  async updateCredential(id: number, request: UpdateCredentialRequest): Promise<CredentialDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialDto>(response);
  },

  /**
   * Elimina una credencial (soft delete)
   */
  async deleteCredential(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Revela el password de una credencial
   */
  async revealPassword(id: number): Promise<RevealPasswordResponse> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<RevealPasswordResponse>(response);
  },

  /**
   * Registra que el usuario copió el password al portapapeles
   */
  async registerPasswordCopy(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/copied`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Actualiza el secreto guardado (MANUAL) - Enterprise v2.1.1
   * IMPORTANTE: NO cambia la password en el servidor destino
   */
  async updateSecret(id: number, newPassword: string): Promise<UpdateSecretResponse> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/update-secret`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ newPassword })
    });
    return handleResponse<UpdateSecretResponse>(response);
  },

  /**
   * Usa una credencial sin revelar el password - Enterprise v2.1.1
   * El secreto nunca sale del backend
   */
  async useCredential(id: number, request: UseCredentialRequest): Promise<UseCredentialResponse> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/use`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<UseCredentialResponse>(response);
  },

  // ==================== Servidores ====================

  /**
   * Agrega un servidor a una credencial
   */
  async addServerToCredential(credentialId: number, request: AddServerToCredentialRequest): Promise<CredentialServerDto> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialServerDto>(response);
  },

  /**
   * Elimina un servidor de una credencial
   */
  async removeServerFromCredential(credentialId: number, serverId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/servers/${serverId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Obtiene la lista de servidores disponibles para asociar
   */
  async getAvailableServers(): Promise<AvailableServerDto[]> {
    const response = await fetch(`${API_URL}/api/vault/servers`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<AvailableServerDto[]>(response);
  },

  // ==================== Estadísticas y Dashboard ====================

  /**
   * Obtiene estadísticas del Vault para el dashboard
   */
  async getStats(): Promise<VaultStatsDto> {
    const response = await fetch(`${API_URL}/api/vault/stats`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<VaultStatsDto>(response);
  },

  /**
   * Obtiene credenciales próximas a expirar
   */
  async getExpiringCredentials(daysAhead: number = 30): Promise<CredentialDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/expiring?daysAhead=${daysAhead}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialDto[]>(response);
  },

  // ==================== Auditoría ====================

  /**
   * Obtiene el historial de auditoría de una credencial
   */
  async getCredentialAuditLog(credentialId: number): Promise<CredentialAuditLogDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/audit`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialAuditLogDto[]>(response);
  },

  /**
   * Obtiene el historial de auditoría completo (solo admin)
   */
  async getFullAuditLog(limit: number = 100): Promise<CredentialAuditLogDto[]> {
    const response = await fetch(`${API_URL}/api/vault/audit?limit=${limit}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialAuditLogDto[]>(response);
  },

  /**
   * Obtiene el historial de accesos completo - Vault + Sistema (solo admin)
   * Incluye: Reveal, Copy, Use para todas las credenciales
   */
  async getAllAccessLogs(limit: number = 100): Promise<CredentialAccessLogDto[]> {
    const response = await fetch(`${API_URL}/api/vault/access-logs?limit=${limit}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialAccessLogDto[]>(response);
  },

  // ==================== Grupos ====================

  /**
   * Obtiene todos los grupos visibles para el usuario
   */
  async getGroups(): Promise<CredentialGroupDto[]> {
    const response = await fetch(`${API_URL}/api/vault/groups`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialGroupDto[]>(response);
  },

  /**
   * Obtiene un grupo por ID
   */
  async getGroupById(id: number): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  /**
   * Crea un nuevo grupo
   */
  async createGroup(request: CreateCredentialGroupRequest): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  /**
   * Actualiza un grupo existente
   */
  async updateGroup(id: number, request: UpdateCredentialGroupRequest): Promise<CredentialGroupDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialGroupDto>(response);
  },

  /**
   * Elimina un grupo (soft delete)
   */
  async deleteGroup(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${id}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Agrega un miembro a un grupo
   */
  async addGroupMember(groupId: number, request: AddGroupMemberRequest): Promise<CredentialGroupMemberDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialGroupMemberDto>(response);
  },

  /**
   * Actualiza el rol de un miembro
   */
  async updateGroupMember(groupId: number, memberId: number, request: UpdateGroupMemberRequest): Promise<CredentialGroupMemberDto> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members/${memberId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<CredentialGroupMemberDto>(response);
  },

  /**
   * Elimina un miembro de un grupo
   */
  async removeGroupMember(groupId: number, memberId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Obtiene los usuarios disponibles para agregar a grupos
   */
  async getAvailableUsers(): Promise<VaultUserDto[]> {
    const response = await fetch(`${API_URL}/api/vault/users`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<VaultUserDto[]>(response);
  },

  /**
   * Obtiene las credenciales propias del usuario que se pueden compartir (no privadas)
   */
  async getMyShareableCredentials(): Promise<CredentialDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/my-shareable`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialDto[]>(response);
  },

  /**
   * Obtiene las credenciales de un grupo
   */
  async getGroupCredentials(groupId: number): Promise<CredentialDto[]> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/credentials`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CredentialDto[]>(response);
  },

  /**
   * Agrega una credencial a un grupo
   */
  async addCredentialToGroup(groupId: number, credentialId: number, permission: string = 'View'): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/credentials/${credentialId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ permission })
    });
    await handleResponse<void>(response);
  },

  /**
   * Remueve una credencial de un grupo
   */
  async removeCredentialFromGroup(groupId: number, credentialId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/groups/${groupId}/credentials/${credentialId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  // ==================== Compartición ====================

  /**
   * Comparte una credencial con grupos y/o usuarios
   */
  async shareCredential(id: number, request: ShareCredentialRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${id}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    await handleResponse<void>(response);
  },

  /**
   * Deja de compartir una credencial con un grupo
   */
  async unshareFromGroup(credentialId: number, groupId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/share/group/${groupId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Deja de compartir una credencial con un usuario
   */
  async unshareFromUser(credentialId: number, userId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/credentials/${credentialId}/share/user/${userId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Obtiene las credenciales compartidas directamente con el usuario
   */
  async getSharedWithMe(): Promise<SharedWithMeCredentialDto[]> {
    const response = await fetch(`${API_URL}/api/vault/credentials/shared-with-me`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<SharedWithMeCredentialDto[]>(response);
  },

  // =============================================
  // Notificaciones del Vault
  // =============================================

  /**
   * Obtiene los tipos de notificación disponibles
   */
  async getNotificationTypes(): Promise<VaultNotificationTypeDto[]> {
    const response = await fetch(`${API_URL}/api/vault/notifications/types`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<VaultNotificationTypeDto[]>(response);
  },

  /**
   * Obtiene las preferencias de notificación del usuario actual
   */
  async getNotificationPreferences(): Promise<VaultNotificationPreferenceDto[]> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<VaultNotificationPreferenceDto[]>(response);
  },

  /**
   * Actualiza las preferencias de notificación del usuario
   */
  async updateNotificationPreferences(preferences: NotificationPreferenceUpdateDto[]): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(preferences)
    });
    await handleResponse<void>(response);
  },

  /**
   * Actualiza una preferencia de notificación individual
   */
  async updateSingleNotificationPreference(notificationType: string, isEnabled: boolean): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences/${notificationType}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify({ isEnabled })
    });
    await handleResponse<void>(response);
  },

  /**
   * Habilita todas las notificaciones
   */
  async enableAllNotifications(): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences/enable-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Deshabilita todas las notificaciones
   */
  async disableAllNotifications(): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences/disable-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Restablece las preferencias a los valores por defecto
   */
  async resetNotificationPreferences(): Promise<void> {
    const response = await fetch(`${API_URL}/api/vault/notifications/preferences/reset`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  }
};

// =============================================
// Utilidades para el Portapapeles
// =============================================

// Variable global para trackear el último texto copiado y su timestamp
let lastCopiedText: string | null = null;
let lastCopiedTime: number = 0;

/**
 * Limpia el portapapeles usando múltiples métodos
 */
async function clearClipboard(): Promise<boolean> {
  // Método 1: API moderna
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText('');
      return true;
    }
  } catch {
    // Continuar con otros métodos
  }

  // Método 2: Textarea + execCommand
  try {
    const textArea = document.createElement('textarea');
    textArea.value = '';
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copia texto al portapapeles con limpieza automática
 * @param text Texto a copiar
 * @param clearAfterSeconds Segundos antes de limpiar el portapapeles (default: 15)
 * @returns Promise<boolean> true si se copió correctamente
 */
export async function copyToClipboardWithAutoClear(
  text: string, 
  clearAfterSeconds: number = 15
): Promise<boolean> {
  
  // Guardar referencia al texto copiado
  lastCopiedText = text;
  lastCopiedTime = Date.now();
  const copyTime = lastCopiedTime;
  
  // Función para intentar limpiar el portapapeles
  const attemptClear = async (attempt: number = 1): Promise<void> => {
    // Verificar si este es aún el último copiado
    if (lastCopiedTime !== copyTime) {
      console.log('[Vault] Se copió algo nuevo, cancelando limpieza anterior');
      return;
    }

    const cleared = await clearClipboard();
    
    if (cleared) {
      console.log(`[Vault] ✅ Portapapeles limpiado (intento ${attempt})`);
      lastCopiedText = null;
    } else if (attempt < 3) {
      // Reintentar después de 2 segundos
      console.log(`[Vault] ⏳ Reintentando limpiar portapapeles (intento ${attempt + 1})...`);
      setTimeout(() => attemptClear(attempt + 1), 2000);
    } else {
      console.log('[Vault] ⚠️ No se pudo limpiar el portapapeles después de 3 intentos');
    }
  };

  // Programar limpieza
  const scheduleClear = () => {
    console.log(`[Vault] 🔐 Contraseña copiada. Se limpiará en ${clearAfterSeconds} segundos...`);
    setTimeout(() => attemptClear(), clearAfterSeconds * 1000);
  };

  // Intentar copiar con la API moderna
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      scheduleClear();
      return true;
    } catch {
      // Continuar con fallback
    }
  }
  
  // Fallback para contextos no seguros (HTTP) o navegadores antiguos
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (success) {
      scheduleClear();
    }
    return success;
  } catch {
    document.body.removeChild(textArea);
    return false;
  }
}

// =============================================
// System Credentials API
// =============================================

export interface SystemCredentialAssignmentDto {
  id: number;
  systemCredentialId: number;
  assignmentType: string;
  assignmentValue: string;
  priority: number;
  createdAt: string;
  createdByUserName?: string;
}

export interface SystemCredentialDto {
  id: number;
  name: string;
  description?: string;
  username: string;
  domain?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  createdByUserName?: string;
  updatedByUserName?: string;
  assignments: SystemCredentialAssignmentDto[];
}

export interface CreateSystemCredentialRequest {
  name: string;
  description?: string;
  username: string;
  domain?: string;
  password: string;
}

export interface UpdateSystemCredentialRequest {
  name?: string;
  description?: string;
  username?: string;
  domain?: string;
  password?: string;
  isActive?: boolean;
}

export interface AddSystemCredentialAssignmentRequest {
  assignmentType: string;
  assignmentValue: string;
  priority?: number;
}

export interface AssignmentTypeInfo {
  type: string;
  displayName: string;
  description: string;
}

export interface TestConnectionRequest {
  serverName: string;
  instanceName?: string;
  /** Puerto TCP (opcional). Requerido para RDS/Azure SQL. */
  port?: number;
}

export interface RevealSystemCredentialPasswordResponse {
  password: string;
  username: string;
  domain?: string;
  credentialName: string;
}

// SystemCredentialAuditLogDto movido a CredentialAccessLogDto centralizado

export interface TestConnectionResponse {
  success: boolean;
  errorMessage?: string;
  sqlVersion?: string;
  credentialUsed?: string;
  matchedAssignment?: string;
}

export const systemCredentialsApi = {
  /**
   * Obtiene todas las credenciales de sistema
   */
  async getAll(): Promise<SystemCredentialDto[]> {
    const response = await fetch(`${API_URL}/api/system-credentials`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<SystemCredentialDto[]>(response);
  },

  /**
   * Obtiene una credencial de sistema por ID
   */
  async getById(id: number): Promise<SystemCredentialDto> {
    const response = await fetch(`${API_URL}/api/system-credentials/${id}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<SystemCredentialDto>(response);
  },

  /**
   * Crea una nueva credencial de sistema
   */
  async create(request: CreateSystemCredentialRequest): Promise<SystemCredentialDto> {
    const response = await fetch(`${API_URL}/api/system-credentials`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<SystemCredentialDto>(response);
  },

  /**
   * Actualiza una credencial de sistema
   */
  async update(id: number, request: UpdateSystemCredentialRequest): Promise<void> {
    const response = await fetch(`${API_URL}/api/system-credentials/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    await handleResponse<void>(response);
  },

  /**
   * Elimina una credencial de sistema
   */
  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/system-credentials/${id}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Agrega una asignación a una credencial
   */
  async addAssignment(credentialId: number, request: AddSystemCredentialAssignmentRequest): Promise<SystemCredentialAssignmentDto> {
    const response = await fetch(`${API_URL}/api/system-credentials/${credentialId}/assignments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<SystemCredentialAssignmentDto>(response);
  },

  /**
   * Elimina una asignación
   */
  async removeAssignment(credentialId: number, assignmentId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/system-credentials/${credentialId}/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Prueba la conexión con una credencial
   */
  async testConnection(credentialId: number, request: TestConnectionRequest): Promise<TestConnectionResponse> {
    const response = await fetch(`${API_URL}/api/system-credentials/${credentialId}/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      },
      body: JSON.stringify(request)
    });
    return handleResponse<TestConnectionResponse>(response);
  },

  /**
   * Revela el password de una credencial de sistema
   * Esta acción queda registrada en la auditoría
   */
  async revealPassword(credentialId: number): Promise<RevealSystemCredentialPasswordResponse> {
    const response = await fetch(`${API_URL}/api/system-credentials/${credentialId}/reveal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<RevealSystemCredentialPasswordResponse>(response);
  },

  /**
   * Registra que el password fue copiado al portapapeles
   * Esta acción queda registrada en la auditoría
   */
  async registerPasswordCopy(credentialId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/system-credentials/${credentialId}/copied`, {
      method: 'POST',
      headers: {
        ...getAuthHeader()
      }
    });
    await handleResponse<void>(response);
  },

  /**
   * Obtiene los tipos de asignación disponibles
   */
  async getAssignmentTypes(): Promise<AssignmentTypeInfo[]> {
    const response = await fetch(`${API_URL}/api/system-credentials/assignment-types`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<AssignmentTypeInfo[]>(response);
  }
};

export default vaultApi;

