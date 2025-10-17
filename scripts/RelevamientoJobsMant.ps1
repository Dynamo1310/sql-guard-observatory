<#  
    Get-InventoryJobs-ToSQL-Incremental.ps1
    - Consulta http://asprbm-nov-01/InventoryDBA/inventario/
    - Por cada instancia, trae la última ejecución por job (msdb) SOLO para:
        %IndexOptimize%, %DatabaseIntegrityCheck%, y variantes de Actualización_estadísticas
    - Inserta en SSPR17MON-01.SQLNova.dbo.InventarioJobsSnapshot DE FORMA INCREMENTAL
      (procesa e inserta una instancia a la vez)
#>

# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InventarioJobsSnapshot"

# Timeout por consulta a msdb
$TimeoutSec  = 90

# Control de procesamiento
$ContinueOnError = $true  # Si es true, continúa con la siguiente instancia aunque falle una
$VerboseLogging  = $true  # Muestra progreso detallado
$DebugMode       = $true  # ACTIVADO: Muestra información de debug sobre columnas y datos
$RunDiagnostic   = $false # Si es true, ejecuta diagnóstico sin insertar datos
$UseSimpleQuery  = $false # Si es true, usa un query más simple para debugging

# Para diagnosticar problemas con los datos:
# ==========================================
# PASO 1: Activar modo debug para ver qué columnas y datos se están recibiendo
#   $DebugMode = $true
#
# PASO 2: Si sigue sin funcionar, probar el query simplificado
#   $UseSimpleQuery = $true
#
# PASO 3: Para hacer pruebas sin insertar datos
#   $RunDiagnostic = $true
#
# PASO 4: Si nada funciona, verificar manualmente con:
#   sqlcmd -S INSTANCIA -d msdb -Q "SELECT TOP 5 name FROM sysjobs WHERE name LIKE '%IndexOptimize%'"
# =================================

# Asegura TLS razonable
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ---------- T-SQL: última ejecución por job (step_id = 0) CON FILTRO ----------
# Compatible con SQL Server 2008/R2 y robusto ante datos "sucios" en sysjobhistory
$Tsql_LastRunPerJob = @"
;WITH hist AS (
    SELECT
        j.name AS JobName,
        h.run_status,
        RIGHT('00000000' + CAST(h.run_date AS varchar(8)), 8) AS _date8,
        RIGHT('000000'   + CAST(h.run_time AS varchar(6)), 6) AS _time6,
        ((h.run_duration/10000)*3600) + ((h.run_duration%10000)/100)*60 + (h.run_duration%100) AS DurationSeconds,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY h.instance_id DESC) AS rn
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory h
        ON j.job_id = h.job_id
    WHERE 
        h.step_id = 0
        AND (
            j.name COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%IndexOptimize%'
            OR j.name COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%DatabaseIntegrityCheck%'
            OR j.name COLLATE SQL_Latin1_General_CP1_CI_AI LIKE N'%Actualizacion_estadisticas%'
        )
),
norm AS (
    SELECT
        JobName,
        run_status,
        DurationSeconds,
        rn,
        CASE WHEN _time6 = '240000' THEN '235959' ELSE _time6 END AS time6,
        _date8
    FROM hist
),
built AS (
    SELECT
        JobName,
        run_status,
        DurationSeconds,
        rn,
        STUFF(STUFF(_date8,5,0,'-'),8,0,' ') + ' ' +
        STUFF(STUFF(time6,3,0,':'),6,0,':') AS dt_str
    FROM norm
),
safe AS (
    SELECT
        JobName,
        run_status,
        DurationSeconds,
        rn,
        CASE WHEN ISDATE(dt_str) = 1 THEN CONVERT(datetime, dt_str) ELSE NULL END AS StartTime
    FROM built
)
SELECT
    JobName,
    StartTime,
    CASE WHEN StartTime IS NOT NULL THEN DATEADD(SECOND, DurationSeconds, StartTime) END AS EndTime,
    DurationSeconds,
    CASE run_status
        WHEN 0 THEN N'Failed'
        WHEN 1 THEN N'Succeeded'
        WHEN 2 THEN N'Retry'
        WHEN 3 THEN N'Canceled'
        WHEN 4 THEN N'In progress'
        ELSE CONVERT(nvarchar(10), run_status)
    END AS JobStatus
