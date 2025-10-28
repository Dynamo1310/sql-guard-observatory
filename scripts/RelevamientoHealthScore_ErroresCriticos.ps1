<#
.SYNOPSIS
    Health Score v3.0 - RecolecciÃ³n de ERRORES CRÃTICOS (Severity â‰¥20)
    
.DESCRIPTION
    Script de frecuencia media (cada 15 minutos) que recolecta:
    - Errores de severity 20+ en las Ãºltimas 24 horas
    - PenalizaciÃ³n por errores recientes (decaen en 24h)
    
    Guarda en: InstanceHealth_ErroresCriticos
    
    Peso en scoring: 7%
    Criterios: 0 errores = 100 pts, -10 por cada evento (mÃ¡x -40)
    Cap: Si hay evento reciente => cap 70
    
.NOTES
    VersiÃ³n: 3.0
    Frecuencia: Cada 15 minutos
    Timeout: 30 segundos (90 segundos en retry para instancias lentas)
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

# Verificar que dbatools estÃ¡ disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Descargar SqlServer si estÃ¡ cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÃ“N =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 90      # Timeout para retry en caso de fallo (aumentado a 90s)
$TestMode = $false         # $true = solo 5 instancias para testing
$IncludeAWS = $false       # Cambiar a $true para incluir AWS
$OnlyAWS = $false          # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-ErrorlogStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 30,
        [int]$RetryTimeoutSec = 60
    )
    
    $result = @{
        Severity20PlusCount = 0
        Severity20PlusLast1h = 0
        MostRecentError = $null
        ErrorDetails = @()
    }
    
    try {
        $query = @"
-- Query optimizada: filtrar desde el inicio para reducir trabajo
CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(128),
    [Text] NVARCHAR(MAX)
);

INSERT INTO #ErrorLog
EXEC sp_readerrorlog 0;

-- Filtrar solo errores crÃ­ticos (Severity 20+) en una sola pasada
SELECT 
    LogDate,
    [Text]
INTO #CriticalErrors
FROM #ErrorLog
WHERE ([Text] LIKE '%Severity: 2[0-9]%' OR [Text] LIKE '%Severity: 20%' OR [Text] LIKE '%Severity: 21%' 
       OR [Text] LIKE '%Severity: 22%' OR [Text] LIKE '%Severity: 23%' OR [Text] LIKE '%Severity: 24%' OR [Text] LIKE '%Severity: 25%')
  AND LogDate >= DATEADD(HOUR, -24, GETDATE());

-- Contar errores en Ãºltimas 24 horas
SELECT COUNT(*) AS Severity20Count FROM #CriticalErrors;

-- Contar errores en Ãºltima hora
SELECT COUNT(*) AS Severity20Count1h 
FROM #CriticalErrors
WHERE LogDate >= DATEADD(HOUR, -1, GETDATE());

-- Error mÃ¡s reciente
SELECT TOP 1 LogDate, [Text]
FROM #CriticalErrors
ORDER BY LogDate DESC;

-- Top 5 errores para detalles
SELECT TOP 5 LogDate, [Text]
FROM #CriticalErrors
ORDER BY LogDate DESC;

