# ========================================================================================================
# Nombre: SQLRestartNova
# Version: 1.4
# ========================================================================================================
# Autor: Pablo Rodriguez
# Area: Ingenieria de Datos
# ========================================================================================================
# Explicacion del proceso
# ========================================================================================================

#Se va actualizando con las grandes ocurrencias del Gaita.
# 1.	Carga la lista de servidores desde servidores.txt.
# 2.	Reinicio sanitario.
#   a- Reinicia el servidor
#   b- Verifica que el servicio de SQL Server y Agent se encuentren ejecutando. De lo contrario, los inicia.
# 3. Se envia un mail con el resumen de ejecucion por servidor.

#Por cada servidor se genera un log independiente, adicional del log completo del SQLRestartNova. 

# ========================================================================================================
# Lista de servidores >> servidores.txt 
# ========================================================================================================

# sqlserver1.domain.local
# sqlserver2.domain.local
# sqlserver3.domain.local

#=========================================================================================================

# Habilitar los puertos 5986 y 5985 del puerto winRM para ec2 en los SG.
# Probar si funciona el winRM desde la maquina local>> Test-WSMan -ComputerName <serverName>.gscorp.ad
# Si arroja un error por firewall de winRM, aplicar estas politicas en el servidor remoto:
# Enable-PSRemoting -Force
# Set-NetFirewallRule -Name "WINRM-HTTP-In-TCP" -Enabled True
# Set-NetFirewallRule -Name "WINRM-HTTP-In-TCP-PUBLIC" -Enabled True
# Probar si funciona el winRM desde la maquina local>> Test-WSMan -ComputerName <serverName>.gscorp.ad

#=========================================================================================================

#Local
#Install-Module -Name dbatools -Scope CurrentUser
#Install-Module -Name VMware.PowerCLI -Scope CurrentUser -Force

#En servidor central
#Install-Module -Name dbatools -Scope AllUser
#Install-Module -Name VMware.PowerCLI -Scope AllUsers -Force
#========================================================================================
#Para leer el log solo de lectura.
#Conectarse con Powershell y ejectar
#Get-Content "C:\Temp\SQLRestartNova\logs\SQLRestartNova_Log_20250806_172533.log" -Wait
#Get-Content "C:\Temp\SQLRestartNova\logs\Log_Restart_Server_SSPOC17-01_20250806_172533.log" -Wait
#========================================================================================

#Import-Module -Name dbatools
Import-Module SqlServer
# Configuración
#$SrvSystemCenter = "sspr17mcm-01"
#$DBSystemCenter = "CM_001"

$FechaEjecucion = Get-Date -Format "yyyyMMdd_HHmmss"
$LogPath = "C:\Temp\SQLRestartNova\logs\SQLRestartNova_OnDemand_Log_$FechaEjecucion.log"
$ServerLogPath = "C:\Temp\SQLRestartNova\logs"

##Bloque de envio de correo para pruebas
#$EmailTo = "Pablo.Rodriguez@supervielle.com.ar"
$EmailToGestEventos = "ingenieriadedatos@supervielle.com.ar"
##

##Bloque de envio de correo
##$EmailTo = "ingenieriadedatos@supervielle.com.ar"
#$EmailToGestEventos = @("GestiondeIncidentesIT@supervielle.com.ar","GestiondeEventosIT@supervielle.com.ar","ingenieriadedatos@supervielle.com.ar","Thales.Alves-Camargos@supervielle.com.ar")
##

$EmailFrom = "SQLNova@supervielle.com.ar"
#$SMTPServer = "10.241.163.33"
$SMTPServer = "nlb-prod-postfix-06902113c7afb95c.elb.us-east-1.amazonaws.com"

# Crear directorio de logs si no existe
if (!(Test-Path "C:\Temp\SQLRestartNova\logs")) {
    New-Item -ItemType Directory -Path "C:\Temp\SQLRestartNova\logs"
}

