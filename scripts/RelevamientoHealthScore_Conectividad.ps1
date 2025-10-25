<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de CONECTIVIDAD
    
.DESCRIPTION
    Script de alta frecuencia (cada 1-2 minutos) que recolecta:
    - Conectividad y latencia (RTT)
    - Autenticación SQL/AD
    
    Guarda en: InstanceHealth_Conectividad
    
    Peso en scoring: 10%
    Criterios: 100 si responde, RTT ≤15ms = 100, 16–50ms = 70, >50ms = 40
    Penalización: Fallos de login anómalos => −10 a −40
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 1-2 minutos
    Timeout: 10 segundos
    
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
$TimeoutSec = 10
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        Success = $false
        LatencyMs = 0
        AuthType = "N/A"
        ErrorMessage = $null
        LoginFailuresLast1h = 0
    }
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        # Usar dbatools para test de conexión
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
        
        $stopwatch.Stop()
        
        if ($connection.IsPingable) {
            $result.Success = $true
            $result.LatencyMs = [int]$stopwatch.ElapsedMilliseconds
            $result.AuthType = $connection.AuthType
        }
        
    } catch {
        $result.ErrorMessage = $_.Exception.Message
    }
    
    # Si conectó, verificar login failures
    if ($result.Success) {
        try {
            $loginFailQuery = @"
SELECT COUNT(*) AS FailureCount
FROM sys.dm_exec_sessions
WHERE login_time >= DATEADD(HOUR, -1, GETDATE())
  AND status = 'sleeping'
  AND last_request_start_time < login_time;
"@
            
            $loginFailData = Invoke-DbaQuery -SqlInstance $InstanceName `
                -Query $loginFailQuery `
                -QueryTimeout $TimeoutSec `
                -EnableException
            
            if ($loginFailData -and $loginFailData.FailureCount -ne [DBNull]::Value) {
                $result.LoginFailuresLast1h = [int]$loginFailData.FailureCount
            }
            
        } catch {
            Write-Verbose "No se pudo obtener login failures para $InstanceName"
        }
    }
    
    return $result
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
            $errorMsg = if ($row.ErrorMessage) { 
                $row.ErrorMessage -replace "'", "''" 
            } else { 
                "" 
            }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Conectividad (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    ConnectSuccess,
    ConnectLatencyMs,
    AuthType,
    LoginFailuresLast1h,
    ErrorMessage
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $(if ($row.ConnectSuccess) {1} else {0}),
    $($row.ConnectLatencyMs),
    '$($row.AuthType)',
    $($row.LoginFailuresLast1h),
    '$errorMsg'
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
Write-Host "║  Health Score v3.0 - CONECTIVIDAD METRICS            ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 1-2 minutos                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias desde API
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response
    
    Write-Host "   Total encontradas: $($instances.Count)" -ForegroundColor Gray
    
    # Filtros
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
    
    Write-Host "   Después de filtros: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de conectividad..." -ForegroundColor Yellow

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
    
    # Test de conectividad
    $connTest = Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    if (-not $connTest.Success) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN" -ForegroundColor Red
        
        $results += [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $ambiente
            HostingSite = $hostingSite
            SqlVersion = $sqlVersion
            ConnectSuccess = $false
            ConnectLatencyMs = 0
            AuthType = "N/A"
            LoginFailuresLast1h = 0
            ErrorMessage = $connTest.ErrorMessage
        }
        continue
    }
    
    # Determinar color según latencia
    $latencyColor = "Green"
    if ($connTest.LatencyMs -gt 50) { $latencyColor = "Red" }
    elseif ($connTest.LatencyMs -gt 15) { $latencyColor = "Yellow" }
    
    $status = "✅"
    if ($connTest.LoginFailuresLast1h -gt 10) { $status = "⚠️ LOGIN FAILS!" }
    
    Write-Host "   $status $instanceName - Lat:$($connTest.LatencyMs)ms Auth:$($connTest.AuthType)" -ForegroundColor $latencyColor
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        ConnectSuccess = $true
        ConnectLatencyMs = $connTest.LatencyMs
        AuthType = $connTest.AuthType
        LoginFailuresLast1h = $connTest.LoginFailuresLast1h
        ErrorMessage = $null
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
Write-Host "║  RESUMEN - CONECTIVIDAD                               ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Conectadas:           $(($results | Where-Object ConnectSuccess).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Desconectadas:        $(($results | Where-Object {-not $_.ConnectSuccess}).Count)".PadRight(53) "║" -ForegroundColor White

$avgLatency = ($results | Where-Object ConnectSuccess | Measure-Object -Property ConnectLatencyMs -Average).Average
Write-Host "║  Latencia promedio:    $([int]$avgLatency)ms".PadRight(53) "║" -ForegroundColor White

$slowConnections = ($results | Where-Object {$_.ConnectLatencyMs -gt 50}).Count
Write-Host "║  Conexiones lentas:    $slowConnections (>50ms)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

