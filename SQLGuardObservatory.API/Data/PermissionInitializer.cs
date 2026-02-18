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

        // Agregar permisos adicionales que puedan faltar (para nuevas vistas)
        await AddMissingPermissionsAsync(context);
    }

    private static async Task AddMissingPermissionsAsync(ApplicationDbContext context)
    {
        // Permisos adicionales solo para SuperAdmin
        var superAdminOnlyViews = new[]
        {
            "ConfigSMTP",
            "AlertaServidoresCaidos",
            "AlertaBackups",
            "AlertaDiscosCriticos",
            "AlertaResumenOverview",
            "AdminServerExceptions",
            "ServerRestart",
            "OperationsConfig",
            "HealthScore",
            "Patching",
            "ObsoleteInstances",
            "PatchingConfig",
            // Vault - permisos de administración
            "VaultAdmin",
            "VaultAudit",
            // Inventario
            "InventarioMenu",
            "InventarioSqlServerInstances",
            "InventarioSqlServerDatabases",
            "InventarioPostgreSqlInstances",
            "InventarioPostgreSqlDatabases",
            "InventarioRedisInstances",
            "InventarioDocumentDbInstances",
            "AdminAnalytics"
        };

        foreach (var view in superAdminOnlyViews)
        {
            var exists = await context.RolePermissions
                .AnyAsync(p => p.Role == "SuperAdmin" && p.ViewName == view);

            if (!exists)
            {
                context.RolePermissions.Add(new RolePermission
                {
                    Role = "SuperAdmin",
                    ViewName = view,
                    Enabled = true
                });
            }
        }

        // Permisos del Vault para Admin
        var vaultAdminViews = new[]
        {
            "VaultDashboard",
            "VaultCredentials",
            "VaultMyCredentials",
            "VaultAudit"
        };

        foreach (var view in vaultAdminViews)
        {
            // SuperAdmin
            var existsSuperAdmin = await context.RolePermissions
                .AnyAsync(p => p.Role == "SuperAdmin" && p.ViewName == view);

            if (!existsSuperAdmin)
            {
                context.RolePermissions.Add(new RolePermission
                {
                    Role = "SuperAdmin",
                    ViewName = view,
                    Enabled = true
                });
            }

            // Admin (excepto VaultAdmin)
            if (view != "VaultAdmin")
            {
                var existsAdmin = await context.RolePermissions
                    .AnyAsync(p => p.Role == "Admin" && p.ViewName == view);

                if (!existsAdmin)
                {
                    context.RolePermissions.Add(new RolePermission
                    {
                        Role = "Admin",
                        ViewName = view,
                        Enabled = true
                    });
                }
            }
        }

        // Permisos del Vault para Reader (solo VaultDashboard y VaultMyCredentials)
        var vaultReaderViews = new[] { "VaultDashboard", "VaultMyCredentials" };

        foreach (var view in vaultReaderViews)
        {
            var existsReader = await context.RolePermissions
                .AnyAsync(p => p.Role == "Reader" && p.ViewName == view);

            if (!existsReader)
            {
                context.RolePermissions.Add(new RolePermission
                {
                    Role = "Reader",
                    ViewName = view,
                    Enabled = true
                });
            }
        }

        await context.SaveChangesAsync();
    }
}

