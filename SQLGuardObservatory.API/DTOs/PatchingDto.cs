namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para el estado de parcheo de un servidor SQL Server
/// </summary>
public class ServerPatchStatusDto
{
    public string ServerName { get; set; } = string.Empty;
    public string InstanceName { get; set; } = string.Empty;
    public string Ambiente { get; set; } = string.Empty;
    public string HostingSite { get; set; } = string.Empty;
    public string MajorVersion { get; set; } = string.Empty;
    public string CurrentBuild { get; set; } = string.Empty;
    public string CurrentCU { get; set; } = string.Empty;
    public string CurrentSP { get; set; } = string.Empty;
    public string KBReference { get; set; } = string.Empty;
    
    // Compliance
    public string RequiredBuild { get; set; } = string.Empty;
    public string RequiredCU { get; set; } = string.Empty;
    
    // Última disponible
    public string LatestBuild { get; set; } = string.Empty;
    public string LatestCU { get; set; } = string.Empty;
    public string LatestKBReference { get; set; } = string.Empty;
    
    // CUs pendientes
    public int PendingCUsForCompliance { get; set; }
    public int PendingCUsForLatest { get; set; }
    
    /// <summary>
    /// Estado: Updated, Compliant, NonCompliant, Outdated, Critical, Error, Unknown
    /// </summary>
    public string PatchStatus { get; set; } = string.Empty;
    
    public bool ConnectionSuccess { get; set; }
    public bool IsDmzServer { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTime? LastChecked { get; set; }
}

/// <summary>
/// DTO para configuración de compliance
/// </summary>
public class PatchComplianceConfigDto
{
    public int Id { get; set; }
    public int ComplianceYear { get; set; } = DateTime.Now.Year;
    public string SqlVersion { get; set; } = string.Empty;
    public string RequiredBuild { get; set; } = string.Empty;
    public string? RequiredCU { get; set; }
    public string? RequiredKB { get; set; }
    public string? Description { get; set; }
    
    // Configuración específica para AWS (solo aplica para SQL 2017+)
    public string? AwsRequiredBuild { get; set; }
    public string? AwsRequiredCU { get; set; }
    public string? AwsRequiredKB { get; set; }
    
    public bool IsActive { get; set; } = true;
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }
}

/// <summary>
/// DTO para referencia de builds disponibles
/// </summary>
public class BuildReferenceDto
{
    public string Version { get; set; } = string.Empty;
    public string? CU { get; set; }
    public string? SP { get; set; }
    public string? KB { get; set; }
    
    public string DisplayName => !string.IsNullOrEmpty(CU) ? $"{CU} ({Version})" : $"{SP} ({Version})";
}

/// <summary>
/// Estructura del archivo JSON de builds de dbatools
/// </summary>
public class BuildReferenceIndex
{
    public DateTime LastUpdated { get; set; }
    public List<BuildEntry> Data { get; set; } = new();
}

/// <summary>
/// Entrada individual de build en el índice
/// </summary>
public class BuildEntry
{
    public string? Version { get; set; }
    public string? Name { get; set; }
    public string? SP { get; set; }
    public string? CU { get; set; }
    public object? KBList { get; set; }
    public string? SupportedUntil { get; set; }
}

/// <summary>
/// DTO interno para el inventario de servidores
/// </summary>
internal class InventoryServerForPatchingDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string local_net_address { get; set; } = string.Empty;
    public string NombreInstancia { get; set; } = string.Empty;
    public string MajorVersion { get; set; } = string.Empty;
    public string ProductLevel { get; set; } = string.Empty;
    public string Edition { get; set; } = string.Empty;
    public string ProductUpdateLevel { get; set; } = string.Empty;
    public string ProductVersion { get; set; } = string.Empty;
    public string ProductUpdateReference { get; set; } = string.Empty;
    public string Collation { get; set; } = string.Empty;
    public string AlwaysOn { get; set; } = string.Empty;
    public string hostingSite { get; set; } = string.Empty;
    public string hostingType { get; set; } = string.Empty;
    public string ambiente { get; set; } = string.Empty;
}

/// <summary>
/// DTO para el resumen de estado de parcheo
/// </summary>
public class PatchingSummaryDto
{
    public int TotalServers { get; set; }
    public int UpdatedCount { get; set; }
    public int CompliantCount { get; set; }
    public int NonCompliantCount { get; set; }
    public int OutdatedCount { get; set; }
    public int CriticalCount { get; set; }
    public int ErrorCount { get; set; }
    public int UnknownCount { get; set; }
    public int TotalPendingCUs { get; set; }
    public int ComplianceRate { get; set; }
    public DateTime LastChecked { get; set; }
}
