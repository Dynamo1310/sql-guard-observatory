# Ver el comando exacto de una tarea
param(
    [string]$TaskName = "HealthScore_v3.2_CPU"
)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$action = $task.Actions[0]

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " COMANDO CONFIGURADO EN LA TAREA: $TaskName" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ejecutable:" -ForegroundColor Yellow
Write-Host $action.Execute -ForegroundColor Gray
Write-Host ""
Write-Host "Argumentos:" -ForegroundColor Yellow
Write-Host $action.Arguments -ForegroundColor Gray
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

