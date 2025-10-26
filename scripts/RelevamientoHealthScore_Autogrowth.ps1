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
$TimeoutSec = 15
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

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
        [array]$Data
    )
    
    if ($Data.Count -eq 0) {
        Write-Host "No hay datos para guardar." -ForegroundColor Yellow
        return
    }
    
    try {
        foreach ($row in $Data) {
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
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.AutogrowthEventsLast24h),
    $($row.FilesNearLimit),
    $($row.FilesWithBadGrowth),
    $($row.WorstPercentOfMax),
    '$($row.AutogrowthDetails -replace "'", "''")'
);
"@
        
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
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 - AUTOGROWTH & CAPACITY" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
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
Write-Host "2️⃣  Recolectando métricas de autogrowth..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Test connection
    try {
        $connection = Test-DbaConnection -SqlInstance $instanceName -EnableException
        if (-not $connection.IsPingable) {
            Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
            continue
        }
    } catch {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Obtener métricas
    $autogrowthStatus = Get-AutogrowthStatus -Instance $instanceName
    
    if ($null -eq $autogrowthStatus) {
        Write-Host "   ⚠️  $instanceName - Sin datos (skipped)" -ForegroundColor Yellow
        continue
    }
    
    $status = "✅"
    if ($autogrowthStatus.FilesNearLimit -gt 0) {
        $status = "🚨 FILES NEAR LIMIT!"
    } elseif ($autogrowthStatus.AutogrowthEventsLast24h -gt 100) {
        $status = "⚠️  HIGH AUTOGROWTH"
    } elseif ($autogrowthStatus.FilesWithBadGrowth -gt 0) {
        $status = "⚠️  BAD GROWTH CONFIG"
    }
    
    Write-Host "   $status $instanceName - Events:$($autogrowthStatus.AutogrowthEventsLast24h) NearLimit:$($autogrowthStatus.FilesNearLimit) BadGrowth:$($autogrowthStatus.FilesWithBadGrowth)" -ForegroundColor Gray
    
    # Crear objeto de resultado
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        AutogrowthEventsLast24h = $autogrowthStatus.AutogrowthEventsLast24h
        FilesNearLimit = $autogrowthStatus.FilesNearLimit
        FilesWithBadGrowth = $autogrowthStatus.FilesWithBadGrowth
        WorstPercentOfMax = $autogrowthStatus.WorstPercentOfMax
        AutogrowthDetails = ($autogrowthStatus.Details | ConvertTo-Json -Compress)
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
Write-Host "║  RESUMEN - AUTOGROWTH & CAPACITY                      ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$totalEvents = ($results | Measure-Object -Property AutogrowthEventsLast24h -Sum).Sum
Write-Host "║  Autogrowth events (24h):  $totalEvents".PadRight(53) "║" -ForegroundColor White

$nearLimit = ($results | Where-Object { $_.FilesNearLimit -gt 0 }).Count
Write-Host "║  Files near limit:     $nearLimit".PadRight(53) "║" -ForegroundColor White

$badGrowth = ($results | Where-Object { $_.FilesWithBadGrowth -gt 0 }).Count
Write-Host "║  Files with bad growth:    $badGrowth".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

