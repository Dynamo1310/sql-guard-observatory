import { User } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import logoSupervielleBlanco from '/LogoSupervielleBlancoLetras.svg';
import logoSupervielleNegro from '/LogoSupervielleNegroLetras.svg';

export function TopBar() {
  const { user } = useAuth();

  return (
    <>
      <header className="h-16 border-b border-border bg-card flex items-center px-4 gap-4">
        <SidebarTrigger />

        <div className="flex-1"></div>

        <div className="flex items-center gap-3">
          {/* Logo Supervielle - cambia según el tema */}
          <img 
            src={logoSupervielleNegro} 
            alt="Supervielle" 
            className="logo-light h-8 w-auto"
          />
          <img 
            src={logoSupervielleBlanco} 
            alt="Supervielle" 
            className="logo-dark h-8 w-auto"
          />
          <ThemeToggle />

          <div className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md">
            <User className="h-4 w-4 text-muted-foreground" />
            <div className="flex flex-col text-left">
              <span className="text-sm font-medium">{user?.displayName}</span>
              <span className="text-xs text-muted-foreground font-mono">{user?.domainUser}</span>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
