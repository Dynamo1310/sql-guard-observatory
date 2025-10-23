# SQL Server HealthScore - Script de Relevamiento

## 📋 Descripción

`RelevamientoHealthScoreMant.ps1` es un script de PowerShell 7+ de nivel producción que calcula un **HealthScore** (0-100) para cada instancia SQL Server en el inventario. El score se basa en múltiples categorías de salud:

- **Disponibilidad (30%)**: Conectividad y latencia
- **Jobs & Backups (25%)**: Recencia de backups y maintenance jobs
- **Discos & Recursos (20%)**: Espacio libre, CPU, memoria
- **AlwaysOn/Replicación (15%)**: Estado de sincronización (si aplica)
- **Errorlog (10%)**: Errores críticos en las últimas 24h

## 🎯 Características Principales

- ✅ **Sin PS Remoting**: Todas las métricas se obtienen vía T-SQL y DMVs
- ✅ **Funciona en Onpremise y AWS**: Sin casos especiales por plataforma
- ✅ **Filtrado automático**: Excluye instancias con "DMZ" en el nombre
- ✅ **Procesamiento paralelo**: Opción `-Parallel` para mayor velocidad
- ✅ **Múltiples salidas**: JSON, CSV y tabla SQL
- ✅ **Modo mock**: Para pruebas sin conectar a instancias reales
- ✅ **Timeout configurable**: Control fino sobre conexiones SQL
- ✅ **Manejo robusto de errores**: No falla si algunas instancias no responden

## 📊 Modelo de HealthScore

### Categorías y Pesos

| Categoría | Peso | Criterios |
|-----------|------|-----------|
| **Availability** | 30% | Conexión exitosa < 3s = 100 pts<br>Conexión 3-5s = degradación lineal<br>Fallo/timeout = 0 pts |
| **Jobs & Backups** | 25% | CHECKDB < 7 días = 40 pts<br>IndexOptimize < 7 días = 30 pts<br>Sin brechas backup = 30 pts |
| **Disks & Resources** | 20% | Peor volumen > 20% libre = 100 pts<br>15-20% = 80 pts<br>10-15% = 60 pts<br>5-10% = 30 pts<br>< 5% = 0 pts<br>-20 pts si presión de memoria |
| **AlwaysOn** | 15% | No habilitado = 100 pts (neutral)<br>Sincronizado = 100 pts<br>Lag < 15 min = 60 pts<br>Redo queue alto = 40 pts<br>No sincronizado = 0 pts |
| **Errorlog** | 10% | Sin errores Severity 20+ = 100 pts<br>1-2 errores = 50 pts<br>3+ errores = 0 pts<br>No accesible = 100 pts (neutral) |

### Estados Finales

- **Healthy**: Score >= 90
- **Warning**: Score 70-89
- **Critical**: Score < 70

## 🚀 Uso

### Uso Básico

```powershell
# Modo de prueba rápida (RECOMENDADO PARA EMPEZAR)
.\RelevamientoHealthScoreMant.ps1 -TestMode

# Ejecución simple (guarda JSON y CSV)
.\RelevamientoHealthScoreMant.ps1

# Con procesamiento paralelo
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 12

# Guardar también en tabla SQL
.\RelevamientoHealthScoreMant.ps1 -WriteToSql

# Modo de prueba con datos sintéticos
.\RelevamientoHealthScoreMant.ps1 -Mock

# Procesar solo 5 instancias (útil para pruebas)
.\RelevamientoHealthScoreMant.ps1 -TestLimit 5
```

### Parámetros Principales

