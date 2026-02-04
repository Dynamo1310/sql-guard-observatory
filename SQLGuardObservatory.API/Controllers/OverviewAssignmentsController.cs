using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar asignaciones de problemas del Overview
/// </summary>
[ApiController]
[Route("api/overview-assignments")]
[Authorize]
[ViewPermission("Overview")]
public class OverviewAssignmentsController : ControllerBase
{
    private readonly IOverviewAssignmentService _assignmentService;
    private readonly ILogger<OverviewAssignmentsController> _logger;

    public OverviewAssignmentsController(
        IOverviewAssignmentService assignmentService,
        ILogger<OverviewAssignmentsController> logger)
    {
        _assignmentService = assignmentService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";

    /// <summary>
    /// Obtiene todas las asignaciones activas
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<OverviewAssignmentDto>>> GetActiveAssignments()
    {
        try
        {
            var assignments = await _assignmentService.GetActiveAssignmentsAsync();
            return Ok(assignments);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo asignaciones activas");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene asignaciones por tipo de problema
    /// </summary>
    [HttpGet("type/{issueType}")]
    public async Task<ActionResult<List<OverviewAssignmentDto>>> GetByType(string issueType)
    {
        try
        {
            var assignments = await _assignmentService.GetAssignmentsByTypeAsync(issueType);
            return Ok(assignments);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo asignaciones por tipo {IssueType}", issueType);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene usuarios disponibles del grupo IDD (General)
    /// </summary>
    [HttpGet("available-users")]
    public async Task<ActionResult<List<AssignableUserDto>>> GetAvailableUsers()
    {
        try
        {
            var users = await _assignmentService.GetAvailableUsersAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo usuarios disponibles");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Crea o actualiza una asignación
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OverviewAssignmentDto>> CreateAssignment([FromBody] CreateOverviewAssignmentRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.IssueType))
            {
                return BadRequest(new { message = "El tipo de problema es requerido" });
            }

            if (string.IsNullOrWhiteSpace(request.InstanceName))
            {
                return BadRequest(new { message = "El nombre de instancia es requerido" });
            }

            if (string.IsNullOrWhiteSpace(request.AssignedToUserId))
            {
                return BadRequest(new { message = "El usuario asignado es requerido" });
            }

            var assignment = await _assignmentService.CreateAssignmentAsync(request, GetUserId());
            return Ok(assignment);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creando asignación");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Elimina una asignación (sin marcarla como resuelta)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> RemoveAssignment(int id)
    {
        try
        {
            var result = await _assignmentService.RemoveAssignmentAsync(id);
            
            if (!result)
            {
                return NotFound(new { message = "Asignación no encontrada" });
            }

            return Ok(new { message = "Asignación eliminada", success = true });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error eliminando asignación {Id}", id);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Marca una asignación como resuelta
    /// </summary>
    [HttpPut("{id}/resolve")]
    public async Task<ActionResult<OverviewAssignmentDto>> ResolveAssignment(int id, [FromBody] ResolveAssignmentRequest? request = null)
    {
        try
        {
            var assignment = await _assignmentService.ResolveAssignmentAsync(id, request?.Notes);
            
            if (assignment == null)
            {
                return NotFound(new { message = "Asignación no encontrada" });
            }

            return Ok(assignment);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resolviendo asignación {Id}", id);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene la asignación de un problema específico
    /// </summary>
    [HttpGet("find")]
    public async Task<ActionResult<OverviewAssignmentDto?>> FindAssignment(
        [FromQuery] string issueType,
        [FromQuery] string instanceName,
        [FromQuery] string? driveOrTipo = null)
    {
        try
        {
            var assignment = await _assignmentService.GetAssignmentAsync(issueType, instanceName, driveOrTipo);
            return Ok(assignment); // Puede ser null si no hay asignación
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error buscando asignación");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }
}

/// <summary>
/// Request para resolver una asignación
/// </summary>
public class ResolveAssignmentRequest
{
    public string? Notes { get; set; }
}
