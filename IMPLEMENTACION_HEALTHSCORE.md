# Implementación HealthScore para SQL Server

## 📋 Resumen

Se ha implementado un **sistema completo de HealthScore** para monitorear la salud de todas las instancias SQL Server del inventario. El sistema calcula un score de 0 a 100 basado en múltiples métricas críticas y genera reportes en JSON, CSV y tabla SQL.

**Fecha de implementación**: Octubre 2024  
**Versión**: 1.0  
**Ubicación**: `scripts/RelevamientoHealthScoreMant.ps1`

---

## 🎯 Objetivos Cumplidos

- ✅ Cálculo automático de HealthScore (0-100) por instancia
- ✅ Métricas basadas en T-SQL (sin dependencia de PS Remoting)
- ✅ Soporte para Onpremise y AWS sin casos especiales
- ✅ Filtrado automático de instancias DMZ
- ✅ Procesamiento paralelo para ejecución rápida
- ✅ Múltiples formatos de salida (JSON, CSV, SQL)
- ✅ Modo mock para testing
- ✅ Manejo robusto de errores

---

## 📊 Modelo de Salud

### Categorías y Pesos

| Categoría | Peso | Descripción |
|-----------|------|-------------|
| **Availability** | 30% | Conectividad y latencia de respuesta |
| **Jobs & Backups** | 25% | Recencia de backups y maintenance jobs |
| **Disks & Resources** | 20% | Espacio en disco, CPU, memoria |
| **AlwaysOn** | 15% | Estado de sincronización (si aplica) |
| **Errorlog** | 10% | Errores críticos últimas 24h |

### Estados

- **Healthy**: Score >= 90 (🟢)
- **Warning**: Score 70-89 (🟡)
- **Critical**: Score < 70 (🔴)

---

## 📁 Archivos Implementados

```
sql-guard-observatory/
├── scripts/
│   ├── RelevamientoHealthScoreMant.ps1      # Script principal
│   ├── EjecutarHealthScore.ps1               # Menú interactivo
│   ├── ConsultarHealthScore.sql              # Queries y vistas SQL
│   ├── QUICKSTART_HEALTHSCORE.md             # Guía rápida de inicio ⭐
│   └── README_HEALTHSCORE.md                 # Documentación detallada
└── IMPLEMENTACION_HEALTHSCORE.md             # Este archivo
```

### Descripción de Archivos

#### 1. `RelevamientoHealthScoreMant.ps1` (Script Principal)

**Responsabilidad**: Ejecutar el relevamiento completo de HealthScore.

**Características principales**:
- PowerShell 7+ con soporte de paralelismo nativo
- Consulta API de inventario: `http://asprbm-nov-01/InventoryDBA/inventario/`
- Excluye automáticamente instancias con "DMZ"
- Calcula métricas mediante T-SQL y DMVs
- Genera JSON, CSV y opcionalmente tabla SQL
- Timeout configurable (default: 10 segundos)
- Modo mock para testing

**Parámetros principales**:
```powershell
-Parallel              # Procesamiento paralelo
-Throttle <int>        # Threads paralelos (default: 8)
-WriteToSql            # Guardar en SSPR17MON-01.SQLNova
-TimeoutSec <int>      # Timeout SQL (default: 10)
-Mock                  # Modo de prueba
-TestLimit <int>       # Limitar instancias a procesar
```

#### 2. `EjecutarHealthScore.ps1` (Menú Interactivo)

**Responsabilidad**: Facilitar la ejecución con opciones predefinidas.

**Modos disponibles**:
1. Ejecución rápida (5 instancias)
2. Ejecución completa secuencial
3. Ejecución completa paralela
4. Ejecución con guardado SQL
5. Modo mock
6. Configuración personalizada

#### 3. `ConsultarHealthScore.sql` (Queries SQL)

**Responsabilidad**: Analizar datos de HealthScore en SQL Server.

**Contenido**:
- 3 vistas principales:
  - `vw_LatestHealthScore`: Último score por instancia
  - `vw_HealthScoreSummary`: Resumen ejecutivo con métricas clave
  - `vw_HealthScoreTrend`: Tendencias últimos 7 días
  
