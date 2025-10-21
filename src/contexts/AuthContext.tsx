/**
 * @file AuthContext.tsx
 * @description Contexto de autenticación con estrategia Lazy Refresh
 * 
 * Estrategia de Refresh (Opción 2 - Profesional):
 * - ✅ Carga inicial rápida desde localStorage (UX inmediata)
 * - ✅ Refresh automático en segundo plano al cargar la app (F5)
 * - ✅ Refresh al volver a la pestaña (visibilitychange)
 * - ✅ Refresh manual después de editar usuarios (solo si es necesario)
 * - ✅ Throttling de 3 segundos para evitar spam
 * - ❌ NO refresca en navegaciones entre páginas (performance)
 * - ❌ NO usa polling automático (ahorro de recursos)
 * 
 * @author SQL Guard Observatory Team
 * @see {@link https://github.com/yourusername/sql-guard-observatory}
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { User } from '@/types';
import { permissionsApi, authApi } from '@/services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  hasPermission: (viewName: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ==================== CONFIGURACIÓN ====================

/** Tiempo mínimo entre refreshes consecutivos (throttling) */
const REFRESH_THROTTLE_MS = 3000;

/** Delay inicial para refresh en segundo plano (no bloquear render) */
const INITIAL_REFRESH_DELAY_MS = 500;

// ==================== PROVIDER ====================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  
  // Refs para control de refreshes
  const isRefreshing = useRef(false);
  const lastRefreshTime = useRef<number>(0);

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
          domainUser: userData.domainUser,
          displayName: userData.displayName,
          allowed: true,
          roles: userData.roles
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

  /**
   * Refresca la sesión del usuario actual obteniendo roles y permisos actualizados desde el backend.
   * Implementa throttling para evitar múltiples llamadas innecesarias.
   * 
   * @remarks
   * - Solo se ejecuta si han pasado al menos REFRESH_THROTTLE_MS desde el último refresh
   * - Evita llamadas concurrentes con flag isRefreshing
   * - Falla silenciosamente manteniendo el estado actual del usuario
   */
  const refreshSession = async (): Promise<void> => {
    // Guardia: Evitar llamadas concurrentes
    if (isRefreshing.current) {
      return;
    }
    
    // Guardia: Throttling para evitar spam
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime.current;
    if (timeSinceLastRefresh < REFRESH_THROTTLE_MS) {
      return;
    }
    
    // Guardia: Verificar que hay token
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    try {
      isRefreshing.current = true;
      lastRefreshTime.current = now;

      // Obtener datos actualizados del backend
      const refreshedData = await authApi.refreshSession();
      
      // Actualizar estado del usuario
      setUser({
        domainUser: refreshedData.domainUser,
        displayName: refreshedData.displayName,
        allowed: refreshedData.allowed,
        roles: refreshedData.roles
      });
      
      // Recargar permisos
      await loadPermissions();
      
      console.log('[AuthContext] ✅ Sesión refrescada exitosamente');
      
    } catch (error: any) {
      // Fallo silencioso: mantener estado actual del usuario
      // Esto es normal si el token expiró o el usuario no está autenticado
      if (error?.message !== 'Token no válido para refresh') {
        console.warn('[AuthContext] Error al refrescar sesión (se mantiene sesión actual):', error?.message);
      }
    } finally {
      isRefreshing.current = false;
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
   * Efecto de inicialización: solo carga datos de localStorage
   */
  useEffect(() => {
    checkAuth();
  }, []);

  const isAdmin = user?.roles.includes('Admin') || user?.roles.includes('SuperAdmin') || false;
  const isSuperAdmin = user?.roles.includes('SuperAdmin') || false;

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      error, 
      checkAuth,
      refreshSession,
      logout, 
      isAdmin,
      isSuperAdmin,
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
