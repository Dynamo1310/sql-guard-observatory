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
  // Grupos del usuario
  groupNames: string[];
  isInGroup: (groupName: string) => boolean;
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

// Claves de localStorage para caché
const CACHE_KEYS = {
  PERMISSIONS: 'cached_permissions',
  AUTHORIZATION: 'cached_authorization',
  GROUP_NAMES: 'cached_group_names',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>(() => {
    // Cargar permisos desde caché al iniciar
    try {
      const cached = localStorage.getItem(CACHE_KEYS.PERMISSIONS);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [groupNames, setGroupNames] = useState<string[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEYS.GROUP_NAMES);
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [authorizationInfo, setAuthorizationInfo] = useState<AuthorizationInfo>(() => {
    // Cargar autorización desde caché al iniciar
    try {
      const cached = localStorage.getItem(CACHE_KEYS.AUTHORIZATION);
      return cached ? JSON.parse(cached) : defaultAuthorizationInfo;
    } catch {
      return defaultAuthorizationInfo;
    }
  });

  /**
   * Carga los permisos del usuario actual desde el backend.
   * Guarda en caché para cargas posteriores más rápidas.
   */
  const loadPermissions = async (): Promise<void> => {
    try {
      const { permissions: userPerms, groupNames: userGroups } = await permissionsApi.getMyPermissions();
      setPermissions(userPerms);
      setGroupNames(userGroups || []);
      localStorage.setItem(CACHE_KEYS.PERMISSIONS, JSON.stringify(userPerms));
      localStorage.setItem(CACHE_KEYS.GROUP_NAMES, JSON.stringify(userGroups || []));
    } catch (error) {
      console.error('[AuthContext] Error al cargar permisos:', error);
    }
  };

  /**
   * Carga la información de autorización administrativa del usuario.
   * Incluye capacidades basadas en rol y grupos asignados.
   * Guarda en caché para cargas posteriores más rápidas.
   */
  const loadAuthorizationInfo = async (): Promise<void> => {
    try {
      const authInfo: UserAuthorizationDto = await adminRolesApi.getMyAuthorization();
      const newAuthInfo: AuthorizationInfo = {
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
      };
      setAuthorizationInfo(newAuthInfo);
      // Guardar en caché
      localStorage.setItem(CACHE_KEYS.AUTHORIZATION, JSON.stringify(newAuthInfo));
    } catch (error) {
      console.error('[AuthContext] Error al cargar autorización:', error);
      // No limpiar autorización cacheada si falla la llamada
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
   * Usa caché de permisos/autorización para mostrar la UI inmediatamente.
   * Actualiza permisos en background sin bloquear.
   */
  const checkAuth = async (): Promise<void> => {
    try {
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
        
        // Verificar si tenemos caché de permisos/autorización
        const hasCachedPermissions = localStorage.getItem(CACHE_KEYS.PERMISSIONS);
        const hasCachedAuth = localStorage.getItem(CACHE_KEYS.AUTHORIZATION);
        
        if (hasCachedPermissions && hasCachedAuth) {
          // Tenemos caché - mostrar UI inmediatamente y actualizar en background
          setLoading(false);
          // Actualizar en background (fire-and-forget)
          Promise.all([loadPermissions(), loadAuthorizationInfo()]).catch(console.error);
        } else {
          // No hay caché - debemos esperar la primera carga
          setLoading(true);
          await Promise.all([loadPermissions(), loadAuthorizationInfo()]);
          setLoading(false);
        }
      } else {
        // No hay sesión activa - limpiar todo incluyendo caché
        setUser(null);
        setPermissions([]);
        setGroupNames([]);
        setAuthorizationInfo(defaultAuthorizationInfo);
        localStorage.removeItem(CACHE_KEYS.PERMISSIONS);
        localStorage.removeItem(CACHE_KEYS.AUTHORIZATION);
        localStorage.removeItem(CACHE_KEYS.GROUP_NAMES);
        setLoading(false);
      }
    } catch (error) {
      setError('Error al verificar autenticación');
      setUser(null);
      setPermissions([]);
      setGroupNames([]);
      setAuthorizationInfo(defaultAuthorizationInfo);
      console.error('[AuthContext] Error en checkAuth:', error);
      setLoading(false);
    }
  };


  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem(CACHE_KEYS.PERMISSIONS);
    localStorage.removeItem(CACHE_KEYS.AUTHORIZATION);
    localStorage.removeItem(CACHE_KEYS.GROUP_NAMES);
    setUser(null);
    setPermissions([]);
    setGroupNames([]);
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
   * Verifica si el usuario pertenece a un grupo de seguridad específico.
   */
  const isInGroup = (groupName: string): boolean => {
    return groupNames.includes(groupName);
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
      // Grupos del usuario
      groupNames,
      isInGroup,
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
