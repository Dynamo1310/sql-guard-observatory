using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/activations")]
[Authorize]
[ViewPermission("OnCallActivations")]
public class ActivationsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IOnCallAlertService _alertService;
    private readonly ILogger<ActivationsController> _logger;

    public ActivationsController(
        ApplicationDbContext context,
        IOnCallAlertService alertService,
        ILogger<ActivationsController> logger)
    {
        _context = context;
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    /// <summary>
    /// Obtiene todas las activaciones, opcionalmente filtradas por fecha
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<OnCallActivationDto>>> GetAll(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate,
        [FromQuery] string? operatorUserId,
        [FromQuery] string? category,
        [FromQuery] string? severity)
    {
        try
        {
            var query = _context.OnCallActivations
                .Include(a => a.Operator)
                .Include(a => a.Schedule)
                .Include(a => a.CreatedByUser)
                .AsQueryable();

            if (startDate.HasValue)
                query = query.Where(a => a.ActivatedAt >= startDate.Value);
            
            if (endDate.HasValue)
                query = query.Where(a => a.ActivatedAt <= endDate.Value);
            
            if (!string.IsNullOrEmpty(operatorUserId))
                query = query.Where(a => a.OperatorUserId == operatorUserId);
            
            if (!string.IsNullOrEmpty(category))
                query = query.Where(a => a.Category == category);
            
            if (!string.IsNullOrEmpty(severity))
                query = query.Where(a => a.Severity == severity);

            var activations = await query
                .OrderByDescending(a => a.ActivatedAt)
                .Select(a => new OnCallActivationDto
                {
                    Id = a.Id,
                    ScheduleId = a.ScheduleId,
                    ScheduleWeekStart = a.Schedule.WeekStartDate,
                    ScheduleWeekEnd = a.Schedule.WeekEndDate,
                    OperatorUserId = a.OperatorUserId,
                    OperatorDomainUser = a.Operator.DomainUser ?? "",
                    OperatorDisplayName = a.Operator.DisplayName ?? a.Operator.DomainUser ?? "",
                    ActivatedAt = a.ActivatedAt,
                    ResolvedAt = a.ResolvedAt,
                    DurationMinutes = a.DurationMinutes,
                    Category = a.Category,
                    Severity = a.Severity,
                    Title = a.Title,
                    Description = a.Description,
                    Resolution = a.Resolution,
                    InstanceName = a.InstanceName,
                    ServiceDeskUrl = a.ServiceDeskUrl,
                    Status = a.Status,
                    CreatedByDisplayName = a.CreatedByUser.DisplayName ?? a.CreatedByUser.DomainUser ?? "",
                    CreatedAt = a.CreatedAt
                })
                .ToListAsync();

            return Ok(activations);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener activaciones");
            return StatusCode(500, new { message = "Error al obtener activaciones" });
        }
    }

    /// <summary>
    /// Obtiene una activación por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<OnCallActivationDto>> GetById(int id)
    {
        try
        {
            var activation = await _context.OnCallActivations
                .Include(a => a.Operator)
                .Include(a => a.Schedule)
                .Include(a => a.CreatedByUser)
                .Where(a => a.Id == id)
                .Select(a => new OnCallActivationDto
                {
                    Id = a.Id,
                    ScheduleId = a.ScheduleId,
                    ScheduleWeekStart = a.Schedule.WeekStartDate,
                    ScheduleWeekEnd = a.Schedule.WeekEndDate,
                    OperatorUserId = a.OperatorUserId,
                    OperatorDomainUser = a.Operator.DomainUser ?? "",
                    OperatorDisplayName = a.Operator.DisplayName ?? a.Operator.DomainUser ?? "",
                    ActivatedAt = a.ActivatedAt,
                    ResolvedAt = a.ResolvedAt,
                    DurationMinutes = a.DurationMinutes,
                    Category = a.Category,
                    Severity = a.Severity,
                    Title = a.Title,
                    Description = a.Description,
                    Resolution = a.Resolution,
                    InstanceName = a.InstanceName,
                    ServiceDeskUrl = a.ServiceDeskUrl,
                    Status = a.Status,
                    CreatedByDisplayName = a.CreatedByUser.DisplayName ?? a.CreatedByUser.DomainUser ?? "",
                    CreatedAt = a.CreatedAt
                })
                .FirstOrDefaultAsync();

            if (activation == null)
                return NotFound(new { message = "Activación no encontrada" });

            return Ok(activation);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener activación {Id}", id);
            return StatusCode(500, new { message = "Error al obtener activación" });
        }
    }

    /// <summary>
    /// Crea una nueva activación
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OnCallActivationDto>> Create([FromBody] CreateActivationRequest request)
    {
        try
        {
            var userId = GetUserId();

            // Validar que la guardia existe
            var schedule = await _context.OnCallSchedules.FindAsync(request.ScheduleId);
            if (schedule == null)
                return BadRequest(new { message = "Guardia no encontrada" });

            var activation = new OnCallActivation
            {
                ScheduleId = request.ScheduleId,
                OperatorUserId = schedule.UserId, // El operador de la guardia
                ActivatedAt = request.ActivatedAt,
                ResolvedAt = request.ResolvedAt,
                DurationMinutes = request.DurationMinutes,
                Category = request.Category,
                Severity = request.Severity,
                Title = request.Title,
                Description = request.Description,
                Resolution = request.Resolution,
                InstanceName = request.InstanceName,
                ServiceDeskUrl = request.ServiceDeskUrl,
                Status = request.Status,
                CreatedByUserId = userId,
                CreatedAt = DateTime.Now
            };

            _context.OnCallActivations.Add(activation);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Activación {Id} creada por {UserId}", activation.Id, userId);

            // Disparar alertas configuradas por los usuarios
            var operatorUser = await _context.Users.FindAsync(schedule.UserId);
            await _alertService.TriggerActivationCreatedAlertsAsync(
                operatorUser?.DisplayName ?? operatorUser?.DomainUser ?? "Usuario",
                activation.ActivatedAt,
                activation.Category,
                activation.Severity,
                activation.Title,
                activation.InstanceName);

            return await GetById(activation.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear activación");
            return StatusCode(500, new { message = "Error al crear activación" });
        }
    }

    /// <summary>
    /// Actualiza una activación existente
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<OnCallActivationDto>> Update(int id, [FromBody] UpdateActivationRequest request)
    {
        try
        {
            var activation = await _context.OnCallActivations.FindAsync(id);
            if (activation == null)
                return NotFound(new { message = "Activación no encontrada" });

            if (request.ResolvedAt.HasValue)
                activation.ResolvedAt = request.ResolvedAt;
            
            if (request.DurationMinutes.HasValue)
                activation.DurationMinutes = request.DurationMinutes;
            
            if (!string.IsNullOrEmpty(request.Category))
                activation.Category = request.Category;
            
            if (!string.IsNullOrEmpty(request.Severity))
                activation.Severity = request.Severity;
            
            if (!string.IsNullOrEmpty(request.Title))
                activation.Title = request.Title;
            
            if (request.Description != null)
                activation.Description = request.Description;
            
            if (request.Resolution != null)
                activation.Resolution = request.Resolution;
            
            if (request.InstanceName != null)
                activation.InstanceName = request.InstanceName;
            
            if (request.ServiceDeskUrl != null)
                activation.ServiceDeskUrl = request.ServiceDeskUrl;
            
            if (!string.IsNullOrEmpty(request.Status))
                activation.Status = request.Status;

            activation.UpdatedAt = DateTime.Now;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Activación {Id} actualizada", id);

            return await GetById(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar activación {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar activación" });
        }
    }

    /// <summary>
    /// Elimina una activación
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        try
        {
            var activation = await _context.OnCallActivations.FindAsync(id);
            if (activation == null)
                return NotFound(new { message = "Activación no encontrada" });

            _context.OnCallActivations.Remove(activation);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Activación {Id} eliminada", id);

            return Ok(new { message = "Activación eliminada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar activación {Id}", id);
            return StatusCode(500, new { message = "Error al eliminar activación" });
        }
    }

    /// <summary>
    /// Obtiene un resumen de activaciones
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<ActivationSummaryDto>> GetSummary(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        try
        {
            var query = _context.OnCallActivations.AsQueryable();

            if (startDate.HasValue)
                query = query.Where(a => a.ActivatedAt >= startDate.Value);
            
            if (endDate.HasValue)
                query = query.Where(a => a.ActivatedAt <= endDate.Value);

            var activations = await query
                .Include(a => a.Operator)
                .ToListAsync();

            var totalMinutes = activations.Sum(a => a.DurationMinutes ?? 0);

            var summary = new ActivationSummaryDto
            {
                TotalActivations = activations.Count,
                TotalHours = totalMinutes / 60,
                TotalMinutes = totalMinutes % 60,
                CriticalCount = activations.Count(a => a.Severity == "Critical"),
                HighCount = activations.Count(a => a.Severity == "High"),
                MediumCount = activations.Count(a => a.Severity == "Medium"),
                LowCount = activations.Count(a => a.Severity == "Low"),
                ByCategory = activations
                    .GroupBy(a => a.Category)
                    .ToDictionary(g => g.Key, g => g.Count()),
                ByOperator = activations
                    .GroupBy(a => a.Operator?.DisplayName ?? a.Operator?.DomainUser ?? "Unknown")
                    .ToDictionary(g => g.Key, g => g.Count())
            };

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de activaciones");
            return StatusCode(500, new { message = "Error al obtener resumen" });
        }
    }

    // ==================== CATEGORIES ====================

    /// <summary>
    /// Obtiene todas las categorías de activación
    /// </summary>
    [HttpGet("categories")]
    public async Task<ActionResult<List<ActivationCategoryDto>>> GetCategories()
    {
        try
        {
            var categories = await _context.OnCallActivationCategories
                .Include(c => c.CreatedByUser)
                .OrderBy(c => c.Order)
                .Select(c => new ActivationCategoryDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Icon = c.Icon,
                    IsDefault = c.IsDefault,
                    IsActive = c.IsActive,
                    Order = c.Order,
                    CreatedAt = c.CreatedAt,
                    CreatedByDisplayName = c.CreatedByUser != null ? c.CreatedByUser.DisplayName : null
                })
                .ToListAsync();

            return Ok(categories);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener categorías");
            return StatusCode(500, new { message = "Error al obtener categorías" });
        }
    }

    /// <summary>
    /// Crea una nueva categoría
    /// </summary>
    [HttpPost("categories")]
    public async Task<ActionResult<ActivationCategoryDto>> CreateCategory([FromBody] CreateActivationCategoryRequest request)
    {
        try
        {
            var userId = GetUserId();

            // Obtener el máximo orden actual
            var maxOrder = await _context.OnCallActivationCategories
                .MaxAsync(c => (int?)c.Order) ?? 0;

            var category = new OnCallActivationCategory
            {
                Name = request.Name,
                Icon = request.Icon,
                IsDefault = false,
                IsActive = true,
                Order = maxOrder + 1,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = userId
            };

            _context.OnCallActivationCategories.Add(category);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Categoría {Id} creada por {UserId}", category.Id, userId);

            var dto = new ActivationCategoryDto
            {
                Id = category.Id,
                Name = category.Name,
                Icon = category.Icon,
                IsDefault = category.IsDefault,
                IsActive = category.IsActive,
                Order = category.Order,
                CreatedAt = category.CreatedAt
            };

            return Ok(dto);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear categoría");
            return StatusCode(500, new { message = "Error al crear categoría" });
        }
    }

    /// <summary>
    /// Actualiza una categoría existente
    /// </summary>
    [HttpPut("categories/{id}")]
    public async Task<ActionResult<ActivationCategoryDto>> UpdateCategory(int id, [FromBody] UpdateActivationCategoryRequest request)
    {
        try
        {
            var category = await _context.OnCallActivationCategories.FindAsync(id);
            if (category == null)
                return NotFound(new { message = "Categoría no encontrada" });

            category.Name = request.Name;
            category.Icon = request.Icon;
            category.IsActive = request.IsActive;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Categoría {Id} actualizada", id);

            return await GetCategoryById(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar categoría {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar categoría" });
        }
    }

    private async Task<ActionResult<ActivationCategoryDto>> GetCategoryById(int id)
    {
        var category = await _context.OnCallActivationCategories
            .Include(c => c.CreatedByUser)
            .Where(c => c.Id == id)
            .Select(c => new ActivationCategoryDto
            {
                Id = c.Id,
                Name = c.Name,
                Icon = c.Icon,
                IsDefault = c.IsDefault,
                IsActive = c.IsActive,
                Order = c.Order,
                CreatedAt = c.CreatedAt,
                CreatedByDisplayName = c.CreatedByUser != null ? c.CreatedByUser.DisplayName : null
            })
            .FirstOrDefaultAsync();

        if (category == null)
            return NotFound(new { message = "Categoría no encontrada" });

        return Ok(category);
    }

    /// <summary>
    /// Elimina una categoría (solo si no es default)
    /// </summary>
    [HttpDelete("categories/{id}")]
    public async Task<ActionResult> DeleteCategory(int id)
    {
        try
        {
            var category = await _context.OnCallActivationCategories.FindAsync(id);
            if (category == null)
                return NotFound(new { message = "Categoría no encontrada" });

            if (category.IsDefault)
                return BadRequest(new { message = "No se puede eliminar una categoría por defecto" });

            _context.OnCallActivationCategories.Remove(category);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Categoría {Id} eliminada", id);

            return Ok(new { message = "Categoría eliminada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar categoría {Id}", id);
            return StatusCode(500, new { message = "Error al eliminar categoría" });
        }
    }

    /// <summary>
    /// Reordena las categorías
    /// </summary>
    [HttpPost("categories/reorder")]
    public async Task<ActionResult> ReorderCategories([FromBody] List<int> categoryIds)
    {
        try
        {
            for (int i = 0; i < categoryIds.Count; i++)
            {
                var category = await _context.OnCallActivationCategories.FindAsync(categoryIds[i]);
                if (category != null)
                {
                    category.Order = i + 1;
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation("Categorías reordenadas");

            return Ok(new { message = "Categorías reordenadas" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al reordenar categorías");
            return StatusCode(500, new { message = "Error al reordenar categorías" });
        }
    }
}

