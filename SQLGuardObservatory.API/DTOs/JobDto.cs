namespace SQLGuardObservatory.API.DTOs;

public class JobDto
{
    public long Id { get; set; }
    public string InstanceName { get; set; } = string.Empty;
    public string Ambiente { get; set; } = string.Empty;
    public string Hosting { get; set; } = string.Empty;
    public string JobName { get; set; } = string.Empty;
    public string JobEnabled { get; set; } = string.Empty;
    public DateTime? JobStart { get; set; }
    public DateTime? JobEnd { get; set; }
    public int JobDurationSeconds { get; set; }
    public string ExecutionStatus { get; set; } = string.Empty;
    public DateTime CaptureDate { get; set; }
    public DateTime InsertedAtUtc { get; set; }
}

public class JobSummaryDto
{
    public int TotalJobs { get; set; }
    public int JobsSucceeded { get; set; }
    public int JobsFailed { get; set; }
    public int JobsStopped { get; set; }
    public double AvgDurationMinutes { get; set; }
}

public class JobFiltersDto
{
    public List<string> Ambientes { get; set; } = new();
    public List<string> Hostings { get; set; } = new();
    public List<string> Instances { get; set; } = new();
}
