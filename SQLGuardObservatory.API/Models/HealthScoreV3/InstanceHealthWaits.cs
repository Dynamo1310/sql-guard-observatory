using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3
{
    /// <summary>
    /// Métricas de Wait Statistics y Blocking para Health Score v3.1
    /// Tabla: InstanceHealth_Waits
    /// Frecuencia: Cada 5 minutos
    /// </summary>
    [Table("InstanceHealth_Waits")]
    public class InstanceHealthWaits
    {
        [Key]
        public long Id { get; set; }

        [Required]
        [StringLength(255)]
        public string InstanceName { get; set; } = string.Empty;

        [StringLength(50)]
        public string? Ambiente { get; set; }

        [StringLength(50)]
        public string? HostingSite { get; set; }

        [StringLength(50)]
        public string? SqlVersion { get; set; }

        public DateTime CollectedAtUtc { get; set; }

        // ===== BLOCKING =====
        public int BlockedSessionCount { get; set; }
        public int MaxBlockTimeSeconds { get; set; }
        
        [StringLength(200)]
        public string? BlockerSessionIds { get; set; }

        // ===== TOP 5 WAIT TYPES =====
        [StringLength(100)]
        public string? TopWait1Type { get; set; }
        public long TopWait1Count { get; set; }
        public long TopWait1Ms { get; set; }

        [StringLength(100)]
        public string? TopWait2Type { get; set; }
        public long TopWait2Count { get; set; }
        public long TopWait2Ms { get; set; }

        [StringLength(100)]
        public string? TopWait3Type { get; set; }
        public long TopWait3Count { get; set; }
        public long TopWait3Ms { get; set; }

        [StringLength(100)]
        public string? TopWait4Type { get; set; }
        public long TopWait4Count { get; set; }
        public long TopWait4Ms { get; set; }

        [StringLength(100)]
        public string? TopWait5Type { get; set; }
        public long TopWait5Count { get; set; }
        public long TopWait5Ms { get; set; }

        // ===== I/O WAITS =====
        public long PageIOLatchWaitCount { get; set; }
        public long PageIOLatchWaitMs { get; set; }
        public long WriteLogWaitCount { get; set; }
        public long WriteLogWaitMs { get; set; }
        public long AsyncIOCompletionCount { get; set; }
        public long AsyncIOCompletionMs { get; set; }

        // ===== MEMORY WAITS =====
        public long ResourceSemaphoreWaitCount { get; set; }
        public long ResourceSemaphoreWaitMs { get; set; }

        // ===== CPU/PARALLELISM WAITS =====
        public long CXPacketWaitCount { get; set; }
        public long CXPacketWaitMs { get; set; }
        public long CXConsumerWaitCount { get; set; }
        public long CXConsumerWaitMs { get; set; }
        public long SOSSchedulerYieldCount { get; set; }
        public long SOSSchedulerYieldMs { get; set; }
        public long ThreadPoolWaitCount { get; set; }
        public long ThreadPoolWaitMs { get; set; }

        // ===== LOCK WAITS =====
        public long LockWaitCount { get; set; }
        public long LockWaitMs { get; set; }
        
        // ===== NETWORK WAITS (v3.1) =====
        public long NetworkWaitCount { get; set; }
        public long NetworkWaitMs { get; set; }

        // ===== CONFIG =====
        public int? MaxDOP { get; set; }

        // ===== TOTALS =====
        public long TotalWaits { get; set; }
        public long TotalWaitMs { get; set; }
        public long TotalSignalWaitMs { get; set; }

        // ===== COMPUTED PROPERTIES =====
        
        /// <summary>
        /// Porcentaje de PAGEIOLATCH waits sobre el total
        /// </summary>
        [NotMapped]
        public decimal PageIOLatchPct => TotalWaitMs > 0 
            ? Math.Round((decimal)PageIOLatchWaitMs / TotalWaitMs * 100, 1) 
            : 0;

        /// <summary>
        /// Porcentaje de CXPACKET waits sobre el total
        /// </summary>
        [NotMapped]
        public decimal CXPacketPct => TotalWaitMs > 0 
            ? Math.Round((decimal)CXPacketWaitMs / TotalWaitMs * 100, 1) 
            : 0;

        /// <summary>
        /// Porcentaje de RESOURCE_SEMAPHORE waits sobre el total
        /// </summary>
        [NotMapped]
        public decimal ResourceSemaphorePct => TotalWaitMs > 0 
            ? Math.Round((decimal)ResourceSemaphoreWaitMs / TotalWaitMs * 100, 1) 
            : 0;

        /// <summary>
        /// Porcentaje de WRITELOG waits sobre el total
        /// </summary>
        [NotMapped]
        public decimal WriteLogPct => TotalWaitMs > 0 
            ? Math.Round((decimal)WriteLogWaitMs / TotalWaitMs * 100, 1) 
            : 0;

        /// <summary>
        /// Nivel de blocking: None, Low, Medium, High, Critical
        /// </summary>
        [NotMapped]
        public string BlockingLevel
        {
            get
            {
                if (BlockedSessionCount == 0) return "None";
                if (BlockedSessionCount <= 3) return "Low";
                if (BlockedSessionCount <= 10) return "Medium";
                if (BlockedSessionCount <= 20) return "High";
                return "Critical";
            }
        }

        /// <summary>
        /// Indica si hay blocking activo
        /// </summary>
        [NotMapped]
        public bool HasBlocking => BlockedSessionCount > 0;

        /// <summary>
        /// Indica si hay blocking severo (>10 sesiones o >5 minutos)
        /// </summary>
        [NotMapped]
        public bool HasSevereBlocking => BlockedSessionCount > 10 || MaxBlockTimeSeconds > 300;
    }
}

