# ========================================================================================================
# Nombre: SQLRestartNova_WebAPI
# Version: 2.1 (Optimizado - Timeouts reducidos)
# ========================================================================================================
# Autor: Pablo Rodriguez / Adaptado para API
# Area: Ingenieria de Datos
# ========================================================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ServersFile,
    
    [Parameter(Mandatory=$false)]
    [string]$TaskId = "manual"
)

# Configuración de encoding
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

# Configuración
$FechaEjecucion = Get-Date -Format "yyyyMMdd_HHmmss"
$LogPath = "C:\Apps\SQLGuardObservatory\Logs\SQLRestartNova_WebAPI_${TaskId}_${FechaEjecucion}.log"

# Timeouts configurables (en minutos)
$TIMEOUT_SERVICIOS_OS = 1      # Timeout para servicios básicos del OS (1 minuto)
$TIMEOUT_SERVICIOS_SQL = 1     # Timeout para servicios SQL (1 minuto)
$WAIT_POST_REINICIO = 30       # Segundos a esperar post-reinicio antes de verificar

# Crear directorio de logs
$logsDir = "C:\Apps\SQLGuardObservatory\Logs"
if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# Función para log
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy/MM/dd-HH:mm:ss"
    $logLine = "$timestamp - $Level`: $Message"
    Write-Output $logLine
    Add-Content -Path $LogPath -Value $logLine -ErrorAction SilentlyContinue
}

# Verificar archivo de servidores
if (!(Test-Path $ServersFile)) {
    Write-Log "ERROR: El archivo de servidores no existe: $ServersFile" -Level "ERROR"
    exit 1
}

$servers = Get-Content $ServersFile | Where-Object { $_ -match '\S' }

if ($servers.Count -eq 0) {
    Write-Log "ERROR: No se encontraron servidores en el archivo" -Level "ERROR"
    exit 1
}

Write-Log "═══════════════════════════════════════════════════════════════"
Write-Log "  SQLRestartNova WebAPI - Inicio de ejecución"
Write-Log "  TaskId: $TaskId"
Write-Log "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "  Servidores a procesar: $($servers.Count)"
Write-Log "═══════════════════════════════════════════════════════════════"

$ServerStatus = @()

# Función para verificar servicios con timeout corto
function VerificarServicios {
    param (
        [string]$SQLServer,
        [array]$servicios,
        [int]$TimeoutMinutes = 5
    )
    
    Write-Log "Verificando servicios [$($servicios -join ', ')] en $SQLServer (timeout: ${TimeoutMinutes}min)"
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $intentos = 0
    $maxIntentos = ($TimeoutMinutes * 60) / 10  # Cada 10 segundos

    while ($intentos -lt $maxIntentos) {
        $intentos++
        $todosOk = $true
        $serviciosFaltantes = @()

        foreach ($servicio in $servicios) {
            try {
                $estado = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                    param($s)
                    $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
                    if ($svc) { $svc.Status } else { "NotFound" }
                } -ArgumentList $servicio -ErrorAction Stop

                if ($estado -ne 'Running') {
                    $todosOk = $false
                    $serviciosFaltantes += "$servicio($estado)"
                }
            } catch {
                $todosOk = $false
                $serviciosFaltantes += "$servicio(Error)"
            }
        }

        if ($todosOk) {
            Write-Log "Todos los servicios verificados OK en $SQLServer" -Level "SUCCESS"
            return $true
        }

        if ($intentos -lt $maxIntentos) {
            Write-Log "Esperando servicios: $($serviciosFaltantes -join ', ') - intento $intentos/${maxIntentos}"
            Start-Sleep -Seconds 10
        }
    }

    Write-Log "Timeout esperando servicios en $SQLServer después de ${TimeoutMinutes} minutos" -Level "WARNING"
    return $false
}

