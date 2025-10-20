<#  
    RelevamientoJobsMant.ps1
    - Consulta la API de inventario
    - Por cada instancia, trae los jobs de mantenimiento usando dbatools
    - Inserta los resultados en la tabla de destino
    
    Requisitos: Install-Module dbatools -Scope CurrentUser
#>

# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InventarioJobsSnapshot"
$TimeoutSec  = 90

# ========= VERIFICAR DBATOOLS =========
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Host "dbatools no está instalado. Instalando..." -ForegroundColor Yellow
    try {
        Install-Module dbatools -Scope CurrentUser -Force -AllowClobber
        Write-Host "✓ dbatools instalado correctamente" -ForegroundColor Green
    } catch {
        Write-Error "No se pudo instalar dbatools: $($_.Exception.Message)"
        Write-Host "Ejecuta manualmente: Install-Module dbatools -Scope CurrentUser" -ForegroundColor Yellow
        exit 1
    }
}

Import-Module dbatools -ErrorAction Stop

# TLS y configuración de certificados
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Configurar dbatools para ignorar certificados SSL (versión antigua de dbatools)
Set-DbatoolsConfig -FullName sql.connection.trustcert -Value $true -PassThru | Register-DbatoolsConfig
Set-DbatoolsConfig -FullName sql.connection.encrypt -Value $false -PassThru | Register-DbatoolsConfig

# ========= FUNCIONES =========

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

    Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $createSql -EnableException | Out-Null
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
$allResults = @()
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
        # Obtener agent jobs usando dbatools
        $jobs = Get-DbaAgentJob -SqlInstance $instanceName -EnableException | Where-Object {
            $_.Name -like '*IndexOptimize*' -or 
            $_.Name -like '*DatabaseIntegrityCheck*' -or 
            $_.Name -like '*Actualizacion_estadisticas*' -or
            $_.Name -like '*Actualizacion_estadísticas*' -or
            $_.Name -like '*Actualización_estadisticas*' -or
            $_.Name -like '*Actualización_estadísticas*'
        }
        
        if (-not $jobs -or $jobs.Count -eq 0) {
            Write-Host " - Sin jobs" -ForegroundColor Gray
            $successCount++
            continue
        }
        
        $jobCount = 0
        foreach ($job in $jobs) {
            # Obtener última ejecución del job - ordenar por fecha descendente para obtener la más reciente
            $lastRun = $job | Get-DbaAgentJobHistory -ExcludeJobSteps | 
                       Where-Object { $_.Status -in @('Succeeded', 'Failed') } |
                       Sort-Object RunDate -Descending |
                       Select-Object -First 1
            
            if ($lastRun) {
                # Calcular duración en segundos
                $durationSeconds = $null
                if ($lastRun.RunDuration) {
                    # RunDuration puede venir como TimeSpan o como string en formato hhmmss
                    if ($lastRun.RunDuration -is [TimeSpan]) {
                        $durationSeconds = [int]$lastRun.RunDuration.TotalSeconds
                    } elseif ($lastRun.RunDuration -is [string]) {
                        # Formato: "001234" = 00h 12m 34s
                        $durStr = $lastRun.RunDuration.PadLeft(6, '0')
                        $hours = [int]$durStr.Substring(0, 2)
                        $minutes = [int]$durStr.Substring(2, 2)
                        $seconds = [int]$durStr.Substring(4, 2)
                        $durationSeconds = ($hours * 3600) + ($minutes * 60) + $seconds
                    } else {
                        # Intentar convertir a int directamente
                        try {
                            $durationSeconds = [int]$lastRun.RunDuration
                        } catch {
                            $durationSeconds = $null
                        }
                    }
                }
                
                # Calcular JobEnd
                $jobEnd = $null
                if ($lastRun.RunDate -and $durationSeconds) {
                    $jobEnd = $lastRun.RunDate.AddSeconds($durationSeconds)
                }
                
                $allResults += [PSCustomObject]@{
                    InstanceName       = $instanceName
                    Ambiente           = if ($ambiente) { $ambiente } else { $null }
                    Hosting            = if ($hosting) { $hosting } else { $null }
                    JobName            = $job.Name
                    JobStart           = $lastRun.RunDate
                    JobEnd             = $jobEnd
                    JobDurationSeconds = $durationSeconds
                    JobStatus          = switch ($lastRun.Status) {
                        'Succeeded' { 'Succeeded' }
                        'Failed'    { 'Failed' }
                        'Retry'     { 'Retry' }
                        'Canceled'  { 'Canceled' }
                        default     { $lastRun.Status }
                    }
                    CaptureDate        = $captureTime
                }
                $jobCount++
            }
        }
        
        Write-Host " - $jobCount jobs" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Host " - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        $errorCount++
    }
}

# 5. Insertar todos los datos
if ($allResults.Count -gt 0) {
Write-Host ""
    Write-Host "Insertando $($allResults.Count) registros..." -NoNewline
    try {
        # Usar Write-DbaDataTable de dbatools
        $allResults | Write-DbaDataTable -SqlInstance $SqlServer -Database $SqlDatabase -Table "[$SqlSchema].[$SqlTable]" -AutoCreateTable:$false
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
Write-Host "Total jobs insertados:  $($allResults.Count)" -ForegroundColor Cyan
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
