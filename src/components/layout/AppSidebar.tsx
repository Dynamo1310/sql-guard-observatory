import { useState, useEffect, useCallback } from 'react';
import {
  Home, Activity, HardDrive, Database, Save, ListTree, Users, Heart,
  Phone, Calendar, CalendarDays, Users as UsersIcon, ShieldAlert, Activity as ActivityIcon, Bell, FileText, Mail,
  ChevronDown, ChevronRight, ArrowRightLeft, RotateCcw, Settings, Cog, ShieldCheck, Clock,
  Key, Lock, History, KeyRound, Share2, FolderLock, Sparkles, Server, Zap, Tag, AlertTriangle, TrendingUp,
  Snowflake, Play, BookOpen, LayoutDashboard, Swords
} from 'lucide-react';
import { menuBadgesApi, MenuBadgeDto, overviewApi } from '@/services/api';
import { NavLink, useLocation } from 'react-router-dom';
// Logos para modo claro y oscuro
import sqlNovaBlackLogo from '/SQLNovaBlackLogo.svg';
import sqlNovaWhiteLogo from '/SQLNovaWhiteLogo.svg';
// Símbolos para sidebar colapsado
import sqlNovaSymbolBlack from '/SQLNovaSymbolBlack.svg';
import sqlNovaSymbolWhite from '/SQLNovaSymbolWhite.svg';
// Íconos de bases de datos para modo claro y oscuro
import { SqlServerIcon } from '@/components/icons/SqlServerIcon';
import { PostgreSqlIcon } from '@/components/icons/PostgreSqlIcon';
import { RedisIcon } from '@/components/icons/RedisIcon';
import { DocumentDbIcon } from '@/components/icons/DocumentDbIcon';
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
  useSidebar,
} from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

// ==================== OBSERVABILIDAD ====================

// Submenús de Monitoreo (HealthScore + Collectors)
const monitoreoSubItems = [
  { title: 'HealthScore', url: '/healthscore', icon: Heart, permission: 'HealthScore' },
  { title: 'Collectors', url: '/admin/collectors', icon: Cog, permission: 'AdminCollectors' },
];

// Submenús de Infraestructura
const infraestructuraSubItems = [
  { title: 'Discos', url: '/disks', icon: HardDrive, permission: 'Disks' },
  { title: 'Backups', url: '/backups', icon: Save, permission: 'Backups' },
];

// ==================== INVENTARIO ====================

// Submenús de Inventario SQL Server (usan el ícono personalizado de SQL Server)
const inventarioSqlServerSubItems = [
  { title: 'Instancias', url: '/inventory/sqlserver/instances', icon: SqlServerIcon, permission: 'InventarioSqlServerInstances' },
  { title: 'DBs', url: '/inventory/sqlserver/databases', icon: SqlServerIcon, permission: 'InventarioSqlServerDatabases' },
];

// Submenús de Inventario PostgreSQL (usan el ícono personalizado de PostgreSQL)
const inventarioPostgreSqlSubItems = [
  { title: 'Instancias', url: '/inventory/postgresql/instances', icon: PostgreSqlIcon, permission: 'InventarioPostgreSqlInstances' },
  { title: 'DBs', url: '/inventory/postgresql/databases', icon: PostgreSqlIcon, permission: 'InventarioPostgreSqlDatabases' },
];

// Submenús de Inventario Redis (usan el ícono personalizado de Redis)
const inventarioRedisSubItems = [
  { title: 'Instancias', url: '/inventory/redis/instances', icon: RedisIcon, permission: 'InventarioRedisInstances' },
];

// Submenús de Inventario DocumentDB (usan el ícono personalizado de DocumentDB)
const inventarioDocumentDbSubItems = [
  { title: 'Instancias', url: '/inventory/documentdb/instances', icon: DocumentDbIcon, permission: 'InventarioDocumentDbInstances' },
];

// Submenús de Rendimiento
const rendimientoSubItems = [
  { title: 'Mantenimiento', url: '/jobs', icon: Activity, permission: 'Jobs' },
  { title: 'Índices', url: '/indexes', icon: ListTree, permission: 'Indexes' },
];

