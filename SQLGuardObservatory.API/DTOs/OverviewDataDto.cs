namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO principal para el endpoint /api/overview-data
/// Contiene todos los datos necesarios para la página Overview en una sola respuesta
/// </summary>
public class OverviewPageDataDto
{
    // KPIs - Estadísticas generales
    public int TotalInstances { get; set; }
    public int HealthyCount { get; set; }
    public int WarningCount { get; set; }
    public int RiskCount { get; set; }
    public int CriticalCount { get; set; }
    public double AvgScore { get; set; }
    public int BackupsOverdue { get; set; }
    public int CriticalDisksCount { get; set; }
    public int MaintenanceOverdueCount { get; set; }
    
    // Listas para las tablas del Overview
    public List<OverviewCriticalInstanceDto> CriticalInstances { get; set; } = new();
    public List<OverviewBackupIssueDto> BackupIssues { get; set; } = new();
    public List<OverviewCriticalDiskDto> CriticalDisks { get; set; } = new();
    public List<OverviewMaintenanceOverdueDto> MaintenanceOverdue { get; set; } = new();
    
    // Timestamp de última actualización
    public DateTime? LastUpdate { get; set; }
}

/// <summary>
/// Instancia con health score crítico (< 60)
/// </summary>
public class OverviewCriticalInstanceDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public int HealthScore { get; set; }
    public List<string> Issues { get; set; } = new();
    
    // Scores individuales para determinar problemas
    public int? Score_Backups { get; set; }
    public int? Score_AlwaysOn { get; set; }
    public int? Score_CPU { get; set; }
    public int? Score_Memoria { get; set; }
    public int? Score_Discos { get; set; }
    public int? Score_Maintenance { get; set; }
}

/// <summary>
/// Instancia con problemas de backup
/// </summary>
public class OverviewBackupIssueDto
{
    public string InstanceName { get; set; } = string.Empty;
    public int Score { get; set; }
    public List<string> Issues { get; set; } = new();
    
    // Campos detallados de breach
    public bool FullBackupBreached { get; set; }
    public bool LogBackupBreached { get; set; }
    public DateTime? LastFullBackup { get; set; }
    public DateTime? LastLogBackup { get; set; }
    
    /// <summary>
    /// Lista de bases de datos con backup atrasado (formato: "DBName:FULL=Xh" o "DBName:LOG=Xh")
    /// </summary>
    public List<string> BreachedDatabases { get; set; } = new();
    
    // Campos para supresión de alertas de LOG durante FULL backup
    /// <summary>
    /// Indica si el chequeo de LOG está suprimido (por FULL running o grace period)
    /// </summary>
    public bool LogCheckSuppressed { get; set; }
    
    /// <summary>
    /// Razón de la supresión: "FULL_RUNNING" o "GRACE_PERIOD"
    /// </summary>
    public string? LogCheckSuppressReason { get; set; }
}

/// <summary>
/// Disco crítico (alertado)
/// </summary>
public class OverviewCriticalDiskDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string Drive { get; set; } = string.Empty;
    public decimal PorcentajeLibre { get; set; }
    public decimal RealPorcentajeLibre { get; set; }
    public decimal LibreGB { get; set; }
    public decimal RealLibreGB { get; set; }
    public decimal EspacioInternoEnArchivosGB { get; set; }
    public string Estado { get; set; } = string.Empty;
}

/// <summary>
/// Instancia con mantenimiento vencido
/// </summary>
public class OverviewMaintenanceOverdueDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty; // AGName si pertenece a un AG, sino InstanceName
    public string Tipo { get; set; } = string.Empty; // "CHECKDB", "IndexOptimize", "CHECKDB e IndexOptimize"
    public DateTime? LastCheckdb { get; set; }
    public DateTime? LastIndexOptimize { get; set; }
    public bool CheckdbVencido { get; set; }
    public bool IndexOptimizeVencido { get; set; }
    public string? AgName { get; set; }
}

/// <summary>
/// DTO interno para mapear resultados de la query de health scores
/// </summary>
public class OverviewHealthScoreRaw
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = string.Empty;
    public int BackupsScore { get; set; }
    public int AlwaysOnScore { get; set; }
    public int CPUScore { get; set; }
    public int MemoriaScore { get; set; }
    public int DiscosScore { get; set; }
    public int MantenimientosScore { get; set; }
}

/// <summary>
/// DTO interno para mapear resultados de la query de mantenimiento
/// </summary>
public class OverviewMaintenanceRaw
{
    public string InstanceName { get; set; } = string.Empty;
    public string? AGName { get; set; }
    public bool CheckdbOk { get; set; }
    public bool IndexOptimizeOk { get; set; }
    public DateTime? LastCheckdb { get; set; }
    public DateTime? LastIndexOptimize { get; set; }
}

/// <summary>
/// DTO interno para mapear resultados de la query de backups
/// </summary>
public class OverviewBackupBreachRaw
{
    public string InstanceName { get; set; } = string.Empty;
    public bool FullBackupBreached { get; set; }
    public bool LogBackupBreached { get; set; }
    public DateTime? LastFullBackup { get; set; }
    public DateTime? LastLogBackup { get; set; }
    public string? BackupDetails { get; set; }
    
    // Campos para supresión de alertas de LOG
    public bool LogCheckSuppressed { get; set; }
    public string? LogCheckSuppressReason { get; set; }
}
