import { useState, useEffect } from 'react';
import { 
  Home, Activity, HardDrive, Database, Save, ListTree, Users, Shield, LogOut, Heart, 
  Phone, Calendar, Users as UsersIcon, ShieldAlert, Activity as ActivityIcon, Bell, FileText, Mail,
  ChevronDown, ChevronRight, ArrowRightLeft, RotateCcw, Wrench, Settings, Cog, ShieldCheck,
  Key, Lock, History, KeyRound, Share2, FolderLock, Sparkles
} from 'lucide-react';
import { menuBadgesApi, MenuBadgeDto } from '@/services/api';
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
  { title: 'Config. Compliance', url: '/patching/config', icon: Settings, permission: 'PatchingConfig' },
];

// Submenús de Guardias DBA
const onCallSubItems = [
  { title: 'Dashboard', url: '/oncall/dashboard', icon: Home, permission: 'OnCallDashboard' },
  { title: 'Planificador', url: '/oncall/planner', icon: Calendar, permission: 'OnCallPlanner' },
  { title: 'Intercambios', url: '/oncall/swaps', icon: ArrowRightLeft, permission: 'OnCallSwaps' },
  { title: 'Operadores', url: '/oncall/operators', icon: UsersIcon, permission: 'OnCallOperators' },
  { title: 'Escalamiento', url: '/oncall/escalation', icon: ShieldAlert, permission: 'OnCallEscalation' },
  { title: 'Activaciones', url: '/oncall/activations', icon: ActivityIcon, permission: 'OnCallActivations' },
  { title: 'Alertas', url: '/oncall/alerts', icon: Bell, permission: 'OnCallAlerts' },
  { title: 'Reportes', url: '/oncall/reports', icon: FileText, permission: 'OnCallReports' },
];

const adminItems = [
  { title: 'Usuarios', url: '/admin/users', icon: Users, permission: 'AdminUsers' },
  { title: 'Grupos', url: '/admin/groups', icon: UsersIcon, permission: 'AdminGroups' },
  { title: 'Permisos', url: '/admin/permissions', icon: Shield, permission: 'AdminPermissions' },
  { title: 'Config. SMTP', url: '/admin/smtp', icon: Mail, permission: 'ConfigSMTP' },
  { title: 'Cred. Sistema', url: '/admin/system-credentials', icon: Key, permission: 'SystemCredentials' },
  { title: 'Collectors', url: '/admin/collectors', icon: Cog, permission: 'AdminCollectors' },
];

