import { useState } from 'react';
import { 
  Home, Activity, HardDrive, Database, Save, ListTree, Users, Shield, LogOut, Heart, 
  Phone, Calendar, Users as UsersIcon, ShieldAlert, Activity as ActivityIcon, Bell, FileText, Mail,
  ChevronDown, ChevronRight, ArrowRightLeft
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import sqlNovaLightLogo from '/SQLNovaLightMode.png';
import sqlNovaDarkLogo from '/SQLNovaDarkMode.png';
import sqlNovaIcon from '/SQLNovaIcon.png';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

const mainItems = [
  { title: 'Overview', url: '/overview', icon: Home, permission: 'Overview' },
  { title: 'HealthScore', url: '/healthscore', icon: Heart, permission: 'HealthScore' },
  { title: 'Jobs', url: '/jobs', icon: Activity, permission: 'Jobs' },
  { title: 'Discos', url: '/disks', icon: HardDrive, permission: 'Disks' },
  { title: 'Bases de Datos', url: '/databases', icon: Database, permission: 'Databases' },
  { title: 'Backups', url: '/backups', icon: Save, permission: 'Backups' },
  { title: 'Índices', url: '/indexes', icon: ListTree, permission: 'Indexes' },
];

// Submenús de Guardias DBA
const onCallSubItems = [
  { title: 'Dashboard', url: '/oncall/dashboard', icon: Home },
  { title: 'Planificador', url: '/oncall/planner', icon: Calendar },
  { title: 'Intercambios', url: '/oncall/swaps', icon: ArrowRightLeft },
  { title: 'Operadores', url: '/oncall/operators', icon: UsersIcon },
  { title: 'Escalamiento', url: '/oncall/escalation', icon: ShieldAlert },
  { title: 'Activaciones', url: '/oncall/activations', icon: ActivityIcon },
  { title: 'Alertas', url: '/oncall/alerts', icon: Bell },
  { title: 'Reportes', url: '/oncall/reports', icon: FileText },
];

const adminItems = [
  { title: 'Usuarios', url: '/admin/users', icon: Users, permission: 'AdminUsers' },
  { title: 'Permisos', url: '/admin/permissions', icon: Shield, permission: 'AdminPermissions' },
  { title: 'Config. SMTP', url: '/admin/smtp', icon: Mail, permission: 'AdminPermissions' },
];

const superAdminItems: typeof adminItems = [];

export function AppSidebar() {
  const { state } = useSidebar();
  const { isAdmin, isSuperAdmin, hasPermission, logout } = useAuth();
  const isCollapsed = state === 'collapsed';
  const location = useLocation();
  
  // Estado para el menú desplegable de OnCall
  const isOnCallActive = location.pathname.startsWith('/oncall');
  const [onCallOpen, setOnCallOpen] = useState(isOnCallActive);

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  // Filtrar items principales según permisos
  const visibleMainItems = mainItems.filter(item => hasPermission(item.permission));
  const hasOnCallPermission = hasPermission('OnCall');
  
  // Filtrar items de admin según permisos
  const visibleAdminItems = isAdmin ? adminItems.filter(item => hasPermission(item.permission)) : [];
  
  // Items de SuperAdmin
  const visibleSuperAdminItems = isSuperAdmin ? superAdminItems.filter(item => hasPermission(item.permission)) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {/* Logo Section */}
        <div className="h-16 border-b border-sidebar-border flex items-center justify-center px-2 relative">
          <img 
            src={sqlNovaLightLogo} 
            alt="SQL Nova" 
            className={`logo-light h-10 w-auto transition-none ${isCollapsed ? 'hidden' : 'block'}`}
          />
          <img 
            src={sqlNovaDarkLogo} 
            alt="SQL Nova" 
            className={`logo-dark h-10 w-auto transition-none ${isCollapsed ? 'hidden' : 'block'}`}
          />
          <img 
            src={sqlNovaIcon} 
            alt="SQL Nova" 
            className={`h-8 w-8 transition-none ${isCollapsed ? 'block' : 'hidden'}`}
          />
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
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={({ isActive }) =>
                          `w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`
                        }
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
                        {!isCollapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

                {/* Menú desplegable de Guardias DBA */}
                {hasOnCallPermission && (
                  <Collapsible open={onCallOpen} onOpenChange={setOnCallOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isOnCallActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <Phone className="h-4 w-4 flex-shrink-0 text-teal-500" />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left">Guardias DBA</span>
                              {onCallOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </>
                          )}
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      
                      {!isCollapsed && (
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            {onCallSubItems.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    className={({ isActive }) =>
                                      `flex items-center gap-2 text-sm py-1.5 px-2 rounded-md transition-colors ${
                                        isActive
                                          ? 'bg-sidebar-accent/70 text-sidebar-primary font-medium'
                                          : 'hover:bg-sidebar-accent/30 text-muted-foreground'
                                      }`
                                    }
                                  >
                                    <subItem.icon className="h-3.5 w-3.5" />
                                    <span>{subItem.title}</span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            ))}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </SidebarMenuItem>
                  </Collapsible>
                )}
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
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={({ isActive }) =>
                          `w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`
                        }
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
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
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={({ isActive }) =>
                          `w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`
                        }
                      >
                        <item.icon className="h-4 w-4 flex-shrink-0" />
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
                style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                className="w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>Cerrar Sesión</span>}
              </Button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
