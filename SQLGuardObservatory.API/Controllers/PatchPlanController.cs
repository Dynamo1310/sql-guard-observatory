using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para la gestión de planificación de parcheos
/// </summary>
[ApiController]
[Route("api/patchplan")]
[Authorize]
[ViewPermission("PatchPlanner")]
public class PatchPlanController : ControllerBase
{
    private readonly IPatchPlanService _patchPlanService;
    private readonly IWindowSuggesterService _windowSuggesterService;
    private readonly ILogger<PatchPlanController> _logger;

    public PatchPlanController(
        IPatchPlanService patchPlanService,
        IWindowSuggesterService windowSuggesterService,
        ILogger<PatchPlanController> logger)
    {
        _patchPlanService = patchPlanService;
        _windowSuggesterService = windowSuggesterService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    private string GetUserName() => User.FindFirstValue("displayName") 
        ?? User.FindFirstValue(ClaimTypes.Name) 
        ?? "Unknown";

    /// <summary>
    /// Obtiene todos los planes de parcheo
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<PatchPlanDto>>> GetAll(
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] string? assignedDbaId,
        [FromQuery] string? status,
        [FromQuery] string? serverName,
        [FromQuery] string? cellTeam,
        [FromQuery] string? ambiente,
        [FromQuery] string? priority,
        [FromQuery] string? patchMode)
    {
        try
        {
            // Si hay filtros, usar el método filtrado
            if (fromDate.HasValue || toDate.HasValue || !string.IsNullOrEmpty(assignedDbaId) || 
                !string.IsNullOrEmpty(status) || !string.IsNullOrEmpty(serverName) ||
                !string.IsNullOrEmpty(cellTeam) || !string.IsNullOrEmpty(ambiente) ||
                !string.IsNullOrEmpty(priority) || !string.IsNullOrEmpty(patchMode))
            {
                var filter = new PatchPlanFilterRequest
                {
                    FromDate = fromDate,
                    ToDate = toDate,
                    AssignedDbaId = assignedDbaId,
                    Status = status,
                    ServerName = serverName,
                    CellTeam = cellTeam,
                    Ambiente = ambiente,
                    Priority = priority,
                    PatchMode = patchMode
                };
                var filteredPlans = await _patchPlanService.GetFilteredAsync(filter);
                return Ok(filteredPlans);
            }

            var plans = await _patchPlanService.GetAllAsync();
            return Ok(plans);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener planes de parcheo");
            return StatusCode(500, new { message = "Error al obtener planes de parcheo" });
        }
    }

    /// <summary>
    /// Obtiene un plan de parcheo por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<PatchPlanDto>> GetById(int id)
    {
        try
        {
            var plan = await _patchPlanService.GetByIdAsync(id);
            if (plan == null)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al obtener plan de parcheo" });
        }
    }

    /// <summary>
    /// Obtiene la lista de DBAs disponibles para asignar (del grupo IDD General)
    /// </summary>
    [HttpGet("dbas")]
    public async Task<ActionResult<List<AvailableDbaDto>>> GetAvailableDbas()
    {
        try
        {
            var dbas = await _patchPlanService.GetAvailableDbas();
            return Ok(dbas);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener DBAs disponibles");
            return StatusCode(500, new { message = "Error al obtener DBAs disponibles" });
        }
    }