# Función para verificar un servicio SQL específico
function VerificarServicioSQL {
    param (
        [string]$SQLServer,
        [string]$ServiceName,
        [int]$TimeoutMinutes = 5
    )
    
    Write-Log "Verificando servicio $ServiceName en $SQLServer"
    
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    
    while ($stopwatch.Elapsed.TotalMinutes -lt $TimeoutMinutes) {
        try {
            $estado = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                param($s)
                $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
                if ($svc) { 
                    @{ Status = $svc.Status.ToString(); StartType = $svc.StartType.ToString() }
                } else { 
                    @{ Status = "NotFound"; StartType = "Unknown" }
                }
            } -ArgumentList $ServiceName -ErrorAction Stop

            if ($estado.Status -eq 'Running') {
                Write-Log "Servicio $ServiceName está Running en $SQLServer" -Level "SUCCESS"
                return "Success"
            }
            
            if ($estado.Status -eq 'Stopped' -and $estado.StartType -ne 'Disabled') {
                Write-Log "Intentando iniciar $ServiceName en $SQLServer..."
                try {
                    Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                        param($s)
                        Start-Service -Name $s -ErrorAction Stop
                    } -ArgumentList $ServiceName -ErrorAction Stop
                } catch {
                    Write-Log "No se pudo iniciar $ServiceName`: $_" -Level "WARNING"
                }
            }
            
            Start-Sleep -Seconds 15

        } catch {
            Write-Log "Error verificando $ServiceName`: $_" -Level "WARNING"
            Start-Sleep -Seconds 10
        }
    }

    Write-Log "Timeout esperando $ServiceName en $SQLServer" -Level "WARNING"
    return "Failure"
}

