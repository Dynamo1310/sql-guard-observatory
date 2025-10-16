import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Check localStorage for authenticated user
      const domainUser = localStorage.getItem('domain_user');
      const displayName = localStorage.getItem('display_name');
      const rolesStr = localStorage.getItem('roles');
      
      if (domainUser && displayName && rolesStr) {
        const roles = JSON.parse(rolesStr);
        setUser({
          domainUser,
          displayName,
          allowed: true,
          roles
        });
      } else {
        setUser(null);
      }
    } catch (err) {
      setError('Error al verificar autenticación');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('domain_user');
    localStorage.removeItem('display_name');
    localStorage.removeItem('roles');
    setUser(null);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const isAdmin = user?.roles.includes('Admin') ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, error, checkAuth, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
