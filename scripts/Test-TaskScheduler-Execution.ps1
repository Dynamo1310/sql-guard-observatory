<#
.SYNOPSIS
    Script de diagnóstico para verificar ejecución desde Task Scheduler
    
.DESCRIPTION
    Ejecuta pruebas de:
    1. Permisos de escritura
    2. Conectividad a SQL Server
    3. Carga de módulos dbatools
    4. Escritura de datos de prueba
    
    Guarda logs en: C:\Apps\SQLGuardObservatory\Scripts\Logs\
#>

[CmdletBinding()]
param()

# Crear directorio de logs
$logDir = "C:\Apps\SQLGuardObservatory\Scripts\Logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "TaskScheduler_Test_$timestamp.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $logMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path $logFile -Value $logMessage
}

Write-Log "===== INICIO DE DIAGNÓSTICO ====="
Write-Log "Usuario actual: $env:USERNAME"
Write-Log "Computadora: $env:COMPUTERNAME"
Write-Log "PowerShell Version: $($PSVersionTable.PSVersion)"

# 1. Verificar permisos de escritura
Write-Log "1️⃣ Verificando permisos de escritura..." "TEST"
try {
    $testFile = Join-Path $logDir "test_write_$timestamp.tmp"
    "test" | Out-File -FilePath $testFile -Force
    Remove-Item $testFile -Force
    Write-Log "✅ Permisos de escritura: OK" "SUCCESS"
} catch {
    Write-Log "❌ ERROR en permisos de escritura: $($_.Exception.Message)" "ERROR"
}

# 2. Verificar módulo dbatools
Write-Log "2️⃣ Verificando módulo dbatools..." "TEST"
try {
    if (Get-Module -ListAvailable -Name dbatools) {
        $dbaVersion = (Get-Module -ListAvailable -Name dbatools | Select-Object -First 1).Version
        Write-Log "✅ dbatools instalado: v$dbaVersion" "SUCCESS"
        
        # Intentar importar
        Import-Module dbatools -Force -ErrorAction Stop
        Write-Log "✅ dbatools importado correctamente" "SUCCESS"
    } else {
        Write-Log "❌ dbatools NO está instalado" "ERROR"
    }
} catch {
    Write-Log "❌ ERROR al importar dbatools: $($_.Exception.Message)" "ERROR"
}

# 3. Verificar conectividad a SQL Server
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"

Write-Log "3️⃣ Verificando conectividad a SQL Server: $SqlServer" "TEST"
try {
    $testQuery = "SELECT @@VERSION AS Version, GETDATE() AS CurrentTime, SUSER_NAME() AS CurrentUser;"
    $result = Invoke-DbaQuery -SqlInstance $SqlServer -Query $testQuery -QueryTimeout 10 -EnableException
    
    Write-Log "✅ Conexión exitosa a SQL Server" "SUCCESS"
    Write-Log "   Usuario SQL: $($result.CurrentUser)" "INFO"
    Write-Log "   Hora SQL: $($result.CurrentTime)" "INFO"
} catch {
    Write-Log "❌ ERROR conectando a SQL Server: $($_.Exception.Message)" "ERROR"
}

