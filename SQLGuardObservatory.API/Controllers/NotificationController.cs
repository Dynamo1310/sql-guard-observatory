using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using SQLGuardObservatory.API.Hubs;

namespace SQLGuardObservatory.API.Controllers
{
    [ApiController]
    [Route("api/notifications")]
    public class NotificationController : ControllerBase
    {
        private readonly IHubContext<NotificationHub> _hubContext;
        private readonly ILogger<NotificationController> _logger;

        public NotificationController(
            IHubContext<NotificationHub> hubContext,
            ILogger<NotificationController> logger)
        {
            _hubContext = hubContext;
            _logger = logger;
        }

        // ==================== HEALTH SCORE ====================

        /// <summary>
        /// Endpoint llamado por los collectors PowerShell para notificar actualizaciones
        /// </summary>
        [HttpPost("healthscore")]
        [ProducesResponseType(StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status400BadRequest)]
        public async Task<IActionResult> NotifyHealthScore([FromBody] HealthScoreNotification notification)
        {
            try
            {
                if (string.IsNullOrEmpty(notification.CollectorName))
                {
                    return BadRequest(new { error = "CollectorName is required" });
                }

                _logger.LogInformation(
                    "Collector '{Collector}' completó procesamiento de {Count} instancias",
                    notification.CollectorName,
                    notification.InstanceCount
                );

                await _hubContext.Clients.All.SendAsync("HealthScoreUpdated", new
                {
                    notification.CollectorName,
                    notification.Timestamp,
                    notification.InstanceCount
                });

                return Ok(new
                {
                    success = true,
                    message = $"Notificación enviada para {notification.CollectorName}",
                    timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al procesar notificación del collector {Collector}", notification.CollectorName);
                return StatusCode(500, new { error = "Error al procesar notificación", details = ex.Message });
            }
        }

        // ==================== BACKUPS ====================

        /// <summary>
        /// Notificar actualización de backups
        /// </summary>
        [HttpPost("backups")]
        public async Task<IActionResult> NotifyBackups([FromBody] BackupNotification notification)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("BackupsUpdated", new
                {
                    notification.InstanceName,
                    notification.BackupType,
                    notification.BackupTime,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al notificar backup");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==================== ALERTAS ====================

        /// <summary>
        /// Notificar creación de alerta
        /// </summary>
        [HttpPost("alert/created")]
        public async Task<IActionResult> NotifyAlertCreated([FromBody] AlertNotification notification)
        {
            try
            {
                _logger.LogWarning(
                    "Nueva alerta: Instance={Instance}, Type={Type}, Severity={Severity}",
                    notification.InstanceName,
                    notification.AlertType,
                    notification.Severity
                );

                await _hubContext.Clients.All.SendAsync("AlertCreated", new
                {
                    notification.InstanceName,
                    notification.AlertType,
                    notification.Severity,
                    notification.Message,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al notificar alerta");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Notificar resolución de alerta
        /// </summary>
        [HttpPost("alert/resolved")]
        public async Task<IActionResult> NotifyAlertResolved([FromBody] AlertResolvedNotification notification)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("AlertResolved", new
                {
                    notification.InstanceName,
                    notification.AlertType,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al notificar resolución de alerta");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==================== MANTENIMIENTO ====================

        /// <summary>
        /// Notificar inicio de mantenimiento
        /// </summary>
        [HttpPost("maintenance/started")]
        public async Task<IActionResult> NotifyMaintenanceStarted([FromBody] MaintenanceNotification notification)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("MaintenanceStarted", new
                {
                    notification.InstanceName,
                    notification.TaskName,
                    notification.TaskType,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al notificar inicio de mantenimiento");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        /// <summary>
        /// Notificar finalización de mantenimiento
        /// </summary>
        [HttpPost("maintenance/completed")]
        public async Task<IActionResult> NotifyMaintenanceCompleted([FromBody] MaintenanceCompletedNotification notification)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("MaintenanceCompleted", new
                {
                    notification.InstanceName,
                    notification.TaskName,
                    notification.Success,
                    notification.ErrorMessage,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al notificar finalización de mantenimiento");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==================== SISTEMA ====================

        /// <summary>
        /// Notificación genérica del sistema
        /// </summary>
        [HttpPost("system")]
        public async Task<IActionResult> NotifySystem([FromBody] SystemNotification notification)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("SystemNotification", new
                {
                    notification.Title,
                    notification.Message,
                    notification.Type,
                    notification.Duration,
                    Timestamp = DateTime.UtcNow
                });

                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al enviar notificación del sistema");
                return StatusCode(500, new { error = ex.Message });
            }
        }

        // ==================== TEST ====================

        /// <summary>
        /// Endpoint de prueba para verificar conectividad
        /// </summary>
        [HttpGet("test")]
        public async Task<IActionResult> TestNotification()
        {
            await _hubContext.Clients.All.SendAsync("SystemNotification", new
            {
                Title = "Test Notification",
                Message = "SignalR está funcionando correctamente",
                Type = "info",
                Duration = 3000,
                Timestamp = DateTime.UtcNow
            });

            return Ok(new { message = "Test notification sent", timestamp = DateTime.UtcNow });
        }
    }

    // ==================== MODELOS ====================

    public class HealthScoreNotification
    {
        public string CollectorName { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public int InstanceCount { get; set; } = 0;
    }

    public class BackupNotification
    {
        public string InstanceName { get; set; } = string.Empty;
        public string BackupType { get; set; } = string.Empty;
        public DateTime BackupTime { get; set; }
    }

    public class AlertNotification
    {
        public string InstanceName { get; set; } = string.Empty;
        public string AlertType { get; set; } = string.Empty;
        public string Severity { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
    }

    public class AlertResolvedNotification
    {
        public string InstanceName { get; set; } = string.Empty;
        public string AlertType { get; set; } = string.Empty;
    }

    public class MaintenanceNotification
    {
        public string InstanceName { get; set; } = string.Empty;
        public string TaskName { get; set; } = string.Empty;
        public string TaskType { get; set; } = string.Empty;
    }

    public class MaintenanceCompletedNotification
    {
        public string InstanceName { get; set; } = string.Empty;
        public string TaskName { get; set; } = string.Empty;
        public bool Success { get; set; }
        public string? ErrorMessage { get; set; }
    }

    public class SystemNotification
    {
        public string Title { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string Type { get; set; } = "info";
        public int Duration { get; set; } = 4000;
    }
}

