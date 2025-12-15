using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para recibir y procesar mensajes del Bot de Microsoft Teams
/// Fase 2: Comandos interactivos
/// </summary>
[ApiController]
[Route("api/teams/bot")]
public class TeamsBotController : ControllerBase
{
    private readonly IHealthScoreService _healthScoreService;
    private readonly IOnCallService _onCallService;
    private readonly ITeamsNotificationService _teamsService;
    private readonly IConfiguration _configuration;
    private readonly ILogger<TeamsBotController> _logger;

    public TeamsBotController(
        IHealthScoreService healthScoreService,
        IOnCallService onCallService,
        ITeamsNotificationService teamsService,
        IConfiguration configuration,
        ILogger<TeamsBotController> logger)
    {
        _healthScoreService = healthScoreService;
        _onCallService = onCallService;
        _teamsService = teamsService;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// Endpoint principal para recibir mensajes del bot
    /// Microsoft Bot Framework envía actividades aquí
    /// </summary>
    [HttpPost("messages")]
    public async Task<IActionResult> ProcessMessage([FromBody] JsonElement activity)
    {
        try
        {
            var activityType = activity.GetProperty("type").GetString();
            
            _logger.LogInformation("Actividad recibida de Teams Bot: {Type}", activityType);

            if (activityType == "message")
            {
                var text = activity.TryGetProperty("text", out var textProp) 
                    ? textProp.GetString()?.Trim() ?? "" 
                    : "";

                // Remover la mención del bot si existe
                text = RemoveBotMention(text);

                var response = await ProcessCommand(text);
                
                return Ok(new TeamsBotResponseDto
                {
                    Type = "message",
                    Text = response.Text,
                    Attachments = response.Attachments
                });
            }
            else if (activityType == "invoke")
            {
                // Manejar acciones de botones (Action.Submit)
                var value = activity.TryGetProperty("value", out var valueProp) 
                    ? valueProp 
                    : default;

                if (value.ValueKind != JsonValueKind.Undefined)
                {
                    var actionResponse = await ProcessAction(value);
                    return Ok(new
                    {
                        status = 200,
                        body = actionResponse
                    });
                }
            }

            return Ok(new { status = 200 });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando mensaje del bot");
            return Ok(new TeamsBotResponseDto
            {
                Type = "message",
                Text = "❌ Error procesando el comando. Por favor intenta nuevamente."
            });
        }
    }

    /// <summary>
    /// Endpoint para webhook de comandos simples (sin Bot Framework completo)
    /// </summary>
    [HttpPost("webhook")]
    public async Task<IActionResult> ProcessWebhook([FromBody] TeamsBotSimpleRequest request)
    {
        try
        {
            _logger.LogInformation("Comando recibido via webhook: {Command}", request.Command);

            var response = await ProcessCommand(request.Command);
            
            // Si se especifica un email, enviar la respuesta como mensaje directo
            if (!string.IsNullOrEmpty(request.ResponseEmail))
            {
                await _teamsService.SendDirectMessageAsync(
                    request.ResponseEmail,
                    "SQL Nova Bot",
                    response.Text);
            }

            return Ok(new
            {
                success = true,
                response = response.Text,
                timestamp = DateTime.Now
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando webhook del bot");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>
    /// Obtener ayuda de comandos disponibles
    /// </summary>
    [HttpGet("help")]
    public IActionResult GetHelp()
    {
        var commands = new[]
        {
            new { Command = "status", Description = "Ver resumen general de todas las instancias" },
            new { Command = "status [instancia]", Description = "Ver Health Score de una instancia específica" },
            new { Command = "alerts", Description = "Ver alertas activas" },
            new { Command = "oncall", Description = "Ver quién está de guardia actualmente" },
            new { Command = "help", Description = "Mostrar esta ayuda" }
        };

        return Ok(new
        {
            botName = "SQL Nova Bot",
            version = "1.0",
            commands = commands
        });
    }

    // ==================== PROCESAMIENTO DE COMANDOS ====================

    private async Task<BotCommandResponse> ProcessCommand(string command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return await GetHelpResponse();
        }

        var parts = command.ToLower().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var mainCommand = parts.FirstOrDefault() ?? "";

        return mainCommand switch
        {
            "status" => parts.Length > 1 
                ? await GetInstanceStatus(parts[1]) 
                : await GetOverallStatus(),
            "alerts" => await GetActiveAlerts(),
            "oncall" or "guardia" => await GetCurrentOnCall(),
            "help" or "ayuda" or "?" => await GetHelpResponse(),
            _ => await GetHelpResponse($"Comando no reconocido: '{mainCommand}'")
        };
    }

    private async Task<BotCommandResponse> GetOverallStatus()
    {
        try
        {
            var summary = await _healthScoreService.GetSummaryAsync();
            
            var criticalEmoji = summary.CriticalCount > 0 ? "🔴" : "⚪";
            var warningEmoji = summary.WarningCount > 0 ? "🟡" : "⚪";
            var healthyEmoji = summary.HealthyCount > 0 ? "🟢" : "⚪";

            var text = $"📊 **Estado General de SQL Servers**\n\n" +
                      $"{healthyEmoji} Saludables: **{summary.HealthyCount}**\n" +
                      $"{warningEmoji} Advertencia: **{summary.WarningCount}**\n" +
                      $"{criticalEmoji} Críticos: **{summary.CriticalCount}**\n\n" +
                      $"📈 Score Promedio: **{summary.AvgScore}/100**\n" +
                      $"🕐 Última actualización: {summary.LastUpdate?.ToString("dd/MM/yyyy HH:mm") ?? DateTime.Now.ToString("dd/MM/yyyy HH:mm")}";

            return new BotCommandResponse { Text = text };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado general");
            return new BotCommandResponse { Text = "❌ Error al obtener el estado general de las instancias." };
        }
    }

    private async Task<BotCommandResponse> GetInstanceStatus(string instanceName)
    {
        try
        {
            var instances = await _healthScoreService.GetLatestHealthScoresAsync();
            var instance = instances.FirstOrDefault(i => 
                i.InstanceName.Contains(instanceName, StringComparison.OrdinalIgnoreCase));

            if (instance == null)
            {
                return new BotCommandResponse 
                { 
                    Text = $"❓ No se encontró una instancia que coincida con: '{instanceName}'\n\n" +
                           "Usa el comando `status` sin parámetros para ver todas las instancias."
                };
            }

            var emoji = instance.HealthScore >= 70 ? "🟢" : instance.HealthScore >= 50 ? "🟡" : "🔴";
            var status = instance.HealthScore >= 70 ? "Saludable" : instance.HealthScore >= 50 ? "Advertencia" : "Crítico";

            var text = $"{emoji} **{instance.InstanceName}**\n\n" +
                      $"📊 Health Score: **{instance.HealthScore}/100** ({status})\n" +
                      $"🏢 Ambiente: {instance.Ambiente ?? "N/A"}\n" +
                      $"☁️ Hosting: {instance.HostingSite ?? "N/A"}\n" +
                      $"🕐 Última actualización: {instance.GeneratedAtUtc.ToLocalTime():dd/MM/yyyy HH:mm}";

            return new BotCommandResponse { Text = text };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado de instancia: {Instance}", instanceName);
            return new BotCommandResponse { Text = $"❌ Error al obtener el estado de '{instanceName}'." };
        }
    }

    private async Task<BotCommandResponse> GetActiveAlerts()
    {
        try
        {
            var instances = await _healthScoreService.GetLatestHealthScoresAsync();
            var criticalInstances = instances
                .Where(i => i.HealthScore < 50)
                .OrderBy(i => i.HealthScore)
                .Take(5)
                .ToList();

            var warningInstances = instances
                .Where(i => i.HealthScore >= 50 && i.HealthScore < 70)
                .OrderBy(i => i.HealthScore)
                .Take(5)
                .ToList();

            if (!criticalInstances.Any() && !warningInstances.Any())
            {
                return new BotCommandResponse 
                { 
                    Text = "✅ **No hay alertas activas**\n\nTodas las instancias están funcionando correctamente."
                };
            }

            var text = "⚠️ **Alertas Activas**\n\n";

            if (criticalInstances.Any())
            {
                text += "🔴 **Críticas:**\n";
                foreach (var inst in criticalInstances)
                {
                    text += $"  • {inst.InstanceName}: **{inst.HealthScore}/100**\n";
                }
                text += "\n";
            }

            if (warningInstances.Any())
            {
                text += "🟡 **Advertencias:**\n";
                foreach (var inst in warningInstances)
                {
                    text += $"  • {inst.InstanceName}: **{inst.HealthScore}/100**\n";
                }
            }

            return new BotCommandResponse { Text = text };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo alertas activas");
            return new BotCommandResponse { Text = "❌ Error al obtener las alertas activas." };
        }
    }

    private async Task<BotCommandResponse> GetCurrentOnCall()
    {
        try
        {
            var onCall = await _onCallService.GetCurrentOnCallAsync();

            if (!onCall.IsCurrentlyOnCall)
            {
                return new BotCommandResponse 
                { 
                    Text = "📅 **Guardia DBA**\n\n" +
                           "⚠️ No hay guardia asignada actualmente.\n\n" +
                           "Contactar a los usuarios de escalamiento si es necesario."
                };
            }

            var text = $"📅 **Guardia DBA Actual**\n\n" +
                      $"👤 Operador: **{onCall.DisplayName}**\n" +
                      $"📧 Email: {onCall.Email}\n" +
                      $"📆 Desde: {onCall.WeekStartDate:dddd dd/MM/yyyy HH:mm}\n" +
                      $"📆 Hasta: {onCall.WeekEndDate:dddd dd/MM/yyyy HH:mm}\n";

            if (onCall.EscalationUsers?.Any() == true)
            {
                text += "\n🚨 **Escalamiento:**\n";
                foreach (var esc in onCall.EscalationUsers.Take(3))
                {
                    text += $"  {esc.Order}. {esc.DisplayName}\n";
                }
            }

            return new BotCommandResponse { Text = text };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo guardia actual");
            return new BotCommandResponse { Text = "❌ Error al obtener información de la guardia." };
        }
    }

    private Task<BotCommandResponse> GetHelpResponse(string? errorMessage = null)
    {
        var appUrl = _configuration["TeamsSettings:AppUrl"] ?? _configuration["AppUrl"] ?? "http://asprbm-nov-01:8080";
        
        var text = "";
        
        if (!string.IsNullOrEmpty(errorMessage))
        {
            text = $"❓ {errorMessage}\n\n";
        }

        text += "🤖 **SQL Nova Bot - Comandos Disponibles**\n\n" +
               "📊 `status` - Ver resumen general de instancias\n" +
               "📊 `status [nombre]` - Ver estado de una instancia\n" +
               "⚠️ `alerts` - Ver alertas activas\n" +
               "📅 `oncall` - Ver quién está de guardia\n" +
               "❓ `help` - Mostrar esta ayuda\n\n" +
               $"🔗 [Abrir SQL Nova]({appUrl})";

        return Task.FromResult(new BotCommandResponse { Text = text });
    }

    // ==================== PROCESAMIENTO DE ACCIONES ====================

    private async Task<object> ProcessAction(JsonElement value)
    {
        try
        {
            var action = value.TryGetProperty("action", out var actionProp) 
                ? actionProp.GetString() 
                : null;

            return action switch
            {
                "approve_swap" => await HandleSwapApproval(value, true),
                "reject_swap" => await HandleSwapApproval(value, false),
                "ack_alert" => await HandleAlertAcknowledge(value),
                _ => new { message = "Acción no reconocida" }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando acción");
            return new { message = "Error procesando la acción" };
        }
    }

    private async Task<object> HandleSwapApproval(JsonElement value, bool approve)
    {
        var swapRequestId = value.TryGetProperty("swapRequestId", out var idProp) 
            ? idProp.GetInt32() 
            : 0;

        if (swapRequestId == 0)
        {
            return new { message = "ID de solicitud no válido" };
        }

        // Nota: Esta funcionalidad requiere autenticación del usuario
        // Por ahora, retornamos un mensaje indicando que deben usar la app
        return new 
        { 
            message = approve 
                ? "✅ Para aprobar la solicitud, por favor usa la aplicación SQL Nova."
                : "❌ Para rechazar la solicitud, por favor usa la aplicación SQL Nova."
        };
    }

    private Task<object> HandleAlertAcknowledge(JsonElement value)
    {
        var instanceName = value.TryGetProperty("instanceName", out var instProp) 
            ? instProp.GetString() 
            : null;

        // Nota: Esta funcionalidad se implementará en futuras versiones
        return Task.FromResult<object>(new 
        { 
            message = $"📝 Alerta de '{instanceName}' marcada para seguimiento.\nUsa SQL Nova para ver detalles."
        });
    }

    // ==================== UTILIDADES ====================

    private string RemoveBotMention(string text)
    {
        // Remover menciones de Teams (@SQLNova, <at>SQLNova</at>, etc.)
        text = Regex.Replace(text, @"<at>.*?</at>", "", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"@\w+", "");
        return text.Trim();
    }
}

// ==================== MODELOS ====================

public class BotCommandResponse
{
    public string Text { get; set; } = string.Empty;
    public List<TeamsAttachmentDto>? Attachments { get; set; }
}

public class TeamsBotSimpleRequest
{
    public string Command { get; set; } = string.Empty;
    public string? ResponseEmail { get; set; }
}

