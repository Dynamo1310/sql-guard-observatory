namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para representar un owner de base de datos
/// </summary>
public class DatabaseOwnerDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string DatabaseName { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string? OwnerEmail { get; set; }
    public string? OwnerPhone { get; set; }
    public string? CellTeam { get; set; }
    public string? Department { get; set; }
    public string? ApplicationName { get; set; }
    public string? BusinessCriticality { get; set; }
    public string? Notes { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByUserName { get; set; }
    
    // Info adicional del servidor (si está disponible)
    public string? ServerAmbiente { get; set; }
    public string? SqlVersion { get; set; }
    public string? IsAlwaysOn { get; set; }
    public string? HostingSite { get; set; }
}

/// <summary>
/// Request para crear un owner de base de datos
/// </summary>
public class CreateDatabaseOwnerRequest
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string DatabaseName { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string? OwnerEmail { get; set; }
    public string? OwnerPhone { get; set; }
    public string? CellTeam { get; set; }
    public string? Department { get; set; }
    public string? ApplicationName { get; set; }
    public string? BusinessCriticality { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Request para actualizar un owner de base de datos
/// </summary>
public class UpdateDatabaseOwnerRequest
{
    public string? OwnerName { get; set; }
    public string? OwnerEmail { get; set; }
    public string? OwnerPhone { get; set; }
    public string? CellTeam { get; set; }
    public string? Department { get; set; }
    public string? ApplicationName { get; set; }
    public string? BusinessCriticality { get; set; }
    public string? Notes { get; set; }
    public bool? IsActive { get; set; }
}

/// <summary>
/// Filtros para buscar owners
/// </summary>
public class DatabaseOwnerFilterRequest
{
    public string? ServerName { get; set; }
    public string? DatabaseName { get; set; }
    public string? CellTeam { get; set; }
    public string? OwnerName { get; set; }
    public string? BusinessCriticality { get; set; }
    public bool? IsActive { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 50;
}

/// <summary>
/// Resultado paginado de owners
/// </summary>
public class DatabaseOwnerPagedResult
{
    public List<DatabaseOwnerDto> Items { get; set; } = new();
    public int TotalCount { get; set; }
    public int Page { get; set; }
    public int PageSize { get; set; }
    public int TotalPages { get; set; }
}

/// <summary>
/// DTO para servidor disponible para asignar owner (Knowledge Base)
/// </summary>
public class DatabaseOwnerServerDto
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? Ambiente { get; set; }
    public string? MajorVersion { get; set; }
}

/// <summary>
/// DTO para base de datos disponible para asignar owner
/// </summary>
public class AvailableDatabaseDto
{
    public string DatabaseName { get; set; } = "";
    public string? Status { get; set; }
    public int? DataMB { get; set; }
    public string? RecoveryModel { get; set; }
    public bool HasOwnerAssigned { get; set; }
}

/// <summary>
/// DTO para célula/equipo único
/// </summary>
public class CellTeamDto
{
    public string CellTeam { get; set; } = "";
    public int DatabaseCount { get; set; }
}

/// <summary>
/// Request para buscar owner por servidor/base de datos
/// </summary>
public class FindOwnerRequest
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? DatabaseName { get; set; }
}
