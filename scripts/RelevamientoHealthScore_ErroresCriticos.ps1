<#
.SYNOPSIS
    Health Score v3.0 - Recolección de ERRORES CRÍTICOS (Severity ≥20)
    
.DESCRIPTION
    Script de frecuencia media (cada 15 minutos) que recolecta:
    - Errores de severity 20+ en las últimas 24 horas
    - Penalización por errores recientes (decaen en 24h)
    
    Guarda en: InstanceHealth_ErroresCriticos
    
    Peso en scoring: 7%
    Criterios: 0 errores = 100 pts, -10 por cada evento (máx -40)
    Cap: Si hay evento reciente => cap 70
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 15 minutos
    Timeout: 30 segundos (60 segundos en retry para instancias lentas)
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

# Verificar que dbatools está disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Descargar SqlServer si está cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 60      # Timeout para retry en caso de fallo
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
CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(128),
    [Text] NVARCHAR(MAX)
);

INSERT INTO #ErrorLog
EXEC sp_readerrorlog 0;

-- Contar errores en últimas 24 horas
SELECT 
    COUNT(*) AS Severity20Count
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE());

-- Contar errores en última hora (para penalización adicional)
SELECT 
    COUNT(*) AS Severity20Count1h
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -1, GETDATE());

-- Error más reciente
SELECT TOP 1
    LogDate,
    [Text]
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
ORDER BY LogDate DESC;

-- Top 5 errores para detalles
SELECT TOP 5 
    LogDate,
    [Text]
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE())
ORDER BY LogDate DESC;

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
                    Write-Verbose "Reintentando ErrorLog en $InstanceName con timeout extendido de ${RetryTimeoutSec}s..."
                }
                
                $data = Invoke-DbaQuery -SqlInstance $InstanceName `
                    -Query $query `
                    -QueryTimeout $currentTimeout `
                    -EnableException
                    
                break
                
            } catch {
                $lastError = $_
                if ($attemptCount -eq 1) {
                    Write-Verbose "Timeout en ErrorLog $InstanceName (intento 1/${TimeoutSec}s), reintentando..."
                    Start-Sleep -Milliseconds 500
                } else {
                    # Segundo intento falló, capturar detalles
                    Write-Verbose "Error en ErrorLog: $($_.Exception.Message)"
                    if ($_.Exception.InnerException) {
                        Write-Verbose "Inner: $($_.Exception.InnerException.Message)"
                    }
                }
            }
        }
        
        if ($data -eq $null -and $lastError) {
            # Mejorar mensaje de error con más detalles
            $errorMsg = $lastError.Exception.Message
            if ($lastError.Exception.InnerException) {
                $errorMsg += " | Inner: $($lastError.Exception.InnerException.Message)"
            }
            Write-Warning "Error obteniendo errorlog en ${InstanceName}: $errorMsg"
            return $result
        }
        
        if ($data) {
            # Procesar múltiples resultsets
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
            
            # ResultSet 3: Error más reciente
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
        Write-Verbose "  Línea: $($_.InvocationInfo.ScriptLineNumber)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        # Usar dbatools para test de conexión (comando simple sin parámetros de certificado)
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
            Invoke-DbaQuery -SqlInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -EnableException
        }
        
        Write-Host "✅ Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v3.0 - ERRORES CRÍTICOS (SEV ≥20)      ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 15 minutos                               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

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
Write-Host "2️⃣  Recolectando errores críticos..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    # La propiedad correcta es NombreInstancia (con mayúscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Capturar metadata de la instancia desde API
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar métricas
    $errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
    
    # Determinar estado
    $status = "✅"
    if ($errorlog.Severity20PlusLast1h -gt 0) {
        $status = "🚨 ERROR RECIENTE!"
    }
    elseif ($errorlog.Severity20PlusCount -gt 5) {
        $status = "⚠️ MÚLTIPLES ERRORES!"
    }
    elseif ($errorlog.Severity20PlusCount -gt 0) {
        $status = "⚠️ CON ERRORES"
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

Write-Progress -Activity "Recolectando métricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - ERRORES CRÍTICOS                           ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:         $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Sin errores:              $(($results | Where-Object {$_.Severity20PlusCount -eq 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Con errores (24h):        $(($results | Where-Object {$_.Severity20PlusCount -gt 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Errores recientes (1h):   $(($results | Where-Object {$_.Severity20PlusLast1h -gt 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

