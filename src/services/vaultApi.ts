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
}

export interface SharedWithMeCredentialDto extends CredentialDto {
  sharedByUserId?: string;
  sharedByUserName?: string;
  sharedAt?: string;
  myPermission: string;
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

export interface CredentialFilterRequest {
  searchTerm?: string;
  credentialType?: CredentialType;
  serverName?: string;
  isExpired?: boolean;
  isExpiringSoon?: boolean;
  isPrivate?: boolean;
  groupId?: number;
  includeDeleted?: boolean;
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
export const GROUP_ROLES = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer'
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
}

// =============================================
// Tipos de Migración Enterprise (Solo SuperAdmin)
// =============================================

export interface BackfillStatus {
  totalCredentials: number;
  migratedCredentials: number;
  pendingCredentials: number;
  percentComplete: number;
  lastBackfillAt?: string;
}

export interface BackfillError {
  credentialId: number;
  credentialName: string;
  errorMessage: string;
  occurredAt: string;
}

export interface BackfillResult {
  totalProcessed: number;
  successful: number;
  failed: number;
  errors: BackfillError[];
  duration: string;
  isComplete: boolean;
}

export interface ValidationError {
  credentialId: number;
  credentialName: string;
  validationError_: string;
  canDecryptLegacy: boolean;
  canDecryptEnterprise: boolean;
}

export interface ValidationResult {
  totalValidated: number;
  validCount: number;
  invalidCount: number;
  errors: ValidationError[];
  allValid: boolean;
}

export interface CleanupReadinessResult {
  canProceed: boolean;
  migrationStatus: BackfillStatus;
  validationResult: ValidationResult;
  blockers: string[];
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

  // ==================== Migración Enterprise (Solo SuperAdmin) ====================

  /**
   * Obtiene el estado actual de la migración del vault
   */
  async getMigrationStatus(): Promise<BackfillStatus> {
    const response = await fetch(`${API_URL}/api/VaultMigration/status`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<BackfillStatus>(response);
  },

  /**
   * Ejecuta el backfill de credenciales pendientes
   */
  async executeBackfill(batchSize: number = 100): Promise<BackfillResult> {
    const response = await fetch(`${API_URL}/api/VaultMigration/backfill?batchSize=${batchSize}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<BackfillResult>(response);
  },

  /**
   * Valida que todas las credenciales migradas pueden ser descifradas
   */
  async validateMigration(): Promise<ValidationResult> {
    const response = await fetch(`${API_URL}/api/VaultMigration/validate`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<ValidationResult>(response);
  },

  /**
   * Verifica si se puede proceder con Phase 8 (cleanup)
   */
  async canProceedWithCleanup(): Promise<CleanupReadinessResult> {
    const response = await fetch(`${API_URL}/api/VaultMigration/can-cleanup`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader()
      }
    });
    return handleResponse<CleanupReadinessResult>(response);
  },

  /**
   * Revierte una credencial específica al formato legacy
   */
  async revertCredential(credentialId: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/VaultMigration/revert/${credentialId}`, {
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

/**
 * Copia texto al portapapeles con limpieza automática
 * @param text Texto a copiar
 * @param clearAfterSeconds Segundos antes de limpiar el portapapeles (default: 60)
 * @returns Promise<boolean> true si se copió correctamente
 */
export async function copyToClipboardWithAutoClear(
  text: string, 
  clearAfterSeconds: number = 60
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    
    // Programar limpieza del portapapeles
    setTimeout(async () => {
      try {
        // Verificar si el contenido actual es el mismo que copiamos
        const currentText = await navigator.clipboard.readText();
        if (currentText === text) {
          await navigator.clipboard.writeText('');
        }
      } catch {
        // Ignorar errores al intentar limpiar (puede que no tengamos permiso de lectura)
      }
    }, clearAfterSeconds * 1000);
    
    return true;
  } catch {
    // Fallback para navegadores más antiguos
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
}

export default vaultApi;

