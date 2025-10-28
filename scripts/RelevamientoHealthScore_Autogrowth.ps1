<#
.SYNOPSIS
    Health Score v3.0 - Autogrowth & Capacity Monitor
    Detecta problemas de crecimiento y capacidad

.DESCRIPTION
    CategorÃ­a: AUTOGROWTH & CAPACITY (Peso: 5%)
    
    MÃ©tricas clave:
    - Eventos de autogrowth excesivos (Ãºltimas 24h)
    - Archivos cerca del lÃ­mite de maxsize
    - Autogrowth mal configurado (% en archivos grandes)
    - ProyecciÃ³n de espacio libre
    
    Scoring (0-100):
    - 100 pts: <10 autogrouths/dÃ­a, ningÃºn archivo cerca del lÃ­mite
    - 80 pts: 10-50 autogrowths/dÃ­a, archivos con >20% espacio libre
    - 60 pts: 50-100 autogrowths/dÃ­a o archivos con <20% espacio libre
    - 40 pts: >100 autogrowths/dÃ­a o archivos con <10% espacio libre
    - 20 pts: >500 autogrowths/dÃ­a o archivos >90% del maxsize
    - 0 pts: Archivos en maxsize o crecimiento bloqueado
    
    Cap: 50 si algÃºn archivo >90% del maxsize

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
#>

#Requires -Modules dbatools

[CmdletBinding()]
param()

# Limpiar mÃ³dulos SQL existentes para evitar conflictos de assemblies
$sqlModules = @('SqlServer', 'SQLPS', 'dbatools', 'dbatools.library')
foreach ($mod in $sqlModules) {
    if (Get-Module -Name $mod) {
        Remove-Module $mod -Force -ErrorAction SilentlyContinue
    }
}

# Verificar que dbatools estÃ¡ disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Intentar importar dbatools
try {
    Import-Module dbatools -Force -ErrorAction Stop
    Write-Verbose "âœ… dbatools cargado correctamente"
} catch {
    if ($_.Exception.Message -like "*Microsoft.Data.SqlClient*already loaded*") {
        Write-Warning "âš ï¸  Conflicto de assembly detectado. Para evitar este problema:"
        Write-Warning "   OpciÃ³n 1: Ejecuta el script usando el wrapper Run-*-Clean.ps1 correspondiente"
        Write-Warning "   OpciÃ³n 2: Cierra esta sesiÃ³n y ejecuta: powershell -NoProfile -File .\<NombreScript>.ps1"
        Write-Warning ""
        Write-Warning "âš ï¸  Intentando continuar con dbatools ya cargado..."
        
        # Si dbatools ya estÃ¡ parcialmente cargado, intentar usarlo de todos modos
        if (-not (Get-Module -Name dbatools)) {
            Write-Error "âŒ No se pudo cargar dbatools. Usa una de las opciones anteriores."
            exit 1
        }
    } else {
        throw
    }
}

