import { Home, Activity, HardDrive, Database, Save, ListTree, Users, Shield, LogOut, Heart, HeartPulse } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import supvLogo from '/SUPV.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const mainItems = [
  { title: 'Overview', url: '/overview', icon: Home, permission: 'Overview' },
  { title: 'HealthScore', url: '/healthscore', icon: Heart, permission: 'HealthScore' },
  { title: 'HealthScore V2', url: '/healthscore-v2', icon: HeartPulse, permission: 'HealthScore' },
  { title: 'Jobs', url: '/jobs', icon: Activity, permission: 'Jobs' },
  { title: 'Discos', url: '/disks', icon: HardDrive, permission: 'Disks' },
  { title: 'Bases de Datos', url: '/databases', icon: Database, permission: 'Databases' },
  { title: 'Backups', url: '/backups', icon: Save, permission: 'Backups' },
  { title: 'Índices', url: '/indexes', icon: ListTree, permission: 'Indexes' },
];

const adminItems = [
  { title: 'Usuarios', url: '/admin/users', icon: Users, permission: 'AdminUsers' },
];

const superAdminItems = [
  { title: 'Permisos', url: '/admin/permissions', icon: Shield, permission: 'AdminPermissions' },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { isAdmin, isSuperAdmin, hasPermission, logout } = useAuth();
  const isCollapsed = state === 'collapsed';

  const handleLogout = () => {
    logout();
    // Forzar redirección a login
    window.location.href = '/login';
  };

  // Filtrar items principales según permisos
  const visibleMainItems = mainItems.filter(item => hasPermission(item.permission));
  
  // Filtrar items de admin según permisos
  const visibleAdminItems = isAdmin ? adminItems.filter(item => hasPermission(item.permission)) : [];
  
  // Items de SuperAdmin - verificar TAMBIÉN con hasPermission
  const visibleSuperAdminItems = isSuperAdmin ? superAdminItems.filter(item => hasPermission(item.permission)) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo Section */}
        <div className="p-2 border-b border-sidebar-border">
          <div className="flex justify-center">
            <img 
              src={supvLogo} 
              alt="Supervielle" 
              className={isCollapsed ? "h-8 w-auto" : "h-9 w-auto"}
            />
          </div>
        </div>
        
        {/* Observabilidad */}
        {visibleMainItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Observabilidad
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMainItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={({ isActive }) =>
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administración */}
        {(visibleAdminItems.length > 0 || visibleSuperAdminItems.length > 0) && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Administración
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={({ isActive }) =>
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
                {visibleSuperAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        className={({ isActive }) =>
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Button
                onClick={handleLogout}
                variant="ghost"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                {!isCollapsed && <span>Cerrar Sesión</span>}
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