FROM safe
WHERE rn = 1
ORDER BY JobName;
"@

# Query simplificado para debugging
$Tsql_SimpleDebug = @"
SELECT TOP 10
    j.name AS JobName,
    GETDATE() AS StartTime,
    GETDATE() AS EndTime,
    100 AS DurationSeconds,
    'Debug' AS JobStatus
FROM msdb.dbo.sysjobs j
WHERE j.name IS NOT NULL
    AND (
        j.name LIKE '%IndexOptimize%'
        OR j.name LIKE '%DatabaseIntegrityCheck%'
        OR j.name LIKE '%Actualizacion_estadisticas%'
    )
ORDER BY j.name;
"@

# Query ultra simple para verificar acceso a datos
$Tsql_UltraSimple = @"
SELECT 
    'TestJob_IndexOptimize' AS JobName,
    GETDATE() AS StartTime,
    DATEADD(SECOND, 100, GETDATE()) AS EndTime,
    100 AS DurationSeconds,
    'Succeeded' AS JobStatus
UNION ALL
SELECT 
    'TestJob_DatabaseIntegrityCheck' AS JobName,
    GETDATE() AS StartTime,
    DATEADD(SECOND, 200, GETDATE()) AS EndTime,
    200 AS DurationSeconds,
    'Succeeded' AS JobStatus
"@

# Seleccionar el query a usar
$QueryToUse = if ($UseSimpleQuery) { $Tsql_SimpleDebug } else { $Tsql_LastRunPerJob }

if ($UseSimpleQuery) {
    Write-Warning "MODO DEBUG: Usando query simplificado para pruebas"
}

function Ensure-Table {
    param(
        [string]$Server, [string]$Database, [string]$Schema="dbo", [string]$Table="InventarioJobsSnapshot"
    )

    $createTsql = @"
IF NOT EXISTS (
    SELECT 1 FROM [$Database].sys.tables t
    JOIN [$Database].sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = N'$Table' AND s.name = N'$Schema'
)
BEGIN
    CREATE TABLE [$Schema].[$Table](
        [Id]                   BIGINT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName]         NVARCHAR(128)  NOT NULL,
        [Ambiente]             NVARCHAR(50)   NULL,
        [Hosting]              NVARCHAR(50)   NULL,
        [JobName]              NVARCHAR(256)  NOT NULL,
        [JobStart]             DATETIME2(0)   NULL,
        [JobEnd]               DATETIME2(0)   NULL,
        [JobDurationSeconds]   INT            NULL,
        [JobStatus]            NVARCHAR(50)   NULL,
        [CaptureDate]          DATETIME2(0)   NOT NULL,
        [InsertedAtUtc]        DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
    CREATE INDEX IX_${Table}_Instance_Capture ON [$Schema].[$Table] ([InstanceName], [CaptureDate]);
    CREATE INDEX IX_${Table}_Job_Capture      ON [$Schema].[$Table] ([JobName], [CaptureDate]);
END
"@

    $connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True"
    $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
    try {
        $conn.Open()
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $createTsql
        $cmd.CommandTimeout = 120
        [void]$cmd.ExecuteNonQuery()
    } finally {
        $conn.Close()
        $conn.Dispose()
    }
}

