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
import OverviewSummaryAlerts from "./pages/OverviewSummaryAlerts";
import ServerRestart from "./pages/ServerRestart";
import OperationalServersConfig from "./pages/OperationalServersConfig";
import AdminUsers from "./pages/AdminUsers";
import AdminPermissions from "./pages/AdminPermissions";
import AdminGroups from "./pages/AdminGroups";
import AdminGroupDetail from "./pages/AdminGroupDetail";
import PatchStatus from "./pages/PatchStatus";
import PatchComplianceConfig from "./pages/PatchComplianceConfig";
import VaultDashboard from "./pages/VaultDashboard";
import VaultCredentials from "./pages/VaultCredentials";
import VaultSharedWithMe from "./pages/VaultSharedWithMe";
import VaultGroupDetail from "./pages/VaultGroupDetail";
import VaultMyCredentials from "./pages/VaultMyCredentials";
import VaultGroups from "./pages/VaultGroups";
import VaultAudit from "./pages/VaultAudit";
import VaultNotificationSettings from "./pages/VaultNotificationSettings";
import SystemCredentials from "./pages/SystemCredentials";
import AdminMenuBadges from "./pages/AdminMenuBadges";
import CollectorConfig from "./pages/admin/CollectorConfig";
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
                      <Route path="/patching" element={
                        <ProtectedRoute viewName="Patching">
                          <PatchStatus />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/config" element={
                        <ProtectedRoute viewName="PatchingConfig">
                          <PatchComplianceConfig />
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
                      <Route path="/admin/system-credentials" element={
                        <ProtectedRoute viewName="SystemCredentials">
                          <SystemCredentials />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/servers-down" element={
                        <ProtectedRoute viewName="AlertaServidoresCaidos">
                          <ProductionAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/overview-summary" element={
                        <ProtectedRoute viewName="AlertaResumenOverview">
                          <OverviewSummaryAlerts />
                        </ProtectedRoute>
                      } />
                      {/* Operaciones */}
                      <Route path="/operations/server-restart" element={
                        <ProtectedRoute viewName="ServerRestart">
                          <ServerRestart />
                        </ProtectedRoute>
                      } />
                      <Route path="/operations/servers-config" element={
                        <ProtectedRoute viewName="OperationsConfig">
                          <OperationalServersConfig />
                        </ProtectedRoute>
                      } />
                      {/* Vault DBA */}
                      <Route path="/vault" element={
                        <ProtectedRoute viewName="VaultDashboard">
                          <VaultDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/dashboard" element={
                        <ProtectedRoute viewName="VaultDashboard">
                          <VaultDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/credentials" element={
                        <ProtectedRoute viewName="VaultCredentials">
                          <VaultCredentials />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/shared-with-me" element={
                        <ProtectedRoute viewName="VaultCredentials">
                          <VaultSharedWithMe />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/my-credentials" element={
                        <ProtectedRoute viewName="VaultMyCredentials">
                          <VaultMyCredentials />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/audit" element={
                        <ProtectedRoute viewName="VaultAudit">
                          <VaultAudit />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/notifications" element={
                        <ProtectedRoute viewName="VaultCredentials">
                          <VaultNotificationSettings />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/groups/:id" element={
                        <ProtectedRoute viewName="VaultCredentials">
                          <VaultGroupDetail />
                        </ProtectedRoute>
                      } />
                      <Route path="/vault/groups" element={
                        <ProtectedRoute viewName="VaultCredentials">
                          <VaultGroups />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/users" element={
                        <ProtectedRoute viewName="AdminUsers">
                          <AdminUsers />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/groups" element={
                        <ProtectedRoute viewName="AdminGroups">
                          <AdminGroups />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/groups/:id" element={
                        <ProtectedRoute viewName="AdminGroups">
                          <AdminGroupDetail />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/permissions" element={
                        <ProtectedRoute viewName="AdminPermissions">
                          <AdminPermissions />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/menu-badges" element={
                        <ProtectedRoute viewName="AdminMenuBadges">
                          <AdminMenuBadges />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/collectors" element={
                        <ProtectedRoute viewName="AdminCollectors">
                          <CollectorConfig />
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