// Submenús de Alertas (cada alerta tiene su propio permiso)
const alertsSubItems = [
  { title: 'Servidores Caídos', url: '/admin/alerts/servers-down', icon: Bell, permission: 'AlertaServidoresCaidos' },
  { title: 'Resumen Overview', url: '/admin/alerts/overview-summary', icon: FileText, permission: 'AlertaResumenOverview' },
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
  { title: 'Mis Notificaciones', url: '/vault/notifications', icon: Bell, permission: 'VaultNotifications' },
  { title: 'Auditoría', url: '/vault/audit', icon: History, permission: 'VaultAudit' },
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

  // Estado para los badges de menú "Nuevo"
  const [menuBadges, setMenuBadges] = useState<MenuBadgeDto[]>([]);
  
  // Cargar badges al montar el componente
  useEffect(() => {
    const loadBadges = async () => {
      try {
        const badges = await menuBadgesApi.getAllBadges();
        setMenuBadges(badges);
      } catch (error) {
        console.error('Error loading menu badges:', error);
      }
    };
    loadBadges();
  }, []);

  // Helper para obtener el badge de un menú
  const getMenuBadge = (menuKey: string) => {
    return menuBadges.find(b => b.menuKey === menuKey && b.isNew);
  };

  // Helper para obtener el color del badge como estilo
  const getBadgeColor = (color: string): string => {
    const colorMap: Record<string, string> = {
      'green': '#22c55e',
      'blue': '#3b82f6',
      'purple': '#a855f7',
      'orange': '#f97316',
      'red': '#ef4444',
      'yellow': '#eab308',
      'pink': '#ec4899',
      'teal': '#14b8a6',
    };
    return colorMap[color] || colorMap['green'];
  };

  // Componente de badge reutilizable
  const MenuBadgeTag = ({ menuKey }: { menuKey: string }) => {
    const badge = getMenuBadge(menuKey);
    if (!badge) return null;
    return (
      <span 
        className="text-[9px] px-1 py-0.5 rounded font-medium text-white ml-1"
        style={{ backgroundColor: getBadgeColor(badge.badgeColor) }}
      >
        {badge.badgeText}
      </span>
    );
  };

  const handleLogout = async () => {
    logout();
    // Esperar a que SignalR se desconecte antes de redirigir
    await new Promise(r => setTimeout(r, 500));
    window.location.replace('/login');
  };

  // Filtrar items principales según permisos
  const visibleMainItems = mainItems.filter(item => hasPermission(item.permission));
  
  // ======= PARCHEOS =======
  // Verificar permiso del menú padre + submenús visibles
  const hasPatchingMenuPermission = hasPermission('PatchingMenu');
  const visiblePatchingSubItems = patchingSubItems.filter(item => {
    if (item.permission === 'PatchingConfig') {
      return isSuperAdmin || isAdmin; // SuperAdmin y Admin pueden configurar compliance
    }
    return hasPermission(item.permission);
  });
  const showPatchingMenu = hasPatchingMenuPermission && visiblePatchingSubItems.length > 0;
  
  // ======= GUARDIAS DBA =======
  // Verificar permiso del menú padre + submenús visibles
  const hasOnCallMenuPermission = hasPermission('OnCall');
  const visibleOnCallSubItems = onCallSubItems.filter(item => hasPermission(item.permission));
  const showOnCallMenu = hasOnCallMenuPermission && visibleOnCallSubItems.length > 0;
  
  // Filtrar items de admin según permisos
  const visibleAdminItems = isAdmin ? adminItems.filter(item => hasPermission(item.permission)) : [];
  
  // ======= OPERACIONES =======
  // Verificar permiso del menú padre + submenús visibles
  const hasOperationsMenuPermission = hasPermission('OperationsMenu');
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
  const showOperationsMenu = hasOperationsMenuPermission && visibleOperationsSubItems.length > 0;
  
  // ======= VAULT DBA =======
  // Verificar permiso del menú padre + submenús visibles
  const hasVaultMenuPermission = hasPermission('VaultMenu');
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
  const showVaultMenu = hasVaultMenuPermission && visibleVaultSubItems.length > 0;

  return (
    <Sidebar collapsible="icon">
      {/* Logo Section - Fuera del SidebarContent para que no se comprima */}
      <div className="h-16 min-h-16 flex-shrink-0 border-b border-sidebar-border flex items-center justify-center px-2">
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

      <SidebarContent className="overflow-y-auto">
        {/* Observabilidad */}
        {visibleMainItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Observabilidad
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMainItems.map((item) => {
                  const isItemActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end
                          style={{
                            ...(isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : {}),
                            ...(isItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {})
                          }}
                          className="w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent/50"
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" style={isItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                          {!isCollapsed && (
                            <span className="flex items-center">
                              {item.title}
                              <MenuBadgeTag menuKey={item.permission} />
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}

                {/* Menú desplegable de Parcheos */}
                {showPatchingMenu && (
                  <Collapsible open={patchingOpen || isPatchingActive} onOpenChange={setPatchingOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isPatchingActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <ShieldCheck className={`h-4 w-4 flex-shrink-0 ${isPatchingActive ? 'text-primary' : 'text-blue-500'}`} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left flex items-center">
                                Parcheos
                                <MenuBadgeTag menuKey="PatchingMenu" />
                              </span>
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
                            {visiblePatchingSubItems.map((subItem) => {
                              const isSubItemActive = location.pathname === subItem.url;
                              return (
                                <SidebarMenuSubItem key={subItem.url}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={subItem.url}
                                      end={subItem.url === '/patching'}
                                      style={isSubItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {}}
                                      className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md transition-colors hover:bg-sidebar-accent/30 text-muted-foreground"
                                    >
                                      <subItem.icon className="h-3.5 w-3.5" style={isSubItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                                      <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      )}
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {/* Menú desplegable de Guardias DBA */}
                {showOnCallMenu && (
                  <Collapsible open={onCallOpen || isOnCallActive} onOpenChange={setOnCallOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isOnCallActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <Phone className={`h-4 w-4 flex-shrink-0 ${isOnCallActive ? 'text-primary' : 'text-teal-500'}`} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left flex items-center">
                                Guardias DBA
                                <MenuBadgeTag menuKey="OnCall" />
                              </span>
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
                            {visibleOnCallSubItems.map((subItem) => {
                              const isSubItemActive = location.pathname === subItem.url;
                              return (
                                <SidebarMenuSubItem key={subItem.url}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={subItem.url}
                                      style={isSubItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {}}
                                      className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md transition-colors hover:bg-sidebar-accent/30 text-muted-foreground"
                                    >
                                      <subItem.icon className="h-3.5 w-3.5" style={isSubItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                                      <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
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
        {showOperationsMenu && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Operaciones
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={operationsOpen || isOperationsActive} onOpenChange={setOperationsOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                          isOperationsActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }`}
                      >
                        <Cog className={`h-4 w-4 flex-shrink-0 ${isOperationsActive ? 'text-primary' : 'text-orange-500'}`} />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left flex items-center">
                              Operaciones
                              <MenuBadgeTag menuKey="OperationsMenu" />
                            </span>
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
                          {visibleOperationsSubItems.map((subItem) => {
                            const isSubItemActive = location.pathname === subItem.url;
                            return (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    style={isSubItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {}}
                                    className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md transition-colors hover:bg-sidebar-accent/30 text-muted-foreground"
                                  >
                                    <subItem.icon className="h-3.5 w-3.5" style={isSubItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                                    <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
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
        {showVaultMenu && (
          <SidebarGroup>
            <SidebarGroupLabel className={isCollapsed ? 'sr-only' : ''}>
              Seguridad
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible open={vaultOpen || isVaultActive} onOpenChange={setVaultOpen}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                        className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                          isVaultActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'hover:bg-sidebar-accent/50'
                        }`}
                      >
                        <KeyRound className={`h-4 w-4 flex-shrink-0 ${isVaultActive ? 'text-primary' : 'text-amber-500'}`} />
                        {!isCollapsed && (
                          <>
                            <span className="flex-1 text-left flex items-center">
                              Vault DBA
                              <MenuBadgeTag menuKey="VaultMenu" />
                            </span>
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
                          {visibleVaultSubItems.map((subItem) => {
                            const isSubItemActive = location.pathname === subItem.url;
                            return (
                              <SidebarMenuSubItem key={subItem.url}>
                                <SidebarMenuSubButton asChild>
                                  <NavLink
                                    to={subItem.url}
                                    end={subItem.url === '/vault/dashboard'}
                                    style={isSubItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {}}
                                    className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-md transition-colors hover:bg-sidebar-accent/30 text-muted-foreground"
                                  >
                                    <subItem.icon className="h-3.5 w-3.5" style={isSubItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                                    <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                                  </NavLink>
                                </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                            );
                          })}
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
                {visibleAdminItems.map((item) => {
                  const isItemActive = location.pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          style={{
                            ...(isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : {}),
                            ...(isItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {})
                          }}
                          className="w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent/50"
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" style={isItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                          {!isCollapsed && (
                            <span className="flex items-center">
                              {item.title}
                              {item.permission === 'ConfigSMTP' && <MenuBadgeTag menuKey="ConfigSMTP" />}
                            </span>
                          )}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
                {/* Menú de configuración de badges (Solo SuperAdmin) */}
                {isSuperAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to="/admin/menu-badges"
                        style={{
                          ...(isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : {}),
                          ...(location.pathname === '/admin/menu-badges' ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {})
                        }}
                        className="w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent/50"
                      >
                        <Sparkles className="h-4 w-4 flex-shrink-0 text-green-500" style={location.pathname === '/admin/menu-badges' ? { color: 'hsl(var(--primary))' } : {}} />
                        {!isCollapsed && <span>Indicadores Menú</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Menú desplegable de Alertas */}
                {alertsSubItems.some(item => hasPermission(item.permission)) && (
                  <Collapsible open={alertsOpen || isAlertsActive} onOpenChange={setAlertsOpen} className="w-full">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton
                          style={isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : undefined}
                          className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${
                            isAlertsActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'hover:bg-sidebar-accent/50'
                          }`}
                        >
                          <Bell className={`h-4 w-4 flex-shrink-0 ${isAlertsActive ? 'text-primary' : ''}`} />
                          {!isCollapsed && (
                            <>
                              <span className="flex-1 text-left flex items-center">
                                Alertas
                                <MenuBadgeTag menuKey="AlertsMenu" />
                              </span>
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
                            {alertsSubItems.filter(item => hasPermission(item.permission)).map((subItem) => {
                              const isSubItemActive = location.pathname === subItem.url;
                              return (
                                <SidebarMenuSubItem key={subItem.title}>
                                  <SidebarMenuSubButton asChild>
                                    <NavLink
                                      to={subItem.url}
                                      style={isSubItemActive ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', fontWeight: 500 } : {}}
                                      className="w-full flex items-center gap-2 p-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent/50"
                                    >
                                      <subItem.icon className="h-4 w-4" style={isSubItemActive ? { color: 'hsl(var(--primary))' } : {}} />
                                      <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                                    </NavLink>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
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