```powershell
-ApiUrl <string>
    URL de la API de inventario
    Default: "http://asprbm-nov-01/InventoryDBA/inventario/"

-TimeoutSec <int>
    Timeout para conexiones SQL en segundos
    Default: 10

-Parallel
    Habilita procesamiento paralelo

-Throttle <int>
    Número de threads paralelos
    Default: 8

-OutJson <string>
    Ruta del archivo JSON de salida
    Default: ".\InstanceHealth.json"

-OutCsv <string>
    Ruta del archivo CSV de salida
    Default: ".\InstanceHealth.csv"

-WriteToSql
    Escribe resultados en tabla SQL centralizada

-SqlServer <string>
    Servidor SQL del repositorio
    Default: "SSPR17MON-01"

-SqlDatabase <string>
    Base de datos del repositorio
    Default: "SQLNova"

-SqlTable <string>
    Nombre de la tabla de destino
    Default: "InstanceHealthSnapshot"

-SqlCredential <PSCredential>
    Credencial para autenticación SQL (si es null, usa Windows Auth)

-TestMode
    Modo de prueba rápida: procesa solo 5 instancias con salida detallada
    Combina: -TestLimit 5, salida verbosa, sin escritura a SQL por defecto

-Mock
    Modo de prueba con datos sintéticos

-TestLimit <int>
    Límite de instancias a procesar (0 = sin límite)
```

## 📁 Estructura de Salida

### JSON (Completo)

```json
[
  {
    "InstanceName": "SSPR17-01",
    "Ambiente": "Producción",
    "HostingSite": "Onpremise",
    "Version": "Microsoft SQL Server 2019",
    "ConnectSuccess": true,
    "ConnectLatencyMs": 150,
    "BackupSummary": {
      "CheckdbOk": true,
      "IndexOptimizeOk": true,
      "LastCheckdb": "2024-01-15",
      "LastIndexOptimize": "2024-01-17",
      "Breaches": []
    },
    "DiskSummary": {
      "WorstVolumeFreePct": 35.5,
      "Volumes": [
        {
          "Drive": "C:\\",
          "TotalGB": 200,
          "FreeGB": 71,
          "FreePct": 35.5
        }
      ]
    },
    "AlwaysOnSummary": {
      "Enabled": true,
      "WorstState": "OK",
      "Issues": []
    },
    "ErrorlogSummary": {
      "Severity20PlusCount24h": 0,
      "Skipped": false
    },
    "HealthScore": 95,
    "HealthStatus": "Healthy",
    "GeneratedAtUtc": "2024-01-17T10:30:00Z"
  }
]
```

### CSV (Simplificado para dashboards)

```csv
InstanceName,Ambiente,HostingSite,HealthStatus,HealthScore,ConnectLatencyMs,WorstVolumeFreePct,BackupBreachesCount,AlwaysOnIssuesCount,Severity20PlusCount24h,GeneratedAtUtc
SSPR17-01,Producción,Onpremise,Healthy,95,150,35.50,0,0,0,2024-01-17 10:30:00
SSDS16-03,Desarrollo,Onpremise,Warning,78,250,18.20,1,0,0,2024-01-17 10:30:15
SSAWS-01,Producción,AWS,Critical,55,8500,8.30,5,2,3,2024-01-17 10:30:30
```

### Tabla SQL

La tabla `InstanceHealthSnapshot` en `SSPR17MON-01.SQLNova` contiene:

```sql
CREATE TABLE [dbo].[InstanceHealthSnapshot] (
    [InstanceName]         NVARCHAR(200)  NOT NULL,
    [Ambiente]             NVARCHAR(50)   NULL,
    [HostingSite]          NVARCHAR(50)   NULL,
    [Version]              NVARCHAR(100)  NULL,
    [ConnectSuccess]       BIT            NOT NULL,
    [ConnectLatencyMs]     INT            NULL,
    [BackupJson]           NVARCHAR(MAX)  NULL,
    [MaintenanceJson]      NVARCHAR(MAX)  NULL,
    [DiskJson]             NVARCHAR(MAX)  NULL,
    [ResourceJson]         NVARCHAR(MAX)  NULL,
    [AlwaysOnJson]         NVARCHAR(MAX)  NULL,
    [ErrorlogJson]         NVARCHAR(MAX)  NULL,
    [HealthScore]          INT            NOT NULL,
    [HealthStatus]         VARCHAR(10)    NOT NULL,
    [GeneratedAtUtc]       DATETIME2      NOT NULL,
    CONSTRAINT PK_InstanceHealthSnapshot PRIMARY KEY ([InstanceName], [GeneratedAtUtc])
);
```

