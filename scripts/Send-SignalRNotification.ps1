<#
.SYNOPSIS
    Envía notificación al backend para actualización en tiempo real vía SignalR

.DESCRIPTION
    Script genérico para enviar notificaciones de cualquier tipo al backend.
    Utilizado por los collectors para notificar cuando terminan de procesar datos.

.PARAMETER CollectorName
    Nombre del collector que terminó de ejecutarse (para HealthScore)

.PARAMETER NotificationType
    Tipo de notificación: 'HealthScore', 'Backup', 'Alert', 'Maintenance', 'System'
    
.PARAMETER ApiBaseUrl
    URL base del backend API
    
.PARAMETER InstanceCount
    Número de instancias procesadas (opcional, para HealthScore)
    
.PARAMETER CustomData
    Hashtable con datos personalizados para otros tipos de notificaciones

.EXAMPLE
    # Notificación de HealthScore
    .\Send-SignalRNotification.ps1 -NotificationType 'HealthScore' -CollectorName 'CPU' -InstanceCount 150

.EXAMPLE
    # Notificación de backup
    .\Send-SignalRNotification.ps1 -NotificationType 'Backup' -CustomData @{
        InstanceName = 'SQLPROD01'
        BackupType = 'FULL'
        BackupTime = (Get-Date)
    }

.EXAMPLE
    # Notificación de alerta
    .\Send-SignalRNotification.ps1 -NotificationType 'Alert' -CustomData @{
        InstanceName = 'SQLPROD01'
        AlertType = 'DiskSpaceLow'
        Severity = 'Critical'
        Message = 'Disco C:\ con solo 5% libre'
    }
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('HealthScore', 'Backup', 'Alert', 'Maintenance', 'System')]
    [string]$NotificationType,
    
    [Parameter(Mandatory=$false)]
    [string]$CollectorName,
    
    [Parameter(Mandatory=$false)]
    [string]$ApiBaseUrl = "http://localhost:5000",
    
    [Parameter(Mandatory=$false)]
    [int]$InstanceCount = 0,
    
    [Parameter(Mandatory=$false)]
    [hashtable]$CustomData = @{}
)

$ErrorActionPreference = "SilentlyContinue"

try {
    # Determinar URL según tipo de notificación
    $notificationUrl = switch ($NotificationType) {
        'HealthScore'  { "$ApiBaseUrl/api/notifications/healthscore" }
        'Backup'       { "$ApiBaseUrl/api/notifications/backups" }
        'Alert'        { "$ApiBaseUrl/api/notifications/alert/created" }
        'Maintenance'  { "$ApiBaseUrl/api/notifications/maintenance/started" }
        'System'       { "$ApiBaseUrl/api/notifications/system" }
    }
    
    # Construir body según tipo
    $body = switch ($NotificationType) {
        'HealthScore' {
            @{
                collectorName = $CollectorName
                timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                instanceCount = $InstanceCount
            }
        }
        default {
            if ($CustomData.Count -gt 0) {
                $CustomData
            } else {
                @{
                    timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                }
            }
        }
    }
    
    $bodyJson = $body | ConvertTo-Json -Depth 5
    
    # Enviar notificación con timeout corto (2 segundos) para no bloquear el collector
    $response = Invoke-RestMethod `
        -Uri $notificationUrl `
        -Method Post `
        -Body $bodyJson `
        -ContentType "application/json" `
        -TimeoutSec 2 `
        -ErrorAction SilentlyContinue
    
    Write-Verbose "[SignalR] Notificación enviada: $NotificationType - $CollectorName"
    exit 0
    
} catch {
    # Fallar silenciosamente para no interrumpir el collector
    Write-Verbose "[SignalR] No se pudo enviar notificación (backend offline o timeout): $_"
    # Retornar éxito de todas formas para no marcar el collector como fallido
    exit 0
}

