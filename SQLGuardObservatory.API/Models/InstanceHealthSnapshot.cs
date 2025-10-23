using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models
{
    [Table("InstanceHealthSnapshot", Schema = "dbo")]
    public class InstanceHealthSnapshot
    {
        [Key]
        [Column(Order = 0)]
        [MaxLength(200)]
        public string InstanceName { get; set; } = string.Empty;

        [Key]
        [Column(Order = 1)]
        public DateTime GeneratedAtUtc { get; set; }

        [MaxLength(50)]
        public string? Ambiente { get; set; }

        [MaxLength(50)]
        public string? HostingSite { get; set; }

        [MaxLength(100)]
        public string? Version { get; set; }

        public bool ConnectSuccess { get; set; }

        public int? ConnectLatencyMs { get; set; }

        public string? BackupJson { get; set; }

        public string? MaintenanceJson { get; set; }

        public string? DiskJson { get; set; }

        public string? ResourceJson { get; set; }

        public string? AlwaysOnJson { get; set; }

        public string? ErrorlogJson { get; set; }

        public int HealthScore { get; set; }

        [MaxLength(10)]
        public string HealthStatus { get; set; } = string.Empty;
    }
}

