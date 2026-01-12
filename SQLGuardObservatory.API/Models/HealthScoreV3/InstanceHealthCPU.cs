using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_CPU", Schema = "dbo")]
public class InstanceHealthCPU
{
    [Key]
    public long Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string InstanceName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Ambiente { get; set; }
    
    [MaxLength(50)]
    public string? HostingSite { get; set; }
    
    [MaxLength(50)]
    public string? SqlVersion { get; set; }
    
    public DateTime CollectedAtUtc { get; set; }
    
    // Métricas de CPU básicas
    public int SQLProcessUtilization { get; set; }
    public int SystemIdleProcess { get; set; }
    public int OtherProcessUtilization { get; set; }
    public int RunnableTasks { get; set; }
    public int PendingDiskIOCount { get; set; }
    public int AvgCPUPercentLast10Min { get; set; }
    public int P95CPUPercent { get; set; }
    
    // Métricas de Scheduler Pressure (v3.1)
    public decimal AvgRunnableTasksPerScheduler { get; set; }
    public int MaxRunnableTasksOnScheduler { get; set; }
    public int SchedulerCount { get; set; }
    
    // Métricas de Worker Threads (v3.1)
    public int MaxWorkerCount { get; set; }
    public int ActiveWorkers { get; set; }
    public int TotalWorkers { get; set; }
    public decimal WorkerThreadUsagePct { get; set; }
    
    // Métricas de Signal Waits - indica CPU pressure (v3.1)
    public decimal SignalWaitPct { get; set; }
    public long TotalSignalWaitMs { get; set; }
}

