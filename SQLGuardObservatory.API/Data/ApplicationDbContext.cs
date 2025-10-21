using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public DbSet<RolePermission> RolePermissions { get; set; }

    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);
        
        // Personalizar nombres de tablas si es necesario
        builder.Entity<ApplicationUser>(entity =>
        {
            entity.Property(e => e.DomainUser).HasMaxLength(100);
            entity.Property(e => e.DisplayName).HasMaxLength(200);
        });

        // Índice único para evitar duplicados de Role + ViewName
        builder.Entity<RolePermission>()
            .HasIndex(rp => new { rp.Role, rp.ViewName })
            .IsUnique();
    }
}