function Test-InstanceConnection {
    param(
        [Parameter(Mandatory=$true)]$Instance,
        [Parameter(Mandatory=$true)][string]$Query,
        [int]$TimeoutSeconds = 30
    )
    
    $instanceName = $Instance.NombreInstancia
    if (-not $instanceName) { $instanceName = $Instance.ServerName }
    
    if (-not $instanceName) {
        return @{
            InstanceName = "Unknown"
            CanConnect = $false
            JobCount = 0
            SampleJobs = @()
            Error = "Sin nombre de instancia"
        }
    }
    
    try {
        $dt = Invoke-QuerySqlClient -ServerInstance $instanceName -Database "msdb" -Query $Query -TimeoutSeconds $TimeoutSeconds
        
        $sampleJobs = @()
        $nullJobCount = 0
        
        Write-Host "  └─ Debug: Total columnas: $($dt.Columns.Count)" -ForegroundColor DarkCyan
        Write-Host "  └─ Debug: Columnas encontradas:" -ForegroundColor DarkCyan
        $colIndex = 0
        foreach ($col in $dt.Columns) {
            $displayColName = if ([string]::IsNullOrWhiteSpace($col.ColumnName)) { "<NULO/VACÍO>" } else { $col.ColumnName }
            Write-Host "      [$colIndex] $displayColName" -ForegroundColor DarkCyan
            $colIndex++
        }
        
        foreach ($row in $dt.Rows) {
            # Usar índice 0 para JobName (primera columna del SELECT)
            $jobName = $row[0]
            
            if ([string]::IsNullOrWhiteSpace($jobName)) {
                $nullJobCount++
            } else {
                if ($sampleJobs.Count -lt 3) {
                    $sampleJobs += $jobName
                }
            }
        }
        
        return @{
            InstanceName = $instanceName
            CanConnect = $true
            JobCount = $dt.Rows.Count
            ValidJobCount = ($dt.Rows.Count - $nullJobCount)
            NullJobCount = $nullJobCount
            SampleJobs = $sampleJobs
            Error = $null
        }
    } catch {
        return @{
            InstanceName = $instanceName
            CanConnect = $false
            JobCount = 0
            ValidJobCount = 0
            NullJobCount = 0
            SampleJobs = @()
            Error = $_.Exception.Message
        }
    }
}

# Helper: convertir $null -> [DBNull]::Value
function To-DbValue {
    param($v)
    if ($null -eq $v) { return [DBNull]::Value }
    return $v
}

function To-DataTable {
    param([System.Collections.IEnumerable]$Rows)

    $dt = New-Object System.Data.DataTable "InventoryJobs"

    # Columnas string
    foreach ($name in @("InstanceName","Ambiente","Hosting","JobName","JobStatus")) {
        $col = New-Object System.Data.DataColumn
        $col.ColumnName = $name
        $col.DataType   = [System.String]
        $col.AllowDBNull = $true
        [void]$dt.Columns.Add($col)
    }

    # Columnas datetime
    foreach ($name in @("JobStart","JobEnd","CaptureDate")) {
        $col = New-Object System.Data.DataColumn
        $col.ColumnName = $name
        $col.DataType   = [System.DateTime]
        $col.AllowDBNull = $true
        [void]$dt.Columns.Add($col)
    }

    # Columna int
    $col = New-Object System.Data.DataColumn
    $col.ColumnName = "JobDurationSeconds"
    $col.DataType   = [System.Int32]
    $col.AllowDBNull = $true
    [void]$dt.Columns.Add($col)

    foreach ($r in $Rows) {
        if ($null -eq $r) { continue }
        
        # Validación adicional: NO agregar filas con JobName null o vacío
        if ([string]::IsNullOrWhiteSpace($r.JobName)) {
            Write-Warning "Saltando fila con JobName nulo o vacío para instancia '$($r.InstanceName)'"
            continue
        }
        
        $row = $dt.NewRow()
        $row["InstanceName"]       = To-DbValue $r.InstanceName
        $row["Ambiente"]           = To-DbValue $r.Ambiente
        $row["Hosting"]            = To-DbValue $r.Hosting
        $row["JobName"]            = To-DbValue $r.JobName
        $row["JobStart"]           = To-DbValue $r.JobStart
        $row["JobEnd"]             = To-DbValue $r.JobEnd
        $row["JobDurationSeconds"] = To-DbValue $r.JobDurationSeconds
        $row["JobStatus"]          = To-DbValue $r.JobStatus
        $row["CaptureDate"]        = To-DbValue $r.CaptureDate
        [void]$dt.Rows.Add($row)
    }

    # MUY IMPORTANTE: devolver un único DataTable, sin enumerar
    Write-Output -NoEnumerate $dt
}

