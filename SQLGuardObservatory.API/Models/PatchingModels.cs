using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración del build compliance requerido por versión de SQL Server
/// </summary>
[Table("PatchComplianceConfig")]
public class PatchComplianceConfig
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Año del plan de compliance (ej: 2025, 2026)
    /// </summary>
    [Required]
    public int ComplianceYear { get; set; } = DateTime.Now.Year;
    
    /// <summary>
    /// Versión mayor de SQL Server (ej: "2016", "2017", "2019", "2022")
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string SqlVersion { get; set; } = string.Empty;
    
    /// <summary>
    /// Build mínimo requerido para estar en compliance (ej: "15.0.4355.3")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string RequiredBuild { get; set; } = string.Empty;
    
    /// <summary>
    /// CU/SP requerido para compliance (ej: "CU28", "SP3")
    /// </summary>
    [MaxLength(20)]
    public string? RequiredCU { get; set; }
    
    /// <summary>
    /// Referencia KB del parche requerido
    /// </summary>
    [MaxLength(20)]
    public string? RequiredKB { get; set; }
    
    /// <summary>
    /// Descripción o notas sobre este requisito
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }
    
    /// <summary>
    /// Build mínimo requerido para servidores AWS (opcional, solo aplica para 2017+)
    /// Si está vacío, se usa RequiredBuild
    /// </summary>
    [MaxLength(50)]
    public string? AwsRequiredBuild { get; set; }
    
    /// <summary>
    /// CU/SP requerido para servidores AWS
    /// </summary>
    [MaxLength(20)]
    public string? AwsRequiredCU { get; set; }
    
    /// <summary>
    /// Referencia KB del parche requerido para AWS
    /// </summary>
    [MaxLength(20)]
    public string? AwsRequiredKB { get; set; }
    
    /// <summary>
    /// Si esta configuración está activa
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.Now;
    
    /// <summary>
    /// Usuario que actualizó la configuración
    /// </summary>
    [MaxLength(100)]
    public string? UpdatedBy { get; set; }
}

/// <summary>
/// Cache del estado de parcheo de cada servidor
/// </summary>
[Table("ServerPatchStatusCache")]
public class ServerPatchStatusCache
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre del servidor
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string ServerName { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre de la instancia SQL
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string InstanceName { get; set; } = string.Empty;
    
    /// <summary>
    /// Ambiente (Produccion, Testing, Desarrollo)
    /// </summary>
    [MaxLength(50)]
    public string? Ambiente { get; set; }
    
    /// <summary>
    /// Hosting site (Onpremise, Azure, etc)
    /// </summary>
    [MaxLength(50)]
    public string? HostingSite { get; set; }
    
    /// <summary>
    /// Versión mayor de SQL Server (2016, 2017, 2019, 2022)
    /// </summary>
    [MaxLength(20)]
    public string? MajorVersion { get; set; }
    
    /// <summary>
    /// Build actual del servidor (ej: 15.0.4355.3)
    /// </summary>
    [MaxLength(50)]
    public string? CurrentBuild { get; set; }
    
    /// <summary>
    /// CU/SP actual del servidor
    /// </summary>
    [MaxLength(50)]
    public string? CurrentCU { get; set; }
    
    /// <summary>
    /// SP actual del servidor
    /// </summary>
    [MaxLength(50)]
    public string? CurrentSP { get; set; }
    
    /// <summary>
    /// Referencia KB del parche actual
    /// </summary>
    [MaxLength(50)]
    public string? KBReference { get; set; }
    
    /// <summary>
    /// Build requerido para compliance (de la configuración)
    /// </summary>
    [MaxLength(50)]
    public string? RequiredBuild { get; set; }
    
    /// <summary>
    /// CU requerido para compliance
    /// </summary>
    [MaxLength(50)]
    public string? RequiredCU { get; set; }
    
    /// <summary>
    /// Última CU disponible según el índice de builds
    /// </summary>
    [MaxLength(50)]
    public string? LatestBuild { get; set; }
    
    /// <summary>
    /// Última CU disponible
    /// </summary>
    [MaxLength(50)]
    public string? LatestCU { get; set; }
    
    /// <summary>
    /// KB de la última actualización disponible
    /// </summary>
    [MaxLength(50)]
    public string? LatestKBReference { get; set; }
    
    /// <summary>
    /// Cantidad de CUs pendientes para compliance
    /// </summary>
    public int PendingCUsForCompliance { get; set; }
    
    /// <summary>
    /// Cantidad de CUs pendientes para última versión
    /// </summary>
    public int PendingCUsForLatest { get; set; }
    
    /// <summary>
    /// Estado de parcheo: Compliant, NonCompliant, Updated, Outdated, Error, Unknown
    /// </summary>
    [MaxLength(20)]
    public string PatchStatus { get; set; } = "Unknown";
    
    /// <summary>
    /// Si la conexión al servidor fue exitosa
    /// </summary>
    public bool ConnectionSuccess { get; set; }
    
    /// <summary>
    /// Si es servidor DMZ (datos del inventario)
    /// </summary>
    public bool IsDmzServer { get; set; }
    
    /// <summary>
    /// Mensaje de error si hubo problemas
    /// </summary>
    [MaxLength(500)]
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// Última vez que se verificó el servidor
    /// </summary>
    public DateTime LastChecked { get; set; } = DateTime.Now;
    
    /// <summary>
    /// Fecha de creación del registro
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.Now;
}