#region ===== CONFIGURACIÃ“N =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 10          # Reducido de 15 a 10 segundos
$TestMode = $false        # $true = solo 5 instancias para testing
$IncludeAWS = $false      # Cambiar a $true para incluir AWS
$OnlyAWS = $false         # Cambiar a $true para SOLO AWS
$MaxParallelJobs = 10     # Procesar 10 instancias en paralelo
$UseParallel = $true      # Usar procesamiento paralelo
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-AutogrowthStatus {
    param([string]$Instance)
    
    $query = @"
-- Autogrowth Events (Ãºltimas 24h) usando Default Trace (mÃ¡s confiable)
DECLARE @AutogrowthEvents INT = 0;

-- Intentar con Default Trace primero (mÃ¡s rÃ¡pido y confiable)
BEGIN TRY
    DECLARE @tracefile VARCHAR(500);
    
    SELECT @tracefile = CAST(value AS VARCHAR(500))
    FROM sys.fn_trace_getinfo(NULL)
    WHERE traceid = 1 AND property = 2;
    
    IF @tracefile IS NOT NULL
    BEGIN
        SELECT @AutogrowthEvents = COUNT(*)
        FROM sys.fn_trace_gettable(@tracefile, DEFAULT) t
        INNER JOIN sys.trace_events e ON t.EventClass = e.trace_event_id
        WHERE e.name IN ('Data File Auto Grow', 'Log File Auto Grow')
          AND t.StartTime > DATEADD(HOUR, -24, GETDATE());
    END
    ELSE
    BEGIN
        -- Si Default Trace estÃ¡ deshabilitado, marcar como sin datos
        SET @AutogrowthEvents = 0;
    END
END TRY
BEGIN CATCH
    -- Si falla, devolver 0 (sin datos disponibles)
    SET @AutogrowthEvents = 0;
END CATCH

SELECT @AutogrowthEvents AS AutogrowthEventsLast24h;

-- File Size vs MaxSize
SELECT 
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.name AS FileName,
    mf.type_desc AS FileType,
    mf.size * 8.0 / 1024 AS SizeMB,
    CASE 
        WHEN mf.max_size = -1 THEN NULL
        WHEN mf.max_size = 268435456 THEN NULL  -- 2TB default
        ELSE mf.max_size * 8.0 / 1024
    END AS MaxSizeMB,
    CASE 
        WHEN mf.max_size = -1 OR mf.max_size = 268435456 THEN 0
        ELSE (CAST(mf.size AS FLOAT) / mf.max_size) * 100
    END AS PercentOfMax,
    mf.is_percent_growth AS IsPercentGrowth,
    CASE 
        WHEN mf.is_percent_growth = 1 THEN CAST(mf.growth AS VARCHAR) + '%'
        ELSE CAST(mf.growth * 8 / 1024 AS VARCHAR) + ' MB'
    END AS GrowthSetting,
    CASE 
        WHEN mf.max_size != -1 AND mf.max_size != 268435456 
             AND (CAST(mf.size AS FLOAT) / mf.max_size) > 0.9 THEN 1
        WHEN mf.is_percent_growth = 1 AND mf.size * 8 / 1024 > 1000 THEN 1  -- % growth en archivos >1GB
        ELSE 0
    END AS HasIssue
FROM sys.master_files mf
WHERE mf.database_id > 4
ORDER BY PercentOfMax DESC;
"@
    
    try {
        $datasets = Invoke-DbaQuery -SqlInstance $Instance -Query $query -QueryTimeout $TimeoutSec -EnableException -As DataSet
        
        $autogrowthEvents = $datasets.Tables[0]
        $fileInfo = $datasets.Tables[1]
        
        # Manejar nulls y valores negativos correctamente
        $autogrowthCount = if ($autogrowthEvents.Count -gt 0 -and $null -ne $autogrowthEvents[0].AutogrowthEventsLast24h) { 
            $val = [int]$autogrowthEvents[0].AutogrowthEventsLast24h
            if ($val -lt 0) { 0 } else { $val }
        } else { 
            0 
        }
        
        $filesNearLimit = ($fileInfo | Where-Object { $_.PercentOfMax -gt 80 }).Count
        $filesWithBadGrowth = ($fileInfo | Where-Object { $_.HasIssue -eq 1 }).Count
        $worstPercentOfMax = ($fileInfo | Measure-Object -Property PercentOfMax -Maximum).Maximum
        
        if ($null -eq $worstPercentOfMax) { $worstPercentOfMax = 0 }
        
        # Detalles de archivos problemÃ¡ticos
        $problematicFiles = $fileInfo | Where-Object { $_.HasIssue -eq 1 -or $_.PercentOfMax -gt 70 } | 
                            Select-Object DatabaseName, FileName, FileType, SizeMB, MaxSizeMB, PercentOfMax, GrowthSetting
        $details = $problematicFiles | ConvertTo-Json -Compress
        if ($null -eq $details -or $details -eq "") { $details = "[]" }
        
        return @{
            AutogrowthEventsLast24h = $autogrowthCount
            FilesNearLimit = $filesNearLimit
            FilesWithBadGrowth = $filesWithBadGrowth
            WorstPercentOfMax = [math]::Round($worstPercentOfMax, 2)
            Details = $details
        }
    }
    catch {
        Write-Warning "Error obteniendo autogrowth status de ${Instance}: $_"
        return $null
    }
}

