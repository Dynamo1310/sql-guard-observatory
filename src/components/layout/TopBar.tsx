import { User, LogOut, ChevronDown } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { ThemeToggle } from './ThemeToggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function TopBar() {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    // Forzar redirección a login
    window.location.href = '/login';
  };

  return (
    <>
      <header className="h-16 border-b border-border bg-card flex items-center px-4 gap-4">
        <SidebarTrigger />

        <div className="flex-1"></div>

        <div className="flex items-center gap-3">
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 px-3 py-2 bg-secondary rounded-md hover:bg-secondary/80 transition-colors">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col text-left">
                  <span className="text-sm font-medium">{user?.displayName}</span>
                  <span className="text-xs text-muted-foreground font-mono">{user?.domainUser}</span>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
