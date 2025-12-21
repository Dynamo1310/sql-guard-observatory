import { useState } from 'react';
import { 
  Home, Activity, HardDrive, Database, Save, ListTree, Users, Shield, LogOut, Heart, 
  Phone, Calendar, Users as UsersIcon, ShieldAlert, Activity as ActivityIcon, Bell, FileText, Mail,
  ChevronDown, ChevronRight, ArrowRightLeft, RotateCcw, Wrench, Settings, Cog, ShieldCheck,
  Key, Lock, History, KeyRound, Share2, FolderLock, DatabaseBackup
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
  { title: 'Mantenimiento', url: '/jobs', icon: Activity, permission: 'Jobs' },
  { title: 'Discos', url: '/disks', icon: HardDrive, permission: 'Disks' },
  { title: 'Bases de Datos', url: '/databases', icon: Database, permission: 'Databases' },
  { title: 'Backups', url: '/backups', icon: Save, permission: 'Backups' },
  { title: 'Índices', url: '/indexes', icon: ListTree, permission: 'Indexes' },
];

// Submenús de Parcheos
const patchingSubItems = [
  { title: 'Dashboard', url: '/patching', icon: ShieldCheck, permission: 'Patching' },
  { title: 'Configuración Compliance', url: '/patching/config', icon: Settings, permission: 'PatchingConfig' },
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
  { title: 'Config. SMTP', url: '/admin/smtp', icon: Mail, permission: 'ConfigSMTP' },
];

// Submenús de Alertas (cada alerta tiene su propio permiso)
const alertsSubItems = [
  { title: 'Servidores Caídos', url: '/admin/alerts/servers-down', icon: Bell, permission: 'AlertaServidoresCaidos' },
  // Futuras alertas se agregarán aquí con sus propios permisos
];

// Submenús de Operaciones
const operationsSubItems = [
  { title: 'Reinicio de Servidores', url: '/operations/server-restart', icon: RotateCcw, permission: 'ServerRestart' },
  { title: 'Config. Servidores', url: '/operations/servers-config', icon: Settings, permission: 'OperationsConfig' },
];

