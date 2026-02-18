using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models.Analytics;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IAnalyticsService
{
    Task IngestEventsAsync(List<AnalyticsEventDto> events, string userId, string? sessionId);
    Task<AnalyticsOverviewDto> GetOverviewAsync(DateTime from, DateTime to);
    Task<AnalyticsFrictionDto> GetFrictionAsync(DateTime from, DateTime to);
    Task<AnalyticsJourneysDto> GetJourneysAsync(DateTime from, DateTime to);
    Task<AnalyticsHeatmapDto> GetHeatmapAsync(DateTime from, DateTime to);
    Task<AnalyticsUserDetailDto?> GetUserDetailAsync(string userId, DateTime from, DateTime to);
    Task AggregateAsync(DateOnly date);
}

public class AnalyticsService : IAnalyticsService
{
    private readonly ApplicationDbContext _db;
    private readonly ILogger<AnalyticsService> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public AnalyticsService(ApplicationDbContext db, ILogger<AnalyticsService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task IngestEventsAsync(List<AnalyticsEventDto> events, string userId, string? sessionId)
    {
        if (events.Count == 0) return;

        var effectiveSessionId = sessionId ?? Guid.NewGuid().ToString("N");
        var entities = new List<AnalyticsEvent>(events.Count);
        var hasSessionStart = false;
        var hasSessionEnd = false;
        var pageViewCount = 0;

        foreach (var dto in events)
        {
            var occurredAt = dto.Timestamp.HasValue
                ? DateTimeOffset.FromUnixTimeMilliseconds(dto.Timestamp.Value).UtcDateTime
                : DateTime.UtcNow;

            var entity = new AnalyticsEvent
            {
                EventId = Guid.NewGuid(),
                OccurredAt = occurredAt,
                UserId = userId,
                SessionId = dto.SessionId ?? effectiveSessionId,
                EventName = dto.EventName,
                Route = dto.Route,
                ReferrerRoute = dto.ReferrerRoute,
                Source = dto.Source ?? "web",
                PropertiesJson = dto.Properties != null
                    ? JsonSerializer.Serialize(dto.Properties, JsonOptions)
                    : null,
                DurationMs = dto.DurationMs,
                Success = dto.Success,
                CreatedAt = DateTime.UtcNow
            };

            entities.Add(entity);

            if (dto.EventName == "session_start") hasSessionStart = true;
            if (dto.EventName == "session_end") hasSessionEnd = true;
            if (dto.EventName == "page_view") pageViewCount++;
        }

        await _db.AnalyticsEvents.AddRangeAsync(entities);

        if (hasSessionStart)
        {
            var existing = await _db.AnalyticsSessions
                .FirstOrDefaultAsync(s => s.SessionId == effectiveSessionId);

            if (existing == null)
            {
                _db.AnalyticsSessions.Add(new AnalyticsSession
                {
                    SessionId = effectiveSessionId,
                    UserId = userId,
                    StartedAt = entities.First().OccurredAt,
                    EventCount = entities.Count,
                    PageViewCount = pageViewCount
                });
            }
        }
        else
        {
            var session = await _db.AnalyticsSessions
                .FirstOrDefaultAsync(s => s.SessionId == effectiveSessionId);

            if (session != null)
            {
                session.EventCount += entities.Count;
                session.PageViewCount += pageViewCount;
                if (hasSessionEnd)
                    session.EndedAt = entities.Last().OccurredAt;
            }
        }

        await _db.SaveChangesAsync();
    }

    public async Task<AnalyticsOverviewDto> GetOverviewAsync(DateTime from, DateTime to)
    {
        var today = DateTime.UtcNow.Date;
        var weekAgo = today.AddDays(-7);
        var monthAgo = today.AddDays(-30);

        var dau = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= today)
            .Select(e => e.UserId).Distinct().CountAsync();

        var wau = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= weekAgo)
            .Select(e => e.UserId).Distinct().CountAsync();

