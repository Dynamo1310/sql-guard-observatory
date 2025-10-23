<#
.SYNOPSIS
    Script de ejemplo para ejecutar el relevamiento de HealthScore.

.DESCRIPTION
    Este script proporciona diferentes escenarios de ejecución del relevamiento
    de HealthScore con configuraciones predefinidas.
    
    Modifica los parámetros según tus necesidades y descomenta el escenario deseado.
#>

# =========================================================================
# CONFIGURACIÓN
# =========================================================================

$ScriptPath = Join-Path $PSScriptRoot "RelevamientoHealthScoreMant.ps1"

# Verificar que existe el script
if (-not (Test-Path $ScriptPath)) {
    Write-Error "No se encontró el script: $ScriptPath"
    exit 1
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Ejecutar HealthScore - Selector de Modo" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# =========================================================================
# MENÚ DE SELECCIÓN
# =========================================================================

Write-Host "Selecciona el modo de ejecución:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  [1] 🧪 Modo de Prueba (5 instancias, salida detallada)" -ForegroundColor Cyan
Write-Host "  [2] Ejecución Rápida (5 instancias, secuencial)" -ForegroundColor White
Write-Host "  [3] Ejecución Completa (todas, secuencial)" -ForegroundColor White
Write-Host "  [4] Ejecución Completa Paralela (todas, 8 threads)" -ForegroundColor White
Write-Host "  [5] Ejecución con Guardado SQL (todas, paralelo)" -ForegroundColor White
Write-Host "  [6] Modo Mock (testing con datos sintéticos)" -ForegroundColor White
Write-Host "  [7] Ejecución Personalizada" -ForegroundColor White
Write-Host "  [0] Salir" -ForegroundColor Gray
Write-Host ""

$opcion = Read-Host "Opción"

switch ($opcion) {
    
    # =====================================================================
    # OPCIÓN 1: Modo de Prueba (TestMode)
    # =====================================================================
    "1" {
        Write-Host ""
        Write-Host "Ejecutando: Modo de Prueba (5 instancias, salida detallada)..." -ForegroundColor Cyan
        Write-Host ""
        
        & $ScriptPath -TestMode
        
        Write-Host ""
        Write-Host "✅ Modo de prueba completado" -ForegroundColor Green
        Write-Host ""
        Write-Host "Comandos útiles para revisar resultados:" -ForegroundColor Cyan
        Write-Host "  Import-Csv .\InstanceHealth.csv | Format-Table" -ForegroundColor Gray
        Write-Host "  Get-Content .\InstanceHealth.json | ConvertFrom-Json | Format-List" -ForegroundColor Gray
    }
    
    # =====================================================================
    # OPCIÓN 2: Ejecución Rápida (Testing)
    # =====================================================================
    "2" {
        Write-Host ""
        Write-Host "Ejecutando: Modo Rápido (5 instancias)..." -ForegroundColor Green
        Write-Host ""
        
        & $ScriptPath -TestLimit 5
        
        Write-Host ""
        Write-Host "Archivos generados:" -ForegroundColor Cyan
        Write-Host "  - InstanceHealth.json" -ForegroundColor Gray
        Write-Host "  - InstanceHealth.csv" -ForegroundColor Gray
    }
    
    # =====================================================================
    # OPCIÓN 3: Ejecución Completa Secuencial
    # =====================================================================
    "3" {
        Write-Host ""
        Write-Host "Ejecutando: Modo Completo (secuencial)..." -ForegroundColor Green
        Write-Host "⚠️  Esto puede tardar 10-20 minutos dependiendo del número de instancias" -ForegroundColor Yellow
        Write-Host ""
        
        $confirm = Read-Host "¿Continuar? (S/N)"
        if ($confirm -eq "S" -or $confirm -eq "s") {
            & $ScriptPath
        } else {
            Write-Host "Cancelado por el usuario." -ForegroundColor Gray
        }
    }
    
    # =====================================================================
    # OPCIÓN 4: Ejecución Completa Paralela
    # =====================================================================
    "4" {
        Write-Host ""
        Write-Host "Ejecutando: Modo Paralelo (8 threads)..." -ForegroundColor Green
        Write-Host "⚠️  Esto puede tardar 3-8 minutos" -ForegroundColor Yellow
        Write-Host ""
        
        & $ScriptPath -Parallel -Throttle 8
        
        Write-Host ""
        Write-Host "Archivos generados:" -ForegroundColor Cyan
        Write-Host "  - InstanceHealth.json" -ForegroundColor Gray
        Write-Host "  - InstanceHealth.csv" -ForegroundColor Gray
    }
    
    # =====================================================================
    # OPCIÓN 5: Ejecución con Guardado en SQL
    # =====================================================================
    "5" {
        Write-Host ""
        Write-Host "Ejecutando: Modo Completo con SQL (paralelo)..." -ForegroundColor Green
        Write-Host "⚠️  Guardará en: SSPR17MON-01.SQLNova.dbo.InstanceHealthSnapshot" -ForegroundColor Yellow
        Write-Host ""
        
        $confirm = Read-Host "¿Continuar? (S/N)"
        if ($confirm -eq "S" -or $confirm -eq "s") {
            & $ScriptPath -Parallel -Throttle 8 -WriteToSql
            
            Write-Host ""
            Write-Host "Datos guardados en SQL Server." -ForegroundColor Green
            Write-Host "Consulta con: SELECT * FROM dbo.vw_HealthScoreSummary" -ForegroundColor Cyan
        } else {
            Write-Host "Cancelado por el usuario." -ForegroundColor Gray
        }
    }
    
    # =====================================================================
    # OPCIÓN 6: Modo Mock
    # =====================================================================
    "6" {
        Write-Host ""
        Write-Host "Ejecutando: Modo MOCK (datos sintéticos)..." -ForegroundColor Yellow
        Write-Host ""
        
        & $ScriptPath -Mock
        
        Write-Host ""
        Write-Host "Archivos generados con datos de prueba:" -ForegroundColor Cyan
        Write-Host "  - InstanceHealth.json" -ForegroundColor Gray
        Write-Host "  - InstanceHealth.csv" -ForegroundColor Gray
    }
    
    # =====================================================================
    # OPCIÓN 7: Ejecución Personalizada
    # =====================================================================
    "7" {
        Write-Host ""
        Write-Host "=== Configuración Personalizada ===" -ForegroundColor Cyan
        Write-Host ""
        
        $customParams = @{}
        
        # Timeout
        $timeout = Read-Host "Timeout SQL en segundos (default: 10)"
        if ($timeout) {
            $customParams.TimeoutSec = [int]$timeout
        }
        
        # Paralelo
        $paralelo = Read-Host "¿Usar modo paralelo? (S/N)"
        if ($paralelo -eq "S" -or $paralelo -eq "s") {
            $customParams.Parallel = $true
            
            $threads = Read-Host "Número de threads (default: 8)"
            if ($threads) {
                $customParams.Throttle = [int]$threads
            }
        }
        
        # Guardar SQL
        $saveSQL = Read-Host "¿Guardar en SQL? (S/N)"
        if ($saveSQL -eq "S" -or $saveSQL -eq "s") {
            $customParams.WriteToSql = $true
        }
        
        # Test Limit
        $testLimit = Read-Host "Límite de instancias (0 = sin límite)"
        if ($testLimit -and [int]$testLimit -gt 0) {
            $customParams.TestLimit = [int]$testLimit
        }
        
        # Archivos de salida
        $customJson = Read-Host "Archivo JSON de salida (Enter para default)"
        if ($customJson) {
            $customParams.OutJson = $customJson
        }
        
        $customCsv = Read-Host "Archivo CSV de salida (Enter para default)"
        if ($customCsv) {
            $customParams.OutCsv = $customCsv
        }
        
        Write-Host ""
        Write-Host "Ejecutando con configuración personalizada..." -ForegroundColor Green
        Write-Host ""
        
        & $ScriptPath @customParams
    }
    
    # =====================================================================
    # OPCIÓN 0: Salir
    # =====================================================================
    "0" {
        Write-Host ""
        Write-Host "Saliendo..." -ForegroundColor Gray
        exit 0
    }
    
    # =====================================================================
    # Opción inválida
    # =====================================================================
    default {
        Write-Host ""
        Write-Host "Opción inválida." -ForegroundColor Red
        exit 1
    }
}

# =========================================================================
# POST-EJECUCIÓN
# =========================================================================

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan

# Verificar si se generaron los archivos
$jsonExists = Test-Path ".\InstanceHealth.json"
$csvExists = Test-Path ".\InstanceHealth.csv"

if ($jsonExists -or $csvExists) {
    Write-Host ""
    Write-Host "✅ Archivos disponibles:" -ForegroundColor Green
    
    if ($jsonExists) {
        $jsonSize = (Get-Item ".\InstanceHealth.json").Length / 1KB
        Write-Host "   📄 InstanceHealth.json ($([Math]::Round($jsonSize, 2)) KB)" -ForegroundColor Gray
    }
    
    if ($csvExists) {
        $csvSize = (Get-Item ".\InstanceHealth.csv").Length / 1KB
        $csvLines = (Get-Content ".\InstanceHealth.csv" | Measure-Object -Line).Lines - 1
        Write-Host "   📊 InstanceHealth.csv ($([Math]::Round($csvSize, 2)) KB, $csvLines instancias)" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Comandos útiles:" -ForegroundColor Cyan
    Write-Host "  Ver resumen JSON:  Get-Content .\InstanceHealth.json | ConvertFrom-Json | Format-Table InstanceName, HealthStatus, HealthScore" -ForegroundColor DarkGray
    Write-Host "  Ver resumen CSV:   Import-Csv .\InstanceHealth.csv | Format-Table" -ForegroundColor DarkGray
    Write-Host "  Críticos en CSV:   Import-Csv .\InstanceHealth.csv | Where-Object HealthStatus -eq 'Critical'" -ForegroundColor DarkGray
}

Write-Host ""

# =========================================================================
# EJEMPLOS ADICIONALES COMENTADOS
# =========================================================================

<#

# ---------------------------------------------------------------------
# EJEMPLO A: Ejecución diaria automatizada con logs
# ---------------------------------------------------------------------

$logFile = "C:\Logs\HealthScore_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
$outJson = "C:\Reports\HealthScore_$(Get-Date -Format 'yyyyMMdd').json"
$outCsv = "C:\Reports\HealthScore_$(Get-Date -Format 'yyyyMMdd').csv"

& $ScriptPath `
    -Parallel `
    -Throttle 10 `
    -WriteToSql `
    -OutJson $outJson `
    -OutCsv $outCsv `
    -TimeoutSec 15 `
    *>&1 | Tee-Object -FilePath $logFile

# ---------------------------------------------------------------------
# EJEMPLO B: Enviar alerta por email si hay instancias críticas
# ---------------------------------------------------------------------

& $ScriptPath -Parallel -Throttle 8

$results = Import-Csv ".\InstanceHealth.csv"
$critical = $results | Where-Object { $_.HealthStatus -eq "Critical" }

if ($critical.Count -gt 0) {
    $htmlBody = $critical | ConvertTo-Html -Property InstanceName, Ambiente, HealthScore, WorstVolumeFreePct -Fragment
    
    $mailParams = @{
        To = "dba-team@empresa.com"
        From = "sqlmonitoring@empresa.com"
        Subject = "⚠️ ALERTA: $($critical.Count) instancias SQL en estado crítico"
        Body = @"
<h2>Instancias SQL Críticas Detectadas</h2>
<p>Se encontraron <strong>$($critical.Count)</strong> instancias con HealthScore < 70.</p>
$htmlBody
<p><em>Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</em></p>
"@
        BodyAsHtml = $true
        SmtpServer = "smtp.empresa.com"
        Port = 587
        UseSsl = $true
    }
    
    Send-MailMessage @mailParams
    Write-Host "Alerta enviada por email." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------
# EJEMPLO C: Guardar archivos con timestamp en carpeta específica
# ---------------------------------------------------------------------

$reportDir = "C:\Reports\HealthScore"
if (-not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$jsonOut = Join-Path $reportDir "HealthScore_$timestamp.json"
$csvOut = Join-Path $reportDir "HealthScore_$timestamp.csv"

& $ScriptPath `
    -Parallel `
    -Throttle 12 `
    -OutJson $jsonOut `
    -OutCsv $csvOut `
    -WriteToSql

Write-Host "Reportes guardados en: $reportDir" -ForegroundColor Green

# ---------------------------------------------------------------------
# EJEMPLO D: Comparar con ejecución anterior
# ---------------------------------------------------------------------

$prevCsv = ".\InstanceHealth_previous.csv"
$currCsv = ".\InstanceHealth.csv"

& $ScriptPath -Parallel -Throttle 8

if (Test-Path $prevCsv) {
    $prev = Import-Csv $prevCsv | Select-Object InstanceName, HealthScore
    $curr = Import-Csv $currCsv | Select-Object InstanceName, HealthScore
    
    $comparison = $curr | ForEach-Object {
        $currentInst = $_
        $prevInst = $prev | Where-Object { $_.InstanceName -eq $currentInst.InstanceName }
        
        if ($prevInst) {
            [PSCustomObject]@{
                InstanceName = $currentInst.InstanceName
                ScorePrevio = [int]$prevInst.HealthScore
                ScoreActual = [int]$currentInst.HealthScore
                Cambio = [int]$currentInst.HealthScore - [int]$prevInst.HealthScore
                Tendencia = if ([int]$currentInst.HealthScore - [int]$prevInst.HealthScore -gt 5) { "⬆️ Mejoró" }
                           elseif ([int]$currentInst.HealthScore - [int]$prevInst.HealthScore -lt -5) { "⬇️ Empeoró" }
                           else { "➡️ Estable" }
            }
        }
    }
    
    Write-Host ""
    Write-Host "=== Comparación con ejecución anterior ===" -ForegroundColor Cyan
    $comparison | Sort-Object Cambio | Format-Table -AutoSize
}

# Guardar como "previous" para próxima ejecución
Copy-Item $currCsv $prevCsv -Force

# ---------------------------------------------------------------------
# EJEMPLO E: Integración con Azure DevOps / CI/CD Pipeline
# ---------------------------------------------------------------------

& $ScriptPath -Parallel -Throttle 8 -WriteToSql

$results = Import-Csv ".\InstanceHealth.csv"
$criticalCount = ($results | Where-Object { $_.HealthStatus -eq "Critical" }).Count
$avgScore = ($results | Measure-Object -Property HealthScore -Average).Average

# Publicar métricas a Azure DevOps
Write-Host "##vso[task.setvariable variable=CriticalInstancesCount]$criticalCount"
Write-Host "##vso[task.setvariable variable=AvgHealthScore]$([int]$avgScore)"

# Fallar el pipeline si hay más de 5 instancias críticas
if ($criticalCount -gt 5) {
    Write-Host "##vso[task.logissue type=error]Demasiadas instancias críticas: $criticalCount"
    Write-Host "##vso[task.complete result=Failed;]"
    exit 1
}

#>