// Submenús de Parcheos
const patchingSubItems = [
  { title: 'Dashboard', url: '/patching', icon: LayoutDashboard, permission: 'Patching' },
  { title: 'Planificador', url: '/patching/planner', icon: CalendarDays, permission: 'PatchPlanner' },
  { title: 'Calendario', url: '/patching/calendar', icon: Calendar, permission: 'PatchCalendar' },
  { title: 'Vista Célula', url: '/patching/cell', icon: Users, permission: 'PatchCellView' },
  { title: 'Ejecución', url: '/patching/execute', icon: Play, permission: 'PatchExecution' },
  { title: 'Inst. Obsoletas', url: '/patching/obsolete', icon: Clock, permission: 'ObsoleteInstances' },
  { title: 'Config. Freezing', url: '/patching/freezing-config', icon: Snowflake, permission: 'PatchFreezingConfig' },
  { title: 'Config. Notificaciones', url: '/patching/notifications-config', icon: Bell, permission: 'PatchNotificationsConfig' },
  { title: 'Config. Compliance', url: '/patching/config', icon: Settings, permission: 'PatchingConfig' },
];

// ==================== KNOWLEDGE BASE ====================

// Submenús de Knowledge Base
const knowledgeBaseSubItems = [
  { title: 'Owners de BD', url: '/knowledge/database-owners', icon: BookOpen, permission: 'DatabaseOwners' },
];

// ==================== GUARDIAS DBA ====================

const onCallSubItems = [
  { title: 'Dashboard', url: '/oncall/dashboard', icon: Home, permission: 'OnCallDashboard' },
  { title: 'Planificador', url: '/oncall/planner', icon: Calendar, permission: 'OnCallPlanner' },
  { title: 'Intercambios', url: '/oncall/swaps', icon: ArrowRightLeft, permission: 'OnCallSwaps' },
  { title: 'Operadores', url: '/oncall/operators', icon: UsersIcon, permission: 'OnCallOperators' },
  { title: 'Escalamiento', url: '/oncall/escalation', icon: ShieldAlert, permission: 'OnCallEscalation' },
  { title: 'Activaciones', url: '/oncall/activations', icon: ActivityIcon, permission: 'OnCallActivations' },
  { title: 'Notificaciones', url: '/oncall/alerts', icon: Bell, permission: 'OnCallAlerts' },
  { title: 'Reportes', url: '/oncall/reports', icon: FileText, permission: 'OnCallReports' },
  { title: 'Configuración', url: '/oncall/settings', icon: Settings, permission: 'OnCallConfig' },
];

// ==================== OPERACIONES ====================

const operationsSubItems = [
  { title: 'Reinicio de Servidores', url: '/operations/server-restart', icon: RotateCcw, permission: 'ServerRestart' },
  { title: 'Config. Servidores', url: '/operations/servers-config', icon: Settings, permission: 'OperationsConfig' },
];

// ==================== INTERVENCIONES ====================

const intervencionesSubItems = [
  { title: 'Intervenciones', url: '/intervenciones', icon: Swords, permission: 'IntervencionesWar' },
];

// ==================== PROYECTOS ====================

const projectsSubItems = [
  { title: 'Racionalización SQL', url: '/projects/bases-sin-uso', icon: Database, permission: 'BasesSinUso' },
];

// ==================== SEGURIDAD ====================

// Submenús de Vault DBA
const vaultSubItems = [
  { title: 'Dashboard', url: '/vault/dashboard', icon: Home, permission: 'VaultDashboard' },
  { title: 'Grupos', url: '/vault/groups', icon: FolderLock, permission: 'VaultCredentials' },
  { title: 'Compartidas Conmigo', url: '/vault/shared-with-me', icon: Share2, permission: 'VaultCredentials' },
  { title: 'Mis Credenciales', url: '/vault/my-credentials', icon: Lock, permission: 'VaultMyCredentials' },
  { title: 'Cred. Sistema', url: '/vault/system-credentials', icon: Key, permission: 'SystemCredentials' },
  { title: 'Mis Notificaciones', url: '/vault/notifications', icon: Bell, permission: 'VaultNotifications' },
  { title: 'Auditoría', url: '/vault/audit', icon: History, permission: 'VaultAudit' },
];

// ==================== ADMINISTRACIÓN ====================

// Submenús de Control de Acceso
const controlAccesoSubItems = [
  { title: 'Usuarios', url: '/admin/users', icon: Users, permission: 'AdminUsers' },
  { title: 'Grupos', url: '/admin/groups', icon: UsersIcon, permission: 'AdminGroups' },
  { title: 'Roles', url: '/admin/roles', icon: ShieldCheck, permission: 'AdminRoles' },
];

// Submenús de Configuración
const configuracionSubItems = [
  { title: 'Config. SMTP', url: '/admin/smtp', icon: Mail, permission: 'ConfigSMTP' },
  { title: 'Etiquetas de Menú', url: '/admin/menu-badges', icon: Tag, permission: 'AdminMenuBadges' },
];

// Submenús de Monitoreo Sistema
const monitoreoSistemaSubItems = [
  { title: 'Logs API', url: '/admin/logs', icon: FileText, permission: 'AdminLogs' },
];

