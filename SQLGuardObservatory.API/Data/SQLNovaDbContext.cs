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
    }
}

