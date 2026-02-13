using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// API para gestionar exclusiones globales de servidores en alertas.
/// Los servidores excluidos no generan alertas de ningún tipo
/// (servidores caídos, backups, discos, overview, etc.)
/// </summary>
[ApiController]
[Route("api/server-exclusions")]
[Authorize]
[ViewPermission("AdminServerExceptions")]
public class ServerExclusionsController : ControllerBase
{
    private readonly IServerExclusionService _exclusionService;
    private readonly ILogger<ServerExclusionsController> _logger;

    public ServerExclusionsController(
        IServerExclusionService exclusionService,
        ILogger<ServerExclusionsController> logger)
    {
        _exclusionService = exclusionService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todas las exclusiones de servidores
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<ServerAlertExclusionDto>>> GetAll(CancellationToken ct)
    {
        var exclusions = await _exclusionService.GetAllExclusionsAsync(ct);
        
        var result = exclusions.Select(e => new ServerAlertExclusionDto(
            e.Id,
            e.ServerName,
            e.Reason,
            e.IsActive,
            e.CreatedAtUtc,
            e.CreatedBy,
            e.ExpiresAtUtc
        )).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Agrega una nueva exclusión de servidor.
    /// Requiere capacidad System.ConfigureAlerts.
    /// </summary>
    [HttpPost]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<ServerAlertExclusionDto>> Add(
        [FromBody] CreateServerAlertExclusionDto dto, 
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(dto.ServerName))
        {
            return BadRequest("El nombre del servidor es obligatorio");
        }

        var exclusion = new ServerAlertExclusion
        {
            ServerName = dto.ServerName.Trim(),
            Reason = dto.Reason,
            IsActive = true,
            CreatedBy = User?.Identity?.Name,
            ExpiresAtUtc = dto.ExpiresAtUtc
        };

        try
        {
            var created = await _exclusionService.AddExclusionAsync(exclusion, ct);
            
            _logger.LogInformation(
                "Server exclusion added: {ServerName} by {User}. Reason: {Reason}", 
                dto.ServerName, User?.Identity?.Name, dto.Reason);

            return Created($"/api/server-exclusions/{created.Id}", new ServerAlertExclusionDto(
                created.Id,
                created.ServerName,
                created.Reason,
                created.IsActive,
                created.CreatedAtUtc,
                created.CreatedBy,
                created.ExpiresAtUtc
            ));
        }
        catch (Exception ex) when (ex.InnerException?.Message.Contains("UNIQUE") == true || 
                                   ex.InnerException?.Message.Contains("duplicate") == true)
        {
            return Conflict($"El servidor '{dto.ServerName}' ya está excluido");
        }
    }

    /// <summary>
    /// Elimina una exclusión de servidor.
    /// Requiere capacidad System.ConfigureAlerts.
    /// </summary>
    [HttpDelete("{id:int}")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> Remove(int id, CancellationToken ct)
    {
        var success = await _exclusionService.RemoveExclusionAsync(id, ct);
        
        if (!success)
            return NotFound($"Exclusión {id} no encontrada");

        _logger.LogInformation("Server exclusion removed: Id={Id} by {User}", id, User?.Identity?.Name);
        return NoContent();
    }

    /// <summary>
    /// Verifica si un servidor específico está excluido
    /// </summary>
    [HttpGet("check/{serverName}")]
    public async Task<ActionResult<ServerExclusionCheckDto>> Check(string serverName, CancellationToken ct)
    {
        var isExcluded = await _exclusionService.IsServerExcludedAsync(serverName, ct);
        return Ok(new ServerExclusionCheckDto(serverName, isExcluded));
    }
}

// DTOs
public record ServerAlertExclusionDto(
    int Id,
    string ServerName,
    string? Reason,
    bool IsActive,
    DateTime CreatedAtUtc,
    string? CreatedBy,
    DateTime? ExpiresAtUtc
);

public record CreateServerAlertExclusionDto(
    string ServerName,
    string? Reason,
    DateTime? ExpiresAtUtc
);

public record ServerExclusionCheckDto(
    string ServerName,
    bool IsExcluded
);