// Submenús de Alertas (dentro de Monitoreo Sistema)
const alertsSubItems = [
  { title: 'Servidores Caídos', url: '/admin/alerts/servers-down', icon: Bell, permission: 'AlertaServidoresCaidos' },
  { title: 'Backups Atrasados', url: '/admin/alerts/backups', icon: Save, permission: 'AlertaBackups' },
  { title: 'Discos Críticos', url: '/admin/alerts/disks', icon: HardDrive, permission: 'AlertaDiscosCriticos' },
  { title: 'Resumen Overview', url: '/admin/alerts/overview-summary', icon: FileText, permission: 'AlertaResumenOverview' },
  { title: 'Excepciones', url: '/admin/server-exceptions', icon: ShieldAlert, permission: 'AdminServerExceptions' },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const { hasPermission } = useAuth();
  const isCollapsed = state === 'collapsed';
  const location = useLocation();

  // ==================== ESTADOS DE MENÚS COLAPSABLES ====================

  // Observabilidad
  const isMonitoreoActive = location.pathname === '/healthscore' || location.pathname === '/admin/collectors';
  const [monitoreoOpen, setMonitoreoOpen] = useState(isMonitoreoActive);

  const isInfraestructuraActive = ['/disks', '/backups'].includes(location.pathname);
  const [infraestructuraOpen, setInfraestructuraOpen] = useState(isInfraestructuraActive);

  // Inventario
  const isInventarioSqlServerActive = location.pathname.startsWith('/inventory/sqlserver');
  const [inventarioSqlServerOpen, setInventarioSqlServerOpen] = useState(isInventarioSqlServerActive);

  const isInventarioPostgreSqlActive = location.pathname.startsWith('/inventory/postgresql');
  const [inventarioPostgreSqlOpen, setInventarioPostgreSqlOpen] = useState(isInventarioPostgreSqlActive);

  const isInventarioRedisActive = location.pathname.startsWith('/inventory/redis');
  const [inventarioRedisOpen, setInventarioRedisOpen] = useState(isInventarioRedisActive);

  const isInventarioDocumentDbActive = location.pathname.startsWith('/inventory/documentdb');
  const [inventarioDocumentDbOpen, setInventarioDocumentDbOpen] = useState(isInventarioDocumentDbActive);

  const isRendimientoActive = ['/jobs', '/indexes'].includes(location.pathname);
  const [rendimientoOpen, setRendimientoOpen] = useState(isRendimientoActive);

  const isPatchingActive = location.pathname.startsWith('/patching');
  const [patchingOpen, setPatchingOpen] = useState(isPatchingActive);

  // Knowledge Base
  const isKnowledgeBaseActive = location.pathname.startsWith('/knowledge');
  const [knowledgeBaseOpen, setKnowledgeBaseOpen] = useState(isKnowledgeBaseActive);

  // Guardias DBA
  const isOnCallActive = location.pathname.startsWith('/oncall');
  const [onCallOpen, setOnCallOpen] = useState(isOnCallActive);

  // Operaciones
  const isOperationsActive = location.pathname.startsWith('/operations');
  const [operationsOpen, setOperationsOpen] = useState(isOperationsActive);

  // Intervenciones
  const isIntervencionesActive = location.pathname.startsWith('/intervenciones');
  const [intervencionesOpen, setIntervencionesOpen] = useState(isIntervencionesActive);

  // Proyectos
  const isProjectsActive = location.pathname.startsWith('/projects');
  const [projectsOpen, setProjectsOpen] = useState(isProjectsActive);

  // Seguridad
  const isVaultActive = location.pathname.startsWith('/vault');
  const [vaultOpen, setVaultOpen] = useState(isVaultActive);

  // Administración
  const isControlAccesoActive = ['/admin/users', '/admin/groups', '/admin/roles'].some(p => location.pathname.startsWith(p));
  const [controlAccesoOpen, setControlAccesoOpen] = useState(isControlAccesoActive);

  const isConfiguracionActive = ['/admin/smtp', '/admin/menu-badges'].includes(location.pathname);
  const [configuracionOpen, setConfiguracionOpen] = useState(isConfiguracionActive);

  const isMonitoreoSistemaActive = location.pathname === '/admin/logs';
  const [monitoreoSistemaOpen, setMonitoreoSistemaOpen] = useState(isMonitoreoSistemaActive);

  const isAlertsActive = location.pathname.startsWith('/admin/alerts') || location.pathname === '/admin/server-exceptions';
  const [alertsOpen, setAlertsOpen] = useState(isAlertsActive);

  // Estado para los badges de menú "Nuevo"
  const [menuBadges, setMenuBadges] = useState<MenuBadgeDto[]>([]);

  // Estado para indicadores de salud en tiempo real
  const [healthStats, setHealthStats] = useState<{ critical: number; warning: number; total: number }>({
    critical: 0, warning: 0, total: 0
  });

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

  // Cargar estadísticas de salud para indicadores del sidebar
  // Usa el caché del Overview para evitar queries pesadas
  const loadHealthStats = useCallback(async (retryCount = 0) => {
    try {
      const overviewData = await overviewApi.getOverviewData();
      setHealthStats({
        critical: overviewData.criticalCount,
        warning: overviewData.warningCount + overviewData.riskCount,
        total: overviewData.totalInstances
      });

      // Si recibimos datos vacíos (caché aún poblándose), reintentar después de 2 segundos
      // Máximo 3 reintentos
      if (overviewData.totalInstances === 0 && retryCount < 3) {
        setTimeout(() => {
          loadHealthStats(retryCount + 1);
        }, 2000);
      }
    } catch (error) {
      console.error('Error loading health stats:', error);
    }
  }, []);

  useEffect(() => {
    loadHealthStats();
    // Actualizar cada 2 minutos
    const interval = setInterval(() => loadHealthStats(), 120000);
    return () => clearInterval(interval);
  }, [loadHealthStats]);

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

  // Componente de indicador de estado (dot pulsante)
  const StatusDot = ({ status, count }: { status: 'critical' | 'warning' | 'healthy'; count?: number }) => {
    const colors = {
      critical: 'bg-red-500',
      warning: 'bg-warning',
      healthy: 'bg-emerald-500',
    };

    if (count === 0) return null;

    return (
      <span className="relative flex items-center ml-auto">
        {count !== undefined && count > 0 && (
          <span className={`text-[10px] font-medium mr-1 ${status === 'critical' ? 'text-red-500' : status === 'warning' ? 'text-warning' : 'text-emerald-500'}`}>
            {count}
          </span>
        )}
        <span className={`relative flex h-2 w-2 ${colors[status]} rounded-full`}>
          {status === 'critical' && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${colors[status]} opacity-75`} />
          )}
        </span>
      </span>
    );
  };

  // ==================== VERIFICACIÓN DE PERMISOS ====================
  // Los menús contenedores requieren su permiso específico + al menos un subitem visible

  // Observabilidad
  const hasOverviewPermission = hasPermission('Overview');

  const hasMonitoreoMenuPermission = hasPermission('MonitoreoMenu');
  const visibleMonitoreoSubItems = monitoreoSubItems.filter(item => hasPermission(item.permission));
  const showMonitoreoMenu = hasMonitoreoMenuPermission && visibleMonitoreoSubItems.length > 0;

  const hasInfraestructuraMenuPermission = hasPermission('InfraestructuraMenu');
  const visibleInfraestructuraSubItems = infraestructuraSubItems.filter(item => hasPermission(item.permission));
  const showInfraestructuraMenu = hasInfraestructuraMenuPermission && visibleInfraestructuraSubItems.length > 0;

  const hasRendimientoMenuPermission = hasPermission('RendimientoMenu');
  const visibleRendimientoSubItems = rendimientoSubItems.filter(item => hasPermission(item.permission));
  const showRendimientoMenu = hasRendimientoMenuPermission && visibleRendimientoSubItems.length > 0;

  const hasPatchingMenuPermission = hasPermission('PatchingMenu');
  const visiblePatchingSubItems = patchingSubItems.filter(item => hasPermission(item.permission));
  const showPatchingMenu = hasPatchingMenuPermission && visiblePatchingSubItems.length > 0;

  // Knowledge Base
  const hasKnowledgeBaseMenuPermission = hasPermission('KnowledgeBaseMenu');
  const visibleKnowledgeBaseSubItems = knowledgeBaseSubItems.filter(item => hasPermission(item.permission));
  const showKnowledgeBaseMenu = hasKnowledgeBaseMenuPermission && visibleKnowledgeBaseSubItems.length > 0;

  // Inventario
  const hasInventarioMenuPermission = hasPermission('InventarioMenu');

  const visibleInventarioSqlServerSubItems = inventarioSqlServerSubItems.filter(item => hasPermission(item.permission));
  const showInventarioSqlServerMenu = hasInventarioMenuPermission && visibleInventarioSqlServerSubItems.length > 0;

  const visibleInventarioPostgreSqlSubItems = inventarioPostgreSqlSubItems.filter(item => hasPermission(item.permission));
  const showInventarioPostgreSqlMenu = hasInventarioMenuPermission && visibleInventarioPostgreSqlSubItems.length > 0;

  const visibleInventarioRedisSubItems = inventarioRedisSubItems.filter(item => hasPermission(item.permission));
  const showInventarioRedisMenu = hasInventarioMenuPermission && visibleInventarioRedisSubItems.length > 0;

  const visibleInventarioDocumentDbSubItems = inventarioDocumentDbSubItems.filter(item => hasPermission(item.permission));
  const showInventarioDocumentDbMenu = hasInventarioMenuPermission && visibleInventarioDocumentDbSubItems.length > 0;

  const showInventarioSection = showInventarioSqlServerMenu || showInventarioPostgreSqlMenu || showInventarioRedisMenu || showInventarioDocumentDbMenu;

  // Guardias DBA
  const hasOnCallMenuPermission = hasPermission('OnCall');
  const visibleOnCallSubItems = onCallSubItems.filter(item => hasPermission(item.permission));
  const showOnCallMenu = hasOnCallMenuPermission && visibleOnCallSubItems.length > 0;

  // Operaciones
  const hasOperationsMenuPermission = hasPermission('OperationsMenu');
  const visibleOperationsSubItems = operationsSubItems.filter(item => hasPermission(item.permission));
  const showOperationsMenu = hasOperationsMenuPermission && visibleOperationsSubItems.length > 0;

  // Intervenciones
  const hasIntervencionesMenuPermission = hasPermission('IntervencionesMenu');
  const visibleIntervencionesSubItems = intervencionesSubItems.filter(item => hasPermission(item.permission));
  const showIntervencionesMenu = hasIntervencionesMenuPermission && visibleIntervencionesSubItems.length > 0;

  // Proyectos
  const hasProjectsMenuPermission = hasPermission('ProjectsMenu');
  const visibleProjectsSubItems = projectsSubItems.filter(item => hasPermission(item.permission));
  const showProjectsMenu = hasProjectsMenuPermission && visibleProjectsSubItems.length > 0;

  // Seguridad
  const hasVaultMenuPermission = hasPermission('VaultMenu');
  const visibleVaultSubItems = vaultSubItems.filter(item => hasPermission(item.permission));
  const showVaultMenu = hasVaultMenuPermission && visibleVaultSubItems.length > 0;
  const showSecuritySection = showVaultMenu;

  // Administración
  const hasControlAccesoMenuPermission = hasPermission('ControlAccesoMenu');
  const visibleControlAccesoSubItems = controlAccesoSubItems.filter(item => hasPermission(item.permission));
  const showControlAccesoMenu = hasControlAccesoMenuPermission && visibleControlAccesoSubItems.length > 0;

  const hasConfiguracionMenuPermission = hasPermission('ConfiguracionMenu');
  const visibleConfiguracionSubItems = configuracionSubItems.filter(item => hasPermission(item.permission));
  const showConfiguracionMenu = hasConfiguracionMenuPermission && visibleConfiguracionSubItems.length > 0;

  const hasMonitoreoSistemaMenuPermission = hasPermission('MonitoreoSistemaMenu');
  const visibleMonitoreoSistemaSubItems = monitoreoSistemaSubItems.filter(item => hasPermission(item.permission));
  const showMonitoreoSistemaMenu = hasMonitoreoSistemaMenuPermission && visibleMonitoreoSistemaSubItems.length > 0;

  const hasAlertsMenuPermission = hasPermission('AlertsMenu');
  const visibleAlertsSubItems = alertsSubItems.filter(item => hasPermission(item.permission));
  const showAlertsMenu = hasAlertsMenuPermission && visibleAlertsSubItems.length > 0;

  const showAdminSection = showControlAccesoMenu || showConfiguracionMenu || showMonitoreoSistemaMenu || showAlertsMenu;

  // Mostrar sección Observabilidad
  const showObservabilidadSection = hasOverviewPermission || showMonitoreoMenu || showInfraestructuraMenu || showRendimientoMenu || showPatchingMenu || showKnowledgeBaseMenu;

  // Componente reutilizable para menús colapsables
  const CollapsibleMenu = ({
    isOpen,
    setIsOpen,
    isActive,
    icon: Icon,
    customIcon,
    title,
    menuKey,
    subItems,
    statusIndicator
  }: {
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    isActive: boolean;
    icon?: any;
    customIcon?: React.ReactNode;
    title: string;
    menuKey: string;
    subItems: { title: string; url: string; icon: any; permission: string }[];
    statusIndicator?: React.ReactNode;
  }) => {
    // Estado para el popover cuando el sidebar está colapsado
    const [popoverOpen, setPopoverOpen] = useState(false);

    // Cuando el sidebar está colapsado, usar Popover
    if (isCollapsed) {
      return (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <SidebarMenuItem>
            <PopoverTrigger asChild>
              <SidebarMenuButton
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 }}
                className={`w-full flex items-center justify-center p-2 rounded-md text-sm transition-colors ${isActive ? 'bg-foreground/5 text-foreground font-medium' : 'hover:bg-sidebar-accent/50 text-muted-foreground'
                  }`}
              >
                {customIcon ? customIcon : <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />}
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent
              side="right"
              align="start"
              sideOffset={8}
              className="w-56 p-2 bg-sidebar border-sidebar-border"
            >
              <div className="flex flex-col gap-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-b border-sidebar-border mb-1">
                  {title}
                </div>
                {subItems.map((subItem) => {
                  const isSubItemActive = location.pathname === subItem.url;
                  return (
                    <NavLink
                      key={subItem.url}
                      to={subItem.url}
                      end={subItem.url === '/patching' || subItem.url === '/vault/dashboard'}
                      onClick={() => setPopoverOpen(false)}
                      className={`flex items-center gap-2 text-sm py-2 px-2 rounded-md transition-colors ${isSubItemActive
                        ? 'bg-foreground/5 text-foreground font-medium'
                        : 'hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <subItem.icon className={`h-4 w-4 ${isSubItemActive ? 'text-foreground' : 'text-muted-foreground'}`} />
                      <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                    </NavLink>
                  );
                })}
              </div>
            </PopoverContent>
          </SidebarMenuItem>
        </Popover>
      );
    }

    // Cuando el sidebar está expandido, usar Collapsible normal
    // El usuario puede colapsar manualmente incluso si está en una ruta activa
    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <SidebarMenuItem>
          <CollapsibleTrigger asChild>
            <SidebarMenuButton
              className={`w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors ${isActive ? 'bg-foreground/5 text-foreground font-medium' : 'hover:bg-sidebar-accent/50 text-muted-foreground'
                }`}
            >
              {customIcon ? customIcon : <Icon className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`} />}
              <span className="flex-1 text-left flex items-center gap-1">
                {title}
                <MenuBadgeTag menuKey={menuKey} />
                {statusIndicator}
              </span>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </SidebarMenuButton>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <SidebarMenuSub>
              {subItems.map((subItem) => {
                const isSubItemActive = location.pathname === subItem.url;
                return (
                  <SidebarMenuSubItem key={subItem.url}>
                    <SidebarMenuSubButton asChild isActive={isSubItemActive}>
                      <NavLink
                        to={subItem.url}
                        end={subItem.url === '/patching' || subItem.url === '/vault/dashboard'}
                        className="flex items-center gap-2"
                      >
                        <subItem.icon className="h-3.5 w-3.5" />
                        <span className="flex items-center">{subItem.title}<MenuBadgeTag menuKey={subItem.permission} /></span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </SidebarMenuItem>
      </Collapsible>
    );
  };

  return (
    <Sidebar collapsible="icon">
      {/* Logo Section */}
      <div className="h-16 min-h-16 flex-shrink-0 border-b border-sidebar-border flex items-center justify-center px-2">
        {isCollapsed ? (
          <button
            onClick={toggleSidebar}
            className="group relative h-9 w-9 flex items-center justify-center rounded-lg transition-all duration-200 hover:bg-sidebar-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-ew-resize"
            title="Expandir menú"
          >
            {/* Símbolo negro para modo claro */}
            <img
              src={sqlNovaSymbolBlack}
              alt="SQL Nova"
              className="logo-light h-7 w-7 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6"
            />
            {/* Símbolo blanco para modo oscuro */}
            <img
              src={sqlNovaSymbolWhite}
              alt="SQL Nova"
              className="logo-dark h-7 w-7 transition-transform duration-300 ease-out group-hover:scale-110 group-hover:rotate-6"
            />
          </button>
        ) : (
          <>
            {/* Logo negro para modo claro */}
            <img
              src={sqlNovaBlackLogo}
              alt="SQL Nova"
              className="logo-light h-10 w-auto"
            />
            {/* Logo blanco para modo oscuro */}
            <img
              src={sqlNovaWhiteLogo}
              alt="SQL Nova"
              className="logo-dark h-10 w-auto"
            />
          </>
        )}
      </div>

      <SidebarContent className="p-0">
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <div className="py-2">
            {/* ==================== OBSERVABILIDAD ==================== */}
            {showObservabilidadSection && (
              <SidebarGroup className="pb-2">
                <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                  Observabilidad
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {/* Overview - Item plano */}
                    {hasOverviewPermission && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild>
                          <NavLink
                            to="/overview"
                            end
                            style={{
                              ...(isCollapsed ? { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 0 } : {}),
                              ...(location.pathname === '/overview' ? { backgroundColor: 'hsl(var(--foreground) / 0.05)', color: 'hsl(var(--foreground))', fontWeight: 500 } : {})
                            }}
                            className="w-full flex items-center justify-start gap-2 p-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent/50 text-muted-foreground"
                          >
                            <Home className={`h-4 w-4 flex-shrink-0 ${location.pathname === '/overview' ? 'text-foreground' : 'text-muted-foreground'}`} />
                            {!isCollapsed && (
                              <span className="flex items-center">
                                Overview
                                <MenuBadgeTag menuKey="Overview" />
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}

                    {/* Menú Monitoreo */}
                    {showMonitoreoMenu && (
                      <CollapsibleMenu
                        isOpen={monitoreoOpen}
                        setIsOpen={setMonitoreoOpen}
                        isActive={isMonitoreoActive}
                        icon={ActivityIcon}
                        title="Monitoreo"
                        menuKey="MonitoreoMenu"
                        subItems={visibleMonitoreoSubItems}
                      />
                    )}

                    {/* Menú Infraestructura */}
                    {showInfraestructuraMenu && (
                      <CollapsibleMenu
                        isOpen={infraestructuraOpen}
                        setIsOpen={setInfraestructuraOpen}
                        isActive={isInfraestructuraActive}
                        icon={Server}
                        title="Infraestructura"
                        menuKey="InfraestructuraMenu"
                        subItems={visibleInfraestructuraSubItems}
                      />
                    )}

                    {/* Menú Rendimiento */}
                    {showRendimientoMenu && (
                      <CollapsibleMenu
                        isOpen={rendimientoOpen}
                        setIsOpen={setRendimientoOpen}
                        isActive={isRendimientoActive}
                        icon={Zap}
                        title="Rendimiento"
                        menuKey="RendimientoMenu"
                        subItems={visibleRendimientoSubItems}
                      />
                    )}

                    {/* Menú Parcheos */}
                    {showPatchingMenu && (
                      <CollapsibleMenu
                        isOpen={patchingOpen}
                        setIsOpen={setPatchingOpen}
                        isActive={isPatchingActive}
                        icon={ShieldCheck}
                        title="Parcheos"
                        menuKey="PatchingMenu"
                        subItems={visiblePatchingSubItems}
                      />
                    )}

                    {/* Menú Knowledge Base */}
                    {showKnowledgeBaseMenu && (
                      <CollapsibleMenu
                        isOpen={knowledgeBaseOpen}
                        setIsOpen={setKnowledgeBaseOpen}
                        isActive={isKnowledgeBaseActive}
                        icon={BookOpen}
                        title="Base de Conocimiento"
                        menuKey="KnowledgeBaseMenu"
                        subItems={visibleKnowledgeBaseSubItems}
                      />
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {/* ==================== INVENTARIO ==================== */}
            {showInventarioSection && (
              <>
                {showObservabilidadSection && !isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Inventario
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {/* SQL Server */}
                      {showInventarioSqlServerMenu && (
                        <CollapsibleMenu
                          isOpen={inventarioSqlServerOpen}
                          setIsOpen={setInventarioSqlServerOpen}
                          isActive={isInventarioSqlServerActive}
                          icon={SqlServerIcon}
                          title="SQL Server"
                          menuKey="InventarioMenu"
                          subItems={visibleInventarioSqlServerSubItems}
                        />
                      )}

                      {/* PostgreSQL */}
                      {showInventarioPostgreSqlMenu && (
                        <CollapsibleMenu
                          isOpen={inventarioPostgreSqlOpen}
                          setIsOpen={setInventarioPostgreSqlOpen}
                          isActive={isInventarioPostgreSqlActive}
                          icon={PostgreSqlIcon}
                          title="PostgreSQL"
                          menuKey="InventarioMenu"
                          subItems={visibleInventarioPostgreSqlSubItems}
                        />
                      )}

                      {/* Redis */}
                      {showInventarioRedisMenu && (
                        <CollapsibleMenu
                          isOpen={inventarioRedisOpen}
                          setIsOpen={setInventarioRedisOpen}
                          isActive={isInventarioRedisActive}
                          icon={RedisIcon}
                          title="Redis"
                          menuKey="InventarioMenu"
                          subItems={visibleInventarioRedisSubItems}
                        />
                      )}

                      {/* DocumentDB */}
                      {showInventarioDocumentDbMenu && (
                        <CollapsibleMenu
                          isOpen={inventarioDocumentDbOpen}
                          setIsOpen={setInventarioDocumentDbOpen}
                          isActive={isInventarioDocumentDbActive}
                          icon={DocumentDbIcon}
                          title="DocumentDB"
                          menuKey="InventarioMenu"
                          subItems={visibleInventarioDocumentDbSubItems}
                        />
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== GUARDIAS DBA ==================== */}
            {showOnCallMenu && (
              <>
                {(showObservabilidadSection || showInventarioSection) && !isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Guardias DBA
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <CollapsibleMenu
                        isOpen={onCallOpen}
                        setIsOpen={setOnCallOpen}
                        isActive={isOnCallActive}
                        icon={Phone}
                        title="Guardias DBA"
                        menuKey="OnCall"
                        subItems={visibleOnCallSubItems}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== OPERACIONES ==================== */}
            {showOperationsMenu && (
              <>
                {!isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Operaciones
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <CollapsibleMenu
                        isOpen={operationsOpen}
                        setIsOpen={setOperationsOpen}
                        isActive={isOperationsActive}
                        icon={Cog}
                        title="Operaciones"
                        menuKey="OperationsMenu"
                        subItems={visibleOperationsSubItems}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== INTERVENCIONES ==================== */}
            {showIntervencionesMenu && (
              <>
                {!isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Intervenciones
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <CollapsibleMenu
                        isOpen={intervencionesOpen}
                        setIsOpen={setIntervencionesOpen}
                        isActive={isIntervencionesActive}
                        icon={Swords}
                        title="Intervenciones"
                        menuKey="IntervencionesMenu"
                        subItems={visibleIntervencionesSubItems}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== PROYECTOS ==================== */}
            {showProjectsMenu && (
              <>
                {!isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Proyectos
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <CollapsibleMenu
                        isOpen={projectsOpen}
                        setIsOpen={setProjectsOpen}
                        isActive={isProjectsActive}
                        icon={BookOpen}
                        title="Proyectos"
                        menuKey="ProjectsMenu"
                        subItems={visibleProjectsSubItems}
                      />
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== SEGURIDAD ==================== */}
            {showSecuritySection && (
              <>
                {!isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Seguridad
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {/* Vault DBA */}
                      {showVaultMenu && (
                        <CollapsibleMenu
                          isOpen={vaultOpen}
                          setIsOpen={setVaultOpen}
                          isActive={isVaultActive}
                          icon={KeyRound}
                          title="Vault DBA"
                          menuKey="VaultMenu"
                          subItems={visibleVaultSubItems}
                        />
                      )}

                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}

            {/* ==================== ADMINISTRACIÓN ==================== */}
            {showAdminSection && (
              <>
                {!isCollapsed && <Separator className="my-2 mx-2 w-auto opacity-50" />}
                <SidebarGroup className="pb-2">
                  <SidebarGroupLabel className={`${isCollapsed ? 'sr-only' : 'px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70'}`}>
                    Administración
                  </SidebarGroupLabel>
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {/* Control de Acceso */}
                      {showControlAccesoMenu && (
                        <CollapsibleMenu
                          isOpen={controlAccesoOpen}
                          setIsOpen={setControlAccesoOpen}
                          isActive={isControlAccesoActive}
                          icon={Users}
                          title="Control de Acceso"
                          menuKey="ControlAccesoMenu"
                          subItems={visibleControlAccesoSubItems}
                        />
                      )}

                      {/* Configuración */}
                      {showConfiguracionMenu && (
                        <CollapsibleMenu
                          isOpen={configuracionOpen}
                          setIsOpen={setConfiguracionOpen}
                          isActive={isConfiguracionActive}
                          icon={Settings}
                          title="Configuración"
                          menuKey="ConfiguracionMenu"
                          subItems={visibleConfiguracionSubItems}
                        />
                      )}

                      {/* Monitoreo Sistema */}
                      {showMonitoreoSistemaMenu && (
                        <CollapsibleMenu
                          isOpen={monitoreoSistemaOpen}
                          setIsOpen={setMonitoreoSistemaOpen}
                          isActive={isMonitoreoSistemaActive}
                          icon={FileText}
                          title="Monitoreo Sistema"
                          menuKey="MonitoreoSistemaMenu"
                          subItems={visibleMonitoreoSistemaSubItems}
                        />
                      )}

                      {/* Alertas */}
                      {showAlertsMenu && (
                        <CollapsibleMenu
                          isOpen={alertsOpen}
                          setIsOpen={setAlertsOpen}
                          isActive={isAlertsActive}
                          icon={Bell}
                          title="Alertas"
                          menuKey="AlertsMenu"
                          subItems={visibleAlertsSubItems}
                        />
                      )}
                    </SidebarMenu>
                  </SidebarGroupContent>
                </SidebarGroup>
              </>
            )}
          </div>
        </ScrollArea>
      </SidebarContent>
    </Sidebar>
  );
}
