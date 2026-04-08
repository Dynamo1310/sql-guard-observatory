using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

//Comentario de prueba

public class PermissionService : IPermissionService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    // Definición de vistas disponibles
    private readonly Dictionary<string, ViewInfo> _availableViews = new()
    {
        // === OBSERVABILIDAD ===
        { "Overview", new ViewInfo { ViewName = "Overview", DisplayName = "Overview", Description = "Vista general del sistema", Category = "Observabilidad" } },
        
        // --- Observabilidad > Monitoreo ---
        { "MonitoreoMenu", new ViewInfo { ViewName = "MonitoreoMenu", DisplayName = "📁 Monitoreo (Menú)", Description = "Mostrar/ocultar el menú de Monitoreo", Category = "Observabilidad > Monitoreo" } },
        { "HealthScore", new ViewInfo { ViewName = "HealthScore", DisplayName = "Monitoreo - HealthScore", Description = "Puntaje de salud de instancias SQL", Category = "Observabilidad > Monitoreo" } },
        { "AdminCollectors", new ViewInfo { ViewName = "AdminCollectors", DisplayName = "Monitoreo - Collectors", Description = "Configuración de collectors del sistema", Category = "Observabilidad > Monitoreo" } },
        
        // --- Observabilidad > Infraestructura ---
        { "InfraestructuraMenu", new ViewInfo { ViewName = "InfraestructuraMenu", DisplayName = "📁 Infraestructura (Menú)", Description = "Mostrar/ocultar el menú de Infraestructura", Category = "Observabilidad > Infraestructura" } },
        { "Disks", new ViewInfo { ViewName = "Disks", DisplayName = "Infraestructura - Discos", Description = "Monitoreo de discos", Category = "Observabilidad > Infraestructura" } },
        { "Databases", new ViewInfo { ViewName = "Databases", DisplayName = "Infraestructura - Bases de Datos", Description = "Información de bases de datos", Category = "Observabilidad > Infraestructura" } },
        { "Backups", new ViewInfo { ViewName = "Backups", DisplayName = "Infraestructura - Backups", Description = "Estado de backups", Category = "Observabilidad > Infraestructura" } },
        
        // --- Observabilidad > Rendimiento ---
        { "RendimientoMenu", new ViewInfo { ViewName = "RendimientoMenu", DisplayName = "📁 Rendimiento (Menú)", Description = "Mostrar/ocultar el menú de Rendimiento", Category = "Observabilidad > Rendimiento" } },
        { "Jobs", new ViewInfo { ViewName = "Jobs", DisplayName = "Rendimiento - Mantenimiento", Description = "Gestión de SQL Agent Jobs", Category = "Observabilidad > Rendimiento" } },
        { "Indexes", new ViewInfo { ViewName = "Indexes", DisplayName = "Rendimiento - Índices", Description = "Fragmentación de índices", Category = "Observabilidad > Rendimiento" } },
        { "TempDbAnalyzer", new ViewInfo { ViewName = "TempDbAnalyzer", DisplayName = "Rendimiento - TempDB Analyzer", Description = "Análisis de mejores prácticas de TempDB en todas las instancias SQL Server", Category = "Observabilidad > Rendimiento" } },
        
        // === PARCHEOS ===
        { "PatchingMenu", new ViewInfo { ViewName = "PatchingMenu", DisplayName = "📁 Parcheos (Menú)", Description = "Mostrar/ocultar el menú completo de Parcheos", Category = "Observabilidad > Parcheos" } },
        { "Patching", new ViewInfo { ViewName = "Patching", DisplayName = "Parcheos - Dashboard", Description = "Dashboard de parcheos SQL Server", Category = "Observabilidad > Parcheos" } },
        { "ObsoleteInstances", new ViewInfo { ViewName = "ObsoleteInstances", DisplayName = "Parcheos - Inst. Obsoletas", Description = "Instancias con versiones fuera de soporte", Category = "Observabilidad > Parcheos" } },
        { "PatchingConfig", new ViewInfo { ViewName = "PatchingConfig", DisplayName = "Parcheos - Config. Compliance", Description = "Configuración de compliance de parcheos", Category = "Observabilidad > Parcheos" } },
        { "PatchPlanner", new ViewInfo { ViewName = "PatchPlanner", DisplayName = "Parcheos - Planner", Description = "Planificación de parcheos de servidores", Category = "Observabilidad > Parcheos" } },
        { "PatchCalendar", new ViewInfo { ViewName = "PatchCalendar", DisplayName = "Parcheos - Calendario", Description = "Calendario de parcheos planificados", Category = "Observabilidad > Parcheos" } },
        { "PatchCellView", new ViewInfo { ViewName = "PatchCellView", DisplayName = "Parcheos - Vista Célula", Description = "Backlog y estadísticas por célula", Category = "Observabilidad > Parcheos" } },
        { "PatchExecution", new ViewInfo { ViewName = "PatchExecution", DisplayName = "Parcheos - Ejecución", Description = "Ejecución de parcheos de servidores", Category = "Observabilidad > Parcheos" } },
        { "PatchFreezingConfig", new ViewInfo { ViewName = "PatchFreezingConfig", DisplayName = "Parcheos - Config. Freezing", Description = "Configuración de semanas de freezing", Category = "Observabilidad > Parcheos" } },
        { "PatchNotificationsConfig", new ViewInfo { ViewName = "PatchNotificationsConfig", DisplayName = "Parcheos - Config. Notificaciones", Description = "Configuración de notificaciones de parcheo", Category = "Observabilidad > Parcheos" } },
        
        // === KNOWLEDGE BASE ===
        { "KnowledgeBaseMenu", new ViewInfo { ViewName = "KnowledgeBaseMenu", DisplayName = "📁 Knowledge Base (Menú)", Description = "Mostrar/ocultar el menú de Knowledge Base", Category = "Knowledge Base" } },
        { "DatabaseOwners", new ViewInfo { ViewName = "DatabaseOwners", DisplayName = "Knowledge Base - Owners BD", Description = "Gestión de owners de bases de datos", Category = "Knowledge Base" } },
        
        // === INVENTARIO ===
        { "InventarioMenu", new ViewInfo { ViewName = "InventarioMenu", DisplayName = "📁 Inventario (Menú)", Description = "Mostrar/ocultar el menú completo de Inventario", Category = "Inventario" } },
        // SQL Server
        { "InventarioSqlServerDashboard", new ViewInfo { ViewName = "InventarioSqlServerDashboard", DisplayName = "SQL Server - Dashboard", Description = "Dashboard visual del inventario de instancias SQL Server", Category = "Inventario" } },
        { "InventarioSqlServerInstances", new ViewInfo { ViewName = "InventarioSqlServerInstances", DisplayName = "SQL Server - Instancias", Description = "Listado de instancias SQL Server registradas", Category = "Inventario" } },
        { "InventarioSqlServerDatabases", new ViewInfo { ViewName = "InventarioSqlServerDatabases", DisplayName = "SQL Server - DBs", Description = "Listado de bases de datos SQL Server registradas", Category = "Inventario" } },
        // PostgreSQL
        { "InventarioPostgreSqlInstances", new ViewInfo { ViewName = "InventarioPostgreSqlInstances", DisplayName = "PostgreSQL - Instancias", Description = "Listado de instancias PostgreSQL registradas", Category = "Inventario" } },
        { "InventarioPostgreSqlDatabases", new ViewInfo { ViewName = "InventarioPostgreSqlDatabases", DisplayName = "PostgreSQL - DBs", Description = "Listado de bases de datos PostgreSQL registradas", Category = "Inventario" } },
        // Redis
        { "InventarioRedisInstances", new ViewInfo { ViewName = "InventarioRedisInstances", DisplayName = "Redis - Instancias", Description = "Listado de instancias Redis registradas", Category = "Inventario" } },
        // DocumentDB
        { "InventarioDocumentDbInstances", new ViewInfo { ViewName = "InventarioDocumentDbInstances", DisplayName = "DocumentDB - Instancias", Description = "Listado de instancias DocumentDB registradas", Category = "Inventario" } },
        
        // === GUARDIAS DBA ===
        { "OnCall", new ViewInfo { ViewName = "OnCall", DisplayName = "📁 Guardias DBA (Menú)", Description = "Mostrar/ocultar el menú completo de Guardias DBA", Category = "Guardias DBA" } },
        { "OnCallDashboard", new ViewInfo { ViewName = "OnCallDashboard", DisplayName = "Guardias - Dashboard", Description = "Dashboard de guardias DBA", Category = "Guardias DBA" } },
        { "OnCallPlanner", new ViewInfo { ViewName = "OnCallPlanner", DisplayName = "Guardias - Planificador", Description = "Planificación de turnos de guardia", Category = "Guardias DBA" } },
        { "OnCallSwaps", new ViewInfo { ViewName = "OnCallSwaps", DisplayName = "Guardias - Intercambios", Description = "Intercambios de turnos de guardia", Category = "Guardias DBA" } },
        { "OnCallOperators", new ViewInfo { ViewName = "OnCallOperators", DisplayName = "Guardias - Operadores", Description = "Gestión de operadores de guardia", Category = "Guardias DBA" } },
        { "OnCallEscalation", new ViewInfo { ViewName = "OnCallEscalation", DisplayName = "Guardias - Escalamiento", Description = "Configuración de escalamiento", Category = "Guardias DBA" } },
        { "OnCallActivations", new ViewInfo { ViewName = "OnCallActivations", DisplayName = "Guardias - Activaciones", Description = "Historial de activaciones de guardia", Category = "Guardias DBA" } },
        { "OnCallAlerts", new ViewInfo { ViewName = "OnCallAlerts", DisplayName = "Guardias - Alertas", Description = "Alertas de guardias DBA", Category = "Guardias DBA" } },
        { "OnCallReports", new ViewInfo { ViewName = "OnCallReports", DisplayName = "Guardias - Reportes", Description = "Reportes de guardias DBA", Category = "Guardias DBA" } },
        
        // === REGISTRO DE AUSENCIAS ===
        { "AusenciasMenu", new ViewInfo { ViewName = "AusenciasMenu", DisplayName = "📁 Registro de Ausencias (Menú)", Description = "Mostrar/ocultar el menú de Registro de Ausencias", Category = "Registro de Ausencias" } },
        { "DbaAbsences", new ViewInfo { ViewName = "DbaAbsences", DisplayName = "Ausencias DBA", Description = "Registro y consulta de ausencias del equipo DBA", Category = "Registro de Ausencias" } },
        
        // === OPERACIONES ===
        { "OperationsMenu", new ViewInfo { ViewName = "OperationsMenu", DisplayName = "📁 Operaciones (Menú)", Description = "Mostrar/ocultar el menú completo de Operaciones", Category = "Operaciones" } },
        { "ServerRestart", new ViewInfo { ViewName = "ServerRestart", DisplayName = "Operaciones - Reinicio Servidores", Description = "Reiniciar servidores SQL Server (operación crítica)", Category = "Operaciones" } },
        { "OperationsConfig", new ViewInfo { ViewName = "OperationsConfig", DisplayName = "Operaciones - Config. Servidores", Description = "Configuración de servidores para operaciones", Category = "Operaciones" } },
        { "GestionDecomiso", new ViewInfo { ViewName = "GestionDecomiso", DisplayName = "Operaciones - Decomiso de BD", Description = "Gestión de decomiso de bases de datos sin uso", Category = "Operaciones" } },
        
        // === INTERVENCIONES ===
        { "IntervencionesMenu", new ViewInfo { ViewName = "IntervencionesMenu", DisplayName = "📁 Intervenciones (Menú)", Description = "Mostrar/ocultar el menú completo de Intervenciones", Category = "Intervenciones" } },
        { "IntervencionesWar", new ViewInfo { ViewName = "IntervencionesWar", DisplayName = "Intervenciones - Wars", Description = "Gestión de wars de intervenciones", Category = "Intervenciones" } },
        
        // === PROYECTOS ===
        { "ProjectsMenu", new ViewInfo { ViewName = "ProjectsMenu", DisplayName = "📁 Proyectos (Menú)", Description = "Mostrar/ocultar el menú completo de Proyectos", Category = "Proyectos" } },
        { "BasesSinUso", new ViewInfo { ViewName = "BasesSinUso", DisplayName = "Proyectos - Bases sin Uso", Description = "Gestión de bases de datos sin uso y seguimiento de bajas", Category = "Proyectos" } },
        { "ServerComparison", new ViewInfo { ViewName = "ServerComparison", DisplayName = "Proyectos - Comparativa Servers", Description = "Comparativa de objetos entre instancias SQL Server para migración de licencias", Category = "Proyectos" } },
        { "MigrationSimulator", new ViewInfo { ViewName = "MigrationSimulator", DisplayName = "Proyectos - Simulador Migración", Description = "Simulador de volúmenes para calcular espacio en disco al consolidar instancias SQL Server", Category = "Proyectos" } },

        // === SEGURIDAD ===
        { "VaultMenu", new ViewInfo { ViewName = "VaultMenu", DisplayName = "📁 Vault DBA (Menú)", Description = "Mostrar/ocultar el menú completo de Vault DBA", Category = "Seguridad" } },
        { "VaultDashboard", new ViewInfo { ViewName = "VaultDashboard", DisplayName = "Vault - Dashboard", Description = "Dashboard del vault de credenciales", Category = "Seguridad" } },
        { "VaultCredentials", new ViewInfo { ViewName = "VaultCredentials", DisplayName = "Vault - Grupos y Compartidas", Description = "Gestión de grupos y credenciales compartidas", Category = "Seguridad" } },
        { "VaultMyCredentials", new ViewInfo { ViewName = "VaultMyCredentials", DisplayName = "Vault - Mis Credenciales", Description = "Credenciales personales del usuario", Category = "Seguridad" } },
        { "VaultNotifications", new ViewInfo { ViewName = "VaultNotifications", DisplayName = "Vault - Notificaciones", Description = "Notificaciones del vault de credenciales", Category = "Seguridad" } },
        { "VaultAudit", new ViewInfo { ViewName = "VaultAudit", DisplayName = "Vault - Auditoría", Description = "Auditoría del vault de credenciales", Category = "Seguridad" } },
        { "SystemCredentials", new ViewInfo { ViewName = "SystemCredentials", DisplayName = "Seguridad - Cred. Sistema", Description = "Credenciales de sistema para automatización", Category = "Seguridad" } },
        
        // === ADMINISTRACIÓN ===
        // --- Administración > Control de Acceso ---
        { "ControlAccesoMenu", new ViewInfo { ViewName = "ControlAccesoMenu", DisplayName = "📁 Control de Acceso (Menú)", Description = "Mostrar/ocultar el menú de Control de Acceso", Category = "Administración > Control de Acceso" } },
        { "AdminUsers", new ViewInfo { ViewName = "AdminUsers", DisplayName = "Control de Acceso - Usuarios", Description = "Administración de usuarios", Category = "Administración > Control de Acceso" } },
        { "AdminGroups", new ViewInfo { ViewName = "AdminGroups", DisplayName = "Control de Acceso - Grupos", Description = "Administración de grupos de seguridad", Category = "Administración > Control de Acceso" } },
        { "AdminRoles", new ViewInfo { ViewName = "AdminRoles", DisplayName = "Control de Acceso - Roles", Description = "Administración de roles administrativos", Category = "Administración > Control de Acceso" } },
        
        // --- Administración > Configuración ---
        { "ConfiguracionMenu", new ViewInfo { ViewName = "ConfiguracionMenu", DisplayName = "📁 Configuración (Menú)", Description = "Mostrar/ocultar el menú de Configuración", Category = "Administración > Configuración" } },
        { "ConfigSMTP", new ViewInfo { ViewName = "ConfigSMTP", DisplayName = "Configuración - SMTP", Description = "Configuración del servidor de correo", Category = "Administración > Configuración" } },
        { "AdminMenuBadges", new ViewInfo { ViewName = "AdminMenuBadges", DisplayName = "Configuración - Etiquetas de Menú", Description = "Configurar etiquetas de destacado en menús", Category = "Administración > Configuración" } },
        
        // --- Administración > Monitoreo Sistema ---
        { "MonitoreoSistemaMenu", new ViewInfo { ViewName = "MonitoreoSistemaMenu", DisplayName = "📁 Monitoreo Sistema (Menú)", Description = "Mostrar/ocultar el menú de Monitoreo del Sistema", Category = "Administración > Monitoreo Sistema" } },
        { "AdminLogs", new ViewInfo { ViewName = "AdminLogs", DisplayName = "Monitoreo Sistema - Logs API", Description = "Visualización y gestión de logs del backend", Category = "Administración > Monitoreo Sistema" } },
        { "AlertsMenu", new ViewInfo { ViewName = "AlertsMenu", DisplayName = "📁 Alertas (Menú)", Description = "Mostrar/ocultar el menú completo de Alertas", Category = "Administración > Monitoreo Sistema" } },
        { "AlertaServidoresCaidos", new ViewInfo { ViewName = "AlertaServidoresCaidos", DisplayName = "Alertas - Servidores Caídos", Description = "Configurar alertas de servidores sin conexión", Category = "Administración > Monitoreo Sistema" } },
        { "AlertaBackups", new ViewInfo { ViewName = "AlertaBackups", DisplayName = "Alertas - Backups Atrasados", Description = "Configurar alertas de backups vencidos en Producción", Category = "Administración > Monitoreo Sistema" } },
        { "AlertaDiscosCriticos", new ViewInfo { ViewName = "AlertaDiscosCriticos", DisplayName = "Alertas - Discos Críticos", Description = "Configurar alertas de discos con espacio crítico en Producción", Category = "Administración > Monitoreo Sistema" } },
        { "AlertaResumenOverview", new ViewInfo { ViewName = "AlertaResumenOverview", DisplayName = "Alertas - Resumen Overview", Description = "Configurar envío programado de resumen del estado de producción", Category = "Administración > Monitoreo Sistema" } },
        { "AdminServerExceptions", new ViewInfo { ViewName = "AdminServerExceptions", DisplayName = "Alertas - Excepciones de Servidores", Description = "Gestionar servidores excluidos de todas las alertas (dados de baja)", Category = "Administración > Monitoreo Sistema" } },
        { "AdminAnalytics", new ViewInfo { ViewName = "AdminAnalytics", DisplayName = "Monitoreo Sistema - Analytics", Description = "Telemetría de uso, adopción y detección de fricción", Category = "Administración > Monitoreo Sistema" } },
    };

    public PermissionService(ApplicationDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<AvailableViewsDto> GetAvailableViewsAndRolesAsync()
    {
        return await Task.FromResult(new AvailableViewsDto
        {
            Views = _availableViews.Values.ToList(),
            Roles = new List<string>() // Ya no se usan roles para permisos
        });
    }

    public async Task<List<string>> GetUserPermissionsAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return new List<string>();

        // Obtener permisos SOLO de los grupos del usuario (sin roles)
        var userGroupIds = await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Select(ug => ug.GroupId)
            .ToListAsync();

        if (!userGroupIds.Any()) return new List<string>();

        return await _context.GroupPermissions
            .Where(gp => userGroupIds.Contains(gp.GroupId) && gp.Enabled)
            .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                gp => gp.GroupId,
                g => g.Id,
                (gp, g) => gp.ViewName)
            .Distinct()
            .ToListAsync();
    }

    public async Task<List<string>> GetUserGroupNamesAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return new List<string>();

        return await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                ug => ug.GroupId,
                g => g.Id,
                (ug, g) => g.Name)
            .Distinct()
            .ToListAsync();
    }

    public async Task<bool> HasPermissionAsync(string userId, string viewName)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return false;

        // Verificar permisos SOLO de grupos (sin roles)
        var userGroupIds = await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Select(ug => ug.GroupId)
            .ToListAsync();

        if (!userGroupIds.Any()) return false;

        return await _context.GroupPermissions
            .Where(gp => userGroupIds.Contains(gp.GroupId) && gp.ViewName == viewName && gp.Enabled)
            .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                gp => gp.GroupId,
                g => g.Id,
                (gp, g) => gp)
            .AnyAsync();
    }
}
