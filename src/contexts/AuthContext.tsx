/**
 * @file AuthContext.tsx
 * @description Contexto de autenticación simple con JWT
 * 
 * Estrategia:
 * - ✅ Carga desde localStorage al iniciar
 * - ✅ Carga permisos desde backend
 * - ✅ JWT stateless (no renovación automática)
 * - ℹ️ Cambios de roles requieren cerrar sesión manualmente
 * 
 * @author SQL Guard Observatory Team
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';
import { permissionsApi } from '@/services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isOnCallEscalation: boolean;
  permissions: string[];
  hasPermission: (viewName: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);

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
   * Verifica la autenticación del usuario desde localStorage.
   * Carga rápida sin llamadas al backend para UX inmediata.
   * 
   * @remarks
   * Esta función NO refresca el token, solo lee localStorage.
   * Para obtener datos actualizados, usar refreshSession().
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
          isOnCallEscalation: userData.isOnCallEscalation || false
        });
        
        // Cargar permisos
        await loadPermissions();
      } else {
        // No hay sesión activa
        setUser(null);
        setPermissions([]);
      }
    } catch (error) {
      setError('Error al verificar autenticación');
      setUser(null);
      setPermissions([]);
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
  };

  const hasPermission = (viewName: string): boolean => {
    // SuperAdmin siempre tiene todos los permisos
    if (user?.roles.includes('SuperAdmin')) {
      return true;
    }
    return permissions.includes(viewName);
  };

  /**
   * Efecto de inicialización: carga usuario y permisos al montar
   */
  useEffect(() => {
    checkAuth();
  }, []);

  const isAdmin = user?.roles.includes('Admin') || user?.roles.includes('SuperAdmin') || false;
  const isSuperAdmin = user?.roles.includes('SuperAdmin') || false;
  const isOnCallEscalation = user?.isOnCallEscalation || false;

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      error, 
      checkAuth, 
      logout, 
      isAdmin, 
      isSuperAdmin,
      isOnCallEscalation,
      permissions,
      hasPermission
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
 * @returns {AuthContextType} Contexto de autenticación con usuario, roles y permisos
 * 
 * @example
 * ```tsx
 * const { user, isSuperAdmin, refreshSession } = useAuth();
 * 
 * // Verificar rol
 * if (isSuperAdmin) {
 *   // ...código para SuperAdmin
 * }
 * 
 * // Refrescar sesión manualmente
 * await refreshSession();
 * ```
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