# 4. Verificar permisos en base de datos SQLNova
Write-Log "4️⃣ Verificando permisos en base de datos $SqlDatabase..." "TEST"
try {
    $permQuery = @"
SELECT 
    dp.name AS UserName,
    dp.type_desc AS UserType,
    CASE 
        WHEN IS_MEMBER('db_owner') = 1 THEN 'db_owner'
        WHEN IS_MEMBER('db_datawriter') = 1 THEN 'db_datawriter'
        WHEN IS_MEMBER('db_datareader') = 1 THEN 'db_datareader'
        ELSE 'Other'
    END AS Role
FROM sys.database_principals dp
WHERE dp.name = SUSER_NAME();

-- Verificar si puede escribir
SELECT 
    CASE 
        WHEN HAS_PERMS_BY_NAME('dbo.InstanceHealth_CPU', 'OBJECT', 'INSERT') = 1 
        THEN 'YES' 
        ELSE 'NO' 
    END AS CanInsertIntoCPU;
"@
    
    $permResult = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $permQuery -QueryTimeout 10 -EnableException -As DataSet
    
    if ($permResult.Tables.Count -ge 2) {
        $userInfo = $permResult.Tables[0]
        $insertPerm = $permResult.Tables[1]
        
        Write-Log "✅ Permisos verificados" "SUCCESS"
        Write-Log "   Usuario DB: $($userInfo.UserName)" "INFO"
        Write-Log "   Rol: $($userInfo.Role)" "INFO"
        Write-Log "   Puede insertar en InstanceHealth_CPU: $($insertPerm.CanInsertIntoCPU)" "INFO"
        
        if ($insertPerm.CanInsertIntoCPU -eq 'NO') {
            Write-Log "⚠️  ADVERTENCIA: No tiene permisos INSERT en las tablas" "WARNING"
        }
    }
} catch {
    Write-Log "❌ ERROR verificando permisos: $($_.Exception.Message)" "ERROR"
}

# 5. Prueba de escritura en tabla
Write-Log "5️⃣ Intentando escribir datos de prueba..." "TEST"
try {
    $testInsert = @"
-- Insertar registro de prueba (se eliminará después)
INSERT INTO dbo.InstanceHealth_CPU (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    SQLProcessUtilization,
    SystemIdleProcess,
    OtherProcessUtilization,
    RunnableTasks,
    PendingDiskIOCount,
    AvgCPUPercentLast10Min,
    P95CPUPercent
) VALUES (
    'TEST_SCHEDULER_$timestamp',
    'TEST',
    'TEST',
    'TEST',
    GETDATE(),
    0, 0, 0, 0, 0, 0, 0
);

-- Verificar inserción
SELECT COUNT(*) AS TestRecordCount 
FROM dbo.InstanceHealth_CPU 
WHERE InstanceName = 'TEST_SCHEDULER_$timestamp';

-- Eliminar registro de prueba
DELETE FROM dbo.InstanceHealth_CPU 
WHERE InstanceName = 'TEST_SCHEDULER_$timestamp';
"@
    
    $insertResult = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $testInsert -QueryTimeout 30 -EnableException -As DataSet
    
    if ($insertResult.Tables.Count -ge 1) {
        $recordCount = $insertResult.Tables[0].TestRecordCount
        if ($recordCount -eq 1) {
            Write-Log "✅ Escritura de prueba exitosa (registro insertado y eliminado)" "SUCCESS"
        } else {
            Write-Log "⚠️  Escritura de prueba: registros encontrados = $recordCount" "WARNING"
        }
    }
} catch {
    Write-Log "❌ ERROR en escritura de prueba: $($_.Exception.Message)" "ERROR"
    Write-Log "   Detalles: $($_.Exception.InnerException.Message)" "ERROR"
}

# 6. Verificar API de inventario
$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
Write-Log "6️⃣ Verificando acceso a API: $ApiUrl" "TEST"
try {
    $apiTest = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 10 -Method Get
    $instanceCount = ($apiTest | Measure-Object).Count
    Write-Log "✅ API accesible, instancias retornadas: $instanceCount" "SUCCESS"
} catch {
    Write-Log "❌ ERROR accediendo a API: $($_.Exception.Message)" "ERROR"
}

Write-Log "===== FIN DE DIAGNÓSTICO ====="
Write-Log ""
Write-Log "Log guardado en: $logFile"

# Mostrar resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  RESUMEN DEL DIAGNÓSTICO                              ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Log completo guardado en:                            ║" -ForegroundColor White
Write-Host "║  $logFile" -ForegroundColor Yellow
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "Revisa el log para ver los detalles completos." -ForegroundColor Yellow

