<#
.SYNOPSIS
    Diagnóstico completo para collectors que no guardan datos desde Task Scheduler

.DESCRIPTION
    Este script identifica los problemas más comunes cuando los collectors .ps1
    funcionan manualmente pero fallan desde Task Scheduler:
    
    1. ✅ Permisos de SQL Server
    2. ✅ Contexto de ejecución (usuario)
    3. ✅ Módulos PowerShell (dbatools)
    4. ✅ Conectividad a SQL Server
    5. ✅ Permisos de escritura en tablas
    6. ✅ Configuración de tareas programadas

.NOTES
    Ejecutar como el MISMO USUARIO que ejecuta las tareas programadas
#>

[CmdletBinding()]
param(
    [string]$TaskNamePattern = "HealthScore_v3*",
    [string]$SqlServer = "SSPR17MON-01",
    [string]$SqlDatabase = "SQLNova",
    [string]$TestInstance = "SSPR17MON-01" # Instancia para pruebas
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DIAGNÓSTICO TASK SCHEDULER - COLLECTORS             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$issues = @()
$warnings = @()

#region 1. CONTEXTO DE EJECUCIÓN
Write-Host "1️⃣  Verificando contexto de ejecución..." -ForegroundColor Yellow

$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "   Usuario actual: $currentUser" -ForegroundColor White

# Verificar si es admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "   Es administrador: $isAdmin" -ForegroundColor $(if($isAdmin){"Green"}else{"Yellow"})

if (-not $isAdmin) {
    $warnings += "No estás ejecutando como administrador. Algunas verificaciones pueden fallar."
}

# Verificar usuario de las tareas programadas
Write-Host ""
Write-Host "   Verificando usuario de las tareas programadas..." -ForegroundColor Gray

try {
    $tasks = Get-ScheduledTask -TaskName $TaskNamePattern -ErrorAction SilentlyContinue
    
    if ($tasks) {
        $taskUsers = $tasks | Select-Object -ExpandProperty Principal | Select-Object -ExpandProperty UserId -Unique
        
        Write-Host "   Tareas encontradas: $($tasks.Count)" -ForegroundColor Green
        
        foreach ($taskUser in $taskUsers) {
            Write-Host "   Usuario de tarea: $taskUser" -ForegroundColor White
            
            if ($taskUser -ne $currentUser) {
                $issues += "⚠️  Las tareas se ejecutan como '$taskUser' pero estás diagnosticando como '$currentUser'"
                Write-Host "   ⚠️  DIFERENTE al usuario actual!" -ForegroundColor Red
            } else {
                Write-Host "   ✅ Mismo usuario que el actual" -ForegroundColor Green
            }
        }
    } else {
        $issues += "❌ No se encontraron tareas programadas con el patrón: $TaskNamePattern"
        Write-Host "   ❌ No se encontraron tareas" -ForegroundColor Red
    }
} catch {
    $issues += "Error verificando tareas: $($_.Exception.Message)"
}

#endregion

#region 2. MÓDULOS POWERSHELL
Write-Host ""
Write-Host "2️⃣  Verificando módulos PowerShell..." -ForegroundColor Yellow

# dbatools
$dbatools = Get-Module -ListAvailable -Name dbatools
if ($dbatools) {
    Write-Host "   ✅ dbatools instalado: v$($dbatools.Version)" -ForegroundColor Green
} else {
    $issues += "❌ dbatools NO está instalado"
    Write-Host "   ❌ dbatools NO instalado" -ForegroundColor Red
}

# SqlServer (conflicto común)
$sqlServerModule = Get-Module -ListAvailable -Name SqlServer
if ($sqlServerModule) {
    $warnings += "⚠️  Módulo SqlServer detectado (puede causar conflictos con dbatools)"
    Write-Host "   ⚠️  SqlServer v$($sqlServerModule.Version) (puede causar conflictos)" -ForegroundColor Yellow
}

# Verificar si está cargado
$loadedModules = Get-Module
if ($loadedModules | Where-Object { $_.Name -eq "SqlServer" }) {
    Write-Host "   ⚠️  SqlServer está CARGADO (puede interferir)" -ForegroundColor Red
}

#endregion

#region 3. CONECTIVIDAD SQL SERVER
Write-Host ""
Write-Host "3️⃣  Verificando conectividad a SQL Server..." -ForegroundColor Yellow

try {
    Import-Module dbatools -Force -ErrorAction Stop
    
    # Test conexión
    Write-Host "   Probando conexión a $SqlServer..." -ForegroundColor Gray
    $connection = Test-DbaConnection -SqlInstance $SqlServer -EnableException
    
    if ($connection.IsPingable) {
        Write-Host "   ✅ Conexión exitosa" -ForegroundColor Green
        Write-Host "   Usuario SQL: $($connection.ConnectingAsUser)" -ForegroundColor White
        Write-Host "   Autenticación: Windows" -ForegroundColor White
    } else {
        $issues += "❌ No se puede conectar a $SqlServer"
        Write-Host "   ❌ No se puede conectar" -ForegroundColor Red
    }
    
} catch {
    $issues += "Error de conexión: $($_.Exception.Message)"
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

#endregion

#region 4. PERMISOS EN BASE DE DATOS
Write-Host ""
Write-Host "4️⃣  Verificando permisos en base de datos..." -ForegroundColor Yellow

try {
    # Verificar permisos en SQLNova
    $query = @"
SELECT 
    USER_NAME() AS CurrentUser,
    IS_MEMBER('db_owner') AS IsDbOwner,
    IS_MEMBER('db_datawriter') AS IsDataWriter,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS HasInsert
"@
    
    $perms = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $query -EnableException
    
    Write-Host "   Usuario en SQL: $($perms.CurrentUser)" -ForegroundColor White
    Write-Host "   db_owner: $(if($perms.IsDbOwner -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.IsDbOwner -eq 1){"Green"}else{"Red"})
    Write-Host "   db_datawriter: $(if($perms.IsDataWriter -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.IsDataWriter -eq 1){"Green"}else{"Yellow"})
    Write-Host "   Permiso INSERT: $(if($perms.HasInsert -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.HasInsert -eq 1){"Green"}else{"Red"})
    
    if ($perms.HasInsert -ne 1) {
        $issues += "❌ No tienes permiso de INSERT en $SqlDatabase"
    }
    
} catch {
    $issues += "Error verificando permisos: $($_.Exception.Message)"
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

#endregion

#region 5. PRUEBA DE ESCRITURA
Write-Host ""
Write-Host "5️⃣  Probando escritura en tabla InstanceHealth_IO..." -ForegroundColor Yellow

try {
    # Intentar escribir un registro de prueba
    $testQuery = @"
INSERT INTO dbo.InstanceHealth_IO (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    AvgReadLatencyMs,
    AvgWriteLatencyMs,
    MaxReadLatencyMs,
    MaxWriteLatencyMs,
    DataFileAvgReadMs,
    DataFileAvgWriteMs,
    LogFileAvgWriteMs,
    TotalIOPS,
    ReadIOPS,
    WriteIOPS,
    IODetails
) VALUES (
    'TEST_DIAGNOSTIC',
    'TEST',
    'TEST',
    'TEST',
    GETDATE(),
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    'Prueba desde diagnóstico'
);
"@
    
    Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $testQuery -EnableException
    Write-Host "   ✅ Escritura exitosa" -ForegroundColor Green
    
    # Limpiar registro de prueba
    $deleteQuery = "DELETE FROM dbo.InstanceHealth_IO WHERE InstanceName = 'TEST_DIAGNOSTIC'"
    Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $deleteQuery -EnableException
    Write-Host "   ✅ Registro de prueba eliminado" -ForegroundColor Green
    
} catch {
    $issues += "❌ No se puede escribir en InstanceHealth_IO: $($_.Exception.Message)"
    Write-Host "   ❌ Error escribiendo: $($_.Exception.Message)" -ForegroundColor Red
}

#endregion

#region 6. PRUEBA DE COLLECTOR REAL
Write-Host ""
Write-Host "6️⃣  Probando collector IO en instancia de prueba..." -ForegroundColor Yellow

try {
    # Simular lo que hace Get-IOMetrics
    $query = @"
DECLARE @UptimeSeconds BIGINT;
SELECT @UptimeSeconds = DATEDIFF(SECOND, sqlserver_start_time, GETDATE())
FROM sys.dm_os_sys_info;

IF @UptimeSeconds < 60 SET @UptimeSeconds = 60;

SELECT TOP 1
    DB_NAME(vfs.database_id) AS DatabaseName,
    mf.type_desc AS FileType,
    CASE WHEN vfs.num_of_reads = 0 THEN 0 
         ELSE (vfs.io_stall_read_ms / vfs.num_of_reads) 
    END AS AvgReadLatencyMs,
    CASE WHEN vfs.num_of_writes = 0 THEN 0 
         ELSE (vfs.io_stall_write_ms / vfs.num_of_writes) 
    END AS AvgWriteLatencyMs
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
INNER JOIN sys.master_files mf 
    ON vfs.database_id = mf.database_id 
    AND vfs.file_id = mf.file_id
WHERE vfs.num_of_reads > 0 OR vfs.num_of_writes > 0
ORDER BY vfs.io_stall_read_ms DESC;
"@
    
    $data = Invoke-DbaQuery -SqlInstance $TestInstance -Query $query -QueryTimeout 15 -EnableException
    
    if ($data) {
        Write-Host "   ✅ Query de métricas ejecutado correctamente" -ForegroundColor Green
        Write-Host "   Ejemplo: $($data.DatabaseName) - Read: $([int]$data.AvgReadLatencyMs)ms Write: $([int]$data.AvgWriteLatencyMs)ms" -ForegroundColor Gray
    } else {
        $warnings += "⚠️  Query no retornó datos"
        Write-Host "   ⚠️  Query no retornó datos" -ForegroundColor Yellow
    }
    
} catch {
    $issues += "Error ejecutando query de métricas: $($_.Exception.Message)"
    Write-Host "   ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
}

#endregion

#region 7. VERIFICAR CONFIGURACIÓN DE TAREAS
Write-Host ""
Write-Host "7️⃣  Verificando configuración de tareas programadas..." -ForegroundColor Yellow

if ($tasks) {
    $sampleTask = $tasks | Select-Object -First 1
    $taskInfo = Get-ScheduledTaskInfo -TaskName $sampleTask.TaskName
    
    Write-Host "   Ejemplo: $($sampleTask.TaskName)" -ForegroundColor White
    Write-Host "   Estado: $($sampleTask.State)" -ForegroundColor White
    Write-Host "   Última ejecución: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host "   Último resultado: $($taskInfo.LastTaskResult)" -ForegroundColor $(if($taskInfo.LastTaskResult -eq 0){"Green"}else{"Red"})
    
    if ($taskInfo.LastTaskResult -ne 0) {
        $issues += "⚠️  Última ejecución terminó con código de error: $($taskInfo.LastTaskResult)"
    }
    
    # Verificar configuración de la tarea
    $action = $sampleTask.Actions[0]
    Write-Host "   Comando: $($action.Execute)" -ForegroundColor Gray
    Write-Host "   Argumentos: $($action.Arguments)" -ForegroundColor Gray
    
    # Verificar que use -NoProfile -ExecutionPolicy Bypass
    if ($action.Arguments -notmatch "-NoProfile") {
        $warnings += "⚠️  Tarea no usa -NoProfile (puede cargar módulos incorrectos)"
    }
    if ($action.Arguments -notmatch "-ExecutionPolicy") {
        $warnings += "⚠️  Tarea no especifica ExecutionPolicy"
    }
}

#endregion

#region 8. VERIFICAR LOGS RECIENTES
Write-Host ""
Write-Host "8️⃣  Verificando datos recientes en tablas..." -ForegroundColor Yellow

try {
    $tables = @(
        "InstanceHealth_IO",
        "InstanceHealth_CPU",
        "InstanceHealth_Memoria",
        "InstanceHealth_Backups"
    )
    
    foreach ($table in $tables) {
        $query = "SELECT TOP 1 CollectedAtUtc, COUNT(*) OVER() AS TotalRows FROM dbo.$table ORDER BY CollectedAtUtc DESC"
        $lastRecord = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $query -EnableException
        
        if ($lastRecord) {
            $minutesAgo = [int]((Get-Date) - $lastRecord.CollectedAtUtc).TotalMinutes
            $color = if ($minutesAgo -lt 10) { "Green" } elseif ($minutesAgo -lt 60) { "Yellow" } else { "Red" }
            
            Write-Host "   $table" -ForegroundColor White
            Write-Host "      Último registro: $($lastRecord.CollectedAtUtc) ($minutesAgo min atrás)" -ForegroundColor $color
            Write-Host "      Total registros: $($lastRecord.TotalRows)" -ForegroundColor Gray
        } else {
            Write-Host "   $table: ❌ SIN DATOS" -ForegroundColor Red
        }
    }
    
} catch {
    Write-Host "   ⚠️  Error: $($_.Exception.Message)" -ForegroundColor Yellow
}

#endregion

#region RESUMEN
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  RESUMEN DEL DIAGNÓSTICO                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

if ($issues.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ No se detectaron problemas" -ForegroundColor Green
    Write-Host ""
    Write-Host "Si los collectors aún no guardan datos, revisa:" -ForegroundColor Yellow
    Write-Host "   1. Logs de Event Viewer (Task Scheduler)" -ForegroundColor White
    Write-Host "   2. Ejecuta manualmente una tarea: Start-ScheduledTask -TaskName 'HealthScore_v3.2_IO'" -ForegroundColor White
    Write-Host "   3. Verifica que la API URL esté correcta en los scripts" -ForegroundColor White
} else {
    if ($issues.Count -gt 0) {
        Write-Host "❌ PROBLEMAS DETECTADOS:" -ForegroundColor Red
        Write-Host ""
        foreach ($issue in $issues) {
            Write-Host "   $issue" -ForegroundColor Red
        }
        Write-Host ""
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "⚠️  ADVERTENCIAS:" -ForegroundColor Yellow
        Write-Host ""
        foreach ($warning in $warnings) {
            Write-Host "   $warning" -ForegroundColor Yellow
        }
        Write-Host ""
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "SOLUCIONES COMUNES:" -ForegroundColor Yellow
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Ejecutar tareas con usuario correcto:" -ForegroundColor White
Write-Host "   - Abre Task Scheduler" -ForegroundColor Gray
Write-Host "   - Click derecho en tarea > Properties" -ForegroundColor Gray
Write-Host "   - Security options > Change User" -ForegroundColor Gray
Write-Host "   - Usa tu usuario actual: $currentUser" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Configurar 'Run with highest privileges':" -ForegroundColor White
Write-Host "   - En Properties > General tab" -ForegroundColor Gray
Write-Host "   - Marca 'Run with highest privileges'" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Agregar permisos SQL Server:" -ForegroundColor White
Write-Host "   USE SQLNova;" -ForegroundColor Gray
Write-Host "   ALTER ROLE db_datawriter ADD MEMBER [$currentUser];" -ForegroundColor Gray
Write-Host ""
Write-Host "4. Verificar módulo dbatools disponible para el usuario:" -ForegroundColor White
Write-Host "   Install-Module -Name dbatools -Scope CurrentUser -Force" -ForegroundColor Gray
Write-Host ""

#endregion

