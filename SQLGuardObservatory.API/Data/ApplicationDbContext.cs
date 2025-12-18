using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Data;

public class ApplicationDbContext : IdentityDbContext<ApplicationUser>
{
    public DbSet<RolePermission> RolePermissions { get; set; }
    public DbSet<OnCallOperator> OnCallOperators { get; set; }
    public DbSet<OnCallSchedule> OnCallSchedules { get; set; }
    public DbSet<OnCallSwapRequest> OnCallSwapRequests { get; set; }
    public DbSet<OnCallActivation> OnCallActivations { get; set; }
    public DbSet<OnCallAlertRule> OnCallAlertRules { get; set; }
    public DbSet<OnCallAlertRecipient> OnCallAlertRecipients { get; set; }
    public DbSet<SmtpSettingsEntity> SmtpSettings { get; set; }
    public DbSet<NotificationLog> NotificationLogs { get; set; }
    
    // Production Alerts
    public DbSet<ProductionAlertConfig> ProductionAlertConfigs { get; set; } = null!;
    public DbSet<ProductionAlertHistory> ProductionAlertHistories { get; set; } = null!;
    public DbSet<ProductionInstanceStatus> ProductionInstanceStatuses { get; set; } = null!;
    
    // Server Restart Tasks
    public DbSet<ServerRestartTask> ServerRestartTasks { get; set; } = null!;
    public DbSet<ServerRestartDetail> ServerRestartDetails { get; set; } = null!;
    
    // Operational Servers (para operaciones controladas)
    public DbSet<OperationalServer> OperationalServers { get; set; } = null!;
    public DbSet<OperationalServerAudit> OperationalServerAudits { get; set; } = null!;

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

        // OnCallOperator: un usuario solo puede estar una vez en la lista de operadores
        builder.Entity<OnCallOperator>(entity =>
        {
            entity.HasIndex(o => o.UserId).IsUnique();
            entity.HasIndex(o => o.RotationOrder);
            
            entity.HasOne(o => o.User)
                .WithMany()
                .HasForeignKey(o => o.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // OnCallSchedule: índices para búsquedas por fecha y usuario
        builder.Entity<OnCallSchedule>(entity =>
        {
            entity.HasIndex(s => new { s.Year, s.WeekNumber });
            entity.HasIndex(s => s.WeekStartDate);
            entity.HasIndex(s => s.UserId);
            
            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(s => s.ModifiedByUser)
                .WithMany()
                .HasForeignKey(s => s.ModifiedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // OnCallSwapRequest: relaciones y estado
        builder.Entity<OnCallSwapRequest>(entity =>
        {
            entity.HasIndex(r => r.Status);
            entity.HasIndex(r => r.RequesterId);
            entity.HasIndex(r => r.TargetUserId);
            
            entity.HasOne(r => r.Requester)
                .WithMany()
                .HasForeignKey(r => r.RequesterId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.TargetUser)
                .WithMany()
                .HasForeignKey(r => r.TargetUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.OriginalSchedule)
                .WithMany()
                .HasForeignKey(r => r.OriginalScheduleId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(r => r.SwapSchedule)
                .WithMany()
                .HasForeignKey(r => r.SwapScheduleId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // OnCallActivation: registro de activaciones de guardia
        builder.Entity<OnCallActivation>(entity =>
        {
            entity.HasIndex(a => a.ScheduleId);
            entity.HasIndex(a => a.OperatorUserId);
            entity.HasIndex(a => a.ActivatedAt);
            entity.HasIndex(a => a.Category);

            entity.HasOne(a => a.Schedule)
                .WithMany()
                .HasForeignKey(a => a.ScheduleId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(a => a.Operator)
                .WithMany()
                .HasForeignKey(a => a.OperatorUserId)
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasOne(a => a.CreatedByUser)
                .WithMany()
                .HasForeignKey(a => a.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // OnCallAlertRule: reglas de alertas
        builder.Entity<OnCallAlertRule>(entity =>
        {
            entity.HasOne(r => r.CreatedByUser)
                .WithMany()
                .HasForeignKey(r => r.CreatedByUserId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        // OnCallAlertRecipient: destinatarios de alertas
        builder.Entity<OnCallAlertRecipient>(entity =>
        {
            entity.HasIndex(r => r.AlertRuleId);

            entity.HasOne(r => r.AlertRule)
                .WithMany(a => a.Recipients)
                .HasForeignKey(r => r.AlertRuleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // SmtpSettings: configuración SMTP
        builder.Entity<SmtpSettingsEntity>(entity =>
        {
            entity.HasOne(s => s.UpdatedByUser)
                .WithMany()
                .HasForeignKey(s => s.UpdatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        // NotificationLog: log de notificaciones
        builder.Entity<NotificationLog>(entity =>
        {
            entity.ToTable("NotificationLog"); // Nombre singular para coincidir con el script SQL
            entity.HasIndex(n => n.SentAt);
            entity.HasIndex(n => n.Status);
            entity.HasIndex(n => n.NotificationType);
        });

        // Production Alerts
        builder.Entity<ProductionAlertConfig>(entity =>
        {
            entity.ToTable("ProductionAlertConfig");
        });

        builder.Entity<ProductionAlertHistory>(entity =>
        {
            entity.ToTable("ProductionAlertHistory");
            entity.HasIndex(h => h.SentAt);
        });

        builder.Entity<ProductionInstanceStatus>(entity =>
        {
            entity.ToTable("ProductionInstanceStatus");
            entity.HasIndex(s => s.InstanceName).IsUnique();
        });

        // Server Restart Tasks
        builder.Entity<ServerRestartTask>(entity =>
        {
            entity.ToTable("ServerRestartTask");
            entity.HasIndex(t => t.TaskId).IsUnique();
            entity.HasIndex(t => t.Status);
            entity.HasIndex(t => t.StartedAt);
            entity.HasIndex(t => t.InitiatedByUserId);

            entity.HasOne(t => t.InitiatedByUser)
                .WithMany()
                .HasForeignKey(t => t.InitiatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<ServerRestartDetail>(entity =>
        {
            entity.ToTable("ServerRestartDetail");
            entity.HasIndex(d => d.TaskId);

            entity.HasOne(d => d.Task)
                .WithMany(t => t.Details)
                .HasForeignKey(d => d.TaskId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Operational Servers
        builder.Entity<OperationalServer>(entity =>
        {
            entity.ToTable("OperationalServers");
            entity.HasIndex(s => s.ServerName).IsUnique();
            entity.HasIndex(s => s.Enabled);
            entity.HasIndex(s => s.Ambiente);

            entity.HasOne(s => s.CreatedByUser)
                .WithMany()
                .HasForeignKey(s => s.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(s => s.UpdatedByUser)
                .WithMany()
                .HasForeignKey(s => s.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<OperationalServerAudit>(entity =>
        {
            entity.ToTable("OperationalServersAudit");
            entity.HasIndex(a => a.OperationalServerId);
            entity.HasIndex(a => a.ChangedAt);

            entity.HasOne(a => a.ChangedByUser)
                .WithMany()
                .HasForeignKey(a => a.ChangedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });
    }
}

