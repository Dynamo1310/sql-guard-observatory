<#  
    RelevamientoJobsMant.ps1
    - Consulta la API de inventario
    - Por cada instancia, trae los jobs de mantenimiento (IndexOptimize, DatabaseIntegrityCheck, Actualización_estadísticas)
    - Inserta los resultados en la tabla de destino
#>

# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InventarioJobsSnapshot"
$TimeoutSec  = 90

# TLS
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ========= QUERY SQL =========
$SqlQuery = @"
    SELECT
    JobName = j.name,
    StartTime = CASE 
        WHEN ISDATE(
            STUFF(STUFF(RIGHT('00000000' + CAST(h.run_date AS varchar(8)), 8), 5, 0, '-'), 8, 0, ' ') + ' ' +
            STUFF(STUFF(RIGHT('000000' + CAST(h.run_time AS varchar(6)), 6), 3, 0, ':'), 6, 0, ':')
        ) = 1 
        THEN CONVERT(datetime, 
            STUFF(STUFF(RIGHT('00000000' + CAST(h.run_date AS varchar(8)), 8), 5, 0, '-'), 8, 0, ' ') + ' ' +
            STUFF(STUFF(RIGHT('000000' + CAST(h.run_time AS varchar(6)), 6), 3, 0, ':'), 6, 0, ':')
        )
        ELSE NULL 
    END,
    DurationSeconds = ((h.run_duration/10000)*3600) + ((h.run_duration%10000)/100)*60 + (h.run_duration%100),
    JobStatus = CASE h.run_status
        WHEN 0 THEN 'Failed'
        WHEN 1 THEN 'Succeeded'
        WHEN 2 THEN 'Retry'
        WHEN 3 THEN 'Canceled'
        WHEN 4 THEN 'In progress'
        ELSE CAST(h.run_status AS varchar(10))
    END
FROM msdb.dbo.sysjobs j
INNER JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
WHERE h.step_id = 0
    AND h.instance_id IN (
        SELECT MAX(h2.instance_id)
        FROM msdb.dbo.sysjobhistory h2
        WHERE h2.job_id = j.job_id AND h2.step_id = 0
    )
    AND (
        j.name LIKE '%IndexOptimize%'
        OR j.name LIKE '%DatabaseIntegrityCheck%'
        OR j.name LIKE '%Actualizacion_estadisticas%'
    )
ORDER BY j.name;
"@

# ========= FUNCIONES =========

function Invoke-SqlQuery {
    param(
        [string]$ServerInstance,
        [string]$Database,
        [string]$Query,
        [int]$Timeout = 90
    )
    
    $connStr = "Server=$ServerInstance;Database=$Database;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=$Timeout"
    $conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $Query
    $cmd.CommandTimeout = $Timeout
    
    $dt = New-Object System.Data.DataTable
    try {
        $conn.Open()
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        [void]$adapter.Fill($dt)
    } finally {
        if ($conn.State -ne [System.Data.ConnectionState]::Closed) { 
            $conn.Close() 
        }
        $conn.Dispose()
    }
    
    return $dt
}

function Create-TableIfNotExists {
    $createSql = @"
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = '$SqlTable' AND s.name = '$SqlSchema'
)
BEGIN
    CREATE TABLE [$SqlSchema].[$SqlTable] (
        [Id]                   BIGINT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName]         NVARCHAR(128)  NOT NULL,
        [Ambiente]             NVARCHAR(50)   NULL,
        [Hosting]              NVARCHAR(50)   NULL,
        [JobName]              NVARCHAR(256)  NOT NULL,
        [JobStart]             DATETIME2(0)   NULL,
        [JobEnd]               DATETIME2(0)   NULL,
        [JobDurationSeconds]   INT            NULL,
        [JobStatus]            NVARCHAR(50)   NULL,
        [CaptureDate]          DATETIME2(0)   NOT NULL,
        [InsertedAtUtc]        DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
    
    CREATE INDEX IX_${SqlTable}_Instance_Capture ON [$SqlSchema].[$SqlTable] ([InstanceName], [CaptureDate]);
    CREATE INDEX IX_${SqlTable}_Job_Capture ON [$SqlSchema].[$SqlTable] ([JobName], [CaptureDate]);
