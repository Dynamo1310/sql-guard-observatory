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

    // Health Score v3.0 FINAL - 12 Categorías
    public DbSet<InstanceHealthScore> InstanceHealthScores { get; set; }
    public DbSet<InstanceHealthBackups> InstanceHealthBackups { get; set; }
    public DbSet<InstanceHealthMaintenance> InstanceHealthMaintenance { get; set; }
    public DbSet<InstanceHealthAlwaysOn> InstanceHealthAlwaysOn { get; set; }
    public DbSet<InstanceHealthLogChain> InstanceHealthLogChain { get; set; }
    public DbSet<InstanceHealthDatabaseStates> InstanceHealthDatabaseStates { get; set; }
    public DbSet<InstanceHealthErroresCriticos> InstanceHealthErroresCriticos { get; set; }
    public DbSet<InstanceHealthCPU> InstanceHealthCPU { get; set; }
    public DbSet<InstanceHealthMemoria> InstanceHealthMemoria { get; set; }
    public DbSet<InstanceHealthIO> InstanceHealthIO { get; set; }
    public DbSet<InstanceHealthDiscos> InstanceHealthDiscos { get; set; }
    public DbSet<InstanceHealthConfiguracionTempdb> InstanceHealthConfiguracionTempdb { get; set; }
    public DbSet<InstanceHealthAutogrowth> InstanceHealthAutogrowth { get; set; }
    
    // Health Score v3.1 - Wait Statistics & Blocking
    public DbSet<InstanceHealthWaits> InstanceHealthWaits { get; set; }

    // Gestión de Decomiso de Bases de Datos
    public DbSet<GestionDecomiso> GestionDecomisos { get; set; }

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

        // Health Score v3.0 FINAL - 12 Categorías
        modelBuilder.Entity<InstanceHealthScore>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthAlwaysOn>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthLogChain>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthDatabaseStates>(entity =>
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

        modelBuilder.Entity<InstanceHealthMemoria>(entity =>
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

        modelBuilder.Entity<InstanceHealthConfiguracionTempdb>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthAutogrowth>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        modelBuilder.Entity<InstanceHealthWaits>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        // Gestión de Decomiso
        modelBuilder.Entity<GestionDecomiso>(entity =>
        {
            entity.ToTable("GestionDecomiso", "dbo");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.ServerName, e.DBName }).IsUnique();
            entity.HasIndex(e => e.Estado);
        });
    }
}