function BulkInsert {
    param(
        [System.Data.DataTable]$DataTable,
        [string]$Server, [string]$Database, [string]$Schema="dbo", [string]$Table="InventarioJobsSnapshot"
    )
    if (-not ($DataTable -is [System.Data.DataTable])) {
        $typeName = if ($null -eq $DataTable) { "<null>" } else { $DataTable.GetType().FullName }
        throw "BulkInsert: DataTable no válido (tipo real: $typeName)."
    }

    $connStr = "Server=$Server;Database=$Database;Integrated Security=True;TrustServerCertificate=True"
    $bulk = New-Object System.Data.SqlClient.SqlBulkCopy($connStr, [System.Data.SqlClient.SqlBulkCopyOptions]::KeepIdentity)
    $bulk.DestinationTableName = "[$Schema].[$Table]"
    $bulk.BatchSize = 5000
    $bulk.BulkCopyTimeout = 300

    $DataTable.Columns | ForEach-Object {
        [void]$bulk.ColumnMappings.Add($_.ColumnName, $_.ColumnName)
    }

    try {
        $bulk.WriteToServer($DataTable)
    } finally {
        $bulk.Close()
    }
}

function Invoke-QuerySqlClient {
    param(
        [Parameter(Mandatory=$true)][string]$ServerInstance,
        [Parameter(Mandatory=$true)][string]$Database,
        [Parameter(Mandatory=$true)][string]$Query,
        [int]$TimeoutSeconds = 90
    )
    # Fuerza TCP y bypass de certificado
    $connStr = "Server=$ServerInstance;Database=$Database;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;Network Library=DBMSSOCN;Application Name=InventoryJobsSnapshot;Connect Timeout=$TimeoutSeconds"
    $conn = New-Object System.Data.SqlClient.SqlConnection $connStr
    $cmd  = $conn.CreateCommand()
    $cmd.CommandText = $Query
    $cmd.CommandTimeout = $TimeoutSeconds

    $dt = New-Object System.Data.DataTable
    try {
        $conn.Open()
        $da = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        [void]$da.Fill($dt)
    } finally {
        if ($conn.State -ne [System.Data.ConnectionState]::Closed) { $conn.Close() }
        $conn.Dispose()
    }
    return $dt
}

