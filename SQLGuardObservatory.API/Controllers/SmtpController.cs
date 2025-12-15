using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/smtp")]
[Authorize(Roles = "Admin,SuperAdmin")]
public class SmtpController : ControllerBase
{
    private readonly ISmtpService _smtpService;
    private readonly ILogger<SmtpController> _logger;

    public SmtpController(ISmtpService smtpService, ILogger<SmtpController> logger)
    {
        _smtpService = smtpService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    /// <summary>
    /// Obtiene la configuración SMTP actual
    /// </summary>
    [HttpGet("settings")]
    public async Task<ActionResult<SmtpSettingsDto>> GetSettings()
    {
        try
        {
            var settings = await _smtpService.GetSettingsAsync();
            if (settings == null)
            {
                return NotFound(new { message = "No hay configuración SMTP" });
            }
            return Ok(settings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener configuración SMTP");
            return StatusCode(500, new { message = "Error al obtener configuración" });
        }
    }

    /// <summary>
    /// Actualiza la configuración SMTP
    /// </summary>
    [HttpPut("settings")]
    public async Task<ActionResult<SmtpSettingsDto>> UpdateSettings([FromBody] UpdateSmtpSettingsRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.Host) || string.IsNullOrEmpty(request.FromEmail))
            {
                return BadRequest(new { message = "Host y FromEmail son requeridos" });
            }

            var settings = await _smtpService.UpdateSettingsAsync(request, GetUserId());
            return Ok(settings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar configuración SMTP");
            return StatusCode(500, new { message = "Error al actualizar configuración" });
        }
    }

    /// <summary>
    /// Prueba la conexión SMTP enviando un email de prueba
    /// </summary>
    [HttpPost("test")]
    public async Task<ActionResult> TestConnection([FromBody] TestSmtpRequest request)
    {
        try
        {
            if (string.IsNullOrEmpty(request.TestEmail))
            {
                return BadRequest(new { message = "Email de prueba requerido", success = false });
            }

            var success = await _smtpService.TestConnectionAsync(request.TestEmail);
            
            // Siempre devolver Ok, el frontend maneja el resultado
            return Ok(new { 
                message = success ? "Email de prueba enviado correctamente" : "Error al enviar email de prueba. Revisa los logs.", 
                success 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en prueba de conexión SMTP");
            return Ok(new { message = "Error en la prueba: " + ex.Message, success = false });
        }
    }
}

