<#
.SYNOPSIS
    Collector de Health Score V2 - Configuración Tempdb y Memoria

.DESCRIPTION
    Recolecta configuración de tempdb (archivos, tamaños, growth, pagelatch)
    y configuración de max server memory
#>

[CmdletBinding()]
param(
    [string]$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/",
    [string]$SqlServer = "SQLNova",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 30,
    [switch]$Debug
)

$ErrorActionPreference = "Continue"
$CollectorName = "Get-ConfigTempdb-ToSQL"
$SnapshotAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-CollectorLog {
    param([string]$Instance, [string]$Level, [string]$Message)
    if ($Debug) {
        Write-Host "[$Level] $Instance : $Message" -ForegroundColor $(switch($Level){"Info"{"Green"}"Warn"{"Yellow"}"Error"{"Red"}default{"White"}})
    }
    try {
        $logQuery = "INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message]) VALUES ('$CollectorName', '$Instance', '$Level', '$($Message.Replace("'", "''"))');"
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $logQuery -ConnectionTimeout 5 -QueryTimeout 5 -ErrorAction SilentlyContinue
    } catch {}
}

$configQuery = @"
SET NOCOUNT ON;

-- ===== TEMPDB =====
DECLARE @Tempdb_Files int = (SELECT COUNT(*) FROM sys.master_files WHERE database_id = 2 AND type = 0);
DECLARE @LogicalCPUs int = (SELECT cpu_count FROM sys.dm_os_sys_info);
DECLARE @Tempdb_Files_Recom int = CASE 
    WHEN @LogicalCPUs <= 4 THEN @LogicalCPUs
    WHEN @LogicalCPUs <= 8 THEN CEILING(@LogicalCPUs / 2.0)
    ELSE 8
END;

-- Variación de tamaños (coefficient of variation)
DECLARE @Tempdb_SizesEqualPct decimal(5,2);
WITH TempdbSizes AS (
    SELECT CAST(size * 8.0 / 1024 AS int) AS SizeMB
    FROM sys.master_files
    WHERE database_id = 2 AND type = 0
)
SELECT @Tempdb_SizesEqualPct = 
    CASE 
        WHEN AVG(SizeMB * 1.0) = 0 THEN 100
        ELSE 100 - (STDEV(SizeMB) * 100.0 / AVG(SizeMB))
    END
FROM TempdbSizes;

-- Growth en MB (no en %)
DECLARE @Tempdb_GrowthMBOnly bit = CASE 
    WHEN EXISTS (
        SELECT 1 FROM sys.master_files 
        WHERE database_id = 2 AND type = 0 AND is_percent_growth = 1
    ) THEN 0 
    ELSE 1 
END;

-- PAGELATCH contention (últimos 5 min)
DECLARE @Tempdb_Pagelatch bit = CASE 
    WHEN EXISTS (
        SELECT 1 
        FROM sys.dm_os_wait_stats
        WHERE wait_type LIKE 'PAGELATCH%'
          AND wait_time_ms > 10000  -- >10s acumulado
    ) THEN 1 
    ELSE 0 
END;

-- Latencia tempdb p95 (últimos 5 min desde stats)
DECLARE @Tempdb_Latency_ms decimal(10,2) = (
    SELECT AVG(
        CASE 
            WHEN num_of_writes > 0 
            THEN io_stall_write_ms * 1.0 / num_of_writes 
            ELSE 0 
        END
    )
    FROM sys.dm_io_virtual_file_stats(2, NULL)
);

-- ===== MEMORIA =====
DECLARE @TotalRAM_GB decimal(10,2) = (
    SELECT CAST(total_physical_memory_kb / 1024.0 / 1024 AS decimal(10,2))
    FROM sys.dm_os_sys_memory
);

DECLARE @MaxServerMemory_GB decimal(10,2) = (
    SELECT CAST(value_in_use AS decimal(10,2)) / 1024
    FROM sys.configurations
    WHERE name = 'max server memory (MB)'
);

-- Recomendado: RAM - 4GB (SO) - 2GB (buffer)
DECLARE @MaxRecomendado_GB decimal(10,2) = GREATEST(@TotalRAM_GB - 6, @TotalRAM_GB * 0.85);

-- ===== RESULTADO =====
SELECT 
    @Tempdb_Files AS Tempdb_Files,
    @Tempdb_Files_Recom AS Tempdb_Files_Recom,
    @Tempdb_SizesEqualPct AS Tempdb_SizesEqualPct,
    @Tempdb_GrowthMBOnly AS Tempdb_GrowthMBOnly,
    @Tempdb_Pagelatch AS Tempdb_Pagelatch,
    @Tempdb_Latency_ms AS Tempdb_Latency_ms,
    @TotalRAM_GB AS TotalRAM_GB,
    @MaxServerMemory_GB AS MaxServerMemory_GB,
    @MaxRecomendado_GB AS MaxRecomendado_GB;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $configData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $configQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($configData) {
                $insertQuery = @"
INSERT INTO dbo.InventarioConfigRecursosSnapshot 
    (Instance, SnapshotAt, Tempdb_Files, Tempdb_Files_Recom, Tempdb_SizesEqualPct, 
     Tempdb_GrowthMBOnly, Tempdb_Pagelatch, Tempdb_Latency_ms, 
     TotalRAM_GB, MaxServerMemory_GB, MaxRecomendado_GB)
VALUES 
    ('$instanceName', '$SnapshotAt', $($configData.Tempdb_Files), $($configData.Tempdb_Files_Recom), 
     $($configData.Tempdb_SizesEqualPct), $($configData.Tempdb_GrowthMBOnly), $($configData.Tempdb_Pagelatch), 
     $($configData.Tempdb_Latency_ms), $($configData.TotalRAM_GB), $($configData.MaxServerMemory_GB), 
     $($configData.MaxRecomendado_GB));
"@
                Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                
                $warnings = @()
                if ($configData.Tempdb_Files -ne $configData.Tempdb_Files_Recom) {
                    $warnings += "Tempdb files=$($configData.Tempdb_Files) (recom=$($configData.Tempdb_Files_Recom))"
                }
                if ($configData.Tempdb_Pagelatch -eq 1) {
                    $warnings += "PAGELATCH!"
                }
                $memDiff = [math]::Abs($configData.MaxServerMemory_GB - $configData.MaxRecomendado_GB)
                if ($memDiff / $configData.MaxRecomendado_GB -gt 0.15) {
                    $warnings += "Max memory desviado (${memDiff}GB diferencia)"
                }
                
                $level = if ($warnings.Count -gt 0) { "Warn" } else { "Info" }
                $msg = if ($warnings.Count -gt 0) { [string]::Join(", ", $warnings) } else { "Config OK" }
                Write-CollectorLog -Instance $instanceName -Level $level -Message $msg
            }
        } catch {
            Write-CollectorLog -Instance $instanceName -Level "Error" -Message "Error: $($_.Exception.Message)"
            Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host "Completado" -ForegroundColor Green
} catch {
    Write-Host "ERROR FATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

