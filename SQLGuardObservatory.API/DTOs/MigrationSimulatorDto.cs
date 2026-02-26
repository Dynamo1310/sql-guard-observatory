namespace SQLGuardObservatory.API.DTOs;

public class MigrationSourceRequest
{
    public List<string> InstanceNames { get; set; } = new();
}

public class MigrationSourceResponse
{
    public List<MigrationServerDto> Servers { get; set; } = new();
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
}

public class MigrationServerDto
{
    public string InstanceName { get; set; } = string.Empty;
    public bool ConnectionSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public string? SqlVersion { get; set; }
    public List<MigrationDatabaseDto> Databases { get; set; } = new();
    public decimal TotalDataSizeMB { get; set; }
    public decimal TotalLogSizeMB { get; set; }
    public decimal TotalSizeMB { get; set; }
}

public class MigrationDatabaseDto
{
    public string Name { get; set; } = string.Empty;
    public decimal DataSizeMB { get; set; }
    public decimal LogSizeMB { get; set; }
    public decimal TotalSizeMB { get; set; }
    public string? State { get; set; }
    public string? RecoveryModel { get; set; }
    public string? CompatibilityLevel { get; set; }
    public string? Collation { get; set; }
    public int DataFileCount { get; set; }
    public int LogFileCount { get; set; }
}

public class NamingSuggestionResponse
{
    public string BaseName { get; set; } = string.Empty;
    public int NextAvailableNumber { get; set; }
    public string Environment { get; set; } = string.Empty;
    public string TargetVersion { get; set; } = string.Empty;
    public List<string> ExistingInstances { get; set; } = new();
    public List<ExistingInstanceInfo> ExistingInstancesInfo { get; set; } = new();
}

public class ExistingInstanceInfo
{
    public string Name { get; set; } = string.Empty;
    public bool ConnectionSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public decimal CurrentDataSizeMB { get; set; }
    public decimal CurrentLogSizeMB { get; set; }
    public int CurrentDatabaseCount { get; set; }
    public List<string> CurrentDatabaseNames { get; set; } = new();
    public int CurrentDataDiskCount { get; set; }
    public string? LastDataDiskLetter { get; set; }
}
