/**
 * Vault Enterprise v2.1.1 - Sistema de permisos bitmask
 * 
 * Los bits deben coincidir EXACTAMENTE con el backend:
 * - IPermissionBitMaskService.cs
 * - PermissionTypes table (BitFlag column)
 */

// Constantes de bits de permisos
export const CredentialPermissions = {
  ViewMetadata: 1,
  RevealSecret: 2,
  UseWithoutReveal: 4,
  EditMetadata: 8,
  UpdateSecret: 16,      // NO "RotateSecret" - la app no cambia passwords en sistemas destino
  ManageServers: 32,
  ShareCredential: 64,
  DeleteCredential: 128,
  RestoreCredential: 256,
  ViewAudit: 512,
} as const;

export type CredentialPermission = typeof CredentialPermissions[keyof typeof CredentialPermissions];

/**
 * Verifica si un bitmask incluye un permiso específico
 * NOTA: Usar para tooltips/visual solamente. Para autorización, usar canX del backend.
 */
export function hasPermission(bitmask: number, permission: number): boolean {
  return (bitmask & permission) === permission;
}

/**
 * Helpers de permisos para UI
 * NOTA: Usar para tooltips/visual. El backend es la fuente de verdad para autorización.
 */
export function canReveal(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.RevealSecret);
}

export function canUse(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.UseWithoutReveal);
}

export function canEdit(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.EditMetadata);
}

export function canUpdateSecret(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.UpdateSecret);
}

export function canShare(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.ShareCredential);
}

export function canDelete(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.DeleteCredential);
}

export function canViewAudit(bitmask: number): boolean {
  return hasPermission(bitmask, CredentialPermissions.ViewAudit);
}

/**
 * Obtiene la etiqueta de un permiso para UI
 */
export function getPermissionLabel(permission: number): string {
  switch (permission) {
    case CredentialPermissions.ViewMetadata:
      return 'Ver metadata';
    case CredentialPermissions.RevealSecret:
      return 'Revelar password';
    case CredentialPermissions.UseWithoutReveal:
      return 'Usar sin revelar';
    case CredentialPermissions.EditMetadata:
      return 'Editar';
    case CredentialPermissions.UpdateSecret:
      return 'Actualizar password guardado';
    case CredentialPermissions.ManageServers:
      return 'Gestionar servidores';
    case CredentialPermissions.ShareCredential:
      return 'Compartir';
    case CredentialPermissions.DeleteCredential:
      return 'Eliminar';
    case CredentialPermissions.RestoreCredential:
      return 'Restaurar';
    case CredentialPermissions.ViewAudit:
      return 'Ver auditoría';
    default:
      return 'Desconocido';
  }
}

/**
 * Convierte un bitmask a una lista de nombres de permisos para debug/UI
 */
export function getPermissionNames(bitmask: number): string[] {
  const names: string[] = [];
  
  Object.entries(CredentialPermissions).forEach(([name, value]) => {
    if (hasPermission(bitmask, value)) {
      names.push(name);
    }
  });
  
  return names;
}

/**
 * Combina múltiples permisos en un bitmask
 */
export function combinePermissions(...permissions: number[]): number {
  return permissions.reduce((acc, perm) => acc | perm, 0);
}

