using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

[Table("InventarioJobsSnapshot", Schema = "dbo")]
public class InventarioJobsSnapshot
{
    [Key]
    public int Id { get; set; }

    [MaxLength(255)]
    public string? InstanceName { get; set; }

    [MaxLength(50)]
    public string? Ambiente { get; set; }

    [MaxLength(50)]
    public string? Hosting { get; set; }

    [MaxLength(255)]
    public string? JobName { get; set; }

    public DateTime? JobStart { get; set; }

    public DateTime? JobEnd { get; set; }

    public int? JobDurationSeconds { get; set; }

    [MaxLength(50)]
    public string? JobStatus { get; set; }

    public DateTime? CaptureDate { get; set; }

    public DateTime? InsertedAtUtc { get; set; }
}

