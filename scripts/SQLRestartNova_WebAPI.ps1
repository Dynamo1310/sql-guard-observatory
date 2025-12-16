# ========================================================================================================
# Nombre: SQLRestartNova_WebAPI
# Version: 2.0 (Adaptado para WebAPI)
# ========================================================================================================
# Autor: Pablo Rodriguez / Adaptado para API por Sistema
# Area: Ingenieria de Datos
# ========================================================================================================
# Explicacion del proceso
# ========================================================================================================
# Versión adaptada para ser ejecutada desde la API .NET Core
# Recibe la lista de servidores como parámetro y envía todo el output a stdout
# para que la API pueda capturarlo y streamearlo via SignalR
#
# Parámetros:
#   -ServersFile: Ruta a un archivo con la lista de servidores (uno por línea)
#   -TaskId: ID de la tarea para logging
# ========================================================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$ServersFile,
    
    [Parameter(Mandatory=$false)]
    [string]$TaskId = "manual"
)

# Configuración de encoding para UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

# Configuración
$FechaEjecucion = Get-Date -Format "yyyyMMdd_HHmmss"
$LogPath = "C:\Apps\SQLGuardObservatory\Logs\SQLRestartNova_WebAPI_${TaskId}_${FechaEjecucion}.log"

# Crear directorio de logs si no existe
$logsDir = "C:\Apps\SQLGuardObservatory\Logs"
if (!(Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
}

# Función para escribir log (stdout para API y archivo para backup)
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [string]$Color = "White"
    )
    
    $timestamp = Get-Date -Format "yyyy/MM/dd-HH:mm:ss"
    $logLine = "$timestamp - $Level`: $Message"
    
    # Escribir a stdout (capturado por la API)
    Write-Output $logLine
    
    # También guardar en archivo de backup
    Add-Content -Path $LogPath -Value $logLine -ErrorAction SilentlyContinue
}

# Verificar que el archivo de servidores existe
if (!(Test-Path $ServersFile)) {
    Write-Log "ERROR: El archivo de servidores no existe: $ServersFile" -Level "ERROR"
    exit 1
}

# Leer lista de servidores
$servers = Get-Content $ServersFile | Where-Object { $_ -match '\S' } # Ignorar líneas vacías

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

# Lista para almacenar el estado de cada servidor
$ServerStatus = @()

# Función para verificar servicios
function VerificarServicios {
    param (
        [string]$SQLServer,
        [array]$servicios,
        [hashtable]$Summary
    )
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

        do {
            $todosServiciosActivos = $true

            foreach ($servicio in $servicios) {
                try {
                    $estadoServicio = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                        param($servicio)
                        Get-Service -Name $servicio -ErrorAction Stop | Select-Object Name, Status
                    } -ArgumentList $servicio -ErrorAction Stop

                    if ($estadoServicio.Status -ne 'Running') {
                        $todosServiciosActivos = $false
                        Write-Log "Servicio $($estadoServicio.Name) no está corriendo en $SQLServer. Esperando..." -Level "INFO"
                    }
                } catch {
                    $todosServiciosActivos = $false
                    Write-Log "No se pudo verificar servicio $servicio en $SQLServer`: $_" -Level "WARNING"
                }
            }

            if (-not $todosServiciosActivos) {
                Start-Sleep -Seconds 10
            }

            if ($stopwatch.Elapsed.TotalMinutes -ge 30) {
                Write-Log "Se superó el tiempo límite de 30 minutos verificando servicios en $SQLServer" -Level "WARNING"
                $Summary["Servicio OS"] = "Failure"
                return $false
            }

        } while (-not $todosServiciosActivos)

        Write-Log "Servidor $SQLServer - Todos los servicios básicos están en estado Running" -Level "SUCCESS"
        $Summary["Servicio OS"] = "Success"
        return $true
    } catch {
        Write-Log "Error al verificar servicios en $SQLServer`: $_" -Level "ERROR"
        $Summary["Servicio OS"] = "Failure"
        return $false
    }
}

