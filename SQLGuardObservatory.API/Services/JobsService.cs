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

    public async Task<List<JobDto>> GetJobsAsync(string? ambiente = null, string? hosting = null, string? instance = null)
    {
        var query = _context.InventarioJobsSnapshot.AsQueryable();

        if (!string.IsNullOrEmpty(ambiente))
            query = query.Where(j => j.Ambiente == ambiente);

        if (!string.IsNullOrEmpty(hosting))
            query = query.Where(j => j.Hosting == hosting);

        if (!string.IsNullOrEmpty(instance))
            query = query.Where(j => j.InstanceName == instance);

        var jobs = await query
            .OrderByDescending(j => j.CaptureDate)
            .Take(1000) // Limitar resultados
            .Select(j => new JobDto
            {
                Id = j.Id,
                InstanceName = j.InstanceName ?? string.Empty,
                Ambiente = j.Ambiente ?? string.Empty,
                Hosting = j.Hosting ?? string.Empty,
                JobName = j.JobName ?? string.Empty,
                JobEnabled = j.JobEnabled ?? string.Empty,
                JobStart = j.JobStart,
                JobEnd = j.JobEnd,
                JobDurationSeconds = j.JobDurationSeconds ?? 0,
                ExecutionStatus = j.ExecutionStatus ?? string.Empty,
                CaptureDate = j.CaptureDate ?? DateTime.MinValue,
                InsertedAtUtc = j.InsertedAtUtc ?? DateTime.MinValue
            })
            .ToListAsync();

        return jobs;
    }

    public async Task<JobSummaryDto> GetJobsSummaryAsync(string? ambiente = null, string? hosting = null, string? instance = null)
    {
        var query = _context.InventarioJobsSnapshot.AsQueryable();

        if (!string.IsNullOrEmpty(ambiente))
            query = query.Where(j => j.Ambiente == ambiente);

        if (!string.IsNullOrEmpty(hosting))
            query = query.Where(j => j.Hosting == hosting);

        if (!string.IsNullOrEmpty(instance))
            query = query.Where(j => j.InstanceName == instance);

        var totalJobs = await query.CountAsync();
        
        var jobsSucceeded = await query.CountAsync(j => j.ExecutionStatus == "Succeeded");
        var jobsFailed = await query.CountAsync(j => j.ExecutionStatus == "Failed");
        var jobsStopped = await query.CountAsync(j => j.ExecutionStatus == "Stopped" || j.ExecutionStatus == "Canceled");

        var avgDurationSeconds = await query
            .Where(j => j.JobDurationSeconds.HasValue && j.JobDurationSeconds > 0)
            .AverageAsync(j => (double?)j.JobDurationSeconds) ?? 0;

        return new JobSummaryDto
        {
            TotalJobs = totalJobs,
            JobsSucceeded = jobsSucceeded,
            JobsFailed = jobsFailed,
            JobsStopped = jobsStopped,
            AvgDurationMinutes = Math.Round(avgDurationSeconds / 60, 2)
        };
    }

    public async Task<JobFiltersDto> GetAvailableFiltersAsync()
    {
        var ambientes = await _context.InventarioJobsSnapshot
            .Where(j => !string.IsNullOrEmpty(j.Ambiente))
            .Select(j => j.Ambiente!)
            .Distinct()
            .OrderBy(a => a)
            .ToListAsync();

        var hostings = await _context.InventarioJobsSnapshot
            .Where(j => !string.IsNullOrEmpty(j.Hosting))
            .Select(j => j.Hosting!)
            .Distinct()
            .OrderBy(h => h)
            .ToListAsync();

        var instances = await _context.InventarioJobsSnapshot
            .Where(j => !string.IsNullOrEmpty(j.InstanceName))
            .Select(j => j.InstanceName!)
            .Distinct()
            .OrderBy(i => i)
            .ToListAsync();

        return new JobFiltersDto
        {
            Ambientes = ambientes,
            Hostings = hostings,
            Instances = instances
        };
    }
}
