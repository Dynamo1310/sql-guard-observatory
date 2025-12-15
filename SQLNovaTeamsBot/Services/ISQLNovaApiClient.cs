namespace SQLNovaTeamsBot.Services;

/// <summary>
/// Interface para el cliente de la API de SQL Nova
/// </summary>
public interface ISQLNovaApiClient
{
    Task<HealthSummaryResponse?> GetHealthSummaryAsync();
    Task<List<HealthScoreItem>?> GetHealthScoresAsync();
    Task<OnCallResponse?> GetCurrentOnCallAsync();
    Task<List<AlertItem>?> GetActiveAlertsAsync();
}

// ==================== DTOs ====================

public class HealthSummaryResponse
{
    public int TotalInstances { get; set; }
    public int HealthyCount { get; set; }
    public int WarningCount { get; set; }
    public int CriticalCount { get; set; }
    public int AvgScore { get; set; }
    public DateTime? LastUpdate { get; set; }
}

public class HealthScoreItem
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = string.Empty;
    public DateTime GeneratedAtUtc { get; set; }
}

public class OnCallResponse
{
    public string? UserId { get; set; }
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTime WeekStartDate { get; set; }
    public DateTime WeekEndDate { get; set; }
    public int WeekNumber { get; set; }
    public bool IsCurrentlyOnCall { get; set; }
    public List<EscalationUser>? EscalationUsers { get; set; }
}

public class EscalationUser
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int Order { get; set; }
}

public class AlertItem
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = string.Empty;
    public List<string> Issues { get; set; } = new();
}


