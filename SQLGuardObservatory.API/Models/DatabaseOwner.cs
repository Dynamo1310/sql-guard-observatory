using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Knowledge Base: Owners de bases de datos
/// </summary>
public class DatabaseOwner
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre del servidor
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;

    /// <summary>
    /// Nombre de la instancia (opcional)
    /// </summary>
    [MaxLength(255)]
    public string? InstanceName { get; set; }

    /// <summary>
    /// Nombre de la base de datos
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string DatabaseName { get; set; } = string.Empty;

    /// <summary>
    /// Nombre del owner responsable
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string OwnerName { get; set; } = string.Empty;

    /// <summary>
    /// Email del owner
    /// </summary>
    [MaxLength(256)]
    public string? OwnerEmail { get; set; }

    /// <summary>
    /// Teléfono del owner
    /// </summary>
    [MaxLength(50)]
    public string? OwnerPhone { get; set; }

    /// <summary>
    /// Célula/equipo al que pertenece
    /// </summary>
    [MaxLength(100)]
    public string? CellTeam { get; set; }

    /// <summary>
    /// Departamento
    /// </summary>
    [MaxLength(100)]
    public string? Department { get; set; }

    /// <summary>
    /// Nombre de la aplicación que usa la base de datos
    /// </summary>
    [MaxLength(256)]
    public string? ApplicationName { get; set; }

    /// <summary>
    /// Criticidad del negocio: Alta, Media, Baja
    /// </summary>
    [MaxLength(20)]
    public string? BusinessCriticality { get; set; }

    /// <summary>
    /// Notas adicionales
    /// </summary>
    [MaxLength(500)]
    public string? Notes { get; set; }

    /// <summary>
    /// Si el registro está activo
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? CreatedByUserName { get; set; }

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    [MaxLength(256)]
    public string? UpdatedByUserName { get; set; }
}

/// <summary>
/// Criticidad de negocio
/// </summary>
public static class BusinessCriticalityLevel
{
    public const string Alta = "Alta";
    public const string Media = "Media";
    public const string Baja = "Baja";

    public static readonly string[] AllLevels = new[] { Alta, Media, Baja };
}