function Process-Instance {
    param(
        [Parameter(Mandatory=$true)]$Instance,
        [Parameter(Mandatory=$true)]$CaptureTime,
        [Parameter(Mandatory=$true)][string]$Query,
        [Parameter(Mandatory=$true)][string]$TargetServer,
        [Parameter(Mandatory=$true)][string]$TargetDatabase,
        [string]$TargetSchema = "dbo",
        [string]$TargetTable = "InventarioJobsSnapshot",
        [int]$TimeoutSeconds = 90
    )
    
    # Obtener nombre de instancia y metadatos
    $instanceName = $Instance.NombreInstancia
    if (-not $instanceName) { $instanceName = $Instance.ServerName }
    $ambiente = $Instance.ambiente
    $hosting = $Instance.hostingSite
    
    if (-not $instanceName) {
        Write-Warning "Elemento sin NombreInstancia/ServerName. Se omite."
        return @{
            Success = $false
            InstanceName = "Unknown"
            JobCount = 0
            Error = "Sin nombre de instancia"
        }
    }
    
    # Consultar jobs de la instancia
    try {
        if ($VerboseLogging) {
            Write-Host "  └─ Consultando msdb en '$instanceName'..." -ForegroundColor Gray
        }
        $dt = Invoke-QuerySqlClient -ServerInstance $instanceName -Database "msdb" -Query $Query -TimeoutSeconds $TimeoutSeconds
        
        if ($DebugMode -and $dt.Rows.Count -gt 0) {
            Write-Host "  └─ Debug: Se encontraron $($dt.Rows.Count) filas en total" -ForegroundColor DarkGray
            # Mostrar primeras filas para debugging
            $dt.Rows | Select-Object -First 2 | ForEach-Object {
                Write-Host "      JobName: '$($_.JobName)' | Status: $($_.JobStatus)" -ForegroundColor DarkGray
            }
        }
    } catch {
        $errorMsg = "No se pudo consultar msdb en '$instanceName': $($_.Exception.Message)"
        Write-Warning $errorMsg
        return @{
            Success = $false
            InstanceName = $instanceName
            JobCount = 0
            Error = $errorMsg
        }
    }
    
    # Si no hay jobs, retornar sin error
    if ($dt.Rows.Count -eq 0) {
        if ($VerboseLogging) {
            Write-Host "  └─ No se encontraron jobs de mantenimiento en '$instanceName'" -ForegroundColor Yellow
        }
        return @{
            Success = $true
            InstanceName = $instanceName
            JobCount = 0
            Error = $null
        }
    }
    
    # Preparar filas para esta instancia
    $instanceRows = New-Object System.Collections.Generic.List[object]
    $skippedJobs = 0
    
    # Identificar índices de columnas por nombre
    $colIndexes = @{}
    for ($i = 0; $i -lt $dt.Columns.Count; $i++) {
        $colName = $dt.Columns[$i].ColumnName
        
        # Validar que el nombre de columna no sea nulo o vacío
        if ([string]::IsNullOrWhiteSpace($colName)) {
            Write-Warning "  └─ Advertencia: Columna en posición $i tiene nombre nulo o vacío"
            continue
        }
        
        $colIndexes[$colName] = $i
    }
    
    # Debug: Mostrar información sobre las columnas disponibles
    if ($DebugMode -and $dt.Rows.Count -gt 0) {
        Write-Host "  └─ Debug: Total filas recibidas del query: $($dt.Rows.Count)" -ForegroundColor DarkYellow
        Write-Host "  └─ Debug: Total columnas en DataTable: $($dt.Columns.Count)" -ForegroundColor DarkYellow
        Write-Host "  └─ Debug: Columnas encontradas y sus índices:" -ForegroundColor DarkYellow
        
        if ($colIndexes.Keys.Count -eq 0) {
            Write-Warning "      ¡NO SE ENCONTRARON COLUMNAS CON NOMBRES VÁLIDOS!"
            Write-Host "      Intentando mostrar nombres de columnas directamente:" -ForegroundColor DarkYellow
            for ($i = 0; $i -lt $dt.Columns.Count; $i++) {
                $rawColName = $dt.Columns[$i].ColumnName
                $displayName = if ([string]::IsNullOrWhiteSpace($rawColName)) { "<NULO/VACÍO>" } else { $rawColName }
                Write-Host "      [$i] $displayName" -ForegroundColor DarkYellow
            }
        } else {
            foreach ($key in $colIndexes.Keys | Sort-Object) {
                Write-Host "      [$($colIndexes[$key])] $key" -ForegroundColor DarkYellow
            }
        }
        
        # Mostrar primera fila completa para debug
        if ($dt.Rows.Count -gt 0) {
            $firstRow = $dt.Rows[0]
            Write-Host "  └─ Debug: Valores de la primera fila:" -ForegroundColor DarkYellow
            foreach ($key in @("JobName", "StartTime", "EndTime", "DurationSeconds", "JobStatus")) {
                if ($colIndexes.ContainsKey($key)) {
                    $idx = $colIndexes[$key]
                    $value = $firstRow[$idx]
                    $displayValue = if ($null -eq $value -or [string]::IsNullOrWhiteSpace($value.ToString())) { 
                        "<NULL o Vacío>" 
                    } else { 
                        "'$value'" 
                    }
                    Write-Host "      $key [$idx]: $displayValue" -ForegroundColor DarkYellow
                } else {
                    Write-Warning "      Columna '$key' NO ENCONTRADA en el resultado!"
                }
            }
        }
    }
    
    # Verificar que tenemos las columnas esperadas
    $requiredColumns = @("JobName", "StartTime", "EndTime", "DurationSeconds", "JobStatus")
    $missingColumns = @()
    foreach ($col in $requiredColumns) {
        if (-not $colIndexes.ContainsKey($col)) {
            $missingColumns += $col
        }
    }
    
    if ($missingColumns.Count -gt 0) {
        Write-Error "  └─ ERROR: Faltan columnas esperadas: $($missingColumns -join ', ')"
        Write-Host "  └─ Columnas disponibles: $($colIndexes.Keys -join ', ')" -ForegroundColor Yellow
        return @{
            Success = $false
            InstanceName = $instanceName
            JobCount = 0
            Error = "Estructura de datos incorrecta"
        }
    }
    
    # Obtener índices de las columnas que necesitamos
    $idx_JobName = $colIndexes["JobName"]
    $idx_StartTime = $colIndexes["StartTime"]
    $idx_EndTime = $colIndexes["EndTime"]
    $idx_Duration = $colIndexes["DurationSeconds"]
    $idx_Status = $colIndexes["JobStatus"]
    
    $rowNumber = 0
    foreach ($row in $dt.Rows) {
        $rowNumber++
        
        # Obtener JobName usando el índice correcto
        $jobName = $row[$idx_JobName]
        
        if ([string]::IsNullOrWhiteSpace($jobName)) {
            $skippedJobs++
            if ($VerboseLogging) {
                $actualValue = if ($null -eq $jobName) { "NULL" } else { "Vacío" }
                Write-Warning "  └─ Saltando job #$rowNumber sin nombre válido en '$instanceName' (valor es $actualValue)"
            }
            continue
        }
        
        try {
            $instanceRows.Add([pscustomobject]@{
                InstanceName       = $instanceName
                Ambiente           = $ambiente
                Hosting            = $hosting
                JobName            = $jobName
                JobStart           = $row[$idx_StartTime]
                JobEnd             = $row[$idx_EndTime]
                JobDurationSeconds = $row[$idx_Duration]
                JobStatus          = $row[$idx_Status]
                CaptureDate        = $CaptureTime
            })
            
            if ($DebugMode -and $instanceRows.Count -eq 1) {
                Write-Host "  └─ Debug: Primer job válido agregado: '$jobName'" -ForegroundColor Green
            }
        } catch {
            Write-Warning "  └─ Error al procesar fila #$rowNumber : $($_.Exception.Message)"
        }
    }
    
    if ($skippedJobs -gt 0) {
        Write-Warning "  └─ Se saltaron $skippedJobs jobs sin nombre válido en '$instanceName'"
        if ($DebugMode) {
            Write-Host "  └─ Debug: Total filas en DataTable: $($dt.Rows.Count)" -ForegroundColor DarkYellow
            Write-Host "  └─ Debug: Jobs válidos procesados: $($instanceRows.Count)" -ForegroundColor DarkYellow
            Write-Host "  └─ Debug: Jobs saltados: $skippedJobs" -ForegroundColor DarkYellow
        }
    }
    
    # Si después de filtrar no quedan jobs válidos, retornar sin error
    if ($instanceRows.Count -eq 0) {
        if ($VerboseLogging) {
            Write-Host "  └─ No se encontraron jobs válidos después de filtrar en '$instanceName'" -ForegroundColor Yellow
        }
        return @{
            Success = $true
            InstanceName = $instanceName
            JobCount = 0
            Error = $null
        }
    }
    
    # Convertir a DataTable
    $dtInstance = To-DataTable -Rows $instanceRows
    
    # Insertar los jobs de esta instancia
    try {
        BulkInsert -DataTable $dtInstance -Server $TargetServer -Database $TargetDatabase -Schema $TargetSchema -Table $TargetTable
        
        if ($VerboseLogging) {
            Write-Host "  └─ ✅ Insertados $($instanceRows.Count) jobs de '$instanceName'" -ForegroundColor Green
        }
        
        return @{
            Success = $true
            InstanceName = $instanceName
            JobCount = $instanceRows.Count
            Error = $null
        }
    } catch {
        $errorMsg = "Error al insertar jobs de '$instanceName': $($_.Exception.Message)"
        Write-Error $errorMsg
        return @{
            Success = $false
            InstanceName = $instanceName
            JobCount = $instanceRows.Count
            Error = $errorMsg
        }
    }
}

