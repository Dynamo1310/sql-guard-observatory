namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para representar un servidor operacional
/// </summary>
public class OperationalServerDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? Description { get; set; }
    public string? Ambiente { get; set; }
    public bool IsFromInventory { get; set; }
    public bool Enabled { get; set; }
    public bool EnabledForRestart { get; set; }
    public bool EnabledForFailover { get; set; }
    public bool EnabledForPatching { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByUserName { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// DTO para crear un nuevo servidor operacional
/// </summary>
public class CreateOperationalServerRequest
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? Description { get; set; }
    public string? Ambiente { get; set; }
    public bool IsFromInventory { get; set; } = true;
    public bool EnabledForRestart { get; set; } = true;
    public bool EnabledForFailover { get; set; } = false;
    public bool EnabledForPatching { get; set; } = false;
    public string? Notes { get; set; }
}

/// <summary>
/// DTO para actualizar un servidor operacional
/// </summary>
public class UpdateOperationalServerRequest
{
    public string? Description { get; set; }
    public string? Ambiente { get; set; }
    public bool Enabled { get; set; }
    public bool EnabledForRestart { get; set; }
    public bool EnabledForFailover { get; set; }
    public bool EnabledForPatching { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// DTO para importar múltiples servidores desde el inventario
/// </summary>
public class ImportServersFromInventoryRequest
{
    public List<string> ServerNames { get; set; } = new();
}

/// <summary>
/// Respuesta de importación de servidores
/// </summary>
public class ImportServersResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
    public int ImportedCount { get; set; }
    public int SkippedCount { get; set; }
    public List<string> Errors { get; set; } = new();
}

/// <summary>
/// DTO de servidor del inventario (para mostrar disponibles para agregar)
/// </summary>
public class InventoryServerInfoDto
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? Ambiente { get; set; }
    public string? MajorVersion { get; set; }
    public string? Edition { get; set; }
    public bool IsAlwaysOn { get; set; }
    public bool AlreadyAdded { get; set; }
}

/// <summary>
/// DTO para auditoría de cambios
/// </summary>
public class OperationalServerAuditDto
{
    public int Id { get; set; }
    public int OperationalServerId { get; set; }
    public string ServerName { get; set; } = "";
    public string Action { get; set; } = "";
    public DateTime ChangedAt { get; set; }
    public string? ChangedByUserName { get; set; }
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }
}




