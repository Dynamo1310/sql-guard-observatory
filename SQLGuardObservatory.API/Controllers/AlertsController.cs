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
[Route("api/alerts")]
[Authorize]
[ViewPermission("OnCallAlerts")]
public class AlertsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IOnCallAlertService _alertService;
    private readonly ILogger<AlertsController> _logger;

    public AlertsController(
        ApplicationDbContext context,
        IOnCallAlertService alertService,
        ILogger<AlertsController> logger)
    {
        _context = context;
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    /// <summary>
    /// Obtiene todas las reglas de alerta
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<OnCallAlertRuleDto>>> GetAll()
    {
        try
        {
            var rules = await _context.OnCallAlertRules
                .Include(r => r.CreatedByUser)
                .Include(r => r.Recipients)
                .OrderBy(r => r.Name)
                .Select(r => new OnCallAlertRuleDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    Description = r.Description,
                    AlertType = r.AlertType,
                    ConditionDays = r.ConditionDays,
                    IsEnabled = r.IsEnabled,
                    AttachExcel = r.AttachExcel,
                    CreatedByDisplayName = r.CreatedByUser.DisplayName ?? r.CreatedByUser.DomainUser ?? "",
                    CreatedAt = r.CreatedAt,
                    UpdatedAt = r.UpdatedAt,
                    Recipients = r.Recipients.Select(rec => new AlertRecipientDto
                    {
                        Id = rec.Id,
                        Email = rec.Email,
                        Name = rec.Name,
                        IsEnabled = rec.IsEnabled
                    }).ToList()
                })
                .ToListAsync();

            return Ok(rules);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener reglas de alerta");
            return StatusCode(500, new { message = "Error al obtener reglas de alerta" });
        }
    }

    /// <summary>
    /// Obtiene una regla de alerta por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<OnCallAlertRuleDto>> GetById(int id)
    {
        try
        {
            var rule = await _context.OnCallAlertRules
                .Include(r => r.CreatedByUser)
                .Include(r => r.Recipients)
                .Where(r => r.Id == id)
                .Select(r => new OnCallAlertRuleDto
                {
                    Id = r.Id,
                    Name = r.Name,
                    Description = r.Description,
                    AlertType = r.AlertType,
                    ConditionDays = r.ConditionDays,
                    IsEnabled = r.IsEnabled,
                    AttachExcel = r.AttachExcel,
                    CreatedByDisplayName = r.CreatedByUser.DisplayName ?? r.CreatedByUser.DomainUser ?? "",
                    CreatedAt = r.CreatedAt,
                    UpdatedAt = r.UpdatedAt,
                    Recipients = r.Recipients.Select(rec => new AlertRecipientDto
                    {
                        Id = rec.Id,
                        Email = rec.Email,
                        Name = rec.Name,
                        IsEnabled = rec.IsEnabled
                    }).ToList()
                })
                .FirstOrDefaultAsync();

            if (rule == null)
                return NotFound(new { message = "Regla no encontrada" });

            return Ok(rule);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener regla de alerta {Id}", id);
            return StatusCode(500, new { message = "Error al obtener regla de alerta" });
        }
    }

    /// <summary>
    /// Crea una nueva regla de alerta
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OnCallAlertRuleDto>> Create([FromBody] CreateAlertRuleRequest request)
    {
        try
        {
            var userId = GetUserId();

            var rule = new OnCallAlertRule
            {
                Name = request.Name,
                Description = request.Description,
                AlertType = request.AlertType,
                ConditionDays = request.ConditionDays,
                AttachExcel = request.AttachExcel,
                IsEnabled = true,
                CreatedByUserId = userId,
                CreatedAt = DateTime.Now,
                Recipients = request.Recipients.Select(r => new OnCallAlertRecipient
                {
                    Email = r.Email,
                    Name = r.Name,
                    IsEnabled = true,
                    CreatedAt = DateTime.Now
                }).ToList()
            };

            _context.OnCallAlertRules.Add(rule);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Regla de alerta {Id} creada por {UserId}", rule.Id, userId);

            return await GetById(rule.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear regla de alerta");
            return StatusCode(500, new { message = "Error al crear regla de alerta" });
        }
    }

    /// <summary>
    /// Actualiza una regla de alerta
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<OnCallAlertRuleDto>> Update(int id, [FromBody] UpdateAlertRuleRequest request)
    {
        try
        {
            var rule = await _context.OnCallAlertRules.FindAsync(id);
            if (rule == null)
                return NotFound(new { message = "Regla no encontrada" });

            if (!string.IsNullOrEmpty(request.Name))
                rule.Name = request.Name;
            
            if (request.Description != null)
                rule.Description = request.Description;
            
            if (request.ConditionDays.HasValue)
                rule.ConditionDays = request.ConditionDays;
            
            if (request.IsEnabled.HasValue)
                rule.IsEnabled = request.IsEnabled.Value;
            
            if (request.AttachExcel.HasValue)
                rule.AttachExcel = request.AttachExcel.Value;

            rule.UpdatedAt = DateTime.Now;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Regla de alerta {Id} actualizada", id);

            return await GetById(id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar regla de alerta {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar regla de alerta" });
        }
    }

    /// <summary>
    /// Elimina una regla de alerta
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        try
        {
            var rule = await _context.OnCallAlertRules
                .Include(r => r.Recipients)
                .FirstOrDefaultAsync(r => r.Id == id);
                
            if (rule == null)
                return NotFound(new { message = "Regla no encontrada" });

            _context.OnCallAlertRules.Remove(rule);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Regla de alerta {Id} eliminada", id);

            return Ok(new { message = "Regla eliminada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar regla de alerta {Id}", id);
            return StatusCode(500, new { message = "Error al eliminar regla de alerta" });
        }
    }

    /// <summary>
    /// Agrega un destinatario a una regla de alerta
    /// </summary>
    [HttpPost("{alertId}/recipients")]
    public async Task<ActionResult<AlertRecipientDto>> AddRecipient(int alertId, [FromBody] AddRecipientRequest request)
    {
        try
        {
            var rule = await _context.OnCallAlertRules.FindAsync(alertId);
            if (rule == null)
                return NotFound(new { message = "Regla no encontrada" });

            var recipient = new OnCallAlertRecipient
            {
                AlertRuleId = alertId,
                Email = request.Email,
                Name = request.Name,
                IsEnabled = true,
                CreatedAt = DateTime.Now
            };

            _context.OnCallAlertRecipients.Add(recipient);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Destinatario agregado a regla {AlertId}", alertId);

            return Ok(new AlertRecipientDto
            {
                Id = recipient.Id,
                Email = recipient.Email,
                Name = recipient.Name,
                IsEnabled = recipient.IsEnabled
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar destinatario a regla {AlertId}", alertId);
            return StatusCode(500, new { message = "Error al agregar destinatario" });
        }
    }

    /// <summary>
    /// Elimina un destinatario de una regla de alerta
    /// </summary>
    [HttpDelete("{alertId}/recipients/{recipientId}")]
    public async Task<ActionResult> RemoveRecipient(int alertId, int recipientId)
    {
        try
        {
            var recipient = await _context.OnCallAlertRecipients
                .FirstOrDefaultAsync(r => r.AlertRuleId == alertId && r.Id == recipientId);
                
            if (recipient == null)
                return NotFound(new { message = "Destinatario no encontrado" });

            _context.OnCallAlertRecipients.Remove(recipient);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Destinatario {RecipientId} eliminado de regla {AlertId}", recipientId, alertId);

            return Ok(new { message = "Destinatario eliminado" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar destinatario {RecipientId} de regla {AlertId}", recipientId, alertId);
            return StatusCode(500, new { message = "Error al eliminar destinatario" });
        }
    }

    /// <summary>
    /// Habilita/deshabilita un destinatario
    /// </summary>
    [HttpPatch("{alertId}/recipients/{recipientId}")]
    public async Task<ActionResult<AlertRecipientDto>> ToggleRecipient(int alertId, int recipientId, [FromBody] ToggleRecipientRequest request)
    {
        try
        {
            var recipient = await _context.OnCallAlertRecipients
                .FirstOrDefaultAsync(r => r.AlertRuleId == alertId && r.Id == recipientId);
                
            if (recipient == null)
                return NotFound(new { message = "Destinatario no encontrado" });

            recipient.IsEnabled = request.IsEnabled;
            await _context.SaveChangesAsync();

            return Ok(new AlertRecipientDto
            {
                Id = recipient.Id,
                Email = recipient.Email,
                Name = recipient.Name,
                IsEnabled = recipient.IsEnabled
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar destinatario {RecipientId}", recipientId);
            return StatusCode(500, new { message = "Error al actualizar destinatario" });
        }
    }

    /// <summary>
    /// Ejecuta manualmente la verificación de alertas por días restantes
    /// Este endpoint debería ser llamado por un job programado diariamente
    /// </summary>
    [HttpPost("check-days-remaining")]
    public async Task<ActionResult> CheckDaysRemaining()
    {
        try
        {
            await _alertService.CheckAndTriggerDaysRemainingAlertsAsync();
            _logger.LogInformation("Verificación de días restantes ejecutada exitosamente");
            return Ok(new { message = "Verificación completada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al verificar días restantes");
            return StatusCode(500, new { message = "Error al verificar días restantes" });
        }
    }
}

public class ToggleRecipientRequest
{
    public bool IsEnabled { get; set; }
}

