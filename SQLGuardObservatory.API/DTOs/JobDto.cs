namespace SQLGuardObservatory.API.DTOs;

public class JobDto
{
    public string Server { get; set; } = string.Empty;
    public string Job { get; set; } = string.Empty;
    public string LastStart { get; set; } = string.Empty;
    public string LastEnd { get; set; } = string.Empty;
    public int DurationSec { get; set; }
    public string State { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
}

public class JobSummaryDto
{
    public double OkPct { get; set; }
    public int Fails24h { get; set; }
    public double AvgDurationSec { get; set; }
    public double P95Sec { get; set; }
    public string LastCapture { get; set; } = string.Empty;
}

