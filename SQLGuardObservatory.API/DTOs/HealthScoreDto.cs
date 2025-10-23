namespace SQLGuardObservatory.API.DTOs
{
    public class HealthScoreDto
    {
        public string InstanceName { get; set; } = string.Empty;
        public string? Ambiente { get; set; }
        public string? HostingSite { get; set; }
        public string? Version { get; set; }
        public bool ConnectSuccess { get; set; }
        public int? ConnectLatencyMs { get; set; }
        public int HealthScore { get; set; }
        public string HealthStatus { get; set; } = string.Empty;
        public DateTime GeneratedAtUtc { get; set; }
        
        // v2.0: Breakdown por Tiers (150 puntos)
        public int? Tier1_Availability { get; set; }
        public int? Tier2_Continuity { get; set; }
        public int? Tier3_Resources { get; set; }
        public int? Tier4_Maintenance { get; set; }
        
        // v2.0: Breakdown detallado
        public int? ConnectivityScore { get; set; }
        public int? BlockingScore { get; set; }
        public int? MemoryScore { get; set; }
        public int? AlwaysOnScore { get; set; }
        public int? FullBackupScore { get; set; }
        public int? LogBackupScore { get; set; }
        public int? DiskSpaceScore { get; set; }
        public int? IOPSScore { get; set; }
        public int? QueryPerformanceScore { get; set; }
        public int? CheckdbScore { get; set; }
        public int? IndexOptimizeScore { get; set; }
        public int? ErrorlogScore { get; set; }
        
        // Detalles JSON parseados
        public BackupSummary? BackupSummary { get; set; }
        public MaintenanceSummary? MaintenanceSummary { get; set; }
        public DiskSummary? DiskSummary { get; set; }
        public ResourceSummary? ResourceSummary { get; set; }
        public AlwaysOnSummary? AlwaysOnSummary { get; set; }
        public ErrorlogSummary? ErrorlogSummary { get; set; }
    }

    public class BackupSummary
    {
        public DateTime? LastFullBackup { get; set; }
        public DateTime? LastDiffBackup { get; set; }
        public DateTime? LastLogBackup { get; set; }
        public List<string>? Breaches { get; set; }
    }

    public class MaintenanceSummary
    {
        public bool? CheckdbOk { get; set; }
        public bool? IndexOptimizeOk { get; set; }
        public string? LastCheckdb { get; set; }
        public string? LastIndexOptimize { get; set; }
    }

    public class DiskSummary
    {
        public decimal? WorstFreePct { get; set; }
        public List<VolumeInfo>? Volumes { get; set; }
    }

    public class VolumeInfo
    {
        public string? Drive { get; set; }
        public decimal? TotalGB { get; set; }
        public decimal? FreeGB { get; set; }
        public decimal? FreePct { get; set; }
    }

    public class ResourceSummary
    {
        public bool? CpuHighFlag { get; set; }
        public bool? MemoryPressureFlag { get; set; }
        
        // v2.0: Nuevas métricas
        public int? BlockingCount { get; set; }
        public int? MaxBlockTimeSeconds { get; set; }
        public int? PageLifeExpectancy { get; set; }
        public decimal? BufferCacheHitRatio { get; set; }
        public decimal? AvgReadLatencyMs { get; set; }
        public decimal? AvgWriteLatencyMs { get; set; }
        public decimal? MaxReadLatencyMs { get; set; }
        public decimal? TotalIOPS { get; set; }
        public int? SlowQueriesCount { get; set; }
        public int? LongRunningQueriesCount { get; set; }
        
        public Dictionary<string, object>? RawCounters { get; set; }
    }

    public class AlwaysOnSummary
    {
        public bool? Enabled { get; set; }
        public string? WorstState { get; set; }
        public List<string>? Issues { get; set; }
    }

    public class ErrorlogSummary
    {
        public int? Severity20PlusCount24h { get; set; }
        public bool? Skipped { get; set; }
    }

    public class HealthScoreSummaryDto
    {
        public int TotalInstances { get; set; }
        public int HealthyCount { get; set; }
        public int WarningCount { get; set; }
        public int CriticalCount { get; set; }
        public int AvgScore { get; set; }
        public DateTime? LastUpdate { get; set; }
    }

    public class OverviewDataDto
    {
        public HealthScoreSummaryDto HealthSummary { get; set; } = new();
        public int CriticalDisksCount { get; set; }
        public int BackupsOverdueCount { get; set; }
        public int MaintenanceOverdueCount { get; set; }
        public int FailedJobsCount { get; set; }
        public List<CriticalInstanceDto> CriticalInstances { get; set; } = new();
        public List<BackupIssueDto> BackupIssues { get; set; } = new();
    }

    public class CriticalInstanceDto
    {
        public string InstanceName { get; set; } = string.Empty;
        public string? Ambiente { get; set; }
        public int HealthScore { get; set; }
        public string HealthStatus { get; set; } = string.Empty;
        public List<string> Issues { get; set; } = new();
    }

    public class BackupIssueDto
    {
        public string InstanceName { get; set; } = string.Empty;
        public string? Ambiente { get; set; }
        public List<string> Breaches { get; set; } = new();
        public DateTime? LastFullBackup { get; set; }
        public DateTime? LastLogBackup { get; set; }
    }
}