# =============== MAIN ===============
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " Inventario Jobs - Proceso Incremental" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Mostrar configuración activa
Write-Host "Configuración:" -ForegroundColor Yellow
Write-Host "  ContinueOnError: $ContinueOnError" -ForegroundColor Gray
Write-Host "  VerboseLogging:  $VerboseLogging" -ForegroundColor Gray
Write-Host "  DebugMode:       $DebugMode" -ForegroundColor Gray
Write-Host "  RunDiagnostic:   $RunDiagnostic" -ForegroundColor $(if ($RunDiagnostic) {"Magenta"} else {"Gray"})
Write-Host "  UseSimpleQuery:  $UseSimpleQuery" -ForegroundColor $(if ($UseSimpleQuery) {"Yellow"} else {"Gray"})
Write-Host ""

# 1) Traer inventario (instancias) desde la API
Write-Host "1. Obteniendo inventario desde API..." -ForegroundColor Cyan
try {
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method GET -Headers @{ "Accept"="application/json" } -TimeoutSec 60
    Write-Host "   ✓ API consultada exitosamente" -ForegroundColor Green
} catch {
    Write-Error "No se pudo consultar la API $ApiUrl. $($_.Exception.Message)"
    return
}

# 1.1) Excluir instancias cuyo hostingSite sea AWS y nombres que contengan 'DMZ'
Write-Host ""
Write-Host "2. Aplicando filtros..." -ForegroundColor Cyan
$preCount = ($instances | Measure-Object).Count
$instances = $instances | Where-Object {
    $hs    = [string]($_.hostingSite)
    $name1 = [string]($_.NombreInstancia)
    $name2 = [string]($_.ServerName)
    ($hs -notmatch '^(?i)aws$') -and `
    ($name1 -notmatch '(?i)DMZ') -and `
    ($name2 -notmatch '(?i)DMZ')
}
$postCount = ($instances | Measure-Object).Count
if ($preCount -gt $postCount) {
    Write-Host "   ✓ Filtradas $($preCount - $postCount) instancias (AWS/DMZ)" -ForegroundColor Yellow
}
Write-Host "   ✓ Instancias a procesar: $postCount" -ForegroundColor Green