- 16 queries útiles:
  - Dashboard principal
  - Top 10 instancias críticas
  - Problemas de espacio en disco
  - Backups vencidos
  - Problemas AlwaysOn
  - Sin conectividad
  - Resúmenes por ambiente/hosting
  - Evolución temporal
  - Instancias que empeoraron
  - Comparación con promedios
  - Errores críticos
  - Reporte ejecutivo
  - Historial detallado
  - Limpieza de datos antiguos

#### 4. `QUICKSTART_HEALTHSCORE.md` (Guía Rápida) ⭐

**Responsabilidad**: Guía de inicio rápido para nuevos usuarios.

**Contenido**:
- Cómo ejecutar el primer relevamiento en 5 minutos
- Explicación del modo `-TestMode`
- Interpretación de resultados básicos
- Comandos útiles post-ejecución
- Checklist de primera ejecución
- **Ideal para**: Usuarios nuevos que quieren empezar rápido

#### 5. `README_HEALTHSCORE.md` (Documentación Completa)

**Responsabilidad**: Documentación técnica detallada del sistema.

**Contenido**:
- Descripción detallada del modelo de HealthScore
- Guía de uso con ejemplos avanzados
- Estructura de salida (JSON, CSV, SQL)
- Métricas recolectadas y queries utilizadas
- Guía de rendimiento y optimización
- Troubleshooting detallado
- Ejemplos de automatización
- **Ideal para**: Usuarios avanzados y administradores

---

## 🗄️ Estructura de Datos

### Tabla SQL: `InstanceHealthSnapshot`

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

**Ubicación**: `SSPR17MON-01.SQLNova.dbo.InstanceHealthSnapshot`

**Características**:
- PK compuesta: permite histórico por instancia
- Columnas JSON para almacenar detalles complejos
- Índices en HealthStatus y HealthScore para queries rápidas
- Auto-creación al ejecutar con `-WriteToSql`

---

## 🚀 Uso Rápido

### Primera Ejecución (Modo de Prueba)

```powershell
# RECOMENDADO: Empezar con el modo de prueba
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScoreMant.ps1 -TestMode

# O usar el menú interactivo y seleccionar opción 1
.\EjecutarHealthScore.ps1
```

El modo `-TestMode`:
- ✅ Procesa solo 5 instancias (rápido)
- ✅ Salida detallada en consola
- ✅ NO escribe a SQL (solo archivos locales)
- ✅ Perfecto para validar el funcionamiento

### Ejecución Completa

```powershell
# Opción 1: Menú interactivo (recomendado para usuarios)
.\EjecutarHealthScore.ps1

# Opción 2: Ejecución directa
.\RelevamientoHealthScoreMant.ps1

# Opción 3: Ejecución paralela con SQL
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 10 -WriteToSql
```

### Pruebas (Testing)

```powershell
# Modo de prueba rápida (5 instancias, salida detallada)
.\RelevamientoHealthScoreMant.ps1 -TestMode

# Modo mock (datos sintéticos, sin conexiones reales)
.\RelevamientoHealthScoreMant.ps1 -Mock

# Procesar solo N instancias específicas
.\RelevamientoHealthScoreMant.ps1 -TestLimit 10
```

### Consulta de Resultados

**Desde PowerShell:**
```powershell
# Ver resumen en consola
Import-Csv .\InstanceHealth.csv | Format-Table

# Solo críticos
Import-Csv .\InstanceHealth.csv | Where-Object HealthStatus -eq 'Critical'

# JSON con detalles
Get-Content .\InstanceHealth.json | ConvertFrom-Json | Select InstanceName, HealthScore, HealthStatus
```

**Desde SQL Server:**
```sql
-- Dashboard principal
SELECT * FROM dbo.vw_HealthScoreSummary
ORDER BY HealthScore ASC;

-- Instancias críticas
SELECT InstanceName, Ambiente, HealthScore, WorstVolumePct
FROM dbo.vw_HealthScoreSummary
WHERE HealthStatus = 'Critical';

-- Tendencias últimos 7 días
SELECT * FROM dbo.vw_HealthScoreTrend
WHERE InstanceName = 'SSPR17-01'
ORDER BY Fecha DESC;
```

