using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IJobsService
{
    Task<List<JobDto>> GetJobsAsync(string? ambiente = null, string? hosting = null, string? instance = null);
    Task<JobSummaryDto> GetJobsSummaryAsync(string? ambiente = null, string? hosting = null, string? instance = null);
    Task<JobFiltersDto> GetAvailableFiltersAsync();
}
