import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { SignalRProvider } from '@/contexts/SignalRContext';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Instances from '@/pages/Instances';
import Backups from '@/pages/Backups';
import Jobs from '@/pages/Jobs';
import Discos from '@/pages/Discos';
import Waits from '@/pages/Waits';
import HealthScore from '@/pages/HealthScore';
import InstanceTrends from '@/pages/InstanceTrends';
import Login from '@/pages/Login';
import Users from '@/pages/Users';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SignalRProvider
          hubUrl={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/hubs/notifications`}
          autoReconnect={true}
        >
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="instances" element={<Instances />} />
                <Route path="backups" element={<Backups />} />
                <Route path="jobs" element={<Jobs />} />
                <Route path="discos" element={<Discos />} />
                <Route path="waits" element={<Waits />} />
                <Route path="healthscore" element={<HealthScore />} />
                <Route path="instance-trends/:instanceName" element={<InstanceTrends />} />
                <Route path="users" element={<Users />} />
              </Route>
            </Routes>
          </Router>
          <Toaster />
        </SignalRProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
