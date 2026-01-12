/**
 * @file AuthContext.tsx
 * @description Contexto de autenticación con sistema de capacidades dinámicas
 * 
 * Estrategia:
 * - ✅ Carga desde localStorage al iniciar
 * - ✅ Carga capacidades desde backend (basadas en rol personalizable)
 * - ✅ Carga información de autorización administrativa 
 * - ✅ JWT stateless (no renovación automática)
 * - ℹ️ Permisos de vistas: se obtienen de los grupos del usuario
 * - ℹ️ Capacidades administrativas: se obtienen del rol del usuario
 * 
 * @author SQL Guard Observatory Team
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';
import { permissionsApi, adminRolesApi, UserAuthorizationDto, AdminRoleSimpleDto } from '@/services/api';

// Información de autorización administrativa
interface AuthorizationInfo {
  roleId?: number;
  roleName: string;
  roleColor: string;
  roleIcon: string;
  rolePriority: number;
  capabilities: string[];
  assignableRoles: AdminRoleSimpleDto[];
  manageableGroupIds: number[];
  // Helpers de compatibilidad
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isReader: boolean;
  canCreateUsers: boolean;
  canDeleteUsers: boolean;
  canCreateGroups: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  logout: () => void;
  // Información del rol
  roleId?: number;
  roleName: string;
  roleColor: string;
  roleIcon: string;
  rolePriority: number;
  // Roles asignables
  assignableRoles: AdminRoleSimpleDto[];
  // Verificaciones de rol (compatibilidad)
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isReader: boolean;
  isOnCallEscalation: boolean;
  // Permisos de vistas (grupos)
  permissions: string[];
  hasPermission: (viewName: string) => boolean;
  // Capacidades administrativas (dinámicas)
  capabilities: string[];
  hasCapability: (capabilityKey: string) => boolean;
  // Capacidades comunes (helpers)
  canCreateUsers: boolean;
  canDeleteUsers: boolean;
  canCreateGroups: boolean;
  canManageGroup: (groupId: number) => boolean;
  canAssignRole: (roleId: number) => boolean;
  manageableGroupIds: number[];
  // Recargar información de autorización
  refreshAuthorization: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Valores por defecto de autorización
const defaultAuthorizationInfo: AuthorizationInfo = {
  roleId: undefined,
  roleName: 'Reader',
  roleColor: '#6b7280',
  roleIcon: 'Eye',
  rolePriority: 0,
  capabilities: [],
  assignableRoles: [],
  manageableGroupIds: [],
  isSuperAdmin: false,
  isAdmin: false,
  isReader: true,
  canCreateUsers: false,
  canDeleteUsers: false,
  canCreateGroups: false,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [authorizationInfo, setAuthorizationInfo] = useState<AuthorizationInfo>(defaultAuthorizationInfo);

  /**
   * Carga los permisos del usuario actual desde el backend.
   * Falla silenciosamente estableciendo permisos vacíos.
   */
  const loadPermissions = async (): Promise<void> => {
    try {
      const { permissions: userPerms } = await permissionsApi.getMyPermissions();
      setPermissions(userPerms);
    } catch (error) {
      console.error('[AuthContext] Error al cargar permisos:', error);
      setPermissions([]);
    }
  };

  /**
   * Carga la información de autorización administrativa del usuario.
   * Incluye capacidades basadas en rol y grupos asignados.
   */
  const loadAuthorizationInfo = async (): Promise<void> => {
    try {
      const authInfo: UserAuthorizationDto = await adminRolesApi.getMyAuthorization();
      setAuthorizationInfo({
        roleId: authInfo.roleId,
        roleName: authInfo.roleName,
        roleColor: authInfo.roleColor,
        roleIcon: authInfo.roleIcon,
        rolePriority: authInfo.rolePriority,
        capabilities: authInfo.capabilities,
        assignableRoles: authInfo.assignableRoles.map(r => ({
          id: r.id,
          name: r.name,
          color: r.color,
          icon: r.icon,
          priority: r.priority,
        })),
        manageableGroupIds: authInfo.manageableGroupIds || [],
        isSuperAdmin: authInfo.isSuperAdmin,
        isAdmin: authInfo.isAdmin,
        isReader: authInfo.isReader,
        canCreateUsers: authInfo.canCreateUsers,
        canDeleteUsers: authInfo.canDeleteUsers,
        canCreateGroups: authInfo.canCreateGroups,
      });
    } catch (error) {
      console.error('[AuthContext] Error al cargar autorización:', error);
      setAuthorizationInfo(defaultAuthorizationInfo);
    }
  };

  /**
   * Recarga la información de autorización (útil después de cambios)
   */
  const refreshAuthorization = async (): Promise<void> => {
    await Promise.all([loadPermissions(), loadAuthorizationInfo()]);
  };

  /**
   * Verifica la autenticación del usuario desde localStorage.
   * Carga permisos y autorización administrativa desde el backend.
   */
  const checkAuth = async (): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      
      // Leer datos de autenticación desde localStorage
      const token = localStorage.getItem('token');
      const userStr = localStorage.getItem('user');
      
      if (token && userStr) {
        const userData = JSON.parse(userStr);
        
        // Establecer usuario desde cache local
        setUser({
          id: userData.id,
          domainUser: userData.domainUser,
          displayName: userData.displayName,
          email: userData.email,
          allowed: true,
          roles: userData.roles,
          isOnCallEscalation: userData.isOnCallEscalation || false,
          profilePhotoUrl: userData.profilePhotoUrl || null,
          hasProfilePhoto: userData.hasProfilePhoto || false
        });
        
        // Cargar permisos de vistas y autorización administrativa en paralelo
        await Promise.all([loadPermissions(), loadAuthorizationInfo()]);
      } else {
        // No hay sesión activa
        setUser(null);
        setPermissions([]);
        setAuthorizationInfo(defaultAuthorizationInfo);
      }
    } catch (error) {
      setError('Error al verificar autenticación');
      setUser(null);
      setPermissions([]);
      setAuthorizationInfo(defaultAuthorizationInfo);
      console.error('[AuthContext] Error en checkAuth:', error);
    } finally {
      setLoading(false);
    }
  };


  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setPermissions([]);
    setAuthorizationInfo(defaultAuthorizationInfo);
  };

  /**
   * Verifica si el usuario tiene permiso para ver una vista específica.
   * Los permisos de vistas se obtienen de los grupos del usuario.
   */
  const hasPermission = (viewName: string): boolean => {
    return permissions.includes(viewName);
  };

  /**
   * Verifica si el usuario tiene una capacidad administrativa específica.
   * Las capacidades se obtienen del rol del usuario.
   */
  const hasCapability = (capabilityKey: string): boolean => {
    return authorizationInfo.capabilities.includes(capabilityKey);
  };

  /**
   * Verifica si el usuario puede gestionar un grupo específico.
   * SuperAdmin puede gestionar cualquier grupo.
   * Otros usuarios solo pueden gestionar grupos asignados.
   */
  const canManageGroup = (groupId: number): boolean => {
    if (authorizationInfo.isSuperAdmin) return true;
    return authorizationInfo.manageableGroupIds.includes(groupId);
  };

  /**
   * Verifica si el usuario puede asignar un rol específico.
   */
  const canAssignRole = (roleId: number): boolean => {
    return authorizationInfo.assignableRoles.some(r => r.id === roleId);
  };

  /**
   * Efecto de inicialización: carga usuario, permisos y autorización al montar
   */
  useEffect(() => {
    checkAuth();
  }, []);

  // Valores derivados del rol 
  const isAdmin = authorizationInfo.isAdmin || authorizationInfo.isSuperAdmin;
  const isSuperAdmin = authorizationInfo.isSuperAdmin;
  const isReader = authorizationInfo.isReader;
  const isOnCallEscalation = user?.isOnCallEscalation || false;

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      error, 
      checkAuth, 
      logout,
      // Información del rol
      roleId: authorizationInfo.roleId,
      roleName: authorizationInfo.roleName,
      roleColor: authorizationInfo.roleColor,
      roleIcon: authorizationInfo.roleIcon,
      rolePriority: authorizationInfo.rolePriority,
      // Roles asignables
      assignableRoles: authorizationInfo.assignableRoles,
      // Verificaciones de rol (compatibilidad)
      isAdmin, 
      isSuperAdmin,
      isReader,
      isOnCallEscalation,
      // Permisos de vistas
      permissions,
      hasPermission,
      // Capacidades administrativas
      capabilities: authorizationInfo.capabilities,
      hasCapability,
      // Capacidades comunes
      canCreateUsers: authorizationInfo.canCreateUsers,
      canDeleteUsers: authorizationInfo.canDeleteUsers,
      canCreateGroups: authorizationInfo.canCreateGroups,
      canManageGroup,
      canAssignRole,
      manageableGroupIds: authorizationInfo.manageableGroupIds,
      refreshAuthorization
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// ==================== HOOK ====================

/**
 * Hook para acceder al contexto de autenticación.
 * 
 * @throws {Error} Si se usa fuera de AuthProvider
 * @returns {AuthContextType} Contexto de autenticación con usuario, roles, permisos y capacidades
 * 
 * @example
 * ```tsx
 * const { user, hasCapability, canAssignRole, assignableRoles } = useAuth();
 * 
 * // Verificar capacidad
 * if (hasCapability('Users.Create')) {
 *   // ...código para crear usuarios
 * }
 * 
 * // Verificar si puede asignar un rol
 * if (canAssignRole(roleId)) {
 *   // ...mostrar el rol en el dropdown
 * }
 * ```
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