# Iniciar el log
Start-Transcript -Path $LogPath -Append

# Archivo de salida
$SQLServersOutput = "C:\Temp\SQLRestartNova\output\servidoresRestart_standalone_OnDemand_$FechaEjecucion.txt"

# Limpiar el archivo de salida si ya existe
if (Test-Path $SQLServersOutput) {
    Clear-Content $SQLServersOutput
}

# Archivo de salida para win2008
$SQLServersOutputWin2008 = "C:\Temp\SQLRestartNova\output\servidoresRestart_standaloneWin2008_OnDemand_$FechaEjecucion.txt"

# Limpiar el archivo de salida si ya existe
if (Test-Path $SQLServersOutputWin2008) {
    Clear-Content $SQLServersOutputWin2008
}

# Leer lista de servidores
$servers = Get-Content "C:\Temp\SQLRestartNova\input\servidoresRestart_OnDemand.txt"

# Recorrer cada servidor y verificar si es un nodo secundario en AlwaysOn
foreach ($server in $servers) {
    try {
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Verificando conectividad con $server ." -ForegroundColor Cyan
        
        # Verificar si el servidor está accesible
        $pingResult = Test-NetConnection -ComputerName $server -Port 1433 -ErrorAction SilentlyContinue

        if (-not $pingResult.TcpTestSucceeded) {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: No se puede conectar al puerto 1433 en $server. Verificar la conectividad de red o el firewall." -ForegroundColor Red            
            continue
        }

         # Obtener la versión de SQL Server
        $versionQuery = "SELECT SERVERPROPERTY('ProductVersion') AS Version"
        $versionResult = Invoke-Sqlcmd -ServerInstance $server -Query $versionQuery -TrustServerCertificate -ErrorAction Stop
        $version = $versionResult.Version

        # Verificar si la versión es anterior a SQL Server 2012 (11.0)
        if ([version]$version -lt [version]"11.0") {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: El Servidor $server es una versión anterior a SQL Server 2012, Debe reiniciarse manualmente. Se deja lista de Server en servidoresRestart_standaloneWin2008_OnDemand_<fecha>." -ForegroundColor Cyan

            Add-Content -Path $SQLServersOutputWin2008 -Value "$server"
            continue
        }

        # Query para verificar si es un nodo secundario en AlwaysOn
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

        # Se ejecuta la query en cada servidor que estan pendiente de reinicio para conocer si es un AllwaysON y es nodo secundario.
        $result = Invoke-Sqlcmd -ServerInstance $server -Query $query -TrustServerCertificate -ErrorAction Stop

        # Verificar si el servidor es un nodo secundario
        if ($result) {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: El Servidor $server es un nodo perteneciente a un AlwaysOn." -ForegroundColor Cyan
        } else {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: El Servidor $server es standalone." -ForegroundColor Cyan
            Add-Content -Path $SQLServersOutput -Value "$server"    
        }
    } catch {
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: Error al conectarse a $server : $_" -ForegroundColor Red        
    }
}

Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Los servidores standalone que requieren reinicio, se han guardado en $SQLServersOutput ." -ForegroundColor Yellow

############################### FIN #####################################################

$SQLServers = Get-Content -Path $SQLServersOutput

##Se comenta bloque de codigo de confirmacion de servers a reiniciar.
# Write-Host "`nINICIO DE REINICIOS DE SQL SERVER - STANDALONE`n" -ForegroundColor Cyan
# Write-Host "Listado de servidores a reiniciar:`n" -ForegroundColor Yellow
# $SQLServers | ForEach-Object { Write-Host "  - $_" -ForegroundColor White }
# Write-Host "`nTotal de servidores: $($SQLServers.Count)`n" -ForegroundColor Green

# $titulo = "Confirmar si la lista de servidores es correcta!"
# $mensaje = "¿Desea continuar con la ejecución del script?"
# $opciones = [System.Management.Automation.Host.ChoiceDescription[]] @("&Sí", "&No")
# $default = 0  # 0 para Sí, 1 para No

