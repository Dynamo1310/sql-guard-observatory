namespace SQLGuardObservatory.API.DTOs;

public class TempDbCheckResultDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? MajorVersion { get; set; }
    public bool ConnectionSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public List<TempDbRecommendationDto> Recommendations { get; set; } = new();
    public int OverallScore { get; set; }
    public DateTime AnalyzedAt { get; set; }
}

public class TempDbRecommendationDto
{
    public string Name { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Details { get; set; } = string.Empty;
    public string? Suggestion { get; set; }
    public string? SqlScript { get; set; }
}

public class TempDbAnalysisResponse
{
    public List<TempDbCheckResultDto> Results { get; set; } = new();
    public DateTime? LastFullScanAt { get; set; }
    public int TotalInstances { get; set; }
    public int ComplianceCount { get; set; }
    public int WarningCount { get; set; }
    public int FailCount { get; set; }
}
