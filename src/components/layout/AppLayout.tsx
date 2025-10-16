import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';
import { Environment, Hosting } from '@/types';
import { toast } from 'sonner';

export function AppLayout() {
  const [environment, setEnvironment] = useState<Environment>('All');
  const [hosting, setHosting] = useState<Hosting>('All');
  const [lastUpdate, setLastUpdate] = useState<string>(new Date().toISOString());

  const handleRefresh = () => {
    toast.info('Actualizando datos...');
    // Simulate refresh
    setTimeout(() => {
      setLastUpdate(new Date().toISOString());
      toast.success('Datos actualizados');
    }, 1000);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <TopBar
            onRefresh={handleRefresh}
            environment={environment}
            onEnvironmentChange={(val) => setEnvironment(val as Environment)}
            hosting={hosting}
            onHostingChange={(val) => setHosting(val as Hosting)}
            lastUpdate={lastUpdate}
          />
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