**Nota**: La tabla se crea automáticamente si no existe cuando se usa `-WriteToSql`.

## 🔍 Métricas Recolectadas

### 1. Availability (Disponibilidad)

- **Query**: `SELECT @@SERVERNAME`
- **Medición**: Tiempo de respuesta en milisegundos
- **Fuente**: Conexión directa

### 2. Errorlog

- **Query**: `xp_readerrorlog` para errores Severity >= 20 en últimas 24h
- **Manejo**: Si no hay permisos, se marca como "Skipped" y se da score neutral
- **Fuente**: Extended stored procedure

### 3. Jobs & Backups

**Jobs de Mantenimiento:**
```sql
-- Busca cualquier job que contenga IntegrityCheck o IndexOptimize
SELECT * FROM msdb.dbo.sysjobs
WHERE name LIKE '%IntegrityCheck%' OR name LIKE '%IndexOptimize%'
```

**Ejemplos de jobs detectados**:
- `DatabaseIntegrityCheck` (Ola Hallengren)
- `CustomIntegrityCheck` (scripts propios)
- `Maintenance_IntegrityCheck_Production`
- `CHECKDB_IntegrityCheck`
- `IndexOptimize` (Ola Hallengren)
- `Nightly_IndexOptimize_UserDBs`

**Criterio**: Toma la **última ejecución exitosa** (`run_status = 1`) en los últimos 7 días.

**Backups:**
```sql
-- Edad del último backup FULL, DIFF y LOG por base de datos
SELECT 
    d.name,
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS LastFull,
    MAX(CASE WHEN b.type = 'I' THEN b.backup_finish_date END) AS LastDiff,
    MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) AS LastLog
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON d.name = b.database_name
GROUP BY d.name
```

**SLA por defecto:**
- FULL: <= 25 horas
- DIFF: <= 12 horas (opcional, no se valida)
- LOG: <= 2 horas (para FULL/BULK_LOGGED recovery)
- CHECKDB: <= 7 días
- IndexOptimize: <= 7 días

**Nota para AlwaysOn**: Los backups se consultan en **todos los nodos del AG** y se toma el backup **más reciente** entre ellos (típicamente los backups se ejecutan solo en el nodo secundario).

### 4. Discos & Recursos

**Espacio en disco:**
```sql
SELECT DISTINCT
    vs.volume_mount_point AS Drive,
    vs.total_bytes / 1073741824.0 AS TotalGB,
    vs.available_bytes / 1073741824.0 AS FreeGB,
    (vs.available_bytes * 100.0 / vs.total_bytes) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
```

**Memoria:**
```sql
-- Page Life Expectancy < 300 segundos = presión de memoria
SELECT counter_name, cntr_value
FROM sys.dm_os_performance_counters
WHERE counter_name = 'Page life expectancy'
```

### 5. AlwaysOn

**Verificar si está habilitado:**
```sql
SELECT SERVERPROPERTY('IsHadrEnabled') AS IsHadrEnabled
```

**Estado de sincronización:**
```sql
SELECT 
    ag.name AS AGName,
    db.database_name,
    drs.synchronization_state_desc,
    drs.synchronization_health_desc,
    drs.redo_queue_size,
    DATEDIFF(SECOND, drs.last_commit_time, GETDATE()) AS SecondsBehind
FROM sys.dm_hadr_database_replica_states drs
JOIN sys.availability_databases_cluster db ON drs.group_database_id = db.group_database_id
JOIN sys.availability_groups ag ON ag.group_id = drs.group_id
WHERE drs.is_local = 1
```

