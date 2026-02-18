using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Analytics;

[Table("AnalyticsEvents", Schema = "dbo")]
public class AnalyticsEvent
{
    [Key]
    public long Id { get; set; }

    public Guid EventId { get; set; }

    public DateTime OccurredAt { get; set; }

    [Required]
    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(64)]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    [MaxLength(64)]
    public string EventName { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? Route { get; set; }

    [MaxLength(256)]
    public string? ReferrerRoute { get; set; }

    [Required]
    [MaxLength(16)]
    public string Source { get; set; } = "web";

    public string? PropertiesJson { get; set; }

    public int? DurationMs { get; set; }

    public bool? Success { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

[Table("AnalyticsSessions", Schema = "dbo")]
public class AnalyticsSession
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(64)]
    public string SessionId { get; set; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string UserId { get; set; } = string.Empty;

    public DateTime StartedAt { get; set; }

    public DateTime? EndedAt { get; set; }

    public int EventCount { get; set; }

    public int PageViewCount { get; set; }
}

[Table("AnalyticsDaily", Schema = "dbo")]
public class AnalyticsDaily
{
    [Key]
    public int Id { get; set; }

    [Column("Date")]
    public DateOnly Date { get; set; }

    [Required]
    [MaxLength(64)]
    public string EventName { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? Route { get; set; }

    public int EventCount { get; set; }

    public int UniqueUsers { get; set; }

    public int? P95DurationMs { get; set; }

    public int? AvgDurationMs { get; set; }
}
