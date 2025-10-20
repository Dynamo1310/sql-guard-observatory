using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public class JobsService : IJobsService
{
    private readonly SQLNovaDbContext _context;

    public JobsService(SQLNovaDbContext context)
    {
        _context = context;
    }

    public async Task<List<JobDto>> GetJobsAsync(string? ambiente = null, string? hosting = null)
    {
        var query = _context.InventarioJobsSnapshot.AsQueryable();

        if (!string.IsNullOrEmpty(ambiente) && ambiente != "All")
        {
            query = query.Where(j => j.Ambiente == ambiente);
        }

        if (!string.IsNullOrEmpty(hosting) && hosting != "All")
        {
            query = query.Where(j => j.Hosting == hosting);
        }

        var jobs = await query
            .OrderByDescending(j => j.JobStart)
            .Take(1000)
            .ToListAsync();

        return jobs.Select(j => new JobDto
        {
            Server = j.InstanceName ?? string.Empty,
            Job = j.JobName ?? string.Empty,
            LastStart = j.JobStart?.ToString("o") ?? string.Empty,
            LastEnd = j.JobEnd?.ToString("o") ?? string.Empty,
            DurationSec = j.JobDurationSeconds ?? 0,
            State = MapJobStatus(j.JobStatus),
            Message = string.Empty
        }).ToList();
    }

    public async Task<JobSummaryDto> GetJobsSummaryAsync()
    {
        var last24Hours = DateTime.UtcNow.AddHours(-24);
        
        var recentJobs = await _context.InventarioJobsSnapshot
            .Where(j => j.JobStart >= last24Hours)
            .ToListAsync();

        var totalJobs = recentJobs.Count;
        var succeededJobs = recentJobs.Count(j => 
            j.JobStatus != null && 
            (j.JobStatus.Contains("Succeeded", StringComparison.OrdinalIgnoreCase) ||
             j.JobStatus.Contains("Success", StringComparison.OrdinalIgnoreCase)));
        
        var failedJobs = recentJobs.Count(j => 
            j.JobStatus != null && 
            j.JobStatus.Contains("Failed", StringComparison.OrdinalIgnoreCase));

        var okPct = totalJobs > 0 ? (double)succeededJobs / totalJobs * 100 : 0;
        
        var durations = recentJobs
            .Where(j => j.JobDurationSeconds.HasValue && j.JobDurationSeconds > 0)
            .Select(j => j.JobDurationSeconds!.Value)
            .OrderBy(d => d)
            .ToList();

        var avgDuration = durations.Any() ? durations.Average() : 0;
        var p95Duration = durations.Any() ? durations[(int)(durations.Count * 0.95)] : 0;

        var lastCapture = await _context.InventarioJobsSnapshot
            .MaxAsync(j => (DateTime?)j.CaptureDate) ?? DateTime.UtcNow;

        return new JobSummaryDto
        {
            OkPct = Math.Round(okPct, 2),
            Fails24h = failedJobs,
            AvgDurationSec = Math.Round(avgDuration, 2),
            P95Sec = p95Duration,
            LastCapture = lastCapture.ToString("o")
        };
    }

    public async Task<List<JobDto>> GetFailedJobsAsync(int limit = 5)
    {
        var failedJobs = await _context.InventarioJobsSnapshot
            .Where(j => j.JobStatus != null && j.JobStatus.Contains("Failed", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(j => j.JobStart)
            .Take(limit)
            .ToListAsync();

        return failedJobs.Select(j => new JobDto
        {
            Server = j.InstanceName ?? string.Empty,
            Job = j.JobName ?? string.Empty,
            LastStart = j.JobStart?.ToString("o") ?? string.Empty,
            LastEnd = j.JobEnd?.ToString("o") ?? string.Empty,
            DurationSec = j.JobDurationSeconds ?? 0,
            State = "Failed",
            Message = string.Empty
        }).ToList();
    }

    private string MapJobStatus(string? status)
    {
        if (string.IsNullOrEmpty(status))
            return "Unknown";

        if (status.Contains("Succeeded", StringComparison.OrdinalIgnoreCase) ||
            status.Contains("Success", StringComparison.OrdinalIgnoreCase))
            return "Succeeded";

        if (status.Contains("Failed", StringComparison.OrdinalIgnoreCase))
            return "Failed";

        if (status.Contains("Running", StringComparison.OrdinalIgnoreCase))
            return "Running";

        if (status.Contains("Canceled", StringComparison.OrdinalIgnoreCase))
            return "Canceled";

        return status;
    }
}

