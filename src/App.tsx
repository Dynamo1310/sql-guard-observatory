import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Overview from "./pages/Overview";
import Jobs from "./pages/Jobs";
import Disks from "./pages/Disks";
import Databases from "./pages/Databases";
import Backups from "./pages/Backups";
import Indexes from "./pages/Indexes";
import AdminUsers from "./pages/AdminUsers";
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
                    <Route path="/" element={<Overview />} />
                    <Route path="/jobs" element={<Jobs />} />
                    <Route path="/disks" element={<Disks />} />
                    <Route path="/databases" element={<Databases />} />
                    <Route path="/backups" element={<Backups />} />
                    <Route path="/indexes" element={<Indexes />} />
                    <Route path="/admin/users" element={<AdminUsers />} />
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
