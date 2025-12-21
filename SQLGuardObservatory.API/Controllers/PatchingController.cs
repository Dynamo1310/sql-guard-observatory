using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para consultar el estado de parcheo de servidores SQL Server
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class PatchingController : ControllerBase
{
    private readonly IPatchingService _patchingService;
    private readonly ILogger<PatchingController> _logger;

    public PatchingController(
        IPatchingService patchingService,
        ILogger<PatchingController> logger)
    {
        _patchingService = patchingService;
        _logger = logger;
    }

    #region Status Endpoints

    /// <summary>
    /// Obtiene el estado de parcheo de todos los servidores (desde cache)
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<List<ServerPatchStatusDto>>> GetPatchStatus(
        [FromQuery] bool forceRefresh = false, 
        [FromQuery] int? year = null)
    {
        try
        {
            var targetYear = year ?? DateTime.Now.Year;
            _logger.LogInformation("Solicitando estado de parcheo (forceRefresh: {ForceRefresh}, year: {Year})", forceRefresh, targetYear);
            
            var results = await _patchingService.GetPatchStatusAsync(forceRefresh, targetYear);
            
            _logger.LogInformation("Estado de parcheo obtenido: {Total} servidores", results.Count);
            
            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado de parcheo");
            return StatusCode(500, new { message = "Error obteniendo estado de parcheo: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el estado de parcheo de un servidor específico
    /// </summary>
    [HttpGet("status/{instanceName}")]
    public async Task<ActionResult<ServerPatchStatusDto>> GetServerPatchStatus(string instanceName)
    {
        try
        {
            var result = await _patchingService.GetServerPatchStatusAsync(instanceName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado de parcheo para {Instance}", instanceName);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Fuerza la actualización del cache de estado de parcheo
    /// </summary>
    [HttpPost("refresh")]
    public async Task<ActionResult> RefreshPatchStatus()
    {
        try
        {
            _logger.LogInformation("Iniciando refresh manual del cache de parcheo");
            
            await _patchingService.RefreshPatchStatusCacheAsync();
            
            return Ok(new { message = "Cache actualizado correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refrescando cache de parcheo");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene un resumen del estado de parcheo
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<PatchingSummaryDto>> GetPatchingSummary()
    {
        try
        {
            var results = await _patchingService.GetPatchStatusAsync();
            
            var summary = new PatchingSummaryDto
            {
                TotalServers = results.Count,
                UpdatedCount = results.Count(r => r.PatchStatus == "Updated"),
                CompliantCount = results.Count(r => r.PatchStatus == "Compliant"),
                NonCompliantCount = results.Count(r => r.PatchStatus == "NonCompliant"),
                OutdatedCount = results.Count(r => r.PatchStatus == "Outdated"),
                CriticalCount = results.Count(r => r.PatchStatus == "Critical" || r.PendingCUsForCompliance >= 3),
                ErrorCount = results.Count(r => r.PatchStatus == "Error"),
                UnknownCount = results.Count(r => r.PatchStatus == "Unknown"),
                TotalPendingCUs = results.Sum(r => r.PendingCUsForCompliance),
                ComplianceRate = results.Count > 0 
                    ? (int)Math.Round((double)(results.Count(r => r.PatchStatus == "Updated" || r.PatchStatus == "Compliant")) / results.Count * 100)
                    : 0,
                LastChecked = DateTime.Now
            };
            
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo resumen de parcheo");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    #endregion

    #region Compliance Configuration Endpoints

    /// <summary>
    /// Obtiene los años de compliance disponibles
    /// </summary>
    [HttpGet("compliance/years")]
    public async Task<ActionResult<List<int>>> GetComplianceYears()
    {
        try
        {
            var years = await _patchingService.GetComplianceYearsAsync();
            return Ok(years);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo años de compliance");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene todas las configuraciones de compliance
    /// </summary>
    [HttpGet("compliance")]
    public async Task<ActionResult<List<PatchComplianceConfigDto>>> GetComplianceConfigs([FromQuery] int? year = null)
    {
        try
        {
            var configs = await _patchingService.GetComplianceConfigsAsync(year);
            return Ok(configs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo configuraciones de compliance");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene la configuración de compliance para una versión específica
    /// </summary>
    [HttpGet("compliance/{sqlVersion}")]
    public async Task<ActionResult<PatchComplianceConfigDto>> GetComplianceConfig(string sqlVersion)
    {
        try
        {
            var config = await _patchingService.GetComplianceConfigAsync(sqlVersion);
            return Ok(config);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo configuración de compliance para {Version}", sqlVersion);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Guarda o actualiza una configuración de compliance
    /// </summary>
    [HttpPost("compliance")]
    public async Task<ActionResult<PatchComplianceConfigDto>> SaveComplianceConfig([FromBody] PatchComplianceConfigDto config)
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "system";
            
            _logger.LogInformation("Guardando configuración de compliance para SQL {Version} por {User}",
                config.SqlVersion, userId);
            
            var result = await _patchingService.SaveComplianceConfigAsync(config, userId);
            
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error guardando configuración de compliance");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Elimina una configuración de compliance
    /// </summary>
    [HttpDelete("compliance/{id}")]
    public async Task<ActionResult> DeleteComplianceConfig(int id)
    {
        try
        {
            var result = await _patchingService.DeleteComplianceConfigAsync(id);
            
            if (!result)
            {
                return NotFound(new { message = "Configuración no encontrada" });
            }
            
            return Ok(new { message = "Configuración eliminada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error eliminando configuración de compliance {Id}", id);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    #endregion

    #region Build Reference Endpoints

    /// <summary>
    /// Obtiene los builds disponibles para una versión de SQL Server
    /// </summary>
    [HttpGet("builds/{sqlVersion}")]
    public async Task<ActionResult<List<BuildReferenceDto>>> GetAvailableBuilds(string sqlVersion)
    {
        try
        {
            var builds = await _patchingService.GetAvailableBuildsForVersionAsync(sqlVersion);
            return Ok(builds);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo builds para {Version}", sqlVersion);
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene las versiones de SQL Server soportadas
    /// </summary>
    [HttpGet("versions")]
    public ActionResult<List<string>> GetSupportedVersions()
    {
        var versions = new List<string> { "2012", "2014", "2016", "2017", "2019", "2022" };
        return Ok(versions);
    }

    #endregion
}
