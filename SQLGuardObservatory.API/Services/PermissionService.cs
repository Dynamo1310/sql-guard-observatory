using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class PermissionService : IPermissionService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;

    // Definición de vistas disponibles
    private readonly Dictionary<string, ViewInfo> _availableViews = new()
    {
        // === OBSERVABILIDAD ===
        { "Overview", new ViewInfo { ViewName = "Overview", DisplayName = "Overview", Description = "Vista general del sistema", Category = "Observabilidad" } },
        { "HealthScore", new ViewInfo { ViewName = "HealthScore", DisplayName = "HealthScore", Description = "Puntaje de salud de instancias SQL", Category = "Observabilidad" } },
        { "Jobs", new ViewInfo { ViewName = "Jobs", DisplayName = "Mantenimiento", Description = "Gestión de SQL Agent Jobs", Category = "Observabilidad" } },
        { "Disks", new ViewInfo { ViewName = "Disks", DisplayName = "Discos", Description = "Monitoreo de discos", Category = "Observabilidad" } },
        { "Databases", new ViewInfo { ViewName = "Databases", DisplayName = "Bases de Datos", Description = "Información de bases de datos", Category = "Observabilidad" } },
        { "Backups", new ViewInfo { ViewName = "Backups", DisplayName = "Backups", Description = "Estado de backups", Category = "Observabilidad" } },
        { "Indexes", new ViewInfo { ViewName = "Indexes", DisplayName = "Índices", Description = "Fragmentación de índices", Category = "Observabilidad" } },
        
        // === PARCHEOS ===
        { "PatchingMenu", new ViewInfo { ViewName = "PatchingMenu", DisplayName = "📁 Parcheos (Menú)", Description = "Mostrar/ocultar el menú completo de Parcheos", Category = "Parcheos" } },
        { "Patching", new ViewInfo { ViewName = "Patching", DisplayName = "Parcheos - Dashboard", Description = "Dashboard de parcheos SQL Server", Category = "Parcheos" } },
        { "PatchingConfig", new ViewInfo { ViewName = "PatchingConfig", DisplayName = "Parcheos - Config. Compliance", Description = "Configuración de compliance de parcheos", Category = "Parcheos" } },
        
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
        
        // === OPERACIONES ===
        { "OperationsMenu", new ViewInfo { ViewName = "OperationsMenu", DisplayName = "📁 Operaciones (Menú)", Description = "Mostrar/ocultar el menú completo de Operaciones", Category = "Operaciones" } },
        { "ServerRestart", new ViewInfo { ViewName = "ServerRestart", DisplayName = "Operaciones - Reinicio Servidores", Description = "Reiniciar servidores SQL Server (operación crítica)", Category = "Operaciones" } },
        { "OperationsConfig", new ViewInfo { ViewName = "OperationsConfig", DisplayName = "Operaciones - Config. Servidores", Description = "Configuración de servidores para operaciones", Category = "Operaciones" } },
        
        // === SEGURIDAD (VAULT DBA) ===
        { "VaultMenu", new ViewInfo { ViewName = "VaultMenu", DisplayName = "📁 Vault DBA (Menú)", Description = "Mostrar/ocultar el menú completo de Vault DBA", Category = "Seguridad" } },
        { "VaultDashboard", new ViewInfo { ViewName = "VaultDashboard", DisplayName = "Vault - Dashboard", Description = "Dashboard del vault de credenciales", Category = "Seguridad" } },
        { "VaultCredentials", new ViewInfo { ViewName = "VaultCredentials", DisplayName = "Vault - Grupos y Compartidas", Description = "Gestión de grupos y credenciales compartidas", Category = "Seguridad" } },
        { "VaultMyCredentials", new ViewInfo { ViewName = "VaultMyCredentials", DisplayName = "Vault - Mis Credenciales", Description = "Credenciales personales del usuario", Category = "Seguridad" } },
        { "VaultNotifications", new ViewInfo { ViewName = "VaultNotifications", DisplayName = "Vault - Notificaciones", Description = "Notificaciones del vault de credenciales", Category = "Seguridad" } },
        { "VaultAudit", new ViewInfo { ViewName = "VaultAudit", DisplayName = "Vault - Auditoría", Description = "Auditoría del vault de credenciales", Category = "Seguridad" } },
        
        // === ADMINISTRACIÓN ===
        { "AdminUsers", new ViewInfo { ViewName = "AdminUsers", DisplayName = "Admin - Usuarios", Description = "Administración de usuarios", Category = "Administración" } },
        { "AdminGroups", new ViewInfo { ViewName = "AdminGroups", DisplayName = "Admin - Grupos", Description = "Administración de grupos de seguridad", Category = "Administración" } },
        { "AdminPermissions", new ViewInfo { ViewName = "AdminPermissions", DisplayName = "Admin - Permisos", Description = "Configuración de permisos por rol", Category = "Administración" } },
        { "ConfigSMTP", new ViewInfo { ViewName = "ConfigSMTP", DisplayName = "Admin - Config. SMTP", Description = "Configuración del servidor de correo", Category = "Administración" } },
        { "SystemCredentials", new ViewInfo { ViewName = "SystemCredentials", DisplayName = "Admin - Cred. Sistema", Description = "Credenciales de sistema para automatización", Category = "Administración" } },
        { "AlertaServidoresCaidos", new ViewInfo { ViewName = "AlertaServidoresCaidos", DisplayName = "Admin - Alerta Servidores Caídos", Description = "Configurar alertas de servidores sin conexión", Category = "Administración" } },
        { "AlertaResumenOverview", new ViewInfo { ViewName = "AlertaResumenOverview", DisplayName = "Admin - Alerta Resumen Overview", Description = "Configurar envío programado de resumen del estado de producción", Category = "Administración" } },
        { "AlertsMenu", new ViewInfo { ViewName = "AlertsMenu", DisplayName = "📁 Alertas (Menú)", Description = "Mostrar/ocultar el menú completo de Alertas", Category = "Administración" } },
        { "AdminMenuBadges", new ViewInfo { ViewName = "AdminMenuBadges", DisplayName = "Admin - Indicadores Menú", Description = "Configurar badges de nuevo en menús (Solo SuperAdmin)", Category = "Administración" } },
    };

    public PermissionService(ApplicationDbContext context, UserManager<ApplicationUser> userManager)
    {
        _context = context;
        _userManager = userManager;
    }

    public async Task<List<RolePermissionDto>> GetAllRolePermissionsAsync()
    {
        var permissions = await _context.RolePermissions.ToListAsync();
        var roles = new[] { "SuperAdmin", "Admin", "Reader" };

        var result = new List<RolePermissionDto>();

        foreach (var role in roles)
        {
            var rolePermissions = permissions.Where(p => p.Role == role).ToDictionary(p => p.ViewName, p => p.Enabled);
            
            // Asegurar que todas las vistas estén representadas
            foreach (var view in _availableViews.Keys)
            {
                if (!rolePermissions.ContainsKey(view))
                {
                    rolePermissions[view] = false;
                }
            }

            result.Add(new RolePermissionDto
            {
                Role = role,
                Permissions = rolePermissions
            });
        }

        return result;
    }

    public async Task<RolePermissionDto?> GetRolePermissionsAsync(string role)
    {
        var permissions = await _context.RolePermissions
            .Where(p => p.Role == role)
            .ToListAsync();

        var rolePermissions = permissions.ToDictionary(p => p.ViewName, p => p.Enabled);

        // Asegurar que todas las vistas estén representadas
        foreach (var view in _availableViews.Keys)
        {
            if (!rolePermissions.ContainsKey(view))
            {
                rolePermissions[view] = false;
            }
        }

        return new RolePermissionDto
        {
            Role = role,
            Permissions = rolePermissions
        };
    }

    public async Task<bool> UpdateRolePermissionsAsync(string role, Dictionary<string, bool> permissions)
    {
        foreach (var permission in permissions)
        {
            var existingPermission = await _context.RolePermissions
                .FirstOrDefaultAsync(p => p.Role == role && p.ViewName == permission.Key);

            if (existingPermission != null)
            {
                existingPermission.Enabled = permission.Value;
                existingPermission.UpdatedAt = DateTime.Now;
            }
            else
            {
                _context.RolePermissions.Add(new RolePermission
                {
                    Role = role,
                    ViewName = permission.Key,
                    Enabled = permission.Value
                });
            }
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<AvailableViewsDto> GetAvailableViewsAndRolesAsync()
    {
        return await Task.FromResult(new AvailableViewsDto
        {
            Views = _availableViews.Values.ToList(),
            Roles = new List<string> { "SuperAdmin", "Admin", "Reader" }
        });
    }

    public async Task<List<string>> GetUserPermissionsAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return new List<string>();

        var roles = await _userManager.GetRolesAsync(user);
        var userRole = roles.FirstOrDefault() ?? "Reader";

        // SuperAdmin tiene acceso a TODAS las vistas
        if (userRole == "SuperAdmin")
        {
            return _availableViews.Keys.ToList();
        }

        // Obtener permisos del rol
        var rolePermissions = await _context.RolePermissions
            .Where(p => p.Role == userRole && p.Enabled)
            .Select(p => p.ViewName)
            .ToListAsync();

        // Obtener permisos de los grupos del usuario (modelo aditivo)
        var userGroupIds = await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Select(ug => ug.GroupId)
            .ToListAsync();

        var groupPermissions = new List<string>();
        if (userGroupIds.Any())
        {
            groupPermissions = await _context.GroupPermissions
                .Where(gp => userGroupIds.Contains(gp.GroupId) && gp.Enabled)
                .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                    gp => gp.GroupId,
                    g => g.Id,
                    (gp, g) => gp.ViewName)
                .Distinct()
                .ToListAsync();
        }

        // Combinar permisos de rol + grupos (unión)
        var combinedPermissions = rolePermissions
            .Union(groupPermissions)
            .Distinct()
            .ToList();

        return combinedPermissions;
    }

    public async Task<bool> HasPermissionAsync(string userId, string viewName)
    {
        var user = await _userManager.FindByIdAsync(userId);
        if (user == null) return false;

        var roles = await _userManager.GetRolesAsync(user);
        var userRole = roles.FirstOrDefault() ?? "Reader";

        // SuperAdmin tiene acceso a TODAS las vistas
        if (userRole == "SuperAdmin")
        {
            return true;
        }

        // Verificar si el rol tiene el permiso habilitado
        var roleHasPermission = await _context.RolePermissions
            .AnyAsync(p => p.Role == userRole && p.ViewName == viewName && p.Enabled);

        if (roleHasPermission)
        {
            return true;
        }

        // Verificar permisos de grupos (modelo aditivo)
        var userGroupIds = await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Select(ug => ug.GroupId)
            .ToListAsync();

        if (userGroupIds.Any())
        {
            var groupHasPermission = await _context.GroupPermissions
                .Where(gp => userGroupIds.Contains(gp.GroupId) && gp.ViewName == viewName && gp.Enabled)
                .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                    gp => gp.GroupId,
                    g => g.Id,
                    (gp, g) => gp)
                .AnyAsync();

            if (groupHasPermission)
            {
                return true;
            }
        }

        return false;
    }
}

