namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// Request para comparar objetos entre servidores SQL Server
/// </summary>
public class ServerComparisonRequest
{
    public List<string> InstanceNames { get; set; } = new();
}

/// <summary>
/// Respuesta completa de la comparación de servidores
/// </summary>
public class ServerComparisonResponse
{
    public List<ServerObjectsDto> Servers { get; set; } = new();
    public ComparisonSummaryDto Summary { get; set; } = new();
    public List<DuplicateGroupDto> Duplicates { get; set; } = new();
    public DateTime GeneratedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Objetos recolectados de una instancia SQL Server
/// </summary>
public class ServerObjectsDto
{
    public string InstanceName { get; set; } = string.Empty;
    public bool ConnectionSuccess { get; set; }
    public string? ErrorMessage { get; set; }
    public string? SqlVersion { get; set; }
    public List<CompDatabaseInfoDto> Databases { get; set; } = new();
    public List<LoginInfoDto> Logins { get; set; } = new();
    public List<LinkedServerInfoDto> LinkedServers { get; set; } = new();
    public List<AgentJobInfoDto> Jobs { get; set; } = new();
}

/// <summary>
/// Resumen global de la comparación
/// </summary>
public class ComparisonSummaryDto
{
    public int TotalServers { get; set; }
    public int ServersConnected { get; set; }
    public int ServersFailed { get; set; }
    public int TotalDatabases { get; set; }
    public int DuplicateDatabases { get; set; }
    public int TotalLogins { get; set; }
    public int DuplicateLogins { get; set; }
    public int TotalLinkedServers { get; set; }
    public int DuplicateLinkedServers { get; set; }
    public int TotalJobs { get; set; }
    public int DuplicateJobs { get; set; }
}

/// <summary>
/// Grupo de objetos duplicados encontrados en múltiples servidores
/// </summary>
public class DuplicateGroupDto
{
    public string ObjectName { get; set; } = string.Empty;
    public string ObjectType { get; set; } = string.Empty;
    public List<string> FoundInServers { get; set; } = new();
    public int Count { get; set; }
}

/// <summary>
/// Información de una base de datos
/// </summary>
public class CompDatabaseInfoDto
{
    public string Name { get; set; } = string.Empty;
    public string? State { get; set; }
    public string? RecoveryModel { get; set; }
    public string? CompatibilityLevel { get; set; }
    public string? Collation { get; set; }
    public decimal SizeMB { get; set; }
    public DateTime? CreateDate { get; set; }
}

/// <summary>
/// Información de un login de servidor
/// </summary>
public class LoginInfoDto
{
    public string Name { get; set; } = string.Empty;
    public string? Type { get; set; }
    public bool IsDisabled { get; set; }
    public string? DefaultDatabase { get; set; }
    public DateTime? CreateDate { get; set; }
}

/// <summary>
/// Información de un linked server
/// </summary>
public class LinkedServerInfoDto
{
    public string Name { get; set; } = string.Empty;
    public string? Provider { get; set; }
    public string? DataSource { get; set; }
    public string? Product { get; set; }
}

/// <summary>
/// Información de un SQL Agent Job
/// </summary>
public class AgentJobInfoDto
{
    public string Name { get; set; } = string.Empty;
    public bool Enabled { get; set; }
    public string? Description { get; set; }
    public DateTime? CreateDate { get; set; }
    public string? OwnerLoginName { get; set; }
}

/// <summary>
/// DTO de instancia disponible para comparar
/// </summary>
public class ComparisonInstanceDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string NombreInstancia { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public string? MajorVersion { get; set; }
    public string? Edition { get; set; }
}