function Write-ToSqlServer {
    param(
        [array]$Data
    )
    
    if ($Data.Count -eq 0) {
        Write-Host "No hay datos para guardar." -ForegroundColor Yellow
        return
    }
    
    try {
        foreach ($row in $Data) {
            $query = @"
INSERT INTO dbo.InstanceHealth_Autogrowth (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    AutogrowthEventsLast24h,
    FilesNearLimit,
    FilesWithBadGrowth,
    WorstPercentOfMax,
    AutogrowthDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $($row.AutogrowthEventsLast24h),
    $($row.FilesNearLimit),
    $($row.FilesWithBadGrowth),
    $($row.WorstPercentOfMax),
    '$($row.AutogrowthDetails -replace "'", "''")'
);
"@
        
            Invoke-DbaQuery -SqlInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -EnableException `
               
        }
        
        Write-Host "âœ… Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 - AUTOGROWTH & CAPACITY" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1ï¸âƒ£  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    $instances = $instances | Where-Object { $_.NombreInstancia -notlike "*DMZ*" }
    
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Instancias a procesar: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2ï¸âƒ£  Recolectando mÃ©tricas de autogrowth..." -ForegroundColor Yellow

$results = @()

if ($UseParallel) {
    Write-Host "   âš¡ Modo paralelo activado ($MaxParallelJobs jobs simultÃ¡neos)" -ForegroundColor Cyan
    
    # ScriptBlock para ejecutar en paralelo
    $scriptBlock = {
        param($Instance, $TimeoutSec, $QueryTemplate)
        
        Import-Module dbatools -Force -ErrorAction SilentlyContinue
        
        $instanceName = $Instance.NombreInstancia
        $ambiente = if ($Instance.PSObject.Properties.Name -contains "ambiente") { $Instance.ambiente } else { "N/A" }
        $hostingSite = if ($Instance.PSObject.Properties.Name -contains "hostingSite") { $Instance.hostingSite } else { "N/A" }
        $sqlVersion = if ($Instance.PSObject.Properties.Name -contains "MajorVersion") { $Instance.MajorVersion } else { "N/A" }
        
        # Test connection rÃ¡pido
        try {
            $connection = Test-DbaConnection -SqlInstance $instanceName -EnableException
            if (-not $connection.IsPingable) {
                return $null
            }
        } catch {
            return $null
        }
        
        # Obtener mÃ©tricas
        try {
            $datasets = Invoke-DbaQuery -SqlInstance $instanceName -Query $QueryTemplate -QueryTimeout $TimeoutSec -EnableException -As DataSet
            
            $autogrowthEvents = $datasets.Tables[0]
            $fileInfo = $datasets.Tables[1]
            
            # Manejar nulls y valores negativos correctamente
            $autogrowthCount = if ($autogrowthEvents.Count -gt 0 -and $null -ne $autogrowthEvents[0].AutogrowthEventsLast24h) { 
                $val = [int]$autogrowthEvents[0].AutogrowthEventsLast24h
                if ($val -lt 0) { 0 } else { $val }
            } else { 
                0 
            }
            
            $filesNearLimit = ($fileInfo | Where-Object { $_.PercentOfMax -gt 80 }).Count
            $filesWithBadGrowth = ($fileInfo | Where-Object { $_.HasIssue -eq 1 }).Count
            $worstPercentOfMax = ($fileInfo | Measure-Object -Property PercentOfMax -Maximum).Maximum
            
            if ($null -eq $worstPercentOfMax) { $worstPercentOfMax = 0 }
            
            $problematicFiles = $fileInfo | Where-Object { $_.HasIssue -eq 1 -or $_.PercentOfMax -gt 70 } | 
                                Select-Object DatabaseName, FileName, FileType, SizeMB, MaxSizeMB, PercentOfMax, GrowthSetting
            $details = $problematicFiles | ConvertTo-Json -Compress
            if ($null -eq $details -or $details -eq "") { $details = "[]" }
            
            return [PSCustomObject]@{
                InstanceName = $instanceName
                Ambiente = $ambiente
                HostingSite = $hostingSite
                SqlVersion = $sqlVersion
                AutogrowthEventsLast24h = $autogrowthCount
                FilesNearLimit = $filesNearLimit
                FilesWithBadGrowth = $filesWithBadGrowth
                WorstPercentOfMax = [math]::Round($worstPercentOfMax, 2)
                AutogrowthDetails = $details
            }
        } catch {
            return $null
        }
    }
    
    # Definir la query directamente aquÃ­ (copiada de la funciÃ³n)
    $queryTemplate = @"
-- Autogrowth Events (Ãºltimas 24h) usando Default Trace (mÃ¡s confiable)
DECLARE @AutogrowthEvents INT = 0;

-- Intentar con Default Trace primero (mÃ¡s rÃ¡pido y confiable)
BEGIN TRY
    DECLARE @tracefile VARCHAR(500);
    
    SELECT @tracefile = CAST(value AS VARCHAR(500))
    FROM sys.fn_trace_getinfo(NULL)
    WHERE traceid = 1 AND property = 2;
    
    IF @tracefile IS NOT NULL
    BEGIN
        SELECT @AutogrowthEvents = COUNT(*)
        FROM sys.fn_trace_gettable(@tracefile, DEFAULT) t
        INNER JOIN sys.trace_events e ON t.EventClass = e.trace_event_id
        WHERE e.name IN ('Data File Auto Grow', 'Log File Auto Grow')
          AND t.StartTime > DATEADD(HOUR, -24, GETDATE());
    END
    ELSE
    BEGIN
        -- Si Default Trace estÃ¡ deshabilitado, marcar como sin datos
        SET @AutogrowthEvents = 0;
    END
END TRY
BEGIN CATCH
    -- Si falla, devolver 0 (sin datos disponibles)
    SET @AutogrowthEvents = 0;
END CATCH

SELECT @AutogrowthEvents AS AutogrowthEventsLast24h;

-- File Size vs MaxSize (incluye mÃ©tricas de bad growth)
SELECT 
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.name AS FileName,
    mf.type_desc AS FileType,
    mf.size * 8.0 / 1024 AS SizeMB,
    CASE 
        WHEN mf.max_size = -1 THEN NULL
        WHEN mf.max_size = 268435456 THEN NULL
        ELSE mf.max_size * 8.0 / 1024
    END AS MaxSizeMB,
    CASE 
        WHEN mf.max_size = -1 OR mf.max_size = 268435456 THEN 0
        ELSE (CAST(mf.size AS FLOAT) / mf.max_size) * 100
    END AS PercentOfMax,
    mf.is_percent_growth AS IsPercentGrowth,
    CASE 
        WHEN mf.is_percent_growth = 1 THEN CAST(mf.growth AS VARCHAR) + '%'
        ELSE CAST(mf.growth * 8 / 1024 AS VARCHAR) + ' MB'
    END AS GrowthSetting,
    CASE 
        WHEN mf.max_size != -1 AND mf.max_size != 268435456 
             AND (CAST(mf.size AS FLOAT) / mf.max_size) > 0.9 THEN 1
        WHEN mf.is_percent_growth = 1 AND mf.size * 8 / 1024 > 1000 THEN 1
        ELSE 0
    END AS HasIssue
FROM sys.master_files mf
WHERE mf.database_id > 4
ORDER BY PercentOfMax DESC;
"@
    
    # Lanzar jobs en lotes
    $jobs = @()
    $processedJobs = @()  # Tracking de jobs ya procesados
    $counter = 0
    
    foreach ($instance in $instances) {
        $counter++
        
        # Esperar si hay demasiados jobs corriendo
        while ((Get-Job -State Running).Count -ge $MaxParallelJobs) {
            Start-Sleep -Milliseconds 100
            
            # Procesar jobs completados que aÃºn no hemos procesado
            $completedJobs = Get-Job -State Completed | Where-Object { $_.Id -notin $processedJobs }
            foreach ($job in $completedJobs) {
                $result = Receive-Job -Job $job
                if ($null -ne $result) {
                    $results += $result
                    
                    $status = "âœ…"
                    if ($result.FilesNearLimit -gt 0) { $status = "ðŸš¨" }
                    elseif ($result.AutogrowthEventsLast24h -gt 100) { $status = "âš ï¸ " }
                    
                    Write-Host "   $status $($result.InstanceName) - Events:$($result.AutogrowthEventsLast24h) NearLimit:$($result.FilesNearLimit)" -ForegroundColor Gray
                }
                $processedJobs += $job.Id
                Remove-Job -Job $job -ErrorAction SilentlyContinue
            }
        }
        
        Write-Progress -Activity "Recolectando mÃ©tricas" `
            -Status "$counter de $($instances.Count) instancias procesadas" `
            -PercentComplete (($counter / $instances.Count) * 100)
        
        # Lanzar nuevo job
        $job = Start-Job -ScriptBlock $scriptBlock -ArgumentList $instance, $TimeoutSec, $queryTemplate
        $jobs += $job
    }
    
    # Esperar a que terminen todos los jobs restantes
    Write-Host "   â³ Esperando jobs restantes..." -ForegroundColor Yellow
    $remainingJobs = Get-Job | Where-Object { $_.Id -in $jobs.Id -and $_.Id -notin $processedJobs }
    if ($remainingJobs) {
        Wait-Job -Job $remainingJobs | Out-Null
    }
    
    # Recoger resultados finales solo de jobs no procesados
    foreach ($job in $jobs) {
        if ($job.Id -notin $processedJobs) {
            try {
                $result = Receive-Job -Job $job -ErrorAction SilentlyContinue
                if ($null -ne $result -and $results.InstanceName -notcontains $result.InstanceName) {
                    $results += $result
                    
                    $status = "âœ…"
                    if ($result.FilesNearLimit -gt 0) { $status = "ðŸš¨" }
                    elseif ($result.AutogrowthEventsLast24h -gt 100) { $status = "âš ï¸ " }
                    
                    Write-Host "   $status $($result.InstanceName) - Events:$($result.AutogrowthEventsLast24h) NearLimit:$($result.FilesNearLimit)" -ForegroundColor Gray
                }
            } catch {
                # Job ya fue removido, ignorar
            }
            Remove-Job -Job $job -ErrorAction SilentlyContinue
        }
    }
    
    # Limpiar cualquier job restante
    Get-Job | Where-Object { $_.Id -in $jobs.Id } | Remove-Job -ErrorAction SilentlyContinue
    
} else {
    # Modo secuencial (original)
    $counter = 0
    foreach ($instance in $instances) {
        $counter++
        $instanceName = $instance.NombreInstancia
        
        Write-Progress -Activity "Recolectando mÃ©tricas" `
            -Status "$counter de $($instances.Count): $instanceName" `
            -PercentComplete (($counter / $instances.Count) * 100)
        
        $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
        $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
        $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
        
        try {
            $connection = Test-DbaConnection -SqlInstance $instanceName -EnableException
            if (-not $connection.IsPingable) {
                Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
                continue
            }
        } catch {
            Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
            continue
        }
        
        $autogrowthStatus = Get-AutogrowthStatus -Instance $instanceName
        
        if ($null -eq $autogrowthStatus) {
            Write-Host "   âš ï¸  $instanceName - Sin datos (skipped)" -ForegroundColor Yellow
            continue
        }
        
        $status = "âœ…"
        if ($autogrowthStatus.FilesNearLimit -gt 0) {
            $status = "ðŸš¨ FILES NEAR LIMIT!"
        } elseif ($autogrowthStatus.AutogrowthEventsLast24h -gt 100) {
            $status = "âš ï¸  HIGH AUTOGROWTH"
        } elseif ($autogrowthStatus.FilesWithBadGrowth -gt 0) {
            $status = "âš ï¸  BAD GROWTH CONFIG"
        }
        
        Write-Host "   $status $instanceName - Events:$($autogrowthStatus.AutogrowthEventsLast24h) NearLimit:$($autogrowthStatus.FilesNearLimit) BadGrowth:$($autogrowthStatus.FilesWithBadGrowth)" -ForegroundColor Gray
        
        $results += [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $ambiente
            HostingSite = $hostingSite
            SqlVersion = $sqlVersion
            AutogrowthEventsLast24h = $autogrowthStatus.AutogrowthEventsLast24h
            FilesNearLimit = $autogrowthStatus.FilesNearLimit
            FilesWithBadGrowth = $autogrowthStatus.FilesWithBadGrowth
            WorstPercentOfMax = $autogrowthStatus.WorstPercentOfMax
            AutogrowthDetails = ($autogrowthStatus.Details | ConvertTo-Json -Compress)
        }
    }
}

Write-Progress -Activity "Recolectando mÃ©tricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3ï¸âƒ£  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Green
Write-Host "â•‘  RESUMEN - AUTOGROWTH & CAPACITY                      â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  Total instancias procesadas:  $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White

$totalEvents = ($results | Measure-Object -Property AutogrowthEventsLast24h -Sum).Sum
Write-Host "â•‘  Total autogrowth events (24h): $totalEvents".PadRight(53) "â•‘" -ForegroundColor White

$nearLimit = ($results | Where-Object { $_.FilesNearLimit -gt 0 }).Count
Write-Host "â•‘  Instancias con files near limit: $nearLimit".PadRight(53) "â•‘" -ForegroundColor White

$badGrowth = ($results | Where-Object { $_.FilesWithBadGrowth -gt 0 }).Count
Write-Host "â•‘  Instancias con bad growth config: $badGrowth".PadRight(53) "â•‘" -ForegroundColor White

$highAutogrowth = ($results | Where-Object { $_.AutogrowthEventsLast24h -gt 100 }).Count
Write-Host "â•‘  Instancias con >100 events/dÃ­a: $highAutogrowth".PadRight(53) "â•‘" -ForegroundColor White

$criticalFiles = ($results | Where-Object { $_.WorstPercentOfMax -gt 90 }).Count
Write-Host "â•‘  Instancias con archivos >90% max: $criticalFiles".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green

# Mostrar top 10 instancias con mÃ¡s autogrowth
if ($results.Count -gt 0 -and ($results | Where-Object { $_.AutogrowthEventsLast24h -gt 0 }).Count -gt 0) {
    Write-Host ""
    Write-Host "ðŸ”¥ TOP 10 Instancias con mÃ¡s autogrowth events:" -ForegroundColor Yellow
    $results | Where-Object { $_.AutogrowthEventsLast24h -gt 0 } | 
        Sort-Object -Property AutogrowthEventsLast24h -Descending | 
        Select-Object -First 10 | 
        ForEach-Object {
            Write-Host "   â€¢ $($_.InstanceName): $($_.AutogrowthEventsLast24h) events" -ForegroundColor Gray
        }
}

# Mostrar instancias crÃ­ticas
$critical = $results | Where-Object { $_.FilesNearLimit -gt 0 -or $_.WorstPercentOfMax -gt 90 }
if ($critical.Count -gt 0) {
    Write-Host ""
    Write-Host "ðŸš¨ INSTANCIAS CRÃTICAS (archivos cerca del lÃ­mite):" -ForegroundColor Red
    $critical | ForEach-Object {
        Write-Host "   â€¢ $($_.InstanceName): $($_.FilesNearLimit) archivos >80% maxsize (peor: $($_.WorstPercentOfMax)%)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "â„¹ï¸  NOTAS:" -ForegroundColor Cyan
Write-Host "   â€¢ 0 eventos = Sin autogrowth en 24h (normal en instancias estables)" -ForegroundColor Gray
Write-Host "   â€¢ 1-100 eventos = Crecimiento moderado y esperado" -ForegroundColor Gray
Write-Host "   â€¢ >100 eventos = Posible problema de sizing inicial" -ForegroundColor Gray
Write-Host "   â€¢ BadGrowth = % growth en archivos >1GB o archivos >90% maxsize" -ForegroundColor Gray

# EstadÃ­sticas adicionales
$withData = ($results | Where-Object { $_.AutogrowthEventsLast24h -gt 0 }).Count
$noData = ($results | Where-Object { $_.AutogrowthEventsLast24h -eq 0 }).Count
Write-Host ""
Write-Host "ðŸ“Š DistribuciÃ³n:" -ForegroundColor Cyan
Write-Host "   â€¢ Instancias con autogrowth detectado: $withData ($([math]::Round(($withData/$results.Count)*100,1))%)" -ForegroundColor Gray
Write-Host "   â€¢ Instancias sin autogrowth (0): $noData ($([math]::Round(($noData/$results.Count)*100,1))%)" -ForegroundColor Gray

Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


