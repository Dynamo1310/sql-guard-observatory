namespace SQLGuardObservatory.API.DTOs;

public class AnalyticsEventDto
{
    public string EventName { get; set; } = string.Empty;
    public string? Route { get; set; }
    public string? ReferrerRoute { get; set; }
    public string? Source { get; set; }
    public Dictionary<string, object>? Properties { get; set; }
    public int? DurationMs { get; set; }
    public bool? Success { get; set; }
    public long? Timestamp { get; set; }
    public string? SessionId { get; set; }
}

public class AnalyticsIngestRequest
{
    public List<AnalyticsEventDto> Events { get; set; } = new();
    public string? SessionId { get; set; }
}

public class AnalyticsOverviewDto
{
    public int DailyActiveUsers { get; set; }
    public int WeeklyActiveUsers { get; set; }
    public int MonthlyActiveUsers { get; set; }
    public int TodaySessions { get; set; }
    public double MedianSessionDurationMinutes { get; set; }
    public List<TopRouteDto> TopRoutes { get; set; } = new();
    public List<TopEventDto> TopEvents { get; set; } = new();
    public List<DailyTrendDto> DailyTrend { get; set; } = new();
}

public class TopRouteDto
{
    public string Route { get; set; } = string.Empty;
    public int PageViews { get; set; }
    public int UniqueUsers { get; set; }
}

public class TopEventDto
{
    public string EventName { get; set; } = string.Empty;
    public int Count { get; set; }
    public int UniqueUsers { get; set; }
}

public class DailyTrendDto
{
    public string Date { get; set; } = string.Empty;
    public int ActiveUsers { get; set; }
    public int Sessions { get; set; }
    public int PageViews { get; set; }
}

public class AnalyticsFrictionDto
{
    public List<FrictionErrorDto> TopErrors { get; set; } = new();
    public List<FrictionEmptyStateDto> TopEmptyStates { get; set; } = new();
    public List<FrictionSlowScreenDto> SlowScreens { get; set; } = new();
    public List<FrictionSlowEndpointDto> SlowEndpoints { get; set; } = new();
    public List<FrictionPermissionDeniedDto> PermissionDenials { get; set; } = new();
}

public class FrictionErrorDto
{
    public string EventName { get; set; } = string.Empty;
    public string? Route { get; set; }
    public int Count { get; set; }
    public int UniqueUsers { get; set; }
}

public class FrictionEmptyStateDto
{
    public string Route { get; set; } = string.Empty;
    public int Count { get; set; }
    public int UniqueUsers { get; set; }
}

public class FrictionSlowScreenDto
{
    public string Route { get; set; } = string.Empty;
    public int AvgDurationMs { get; set; }
    public int P95DurationMs { get; set; }
    public int ViewCount { get; set; }
}

public class FrictionSlowEndpointDto
{
    public string Endpoint { get; set; } = string.Empty;
    public int AvgDurationMs { get; set; }
    public int P95DurationMs { get; set; }
    public int Count { get; set; }
}

public class FrictionPermissionDeniedDto
{
    public string Route { get; set; } = string.Empty;
    public int Count { get; set; }
    public int UniqueUsers { get; set; }
}

public class AnalyticsJourneysDto
{
    public List<FunnelDto> Funnels { get; set; } = new();
    public List<CommonPathDto> CommonPaths { get; set; } = new();
}

public class FunnelDto
{
    public string Name { get; set; } = string.Empty;
    public List<FunnelStepDto> Steps { get; set; } = new();
}

public class FunnelStepDto
{
    public string StepName { get; set; } = string.Empty;
    public int Users { get; set; }
    public double ConversionRate { get; set; }
}

public class CommonPathDto
{
    public List<string> Path { get; set; } = new();
    public int SessionCount { get; set; }
}

public class AnalyticsHeatmapDto
{
    public List<HeatmapCellDto> Cells { get; set; } = new();
}

public class HeatmapCellDto
{
    public int DayOfWeek { get; set; }
    public int Hour { get; set; }
    public int EventCount { get; set; }
    public int UniqueUsers { get; set; }
}

public class AnalyticsUserDetailDto
{
    public string UserId { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public int TotalSessions { get; set; }
    public int TotalEvents { get; set; }
    public DateTime? LastSeenAt { get; set; }
    public List<string> TopRoutes { get; set; } = new();
    public List<TopEventDto> TopEvents { get; set; } = new();
}