// Submenús de Vault DBA (Seguridad)
const vaultSubItems = [
  { title: 'Dashboard', url: '/vault/dashboard', icon: Home, permission: 'VaultDashboard' },
  { title: 'Grupos', url: '/vault/groups', icon: FolderLock, permission: 'VaultCredentials' },
  { title: 'Compartidas Conmigo', url: '/vault/shared-with-me', icon: Share2, permission: 'VaultCredentials' },
  { title: 'Mis Credenciales', url: '/vault/my-credentials', icon: Lock, permission: 'VaultMyCredentials' },
  { title: 'Auditoría', url: '/vault/audit', icon: History, permission: 'VaultAudit' },
  { title: 'Migración Enterprise', url: '/vault/migration', icon: DatabaseBackup, permission: 'VaultMigration', superAdminOnly: true },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { isAdmin, isSuperAdmin, isOnCallEscalation, hasPermission, logout, user } = useAuth();
  const isCollapsed = state === 'collapsed';
  const location = useLocation();
  
  // Estado para el menú desplegable de Parcheos
  const isPatchingActive = location.pathname.startsWith('/patching');
  const [patchingOpen, setPatchingOpen] = useState(isPatchingActive);
  
  // Estado para el menú desplegable de OnCall
  const isOnCallActive = location.pathname.startsWith('/oncall');
  const [onCallOpen, setOnCallOpen] = useState(isOnCallActive);
  
  // Estado para el menú desplegable de Alertas
  const isAlertsActive = location.pathname.startsWith('/admin/alerts');
  const [alertsOpen, setAlertsOpen] = useState(isAlertsActive);
  
  // Estado para la sección de Operaciones (ahora es menú desplegable)
  const isOperationsActive = location.pathname.startsWith('/operations');
  const [operationsOpen, setOperationsOpen] = useState(isOperationsActive);
  
  // Estado para el menú desplegable de Vault DBA
  const isVaultActive = location.pathname.startsWith('/vault');
  const [vaultOpen, setVaultOpen] = useState(isVaultActive);

  const handleLogout = async () => {
    logout();
    // Esperar a que SignalR se desconecte antes de redirigir
    await new Promise(r => setTimeout(r, 500));
    window.location.replace('/login');
  };

  // Filtrar items principales según permisos
  const visibleMainItems = mainItems.filter(item => hasPermission(item.permission));
  const hasOnCallPermission = hasPermission('OnCall');
  
  // Filtrar items de Parcheos según permisos
  const visiblePatchingSubItems = patchingSubItems.filter(item => {
    if (item.permission === 'PatchingConfig') {
      return isSuperAdmin; // Solo SuperAdmin puede configurar compliance
    }
    return hasPermission(item.permission);
  });
  const hasAnyPatchingPermission = visiblePatchingSubItems.length > 0;
  
  // Filtrar items de admin según permisos
  const visibleAdminItems = isAdmin ? adminItems.filter(item => hasPermission(item.permission)) : [];
  
  // Filtrar items de operaciones según permisos
  // OperationsConfig requiere SuperAdmin o IsOnCallEscalation
  const visibleOperationsSubItems = operationsSubItems.filter(item => {
    // ServerRestart usa permisos normales
    if (item.permission === 'ServerRestart') {
      return hasPermission(item.permission);
    }
    // OperationsConfig: mostrar si es SuperAdmin o usuario de escalamiento
    if (item.permission === 'OperationsConfig') {
      return isSuperAdmin || isOnCallEscalation;
    }
    return hasPermission(item.permission);
  });
  
  const hasAnyOperationsPermission = visibleOperationsSubItems.length > 0;
  
  // Filtrar items del Vault según permisos
  const visibleVaultSubItems = vaultSubItems.filter(item => {
    // Items solo para SuperAdmin
    if ('superAdminOnly' in item && item.superAdminOnly) {
      return isSuperAdmin;
    }
    // VaultAudit solo para Admin/SuperAdmin
    if (item.permission === 'VaultAudit') {
      return isAdmin || isSuperAdmin;
    }
    return hasPermission(item.permission);
  });
  const hasAnyVaultPermission = visibleVaultSubItems.length > 0;

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

                {/* Menú desplegable de Parcheos */}
                {hasAnyPatchingPermission && (
                  <Collapsible open={patchingOpen} onOpenChange={setPatchingOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isPatchingActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-blue-500" />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left">Parcheos</span>
                              {patchingOpen ? (
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
                            {visiblePatchingSubItems.map((subItem) => (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    end={subItem.url === '/patching'}
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

        {/* Operaciones */}
        {hasAnyOperationsPermission && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Operaciones
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={operationsOpen} onOpenChange={setOperationsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                          isOperationsActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }`}
                      >
                        <Cog className="h-4 w-4 flex-shrink-0 text-orange-500" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left">Operaciones</span>
                            {operationsOpen ? (
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
                          {visibleOperationsSubItems.map((subItem) => (
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Seguridad - Vault DBA */}
        {hasAnyVaultPermission && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Seguridad
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={vaultOpen} onOpenChange={setVaultOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                          isVaultActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }`}
                      >
                        <KeyRound className="h-4 w-4 flex-shrink-0 text-amber-500" />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left">Vault DBA</span>
                            {vaultOpen ? (
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
                          {visibleVaultSubItems.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.url}>
                              <SidebarMenuSubButton asChild>
                                <NavLink
                                  to={subItem.url}
                                  end={subItem.url === '/vault/dashboard'}
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
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Administración */}
        {(visibleAdminItems.length > 0 || alertsSubItems.some(item => hasPermission(item.permission))) && (
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
                {/* Menú desplegable de Alertas */}
                {alertsSubItems.some(item => hasPermission(item.permission)) && (
                  <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen} className="w-full">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isAlertsActive
                              ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <Bell className="h-4 w-4 flex-shrink-0" />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left">Alertas</span>
                              {alertsOpen ? (
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
                            {alertsSubItems.filter(item => hasPermission(item.permission)).map((subItem) => (
                              <SidebarMenuSubItem key={subItem.title}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    className={({ isActive }) =>
                                      `w-full flex items-center gap-2 p-2 rounded-md text-sm transition-colors ${
                                        isActive
                                          ? 'bg-sidebar-accent text-sidebar-primary font-medium'
                                          : 'hover:bg-sidebar-accent/50'
                                      }`
                                    }
                                  >
                                    <subItem.icon className="h-4 w-4" />
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
