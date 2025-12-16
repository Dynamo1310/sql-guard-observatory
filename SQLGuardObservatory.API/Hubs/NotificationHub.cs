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

        // ==================== SERVER RESTART ====================

        /// <summary>
        /// Unirse al grupo de una tarea de reinicio para recibir actualizaciones en tiempo real
        /// </summary>
        public async Task JoinRestartTaskGroup(string taskId)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"restart_{taskId}");
            _logger.LogInformation("Cliente {ConnectionId} se unió al grupo de reinicio: restart_{TaskId}", Context.ConnectionId, taskId);
        }

        /// <summary>
        /// Salir del grupo de una tarea de reinicio
        /// </summary>
        public async Task LeaveRestartTaskGroup(string taskId)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"restart_{taskId}");
            _logger.LogInformation("Cliente {ConnectionId} salió del grupo de reinicio: restart_{TaskId}", Context.ConnectionId, taskId);
        }

        /// <summary>
        /// Enviar línea de output del script de reinicio
        /// </summary>
        public async Task SendRestartOutput(string taskId, string line, string type, string? serverName = null)
        {
            await Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
            {
                TaskId = taskId,
                Line = line,
                Type = type, // info, error, warning, success
                ServerName = serverName,
                Timestamp = DateTime.Now
            });
        }

        /// <summary>
        /// Enviar actualización de progreso del reinicio
        /// </summary>
        public async Task SendRestartProgress(string taskId, string currentServer, int currentIndex, int totalServers, string phase)
        {
            var percentComplete = totalServers > 0 ? (int)((double)currentIndex / totalServers * 100) : 0;
            
            await Clients.Group($"restart_{taskId}").SendAsync("RestartProgress", new
            {
                TaskId = taskId,
                CurrentServer = currentServer,
                CurrentIndex = currentIndex,
                TotalServers = totalServers,
                Phase = phase, // Initializing, Restarting, Verifying, Completed
                PercentComplete = percentComplete,
                Timestamp = DateTime.Now
            });
        }

        /// <summary>
        /// Notificar que la tarea de reinicio ha completado
        /// </summary>
        public async Task SendRestartCompleted(string taskId, string status, int successCount, int failureCount, double durationSeconds, string? errorMessage = null)
        {
            _logger.LogInformation(
                "Tarea de reinicio completada: TaskId={TaskId}, Status={Status}, Success={Success}, Failures={Failures}",
                taskId, status, successCount, failureCount
            );

            await Clients.Group($"restart_{taskId}").SendAsync("RestartCompleted", new
            {
                TaskId = taskId,
                Status = status,
                SuccessCount = successCount,
                FailureCount = failureCount,
                CompletedAt = DateTime.Now,
                DurationSeconds = durationSeconds,
                ErrorMessage = errorMessage
            });

            // También notificar globalmente
            await Clients.All.SendAsync("ServerRestartTaskCompleted", new
            {
                TaskId = taskId,
                Status = status,
                SuccessCount = successCount,
                FailureCount = failureCount
            });
        }

        /// <summary>
        /// Notificar error en la tarea de reinicio
        /// </summary>
        public async Task SendRestartError(string taskId, string errorMessage, string? serverName = null)
        {
            _logger.LogError("Error en tarea de reinicio {TaskId}: {Error}", taskId, errorMessage);

            await Clients.Group($"restart_{taskId}").SendAsync("RestartError", new
            {
                TaskId = taskId,
                ErrorMessage = errorMessage,
                ServerName = serverName,
                Timestamp = DateTime.Now
            });
        }

        /// <summary>
        /// Notificar actualización de estado de un servidor específico
        /// </summary>
        public async Task SendServerStatusUpdate(string taskId, string serverName, string status, string? phase = null)
        {
            await Clients.Group($"restart_{taskId}").SendAsync("ServerStatusUpdate", new
            {
                TaskId = taskId,
                ServerName = serverName,
                Status = status, // Pending, Restarting, Success, Failed, Skipped
                Phase = phase,
                Timestamp = DateTime.Now
            });
        }
    }
}

