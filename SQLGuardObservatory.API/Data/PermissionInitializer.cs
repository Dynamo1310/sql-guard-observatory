using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Data;

public static class PermissionInitializer
{
    public static async Task InitializePermissions(ApplicationDbContext context, RoleManager<IdentityRole> roleManager, IConfiguration configuration)
    {
        // Crear roles si no existen
        string[] roles = { "SuperAdmin", "Admin", "Reader" };
        
        foreach (var roleName in roles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole(roleName));
            }
        }

        // Vistas disponibles
        var views = new[]
        {
            "Overview",
            "HealthScore",
            "Jobs",
            "Disks",
            "Databases",
            "Backups",
            "Indexes",
            "OnCall",
            "AdminUsers",
            "AdminPermissions"
        };

        // Verificar si ya existen permisos
        var existingPermissions = await context.RolePermissions.AnyAsync();
        
        if (!existingPermissions)
        {
            var permissions = new List<RolePermission>();

            // SuperAdmin: Todo
            foreach (var view in views)
            {
                permissions.Add(new RolePermission
                {
                    Role = "SuperAdmin",
                    ViewName = view,
                    Enabled = true
                });
            }

            // Admin: Todo (incluyendo AdminUsers y AdminPermissions para configurar permisos de Reader)
            foreach (var view in views)
            {
                permissions.Add(new RolePermission
                {
                    Role = "Admin",
                    ViewName = view,
                    Enabled = true
                });
            }

            // Reader: Solo vistas de observabilidad (incluyendo OnCall para ver calendario)
            var readerViews = new[] { "Overview", "Jobs", "Disks", "Databases", "Backups", "Indexes", "OnCall" };
            foreach (var view in readerViews)
            {
                permissions.Add(new RolePermission
                {
                    Role = "Reader",
                    ViewName = view,
                    Enabled = true
                });
            }

            context.RolePermissions.AddRange(permissions);
            await context.SaveChangesAsync();
        }
    }
}