if (-not $instances -or $instances.Count -eq 0) {
    Write-Warning "No hay instancias elegibles tras el filtro (AWS/DMZ)."
    return
}

# 2) Crear tabla si no existe
Write-Host ""
Write-Host "3. Verificando tabla destino..." -ForegroundColor Cyan
Ensure-Table -Server $SqlServer -Database $SqlDatabase -Schema $SqlSchema -Table $SqlTable
Write-Host "   ✓ Tabla $SqlServer.$SqlDatabase.$SqlSchema.$SqlTable lista" -ForegroundColor Green

# 3) Preparar captura (timestamp único para todas las filas)
$captureUtc = [datetime]::UtcNow

# 3.1) Modo diagnóstico (opcional)
if ($RunDiagnostic) {
    Write-Host ""
    Write-Host "4. Ejecutando DIAGNÓSTICO (no se insertarán datos)..." -ForegroundColor Magenta
    Write-Host ""
    
    $diagResults = @{
        CanConnect = 0
        CantConnect = 0
        WithJobs = 0
        WithNullJobs = 0
        TotalJobs = 0
        TotalValidJobs = 0
    }
    
    $counter = 0
    foreach ($inst in $instances | Select-Object -First 10) {  # Solo primeras 10 para diagnóstico
        $counter++
        $instanceName = $inst.NombreInstancia
        if (-not $instanceName) { $instanceName = $inst.ServerName }
        
        Write-Host "[$counter/10] Probando: $instanceName" -ForegroundColor Magenta
        
        $test = Test-InstanceConnection -Instance $inst -Query $QueryToUse -TimeoutSeconds 30
        
        if ($test.CanConnect) {
            $diagResults.CanConnect++
            Write-Host "  └─ ✓ Conectado | Jobs: $($test.JobCount) (Válidos: $($test.ValidJobCount), Nulos: $($test.NullJobCount))" -ForegroundColor Green
            
            if ($test.NullJobCount -gt 0) {
                $diagResults.WithNullJobs++
                Write-Warning "     ⚠️ Esta instancia tiene $($test.NullJobCount) jobs con nombre NULL"
            }
            
            if ($test.ValidJobCount -gt 0) {
                $diagResults.WithJobs++
                $diagResults.TotalJobs += $test.JobCount
                $diagResults.TotalValidJobs += $test.ValidJobCount
                
                if ($test.SampleJobs.Count -gt 0) {
                    Write-Host "     Jobs ejemplo:" -ForegroundColor Gray
                    $test.SampleJobs | ForEach-Object {
                        Write-Host "       - $_" -ForegroundColor DarkGray
                    }
                }
            }
        } else {
            $diagResults.CantConnect++
            Write-Host "  └─ ✗ No se pudo conectar: $($test.Error)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "RESUMEN DIAGNÓSTICO:" -ForegroundColor Magenta
    Write-Host "  Instancias conectadas:     $($diagResults.CanConnect)" -ForegroundColor Green
    Write-Host "  Instancias no conectadas:  $($diagResults.CantConnect)" -ForegroundColor Red
    Write-Host "  Instancias con jobs:       $($diagResults.WithJobs)" -ForegroundColor White
    Write-Host "  Instancias con jobs NULL:  $($diagResults.WithNullJobs)" -ForegroundColor Yellow
    Write-Host "  Total jobs encontrados:    $($diagResults.TotalJobs)" -ForegroundColor White
    Write-Host "  Total jobs válidos:        $($diagResults.TotalValidJobs)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Diagnóstico completado. El script terminará sin insertar datos." -ForegroundColor Magenta
    return
}

# 4) Procesamiento normal
Write-Host ""
Write-Host "4. Iniciando procesamiento incremental..." -ForegroundColor Cyan
Write-Host "   Timestamp de captura: $captureUtc" -ForegroundColor Gray
Write-Host ""

# Contadores de estadísticas
$stats = @{
    TotalInstances = $instances.Count
    ProcessedInstances = 0
    FailedInstances = 0
    TotalJobs = 0
    InstancesWithJobs = 0
    InstancesWithoutJobs = 0
}

# 4) Procesar cada instancia individualmente
$counter = 0
foreach ($inst in $instances) {
    $counter++
    $instanceName = $inst.NombreInstancia
    if (-not $instanceName) { $instanceName = $inst.ServerName }
    
    Write-Host "[$counter/$($instances.Count)] Procesando: $instanceName" -ForegroundColor Cyan
    
    $result = Process-Instance -Instance $inst `
                               -CaptureTime $captureUtc `
                               -Query $QueryToUse `
                               -TargetServer $SqlServer `
                               -TargetDatabase $SqlDatabase `
                               -TargetSchema $SqlSchema `
                               -TargetTable $SqlTable `
                               -TimeoutSeconds $TimeoutSec
    
    # Actualizar estadísticas
    if ($result.Success) {
        $stats.ProcessedInstances++
        $stats.TotalJobs += $result.JobCount
        if ($result.JobCount -gt 0) {
            $stats.InstancesWithJobs++
        } else {
            $stats.InstancesWithoutJobs++
        }
    } else {
        $stats.FailedInstances++
        if (-not $ContinueOnError) {
            Write-Error "Proceso detenido por error en instancia '$($result.InstanceName)'"
            break
        }
    }
}

# 5) Mostrar resumen final
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " RESUMEN DE EJECUCIÓN" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "Instancias totales:         $($stats.TotalInstances)" -ForegroundColor White
Write-Host "Instancias procesadas:      $($stats.ProcessedInstances)" -ForegroundColor Green
Write-Host "Instancias con error:       $($stats.FailedInstances)" -ForegroundColor $(if ($stats.FailedInstances -gt 0) {"Red"} else {"Green"})
Write-Host "Instancias con jobs:        $($stats.InstancesWithJobs)" -ForegroundColor White
Write-Host "Instancias sin jobs:        $($stats.InstancesWithoutJobs)" -ForegroundColor White
Write-Host "Total jobs insertados:      $($stats.TotalJobs)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tabla destino: $SqlServer.$SqlDatabase.$SqlSchema.$SqlTable" -ForegroundColor Gray
Write-Host "Timestamp de captura: $captureUtc" -ForegroundColor Gray
Write-Host ""

if ($stats.FailedInstances -eq 0) {
    Write-Host "✅ Proceso completado exitosamente" -ForegroundColor Green
} elseif ($stats.ProcessedInstances -gt 0) {
    Write-Host "⚠️ Proceso completado con errores" -ForegroundColor Yellow
} else {
    Write-Host "❌ Proceso falló completamente" -ForegroundColor Red
}

Write-Host "Finalizado: $([DateTime]::Now)" -ForegroundColor Gray