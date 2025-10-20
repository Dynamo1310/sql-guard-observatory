using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IJobsService
{
    Task<List<JobDto>> GetJobsAsync(string? ambiente = null, string? hosting = null);
    Task<JobSummaryDto> GetJobsSummaryAsync();
    Task<List<JobDto>> GetFailedJobsAsync(int limit = 5);
}

