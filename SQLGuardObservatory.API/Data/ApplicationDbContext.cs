using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;

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
    public DbSet<OnCallConfig> OnCallConfig { get; set; }
    public DbSet<OnCallHoliday> OnCallHolidays { get; set; }
    public DbSet<OnCallEscalation> OnCallEscalations { get; set; }
    public DbSet<OnCallDayOverride> OnCallDayOverrides { get; set; }
    public DbSet<OnCallEmailTemplate> OnCallEmailTemplates { get; set; }
    public DbSet<OnCallActivationCategory> OnCallActivationCategories { get; set; }
    public DbSet<OnCallScheduleBatch> OnCallScheduleBatches { get; set; }
    public DbSet<SmtpSettingsEntity> SmtpSettings { get; set; }
    public DbSet<NotificationLog> NotificationLogs { get; set; }
    
    // Production Alerts
    public DbSet<ProductionAlertConfig> ProductionAlertConfigs { get; set; } = null!;
    public DbSet<ProductionAlertHistory> ProductionAlertHistories { get; set; } = null!;
    public DbSet<ProductionInstanceStatus> ProductionInstanceStatuses { get; set; } = null!;
    
    // Overview Summary Alerts - Resumen programado del estado de producción
    public DbSet<OverviewSummaryAlertConfig> OverviewSummaryAlertConfigs { get; set; } = null!;
    public DbSet<OverviewSummaryAlertSchedule> OverviewSummaryAlertSchedules { get; set; } = null!;
    public DbSet<OverviewSummaryAlertHistory> OverviewSummaryAlertHistories { get; set; } = null!;
    
    // Overview Summary Cache - Caché de datos pre-calculados para el Dashboard
    public DbSet<OverviewSummaryCache> OverviewSummaryCache { get; set; } = null!;
    
    // Server Restart Tasks
    public DbSet<ServerRestartTask> ServerRestartTasks { get; set; } = null!;
    public DbSet<ServerRestartDetail> ServerRestartDetails { get; set; } = null!;
    
    // Operational Servers (para operaciones controladas)
    public DbSet<OperationalServer> OperationalServers { get; set; } = null!;
    public DbSet<OperationalServerAudit> OperationalServerAudits { get; set; } = null!;
    
    // Patching - Configuración de compliance y cache de estado
    public DbSet<PatchComplianceConfig> PatchComplianceConfigs { get; set; } = null!;
    public DbSet<ServerPatchStatusCache> ServerPatchStatusCache { get; set; } = null!;
    public DbSet<PatchPlan> PatchPlans { get; set; } = null!;
    
    // Patching - Sistema mejorado de gestión de parcheos
    public DbSet<PatchingFreezingConfig> PatchingFreezingConfigs { get; set; } = null!;
    public DbSet<PatchNotificationSetting> PatchNotificationSettings { get; set; } = null!;
    public DbSet<PatchNotificationHistory> PatchNotificationHistories { get; set; } = null!;
    
    // Knowledge Base - Owners de bases de datos
    public DbSet<DatabaseOwner> DatabaseOwners { get; set; } = null!;
    
    // Vault de Credenciales DBA
    public DbSet<Credential> Credentials { get; set; } = null!;
    public DbSet<CredentialServer> CredentialServers { get; set; } = null!;
    public DbSet<CredentialAuditLog> CredentialAuditLogs { get; set; } = null!;
    public DbSet<CredentialGroup> CredentialGroups { get; set; } = null!;
    public DbSet<CredentialGroupMember> CredentialGroupMembers { get; set; } = null!;
    public DbSet<CredentialGroupShare> CredentialGroupShares { get; set; } = null!;
    public DbSet<CredentialUserShare> CredentialUserShares { get; set; } = null!;
    
    // Vault Enterprise v2.1 - Encryption Keys
    public DbSet<VaultEncryptionKey> VaultEncryptionKeys { get; set; } = null!;
    public DbSet<CredentialAccessLog> CredentialAccessLogs { get; set; } = null!;
    
    // Vault - Notification Preferences
    public DbSet<VaultNotificationPreference> VaultNotificationPreferences { get; set; } = null!;
    public DbSet<VaultNotificationType> VaultNotificationTypes { get; set; } = null!;
    
    // System Credentials - Credenciales de sistema para conexión a servidores
    public DbSet<SystemCredential> SystemCredentials { get; set; } = null!;
    public DbSet<SystemCredentialAssignment> SystemCredentialAssignments { get; set; } = null!;
    
    // Security Groups - Grupos de seguridad para organizar usuarios
    public DbSet<SecurityGroup> SecurityGroups { get; set; } = null!;
    public DbSet<UserGroup> UserGroups { get; set; } = null!;
    public DbSet<GroupPermission> GroupPermissions { get; set; } = null!;
    public DbSet<ADGroupSync> ADGroupSyncs { get; set; } = null!;
    
    // Admin Group Assignments - Asignaciones de grupos a admins
    public DbSet<AdminGroupAssignment> AdminGroupAssignments { get; set; } = null!;
    
    // Admin Roles - Sistema de roles personalizables
    public DbSet<AdminRole> AdminRoles { get; set; } = null!;
    public DbSet<AdminRoleCapability> AdminRoleCapabilities { get; set; } = null!;
    public DbSet<AdminRoleAssignableRole> AdminRoleAssignableRoles { get; set; } = null!;
    
    // Menu Badges - Indicadores de menús nuevos
    public DbSet<MenuBadge> MenuBadges { get; set; } = null!;

    // Inventory Cache - Caché de inventario SQL Server
    public DbSet<SqlServerInstanceCache> SqlServerInstancesCache { get; set; } = null!;
    public DbSet<SqlServerDatabaseCache> SqlServerDatabasesCache { get; set; } = null!;
    public DbSet<InventoryCacheMetadata> InventoryCacheMetadata { get; set; } = null!;
    
    // Inventory Cache - PostgreSQL
    public DbSet<PostgreSqlInstanceCache> PostgreSqlInstancesCache { get; set; } = null!;
    public DbSet<PostgreSqlDatabaseCache> PostgreSqlDatabasesCache { get; set; } = null!;
    
    // Inventory Cache - Redis
    public DbSet<RedisInstanceCache> RedisInstancesCache { get; set; } = null!;
    
    // Inventory Cache - DocumentDB
    public DbSet<DocumentDbInstanceCache> DocumentDbInstancesCache { get; set; } = null!;

    // Collector Configuration - HealthScore Collectors
    public DbSet<CollectorConfig> CollectorConfigs { get; set; } = null!;
    public DbSet<CollectorThreshold> CollectorThresholds { get; set; } = null!;
    public DbSet<SqlVersionQuery> SqlVersionQueries { get; set; } = null!;
    public DbSet<CollectorExecutionLog> CollectorExecutionLogs { get; set; } = null!;
    public DbSet<CollectorException> CollectorExceptions { get; set; } = null!;

    // Overview Issue Assignments - Asignaciones de problemas del Overview
    public DbSet<OverviewIssueAssignment> OverviewIssueAssignments { get; set; } = null!;
    
    // Backup Alerts - Alertas de backups atrasados
    public DbSet<BackupAlertConfig> BackupAlertConfigs { get; set; } = null!;
    public DbSet<BackupAlertHistory> BackupAlertHistories { get; set; } = null!;

    // Disk Alerts - Alertas de discos críticos
    public DbSet<DiskAlertConfig> DiskAlertConfigs { get; set; } = null!;
    public DbSet<DiskAlertHistory> DiskAlertHistories { get; set; } = null!;

    // Health Score v3.0 FINAL - 12 Categorías (métricas de instancias)
    public DbSet<InstanceHealthScore> InstanceHealthScores { get; set; } = null!;
    public DbSet<InstanceHealthBackups> InstanceHealthBackups { get; set; } = null!;
    public DbSet<InstanceHealthMaintenance> InstanceHealthMaintenance { get; set; } = null!;
    public DbSet<InstanceHealthAlwaysOn> InstanceHealthAlwaysOn { get; set; } = null!;
    public DbSet<InstanceHealthLogChain> InstanceHealthLogChain { get; set; } = null!;
    public DbSet<InstanceHealthDatabaseStates> InstanceHealthDatabaseStates { get; set; } = null!;
    public DbSet<InstanceHealthErroresCriticos> InstanceHealthErroresCriticos { get; set; } = null!;
    public DbSet<InstanceHealthCPU> InstanceHealthCPU { get; set; } = null!;
    public DbSet<InstanceHealthMemoria> InstanceHealthMemoria { get; set; } = null!;
    public DbSet<InstanceHealthIO> InstanceHealthIO { get; set; } = null!;
    public DbSet<InstanceHealthDiscos> InstanceHealthDiscos { get; set; } = null!;
    public DbSet<InstanceHealthConfiguracionTempdb> InstanceHealthConfiguracionTempdb { get; set; } = null!;
    public DbSet<InstanceHealthAutogrowth> InstanceHealthAutogrowth { get; set; } = null!;
    public DbSet<InstanceHealthWaits> InstanceHealthWaits { get; set; } = null!;

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

        // OnCallEscalation: usuarios de escalamiento con color y teléfono
        builder.Entity<OnCallEscalation>(entity =>
        {
            entity.ToTable("OnCallEscalations");
            entity.HasIndex(e => e.UserId).IsUnique();
            entity.HasIndex(e => e.EscalationOrder);

            entity.HasOne(e => e.User)
                .WithMany()
                .HasForeignKey(e => e.UserId)
                .OnDelete(DeleteBehavior.Cascade);
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

        // Overview Summary Cache
        builder.Entity<OverviewSummaryCache>(entity =>
        {
            entity.ToTable("OverviewSummaryCache");
            entity.HasIndex(c => c.CacheKey).IsUnique();
            entity.HasIndex(c => c.LastUpdatedUtc);
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

        // Patch Compliance Config
        builder.Entity<PatchComplianceConfig>(entity =>
        {
            entity.ToTable("PatchComplianceConfig");
            // Índice único por año + versión de SQL
            entity.HasIndex(c => new { c.ComplianceYear, c.SqlVersion }).IsUnique();
            entity.HasIndex(c => c.ComplianceYear);
            entity.HasIndex(c => c.IsActive);
        });

        // Server Patch Status Cache
        builder.Entity<ServerPatchStatusCache>(entity =>
        {
            entity.ToTable("ServerPatchStatusCache");
            entity.HasIndex(s => s.InstanceName).IsUnique();
            entity.HasIndex(s => s.PatchStatus);
            entity.HasIndex(s => s.LastChecked);
        });

        // Patch Plans - Planificación de parcheos
        builder.Entity<PatchPlan>(entity =>
        {
            entity.ToTable("PatchPlans");
            entity.HasIndex(p => p.ScheduledDate);
            entity.HasIndex(p => p.AssignedDbaId);
            entity.HasIndex(p => p.WasPatched);
            entity.HasIndex(p => new { p.ServerName, p.ScheduledDate });
            // Nuevos índices para sistema mejorado
            entity.HasIndex(p => p.Status);
            entity.HasIndex(p => p.CellTeam);
            entity.HasIndex(p => p.ClusterName);
            entity.HasIndex(p => p.Priority);
            entity.HasIndex(p => p.Ambiente);

            entity.HasOne(p => p.AssignedDba)
                .WithMany()
                .HasForeignKey(p => p.AssignedDbaId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(p => p.CreatedByUser)
                .WithMany()
                .HasForeignKey(p => p.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(p => p.PatchedByUser)
                .WithMany()
                .HasForeignKey(p => p.PatchedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Patching Freezing Config - Configuración de semanas de freezing
        builder.Entity<PatchingFreezingConfig>(entity =>
        {
            entity.ToTable("PatchingFreezingConfig");
            entity.HasIndex(f => f.WeekOfMonth).IsUnique();
        });

        // Patch Notification Settings - Configuración de notificaciones
        builder.Entity<PatchNotificationSetting>(entity =>
        {
            entity.ToTable("PatchNotificationSettings");
            entity.HasIndex(n => n.NotificationType).IsUnique();
        });

        // Patch Notification History - Historial de notificaciones
        builder.Entity<PatchNotificationHistory>(entity =>
        {
            entity.ToTable("PatchNotificationHistory");
            entity.HasIndex(h => h.PatchPlanId);
            entity.HasIndex(h => h.SentAt);

            entity.HasOne(h => h.PatchPlan)
                .WithMany()
                .HasForeignKey(h => h.PatchPlanId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // Database Owners - Knowledge Base de owners de BD
        builder.Entity<DatabaseOwner>(entity =>
        {
            entity.ToTable("DatabaseOwners");
            entity.HasIndex(o => o.ServerName);
            entity.HasIndex(o => o.CellTeam);
            entity.HasIndex(o => o.OwnerName);
            entity.HasIndex(o => o.OwnerEmail);
            entity.HasIndex(o => o.IsActive);
            entity.HasIndex(o => new { o.ServerName, o.InstanceName, o.DatabaseName }).IsUnique();
        });

        // =============================================
        // Vault de Credenciales DBA
        // =============================================
        
        builder.Entity<Credential>(entity =>
        {
            entity.ToTable("Credentials");
            entity.HasIndex(c => c.OwnerUserId);
            entity.HasIndex(c => c.IsPrivate);
            entity.HasIndex(c => c.IsDeleted);
            entity.HasIndex(c => c.IsTeamShared);
            entity.HasIndex(c => c.ExpiresAt);
            entity.HasIndex(c => c.CredentialType);
            entity.HasIndex(c => c.Name);
            entity.HasIndex(c => c.GroupId);

            entity.HasOne(c => c.Owner)
                .WithMany()
                .HasForeignKey(c => c.OwnerUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(c => c.CreatedByUser)
                .WithMany()
                .HasForeignKey(c => c.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(c => c.UpdatedByUser)
                .WithMany()
                .HasForeignKey(c => c.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(c => c.Group)
                .WithMany(g => g.Credentials)
                .HasForeignKey(c => c.GroupId)
                .OnDelete(DeleteBehavior.SetNull);

            entity.HasMany(c => c.Servers)
                .WithOne(s => s.Credential)
                .HasForeignKey(s => s.CredentialId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CredentialServer>(entity =>
        {
            entity.ToTable("CredentialServers");
            entity.HasIndex(cs => cs.CredentialId);
            entity.HasIndex(cs => cs.ServerName);
        });

        builder.Entity<CredentialAuditLog>(entity =>
        {
            entity.ToTable("CredentialAuditLog");
            entity.HasIndex(a => a.CredentialId);
            entity.HasIndex(a => a.PerformedByUserId);
            entity.HasIndex(a => a.PerformedAt);
            entity.HasIndex(a => a.Action);
        });

        // Grupos de credenciales
        builder.Entity<CredentialGroup>(entity =>
        {
            entity.ToTable("CredentialGroups");
            entity.HasIndex(g => g.OwnerUserId);
            entity.HasIndex(g => g.IsDeleted);
            entity.HasIndex(g => g.Name);

            entity.HasOne(g => g.Owner)
                .WithMany()
                .HasForeignKey(g => g.OwnerUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(g => g.UpdatedByUser)
                .WithMany()
                .HasForeignKey(g => g.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasMany(g => g.Members)
                .WithOne(m => m.Group)
                .HasForeignKey(m => m.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CredentialGroupMember>(entity =>
        {
            entity.ToTable("CredentialGroupMembers");
            entity.HasIndex(m => m.GroupId);
            entity.HasIndex(m => m.UserId);
            entity.HasIndex(m => new { m.GroupId, m.UserId }).IsUnique();

            entity.HasOne(m => m.User)
                .WithMany()
                .HasForeignKey(m => m.UserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(m => m.AddedByUser)
                .WithMany()
                .HasForeignKey(m => m.AddedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Compartición de credenciales con grupos (muchos a muchos)
        builder.Entity<CredentialGroupShare>(entity =>
        {
            entity.ToTable("CredentialGroupShares");
            entity.HasIndex(s => s.CredentialId);
            entity.HasIndex(s => s.GroupId);
            entity.HasIndex(s => new { s.CredentialId, s.GroupId }).IsUnique();

            entity.HasOne(s => s.Credential)
                .WithMany(c => c.GroupShares)
                .HasForeignKey(s => s.CredentialId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.Group)
                .WithMany()
                .HasForeignKey(s => s.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.SharedByUser)
                .WithMany()
                .HasForeignKey(s => s.SharedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // Compartición de credenciales con usuarios individuales
        builder.Entity<CredentialUserShare>(entity =>
        {
            entity.ToTable("CredentialUserShares");
            entity.HasIndex(s => s.CredentialId);
            entity.HasIndex(s => s.UserId);
            entity.HasIndex(s => new { s.CredentialId, s.UserId }).IsUnique();

            entity.HasOne(s => s.Credential)
                .WithMany(c => c.UserShares)
                .HasForeignKey(s => s.CredentialId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(s => s.User)
                .WithMany()
                .HasForeignKey(s => s.UserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(s => s.SharedByUser)
                .WithMany()
                .HasForeignKey(s => s.SharedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Vault Enterprise v2.1 - Encryption Keys & Access Log
        // =============================================
        
        builder.Entity<VaultEncryptionKey>(entity =>
        {
            entity.ToTable("VaultEncryptionKeys");
            entity.HasIndex(k => new { k.KeyId, k.KeyVersion }).IsUnique();
            entity.HasIndex(k => new { k.KeyPurpose, k.KeyId }).IsUnique();
            entity.HasIndex(k => k.KeyPurpose).HasFilter("[IsActive] = 1").IsUnique();
        });

        builder.Entity<CredentialAccessLog>(entity =>
        {
            entity.ToTable("CredentialAccessLog");
            entity.HasIndex(a => new { a.CredentialId, a.AccessedAt });
            entity.HasIndex(a => new { a.UserId, a.AccessedAt });
            entity.HasIndex(a => a.AccessedAt).HasFilter("[AccessResult] = 'Denied'");
        });

        // =============================================
        // Vault - Notification Preferences
        // =============================================
        
        builder.Entity<VaultNotificationPreference>(entity =>
        {
            entity.ToTable("VaultNotificationPreferences");
            entity.HasIndex(p => p.UserId);
            entity.HasIndex(p => p.NotificationType);
            entity.HasIndex(p => new { p.UserId, p.NotificationType }).IsUnique();

            entity.HasOne(p => p.User)
                .WithMany()
                .HasForeignKey(p => p.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<VaultNotificationType>(entity =>
        {
            entity.ToTable("VaultNotificationTypes");
            entity.HasIndex(t => t.Code).IsUnique();
            entity.HasIndex(t => t.IsActive);
            entity.HasIndex(t => t.DisplayOrder);
        });

        // =============================================
        // System Credentials - Credenciales de sistema
        // =============================================
        
        builder.Entity<SystemCredential>(entity =>
        {
            entity.ToTable("SystemCredentials");
            entity.HasIndex(c => c.Name).IsUnique();
            entity.HasIndex(c => c.IsActive);

            entity.HasOne(c => c.CreatedByUser)
                .WithMany()
                .HasForeignKey(c => c.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(c => c.UpdatedByUser)
                .WithMany()
                .HasForeignKey(c => c.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasMany(c => c.Assignments)
                .WithOne(a => a.SystemCredential)
                .HasForeignKey(a => a.SystemCredentialId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<SystemCredentialAssignment>(entity =>
        {
            entity.ToTable("SystemCredentialAssignments");
            entity.HasIndex(a => a.SystemCredentialId);
            entity.HasIndex(a => new { a.AssignmentType, a.AssignmentValue });
            entity.HasIndex(a => a.Priority);

            entity.HasOne(a => a.CreatedByUser)
                .WithMany()
                .HasForeignKey(a => a.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Security Groups - Grupos de seguridad
        // =============================================
        
        builder.Entity<SecurityGroup>(entity =>
        {
            entity.ToTable("SecurityGroups");
            entity.HasIndex(g => g.Name).IsUnique().HasFilter("[IsDeleted] = 0");
            entity.HasIndex(g => new { g.IsActive, g.IsDeleted });

            entity.Property(g => g.Name).HasMaxLength(100).IsRequired();
            entity.Property(g => g.Description).HasMaxLength(500);
            entity.Property(g => g.Color).HasMaxLength(20);
            entity.Property(g => g.Icon).HasMaxLength(50);

            entity.HasOne(g => g.CreatedByUser)
                .WithMany()
                .HasForeignKey(g => g.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(g => g.UpdatedByUser)
                .WithMany()
                .HasForeignKey(g => g.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasMany(g => g.Members)
                .WithOne(m => m.Group)
                .HasForeignKey(m => m.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(g => g.Permissions)
                .WithOne(p => p.Group)
                .HasForeignKey(p => p.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(g => g.ADSync)
                .WithOne(s => s.Group)
                .HasForeignKey<ADGroupSync>(s => s.GroupId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<UserGroup>(entity =>
        {
            entity.ToTable("UserGroups");
            entity.HasIndex(ug => new { ug.UserId, ug.GroupId }).IsUnique();
            entity.HasIndex(ug => ug.UserId);
            entity.HasIndex(ug => ug.GroupId);

            entity.HasOne(ug => ug.User)
                .WithMany()
                .HasForeignKey(ug => ug.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(ug => ug.AddedByUser)
                .WithMany()
                .HasForeignKey(ug => ug.AddedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        builder.Entity<GroupPermission>(entity =>
        {
            entity.ToTable("GroupPermissions");
            entity.HasIndex(gp => new { gp.GroupId, gp.ViewName }).IsUnique();
            entity.HasIndex(gp => gp.GroupId);

            entity.Property(gp => gp.ViewName).HasMaxLength(50).IsRequired();
        });

        builder.Entity<ADGroupSync>(entity =>
        {
            entity.ToTable("ADGroupSync");
            entity.HasIndex(s => s.GroupId).IsUnique();

            entity.Property(s => s.ADGroupName).HasMaxLength(200).IsRequired();
            entity.Property(s => s.LastSyncResult).HasMaxLength(500);

            entity.HasOne(s => s.CreatedByUser)
                .WithMany()
                .HasForeignKey(s => s.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(s => s.UpdatedByUser)
                .WithMany()
                .HasForeignKey(s => s.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Admin Group Assignments - Asignaciones a Admins
        // =============================================
        
        builder.Entity<AdminGroupAssignment>(entity =>
        {
            entity.ToTable("AdminGroupAssignments");
            entity.HasIndex(a => a.UserId);
            entity.HasIndex(a => a.GroupId);
            entity.HasIndex(a => new { a.UserId, a.GroupId }).IsUnique();

            entity.HasOne(a => a.User)
                .WithMany()
                .HasForeignKey(a => a.UserId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(a => a.Group)
                .WithMany()
                .HasForeignKey(a => a.GroupId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasOne(a => a.AssignedByUser)
                .WithMany()
                .HasForeignKey(a => a.AssignedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(a => a.UpdatedByUser)
                .WithMany()
                .HasForeignKey(a => a.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Admin Roles - Sistema de roles personalizables
        // =============================================
        
        builder.Entity<AdminRole>(entity =>
        {
            entity.ToTable("AdminRoles");
            entity.HasIndex(r => r.Name).IsUnique().HasFilter("[IsActive] = 1");
            entity.HasIndex(r => r.Priority);

            entity.Property(r => r.Name).HasMaxLength(100).IsRequired();
            entity.Property(r => r.Description).HasMaxLength(500);
            entity.Property(r => r.Color).HasMaxLength(20);
            entity.Property(r => r.Icon).HasMaxLength(50);

            entity.HasOne(r => r.CreatedByUser)
                .WithMany()
                .HasForeignKey(r => r.CreatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(r => r.UpdatedByUser)
                .WithMany()
                .HasForeignKey(r => r.UpdatedByUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasMany(r => r.Capabilities)
                .WithOne(c => c.Role)
                .HasForeignKey(c => c.RoleId)
                .OnDelete(DeleteBehavior.Cascade);

            entity.HasMany(r => r.Users)
                .WithOne(u => u.AdminRole)
                .HasForeignKey(u => u.AdminRoleId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<AdminRoleCapability>(entity =>
        {
            entity.ToTable("AdminRoleCapabilities");
            entity.HasIndex(c => new { c.RoleId, c.CapabilityKey }).IsUnique();
            entity.HasIndex(c => c.RoleId);

            entity.Property(c => c.CapabilityKey).HasMaxLength(100).IsRequired();
        });

        builder.Entity<AdminRoleAssignableRole>(entity =>
        {
            entity.ToTable("AdminRoleAssignableRoles");
            entity.HasIndex(a => new { a.RoleId, a.AssignableRoleId }).IsUnique();

            entity.HasOne(a => a.Role)
                .WithMany(r => r.AssignableRoles)
                .HasForeignKey(a => a.RoleId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(a => a.AssignableRole)
                .WithMany()
                .HasForeignKey(a => a.AssignableRoleId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Menu Badges - Indicadores de menús nuevos
        // =============================================
        
        builder.Entity<MenuBadge>(entity =>
        {
            entity.ToTable("MenuBadges");
            entity.HasIndex(m => m.MenuKey).IsUnique();
            
            entity.Property(m => m.MenuKey).HasMaxLength(100).IsRequired();
            entity.Property(m => m.DisplayName).HasMaxLength(100).IsRequired();
            entity.Property(m => m.BadgeText).HasMaxLength(50);
            entity.Property(m => m.BadgeColor).HasMaxLength(50);
            entity.Property(m => m.UpdatedBy).HasMaxLength(100);
        });

        // =============================================
        // Overview Issue Assignments - Asignaciones de problemas
        // =============================================
        
        builder.Entity<OverviewIssueAssignment>(entity =>
        {
            entity.ToTable("OverviewIssueAssignments");
            entity.HasIndex(a => a.IssueType);
            entity.HasIndex(a => a.InstanceName);
            entity.HasIndex(a => a.AssignedToUserId);
            entity.HasIndex(a => a.ResolvedAt);

            entity.HasOne(a => a.AssignedToUser)
                .WithMany()
                .HasForeignKey(a => a.AssignedToUserId)
                .OnDelete(DeleteBehavior.NoAction);

            entity.HasOne(a => a.AssignedByUser)
                .WithMany()
                .HasForeignKey(a => a.AssignedByUserId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        // =============================================
        // Backup Alerts - Alertas de backups atrasados
        // =============================================
        
        builder.Entity<BackupAlertConfig>(entity =>
        {
            entity.ToTable("BackupAlertConfig");
            
            entity.HasOne(c => c.UpdatedByUser)
                .WithMany()
                .HasForeignKey(c => c.UpdatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        builder.Entity<BackupAlertHistory>(entity =>
        {
            entity.ToTable("BackupAlertHistory");
            entity.HasIndex(h => h.SentAt);
            entity.HasIndex(h => h.ConfigId);

            entity.HasOne(h => h.Config)
                .WithMany()
                .HasForeignKey(h => h.ConfigId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // =============================================
        // Collector Configuration - HealthScore Collectors
        // =============================================
        
        builder.Entity<CollectorConfig>(entity =>
        {
            entity.ToTable("CollectorConfig");
            entity.HasKey(e => e.CollectorName);
            
            entity.HasMany(e => e.Thresholds)
                .WithOne(t => t.Collector)
                .HasForeignKey(t => t.CollectorName)
                .OnDelete(DeleteBehavior.Cascade);
            
            entity.HasMany(e => e.VersionQueries)
                .WithOne(q => q.Collector)
                .HasForeignKey(q => q.CollectorName)
                .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<CollectorThreshold>(entity =>
        {
            entity.ToTable("CollectorThresholds");
            entity.HasIndex(e => e.CollectorName);
            entity.HasIndex(e => new { e.CollectorName, e.ThresholdName }).IsUnique();
        });

        builder.Entity<SqlVersionQuery>(entity =>
        {
            entity.ToTable("SqlVersionQueries");
            entity.HasIndex(e => e.CollectorName);
            entity.HasIndex(e => new { e.MinSqlVersion, e.MaxSqlVersion });
        });

        builder.Entity<CollectorExecutionLog>(entity =>
        {
            entity.ToTable("CollectorExecutionLog");
            entity.HasIndex(e => new { e.CollectorName, e.StartedAtUtc });
            entity.HasIndex(e => new { e.Status, e.StartedAtUtc });
        });

        // =============================================
        // Health Score v3.0 FINAL - 12 Categorías (métricas)
        // =============================================
        
        builder.Entity<InstanceHealthScore>(entity =>
        {
            entity.ToTable("InstanceHealth_Score");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthBackups>(entity =>
        {
            entity.ToTable("InstanceHealth_Backups");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthMaintenance>(entity =>
        {
            entity.ToTable("InstanceHealth_Maintenance");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthAlwaysOn>(entity =>
        {
            entity.ToTable("InstanceHealth_AlwaysOn");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthLogChain>(entity =>
        {
            entity.ToTable("InstanceHealth_LogChain");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthDatabaseStates>(entity =>
        {
            entity.ToTable("InstanceHealth_DatabaseStates");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthErroresCriticos>(entity =>
        {
            entity.ToTable("InstanceHealth_ErroresCriticos");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthCPU>(entity =>
        {
            entity.ToTable("InstanceHealth_CPU");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthMemoria>(entity =>
        {
            entity.ToTable("InstanceHealth_Memoria");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthIO>(entity =>
        {
            entity.ToTable("InstanceHealth_IO");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthDiscos>(entity =>
        {
            entity.ToTable("InstanceHealth_Discos");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthConfiguracionTempdb>(entity =>
        {
            entity.ToTable("InstanceHealth_ConfiguracionTempdb");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthAutogrowth>(entity =>
        {
            entity.ToTable("InstanceHealth_Autogrowth");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

        builder.Entity<InstanceHealthWaits>(entity =>
        {
            entity.ToTable("InstanceHealth_Waits");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.InstanceName, e.CollectedAtUtc });
        });

    }
}