---

## ⚙️ Automatización

### Task Scheduler (Ejecución Diaria)

```powershell
# Crear tarea programada para ejecutar diariamente a las 2 AM
$scriptPath = "C:\sql-guard-observatory\scripts\RelevamientoHealthScoreMant.ps1"
$arguments = "-Parallel -Throttle 10 -WriteToSql"

$action = New-ScheduledTaskAction `
    -Execute 'pwsh.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" $arguments"

$trigger = New-ScheduledTaskTrigger -Daily -At 2am

$principal = New-ScheduledTaskPrincipal `
    -UserId "DOMAIN\ServiceAccount" `
    -LogonType Password `
    -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
    -TaskName "SQL_HealthScore_Daily" `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Relevamiento diario de HealthScore para instancias SQL Server"
```

### Script de Automatización con Alertas

Guardar como `scripts/AutomatedHealthCheck.ps1`:

```powershell
# Configuración
$scriptPath = "C:\sql-guard-observatory\scripts\RelevamientoHealthScoreMant.ps1"
$logDir = "C:\Logs\HealthScore"
$reportDir = "C:\Reports\HealthScore"

# Crear directorios si no existen
foreach ($dir in @($logDir, $reportDir)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# Timestamp
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$date = Get-Date -Format "yyyyMMdd"

# Archivos
$logFile = Join-Path $logDir "HealthScore_$timestamp.log"
$jsonFile = Join-Path $reportDir "HealthScore_$date.json"
$csvFile = Join-Path $reportDir "HealthScore_$date.csv"

# Ejecutar
Write-Host "Iniciando relevamiento HealthScore..." -ForegroundColor Cyan
& $scriptPath -Parallel -Throttle 10 -WriteToSql -OutJson $jsonFile -OutCsv $csvFile *>&1 | Tee-Object -FilePath $logFile

# Analizar resultados
$results = Import-Csv $csvFile
$criticalCount = ($results | Where-Object { $_.HealthStatus -eq 'Critical' }).Count
$warningCount = ($results | Where-Object { $_.HealthStatus -eq 'Warning' }).Count
$avgScore = [int](($results | Measure-Object -Property HealthScore -Average).Average)

# Alerta por email si hay instancias críticas
if ($criticalCount -gt 0) {
    $critical = $results | Where-Object { $_.HealthStatus -eq 'Critical' } | 
                Select-Object InstanceName, Ambiente, HealthScore, WorstVolumeFreePct
    
    $htmlBody = @"
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; }
        h2 { color: #d32f2f; }
        table { border-collapse: collapse; width: 100%; }
        th { background-color: #f44336; color: white; padding: 10px; text-align: left; }
        td { border: 1px solid #ddd; padding: 8px; }
        tr:nth-child(even) { background-color: #f9f9f9; }
        .footer { margin-top: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <h2>⚠️ Alerta: Instancias SQL Server Críticas</h2>
    <p>Se detectaron <strong>$criticalCount</strong> instancias en estado crítico (HealthScore < 70).</p>
    
    <h3>Resumen General</h3>
    <ul>
        <li>Total instancias: $($results.Count)</li>
        <li>Score promedio: $avgScore</li>
        <li>Críticas: $criticalCount</li>
        <li>Advertencias: $warningCount</li>
    </ul>
    
    <h3>Instancias Críticas</h3>
    $($critical | ConvertTo-Html -Fragment)
    
    <div class="footer">
        <p>Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p>
        <p>Servidor: SSPR17MON-01 | Base de datos: SQLNova</p>
        <p>Consulta detallada: SELECT * FROM dbo.vw_HealthScoreSummary WHERE HealthStatus = 'Critical'</p>
    </div>
</body>
</html>
"@
    
    Send-MailMessage `
        -To "dba-team@empresa.com" `
        -From "sqlmonitoring@empresa.com" `
        -Subject "⚠️ ALERTA SQL: $criticalCount instancias críticas detectadas" `
        -Body $htmlBody `
        -BodyAsHtml `
        -SmtpServer "smtp.empresa.com" `
        -Port 587 `
        -UseSsl
    
    Write-Host "Alerta enviada por email." -ForegroundColor Yellow
}

Write-Host "Proceso completado. Log: $logFile" -ForegroundColor Green
```

---

## 📈 Métricas Recolectadas

### 1. Availability (30%)

**Query utilizada**:
```sql
SELECT @@SERVERNAME AS ServerName
```

**Medición**:
- Tiempo de respuesta en milisegundos
- Success: conexión establecida
- Latency: tiempo total de ejecución

**Scoring**:
- < 3 segundos: 100 puntos
- 3-5 segundos: degradación lineal
- > 5 segundos o fallo: 0 puntos

### 2. Errorlog (10%)

**Query utilizada**:
```sql
CREATE TABLE #ErrorLog (LogDate DATETIME, ProcessInfo NVARCHAR(50), [Text] NVARCHAR(MAX));
INSERT INTO #ErrorLog EXEC xp_readerrorlog 0, 1, N'Severity: 2', NULL, @TimeAgo;
SELECT COUNT(*) FROM #ErrorLog;
```

**Medición**:
- Errores con Severity >= 20 en últimas 24 horas
- Si no hay permisos: score neutral (no penaliza)

**Scoring**:
- 0 errores: 100 puntos
- 1-2 errores: 50 puntos
- 3+ errores: 0 puntos

### 3. Jobs & Backups (25%)

**Maintenance Jobs**:
```sql
SELECT j.name, MAX(jh.run_date) AS LastRunDate
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id
WHERE j.name LIKE '%DatabaseIntegrityCheck%' OR j.name LIKE '%IndexOptimize%'
GROUP BY j.name
```

**Backups**:
```sql
SELECT 
    d.name,
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS LastFull,
    MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) AS LastLog
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON d.name = b.database_name
GROUP BY d.name
```

**SLA**:
- CHECKDB: <= 7 días (40 pts)
- IndexOptimize: <= 7 días (30 pts)
- Backups sin breaches: (30 pts)
  - FULL: <= 25 horas
  - LOG: <= 2 horas (para FULL recovery)

**Nota**: Para AlwaysOn, los backups se consultan en todos los nodos del AG y se toma el más reciente.

### 4. Disks & Resources (20%)

**Espacio en disco**:
```sql
SELECT 
    vs.volume_mount_point,
    (vs.available_bytes * 100.0 / vs.total_bytes) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
```

**Memoria**:
```sql
SELECT counter_name, cntr_value
FROM sys.dm_os_performance_counters
WHERE counter_name = 'Page life expectancy'
```

**Scoring**:
- Volumen peor > 20% libre: 100 pts
- 15-20%: 80 pts
- 10-15%: 60 pts
- 5-10%: 30 pts
- < 5%: 0 pts
- Penalización: -20 pts si PLE < 300

### 5. AlwaysOn (15%)

**Verificación**:
```sql
SELECT SERVERPROPERTY('IsHadrEnabled') AS IsHadrEnabled
```

**Estado**:
```sql
SELECT 
    synchronization_state_desc,
    redo_queue_size,
    DATEDIFF(SECOND, last_commit_time, GETDATE()) AS SecondsBehind
FROM sys.dm_hadr_database_replica_states
WHERE is_local = 1
```

**Scoring**:
- No habilitado: 100 pts (neutral)
- Sincronizado: 100 pts
- Lag < 15 min: 60 pts
- Redo queue alto: 40 pts
- No sincronizado: 0 pts

---

## 🔍 Consultas Útiles

### Dashboard Principal

```sql
SELECT 
    InstanceName,
    Ambiente,
    HealthScore,
    HealthStatus,
    WorstVolumePct,
    ConnectLatencyMs,
    Clasificacion
FROM dbo.vw_HealthScoreSummary
ORDER BY HealthScore ASC;
```

### Instancias Críticas con Detalle

```sql
SELECT 
    InstanceName,
    HealthScore,
    BackupBreaches,
    WorstVolumePct AS [Disco%],
    CriticalErrors24h AS Errores,
    AlwaysOnState,
    UltimaActualizacion
FROM dbo.vw_HealthScoreSummary
WHERE HealthStatus = 'Critical'
ORDER BY HealthScore ASC;
```

### Tendencia de una Instancia

```sql
SELECT 
    Fecha,
    AvgScore,
    MinScore,
    MaxScore
FROM dbo.vw_HealthScoreTrend
WHERE InstanceName = 'SSPR17-01'
ORDER BY Fecha DESC;
```

---

## 🎓 Casos de Uso

### 1. Monitoreo Proactivo

**Objetivo**: Detectar problemas antes de que impacten producción.

**Implementación**:
- Ejecutar script diariamente a las 2 AM
- Enviar alertas si HealthScore < 70
- Revisar dashboard cada mañana

### 2. Análisis de Tendencias

**Objetivo**: Identificar instancias que degradan con el tiempo.

**Implementación**:
```sql
-- Instancias que empeoraron > 10 puntos en última semana
WITH Scores AS (
    SELECT 
        InstanceName,
        HealthScore,
        GeneratedAtUtc,
        LAG(HealthScore) OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc) AS ScorePrevio
    FROM dbo.InstanceHealthSnapshot
    WHERE GeneratedAtUtc > DATEADD(DAY, -7, GETUTCDATE())
)
SELECT 
    InstanceName,
    HealthScore AS Actual,
    ScorePrevio AS Anterior,
    (ScorePrevio - HealthScore) AS Deterioro
FROM Scores
WHERE (ScorePrevio - HealthScore) > 10
ORDER BY Deterioro DESC;
```

### 3. Reportes Ejecutivos

**Objetivo**: KPIs para management.

**Implementación**:
```sql
SELECT 
    COUNT(*) AS [Total Instancias],
    AVG(HealthScore) AS [Score Promedio],
    SUM(CASE WHEN HealthStatus = 'Healthy' THEN 1 ELSE 0 END) AS Healthy,
    SUM(CASE WHEN HealthStatus = 'Warning' THEN 1 ELSE 0 END) AS Warning,
    SUM(CASE WHEN HealthStatus = 'Critical' THEN 1 ELSE 0 END) AS Critical,
    CAST(SUM(CASE WHEN HealthStatus = 'Healthy' THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS [% Healthy]
FROM dbo.vw_HealthScoreSummary;
```

### 4. Priorización de Mantenimiento

**Objetivo**: Decidir qué instancias requieren atención urgente.

**Implementación**:
```sql
SELECT TOP 10
    InstanceName,
    Ambiente,
    HealthScore,
    CASE 
        WHEN ConnectSuccess = 0 THEN 'P0: No conecta'
        WHEN WorstVolumePct < 5 THEN 'P0: Disco crítico'
        WHEN WorstVolumePct < 10 THEN 'P1: Disco bajo'
        WHEN CheckdbOk = 0 THEN 'P2: CHECKDB vencido'
        ELSE 'P3: Otros'
    END AS Prioridad
FROM dbo.vw_HealthScoreSummary
WHERE HealthStatus IN ('Critical', 'Warning')
ORDER BY HealthScore ASC;
```

---

## 🛠️ Troubleshooting

### Problema: "Módulo SqlServer no encontrado"

**Solución**:
```powershell
Install-Module SqlServer -Scope CurrentUser -Force -AllowClobber
```

### Problema: Timeout en instancias lentas

**Solución**:
```powershell
# Aumentar timeout
.\RelevamientoHealthScoreMant.ps1 -TimeoutSec 30
```

### Problema: "Access denied" en xp_readerrorlog

**Respuesta**: Normal. El script maneja este caso y da score neutral (no penaliza).

**Verificar permisos** (opcional):
```sql
GRANT VIEW SERVER STATE TO [DOMAIN\MonitoringUser];
```

### Problema: Ejecución muy lenta

**Solución**:
```powershell
# Usar modo paralelo
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 12
```

### Problema: Instancias AWS no responden

**Causa**: Posible firewall o security groups.

**Diagnóstico**:
```powershell
# Probar conectividad
Test-NetConnection -ComputerName "aws-instance.rds.amazonaws.com" -Port 1433
```

---

## 📊 Métricas de Rendimiento

### Ejecución Secuencial
- **100 instancias**: ~10-15 minutos
- **500 instancias**: ~50-75 minutos
- **1000 instancias**: ~100-150 minutos

### Ejecución Paralela (8 threads)
- **100 instancias**: ~3-5 minutos
- **500 instancias**: ~15-25 minutos
- **1000 instancias**: ~30-50 minutos

### Ejecución Paralela (16 threads)
- **100 instancias**: ~2-3 minutos
- **500 instancias**: ~10-15 minutos
- **1000 instancias**: ~20-30 minutos

**Recomendación**: Usar `-Throttle` entre 8-16 según recursos disponibles.

---

## 🔒 Seguridad

### Credenciales

- **Default**: Windows Authentication (cuenta del usuario/servicio)
- **Opcional**: SQL Authentication con `-SqlCredential`

```powershell
$cred = Get-Credential -Message "Credenciales SQL"
.\RelevamientoHealthScoreMant.ps1 -SqlCredential $cred
```

### Permisos Requeridos

**En instancias monitoreadas**:
- `CONNECT SQL`
- `VIEW SERVER STATE` (recomendado para métricas completas)
- `VIEW DATABASE STATE` (para información de archivos)
- Acceso a `msdb` (para jobs y backups)

**En servidor central (SSPR17MON-01)**:
- `db_datareader` y `db_datawriter` en SQLNova
- `CREATE TABLE` (solo primera vez, para crear InstanceHealthSnapshot)

---

## 📝 Mantenimiento

### Limpieza de Datos Antiguos

**Estrategia recomendada**: Retener 90 días de histórico.

```sql
-- Eliminar snapshots > 90 días
DELETE FROM dbo.InstanceHealthSnapshot
WHERE GeneratedAtUtc < DATEADD(DAY, -90, GETUTCDATE());

PRINT CONCAT(@@ROWCOUNT, ' registros eliminados');
```

**Automatizar con SQL Agent Job**:
```sql
USE msdb;
GO

EXEC dbo.sp_add_job
    @job_name = 'HealthScore_Cleanup',
    @enabled = 1,
    @description = 'Limpieza de snapshots antiguos de HealthScore';

EXEC dbo.sp_add_jobstep
    @job_name = 'HealthScore_Cleanup',
    @step_name = 'Delete old records',
    @subsystem = 'TSQL',
    @database_name = 'SQLNova',
    @command = 'DELETE FROM dbo.InstanceHealthSnapshot WHERE GeneratedAtUtc < DATEADD(DAY, -90, GETUTCDATE());';

EXEC dbo.sp_add_schedule
    @schedule_name = 'Weekly_Sunday_3AM',
    @freq_type = 8, -- Weekly
    @freq_interval = 1, -- Sunday
    @active_start_time = 030000; -- 3:00 AM

EXEC dbo.sp_attach_schedule
    @job_name = 'HealthScore_Cleanup',
    @schedule_name = 'Weekly_Sunday_3AM';

EXEC dbo.sp_add_jobserver
    @job_name = 'HealthScore_Cleanup',
    @server_name = '(local)';
GO
```

### Actualización del Script

1. Hacer backup del script actual
2. Descargar nueva versión
3. Probar con `-Mock` y `-TestLimit 5`
4. Validar salida JSON/CSV
5. Desplegar en producción

---

## 🎉 Conclusión

El sistema de HealthScore proporciona una **visión unificada y cuantificada** del estado de salud de todas las instancias SQL Server, permitiendo:

- ✅ **Detección proactiva** de problemas
- ✅ **Priorización** de tareas de mantenimiento
- ✅ **Análisis de tendencias** temporales
- ✅ **Reportes ejecutivos** con métricas claras
- ✅ **Automatización** completa del monitoreo

---

## 📞 Soporte

Para consultas, problemas o mejoras:

1. Revisar `README_HEALTHSCORE.md` para documentación detallada
2. Revisar troubleshooting en esta guía
3. Ejecutar con `-Mock` para descartar problemas del script
4. Contactar al equipo DBA

---

**Versión**: 1.0  
**Última actualización**: Octubre 2024  
**Equipo**: SQL Guard Observatory  
**Repositorio**: `sql-guard-observatory`