        var mau = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= monthAgo)
            .Select(e => e.UserId).Distinct().CountAsync();

        var todaySessions = await _db.AnalyticsSessions
            .Where(s => s.StartedAt >= today)
            .CountAsync();

        var sessionDurations = await _db.AnalyticsSessions
            .Where(s => s.StartedAt >= today && s.EndedAt != null)
            .Select(s => EF.Functions.DateDiffMinute(s.StartedAt, s.EndedAt!.Value))
            .ToListAsync();

        var medianDuration = sessionDurations.Count > 0
            ? sessionDurations.OrderBy(d => d).ElementAt(sessionDurations.Count / 2)
            : 0;

        var topRoutes = await _db.AnalyticsDaily
            .Where(d => d.Date >= DateOnly.FromDateTime(from) && d.Date <= DateOnly.FromDateTime(to) && d.EventName == "page_view" && d.Route != null)
            .GroupBy(d => d.Route!)
            .Select(g => new TopRouteDto
            {
                Route = g.Key,
                PageViews = g.Sum(x => x.EventCount),
                UniqueUsers = g.Sum(x => x.UniqueUsers)
            })
            .OrderByDescending(r => r.PageViews)
            .Take(15)
            .ToListAsync();

        if (topRoutes.Count == 0)
        {
            topRoutes = await _db.AnalyticsEvents
                .Where(e => e.OccurredAt >= from && e.OccurredAt <= to && e.EventName == "page_view" && e.Route != null)
                .GroupBy(e => e.Route!)
                .Select(g => new TopRouteDto
                {
                    Route = g.Key,
                    PageViews = g.Count(),
                    UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
                })
                .OrderByDescending(r => r.PageViews)
                .Take(15)
                .ToListAsync();
        }

        var topEvents = await _db.AnalyticsDaily
            .Where(d => d.Date >= DateOnly.FromDateTime(from) && d.Date <= DateOnly.FromDateTime(to)
                && d.EventName != "page_view" && d.EventName != "screen_time"
                && d.EventName != "session_start" && d.EventName != "session_end")
            .GroupBy(d => d.EventName)
            .Select(g => new TopEventDto
            {
                EventName = g.Key,
                Count = g.Sum(x => x.EventCount),
                UniqueUsers = g.Sum(x => x.UniqueUsers)
            })
            .OrderByDescending(e => e.Count)
            .Take(15)
            .ToListAsync();

        if (topEvents.Count == 0)
        {
            topEvents = await _db.AnalyticsEvents
                .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                    && e.EventName != "page_view" && e.EventName != "screen_time"
                    && e.EventName != "session_start" && e.EventName != "session_end")
                .GroupBy(e => e.EventName)
                .Select(g => new TopEventDto
                {
                    EventName = g.Key,
                    Count = g.Count(),
                    UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
                })
                .OrderByDescending(e => e.Count)
                .Take(15)
                .ToListAsync();
        }

        var dailyTrendRaw = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to)
            .GroupBy(e => new { e.OccurredAt.Year, e.OccurredAt.Month, e.OccurredAt.Day })
            .Select(g => new
            {
                g.Key.Year,
                g.Key.Month,
                g.Key.Day,
                ActiveUsers = g.Select(e => e.UserId).Distinct().Count(),
                Sessions = g.Select(e => e.SessionId).Distinct().Count(),
                PageViews = g.Count(e => e.EventName == "page_view")
            })
            .OrderBy(d => d.Year).ThenBy(d => d.Month).ThenBy(d => d.Day)
            .ToListAsync();

        var dailyTrend = dailyTrendRaw.Select(d => new DailyTrendDto
        {
            Date = $"{d.Year:D4}-{d.Month:D2}-{d.Day:D2}",
            ActiveUsers = d.ActiveUsers,
            Sessions = d.Sessions,
            PageViews = d.PageViews
        }).ToList();

        return new AnalyticsOverviewDto
        {
            DailyActiveUsers = dau,
            WeeklyActiveUsers = wau,
            MonthlyActiveUsers = mau,
            TodaySessions = todaySessions,
            MedianSessionDurationMinutes = medianDuration,
            TopRoutes = topRoutes,
            TopEvents = topEvents,
            DailyTrend = dailyTrend
        };
    }

    public async Task<AnalyticsFrictionDto> GetFrictionAsync(DateTime from, DateTime to)
    {
        var topErrors = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                && (e.EventName == "api_error" || e.EventName == "ui_error"))
            .GroupBy(e => new { e.EventName, e.Route })
            .Select(g => new FrictionErrorDto
            {
                EventName = g.Key.EventName,
                Route = g.Key.Route,
                Count = g.Count(),
                UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
            })
            .OrderByDescending(e => e.Count)
            .Take(20)
            .ToListAsync();

        var topEmptyStates = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName == "empty_state_seen" && e.Route != null)
            .GroupBy(e => e.Route!)
            .Select(g => new FrictionEmptyStateDto
            {
                Route = g.Key,
                Count = g.Count(),
                UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
            })
            .OrderByDescending(e => e.Count)
            .Take(15)
            .ToListAsync();

        var slowScreens = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName == "screen_time" && e.Route != null && e.DurationMs != null)
            .GroupBy(e => e.Route!)
            .Select(g => new FrictionSlowScreenDto
            {
                Route = g.Key,
                AvgDurationMs = (int)g.Average(e => e.DurationMs!.Value),
                P95DurationMs = 0,
                ViewCount = g.Count()
            })
            .OrderByDescending(s => s.AvgDurationMs)
            .Take(15)
            .ToListAsync();

        var slowEndpoints = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName == "slow_request" && e.DurationMs != null)
            .GroupBy(e => e.Route!)
            .Select(g => new FrictionSlowEndpointDto
            {
                Endpoint = g.Key ?? "unknown",
                AvgDurationMs = (int)g.Average(e => e.DurationMs!.Value),
                P95DurationMs = 0,
                Count = g.Count()
            })
            .OrderByDescending(e => e.AvgDurationMs)
            .Take(15)
            .ToListAsync();

        var permissionDenials = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName == "permission_denied" && e.Route != null)
            .GroupBy(e => e.Route!)
            .Select(g => new FrictionPermissionDeniedDto
            {
                Route = g.Key,
                Count = g.Count(),
                UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
            })
            .OrderByDescending(e => e.Count)
            .Take(15)
            .ToListAsync();

        return new AnalyticsFrictionDto
        {
            TopErrors = topErrors,
            TopEmptyStates = topEmptyStates,
            SlowScreens = slowScreens,
            SlowEndpoints = slowEndpoints,
            PermissionDenials = permissionDenials
        };
    }

    public async Task<AnalyticsJourneysDto> GetJourneysAsync(DateTime from, DateTime to)
    {
        var sessions = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to && e.EventName == "page_view" && e.Route != null)
            .GroupBy(e => e.SessionId)
            .Where(g => g.Count() >= 2)
            .Select(g => new
            {
                SessionId = g.Key,
                Routes = g.OrderBy(e => e.OccurredAt).Select(e => e.Route!).ToList()
            })
            .Take(500)
            .ToListAsync();

        var pathCounts = sessions
            .Select(s => string.Join(" -> ", s.Routes.Take(5)))
            .GroupBy(p => p)
            .OrderByDescending(g => g.Count())
            .Take(10)
            .Select(g => new CommonPathDto
            {
                Path = g.Key.Split(" -> ").ToList(),
                SessionCount = g.Count()
            })
            .ToList();

        var funnels = new List<FunnelDto>();

        var healthScoreFunnel = await BuildFunnelAsync(
            "HealthScore", from, to,
            new[] { "/healthscore", "/instance-trends/*", "drilldown_opened", "report_exported" },
            new[] { "Ver HealthScore", "Ver Detalle Instancia", "Abrir Drilldown", "Exportar Reporte" });
        funnels.Add(healthScoreFunnel);

        var patchingFunnel = await BuildFunnelAsync(
            "Patching", from, to,
            new[] { "/patching", "/patching/planner", "/patching/execute", "job_run_requested" },
            new[] { "Ver Estado Parcheo", "Planificar", "Ejecutar", "Confirmar Ejecución" });
        funnels.Add(patchingFunnel);

        return new AnalyticsJourneysDto
        {
            Funnels = funnels,
            CommonPaths = pathCounts
        };
    }

    private async Task<FunnelDto> BuildFunnelAsync(
        string name, DateTime from, DateTime to,
        string[] stepPatterns, string[] stepNames)
    {
        var steps = new List<FunnelStepDto>();
        var firstStepUsers = 0;

        for (int i = 0; i < stepPatterns.Length; i++)
        {
            var pattern = stepPatterns[i];
            int userCount;

            if (pattern.StartsWith("/"))
            {
                var routePattern = pattern.TrimEnd('*');
                userCount = await _db.AnalyticsEvents
                    .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                        && e.EventName == "page_view"
                        && e.Route != null && e.Route.StartsWith(routePattern))
                    .Select(e => e.UserId).Distinct().CountAsync();
            }
            else
            {
                userCount = await _db.AnalyticsEvents
                    .Where(e => e.OccurredAt >= from && e.OccurredAt <= to
                        && e.EventName == pattern)
                    .Select(e => e.UserId).Distinct().CountAsync();
            }

            if (i == 0) firstStepUsers = userCount;

            steps.Add(new FunnelStepDto
            {
                StepName = stepNames[i],
                Users = userCount,
                ConversionRate = firstStepUsers > 0 ? Math.Round((double)userCount / firstStepUsers * 100, 1) : 0
            });
        }

        return new FunnelDto { Name = name, Steps = steps };
    }

    public async Task<AnalyticsHeatmapDto> GetHeatmapAsync(DateTime from, DateTime to)
    {
        var rawData = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= from && e.OccurredAt <= to)
            .Select(e => new { e.OccurredAt, e.UserId })
            .ToListAsync();

        var events = rawData
            .GroupBy(e => new { DayOfWeek = (int)e.OccurredAt.DayOfWeek, Hour = e.OccurredAt.Hour })
            .Select(g => new HeatmapCellDto
            {
                DayOfWeek = g.Key.DayOfWeek,
                Hour = g.Key.Hour,
                EventCount = g.Count(),
                UniqueUsers = g.Select(e => e.UserId).Distinct().Count()
            })
            .ToList();

        return new AnalyticsHeatmapDto { Cells = events };
    }

    public async Task<AnalyticsUserDetailDto?> GetUserDetailAsync(string userId, DateTime from, DateTime to)
    {
        var hasEvents = await _db.AnalyticsEvents
            .AnyAsync(e => e.UserId == userId && e.OccurredAt >= from && e.OccurredAt <= to);

        if (!hasEvents) return null;

        var totalSessions = await _db.AnalyticsSessions
            .Where(s => s.UserId == userId && s.StartedAt >= from && s.StartedAt <= to)
            .CountAsync();

        var totalEvents = await _db.AnalyticsEvents
            .Where(e => e.UserId == userId && e.OccurredAt >= from && e.OccurredAt <= to)
            .CountAsync();

        var lastSeen = await _db.AnalyticsEvents
            .Where(e => e.UserId == userId)
            .MaxAsync(e => (DateTime?)e.OccurredAt);

        var topRoutes = await _db.AnalyticsEvents
            .Where(e => e.UserId == userId && e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName == "page_view" && e.Route != null)
            .GroupBy(e => e.Route!)
            .OrderByDescending(g => g.Count())
            .Take(10)
            .Select(g => g.Key)
            .ToListAsync();

        var topEvents = await _db.AnalyticsEvents
            .Where(e => e.UserId == userId && e.OccurredAt >= from && e.OccurredAt <= to
                && e.EventName != "page_view" && e.EventName != "screen_time"
                && e.EventName != "session_start" && e.EventName != "session_end")
            .GroupBy(e => e.EventName)
            .Select(g => new TopEventDto
            {
                EventName = g.Key,
                Count = g.Count(),
                UniqueUsers = 1
            })
            .OrderByDescending(e => e.Count)
            .Take(10)
            .ToListAsync();

        return new AnalyticsUserDetailDto
        {
            UserId = userId,
            TotalSessions = totalSessions,
            TotalEvents = totalEvents,
            LastSeenAt = lastSeen,
            TopRoutes = topRoutes,
            TopEvents = topEvents
        };
    }

    public async Task AggregateAsync(DateOnly date)
    {
        var dateStart = date.ToDateTime(TimeOnly.MinValue);
        var dateEnd = date.ToDateTime(TimeOnly.MaxValue);

        _db.AnalyticsDaily.RemoveRange(
            _db.AnalyticsDaily.Where(d => d.Date == date));
        await _db.SaveChangesAsync();

        var aggregations = await _db.AnalyticsEvents
            .Where(e => e.OccurredAt >= dateStart && e.OccurredAt <= dateEnd)
            .GroupBy(e => new { e.EventName, e.Route })
            .Select(g => new AnalyticsDaily
            {
                Date = date,
                EventName = g.Key.EventName,
                Route = g.Key.Route,
                EventCount = g.Count(),
                UniqueUsers = g.Select(e => e.UserId).Distinct().Count(),
                AvgDurationMs = g.Where(e => e.DurationMs != null).Any()
                    ? (int?)g.Where(e => e.DurationMs != null).Average(e => e.DurationMs!.Value)
                    : null
            })
            .ToListAsync();

        if (aggregations.Count > 0)
        {
            await _db.AnalyticsDaily.AddRangeAsync(aggregations);
            await _db.SaveChangesAsync();
        }

        _logger.LogInformation("Analytics aggregation for {Date}: {Count} rows", date, aggregations.Count);
    }
}
