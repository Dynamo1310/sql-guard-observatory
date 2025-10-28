<#
.SYNOPSIS
    Script de diagnóstico para identificar problemas en RelevamientoHealthScore_ConfiguracionTempdb.ps1
    
.DESCRIPTION
    Ejecuta las queries principales del script de forma individual para identificar cuál está fallando
    
.PARAMETER InstanceName
    Nombre de la instancia a diagnosticar (ej: "SERVER\INSTANCE")
    
.EXAMPLE
    .\Diagnosticar-ConfigTempdb.ps1 -InstanceName "MISERVIDOR\SQL2019"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$InstanceName
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DIAGNÓSTICO: Configuración & TempDB                  ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Instancia: $InstanceName" -ForegroundColor Yellow
Write-Host ""

# Verificar dbatools
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado"
    exit 1
}

Import-Module dbatools -Force

$TimeoutSec = 15

# Test 0: Conexión básica
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 0: Conexión Básica" -ForegroundColor Cyan
try {
    $conn = Test-DbaConnection -SqlInstance $InstanceName -EnableException
    if ($conn.IsPingable) {
        Write-Host "✅ Conexión OK" -ForegroundColor Green
        Write-Host "   Versión: $($conn.Version)" -ForegroundColor Gray
        Write-Host "   Producto: $($conn.Product)" -ForegroundColor Gray
    }
    else {
        Write-Host "❌ No se puede conectar" -ForegroundColor Red
        exit 1
    }
}
catch {
    Write-Host "❌ Error de conexión: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 1: Versión de SQL Server
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 1: Detección de Versión" -ForegroundColor Cyan
try {
    $versionQuery = "SELECT SERVERPROPERTY('ProductVersion') AS Version, @@VERSION AS VersionString"
    $versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
    $version = $versionResult.Version
    $majorVersion = [int]($version.Split('.')[0])
    
    Write-Host "✅ Versión detectada: $version (Major: $majorVersion)" -ForegroundColor Green
    
    if ($majorVersion -lt 10) {
        Write-Host "   ⚠️  SQL Server 2005 (9.x)" -ForegroundColor Yellow
    }
    elseif ($majorVersion -eq 10) {
        Write-Host "   SQL Server 2008/2008 R2 (10.x)" -ForegroundColor Gray
    }
    elseif ($majorVersion -eq 11) {
        Write-Host "   SQL Server 2012 (11.x)" -ForegroundColor Gray
    }
    else {
        Write-Host "   SQL Server 2014+ ($majorVersion.x)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    $majorVersion = 10
}

# Test 2: TempDB Files
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 2: Archivos de TempDB" -ForegroundColor Cyan
try {
    $queryTempDBFiles = @"
SELECT 
    COUNT(*) AS FileCount,
    SUM(size * 8 / 1024) AS TotalSizeMB,
    AVG(size * 8 / 1024) AS AvgSizeMB,
    MIN(size * 8 / 1024) AS MinSizeMB,
    MAX(size * 8 / 1024) AS MaxSizeMB
FROM sys.master_files
WHERE database_id = DB_ID('tempdb')
  AND type_desc = 'ROWS';
"@
    
    $tempdbFiles = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryTempDBFiles -QueryTimeout $TimeoutSec -EnableException
    if ($tempdbFiles) {
        Write-Host "✅ Query exitosa" -ForegroundColor Green
        Write-Host "   Archivos: $($tempdbFiles.FileCount)" -ForegroundColor White
        Write-Host "   Tamaño total: $($tempdbFiles.TotalSizeMB) MB" -ForegroundColor White
        Write-Host "   Promedio: $($tempdbFiles.AvgSizeMB) MB" -ForegroundColor White
        
        if ($tempdbFiles.TotalSizeMB -eq 0) {
            Write-Host "   ⚠️  TAMAÑO = 0 MB (dato sospechoso)" -ForegroundColor Yellow
        }
    }
    else {
        Write-Host "❌ Query no retornó datos" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: TempDB Space Usage (SQL 2012+)
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 3: Espacio Usado en TempDB (SQL 2012+)" -ForegroundColor Cyan
if ($majorVersion -ge 11) {
    try {
        $querySpaceUsage = @"
SELECT 
    ISNULL(SUM(total_page_count) * 8 / 1024, 0) AS TotalSizeMB,
    ISNULL(SUM(allocated_extent_page_count) * 8 / 1024, 0) AS UsedSpaceMB,
    ISNULL(SUM(version_store_reserved_page_count) * 8 / 1024, 0) AS VersionStoreMB,
    CASE 
        WHEN SUM(total_page_count) > 0 
        THEN CAST((SUM(total_page_count) - SUM(allocated_extent_page_count)) * 100.0 / SUM(total_page_count) AS DECIMAL(5,2))
        ELSE 0 
    END AS FreeSpacePct
FROM sys.dm_db_file_space_usage
WHERE database_id = DB_ID('tempdb');
"@
        
        $spaceUsage = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySpaceUsage -QueryTimeout $TimeoutSec -EnableException
        if ($spaceUsage) {
            Write-Host "✅ Query exitosa" -ForegroundColor Green
            
            # Con ISNULL ahora siempre retorna 0, no NULL
            # Detectar si es 0 real (sin actividad) vs 0 porque está vacío
            $totalMB = $spaceUsage.TotalSizeMB
            $usedMB = $spaceUsage.UsedSpaceMB
            $freePct = $spaceUsage.FreeSpacePct
            $versionMB = $spaceUsage.VersionStoreMB
            
            Write-Host "   Tamaño total: $totalMB MB" -ForegroundColor White
            Write-Host "   Usado: $usedMB MB" -ForegroundColor White
            Write-Host "   Libre: $freePct%" -ForegroundColor White
            Write-Host "   Version Store: $versionMB MB" -ForegroundColor White
            
            # Detectar problemas
            if ($totalMB -eq 0 -and $usedMB -eq 0) {
                Write-Host "   ⚠️  VALORES EN 0 - TempDB sin actividad reciente" -ForegroundColor Yellow
                Write-Host "      → La DMV sys.dm_db_file_space_usage requiere actividad en TempDB" -ForegroundColor Yellow
                Write-Host "      → El script collector asumirá 95% libre (estimación)" -ForegroundColor Cyan
            }
        }
        else {
            Write-Host "❌ Query no retornó datos" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}
else {
    Write-Host "⏭️  SKIPPED: Requiere SQL Server 2012+ (versión actual: $majorVersion)" -ForegroundColor Yellow
}

# Test 4: Max Server Memory
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 4: Max Server Memory" -ForegroundColor Cyan
try {
    $queryMaxMem = @"
SELECT CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations
WHERE name = 'max server memory (MB)';
"@
    
    $maxMem = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryMaxMem -QueryTimeout $TimeoutSec -EnableException
    if ($maxMem -and $maxMem.MaxServerMemoryMB -ne [DBNull]::Value) {
        $maxMemValue = [int]$maxMem.MaxServerMemoryMB
        
        Write-Host "✅ Query exitosa" -ForegroundColor Green
        
        if ($maxMemValue -eq 2147483647) {
            Write-Host "   Max Memory: UNLIMITED (valor por defecto, NO configurado)" -ForegroundColor Yellow
            Write-Host "   ⚠️  Esto se traduce a 0 en el script (por diseño)" -ForegroundColor Yellow
        }
        else {
            Write-Host "   Max Memory: $maxMemValue MB" -ForegroundColor White
        }
    }
    else {
        Write-Host "❌ Query no retornó datos" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Physical Memory
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 5: Memoria Física del Servidor" -ForegroundColor Cyan
try {
    if ($majorVersion -ge 11) {
        $querySysInfo = @"
SELECT 
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
    }
    else {
        $querySysInfo = @"
SELECT 
    physical_memory_in_bytes / 1024 / 1024 AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
    }
    
    $sysInfo = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySysInfo -QueryTimeout $TimeoutSec -EnableException
    if ($sysInfo) {
        Write-Host "✅ Query exitosa" -ForegroundColor Green
        Write-Host "   Memoria física: $($sysInfo.TotalPhysicalMemoryMB) MB" -ForegroundColor White
        Write-Host "   CPU Count: $($sysInfo.CPUCount)" -ForegroundColor White
        
        if ($sysInfo.TotalPhysicalMemoryMB -le 0) {
            Write-Host "   ❌ MEMORIA = 0 o negativa (ERROR CRÍTICO)" -ForegroundColor Red
        }
    }
    else {
        Write-Host "❌ Query no retornó datos" -ForegroundColor Red
    }
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Permisos VIEW SERVER STATE
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "TEST 6: Permisos (VIEW SERVER STATE)" -ForegroundColor Cyan
try {
    $queryPerms = @"
SELECT 
    HAS_PERMS_BY_NAME(NULL, NULL, 'VIEW SERVER STATE') AS HasViewServerState,
    IS_SRVROLEMEMBER('sysadmin') AS IsSysAdmin
"@
    
    $perms = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryPerms -QueryTimeout 5 -EnableException
    if ($perms) {
        Write-Host "✅ Query exitosa" -ForegroundColor Green
        
        if ($perms.HasViewServerState -eq 1) {
            Write-Host "   ✅ VIEW SERVER STATE: OK" -ForegroundColor Green
        }
        else {
            Write-Host "   ❌ VIEW SERVER STATE: NO (PUEDE CAUSAR PROBLEMAS)" -ForegroundColor Red
        }
        
        if ($perms.IsSysAdmin -eq 1) {
            Write-Host "   ✅ SYSADMIN: OK" -ForegroundColor Green
        }
        else {
            Write-Host "   ⚠️  SYSADMIN: NO" -ForegroundColor Yellow
        }
    }
}
catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

# Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  DIAGNÓSTICO COMPLETADO                               ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "💡 PRÓXIMOS PASOS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Si ves errores de permisos → Ejecutar el script con cuenta con VIEW SERVER STATE" -ForegroundColor White
Write-Host "2. Si Max Memory = UNLIMITED → Es correcto que aparezca 0 GB (NO configurado)" -ForegroundColor White
Write-Host "   💡 RECOMENDADO: Configurar Max Memory a ~80% de RAM física" -ForegroundColor Cyan
Write-Host "3. Si TempDB retorna [NULL] → DMV sin datos, generar actividad en TempDB" -ForegroundColor White
Write-Host "4. Si TempDB tiene 1 solo archivo → CREAR MÁS ARCHIVOS (mínimo 4 con 4 CPUs)" -ForegroundColor White
Write-Host "5. Si todos los tests fallan → Problema de conectividad o versión no soportada" -ForegroundColor White
Write-Host ""

