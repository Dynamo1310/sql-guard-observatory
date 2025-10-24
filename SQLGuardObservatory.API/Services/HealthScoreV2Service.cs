using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services
{
    public class HealthScoreV2Service : IHealthScoreV2Service
    {
        private readonly SQLNovaDbContext _context;
        private readonly ILogger<HealthScoreV2Service> _logger;

        public HealthScoreV2Service(SQLNovaDbContext context, ILogger<HealthScoreV2Service> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<IEnumerable<HealthScoreV2Dto>> GetAllHealthScoresAsync()
        {
            try
            {
                var healthScores = await _context.HealthFinalV2
                    .Select(h => new HealthScoreV2Dto
                    {
                        Instance = h.Instance,
                        HealthRaw = h.HealthRaw,
                        CapApplied = h.CapApplied,
                        HealthFinal = h.HealthFinal,
                        Top3Penalizaciones = h.Top3Penalizaciones,
                        ColorSemaforo = h.ColorSemaforo,
                        CalculadoAt = h.CalculadoAt
                    })
                    .OrderByDescending(h => h.HealthFinal)
                    .ToListAsync();

                return healthScores;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health scores V2");
                throw;
            }
        }

        public async Task<HealthScoreDetailV2Dto?> GetHealthScoreDetailAsync(string instance)
        {
            try
            {
                var healthFinal = await _context.HealthFinalV2
                    .FirstOrDefaultAsync(h => h.Instance == instance);

                if (healthFinal == null)
                    return null;

                var categories = await GetCategoryScoresAsync(instance);
                var trends24h = await GetTrends24hAsync(instance);
                var trends7d = await GetTrends7dAsync(instance);

                return new HealthScoreDetailV2Dto
                {
                    Instance = healthFinal.Instance,
                    HealthFinal = healthFinal.HealthFinal,
                    HealthRaw = healthFinal.HealthRaw,
                    CapApplied = healthFinal.CapApplied,
                    ColorSemaforo = healthFinal.ColorSemaforo,
                    CalculadoAt = healthFinal.CalculadoAt,
                    Categories = categories.ToList(),
                    Trends24h = trends24h.ToList(),
                    Trends7d = trends7d.ToList()
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener detalle de health score para {Instance}", instance);
                throw;
            }
        }

        public async Task<IEnumerable<CategoryScoreDto>> GetCategoryScoresAsync(string instance)
        {
            try
            {
                var categoryScores = await _context.CategoryScoresV2
                    .FirstOrDefaultAsync(c => c.Instance == instance);

                if (categoryScores == null)
                    return Enumerable.Empty<CategoryScoreDto>();

                var categories = new List<CategoryScoreDto>
                {
                    new() { Name = "Backups", DisplayName = "Backups (RPO/RTO)", Score = categoryScores.Score_Backups, Notes = categoryScores.Notes_Backups, Weight = 0.18, Icon = "💾" },
                    new() { Name = "AG", DisplayName = "AlwaysOn", Score = categoryScores.Score_AG, Notes = categoryScores.Notes_AG, Weight = 0.14, Icon = "🔄" },
                    new() { Name = "Conectividad", DisplayName = "Conectividad", Score = categoryScores.Score_Conectividad, Notes = categoryScores.Notes_Conectividad, Weight = 0.10, Icon = "🌐" },
                    new() { Name = "ErroresSev", DisplayName = "Errores Sev>=20", Score = categoryScores.Score_ErroresSev, Notes = categoryScores.Notes_ErroresSev, Weight = 0.07, Icon = "⚠️" },
                    new() { Name = "CPU", DisplayName = "CPU", Score = categoryScores.Score_CPU, Notes = categoryScores.Notes_CPU, Weight = 0.10, Icon = "⚙️" },
                    new() { Name = "IO", DisplayName = "IO (Latencia)", Score = categoryScores.Score_IO, Notes = categoryScores.Notes_IO, Weight = 0.10, Icon = "💿" },
                    new() { Name = "Discos", DisplayName = "Espacio en Discos", Score = categoryScores.Score_Discos, Notes = categoryScores.Notes_Discos, Weight = 0.08, Icon = "📀" },
                    new() { Name = "Memoria", DisplayName = "Memoria (PLE)", Score = categoryScores.Score_Memoria, Notes = categoryScores.Notes_Memoria, Weight = 0.07, Icon = "🧠" },
                    new() { Name = "Mantenimiento", DisplayName = "Mantenimiento", Score = categoryScores.Score_Mantenimiento, Notes = categoryScores.Notes_Mantenimiento, Weight = 0.06, Icon = "🔧" },
                    new() { Name = "ConfigRecursos", DisplayName = "Config & Tempdb", Score = categoryScores.Score_ConfigRecursos, Notes = categoryScores.Notes_ConfigRecursos, Weight = 0.10, Icon = "⚙️" }
                };

                return categories;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener categorías para {Instance}", instance);
                throw;
            }
        }

        public async Task<IEnumerable<HealthTrendPointDto>> GetTrends24hAsync(string instance)
        {
            try
            {
                var trends = await _context.HealthTendencias24hV2
                    .Where(t => t.Instance == instance)
                    .OrderBy(t => t.HourBucket)
                    .Select(t => new HealthTrendPointDto
                    {
                        Timestamp = t.HourBucket,
                        HealthScore = t.HealthScore
                    })
                    .ToListAsync();

                return trends;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener tendencias 24h para {Instance}", instance);
                throw;
            }
        }

        public async Task<IEnumerable<HealthTrendPointDto>> GetTrends7dAsync(string instance)
        {
            try
            {
                var trends = await _context.HealthTendencias7dV2
                    .Where(t => t.Instance == instance)
                    .OrderBy(t => t.DayBucket)
                    .Select(t => new HealthTrendPointDto
                    {
                        Timestamp = t.DayBucket,
                        HealthScore = t.HealthScore
                    })
                    .ToListAsync();

                return trends;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener tendencias 7d para {Instance}", instance);
                throw;
            }
        }

        public async Task<HealthScoreSummaryV2Dto> GetSummaryAsync()
        {
            try
            {
                var allScores = await GetAllHealthScoresAsync();
                var allScoresList = allScores.ToList();

                var recentAlerts = await GetRecentAlertsAsync(5);

                return new HealthScoreSummaryV2Dto
                {
                    TotalInstances = allScoresList.Count,
                    HealthyInstances = allScoresList.Count(h => h.ColorSemaforo == "Verde"),
                    WarningInstances = allScoresList.Count(h => h.ColorSemaforo == "Amarillo"),
                    CriticalInstances = allScoresList.Count(h => h.ColorSemaforo == "Naranja"),
                    EmergencyInstances = allScoresList.Count(h => h.ColorSemaforo == "Rojo"),
                    AverageHealth = allScoresList.Any() ? allScoresList.Average(h => h.HealthFinal) : 0,
                    Instances = allScoresList,
                    RecentAlerts = recentAlerts.ToList()
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de health scores V2");
                throw;
            }
        }

        public async Task<IEnumerable<AlertaRecienteDto>> GetRecentAlertsAsync(int topN = 10)
        {
            try
            {
                var alerts = await _context.HealthScoreAlertas
                    .OrderByDescending(a => a.DetectadoAt)
                    .Take(topN)
                    .Select(a => new AlertaRecienteDto
                    {
                        AlertaID = a.AlertaID,
                        Instance = a.Instance,
                        EstadoAnterior = a.EstadoAnterior,
                        EstadoNuevo = a.EstadoNuevo,
                        HealthScoreAnterior = a.HealthScoreAnterior,
                        HealthScoreNuevo = a.HealthScoreNuevo,
                        Causa = a.Causa,
                        DetectadoAt = a.DetectadoAt,
                        TimeSinceDetection = ""  // Se calculará después
                    })
                    .ToListAsync();

                // Calcular tiempo transcurrido
                var now = DateTime.UtcNow;
                foreach (var alert in alerts)
                {
                    var diff = now - alert.DetectadoAt;
                    alert.TimeSinceDetection = diff.TotalHours < 1 
                        ? $"{(int)diff.TotalMinutes}m" 
                        : diff.TotalDays < 1 
                            ? $"{(int)diff.TotalHours}h" 
                            : $"{(int)diff.TotalDays}d";
                }

                return alerts;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener alertas recientes");
                throw;
            }
        }

        public async Task<IEnumerable<CollectorLogDto>> GetCollectorLogsAsync(string? instance = null, string? level = null, int topN = 50)
        {
            try
            {
                var query = _context.CollectorLogs.AsQueryable();

                if (!string.IsNullOrEmpty(instance))
                    query = query.Where(l => l.Instance == instance);

                if (!string.IsNullOrEmpty(level))
                    query = query.Where(l => l.Level == level);

                var logs = await query
                    .OrderByDescending(l => l.LoggedAt)
                    .Take(topN)
                    .Select(l => new CollectorLogDto
                    {
                        CollectorName = l.CollectorName,
                        Instance = l.Instance,
                        Level = l.Level,
                        Message = l.Message,
                        LoggedAt = l.LoggedAt
                    })
                    .ToListAsync();

                return logs;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener logs de collectors");
                throw;
            }
        }
    }
}

