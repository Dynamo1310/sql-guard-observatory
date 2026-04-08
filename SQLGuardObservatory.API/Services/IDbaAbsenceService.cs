using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IDbaAbsenceService
{
    Task<List<DbaAbsenceDto>> GetAllAsync(DateTime? dateFrom, DateTime? dateTo, string? userId);
    Task<DbaAbsenceDto> CreateAsync(CreateDbaAbsenceRequest request, string createdByUserId);
    Task<bool> DeleteAsync(int id);
    Task<List<DbaAbsenceDbaDto>> GetAvailableDbas();
    Task<DbaAbsenceStatsDto> GetStatsAsync(DateTime? dateFrom, DateTime? dateTo);
}
