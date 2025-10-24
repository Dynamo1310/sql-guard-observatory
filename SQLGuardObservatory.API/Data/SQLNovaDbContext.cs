using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Data;

public class SQLNovaDbContext : DbContext
{
    public SQLNovaDbContext(DbContextOptions<SQLNovaDbContext> options)
        : base(options)
    {
    }

    public DbSet<InventarioJobsSnapshot> InventarioJobsSnapshot { get; set; }
    public DbSet<InventarioDiscosSnapshot> InventarioDiscosSnapshot { get; set; }
    public DbSet<InstanceHealthSnapshot> InstanceHealthSnapshots { get; set; }

    // Health Score V2 - Vistas
    public DbSet<CategoryScoresV2> CategoryScoresV2 { get; set; }
    public DbSet<HealthFinalV2> HealthFinalV2 { get; set; }
    public DbSet<HealthTendencias24hV2> HealthTendencias24hV2 { get; set; }
    public DbSet<HealthTendencias7dV2> HealthTendencias7dV2 { get; set; }
    
    // Health Score V2 - Tablas
    public DbSet<HealthScoreAlerta> HealthScoreAlertas { get; set; }
    public DbSet<CollectorLog> CollectorLogs { get; set; }

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

        // Health Score V2 - Vistas (sin Primary Key, usar HasNoKey)
        modelBuilder.Entity<CategoryScoresV2>(entity =>
        {
            entity.ToTable("vw_CategoryScores_V2", "dbo");
            entity.HasNoKey(); // Vista SQL sin PK
        });

        modelBuilder.Entity<HealthFinalV2>(entity =>
        {
            entity.ToTable("vw_HealthFinal_V2", "dbo");
            entity.HasNoKey(); // Vista SQL sin PK
        });

        modelBuilder.Entity<HealthTendencias24hV2>(entity =>
        {
            entity.ToTable("vw_HealthTendencias_24h_V2", "dbo");
            entity.HasNoKey(); // Vista SQL sin PK
        });

        modelBuilder.Entity<HealthTendencias7dV2>(entity =>
        {
            entity.ToTable("vw_HealthTendencias_7d_V2", "dbo");
            entity.HasNoKey(); // Vista SQL sin PK
        });

        modelBuilder.Entity<HealthScoreAlerta>(entity =>
        {
            entity.ToTable("HealthScoreAlertas", "dbo");
            entity.HasKey(e => e.AlertaID);
        });

        modelBuilder.Entity<CollectorLog>(entity =>
        {
            entity.ToTable("CollectorLog", "dbo");
            entity.HasKey(e => e.LogID);
        });
    }
}

