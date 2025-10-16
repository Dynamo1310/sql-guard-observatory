import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  checkAuth: () => Promise<void>;
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
      
      // Mock API call - simulating AD auth
      // In production, this would call GET /api/auth/me
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Simulate different user states
      const mockUser: User = {
        domainUser: "BANCO\\admin.user",
        displayName: "Admin User",
        allowed: true,
        roles: ["Admin"]
      };

      setUser(mockUser);
    } catch (err) {
      setError('Error al verificar autenticación');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const isAdmin = user?.roles.includes('Admin') ?? false;

  return (
    <AuthContext.Provider value={{ user, loading, error, checkAuth, isAdmin }}>
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