END
"@

    Invoke-SqlQuery -ServerInstance $SqlServer -Database $SqlDatabase -Query $createSql -Timeout 120 | Out-Null
}

function Insert-JobData {
    param(
        [System.Data.DataTable]$DataTable
    )
    
    if ($DataTable.Rows.Count -eq 0) {
        return
    }
    
    $connStr = "Server=$SqlServer;Database=$SqlDatabase;Integrated Security=True;TrustServerCertificate=True"
    $bulkCopy = New-Object System.Data.SqlClient.SqlBulkCopy($connStr)
    $bulkCopy.DestinationTableName = "[$SqlSchema].[$SqlTable]"
    $bulkCopy.BatchSize = 5000
    $bulkCopy.BulkCopyTimeout = 300
    
    # Mapeo de columnas
    $DataTable.Columns | ForEach-Object {
        [void]$bulkCopy.ColumnMappings.Add($_.ColumnName, $_.ColumnName)
    }
    
    try {
        $bulkCopy.WriteToServer($DataTable)
    } finally {
        $bulkCopy.Close()
    }
}

function Create-DataTable {
    $dt = New-Object System.Data.DataTable

    # Columnas string
    @("InstanceName", "Ambiente", "Hosting", "JobName", "JobStatus") | ForEach-Object {
        [void]$dt.Columns.Add($_, [string])
    }

    # Columnas datetime
    @("JobStart", "JobEnd", "CaptureDate") | ForEach-Object {
        [void]$dt.Columns.Add($_, [datetime])
    }

    # Columna int
    [void]$dt.Columns.Add("JobDurationSeconds", [int])
    
    return $dt
}

# ========= MAIN =========

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Relevamiento Jobs de Mantenimiento" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener inventario desde API
Write-Host "[1/4] Consultando API..." -ForegroundColor Cyan
try {
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method GET -Headers @{"Accept"="application/json"} -TimeoutSec 60
    Write-Host "      ✓ $($instances.Count) instancias obtenidas" -ForegroundColor Green
} catch {
    Write-Error "Error al consultar la API: $($_.Exception.Message)"
    exit 1
}

# 2. Filtrar instancias (excluir AWS y DMZ)
Write-Host ""
Write-Host "[2/4] Aplicando filtros..." -ForegroundColor Cyan
$instancesFiltered = $instances | Where-Object {
    $hosting = [string]($_.hostingSite)
    $name1 = [string]($_.NombreInstancia)
    $name2 = [string]($_.ServerName)
    
    ($hosting -notmatch '^(?i)aws$') -and 
    ($name1 -notmatch '(?i)DMZ') -and 
    ($name2 -notmatch '(?i)DMZ')
}
Write-Host "      ✓ $($instancesFiltered.Count) instancias a procesar" -ForegroundColor Green

if ($instancesFiltered.Count -eq 0) {
    Write-Warning "No hay instancias para procesar después del filtro"
    exit 0
}

# 3. Crear tabla si no existe
Write-Host ""
Write-Host "[3/4] Verificando tabla destino..." -ForegroundColor Cyan
Create-TableIfNotExists
Write-Host "      ✓ Tabla lista: $SqlServer.$SqlDatabase.$SqlSchema.$SqlTable" -ForegroundColor Green

# 4. Procesar instancias
    Write-Host ""
Write-Host "[4/4] Procesando instancias..." -ForegroundColor Cyan
    Write-Host ""

$captureTime = [datetime]::UtcNow
$dataTable = Create-DataTable
$totalJobs = 0
$successCount = 0
$errorCount = 0

