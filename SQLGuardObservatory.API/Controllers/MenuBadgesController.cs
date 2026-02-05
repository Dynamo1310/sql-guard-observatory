using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MenuBadgesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<MenuBadgesController> _logger;

    // Menús disponibles para configurar (organizados por categoría)
    private readonly Dictionary<string, (string DisplayName, string Category)> _availableMenus = new()
    {
        // === OBSERVABILIDAD ===
        { "Overview", ("Overview", "Observabilidad") },
        
        // --- Observabilidad > Monitoreo ---
        { "MonitoreoMenu", ("📁 Monitoreo (Menú)", "Observabilidad > Monitoreo") },
        { "HealthScore", ("Monitoreo - HealthScore", "Observabilidad > Monitoreo") },
        { "AdminCollectors", ("Monitoreo - Collectors", "Observabilidad > Monitoreo") },
        
        // --- Observabilidad > Infraestructura ---
        { "InfraestructuraMenu", ("📁 Infraestructura (Menú)", "Observabilidad > Infraestructura") },
        { "Disks", ("Infraestructura - Discos", "Observabilidad > Infraestructura") },
        { "Databases", ("Infraestructura - Bases de Datos", "Observabilidad > Infraestructura") },
        { "Backups", ("Infraestructura - Backups", "Observabilidad > Infraestructura") },
        
        // --- Observabilidad > Rendimiento ---
        { "RendimientoMenu", ("📁 Rendimiento (Menú)", "Observabilidad > Rendimiento") },
        { "Jobs", ("Rendimiento - Mantenimiento", "Observabilidad > Rendimiento") },
        { "Indexes", ("Rendimiento - Índices", "Observabilidad > Rendimiento") },
        
        // --- Observabilidad > Parcheos ---
        { "PatchingMenu", ("📁 Parcheos (Menú)", "Observabilidad > Parcheos") },
        { "Patching", ("Parcheos - Dashboard", "Observabilidad > Parcheos") },
        { "PatchingConfig", ("Parcheos - Config", "Observabilidad > Parcheos") },
        
        // === GUARDIAS DBA ===
        { "OnCall", ("📁 Guardias DBA (Menú)", "Guardias DBA") },
        { "OnCallDashboard", ("Guardias - Dashboard", "Guardias DBA") },
        { "OnCallPlanner", ("Guardias - Planificador", "Guardias DBA") },
        { "OnCallSwaps", ("Guardias - Intercambios", "Guardias DBA") },
        { "OnCallOperators", ("Guardias - Operadores", "Guardias DBA") },
        { "OnCallEscalation", ("Guardias - Escalamiento", "Guardias DBA") },
        { "OnCallActivations", ("Guardias - Activaciones", "Guardias DBA") },
        { "OnCallAlerts", ("Guardias - Alertas", "Guardias DBA") },
        { "OnCallReports", ("Guardias - Reportes", "Guardias DBA") },
        
        // === OPERACIONES ===
        { "OperationsMenu", ("📁 Operaciones (Menú)", "Operaciones") },
        { "ServerRestart", ("Operaciones - Reinicio", "Operaciones") },
        { "OperationsConfig", ("Operaciones - Config", "Operaciones") },
        
        // === SEGURIDAD ===
        { "VaultMenu", ("📁 Vault DBA (Menú)", "Seguridad") },
        { "VaultDashboard", ("Vault - Dashboard", "Seguridad") },
        { "VaultCredentials", ("Vault - Grupos", "Seguridad") },
        { "VaultMyCredentials", ("Vault - Mis Credenciales", "Seguridad") },
        { "VaultNotifications", ("Vault - Notificaciones", "Seguridad") },
        { "VaultAudit", ("Vault - Auditoría", "Seguridad") },
        { "SystemCredentials", ("Seguridad - Cred. Sistema", "Seguridad") },
        
        // === ADMINISTRACIÓN ===
        // --- Administración > Control de Acceso ---
        { "ControlAccesoMenu", ("📁 Control de Acceso (Menú)", "Administración > Control de Acceso") },
        { "AdminUsers", ("Control de Acceso - Usuarios", "Administración > Control de Acceso") },
        { "AdminGroups", ("Control de Acceso - Grupos", "Administración > Control de Acceso") },
        { "AdminRoles", ("Control de Acceso - Roles", "Administración > Control de Acceso") },
        
        // --- Administración > Configuración ---
        { "ConfiguracionMenu", ("📁 Configuración (Menú)", "Administración > Configuración") },
        { "ConfigSMTP", ("Configuración - SMTP", "Administración > Configuración") },
        { "AdminMenuBadges", ("Configuración - Etiquetas de Menú", "Administración > Configuración") },
        
        // --- Administración > Monitoreo Sistema ---
        { "MonitoreoSistemaMenu", ("📁 Monitoreo Sistema (Menú)", "Administración > Monitoreo Sistema") },
        { "AdminLogs", ("Monitoreo Sistema - Logs API", "Administración > Monitoreo Sistema") },
        { "AlertsMenu", ("📁 Alertas (Menú)", "Administración > Monitoreo Sistema") },
        { "AlertaServidoresCaidos", ("Alertas - Servidores Caídos", "Administración > Monitoreo Sistema") },
        { "AlertaBackups", ("Alertas - Backups Atrasados", "Administración > Monitoreo Sistema") },
        { "AlertaResumenOverview", ("Alertas - Resumen Overview", "Administración > Monitoreo Sistema") },
    };

    public MenuBadgesController(ApplicationDbContext context, ILogger<MenuBadgesController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los badges de menú (público - para mostrar en sidebar)
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAllBadges()
    {
        try
        {
            // Asegurar que existan todos los menús configurables
            await EnsureMenuBadgesExist();

            var dbBadges = await _context.MenuBadges.ToListAsync();
            
            // Agregar la categoría desde el diccionario
            var badges = dbBadges.Select(b => {
                var category = _availableMenus.TryGetValue(b.MenuKey, out var menuInfo) 
                    ? menuInfo.Category 
                    : "Otros";
                    
                return new MenuBadgeDto
                {
                    MenuKey = b.MenuKey,
                    DisplayName = b.DisplayName,
                    IsNew = b.IsNew,
                    BadgeText = b.BadgeText ?? "Nuevo",
                    BadgeColor = b.BadgeColor ?? "green",
                    Category = category
                };
            }).ToList();

            return Ok(badges);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener badges de menú");
            return StatusCode(500, new { message = "Error al obtener badges" });
        }
    }

    /// <summary>
    /// Actualiza un badge de menú (requiere capacidad System.ManageMenuBadges)
    /// </summary>
    [HttpPut("{menuKey}")]
    [RequireCapability("System.ManageMenuBadges")]
    public async Task<IActionResult> UpdateBadge(string menuKey, [FromBody] UpdateMenuBadgeRequest request)
    {
        try
        {
            var badge = await _context.MenuBadges.FirstOrDefaultAsync(b => b.MenuKey == menuKey);
            
            if (badge == null)
            {
                return NotFound(new { message = $"Menú '{menuKey}' no encontrado" });
            }

            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue("display_name") ?? User.FindFirstValue(ClaimTypes.Name) ?? "Unknown";

            badge.IsNew = request.IsNew;
            badge.BadgeText = request.BadgeText ?? "Nuevo";
            badge.BadgeColor = request.BadgeColor ?? "green";
            badge.UpdatedAt = DateTime.UtcNow;
            badge.UpdatedBy = userName;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Badge actualizado: {MenuKey} -> IsNew={IsNew} por {User}", 
                menuKey, request.IsNew, userName);

            return Ok(new { message = "Badge actualizado correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar badge {MenuKey}", menuKey);
            return StatusCode(500, new { message = "Error al actualizar badge" });
        }
    }

    /// <summary>
    /// Actualiza múltiples badges a la vez (requiere capacidad System.ManageMenuBadges)
    /// </summary>
    [HttpPut]
    [RequireCapability("System.ManageMenuBadges")]
    public async Task<IActionResult> UpdateAllBadges([FromBody] List<UpdateMenuBadgeRequest> requests)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue("display_name") ?? User.FindFirstValue(ClaimTypes.Name) ?? "Unknown";

            foreach (var request in requests)
            {
                var badge = await _context.MenuBadges.FirstOrDefaultAsync(b => b.MenuKey == request.MenuKey);
                
                if (badge != null)
                {
                    badge.IsNew = request.IsNew;
                    badge.BadgeText = request.BadgeText ?? "Nuevo";
                    badge.BadgeColor = request.BadgeColor ?? "green";
                    badge.UpdatedAt = DateTime.UtcNow;
                    badge.UpdatedBy = userName;
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation("Badges actualizados en masa por {User}", userName);

            return Ok(new { message = "Badges actualizados correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar badges");
            return StatusCode(500, new { message = "Error al actualizar badges" });
        }
    }

    /// <summary>
    /// Asegura que todos los menús configurables existan en la base de datos
    /// </summary>
    private async Task EnsureMenuBadgesExist()
    {
        var existingKeys = await _context.MenuBadges.Select(b => b.MenuKey).ToListAsync();
        
        foreach (var menu in _availableMenus)
        {
            if (!existingKeys.Contains(menu.Key))
            {
                // Solo los menús principales (📁) tienen badge activo por defecto
                var isMainMenu = menu.Value.DisplayName.StartsWith("📁");
                
                _context.MenuBadges.Add(new MenuBadge
                {
                    MenuKey = menu.Key,
                    DisplayName = menu.Value.DisplayName,
                    IsNew = isMainMenu, // Solo menús principales activos por defecto
                    BadgeText = "Nuevo",
                    BadgeColor = "green",
                    UpdatedAt = DateTime.UtcNow,
                    UpdatedBy = "System"
                });
            }
        }

        await _context.SaveChangesAsync();
    }
}

// DTOs
public class MenuBadgeDto
{
    public string MenuKey { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool IsNew { get; set; }
    public string BadgeText { get; set; } = "Nuevo";
    public string BadgeColor { get; set; } = "green";
    public string Category { get; set; } = string.Empty;
}

public class UpdateMenuBadgeRequest
{
    public string MenuKey { get; set; } = string.Empty;
    public bool IsNew { get; set; }
    public string? BadgeText { get; set; }
    public string? BadgeColor { get; set; }
}