# Función para verificar discos
function VerificarDiscos {
    param (
        [string]$SQLServer,
        [hashtable]$Summary
    )
    try {
        Write-Log "Verificando discos en $SQLServer" -Level "INFO"

        $discosProblema = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
            Get-Disk | Where-Object { $_.OperationalStatus -eq "Offline" -or $_.IsOffline -eq $true -or $_.IsReadOnly -eq $true }
        } -ErrorAction Stop

        if ($discosProblema) {
            foreach ($disco in $discosProblema) {
                try {
                    Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                        param($disco)
                        
                        if ($disco.IsOffline) {
                            Set-Disk -Number $disco.Number -IsOffline $false
                            Start-Sleep -Seconds 2
                        }
                        
                        $estadoIntermedio = Get-Disk -Number $disco.Number
                        if ($estadoIntermedio.IsReadOnly) {
                            Set-Disk -Number $disco.Number -IsReadOnly $false
                            Start-Sleep -Seconds 2
                        }
                        
                    } -ArgumentList $disco -ErrorAction Stop

                    Write-Log "Disco $($disco.Number) configurado correctamente en $SQLServer" -Level "SUCCESS"
                } catch {
                    Write-Log "Error configurando disco $($disco.Number) en $SQLServer`: $_" -Level "ERROR"
                }
            }
            $Summary["Discos"] = "Success"
        } else {
            Write-Log "No se encontraron discos problemáticos en $SQLServer" -Level "SUCCESS"
            $Summary["Discos"] = "Success"
        }

        return $true
    } catch {
        Write-Log "Error al verificar discos en $SQLServer`: $_" -Level "ERROR"
        $Summary["Discos"] = "Failure"
        return $false
    }
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
        # Verificar conectividad
        Write-Log "Verificando conectividad con $server" -Level "INFO"
        
        $pingResult = Test-NetConnection -ComputerName $server -Port 1433 -ErrorAction SilentlyContinue -WarningAction SilentlyContinue

        if (-not $pingResult.TcpTestSucceeded) {
            Write-Log "No se puede conectar al puerto 1433 en $server" -Level "ERROR"
            $Summary["Conectividad"] = "Failure"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Sin conectividad" }
            continue
        }
        
        $Summary["Conectividad"] = "Success"
        Write-Log "Conectividad verificada con $server" -Level "SUCCESS"

        # Verificar si es AlwaysOn
        try {
            $query = @"
            SELECT 
                ar.replica_server_name AS ServerName,
                ars.role_desc AS RoleDesc
            FROM 
                sys.dm_hadr_availability_replica_states ars
            INNER JOIN 
                sys.availability_replicas ar ON ars.replica_id = ar.replica_id
            WHERE 
                ar.replica_server_name = @@SERVERNAME
"@
            $result = Invoke-Sqlcmd -ServerInstance $server -Query $query -TrustServerCertificate -ErrorAction Stop
            
            if ($result) {
                Write-Log "El servidor $server es un nodo AlwaysOn. Se omite el reinicio automático." -Level "WARNING"
                $Summary["AlwaysOn"] = "Skipped"
                $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Skipped"; Reason = "Es nodo AlwaysOn" }
                continue
            }
        } catch {
            # Si falla la consulta, asumimos que no es AlwaysOn o no tenemos permisos
            Write-Log "No se pudo verificar AlwaysOn para $server (asumiendo standalone)" -Level "INFO"
        }

        Write-Log "Servidor $server es standalone - procediendo con reinicio" -Level "INFO"

        # Reiniciar el servidor
        Write-Log "Iniciando reinicio de $server..." -Level "INFO"
        
        try {
            Restart-Computer -ComputerName $server -Force -Wait -For PowerShell -Timeout 600 -ErrorAction Stop
            Write-Log "Reinicio exitoso en $server" -Level "SUCCESS"
            $Summary["Reinicio"] = "Success"
        } catch {
            Write-Log "Error en el reinicio de $server`: $_" -Level "ERROR"
            $Summary["Reinicio"] = "Failure"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Error en reinicio" }
            continue
        }

        # Verificar ping post-reinicio
        $pingResult = Test-Connection -ComputerName $server -Count 5 -Quiet
        if ($pingResult) {
            Write-Log "Ping exitoso a $server post-reinicio" -Level "SUCCESS"
            $Summary["Ping"] = "Success"
        } else {
            Write-Log "Error en ping a $server post-reinicio" -Level "ERROR"
            $Summary["Ping"] = "Failure"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Sin respuesta post-reinicio" }
            continue
        }

        # Verificar servicios básicos
        $serviciosBasicos = @("Netlogon", "RpcSs", "WinRM")
        $rtaFunc = VerificarServicios -SQLServer $server -servicios $serviciosBasicos -Summary $Summary
        if (-not $rtaFunc) {
            Write-Log "La verificación de servicios OS en $server falló" -Level "ERROR"
            $ServerStatus += [PSCustomObject]@{ Server = $server; Status = "Failure"; Reason = "Servicios OS no disponibles" }
            continue
        }

        # Verificar discos
        $rtaDiscos = VerificarDiscos -SQLServer $server -Summary $Summary
        if (-not $rtaDiscos) {
            Write-Log "La verificación de discos en $server falló" -Level "WARNING"
        }

        # Esperar para servicios SQL
        Write-Log "Esperando 60 segundos para que los servicios SQL inicien..." -Level "INFO"
        Start-Sleep -Seconds 60

        # Verificar servicios SQL Server
        $Services = @("MSSQLSERVER", "SQLSERVERAGENT")
        $MaxWaitTime = 5 # minutos

        foreach ($Service in $Services) {
            $StartTime = Get-Date
            
            try {
                $ServiceStatus = Invoke-Command -ComputerName $server -ScriptBlock {
                    param ($Service)
                    Get-Service -Name $Service -ErrorAction Stop
                } -ArgumentList $Service -ErrorAction Stop

                if ($ServiceStatus.Status -ne "Running") {
                    Write-Log "Servicio $Service no está corriendo en $server. Intentando iniciar..." -Level "INFO"

                    try {
                        Invoke-Command -ComputerName $server -ScriptBlock {
                            param ($Service)
                            Start-Service -Name $Service -ErrorAction Stop
                        } -ArgumentList $Service -ErrorAction Stop
                    } catch {
                        Write-Log "Error al iniciar servicio $Service`: $_" -Level "WARNING"
                    }

                    # Esperar a que inicie
                    while ($true) {
                        Start-Sleep -Seconds 30
                        $ElapsedMinutes = (New-TimeSpan -Start $StartTime -End (Get-Date)).TotalMinutes
                        
                        $ServiceStatus = Invoke-Command -ComputerName $server -ScriptBlock {
                            param ($Service)
                            Get-Service -Name $Service -ErrorAction Stop
                        } -ArgumentList $Service -ErrorAction Stop
                        
                        if ($ServiceStatus.Status -eq "Running") {
                            Write-Log "Servicio $Service iniciado con éxito en $server" -Level "SUCCESS"
                            $Summary["Servicio $Service"] = "Success"
                            break
                        }
                        
                        if ($ElapsedMinutes -ge $MaxWaitTime) {
                            Write-Log "Servicio $Service no inició en $server tras $MaxWaitTime minutos" -Level "ERROR"
                            $Summary["Servicio $Service"] = "Failure"
                            break
                        }
                        
                        Write-Log "Esperando inicio de $Service en $server... ($([math]::Round($ElapsedMinutes, 1)) min)" -Level "INFO"
                    }
                } else {
                    Write-Log "Servicio $Service está corriendo en $server" -Level "SUCCESS"
                    $Summary["Servicio $Service"] = "Success"
                }
            } catch {
                Write-Log "Error verificando servicio $Service en $server`: $_" -Level "ERROR"
                $Summary["Servicio $Service"] = "Failure"
            }
        }

        # Resumen del servidor
        Write-Log "───────────────────────────────────────────────────────────────"
        Write-Log "Resumen para $server`:"
        foreach ($key in $Summary.Keys) {
            $status = $Summary[$key]
            if ($status -eq "Success") {
                Write-Log "  ✓ $key`: $status" -Level "SUCCESS"
            } elseif ($status -eq "Failure") {
                Write-Log "  ✗ $key`: $status" -Level "ERROR"
            } else {
                Write-Log "  - $key`: $status" -Level "INFO"
            }
        }

        # Determinar estado final del servidor
        $finalStatus = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
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
Write-Log "Exitosos: $successCount ✓"
Write-Log "Fallidos: $failureCount ✗"
Write-Log "Omitidos: $skippedCount -"
Write-Log ""

foreach ($status in $ServerStatus) {
    if ($status.Status -eq "Success") {
        Write-Log "  ✓ $($status.Server) - Reinicio completado correctamente" -Level "SUCCESS"
    } elseif ($status.Status -eq "Failure") {
        Write-Log "  ✗ $($status.Server) - $($status.Reason)" -Level "ERROR"
    } else {
        Write-Log "  - $($status.Server) - $($status.Reason)" -Level "INFO"
    }
}

Write-Log "═══════════════════════════════════════════════════════════════"
Write-Log "  SQLRestartNova WebAPI - Fin de ejecución"
Write-Log "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Log "═══════════════════════════════════════════════════════════════"

# Código de salida basado en resultados
if ($failureCount -gt 0) {
    exit 1
} else {
    exit 0
}

