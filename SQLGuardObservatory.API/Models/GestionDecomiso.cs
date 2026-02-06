using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad EF Core para la tabla [SQLNova].[dbo].[GestionDecomiso]
/// Almacena el estado de gestión del decomiso de bases de datos sin actividad
/// </summary>
[Table("GestionDecomiso", Schema = "dbo")]
public class GestionDecomiso
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    [Required]
    [MaxLength(128)]
    public string ServerName { get; set; } = string.Empty;

    [Required]
    [MaxLength(128)]
    public string DBName { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string Estado { get; set; } = "Pendiente";

    [MaxLength(100)]
    public string? TicketJira { get; set; }

    [MaxLength(255)]
    public string? Responsable { get; set; }

    [MaxLength(500)]
    public string? Observaciones { get; set; }

    public DateTime FechaCreacion { get; set; } = DateTime.Now;

    public DateTime FechaModificacion { get; set; } = DateTime.Now;
}
