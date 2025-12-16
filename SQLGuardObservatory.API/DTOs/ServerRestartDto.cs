namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para mostrar información de una tarea de reinicio
/// </summary>
public class ServerRestartTaskDto
{
    public int Id { get; set; }
    public Guid TaskId { get; set; }
    public List<string> Servers { get; set; } = new();
    public int ServerCount { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string InitiatedByUserId { get; set; } = string.Empty;
    public string? InitiatedByUserName { get; set; }
    public int SuccessCount { get; set; }
    public int FailureCount { get; set; }
    public string? ErrorMessage { get; set; }
    public List<ServerRestartDetailDto> Details { get; set; } = new();
    
    /// <summary>
    /// Duración en segundos
    /// </summary>
    public double? DurationSeconds { get; set; }
}

/// <summary>
/// DTO para detalle de reinicio por servidor
/// </summary>
public class ServerRestartDetailDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string Status { get; set; } = "Pending";
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public string? ErrorMessage { get; set; }
    public string? RestartResult { get; set; }
    public string? PingResult { get; set; }
    public string? ServicioOSResult { get; set; }
    public string? DiscosResult { get; set; }
    public string? ServicioMSSQLSERVERResult { get; set; }
    public string? ServicioSQLSERVERAGENTResult { get; set; }
}

/// <summary>
/// Request para iniciar un reinicio
/// </summary>
public class StartRestartRequest
{
    /// <summary>
    /// Lista de nombres de servidores a reiniciar
    /// </summary>
    public List<string> Servers { get; set; } = new();
}

/// <summary>
/// DTO para un servidor disponible para reiniciar (del inventario)
/// </summary>
public class RestartableServerDto
{
    public string ServerName { get; set; } = string.Empty;
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public string? HostingType { get; set; }
    public string? MajorVersion { get; set; }
    public string? Edition { get; set; }
    public bool IsAlwaysOn { get; set; }
    public bool IsStandalone { get; set; }
    public bool IsConnected { get; set; }
    public DateTime? LastCheckedAt { get; set; }
}

/// <summary>
/// Mensaje de output en tiempo real para SignalR
/// </summary>
public class RestartOutputMessage
{
    public Guid TaskId { get; set; }
    public string Line { get; set; } = string.Empty;
    public string Type { get; set; } = "info"; // info, error, warning, success
    public DateTime Timestamp { get; set; } = DateTime.Now;
    public string? ServerName { get; set; }
}

/// <summary>
/// Mensaje de progreso para SignalR
/// </summary>
public class RestartProgressMessage
{
    public Guid TaskId { get; set; }
    public string CurrentServer { get; set; } = string.Empty;
    public int CurrentIndex { get; set; }
    public int TotalServers { get; set; }
    public string Phase { get; set; } = string.Empty; // Initializing, Restarting, Verifying, Completed
    public int PercentComplete { get; set; }
}

/// <summary>
/// Mensaje de completado para SignalR
/// </summary>
public class RestartCompletedMessage
{
    public Guid TaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public int SuccessCount { get; set; }
    public int FailureCount { get; set; }
    public DateTime CompletedAt { get; set; }
    public double DurationSeconds { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Respuesta al iniciar una tarea de reinicio
/// </summary>
public class StartRestartResponse
{
    public bool Success { get; set; }
    public Guid TaskId { get; set; }
    public string Message { get; set; } = string.Empty;
    public int ServerCount { get; set; }
}