DROP TABLE #CriticalErrors;
DROP TABLE #ErrorLog;
"@
        
        # Usar dbatools para ejecutar queries con retry
        $data = $null
        $attemptCount = 0
        $lastError = $null
        
        while ($attemptCount -lt 2 -and $data -eq $null) {
            $attemptCount++
            $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
            
            try {
                if ($attemptCount -eq 2) {
                    Write-Host "      â±ï¸  Reintentando $InstanceName con timeout extendido (${RetryTimeoutSec}s)..." -ForegroundColor DarkYellow
                }
                
                $data = Invoke-DbaQuery -SqlInstance $InstanceName `
                    -Query $query `
                    -QueryTimeout $currentTimeout `
                    -EnableException
                    
                break
                
            } catch {
                $lastError = $_
                if ($attemptCount -eq 1) {
                    # Primer intento fallÃ³, reintentar silenciosamente
                    Start-Sleep -Milliseconds 500
                } else {
                    # Segundo intento fallÃ³, capturar detalles
                    Write-Verbose "Error en ErrorLog despuÃ©s de 2 intentos: $($_.Exception.Message)"
                    if ($_.Exception.InnerException) {
                        Write-Verbose "Inner: $($_.Exception.InnerException.Message)"
                    }
                }
            }
        }
        
        if ($data -eq $null -and $lastError) {
            # Mejorar mensaje de error con mÃ¡s detalles
            $errorMsg = $lastError.Exception.Message
            if ($lastError.Exception.InnerException) {
                $errorMsg += " | Inner: $($lastError.Exception.InnerException.Message)"
            }
            Write-Warning "Error obteniendo errorlog en ${InstanceName} (despuÃ©s de 2 intentos con ${RetryTimeoutSec}s timeout): $errorMsg"
            return $result
        }
        
        if ($data) {
            # Procesar mÃºltiples resultsets
            $resultSets = @($data)
            
            # ResultSet 1: Count de 24 horas
            if ($resultSets.Count -ge 1 -and $resultSets[0]) {
                $countRow24h = $resultSets[0] | Select-Object -First 1
                if ($countRow24h.Severity20Count -ne [DBNull]::Value) {
                    $result.Severity20PlusCount = [int]$countRow24h.Severity20Count
                }
            }
            
            # ResultSet 2: Count de 1 hora
            if ($resultSets.Count -ge 2 -and $resultSets[1]) {
                $countRow1h = $resultSets[1] | Select-Object -First 1
                if ($countRow1h.Severity20Count1h -ne [DBNull]::Value) {
                    $result.Severity20PlusLast1h = [int]$countRow1h.Severity20Count1h
                }
            }
            
            # ResultSet 3: Error mÃ¡s reciente
            if ($resultSets.Count -ge 3 -and $resultSets[2]) {
                $mostRecent = $resultSets[2] | Select-Object -First 1
                if ($mostRecent -and $mostRecent.LogDate -ne [DBNull]::Value) {
                    $result.MostRecentError = [datetime]$mostRecent.LogDate
                }
            }
            
            # ResultSet 4: Top 5 detalles
            if ($resultSets.Count -ge 4 -and $resultSets[3]) {
                $detailRows = $resultSets[3] | Select-Object -First 5
                $result.ErrorDetails = $detailRows | ForEach-Object {
                    if ($_.Text -ne [DBNull]::Value) {
                        "$($_.LogDate): $($_.Text.Substring(0, [Math]::Min(100, $_.Text.Length)))"
                    }
                }
            }
        }
        
    } catch {
        # Error en el procesamiento de errorlog
        $errorDetails = $_.Exception.Message
        Write-Warning "Error procesando errorlog en ${InstanceName}: $errorDetails"
        Write-Verbose "  LÃ­nea: $($_.InvocationInfo.ScriptLineNumber)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        # Usar dbatools para test de conexiÃ³n (comando simple sin parÃ¡metros de certificado)
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
        return $connection.IsPingable
    } catch {
        return $false
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
            # Sanitizar valores NULL
            $mostRecentError = if ($row.MostRecentError) { 
                "'$($row.MostRecentError.ToString('yyyy-MM-dd HH:mm:ss'))'" 
            } else { 
                "NULL" 
            }
            
            # Escapar comillas en detalles
            $errorDetails = ($row.ErrorDetails -join "|") -replace "'", "''"
            
            $query = @"
INSERT INTO dbo.InstanceHealth_ErroresCriticos (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    Severity20PlusCount,
    Severity20PlusLast1h,
    MostRecentError,
    ErrorDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $($row.Severity20PlusCount),
    $($row.Severity20PlusLast1h),
    $mostRecentError,
    '$errorDetails'
);
"@
            
            # Usar dbatools para insertar datos
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate `
                -ErrorAction Stop
        }
        
        Write-Host "âœ… Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Cyan
Write-Host "â•‘  Health Score v3.0 - ERRORES CRÃTICOS (SEV â‰¥20)      â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Frecuencia: 15 minutos                               â•‘" -ForegroundColor Cyan
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1ï¸âƒ£  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # Excluir instancias con DMZ en el nombre
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
Write-Host "2ï¸âƒ£  Recolectando errores crÃ­ticos..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    # La propiedad correcta es NombreInstancia (con mayÃºscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando mÃ©tricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Capturar metadata de la instancia desde API
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar mÃ©tricas
    $errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
    
    # Determinar estado
    $status = "âœ…"
    if ($errorlog.Severity20PlusLast1h -gt 0) {
        $status = "ðŸš¨ ERROR RECIENTE!"
    }
    elseif ($errorlog.Severity20PlusCount -gt 5) {
        $status = "âš ï¸ MÃšLTIPLES ERRORES!"
    }
    elseif ($errorlog.Severity20PlusCount -gt 0) {
        $status = "âš ï¸ CON ERRORES"
    }
    
    $errorAge = if ($errorlog.MostRecentError) {
        $ageMinutes = ((Get-Date) - $errorlog.MostRecentError).TotalMinutes
        if ($ageMinutes -lt 60) { "$([int]$ageMinutes)min" }
        else { "$([int]($ageMinutes/60))h" }
    } else { "N/A" }
    
    Write-Host "   $status $instanceName - Errors(24h):$($errorlog.Severity20PlusCount) Last:$errorAge" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        Severity20PlusCount = $errorlog.Severity20PlusCount
        Severity20PlusLast1h = $errorlog.Severity20PlusLast1h
        MostRecentError = $errorlog.MostRecentError
        ErrorDetails = $errorlog.ErrorDetails
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
Write-Host "â•‘  RESUMEN - ERRORES CRÃTICOS                           â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  Total instancias:         $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Sin errores:              $(($results | Where-Object {$_.Severity20PlusCount -eq 0}).Count)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Con errores (24h):        $(($results | Where-Object {$_.Severity20PlusCount -gt 0}).Count)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Errores recientes (1h):   $(($results | Where-Object {$_.Severity20PlusLast1h -gt 0}).Count)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green
Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


