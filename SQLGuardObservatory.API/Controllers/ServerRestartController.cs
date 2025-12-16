using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar el reinicio de servidores SQL
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ServerRestartController : ControllerBase
{
    private readonly IServerRestartService _restartService;
    private readonly ILogger<ServerRestartController> _logger;

    public ServerRestartController(
        IServerRestartService restartService,
        ILogger<ServerRestartController> logger)
    {
        _restartService = restartService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene la lista de servidores disponibles para reiniciar
    /// </summary>
    [HttpGet("servers")]
    public async Task<ActionResult<List<RestartableServerDto>>> GetServers()
    {
        try
        {
            var servers = await _restartService.GetAvailableServersAsync();
            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo lista de servidores");
            return StatusCode(500, new { message = "Error obteniendo lista de servidores", error = ex.Message });
        }
    }

    /// <summary>
    /// Inicia una tarea de reinicio de servidores
    /// </summary>
    [HttpPost("start")]
    public async Task<ActionResult<StartRestartResponse>> StartRestart([FromBody] StartRestartRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                           User.FindFirst("name")?.Value ?? 
                           User.Identity?.Name ?? 
                           "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            _logger.LogInformation(
                "Usuario {User} ({UserId}) solicitó reinicio de {Count} servidor(es)",
                userName, userId, request.Servers?.Count ?? 0
            );

            var response = await _restartService.StartRestartAsync(request, userId, userName);

            if (!response.Success)
            {
                return BadRequest(response);
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error iniciando tarea de reinicio");
            return StatusCode(500, new StartRestartResponse
            {
                Success = false,
                Message = $"Error iniciando tarea de reinicio: {ex.Message}"
            });
        }
    }

    /// <summary>
    /// Obtiene el historial de tareas de reinicio
    /// </summary>
    [HttpGet("tasks")]
    public async Task<ActionResult<List<ServerRestartTaskDto>>> GetTaskHistory([FromQuery] int limit = 50)
    {
        try
        {
            var tasks = await _restartService.GetTaskHistoryAsync(limit);
            return Ok(tasks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo historial de tareas");
            return StatusCode(500, new { message = "Error obteniendo historial", error = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el detalle de una tarea específica
    /// </summary>
    [HttpGet("tasks/{taskId}")]
    public async Task<ActionResult<ServerRestartTaskDto>> GetTask(Guid taskId)
    {
        try
        {
            var task = await _restartService.GetTaskByIdAsync(taskId);

            if (task == null)
            {
                return NotFound(new { message = $"Tarea no encontrada: {taskId}" });
            }

            return Ok(task);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo tarea {TaskId}", taskId);
            return StatusCode(500, new { message = "Error obteniendo tarea", error = ex.Message });
        }
    }

    /// <summary>
    /// Cancela una tarea de reinicio en ejecución
    /// </summary>
    [HttpPost("tasks/{taskId}/cancel")]
    public async Task<ActionResult> CancelTask(Guid taskId)
    {
        try
        {
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                           User.FindFirst("name")?.Value ?? 
                           User.Identity?.Name ?? 
                           "Unknown";

            _logger.LogWarning("Usuario {User} solicitó cancelar tarea {TaskId}", userName, taskId);

            var result = await _restartService.CancelTaskAsync(taskId);

            if (!result)
            {
                return BadRequest(new { message = "No se pudo cancelar la tarea. Puede que no exista o no esté en ejecución." });
            }

            return Ok(new { message = "Tarea cancelada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cancelando tarea {TaskId}", taskId);
            return StatusCode(500, new { message = "Error cancelando tarea", error = ex.Message });
        }
    }

    /// <summary>
    /// Verifica si hay una tarea en ejecución actualmente
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult> GetCurrentStatus()
    {
        try
        {
            var tasks = await _restartService.GetTaskHistoryAsync(1);
            var currentTask = tasks.FirstOrDefault(t => t.Status == "Running");

            return Ok(new
            {
                HasRunningTask = currentTask != null,
                RunningTask = currentTask
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado actual");
            return StatusCode(500, new { message = "Error obteniendo estado", error = ex.Message });
        }
    }
}

