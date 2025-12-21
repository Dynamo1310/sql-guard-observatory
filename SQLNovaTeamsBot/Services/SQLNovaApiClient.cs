using System.Text.Json;

namespace SQLNovaTeamsBot.Services;

/// <summary>
/// Cliente HTTP para comunicarse con la API de SQL Nova
/// </summary>
public class SQLNovaApiClient : ISQLNovaApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<SQLNovaApiClient> _logger;
    private readonly JsonSerializerOptions _jsonOptions;

    public SQLNovaApiClient(HttpClient httpClient, ILogger<SQLNovaApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _jsonOptions = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        };
    }

    public async Task<HealthSummaryResponse?> GetHealthSummaryAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("/api/healthscore/summary");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<HealthSummaryResponse>(json, _jsonOptions);
            }
            _logger.LogWarning("Error obteniendo summary: {StatusCode}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error conectando con SQL Nova API");
        }
        return null;
    }

    public async Task<List<HealthScoreItem>?> GetHealthScoresAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("/api/healthscore");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<List<HealthScoreItem>>(json, _jsonOptions);
            }
            _logger.LogWarning("Error obteniendo health scores: {StatusCode}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error conectando con SQL Nova API");
        }
        return null;
    }

    public async Task<OnCallResponse?> GetCurrentOnCallAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync("/api/oncall/current");
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                return JsonSerializer.Deserialize<OnCallResponse>(json, _jsonOptions);
            }
            _logger.LogWarning("Error obteniendo on-call: {StatusCode}", response.StatusCode);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error conectando con SQL Nova API");
        }
        return null;
    }

    public async Task<List<AlertItem>?> GetActiveAlertsAsync()
    {
        try
        {
            // Obtener instancias críticas y con warnings
            var scores = await GetHealthScoresAsync();
            if (scores == null) return null;

            return scores
                .Where(s => s.HealthScore < 70)
                .OrderBy(s => s.HealthScore)
                .Select(s => new AlertItem
                {
                    InstanceName = s.InstanceName,
                    Ambiente = s.Ambiente,
                    HealthScore = s.HealthScore,
                    HealthStatus = s.HealthStatus,
                    Issues = new List<string> { $"Health Score: {s.HealthScore}/100" }
                })
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo alertas");
        }
        return null;
    }
}






