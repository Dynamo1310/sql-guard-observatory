using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3
{
    [Table("InstanceHealth_LogChain", Schema = "dbo")]
    public class InstanceHealthLogChain
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int Id { get; set; }

        [Required]
        [MaxLength(255)]
        public string InstanceName { get; set; } = string.Empty;

        [MaxLength(50)]
        public string? Ambiente { get; set; }

        [MaxLength(50)]
        public string? HostingSite { get; set; }

        [MaxLength(100)]
        public string? SqlVersion { get; set; }

        [Required]
        public DateTime CollectedAtUtc { get; set; }

        // Métricas
        public int BrokenChainCount { get; set; }
        public int FullDBsWithoutLogBackup { get; set; }
        public int MaxHoursSinceLogBackup { get; set; }
        public string? LogChainDetails { get; set; }  // JSON
    }
}

