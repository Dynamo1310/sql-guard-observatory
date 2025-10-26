<#
.SYNOPSIS
    Health Score v3.0 - Autogrowth & Capacity Monitor
    Detecta problemas de crecimiento y capacidad

.DESCRIPTION
    Categoría: AUTOGROWTH & CAPACITY (Peso: 5%)
    
    Métricas clave:
    - Eventos de autogrowth excesivos (últimas 24h)
    - Archivos cerca del límite de maxsize
    - Autogrowth mal configurado (% en archivos grandes)
    - Proyección de espacio libre
    
    Scoring (0-100):
    - 100 pts: <10 autogrouths/día, ningún archivo cerca del límite
    - 80 pts: 10-50 autogrowths/día, archivos con >20% espacio libre
    - 60 pts: 50-100 autogrowths/día o archivos con <20% espacio libre
    - 40 pts: >100 autogrowths/día o archivos con <10% espacio libre
    - 20 pts: >500 autogrowths/día o archivos >90% del maxsize
    - 0 pts: Archivos en maxsize o crecimiento bloqueado
    
    Cap: 50 si algún archivo >90% del maxsize

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
#>

#Requires -Modules dbatools

[CmdletBinding()]
param(
    [string]$ApiBaseUrl = "http://localhost:5000",
    [string]$SqlServer = "asprbm-nov-01\API",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 300
)

#region ===== CONFIGURACIÓN =====

$ErrorActionPreference = "Stop"

#endregion

#region ===== FUNCIONES =====

function Get-AllInstanceNames {
    try {
        $response = Invoke-RestMethod -Uri "$ApiBaseUrl/api/instances/active" -Method Get -TimeoutSec 30
        return $response | Where-Object { $_.isActive } | Select-Object -ExpandProperty instanceName
    }
    catch {
        Write-Error "Error obteniendo instancias desde API: $_"
        return @()
    }
}

function Get-AutogrowthStatus {
    param([string]$Instance)
    
    $query = @"
-- Autogrowth Events (últimas 24h)
SELECT COUNT(*) AS AutogrowthEventsLast24h
FROM sys.fn_dblog(NULL, NULL)
WHERE Operation = 'LOP_GROW_FILE'
  AND [Begin Time] > DATEADD(HOUR, -24, GETDATE());

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
        
        $autogrowthCount = if ($autogrowthEvents.Count -gt 0) { $autogrowthEvents[0].AutogrowthEventsLast24h } else { 0 }
        $filesNearLimit = ($fileInfo | Where-Object { $_.PercentOfMax -gt 80 }).Count
        $filesWithBadGrowth = ($fileInfo | Where-Object { $_.HasIssue -eq 1 }).Count
        $worstPercentOfMax = ($fileInfo | Measure-Object -Property PercentOfMax -Maximum).Maximum
        
        if ($null -eq $worstPercentOfMax) { $worstPercentOfMax = 0 }
        
        # Detalles de archivos problemáticos
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
        [PSCustomObject]$Data
    )
    
    try {
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
    '$($Data.InstanceName)',
    '$($Data.Ambiente)',
    '$($Data.HostingSite)',
    '$($Data.SqlVersion)',
    GETUTCDATE(),
    $($Data.AutogrowthEventsLast24h),
    $($Data.FilesNearLimit),
    $($Data.FilesWithBadGrowth),
    $($Data.WorstPercentOfMax),
    '$($Data.AutogrowthDetails -replace "'", "''")'
);
"@
        
        Invoke-DbaQuery -SqlInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        return $true
    }
    catch {
        Write-Error "Error guardando en SQL: $_"
        return $false
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
Write-Host "[1/2] Obteniendo instancias..." -ForegroundColor Yellow
$instances = Get-AllInstanceNames

if ($instances.Count -eq 0) {
    Write-Error "No se encontraron instancias activas!"
    exit 1
}

Write-Host "   Encontradas: $($instances.Count) instancias" -ForegroundColor Green

# 2. Procesar cada instancia
Write-Host ""
Write-Host "[2/2] Recolectando métricas de autogrowth..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instanceName in $instances) {
    $counter++
    $progress = [math]::Round(($counter / $instances.Count) * 100)
    Write-Progress -Activity "Recolectando autogrowth metrics" -Status "$instanceName ($counter/$($instances.Count))" -PercentComplete $progress
    
    # Obtener metadatos
    try {
        $server = Connect-DbaInstance -SqlInstance $instanceName -NonPooledConnection
        $ambiente = if ($server.Name -like "*PRD*" -or $server.Name -like "*PROD*") { "Produccion" } 
                    elseif ($server.Name -like "*QA*" -or $server.Name -like "*TST*") { "QA" }
                    elseif ($server.Name -like "*DEV*") { "Desarrollo" }
                    else { "Otro" }
        $hostingSite = if ($server.ComputerName -like "*AWS*") { "AWS" } 
                       elseif ($server.ComputerName -like "*AZURE*") { "Azure" }
                       else { "OnPremise" }
        $sqlVersion = $server.VersionString
    }
    catch {
        Write-Warning "No se pudo conectar a ${instanceName}: $_"
        continue
    }
    
    # Obtener métricas
    $autogrowthStatus = Get-AutogrowthStatus -Instance $instanceName
    
    if ($null -eq $autogrowthStatus) {
        Write-Warning "Saltando $instanceName (sin datos)"
        continue
    }
    
    # Crear objeto de resultado
    $result = [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        AutogrowthEventsLast24h = $autogrowthStatus.AutogrowthEventsLast24h
        FilesNearLimit = $autogrowthStatus.FilesNearLimit
        FilesWithBadGrowth = $autogrowthStatus.FilesWithBadGrowth
        WorstPercentOfMax = $autogrowthStatus.WorstPercentOfMax
        AutogrowthDetails = $autogrowthStatus.Details
    }
    
    # Guardar en SQL
    if (Write-ToSqlServer -Data $result) {
        $results += $result
        Write-Host "   ✓ $instanceName - Autogrowths: $($result.AutogrowthEventsLast24h), Files near limit: $($result.FilesNearLimit)" -ForegroundColor Gray
    }
}

Write-Progress -Activity "Recolectando autogrowth metrics" -Completed

# 3. Resumen
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host " RESUMEN - AUTOGROWTH & CAPACITY" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Total instancias procesadas: $($results.Count)" -ForegroundColor White
Write-Host "  Total autogrowth events (24h): $(($results | Measure-Object -Property AutogrowthEventsLast24h -Sum).Sum)" -ForegroundColor White
Write-Host "  Instancias con files near limit: $(($results | Where-Object { $_.FilesNearLimit -gt 0 }).Count)" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Recoleccion completada!" -ForegroundColor Green

#endregion

