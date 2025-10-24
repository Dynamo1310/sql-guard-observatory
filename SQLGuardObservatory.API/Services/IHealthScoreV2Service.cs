using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services
{
    public interface IHealthScoreV2Service
    {
        /// <summary>
        /// Obtiene el Health Score final de todas las instancias
        /// </summary>
        Task<IEnumerable<HealthScoreV2Dto>> GetAllHealthScoresAsync();

        /// <summary>
        /// Obtiene el detalle completo de una instancia (con categorías y tendencias)
        /// </summary>
        Task<HealthScoreDetailV2Dto?> GetHealthScoreDetailAsync(string instance);

        /// <summary>
        /// Obtiene solo las categorías de una instancia
        /// </summary>
        Task<IEnumerable<CategoryScoreDto>> GetCategoryScoresAsync(string instance);

        /// <summary>
        /// Obtiene tendencias 24h de una instancia
        /// </summary>
        Task<IEnumerable<HealthTrendPointDto>> GetTrends24hAsync(string instance);

        /// <summary>
        /// Obtiene tendencias 7d de una instancia
        /// </summary>
        Task<IEnumerable<HealthTrendPointDto>> GetTrends7dAsync(string instance);

        /// <summary>
        /// Obtiene resumen general para el dashboard
        /// </summary>
        Task<HealthScoreSummaryV2Dto> GetSummaryAsync();

        /// <summary>
        /// Obtiene alertas recientes
        /// </summary>
        Task<IEnumerable<AlertaRecienteDto>> GetRecentAlertsAsync(int topN = 10);

        /// <summary>
        /// Obtiene logs de collectors recientes
        /// </summary>
        Task<IEnumerable<CollectorLogDto>> GetCollectorLogsAsync(string? instance = null, string? level = null, int topN = 50);
    }
}

