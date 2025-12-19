namespace SQLGuardObservatory.API.DTOs;

public class ProductionAlertConfigDto
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsEnabled { get; set; }
    public int CheckIntervalMinutes { get; set; }
    public int AlertIntervalMinutes { get; set; }
    /// <summary>
    /// Cantidad de chequeos fallidos consecutivos requeridos antes de enviar la primera alerta
    /// </summary>
    public int FailedChecksBeforeAlert { get; set; } = 1;
    public List<string> Recipients { get; set; } = new();
    public List<string> Ambientes { get; set; } = new() { "Produccion" };
    public DateTime? LastRunAt { get; set; }
    public DateTime? LastAlertSentAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

public class CreateProductionAlertRequest
{
    public string Name { get; set; } = "Alerta de Servidores Caídos";
    public string? Description { get; set; }
    public int CheckIntervalMinutes { get; set; } = 1;
    public int AlertIntervalMinutes { get; set; } = 15;
    public int FailedChecksBeforeAlert { get; set; } = 1;
    public List<string> Recipients { get; set; } = new();
    public List<string> Ambientes { get; set; } = new() { "Produccion" };
}

public class UpdateProductionAlertRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? IsEnabled { get; set; }
    public int? CheckIntervalMinutes { get; set; }
    public int? AlertIntervalMinutes { get; set; }
    public int? FailedChecksBeforeAlert { get; set; }
    public List<string>? Recipients { get; set; }
    public List<string>? Ambientes { get; set; }
}

public class ProductionAlertHistoryDto
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    public DateTime SentAt { get; set; }
    public int RecipientCount { get; set; }
    public List<string> InstancesDown { get; set; } = new();
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}

public class InstanceConnectionStatusDto
{
    public string InstanceName { get; set; } = "";
    public string? ServerName { get; set; }
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public bool IsConnected { get; set; }
    public DateTime? LastCheckedAt { get; set; }
    public string? LastError { get; set; }
    public DateTime? DownSince { get; set; }
    /// <summary>
    /// Contador de chequeos fallidos consecutivos
    /// </summary>
    public int ConsecutiveFailures { get; set; } = 0;
}

public class InventoryInstanceDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string local_net_address { get; set; } = "";
    public string NombreInstancia { get; set; } = "";
    public string MajorVersion { get; set; } = "";
    public string ProductLevel { get; set; } = "";
    public string Edition { get; set; } = "";
    public string ProductUpdateLevel { get; set; } = "";
    public string ProductVersion { get; set; } = "";
    public string ProductUpdateReference { get; set; } = "";
    public string Collation { get; set; } = "";
    public string AlwaysOn { get; set; } = "";
    public string hostingSite { get; set; } = "";
    public string hostingType { get; set; } = "";
    public string ambiente { get; set; } = "";
}

