<#
.SYNOPSIS
    Script de prueba para diagnosticar el contexto de Task Scheduler
    
.DESCRIPTION
    Este script captura TODO el contexto cuando se ejecuta desde Task Scheduler
    para identificar por qué no guarda datos en SQL.
#>

$logPath = "C:\Temp\TaskScheduler_Debug_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

# Crear directorio si no existe
$logDir = Split-Path $logPath -Parent
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

Start-Transcript -Path $logPath -Append

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "DIAGNÓSTICO DE CONTEXTO - TASK SCHEDULER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Fecha/Hora: $(Get-Date)" -ForegroundColor White
Write-Host ""

# 1. USUARIO
Write-Host "1. CONTEXTO DE USUARIO:" -ForegroundColor Yellow
Write-Host "   Usuario actual: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)" -ForegroundColor White
Write-Host "   Es Admin: $([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)" -ForegroundColor White
Write-Host ""

# 2. DIRECTORIO DE TRABAJO
Write-Host "2. DIRECTORIOS:" -ForegroundColor Yellow
Write-Host "   Working Directory: $(Get-Location)" -ForegroundColor White
Write-Host "   Script Directory: $PSScriptRoot" -ForegroundColor White
Write-Host ""

# 3. VARIABLES DE ENTORNO
Write-Host "3. VARIABLES DE ENTORNO CLAVE:" -ForegroundColor Yellow
Write-Host "   PSModulePath:" -ForegroundColor White
$env:PSModulePath -split ';' | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
Write-Host ""
Write-Host "   PATH (primeros 5):" -ForegroundColor White
$env:PATH -split ';' | Select-Object -First 5 | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
Write-Host ""

# 4. MÓDULOS DISPONIBLES
Write-Host "4. MÓDULOS POWERSHELL:" -ForegroundColor Yellow

# dbatools
$dbatools = Get-Module -ListAvailable -Name dbatools
if ($dbatools) {
    Write-Host "   ✅ dbatools encontrado:" -ForegroundColor Green
    $dbatools | ForEach-Object {
        Write-Host "      Versión: $($_.Version) | Path: $($_.ModuleBase)" -ForegroundColor Gray
    }
} else {
    Write-Host "   ❌ dbatools NO encontrado" -ForegroundColor Red
}

# SqlServer (conflicto)
$sqlServer = Get-Module -ListAvailable -Name SqlServer
if ($sqlServer) {
    Write-Host "   ⚠️  SqlServer encontrado (PUEDE CAUSAR CONFLICTOS):" -ForegroundColor Yellow
    $sqlServer | ForEach-Object {
        Write-Host "      Versión: $($_.Version) | Path: $($_.ModuleBase)" -ForegroundColor Gray
    }
}

# Módulos cargados
Write-Host ""
Write-Host "   Módulos actualmente cargados:" -ForegroundColor White
Get-Module | Select-Object Name, Version | ForEach-Object {
    Write-Host "      $($_.Name) v$($_.Version)" -ForegroundColor Gray
}
Write-Host ""

# 5. INTENTAR CARGAR DBATOOLS
Write-Host "5. INTENTANDO CARGAR DBATOOLS:" -ForegroundColor Yellow

