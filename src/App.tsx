import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { DefaultRoute } from "@/components/routing/DefaultRoute";
import Overview from "./pages/Overview";
import HealthScore from "./pages/HealthScore";
import InstanceTrends from "./pages/InstanceTrends";
import Jobs from "./pages/Jobs";
import Disks from "./pages/Disks";
import Databases from "./pages/Databases";
import Backups from "./pages/Backups";
import Indexes from "./pages/Indexes";
import AdminUsers from "./pages/AdminUsers";
import AdminPermissions from "./pages/AdminPermissions";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user?.allowed) {
    return <Unauthorized />;
  }

  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={
              <AuthGate>
                <Routes>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<DefaultRoute />} />
                    <Route path="/overview" element={
                      <ProtectedRoute viewName="Overview">
                        <Overview />
                      </ProtectedRoute>
                    } />
                    <Route path="/healthscore" element={
                      <ProtectedRoute viewName="HealthScore">
                        <HealthScore />
                      </ProtectedRoute>
                    } />
                    <Route path="/instance-trends/:instanceName" element={
                      <ProtectedRoute viewName="HealthScore">
                        <InstanceTrends />
                      </ProtectedRoute>
                    } />
                    <Route path="/jobs" element={
                      <ProtectedRoute viewName="Jobs">
                        <Jobs />
                      </ProtectedRoute>
                    } />
                    <Route path="/disks" element={
                      <ProtectedRoute viewName="Disks">
                        <Disks />
                      </ProtectedRoute>
                    } />
                    <Route path="/databases" element={
                      <ProtectedRoute viewName="Databases">
                        <Databases />
                      </ProtectedRoute>
                    } />
                    <Route path="/backups" element={
                      <ProtectedRoute viewName="Backups">
                        <Backups />
                      </ProtectedRoute>
                    } />
                    <Route path="/indexes" element={
                      <ProtectedRoute viewName="Indexes">
                        <Indexes />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/users" element={
                      <ProtectedRoute viewName="AdminUsers">
                        <AdminUsers />
                      </ProtectedRoute>
                    } />
                    <Route path="/admin/permissions" element={
                      <ProtectedRoute viewName="AdminPermissions">
                        <AdminPermissions />
                      </ProtectedRoute>
                    } />
                    <Route path="/unauthorized" element={<Unauthorized />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AuthGate>
            } />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
