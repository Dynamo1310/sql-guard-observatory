using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/production-alerts")]
[Authorize]
[ViewPermission("AlertaServidoresCaidos")]
public class ProductionAlertsController : ControllerBase
{
    private readonly IProductionAlertService _alertService;
    private readonly ILogger<ProductionAlertsController> _logger;

    public ProductionAlertsController(
        IProductionAlertService alertService,
        ILogger<ProductionAlertsController> logger)
    {
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
    private string GetUserDisplayName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.Identity?.Name ?? "unknown";

    [HttpGet("config")]
    public async Task<ActionResult<ProductionAlertConfigDto>> GetConfig()
    {
        try
        {
            var config = await _alertService.GetConfigAsync();
            
            if (config == null)
            {
                // Retornar configuración vacía por defecto en lugar de 404
                return Ok(new ProductionAlertConfigDto
                {
                    Id = 0,
                    Name = "Alerta de Servidores Caídos",
                    Description = "",
                    IsEnabled = false,
                    CheckIntervalMinutes = 1,
                    AlertIntervalMinutes = 15,
                    FailedChecksBeforeAlert = 1,
                    Recipients = new List<string>(),
                    Ambientes = new List<string> { "Produccion" },
                    LastRunAt = null,
                    LastAlertSentAt = null,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = null,
                    UpdatedByDisplayName = null
                });
            }

            return Ok(new ProductionAlertConfigDto
            {
                Id = config.Id,
                Name = config.Name,
                Description = config.Description,
                IsEnabled = config.IsEnabled,
                CheckIntervalMinutes = config.CheckIntervalMinutes,
                AlertIntervalMinutes = config.AlertIntervalMinutes,
                FailedChecksBeforeAlert = config.FailedChecksBeforeAlert,
                Recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                Ambientes = config.Ambientes?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string> { "Produccion" },
                LastRunAt = config.LastRunAt,
                LastAlertSentAt = config.LastAlertSentAt,
                CreatedAt = config.CreatedAt,
                UpdatedAt = config.UpdatedAt,
                UpdatedByDisplayName = config.UpdatedByDisplayName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting production alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message, details = ex.InnerException?.Message });
        }
    }

    [HttpPost("config")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<ProductionAlertConfigDto>> CreateConfig([FromBody] CreateProductionAlertRequest request)
    {
        try
        {
            var config = await _alertService.CreateConfigAsync(request, GetUserId(), GetUserDisplayName());

            return Ok(new ProductionAlertConfigDto
            {
                Id = config.Id,
                Name = config.Name,
                Description = config.Description,
                IsEnabled = config.IsEnabled,
                CheckIntervalMinutes = config.CheckIntervalMinutes,
                AlertIntervalMinutes = config.AlertIntervalMinutes,
                FailedChecksBeforeAlert = config.FailedChecksBeforeAlert,
                Recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                Ambientes = config.Ambientes?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string> { "Produccion" },
                LastRunAt = config.LastRunAt,
                LastAlertSentAt = config.LastAlertSentAt,
                CreatedAt = config.CreatedAt,
                UpdatedAt = config.UpdatedAt,
                UpdatedByDisplayName = config.UpdatedByDisplayName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating production alert config");
            return StatusCode(500, new { message = "Error al crear configuración: " + ex.Message, details = ex.InnerException?.Message });
        }
    }

    [HttpPut("config")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<ProductionAlertConfigDto>> UpdateConfig([FromBody] UpdateProductionAlertRequest request)
    {
        try
        {
            var config = await _alertService.UpdateConfigAsync(request, GetUserId(), GetUserDisplayName());

            return Ok(new ProductionAlertConfigDto
            {
                Id = config.Id,
                Name = config.Name,
                Description = config.Description,
                IsEnabled = config.IsEnabled,
                CheckIntervalMinutes = config.CheckIntervalMinutes,
                AlertIntervalMinutes = config.AlertIntervalMinutes,
                FailedChecksBeforeAlert = config.FailedChecksBeforeAlert,
                Recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                Ambientes = config.Ambientes?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string> { "Produccion" },
                LastRunAt = config.LastRunAt,
                LastAlertSentAt = config.LastAlertSentAt,
                CreatedAt = config.CreatedAt,
                UpdatedAt = config.UpdatedAt,
                UpdatedByDisplayName = config.UpdatedByDisplayName
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating production alert config");
            return StatusCode(500, new { message = "Error al actualizar configuración: " + ex.Message, details = ex.InnerException?.Message });
        }
    }

    [HttpGet("history")]
    public async Task<ActionResult<List<ProductionAlertHistoryDto>>> GetHistory([FromQuery] int limit = 20)
    {
        var history = await _alertService.GetHistoryAsync(limit);

        return Ok(history.Select(h => new ProductionAlertHistoryDto
        {
            Id = h.Id,
            ConfigId = h.ConfigId,
            SentAt = h.SentAt,
            RecipientCount = h.RecipientCount,
            InstancesDown = h.InstancesDown.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList(),
            Success = h.Success,
            ErrorMessage = h.ErrorMessage
        }).ToList());
    }

    [HttpGet("status")]
    public async Task<ActionResult<List<InstanceConnectionStatusDto>>> GetConnectionStatus()
    {
        var status = await _alertService.GetConnectionStatusAsync();

        return Ok(status.Select(s => new InstanceConnectionStatusDto
        {
            InstanceName = s.InstanceName,
            ServerName = s.ServerName,
            Ambiente = s.Ambiente,
            HostingSite = s.HostingSite,
            IsConnected = s.IsConnected,
            LastCheckedAt = s.LastCheckedAt,
            LastError = s.LastError,
            DownSince = s.DownSince,
            ConsecutiveFailures = s.ConsecutiveFailures
        }).ToList());
    }

    [HttpPost("check/{instanceName}")]
    public async Task<ActionResult> CheckInstance(string instanceName)
    {
        var isConnected = await _alertService.TestConnectionAsync(instanceName);
        return Ok(new { isConnected, instanceName });
    }

    [HttpPost("test")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> TestAlert()
    {
        var (success, message, instancesDown) = await _alertService.TestAlertAsync();
        return Ok(new { success, message, instancesDown });
    }

    [HttpPost("run")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> RunNow()
    {
        try
        {
            await _alertService.RunCheckAsync();
            return Ok(new { success = true, message = "Verificación ejecutada correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error running production alert check");
            return StatusCode(500, new { success = false, message = "Error: " + ex.Message, details = ex.InnerException?.Message });
        }
    }

    /// <summary>
    /// Proxy para obtener el inventario (evita problemas de CORS en el frontend)
    /// </summary>
    [HttpGet("inventory")]
    public async Task<ActionResult<List<InventoryInstanceDto>>> GetInventory()
    {
        try
        {
            using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
            var response = await httpClient.GetAsync("http://asprbm-nov-01/InventoryDBA/inventario/");
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync();
            var instances = System.Text.Json.JsonSerializer.Deserialize<List<InventoryInstanceDto>>(json, 
                new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            
            return Ok(instances ?? new List<InventoryInstanceDto>());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching inventory");
            return BadRequest(new { message = "Error al obtener inventario: " + ex.Message });
        }
    }
}

