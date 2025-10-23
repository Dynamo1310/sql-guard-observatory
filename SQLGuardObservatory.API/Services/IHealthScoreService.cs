using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services
{
    public interface IHealthScoreService
    {
        Task<IEnumerable<HealthScoreDto>> GetLatestHealthScoresAsync();
        Task<HealthScoreSummaryDto> GetSummaryAsync();
        Task<OverviewDataDto> GetOverviewDataAsync();
    }
}

