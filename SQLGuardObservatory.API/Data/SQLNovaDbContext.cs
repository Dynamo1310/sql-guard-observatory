using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Models.HealthScoreV3;

namespace SQLGuardObservatory.API.Data;

public class SQLNovaDbContext : DbContext
{
    public SQLNovaDbContext(DbContextOptions<SQLNovaDbContext> options)
        : base(options)
    {
    }

    // Tablas existentes
    public DbSet<InventarioJobsSnapshot> InventarioJobsSnapshot { get; set; }
    public DbSet<InventarioDiscosSnapshot> InventarioDiscosSnapshot { get; set; }
    public DbSet<InstanceHealthSnapshot> InstanceHealthSnapshots { get; set; }

    // Health Score v3.0 - 10 Categorías
    public DbSet<InstanceHealthScore> InstanceHealthScores { get; set; }
    public DbSet<InstanceHealthConectividad> InstanceHealthConectividad { get; set; }
    public DbSet<InstanceHealthAlwaysOn> InstanceHealthAlwaysOn { get; set; }
    public DbSet<InstanceHealthErroresCriticos> InstanceHealthErroresCriticos { get; set; }
    public DbSet<InstanceHealthCPU> InstanceHealthCPU { get; set; }
    public DbSet<InstanceHealthIO> InstanceHealthIO { get; set; }
    public DbSet<InstanceHealthDiscos> InstanceHealthDiscos { get; set; }
    public DbSet<InstanceHealthMemoria> InstanceHealthMemoria { get; set; }
    public DbSet<InstanceHealthConfiguracionTempdb> InstanceHealthConfiguracionTempdb { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<InventarioJobsSnapshot>(entity =>
        {
            entity.ToTable("InventarioJobsSnapshot", "dbo");
            entity.HasKey(e => e.Id);
        });

        modelBuilder.Entity<InventarioDiscosSnapshot>(entity =>
        {
            entity.ToTable("InventarioDiscosSnapshot", "dbo");
            entity.HasKey(e => e.Id);
        });

        modelBuilder.Entity<InstanceHealthSnapshot>(entity =>
        {
            entity.ToTable("InstanceHealthSnapshot", "dbo");
            entity.HasKey(e => new { e.InstanceName, e.GeneratedAtUtc });
        });

        // Health Score v3.0 entities
        modelBuilder.Entity<InstanceHealthScore>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthConectividad>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthAlwaysOn>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthErroresCriticos>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthCPU>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthIO>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthDiscos>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthMemoria>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthConfiguracionTempdb>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });
    }
}

