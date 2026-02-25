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
import OnCallSettings from "./pages/OnCallSettings";
import SmtpSettings from "./pages/SmtpSettings";
import ProductionAlerts from "./pages/ProductionAlerts";
import BackupAlerts from "./pages/BackupAlerts";
import DiskAlerts from "./pages/DiskAlerts";
import OverviewSummaryAlerts from "./pages/OverviewSummaryAlerts";
import ServerRestart from "./pages/ServerRestart";
import OperationalServersConfig from "./pages/OperationalServersConfig";
import AdminUsers from "./pages/AdminUsers";
import AdminGroups from "./pages/AdminGroups";
import AdminGroupDetail from "./pages/AdminGroupDetail";
import AdminRoles from "./pages/AdminRoles";
import PatchStatus from "./pages/PatchStatus";
import PatchComplianceConfig from "./pages/PatchComplianceConfig";
import PatchPlanner from "./pages/PatchPlanner";
import PatchCalendar from "./pages/PatchCalendar";
import PatchCellView from "./pages/PatchCellView";
import PatchExecution from "./pages/PatchExecution";
import PatchFreezingConfig from "./pages/PatchFreezingConfig";
import PatchNotificationsConfig from "./pages/PatchNotificationsConfig";
import ObsoleteInstances from "./pages/ObsoleteInstances";
import DatabaseOwners from "./pages/DatabaseOwners";
import BasesSinUso from "./pages/BasesSinUso";
import ServerComparison from "./pages/ServerComparison";
import IntervencionesWar from "./pages/IntervencionesWar";
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
import ServerExceptions from "./pages/admin/ServerExceptions";
import AdminLogs from "./pages/admin/AdminLogs";
import SqlServerInventoryDashboard from "./pages/SqlServerInventoryDashboard";
import SqlServerInstances from "./pages/SqlServerInstances";
import SqlServerDatabases from "./pages/SqlServerDatabases";
import PostgreSqlInstances from "./pages/PostgreSqlInstances";
import PostgreSqlDatabases from "./pages/PostgreSqlDatabases";
import RedisInstances from "./pages/RedisInstances";
import DocumentDbInstances from "./pages/DocumentDbInstances";
import Login from "./pages/Login";
import Unauthorized from "./pages/Unauthorized";
import NotFound from "./pages/NotFound";

// ========== REACT QUERY - Configuración optimizada para alta concurrencia ==========
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,           // Datos frescos por 30 segundos
      gcTime: 5 * 60 * 1000,          // Mantener en caché 5 minutos (antes cacheTime)
      retry: 3,                        // Reintentar 3 veces en error
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Backoff exponencial
      refetchOnWindowFocus: false,     // No refetch al volver a la ventana
      refetchOnReconnect: true,        // Refetch al reconectar
    },
    mutations: {
      retry: 1,                        // Reintentar mutaciones 1 vez
    },
  },
});

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
                      <Route path="/patching/planner" element={
                        <ProtectedRoute viewName="PatchPlanner">
                          <PatchPlanner />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/calendar" element={
                        <ProtectedRoute viewName="PatchCalendar">
                          <PatchCalendar />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/cell" element={
                        <ProtectedRoute viewName="PatchCellView">
                          <PatchCellView />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/execute" element={
                        <ProtectedRoute viewName="PatchExecution">
                          <PatchExecution />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/freezing-config" element={
                        <ProtectedRoute viewName="PatchFreezingConfig">
                          <PatchFreezingConfig />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/notifications-config" element={
                        <ProtectedRoute viewName="PatchNotificationsConfig">
                          <PatchNotificationsConfig />
                        </ProtectedRoute>
                      } />
                      <Route path="/patching/obsolete" element={
                        <ProtectedRoute viewName="ObsoleteInstances">
                          <ObsoleteInstances />
                        </ProtectedRoute>
                      } />
                      {/* Knowledge Base */}
                      <Route path="/knowledge/database-owners" element={
                        <ProtectedRoute viewName="DatabaseOwners">
                          <DatabaseOwners />
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
                      <Route path="/oncall/settings" element={
                        <ProtectedRoute viewName="OnCall">
                          <OnCallSettings />
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
                      <Route path="/vault/system-credentials" element={
                        <ProtectedRoute viewName="SystemCredentials">
                          <SystemCredentials />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/servers-down" element={
                        <ProtectedRoute viewName="AlertaServidoresCaidos">
                          <ProductionAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/backups" element={
                        <ProtectedRoute viewName="AlertaBackups">
                          <BackupAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/disks" element={
                        <ProtectedRoute viewName="AlertaDiscosCriticos">
                          <DiskAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/alerts/overview-summary" element={
                        <ProtectedRoute viewName="AlertaResumenOverview">
                          <OverviewSummaryAlerts />
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/server-exceptions" element={
                        <ProtectedRoute viewName="AdminServerExceptions">
                          <ServerExceptions />
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
                      {/* Intervenciones */}
                      <Route path="/intervenciones" element={
                        <ProtectedRoute viewName="IntervencionesWar">
                          <IntervencionesWar />
                        </ProtectedRoute>
                      } />
                      {/* Proyectos */}
                      <Route path="/projects/bases-sin-uso" element={
                        <ProtectedRoute viewName="BasesSinUso">
                          <BasesSinUso />
                        </ProtectedRoute>
                      } />
                      <Route path="/projects/server-comparison" element={
                        <ProtectedRoute viewName="ServerComparison">
                          <ServerComparison />
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
                      <Route path="/admin/roles" element={
                        <ProtectedRoute viewName="AdminRoles">
                          <AdminRoles />
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
                      <Route path="/admin/logs" element={
                        <ProtectedRoute viewName="AdminLogs">
                          <AdminLogs />
                        </ProtectedRoute>
                      } />
                      {/* Inventario SQL Server */}
                      <Route path="/inventory/sqlserver/dashboard" element={
                        <ProtectedRoute viewName="InventarioSqlServerDashboard">
                          <SqlServerInventoryDashboard />
                        </ProtectedRoute>
                      } />
                      <Route path="/inventory/sqlserver/instances" element={
                        <ProtectedRoute viewName="InventarioSqlServerInstances">
                          <SqlServerInstances />
                        </ProtectedRoute>
                      } />
                      <Route path="/inventory/sqlserver/databases" element={
                        <ProtectedRoute viewName="InventarioSqlServerDatabases">
                          <SqlServerDatabases />
                        </ProtectedRoute>
                      } />
                      {/* Inventario PostgreSQL */}
                      <Route path="/inventory/postgresql/instances" element={
                        <ProtectedRoute viewName="InventarioPostgreSqlInstances">
                          <PostgreSqlInstances />
                        </ProtectedRoute>
                      } />
                      <Route path="/inventory/postgresql/databases" element={
                        <ProtectedRoute viewName="InventarioPostgreSqlDatabases">
                          <PostgreSqlDatabases />
                        </ProtectedRoute>
                      } />
                      {/* Inventario Redis */}
                      <Route path="/inventory/redis/instances" element={
                        <ProtectedRoute viewName="InventarioRedisInstances">
                          <RedisInstances />
                        </ProtectedRoute>
                      } />
                      {/* Inventario DocumentDB */}
                      <Route path="/inventory/documentdb/instances" element={
                        <ProtectedRoute viewName="InventarioDocumentDbInstances">
                          <DocumentDbInstances />
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
