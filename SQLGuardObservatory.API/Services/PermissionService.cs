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
        { "Overview", new ViewInfo { ViewName = "Overview", DisplayName = "Overview", Description = "Vista general del sistema" } },
        { "Jobs", new ViewInfo { ViewName = "Jobs", DisplayName = "Jobs", Description = "Gestión de SQL Agent Jobs" } },
        { "Disks", new ViewInfo { ViewName = "Disks", DisplayName = "Discos", Description = "Monitoreo de discos" } },
        { "Databases", new ViewInfo { ViewName = "Databases", DisplayName = "Bases de Datos", Description = "Información de bases de datos" } },
        { "Backups", new ViewInfo { ViewName = "Backups", DisplayName = "Backups", Description = "Estado de backups" } },
        { "Indexes", new ViewInfo { ViewName = "Indexes", DisplayName = "Índices", Description = "Fragmentación de índices" } },
        { "AdminUsers", new ViewInfo { ViewName = "AdminUsers", DisplayName = "Usuarios", Description = "Administración de usuarios" } },
        { "AdminPermissions", new ViewInfo { ViewName = "AdminPermissions", DisplayName = "Permisos", Description = "Configuración de permisos por rol" } },
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
                existingPermission.UpdatedAt = DateTime.UtcNow;
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

        var permissions = await _context.RolePermissions
            .Where(p => p.Role == userRole && p.Enabled)
            .Select(p => p.ViewName)
            .ToListAsync();

        return permissions;
    }
}