# Procesar cada servidor
$currentIndex = 0
foreach ($server in $servers) {
    $currentIndex++
    $Summary = @{}
    
    Write-Log "───────────────────────────────────────────────────────────────"
    Write-Log "Procesando servidor $currentIndex de $($servers.Count): $server"
    Write-Log "───────────────────────────────────────────────────────────────"
    
    try {
        # 1. Verificar conectividad
        Write-Log "Verificando conectividad con $server"
        $pingResult = Test-NetConnection -ComputerName $server -Port 1433 -ErrorAction SilentlyContinue -WarningAction SilentlyContinue

        if (-not $pingResult.TcpTestSucceeded) {
            Write-Log "No se puede conectar al puerto 1433 en $server" -Level "ERROR"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Sin conectividad" }
            continue
        }
        Write-Log "Conectividad verificada con $server" -Level "SUCCESS"

        # 2. Verificar si es AlwaysOn
        try {
            $query = "SELECT ar.replica_server_name FROM sys.dm_hadr_availability_replica_states ars INNER JOIN sys.availability_replicas ar ON ars.replica_id = ar.replica_id WHERE ar.replica_server_name = @@SERVERNAME"
            $result = Invoke-Sqlcmd -ServerInstance $server -Query $query -TrustServerCertificate -ErrorAction Stop -QueryTimeout 10
            
            if ($result) {
                Write-Log "El servidor $server es un nodo AlwaysOn. Omitiendo reinicio automático." -Level "WARNING"
                $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Skipped"; Reason = "Es nodo AlwaysOn" }
                continue
            }
        } catch {
            Write-Log "Servidor $server es standalone - procediendo con reinicio"
        }

        # 3. Reiniciar el servidor
        Write-Log "Iniciando reinicio de $server..."
        
        try {
            Restart-Computer -ComputerName $server -Force -Wait -For PowerShell -Timeout 300 -ErrorAction Stop
            Write-Log "Reinicio exitoso en $server" -Level "SUCCESS"
            $Summary["Reinicio"] = "Success"
        } catch {
            Write-Log "Error en el reinicio de $server`: $_" -Level "ERROR"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Error en reinicio: $_" }
            continue
        }

        # 4. Verificar ping post-reinicio
        Write-Log "Verificando respuesta post-reinicio..."
        $pingOk = $false
        for ($i = 1; $i -le 10; $i++) {
            if (Test-Connection -ComputerName $server -Count 1 -Quiet) {
                $pingOk = $true
                break
            }
            Write-Log "Esperando respuesta de $server... intento $i/10"
            Start-Sleep -Seconds 5
        }
        
        if (-not $pingOk) {
            Write-Log "El servidor $server no responde después del reinicio" -Level "ERROR"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Sin respuesta post-reinicio" }
            continue
        }
        Write-Log "Ping exitoso a $server post-reinicio" -Level "SUCCESS"

        # 5. Esperar un momento para que los servicios inicien
        Write-Log "Esperando $WAIT_POST_REINICIO segundos para que inicien los servicios..."
        Start-Sleep -Seconds $WAIT_POST_REINICIO

        # 6. Verificar servicios básicos del OS
        $serviciosOS = @("WinRM")  # Solo verificar WinRM que es esencial
        $osOk = VerificarServicios -SQLServer $server -servicios $serviciosOS -TimeoutMinutes $TIMEOUT_SERVICIOS_OS
        $Summary["Servicio OS"] = if ($osOk) { "Success" } else { "Warning" }

        # 7. Verificar servicios SQL
        $Summary["MSSQLSERVER"] = VerificarServicioSQL -SQLServer $server -ServiceName "MSSQLSERVER" -TimeoutMinutes $TIMEOUT_SERVICIOS_SQL
        $Summary["SQLSERVERAGENT"] = VerificarServicioSQL -SQLServer $server -ServiceName "SQLSERVERAGENT" -TimeoutMinutes $TIMEOUT_SERVICIOS_SQL

        # 8. Resumen
        Write-Log "───────────────────────────────────────────────────────────────"
        Write-Log "Resumen para $server`:"
        foreach ($key in $Summary.Keys) {
            $val = $Summary[$key]
            $lvl = if ($val -eq "Success") { "SUCCESS" } elseif ($val -eq "Failure") { "ERROR" } else { "INFO" }
            Write-Log "  $key`: $val" -Level $lvl
        }

        $hasFail = $Summary.Values -contains "Failure"
        $finalStatus = if ($hasFail) { "Failure" } else { "Success" }
        $ServerStatus += [PSCustomObject]@{ Server = $server; Status = $finalStatus; Reason = "" }

    } catch {
        Write-Log "Error procesando servidor $server`: $_" -Level "ERROR"
        $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = $_.ToString() }
    }
}

# Resumen final
Write-Log "═══════════════════════════════════════════════════════════════"
Write-Log "  RESUMEN FINAL DE EJECUCIÓN"
Write-Log "═══════════════════════════════════════════════════════════════"

$successCount = ($ServerStatus | Where-Object { $_.Status -eq "Success" }).Count
$failureCount = ($ServerStatus | Where-Object { $_.Status -eq "Failure" }).Count
$skippedCount = ($ServerStatus | Where-Object { $_.Status -eq "Skipped" }).Count

Write-Log "Total procesados: $($ServerStatus.Count)"
Write-Log "Exitosos: $successCount"
Write-Log "Fallidos: $failureCount"
Write-Log "Omitidos: $skippedCount"
Write-Log ""

foreach ($status in $ServerStatus) {
    if ($status.Status -eq "Success") {
        Write-Log "  OK $($status.Server) - Reinicio completado" -Level "SUCCESS"
    } elseif ($status.Status -eq "Failure") {
        Write-Log "  FAIL $($status.Server) - $($status.Reason)" -Level "ERROR"
    } else {
        Write-Log "  SKIP $($status.Server) - $($status.Reason)" -Level "INFO"
    }
}

Write-Log "═══════════════════════════════════════════════════════════════"
Write-Log "  SQLRestartNova WebAPI - Fin de ejecución"
Write-Log "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "═══════════════════════════════════════════════════════════════"

if ($failureCount -gt 0) { exit 1 } else { exit 0 }