# Remover SqlServer primero si está cargado
if (Get-Module -Name SqlServer) {
    Write-Host "   Removiendo módulo SqlServer..." -ForegroundColor Gray
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

try {
    Import-Module dbatools -Force -ErrorAction Stop
    Write-Host "   ✅ dbatools importado correctamente" -ForegroundColor Green
    $dbatoolsModule = Get-Module -Name dbatools
    Write-Host "      Versión cargada: $($dbatoolsModule.Version)" -ForegroundColor Gray
    Write-Host "      Cmdlets disponibles: $(($dbatoolsModule.ExportedCommands.Keys | Measure-Object).Count)" -ForegroundColor Gray
} catch {
    Write-Host "   ❌ ERROR importando dbatools: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Stack trace:" -ForegroundColor Red
    Write-Host $_.Exception.StackTrace -ForegroundColor Gray
}
Write-Host ""

# 6. PROBAR CONEXIÓN SQL
Write-Host "6. PRUEBA DE CONEXIÓN SQL:" -ForegroundColor Yellow

$sqlServer = "SSPR17MON-01"
$sqlDatabase = "SQLNova"

try {
    Write-Host "   Probando Test-DbaConnection..." -ForegroundColor Gray
    $connection = Test-DbaConnection -SqlInstance $sqlServer -EnableException
    
    if ($connection.IsPingable) {
        Write-Host "   ✅ Conexión exitosa" -ForegroundColor Green
        Write-Host "      Usuario SQL: $($connection.ConnectingAsUser)" -ForegroundColor Gray
        Write-Host "      Versión SQL: $($connection.SqlVersion)" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ No se pudo conectar" -ForegroundColor Red
    }
} catch {
    Write-Host "   ❌ ERROR en conexión: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 7. PROBAR QUERY SIMPLE
Write-Host "7. PRUEBA DE QUERY:" -ForegroundColor Yellow

try {
    Write-Host "   Ejecutando SELECT @@VERSION..." -ForegroundColor Gray
    $result = Invoke-DbaQuery -SqlInstance $sqlServer -Query "SELECT @@VERSION AS Version" -EnableException
    
    if ($result) {
        Write-Host "   ✅ Query ejecutado correctamente" -ForegroundColor Green
        Write-Host "      SQL Version: $($result.Version.Substring(0, 100))..." -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  Query no retornó resultados" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ ERROR ejecutando query: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 8. PROBAR INSERCIÓN EN TABLA
Write-Host "8. PRUEBA DE INSERCIÓN:" -ForegroundColor Yellow

try {
    Write-Host "   Intentando INSERT en InstanceHealth_CPU..." -ForegroundColor Gray
    
    $insertQuery = @"
INSERT INTO dbo.InstanceHealth_CPU (
    InstanceName, Ambiente, HostingSite, SqlVersion, CollectedAtUtc,
    AvgCpuPercent, MaxCpuPercent, SqlProcessCpuPercent, SystemIdleCpuPercent,
    TopQueryCpuConsumption
) VALUES (
    'TEST_FROM_TASKSCHEDULER',
    'TEST', 'TEST', 'TEST', GETDATE(),
    0, 0, 0, 0, 'Test desde Task Scheduler'
);
"@
    
    Invoke-DbaQuery -SqlInstance $sqlServer -Database $sqlDatabase -Query $insertQuery -EnableException
    
    Write-Host "   ✅ INSERT ejecutado sin errores" -ForegroundColor Green
    
    # Verificar que se insertó
    Write-Host "   Verificando que el registro existe..." -ForegroundColor Gray
    $verify = Invoke-DbaQuery -SqlInstance $sqlServer -Database $sqlDatabase -Query "SELECT COUNT(*) AS Count FROM dbo.InstanceHealth_CPU WHERE InstanceName = 'TEST_FROM_TASKSCHEDULER'" -EnableException
    
    if ($verify.Count -gt 0) {
        Write-Host "   ✅ Registro encontrado en la tabla ($($verify.Count) registros)" -ForegroundColor Green
        
        # Limpiar
        Write-Host "   Limpiando registro de prueba..." -ForegroundColor Gray
        Invoke-DbaQuery -SqlInstance $sqlServer -Database $sqlDatabase -Query "DELETE FROM dbo.InstanceHealth_CPU WHERE InstanceName = 'TEST_FROM_TASKSCHEDULER'" -EnableException
        Write-Host "   ✅ Limpieza completada" -ForegroundColor Green
    } else {
        Write-Host "   ❌ El registro NO se encontró en la tabla (aunque INSERT no dio error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "   ❌ ERROR en INSERT: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Detalles del error:" -ForegroundColor Red
    Write-Host "   Tipo: $($_.Exception.GetType().FullName)" -ForegroundColor Gray
    Write-Host "   Stack: $($_.Exception.StackTrace)" -ForegroundColor Gray
}
Write-Host ""

# 9. PERMISOS SQL
Write-Host "9. VERIFICACIÓN DE PERMISOS SQL:" -ForegroundColor Yellow

try {
    $permsQuery = @"
SELECT 
    USER_NAME() AS CurrentUser,
    IS_MEMBER('db_owner') AS IsDbOwner,
    IS_MEMBER('db_datawriter') AS IsDataWriter,
    HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'INSERT') AS HasInsert
"@
    
    $perms = Invoke-DbaQuery -SqlInstance $sqlServer -Database $sqlDatabase -Query $permsQuery -EnableException
    
    Write-Host "   Usuario en SQL: $($perms.CurrentUser)" -ForegroundColor White
    Write-Host "   db_owner: $(if($perms.IsDbOwner -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.IsDbOwner -eq 1){"Green"}else{"Red"})
    Write-Host "   db_datawriter: $(if($perms.IsDataWriter -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.IsDataWriter -eq 1){"Green"}else{"Yellow"})
    Write-Host "   Permiso INSERT: $(if($perms.HasInsert -eq 1){'✅ SÍ'}else{'❌ NO'})" -ForegroundColor $(if($perms.HasInsert -eq 1){"Green"}else{"Red"})
    
} catch {
    Write-Host "   ❌ ERROR verificando permisos: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 10. RESUMEN
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RESUMEN DEL DIAGNÓSTICO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Log guardado en: $logPath" -ForegroundColor Green
Write-Host ""
Write-Host "Si la prueba de inserción FALLÓ, revisa:" -ForegroundColor Yellow
Write-Host "  1. dbatools está correctamente instalado para este usuario" -ForegroundColor White
Write-Host "  2. No hay conflictos con el módulo SqlServer" -ForegroundColor White
Write-Host "  3. El usuario tiene permisos en SQL Server" -ForegroundColor White
Write-Host "  4. Las variables de entorno PSModulePath son correctas" -ForegroundColor White
Write-Host ""

Stop-Transcript

# Retornar código de salida
exit 0