# # Mostrar prompt
# $decision = $host.UI.PromptForChoice($titulo, $mensaje, $opciones, $default)

# # Evaluar respuesta
# if ($decision -eq 1) {
#     Write-Host "Ejecución abortada por el usuario." -ForegroundColor Yellow
#     exit
# }
##FIN de Bloque

# Armado de correo
$Body = "Estimados se comienza con el reinicio OnDemand de SQL Server - Standalone.`r`n`r`n"
$Body += "Los servidores son:`r`n"
$Body += ($SQLServers -join "`r`n")

# Enviar correo
Send-MailMessage -From $EmailFrom -To $EmailToGestEventos -Subject "Comunicado - Reinicio OnDemand de SQL Server - SQLRestartNova" -Body $Body -SmtpServer $SMTPServer -Encoding UTF8

#Continua la ejecución
Write-Host "Continuando con la ejecución del script." -ForegroundColor Green

# Lista para almacenar el estado de cada servidor
$ServerStatus = [System.Collections.Concurrent.ConcurrentBag[PSCustomObject]]::new()

# Ejecutar en paralelo para cada servidor (máximo 3 servidores simultáneos)
$SQLServers | ForEach-Object -Parallel {

    # Función para verificar servicios
    function VerificarServicios {
    param (
        [string]$SQLServer,
        [array]$servicios,
        [string]$ServerLogFile,
        [hashtable]$Summary
    )
    try {
        # Iniciar el temporizador
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

        do {
            $todosServiciosActivos = $true

            foreach ($servicio in $servicios) {
                # Obtener el estado del servicio en el servidor remoto
                $estadoServicio = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                    param($servicio)
                    Get-Service -Name $servicio | Select-Object Name, Status
                } -ArgumentList $servicio -ErrorAction Stop

                # Verificar si el servicio no está en estado Running (Status = 4)
                if ($estadoServicio.Status -ne 4) {
                    $todosServiciosActivos = $false
                    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $($estadoServicio.Name) no está corriendo en $SQLServer. Se espera.." -ForegroundColor Cyan
                    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $($estadoServicio.Name) no está corriendo en $SQLServer. Se espera.." | Out-File -Append -FilePath $ServerLogFile
                }
            }

            # Si no todos los servicios están activos, esperar 10 segundos antes de volver a verificar
            if (-not $todosServiciosActivos) {
                Start-Sleep -Seconds 10
            }

            # Verificar si se ha superado el tiempo límite (30 minutos)
            if ($stopwatch.Elapsed.TotalMinutes -ge 30) {
                Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - WARNING: Se superó el tiempo límite de 30 minutos en la verificación de servicios en $SQLServer. Abortando..." -ForegroundColor Yellow
                Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - WARNING: Se superó el tiempo límite de 30 minutos en la verificación de servicios en $SQLServer. Abortando..." | Out-File -Append -FilePath $ServerLogFile
                $Summary["Servicio OS"] = "Failure"
                return $false
            }

        } while (-not $todosServiciosActivos)

        # Mensaje final cuando todos los servicios están en estado Running
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servidor: $SQLServer - Todos los servicios básicos están en estado Running." -ForegroundColor Green
        Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servidor: $SQLServer - Todos los servicios básicos están en estado Running." | Out-File -Append -FilePath $ServerLogFile
        $Summary["Servicio OS"] = "Success"

        # Devolver $true para indicar que la ejecución fue exitosa
        return $true
    } catch {
        # Capturar el error y devolver $false para indicar que la ejecución falló
        $errorMessage = "Error al verificar servicios en $SQLServer : $_"
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: $errorMessage" -ForegroundColor Red
        Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: $errorMessage" | Out-File -Append -FilePath $ServerLogFile
        $Summary["Servicio OS"] = "Failure"

        # Devolver $false para indicar que la ejecución falló
        return $false
    }
}
    # Función para verificar discos
    function VerificarDiscos {
        param (
            [string]$SQLServer,
            [string]$ServerLogFile,
            [hashtable]$Summary
        )
        try {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Verificando discos en $SQLServer." -ForegroundColor Cyan
            Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Verificando discos en $SQLServer." | Out-File -Append -FilePath $ServerLogFile

            $discosProblema = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                Get-Disk | Where-Object { $_.OperationalStatus -eq "Offline" -or $_.IsOffline -eq $true -or $_.IsReadOnly -eq $true }
            } -ErrorAction Stop

            if ($discosProblema) {
                foreach ($disco in $discosProblema) {
                    Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                        param($disco)
                        
                        # Registrar estado inicial
                        $estadoInicial = Get-Disk -Number $disco.Number
                        Write-Host "Disco $($disco.Number) - Estado inicial: Offline=$($estadoInicial.IsOffline), ReadOnly=$($estadoInicial.IsReadOnly)"
                        
                        # Quitar estado offline si está presente
                        if ($estadoInicial.IsOffline) {
                            Set-Disk -Number $disco.Number -IsOffline $false
                            Start-Sleep -Seconds 2
                        }
                        
                        # Quitar estado read-only si está presente
                        $estadoIntermedio = Get-Disk -Number $disco.Number
                        if ($estadoIntermedio.IsReadOnly) {
                            Set-Disk -Number $disco.Number -IsReadOnly $false
                            Start-Sleep -Seconds 2
                        }
                        
                        # Verificar estado final
                        $estadoFinal = Get-Disk -Number $disco.Number
                        Write-Host "Disco $($disco.Number) - Estado final: Offline=$($estadoFinal.IsOffline), ReadOnly=$($estadoFinal.IsReadOnly)"
                        
                        return @{
                            Number = $disco.Number
                            InitialOffline = $estadoInicial.IsOffline
                            InitialReadOnly = $estadoInicial.IsReadOnly
                            FinalOffline = $estadoFinal.IsOffline
                            FinalReadOnly = $estadoFinal.IsReadOnly
                        }
                        
                    } -ArgumentList $disco -ErrorAction Stop

                    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Disco $($disco.Number) configurado correctamente en $SQLServer." -ForegroundColor Green
                    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Disco $($disco.Number) configurado correctamente en $SQLServer." | Out-File -Append -FilePath $ServerLogFile
                }
                $Summary["Discos"] = "Success"
            } else {
                Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: No se encontraron discos problemáticos en $SQLServer." -ForegroundColor Green
                Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: No se encontraron discos problemáticos en $SQLServer." | Out-File -Append -FilePath $ServerLogFile
                $Summary["Discos"] = "Success"
            }

            return $true
        } catch {
            $errorMessage = "Error al verificar discos en $SQLServer : $_"
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: $errorMessage" -ForegroundColor Red
            Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: $errorMessage" | Out-File -Append -FilePath $ServerLogFile
            $Summary["Discos"] = "Failure"
            return $false
        }
    }

    $SQLServer = $_
    $ServerLogFile = "$using:ServerLogPath\Log_Restart_Server_$($SQLServer)_$using:FechaEjecucion.log"
    $Summary = @{}

    # Reiniciar el servidor
    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Reiniciando $SQLServer." -ForegroundColor Cyan
    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Reiniciando $SQLServer." | Out-File -Append -FilePath $ServerLogFile

    try {
        Restart-Computer -ComputerName $SQLServer -Force -Wait -For PowerShell -ErrorAction Stop
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Reinicio exitoso en $SQLServer." -ForegroundColor Green
        Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Reinicio exitoso en $SQLServer." | Out-File -Append -FilePath $ServerLogFile
        $Summary["Reinicio"] = "Success"
    } catch {
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: Error en el reinicio de $SQLServer. falló: $_." -ForegroundColor Red
        Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: Error en el reinicio de $SQLServer. falló: $_." | Out-File -Append -FilePath $ServerLogFile
        $Summary["Reinicio"] = "Failure"                           
        # Guardar el resumen en el log individual del servidor
        $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile
        # Agregar el estado del servidor a la lista
        $ServerStatus += [PSCustomObject]@{
        Server = $SQLServer
        Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
        }
        continue
    }

    $pingResult = Test-Connection -ComputerName $SQLServer -Count 5 -Quiet
    if ($pingResult) {
       Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: ping exitoso en $SQLServer." -ForegroundColor Green
       Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: ping exitoso en $SQLServer." | Out-File -Append -FilePath $ServerLogFile	
       $Summary["Ping"] = "Success"
    } else {
       Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: Error en el ping de $SQLServer. Omitiendo pasos siguientes." -ForegroundColor Red
       Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: Error en el ping de $SQLServer. Omitiendo pasos siguientes." | Out-File -Append -FilePath $ServerLogFile	
       $Summary["Ping"] = "Failure"

       # Guardar el resumen en el log individual del servidor
       $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile
       # Agregar el estado del servidor a la lista
       $ServerStatus += [PSCustomObject]@{
           Server = $SQLServer
           Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
       }

       continue
    } 

    # Verificar servicios básicos (Netlogon, RpcSs, WinRM)
    $serviciosBasicos = @("Netlogon", "RpcSs", "WinRM")
    $rtaFunc = VerificarServicios -SQLServer $SQLServer -servicios $serviciosBasicos -ServerLogFile $ServerLogFile -Summary $Summary
    if (-not $rtaFunc) {        
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: La verificación de servicios en $SQLServer falló o se superó el tiempo límite. Omitiendo pasos siguientes. Se continua con el proximo servidor" -ForegroundColor Red
        $Summary["Servicio OS"] = "Failure"
        # Guardar el resumen en el log individual del servidor
        $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile
        # Agregar el estado del servidor a la lista
        $ServerStatus += [PSCustomObject]@{
          Server = $SQLServer
          Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
        }
        continue  # Saltar al siguiente Servidor
    }

    # Verificar discos después del reinicio
    $rtaDiscos = VerificarDiscos -SQLServer $SQLServer -ServerLogFile $ServerLogFile -Summary $Summary
    if (-not $rtaDiscos) {
        Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: La verificación de discos en $SQLServer falló después del reinicio." -ForegroundColor Red
        Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - ERROR: La verificación de discos en $SQLServer falló después del reinicio." | Out-File -Append -FilePath $ServerLogFile

        $Summary["Discos"] = "Failure"
        # Guardar el resumen en el log individual del servidor
        $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile
        # Agregar el estado del servidor a la lista
        $ServerStatus += [PSCustomObject]@{
          Server = $SQLServer
          Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
        }

        continue
    }


    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Para chequear los servicios, esperamos 1 minuto luego del reinicio..." -ForegroundColor Yellow
    Start-Sleep -Seconds 60  # Esperar 1 minuto hasta que el servicio de SQL se encuentre Running.

    # Verificar que los servicios de SQL Server y SQL Agent estén arriba
    $Services = @("MSSQLSERVER", "SQLSERVERAGENT")
    $MaxWaitTime = 5 # Tiempo máximo de espera en minutos

    foreach ($Service in $Services) {
        $StartTime = Get-Date
        $ServiceStatus = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
            param ($Service)
            Get-Service -Name $Service
        } -ArgumentList $Service

        if ($ServiceStatus.Status -ne "Running") {
            Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service no está corriendo en $SQLServer. Intentando iniciar." -ForegroundColor Cyan
            Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service no está corriendo en $SQLServer. Intentando iniciar." | Out-File -Append -FilePath $ServerLogFile	

            Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                param ($Service)
                Start-Service -Name $Service -ErrorAction Stop
            } -ArgumentList $Service -ErrorAction SilentlyContinue

            # Bucle para esperar hasta que el servicio esté en estado Running
            while ($true) {
                Start-Sleep -Seconds 60 # Espera 1 minuto
                $ElapsedMinutes = (New-TimeSpan -Start $StartTime -End (Get-Date)).Minutes
                
                # Consultar nuevamente el estado del servicio
                $ServiceStatus = Invoke-Command -ComputerName $SQLServer -ScriptBlock {
                    param ($Service)
                    Get-Service -Name $Service
                } -ArgumentList $Service
                
                if ($ServiceStatus.Status -eq "Running") {
                    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service iniciado con éxito en $SQLServer." -ForegroundColor Green
                    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service iniciado con éxito en $SQLServer." | Out-File -Append -FilePath $ServerLogFile
                    $Summary["Servicio $Service"] = "Success"
                    break
                }
                
                if ($ElapsedMinutes -ge $MaxWaitTime) {
                    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service no inició en $SQLServer tras $MaxWaitTime minutos. Continuando con el siguiente servidor." -ForegroundColor Red
                    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service no inició en $SQLServer tras $MaxWaitTime minutos. Continuando con el siguiente servidor." | Out-File -Append -FilePath $ServerLogFile
                    $Summary["Servicio $Service"] = "Failure"
                    
                    # Guardar el resumen en el log individual del servidor
                    $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile
                    # Agregar el estado del servidor a la lista
                    $ServerStatus += [PSCustomObject]@{
                        Server = $SQLServer
                        Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
                    }
                    # Saltar al siguiente servidor sin ejecutar los pasos siguientes
                    continue 2
                }
            }
        }
        else {
          Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service está corriendo en $SQLServer. " -ForegroundColor Green
          Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Servicio $Service está corriendo en $SQLServer. " | Out-File -Append -FilePath $ServerLogFile
          $Summary["Servicio $Service"] = "Success"
        }
    }

    Write-Host "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Resumen de la ejecucion para $SQLServer :" -ForegroundColor Cyan
    Write-Output "$(Get-Date -Format 'yyyy/MM/dd-HH:mm:ss') - INFO: Resumen de la ejecucion para $SQLServer :" | Out-File -Append -FilePath $ServerLogFile

    foreach ($key in $Summary.Keys) {
        $color = if ($Summary[$key] -eq "Success") { "Green" } else { "Red" }
        Write-Host "$key : $($Summary[$key])" -ForegroundColor $color		
    }
    # Guardar el resumen en el log individual del servidor
    $Summary | ConvertTo-Json -Depth 2 | Out-File -Append -FilePath $ServerLogFile

    # Agregar el estado del servidor a la lista
    $resultado += [PSCustomObject]@{
        Server = $SQLServer
        Status = if ($Summary.Values -contains "Failure") { "Failure" } else { "Success" }
    }
    $ServerStatus = $using:ServerStatus
    $ServerStatus.Add($resultado)
} -ThrottleLimit 3  # Limitar a 3 servidores simultáneos

# Finalizar el log
Stop-Transcript

# Enviar correo con el resultado
$Body = "`r`n`r`nEstimados se finalizó con el reinicio OnDemand de SQL - Standalone.`r`n`r`n"
$Body += "Resumen de servidores:`r`n`r`n"

foreach ($status in $ServerStatus) {
    if ($status.Status -eq "Success") {
        $Body += "$($status.Server): ✔️ - El proceso de reinicio se completó correctamente.`r`n"
    } else {
        $Body += "$($status.Server): ❌ - Hubo un error durante el proceso de reinicio.`r`n"
    }
}

$Body += "`r`nPor favor revisar los logs adjuntos!.`r`n"
$Body += "Ingenieria de datos.`r`n"

$Attachments = @()
if (Test-Path $LogPath) {
    $Attachments += $LogPath
}

# Enviar correo solo si hay archivos adjuntos
Send-MailMessage -From $EmailFrom -To $EmailToGestEventos -Subject "Comunicado - Reinicio OnDemand de SQL Server - SQLRestartNova" -Body $Body -SmtpServer $SMTPServer -Attachments $Attachments -Encoding UTF8