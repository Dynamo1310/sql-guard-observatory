using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3
{
    [Table("InstanceHealth_DatabaseStates", Schema = "dbo")]
    public class InstanceHealthDatabaseStates
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
        public int OfflineCount { get; set; }
        public int SuspectCount { get; set; }
        public int EmergencyCount { get; set; }
        public int RecoveryPendingCount { get; set; }
        public int SingleUserCount { get; set; }
        public int RestoringCount { get; set; }
        public int SuspectPageCount { get; set; }
        public string? DatabaseStateDetails { get; set; }  // JSON
    }
}

