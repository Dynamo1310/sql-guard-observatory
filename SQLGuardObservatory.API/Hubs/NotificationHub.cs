using Microsoft.AspNetCore.SignalR;

namespace SQLGuardObservatory.API.Hubs
{
    /// <summary>
    /// SignalR Hub global para notificaciones en tiempo real de toda la aplicación
    /// </summary>
    public class NotificationHub : Hub
    {
        private readonly ILogger<NotificationHub> _logger;

        public NotificationHub(ILogger<NotificationHub> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Método llamado cuando un cliente se conecta
        /// </summary>
        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation("Cliente conectado al Notification Hub: {ConnectionId}", Context.ConnectionId);
            await base.OnConnectedAsync();
        }

        /// <summary>
        /// Método llamado cuando un cliente se desconecta
        /// </summary>
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation("Cliente desconectado del Notification Hub: {ConnectionId}", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
        }

        // ==================== HEALTH SCORE ====================

        /// <summary>
        /// Notifica que hay nuevos datos de HealthScore disponibles
        /// </summary>
        public async Task NotifyHealthScoreUpdate(string collectorName, DateTime timestamp, int instanceCount = 0)
        {
            _logger.LogInformation(
                "Notificando actualización de HealthScore: Collector={Collector}, Instances={Count}",
                collectorName,
                instanceCount
            );

            await Clients.All.SendAsync("HealthScoreUpdated", new
            {
                CollectorName = collectorName,
                Timestamp = timestamp,
                InstanceCount = instanceCount
            });
        }

        /// <summary>
        /// Notifica actualización de una instancia específica
        /// </summary>
        public async Task NotifyInstanceHealthUpdate(string instanceName, int healthScore, string healthStatus)
        {
            await Clients.All.SendAsync("InstanceHealthUpdated", new
            {
                InstanceName = instanceName,
                HealthScore = healthScore,
                HealthStatus = healthStatus,
                Timestamp = DateTime.UtcNow
            });
        }

        // ==================== BACKUPS ====================

        /// <summary>
        /// Notifica actualización de backups
        /// </summary>
        public async Task NotifyBackupsUpdate(string instanceName, string backupType, DateTime backupTime)
        {
            await Clients.All.SendAsync("BackupsUpdated", new
            {
                InstanceName = instanceName,
                BackupType = backupType,
                BackupTime = backupTime,
                Timestamp = DateTime.UtcNow
            });
        }

        // ==================== ALERTAS ====================

        /// <summary>
        /// Notifica creación de una nueva alerta
        /// </summary>
        public async Task NotifyAlertCreated(string instanceName, string alertType, string severity, string message)
        {
            _logger.LogWarning(
                "Nueva alerta: Instance={Instance}, Type={Type}, Severity={Severity}",
                instanceName,
                alertType,
                severity
            );

            await Clients.All.SendAsync("AlertCreated", new
            {
                InstanceName = instanceName,
                AlertType = alertType,
                Severity = severity,
                Message = message,
                Timestamp = DateTime.UtcNow
            });
        }

        /// <summary>
        /// Notifica resolución de una alerta
        /// </summary>
        public async Task NotifyAlertResolved(string instanceName, string alertType)
        {
            await Clients.All.SendAsync("AlertResolved", new
            {
                InstanceName = instanceName,
                AlertType = alertType,
                Timestamp = DateTime.UtcNow
            });
        }

        // ==================== MANTENIMIENTO ====================

        /// <summary>
        /// Notifica inicio de tarea de mantenimiento
        /// </summary>
        public async Task NotifyMaintenanceStarted(string instanceName, string taskName, string taskType)
        {
            await Clients.All.SendAsync("MaintenanceStarted", new
            {
                InstanceName = instanceName,
                TaskName = taskName,
                TaskType = taskType,
                Timestamp = DateTime.UtcNow
            });
        }

        /// <summary>
        /// Notifica finalización de tarea de mantenimiento
        /// </summary>
        public async Task NotifyMaintenanceCompleted(string instanceName, string taskName, bool success, string? errorMessage = null)
        {
            await Clients.All.SendAsync("MaintenanceCompleted", new
            {
                InstanceName = instanceName,
                TaskName = taskName,
                Success = success,
                ErrorMessage = errorMessage,
                Timestamp = DateTime.UtcNow
            });
        }

        // ==================== SISTEMA ====================

        /// <summary>
        /// Notificación genérica del sistema
        /// </summary>
        public async Task NotifySystem(string title, string message, string type = "info", int duration = 4000)
        {
            await Clients.All.SendAsync("SystemNotification", new
            {
                Title = title,
                Message = message,
                Type = type,
                Duration = duration,
                Timestamp = DateTime.UtcNow
            });
        }

        // ==================== GRUPOS (para suscripciones específicas) ====================

        /// <summary>
        /// Unirse a un grupo para recibir notificaciones específicas de una instancia
        /// </summary>
        public async Task JoinInstanceGroup(string instanceName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"instance_{instanceName}");
            _logger.LogInformation("Cliente {ConnectionId} se unió al grupo: instance_{Instance}", Context.ConnectionId, instanceName);
        }

        /// <summary>
        /// Salir de un grupo de instancia
        /// </summary>
        public async Task LeaveInstanceGroup(string instanceName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"instance_{instanceName}");
            _logger.LogInformation("Cliente {ConnectionId} salió del grupo: instance_{Instance}", Context.ConnectionId, instanceName);
        }

        /// <summary>
        /// Notificar solo a clientes suscritos a una instancia específica
        /// </summary>
        public async Task NotifyInstanceGroupUpdate(string instanceName, object data)
        {
            await Clients.Group($"instance_{instanceName}").SendAsync("InstanceUpdate", data);
        }
    }
}

