import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SignalRProvider } from '@/contexts/SignalRContext';
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
import OnCallSchedule from "./pages/OnCallSchedule";
import OnCallDashboard from "./pages/OnCallDashboard";
import OnCallOperators from "./pages/OnCallOperators";
import OnCallEscalation from "./pages/OnCallEscalation";
import OnCallActivations from "./pages/OnCallActivations";
import OnCallAlerts from "./pages/OnCallAlerts";
import OnCallReports from "./pages/OnCallReports";
import OnCallSwaps from "./pages/OnCallSwaps";
import SmtpSettings from "./pages/SmtpSettings";
import ProductionAlerts from "./pages/ProductionAlerts";
import ServerRestart from "./pages/ServerRestart";
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
      <SignalRProvider>
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
                      <Route path="/oncall" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/dashboard" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/planner" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallSchedule />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/operators" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallOperators />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/escalation" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallEscalation />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/activations" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallActivations />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/alerts" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/reports" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallReports />
                        </ProtectedRoute>
                      } />
                      <Route path="/oncall/swaps" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallSwaps />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/smtp" element={
                        <ProtectedRoute viewName="ConfigSMTP">
                          <SmtpSettings />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/servers-down" element={
                        <ProtectedRoute viewName="AlertaServidoresCaidos">
                          <ProductionAlerts />
                        </ProtectedRoute>
                      } />
                      {/* Operaciones */}
                      <Route path="/operations/server-restart" element={
                        <ProtectedRoute viewName="ServerRestart">
                          <ServerRestart />
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
      </SignalRProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