    /// <summary>
    /// Crea un nuevo plan de parcheo
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<PatchPlanDto>> Create([FromBody] CreatePatchPlanRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();

            var plan = await _patchPlanService.CreateAsync(request, userId, userName);

            _logger.LogInformation(
                "Plan de parcheo creado: Id={Id}, Server={Server}, User={User}",
                plan.Id, plan.ServerName, userName);

            return CreatedAtAction(nameof(GetById), new { id = plan.Id }, plan);
        }
        catch (FormatException ex)
        {
            _logger.LogWarning(ex, "Formato de hora inválido en solicitud de plan de parcheo");
            return BadRequest(new { message = "Formato de hora inválido. Use HH:mm (ej: 22:00)" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear plan de parcheo");
            return StatusCode(500, new { message = "Error al crear plan de parcheo" });
        }
    }

    /// <summary>
    /// Actualiza un plan de parcheo existente
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<PatchPlanDto>> Update(int id, [FromBody] UpdatePatchPlanRequest request)
    {
        try
        {
            var userId = GetUserId();

            var plan = await _patchPlanService.UpdateAsync(id, request, userId);
            if (plan == null)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            _logger.LogInformation("Plan de parcheo {Id} actualizado por {User}", id, userId);

            return Ok(plan);
        }
        catch (FormatException ex)
        {
            _logger.LogWarning(ex, "Formato de hora inválido en actualización de plan de parcheo {Id}", id);
            return BadRequest(new { message = "Formato de hora inválido. Use HH:mm (ej: 22:00)" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar plan de parcheo" });
        }
    }

    /// <summary>
    /// Elimina un plan de parcheo
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        try
        {
            var success = await _patchPlanService.DeleteAsync(id);
            if (!success)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            _logger.LogInformation("Plan de parcheo {Id} eliminado por {User}", id, GetUserId());

            return Ok(new { message = "Plan de parcheo eliminado" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al eliminar plan de parcheo" });
        }
    }

    /// <summary>
    /// Marca un parcheo como completado o fallido
    /// </summary>
    [HttpPatch("{id}/status")]
    public async Task<ActionResult<PatchPlanDto>> MarkStatus(int id, [FromBody] MarkPatchStatusRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();

            var plan = await _patchPlanService.MarkPatchStatusAsync(id, request, userId, userName);
            if (plan == null)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            var status = request.WasPatched ? "completado" : "fallido";
            _logger.LogInformation(
                "Plan de parcheo {Id} marcado como {Status} por {User}",
                id, status, userName);

            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar estado de plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar estado de plan de parcheo" });
        }
    }

    // =============================================
    // Nuevos endpoints para sistema mejorado
    // =============================================

    /// <summary>
    /// Obtiene servidores no-compliance para planificación
    /// </summary>
    [HttpGet("non-compliant-servers")]
    public async Task<ActionResult<List<NonCompliantServerDto>>> GetNonCompliantServers()
    {
        try
        {
            var servers = await _patchPlanService.GetNonCompliantServersAsync();
            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener servidores no-compliance");
            return StatusCode(500, new { message = "Error al obtener servidores no-compliance" });
        }
    }

    /// <summary>
    /// Sugiere ventanas de parcheo disponibles
    /// </summary>
    [HttpGet("suggest-window")]
    public async Task<ActionResult<List<SuggestedWindowDto>>> SuggestWindow(
        [FromQuery] string serverName,
        [FromQuery] int durationMinutes = 120,
        [FromQuery] DateTime? fromDate = null,
        [FromQuery] int maxSuggestions = 5)
    {
        try
        {
            var suggestions = await _windowSuggesterService.SuggestWindowsAsync(
                serverName,
                durationMinutes,
                fromDate ?? DateTime.Today,
                maxSuggestions);

            return Ok(suggestions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al sugerir ventanas para {Server}", serverName);
            return StatusCode(500, new { message = "Error al sugerir ventanas de parcheo" });
        }
    }

    /// <summary>
    /// Obtiene datos para el calendario de parcheos
    /// </summary>
    [HttpGet("calendar/{year}/{month}")]
    public async Task<ActionResult<List<PatchCalendarDto>>> GetCalendarData(int year, int month)
    {
        try
        {
            var data = await _patchPlanService.GetCalendarDataAsync(year, month);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener datos del calendario para {Year}/{Month}", year, month);
            return StatusCode(500, new { message = "Error al obtener datos del calendario" });
        }
    }

    /// <summary>
    /// Obtiene planes de una célula específica
    /// </summary>
    [HttpGet("by-cell/{cellTeam}")]
    public async Task<ActionResult<List<PatchPlanDto>>> GetByCell(string cellTeam)
    {
        try
        {
            var plans = await _patchPlanService.GetByCellAsync(cellTeam);
            return Ok(plans);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener planes por célula {Cell}", cellTeam);
            return StatusCode(500, new { message = "Error al obtener planes por célula" });
        }
    }

    /// <summary>
    /// Obtiene estadísticas del dashboard
    /// </summary>
    [HttpGet("dashboard-stats")]
    public async Task<ActionResult<PatchDashboardStatsDto>> GetDashboardStats()
    {
        try
        {
            var stats = await _patchPlanService.GetDashboardStatsAsync();
            return Ok(stats);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener estadísticas del dashboard");
            return StatusCode(500, new { message = "Error al obtener estadísticas del dashboard" });
        }
    }

    /// <summary>
    /// Reprograma un plan de parcheo
    /// </summary>
    [HttpPatch("{id}/reschedule")]
    public async Task<ActionResult<PatchPlanDto>> Reschedule(int id, [FromBody] ReschedulePatchPlanRequest request)
    {
        try
        {
            var userId = GetUserId();
            var plan = await _patchPlanService.RescheduleAsync(id, request, userId);

            if (plan == null)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            _logger.LogInformation(
                "Plan de parcheo {Id} reprogramado a {NewDate} por {User}",
                id, request.NewScheduledDate.ToShortDateString(), userId);

            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al reprogramar plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al reprogramar plan de parcheo" });
        }
    }

    /// <summary>
    /// Actualiza el estado de un plan
    /// </summary>
    [HttpPatch("{id}/update-status")]
    public async Task<ActionResult<PatchPlanDto>> UpdateStatus(int id, [FromBody] string newStatus)
    {
        try
        {
            var userId = GetUserId();
            var plan = await _patchPlanService.UpdateStatusAsync(id, newStatus, userId);

            if (plan == null)
                return NotFound(new { message = "Plan de parcheo no encontrado" });

            _logger.LogInformation(
                "Estado de plan de parcheo {Id} actualizado a {Status} por {User}",
                id, newStatus, userId);

            return Ok(plan);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar estado de plan de parcheo {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar estado de plan de parcheo" });
        }
    }

    /// <summary>
    /// Obtiene células/equipos únicos
    /// </summary>
    [HttpGet("cell-teams")]
    public async Task<ActionResult<List<string>>> GetCellTeams()
    {
        try
        {
            var cellTeams = await _patchPlanService.GetUniqueCellTeamsAsync();
            return Ok(cellTeams);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener células");
            return StatusCode(500, new { message = "Error al obtener células" });
        }
    }
}
