/**
 * Tests para vaultPermissions.ts
 * 
 * Para ejecutar:
 * npm test -- vaultPermissions.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  CredentialPermissions,
  hasPermission,
  canReveal,
  canUse,
  canEdit,
  canUpdateSecret,
  canShare,
  canDelete,
  canViewAudit,
  getPermissionLabel,
  getPermissionNames,
  combinePermissions
} from './vaultPermissions';

describe('CredentialPermissions constants', () => {
  it('UpdateSecret is bit 16', () => {
    expect(CredentialPermissions.UpdateSecret).toBe(16);
  });

  it('No RotateSecret constant exists', () => {
    expect((CredentialPermissions as any).RotateSecret).toBeUndefined();
  });

  it('All permission bits are correct powers of 2', () => {
    expect(CredentialPermissions.ViewMetadata).toBe(1);
    expect(CredentialPermissions.RevealSecret).toBe(2);
    expect(CredentialPermissions.UseWithoutReveal).toBe(4);
    expect(CredentialPermissions.EditMetadata).toBe(8);
    expect(CredentialPermissions.UpdateSecret).toBe(16);
    expect(CredentialPermissions.ManageServers).toBe(32);
    expect(CredentialPermissions.ShareCredential).toBe(64);
    expect(CredentialPermissions.DeleteCredential).toBe(128);
    expect(CredentialPermissions.RestoreCredential).toBe(256);
    expect(CredentialPermissions.ViewAudit).toBe(512);
  });
});

describe('hasPermission', () => {
  it('returns true when permission is present', () => {
    const bitmask = 3; // ViewMetadata (1) + RevealSecret (2)
    expect(hasPermission(bitmask, CredentialPermissions.ViewMetadata)).toBe(true);
    expect(hasPermission(bitmask, CredentialPermissions.RevealSecret)).toBe(true);
  });

  it('returns false when permission is not present', () => {
    const bitmask = 3; // ViewMetadata (1) + RevealSecret (2)
    expect(hasPermission(bitmask, CredentialPermissions.UseWithoutReveal)).toBe(false);
    expect(hasPermission(bitmask, CredentialPermissions.UpdateSecret)).toBe(false);
  });

  it('returns false for zero bitmask', () => {
    expect(hasPermission(0, CredentialPermissions.ViewMetadata)).toBe(false);
  });
});

describe('permission helper functions', () => {
  it('canReveal returns correctly', () => {
    expect(canReveal(3)).toBe(true);  // ViewMetadata + RevealSecret
    expect(canReveal(1)).toBe(false); // Solo ViewMetadata
  });

  it('canUse returns correctly', () => {
    expect(canUse(5)).toBe(true);  // ViewMetadata + UseWithoutReveal
    expect(canUse(3)).toBe(false); // ViewMetadata + RevealSecret
  });

  it('canEdit returns correctly', () => {
    expect(canEdit(9)).toBe(true);  // ViewMetadata + EditMetadata
    expect(canEdit(3)).toBe(false); // ViewMetadata + RevealSecret
  });

  it('canUpdateSecret returns correctly', () => {
    expect(canUpdateSecret(17)).toBe(true);  // ViewMetadata + UpdateSecret
    expect(canUpdateSecret(15)).toBe(false); // ViewMetadata + RevealSecret + UseWithoutReveal + EditMetadata
  });

  it('canShare returns correctly', () => {
    expect(canShare(65)).toBe(true);  // ViewMetadata + ShareCredential
    expect(canShare(63)).toBe(false); // No ShareCredential
  });

  it('canDelete returns correctly', () => {
    expect(canDelete(129)).toBe(true);  // ViewMetadata + DeleteCredential
    expect(canDelete(127)).toBe(false); // No DeleteCredential
  });

  it('canViewAudit returns correctly', () => {
    expect(canViewAudit(513)).toBe(true);  // ViewMetadata + ViewAudit
    expect(canViewAudit(511)).toBe(false); // No ViewAudit
  });
});

describe('getPermissionLabel', () => {
  it('returns correct labels for all permissions', () => {
    expect(getPermissionLabel(CredentialPermissions.ViewMetadata)).toBe('Ver metadata');
    expect(getPermissionLabel(CredentialPermissions.RevealSecret)).toBe('Revelar password');
    expect(getPermissionLabel(CredentialPermissions.UseWithoutReveal)).toBe('Usar sin revelar');
    expect(getPermissionLabel(CredentialPermissions.EditMetadata)).toBe('Editar');
    expect(getPermissionLabel(CredentialPermissions.UpdateSecret)).toBe('Actualizar password guardado');
    expect(getPermissionLabel(CredentialPermissions.ManageServers)).toBe('Gestionar servidores');
    expect(getPermissionLabel(CredentialPermissions.ShareCredential)).toBe('Compartir');
    expect(getPermissionLabel(CredentialPermissions.DeleteCredential)).toBe('Eliminar');
  });

  it('returns "Desconocido" for unknown permission', () => {
    expect(getPermissionLabel(99999)).toBe('Desconocido');
  });
});

describe('getPermissionNames', () => {
  it('returns correct list of permission names', () => {
    const bitmask = 7; // ViewMetadata + RevealSecret + UseWithoutReveal
    const names = getPermissionNames(bitmask);
    
    expect(names).toContain('ViewMetadata');
    expect(names).toContain('RevealSecret');
    expect(names).toContain('UseWithoutReveal');
    expect(names).not.toContain('EditMetadata');
  });

  it('returns empty array for zero bitmask', () => {
    expect(getPermissionNames(0)).toEqual([]);
  });
});

describe('combinePermissions', () => {
  it('combines multiple permissions correctly', () => {
    const combined = combinePermissions(
      CredentialPermissions.ViewMetadata,
      CredentialPermissions.RevealSecret,
      CredentialPermissions.EditMetadata
    );
    
    expect(combined).toBe(11); // 1 + 2 + 8
    expect(hasPermission(combined, CredentialPermissions.ViewMetadata)).toBe(true);
    expect(hasPermission(combined, CredentialPermissions.RevealSecret)).toBe(true);
    expect(hasPermission(combined, CredentialPermissions.EditMetadata)).toBe(true);
  });

  it('returns 0 when no permissions provided', () => {
    expect(combinePermissions()).toBe(0);
  });
});

