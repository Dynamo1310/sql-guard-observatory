using Microsoft.AspNetCore.Identity;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Data;

public static class DbInitializer
{
    public static async Task Initialize(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        RoleManager<IdentityRole> roleManager)
    {
        // Crear la base de datos si no existe
        await context.Database.EnsureCreatedAsync();

        // Crear roles
        string[] roles = { "SuperAdmin", "Admin", "Reader" };
        foreach (var roleName in roles)
        {
            if (!await roleManager.RoleExistsAsync(roleName))
            {
                await roleManager.CreateAsync(new IdentityRole(roleName));
            }
        }

        // Crear usuario admin por defecto TB03260
        var defaultAdminUser = "TB03260";
        var existingUser = await userManager.FindByNameAsync(defaultAdminUser);
        
        if (existingUser == null)
        {
            var adminUser = new ApplicationUser
            {
                UserName = defaultAdminUser,
                DomainUser = defaultAdminUser,
                DisplayName = "Administrador Principal",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };

            // Contraseña por defecto (CAMBIAR EN PRODUCCIÓN)
            var result = await userManager.CreateAsync(adminUser, "Admin123!");
            
            if (result.Succeeded)
            {
                await userManager.AddToRoleAsync(adminUser, "SuperAdmin");
            }
        }
        else
        {
            // Asegurar que TB03260 siempre sea SuperAdmin
            var userRoles = await userManager.GetRolesAsync(existingUser);
            if (!userRoles.Contains("SuperAdmin"))
            {
                // Eliminar roles anteriores y asignar SuperAdmin
                await userManager.RemoveFromRolesAsync(existingUser, userRoles);
                await userManager.AddToRoleAsync(existingUser, "SuperAdmin");
            }
        }
    }
}