$counter = 0
foreach ($inst in $instancesFiltered) {
    $counter++
    
    $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
    $ambiente = $inst.ambiente
    $hosting = $inst.hostingSite
    
    if (-not $instanceName) {
        Write-Warning "[$counter/$($instancesFiltered.Count)] Instancia sin nombre - omitida"
        $errorCount++
        continue
    }
    
    Write-Host "[$counter/$($instancesFiltered.Count)] $instanceName" -NoNewline
    
    try {
        # Consultar jobs de la instancia
        $jobs = $null
        try {
            $jobs = Invoke-SqlQuery -ServerInstance $instanceName -Database "msdb" -Query $SqlQuery -Timeout $TimeoutSec
        } catch {
            throw "Error al consultar SQL: $($_.Exception.Message)"
        }
        
        if ($null -eq $jobs -or $jobs.Rows.Count -eq 0) {
            Write-Host " - Sin jobs" -ForegroundColor Gray
            $successCount++
            continue
        }
        
        # Agregar filas al DataTable
        foreach ($job in $jobs.Rows) {
            $row = $dataTable.NewRow()
            $row["InstanceName"] = $instanceName
            $row["Ambiente"] = if ($ambiente) { $ambiente } else { [DBNull]::Value }
            $row["Hosting"] = if ($hosting) { $hosting } else { [DBNull]::Value }
            $row["JobName"] = if ($job["JobName"] -ne [DBNull]::Value) { $job["JobName"] } else { [DBNull]::Value }
            
            # JobStart
            $jobStart = $job["StartTime"]
            $row["JobStart"] = if ($jobStart -ne [DBNull]::Value -and $null -ne $jobStart) { $jobStart } else { [DBNull]::Value }
            
            # JobEnd (StartTime + DurationSeconds)
            $jobStartValue = $job["StartTime"]
            $durationValue = $job["DurationSeconds"]
            if ($jobStartValue -ne [DBNull]::Value -and $null -ne $jobStartValue -and 
                $durationValue -ne [DBNull]::Value -and $null -ne $durationValue) {
                try {
                    $row["JobEnd"] = ([datetime]$jobStartValue).AddSeconds([int]$durationValue)
                } catch {
                    $row["JobEnd"] = [DBNull]::Value
                }
            } else {
                $row["JobEnd"] = [DBNull]::Value
            }
            
            # JobDurationSeconds
            $row["JobDurationSeconds"] = if ($durationValue -ne [DBNull]::Value -and $null -ne $durationValue) { $durationValue } else { [DBNull]::Value }
            
            # JobStatus
            $row["JobStatus"] = if ($job["JobStatus"] -ne [DBNull]::Value) { $job["JobStatus"] } else { [DBNull]::Value }
            
            $row["CaptureDate"] = $captureTime
            
            $dataTable.Rows.Add($row)
            $totalJobs++
        }
        
        Write-Host " - $($jobs.Rows.Count) jobs" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host " - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

# 5. Insertar todos los datos
if ($dataTable.Rows.Count -gt 0) {
Write-Host ""
    Write-Host "Insertando $($dataTable.Rows.Count) registros..." -NoNewline
    try {
        Insert-JobData -DataTable $dataTable
        Write-Host " ✓" -ForegroundColor Green
    } catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Error "Error al insertar datos: $($_.Exception.Message)"
    }
}

# 6. Resumen
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " RESUMEN" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Instancias procesadas:  $successCount" -ForegroundColor Green
Write-Host "Instancias con error:   $errorCount" -ForegroundColor $(if ($errorCount -gt 0) {"Red"} else {"Green"})
Write-Host "Total jobs insertados:  $totalJobs" -ForegroundColor Cyan
Write-Host ""
Write-Host "Timestamp: $captureTime" -ForegroundColor Gray
Write-Host ""

if ($errorCount -eq 0) {
    Write-Host "✅ Proceso completado exitosamente" -ForegroundColor Green
} elseif ($successCount -gt 0) {
    Write-Host "⚠️ Proceso completado con algunos errores" -ForegroundColor Yellow
} else {
    Write-Host "❌ Proceso falló" -ForegroundColor Red
}
