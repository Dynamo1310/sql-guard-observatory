using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IDisksService
{
    Task<List<DiskDto>> GetDisksAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null);
    Task<DiskSummaryDto> GetDisksSummaryAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null);
    Task<DiskFiltersDto> GetAvailableFiltersAsync();
}

