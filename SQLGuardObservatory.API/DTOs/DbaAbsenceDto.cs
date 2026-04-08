namespace SQLGuardObservatory.API.DTOs;

public class DbaAbsenceDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserDisplayName { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public string CreatedByDisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class CreateDbaAbsenceRequest
{
    public string UserId { get; set; } = string.Empty;
    public DateTime Date { get; set; }
    public string Reason { get; set; } = string.Empty;
    public string? Notes { get; set; }
}

public class DbaAbsenceDbaDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
}

public class DbaAbsenceStatsDto
{
    public List<MonthlyStatItem> MonthlyStats { get; set; } = new();
    public List<ByDbaStatItem> ByDbaStats { get; set; } = new();
}

public class MonthlyStatItem
{
    public string Month { get; set; } = string.Empty;
    public int Count { get; set; }
}

public class ByDbaStatItem
{
    public string DisplayName { get; set; } = string.Empty;
    public int Count { get; set; }
}