## 🎭 Modo Mock (Testing)

El modo `-Mock` genera dos instancias sintéticas:

1. **MOCK-HEALTHY-01**: Score 95, todas las métricas OK
2. **MOCK-CRITICAL-01**: Score 25, múltiples problemas

Útil para:
- Probar el formato de salida sin acceso a instancias reales
- Validar lógica de scoring
- Desarrollar dashboards

```powershell
.\RelevamientoHealthScoreMant.ps1 -Mock
```

## ⚡ Rendimiento

### Modo Secuencial (Default)
- 1 instancia a la vez
- ~5-10 segundos por instancia (depende de conectividad)
- Uso: **100 instancias = ~10-15 minutos**

### Modo Paralelo
```powershell
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 12
```
- 12 instancias simultáneas
- Uso: **100 instancias = ~3-5 minutos**

**Recomendación**: Usar `-Throttle` entre 8-16 dependiendo de recursos del servidor donde se ejecuta.

## 🔐 Autenticación

### Windows Authentication (Default)

```powershell
# Usa la cuenta de Windows actual
.\RelevamientoHealthScoreMant.ps1
```

### SQL Authentication

```powershell
$cred = Get-Credential -Message "Credenciales SQL"
.\RelevamientoHealthScoreMant.ps1 -SqlCredential $cred
```

## 📅 Automatización (Task Scheduler)

### Crear tarea programada diaria

```powershell
# Script de ejemplo para ejecutar diariamente a las 2 AM
$action = New-ScheduledTaskAction -Execute 'pwsh.exe' -Argument '-File C:\Scripts\RelevamientoHealthScoreMant.ps1 -WriteToSql'
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
$principal = New-ScheduledTaskPrincipal -UserId "DOMAIN\ServiceAccount" -LogonType Password
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable

Register-ScheduledTask -TaskName "SQL_HealthScore_Daily" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
```

## 📊 Consultas SQL Útiles

### Instancias con score < 70 (Critical)

```sql
SELECT 
    InstanceName,
    Ambiente,
    HealthScore,
    HealthStatus,
    ConnectSuccess,
    GeneratedAtUtc
FROM [dbo].[InstanceHealthSnapshot]
WHERE GeneratedAtUtc > DATEADD(HOUR, -24, GETUTCDATE())
  AND HealthScore < 70
ORDER BY HealthScore ASC;
```

### Tendencia de score por instancia (últimos 7 días)

```sql
SELECT 
    InstanceName,
    CAST(GeneratedAtUtc AS DATE) AS FechaScore,
    AVG(HealthScore) AS AvgScore,
    MIN(HealthScore) AS MinScore,
    MAX(HealthScore) AS MaxScore
FROM [dbo].[InstanceHealthSnapshot]
WHERE GeneratedAtUtc > DATEADD(DAY, -7, GETUTCDATE())
GROUP BY InstanceName, CAST(GeneratedAtUtc AS DATE)
ORDER BY InstanceName, FechaScore DESC;
```

### Top 10 instancias más críticas

```sql
WITH LastScores AS (
    SELECT 
        InstanceName,
        HealthScore,
        HealthStatus,
        Ambiente,
        HostingSite,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealthSnapshot]
)
SELECT TOP 10
    InstanceName,
    Ambiente,
    HostingSite,
    HealthScore,
    HealthStatus
FROM LastScores
WHERE rn = 1
ORDER BY HealthScore ASC;
```

### Detalle de problemas por categoría

```sql
SELECT 
    InstanceName,
    HealthScore,
    HealthStatus,
    JSON_VALUE(BackupJson, '$.Breaches') AS BackupIssues,
    JSON_VALUE(DiskJson, '$.WorstVolumeFreePct') AS WorstDiskPct,
    JSON_VALUE(AlwaysOnJson, '$.Issues') AS AlwaysOnIssues,
    JSON_VALUE(ErrorlogJson, '$.Severity20PlusCount24h') AS CriticalErrors
FROM [dbo].[InstanceHealthSnapshot]
WHERE GeneratedAtUtc = (
    SELECT MAX(GeneratedAtUtc) FROM [dbo].[InstanceHealthSnapshot]
)
ORDER BY HealthScore ASC;
```

## 🔧 Troubleshooting

### Error: "Módulo SqlServer no encontrado"
```powershell
# El script lo instala automáticamente, pero si falla:
Install-Module SqlServer -Scope CurrentUser -Force -AllowClobber
```

### Error: "Connection timeout"
```powershell
# Aumentar el timeout
.\RelevamientoHealthScoreMant.ps1 -TimeoutSec 30
```

### Error: "Access denied" en xp_readerrorlog
- Normal en instancias donde el usuario no tiene permisos VIEW SERVER STATE
- El script marca como "Skipped" y da score neutral (no penaliza)

### Instancias muy lentas
```powershell
# Usar modo paralelo y aumentar timeout
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 8 -TimeoutSec 20
```

## 📝 Notas Importantes

1. **Requisitos**:
   - PowerShell 7 o superior
   - Módulo SqlServer (se instala automáticamente)
   - Conectividad SQL a las instancias del inventario
   - Permisos VIEW SERVER STATE en las instancias (recomendado)

2. **Filtrado de DMZ**:
   - Se excluyen automáticamente instancias con "DMZ" (case-insensitive) en `ServerName` o `NombreInstancia`

3. **Snapshots**:
   - Cada ejecución genera un nuevo snapshot con timestamp
   - No se sobrescribe data antigua (permite análisis histórico)
   - La tabla usa PK compuesta: `(InstanceName, GeneratedAtUtc)`

4. **Timeout**:
   - Default: 10 segundos
   - Se aplica tanto a ConnectionTimeout como QueryTimeout
   - Ajustar según latencia de red

5. **JSON en SQL**:
   - Los detalles se guardan en columnas JSON para flexibilidad
   - Usar `JSON_VALUE()` para extraer campos específicos

## 🎓 Ejemplos de Uso Avanzados

### 1. Ejecución diaria con logs

```powershell
$logFile = "C:\Logs\HealthScore_$(Get-Date -Format 'yyyyMMdd').log"
.\RelevamientoHealthScoreMant.ps1 -WriteToSql -Parallel -Throttle 10 *>&1 | Tee-Object -FilePath $logFile
```

### 2. Procesar solo instancias de producción

```powershell
# Modificar el script para añadir filtro adicional, o procesar el JSON después
$results = .\RelevamientoHealthScoreMant.ps1 | ConvertFrom-Json
$prodResults = $results | Where-Object { $_.Ambiente -eq "Producción" }
$prodResults | ConvertTo-Json -Depth 10 | Out-File "HealthScore_Prod.json"
```

### 3. Alertas por email si hay instancias críticas

```powershell
.\RelevamientoHealthScoreMant.ps1 -WriteToSql

$critical = Import-Csv ".\InstanceHealth.csv" | Where-Object { $_.HealthStatus -eq "Critical" }

if ($critical.Count -gt 0) {
    $body = $critical | ConvertTo-Html -Fragment
    Send-MailMessage -To "dba@empresa.com" -From "monitoring@empresa.com" `
        -Subject "ALERTA: $($critical.Count) instancias SQL críticas" `
        -Body $body -BodyAsHtml -SmtpServer "smtp.empresa.com"
}
```

## 📞 Soporte

Para consultas o problemas:
- Revisar logs de ejecución
- Verificar permisos en instancias SQL
- Validar conectividad de red
- Probar con `-Mock` para descartar problemas del script

---

**Versión**: 1.0  
**Fecha**: Octubre 2024  
**Equipo**: SQL Guard Observatory

