# Guía de Scripts Separados - Health Score

## 📋 **Resumen de la Separación**

El script monolítico `RelevamientoHealthScoreMant.ps1` (1419 líneas) ha sido dividido en **4 scripts especializados**, cada uno guardando en tablas SQL diferentes.

---

## 🗂️ **Estructura de Scripts y Tablas**

```
┌─────────────────────────────────────────────────────────┐
│                   SCRIPTS ESPECIALIZADOS                 │
└─────────────────────────────────────────────────────────┘

1️⃣ RelevamientoHealthScore_Critical.ps1 (cada 5 min)
   ├─ Test-SqlConnection (conectividad y latencia)
   ├─ Get-DiskStatus (espacio en discos)
   ├─ Get-AlwaysOnStatus (sincronización AG)
   └─ Guarda en: InstanceHealth_Critical
   
2️⃣ RelevamientoHealthScore_Backups.ps1 (cada 30 min)
   ├─ Get-BackupStatus (FULL, DIFF, LOG)
   ├─ Calcula breaches (FULL > 25h, LOG > 2h)
   └─ Guarda en: InstanceHealth_Backups
   
3️⃣ RelevamientoHealthScore_Maintenance.ps1 (cada 4 horas)
   ├─ Get-MaintenanceJobs (IntegrityCheck, IndexOptimize)
   ├─ Get-ErrorlogStatus (severity 20+ en 24h)
   └─ Guarda en: InstanceHealth_Maintenance
   
4️⃣ RelevamientoHealthScore_Consolidate.ps1 (cada 15 min)
   ├─ Lee las 3 tablas anteriores
   ├─ Get-AlwaysOnGroups (identifica nodos AG)
   ├─ Sync-AlwaysOnData (sincroniza valores entre nodos) 🔴 CRÍTICO
   ├─ Calculate-HealthScore (calcula score 0-100)
   └─ Guarda en: InstanceHealth_Score
```

---

## 📊 **Tablas SQL Creadas**

### **Tabla 1: InstanceHealth_Critical**
```sql
Frecuencia de inserción: Cada 5 minutos
Retención: 7 días (alto volumen)

Columnas:
- InstanceName, Ambiente, HostingSite, Version
- ConnectSuccess, ConnectLatencyMs
- DiskWorstFreePct, DiskVolumesJson
- AlwaysOnEnabled, AlwaysOnWorstState, AlwaysOnIssuesJson
- CollectedAtUtc, ErrorMessage
```

### **Tabla 2: InstanceHealth_Backups**
```sql
Frecuencia de inserción: Cada 30 minutos
Retención: 30 días

Columnas:
- InstanceName, Ambiente, HostingSite
- LastFullBackup, LastDiffBackup, LastLogBackup
- FullBackupBreached, DiffBackupBreached, LogBackupBreached
- BreachDetails, CollectedAtUtc, ErrorMessage
```

### **Tabla 3: InstanceHealth_Maintenance**
```sql
Frecuencia de inserción: Cada 4 horas
Retención: 30 días

Columnas:
- InstanceName, Ambiente, HostingSite
- LastCheckdb, CheckdbOk, CheckdbJobsJson
- LastIndexOptimize, IndexOptimizeOk, IndexOptimizeJobsJson
- Severity20PlusCount, ErrorlogSkipped
- CollectedAtUtc, ErrorMessage
```

### **Tabla 4: InstanceHealth_Score**
```sql
Frecuencia de inserción: Cada 15 minutos (tras consolidación)
Retención: 30 días

Columnas:
- InstanceName, Ambiente, HostingSite, Version
- HealthScore, HealthStatus
- AvailabilityScore, BackupScore, DiskScore, AlwaysOnScore, ErrorlogScore
- CollectedAtUtc
```

---

## 🚀 **Implementación Paso a Paso**

### **Paso 1: Crear el Schema de Base de Datos**

```powershell
# Ejecutar en SQL Server (SSPR17MON-01\SQLNova)
Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" `
    -Database "SQLNova" `
    -InputFile ".\scripts\SQL\CreateHealthScoreTables.sql" `
    -Verbose
```

**Resultado esperado:**
```
Tabla InstanceHealth_Critical creada
Tabla InstanceHealth_Backups creada
Tabla InstanceHealth_Maintenance creada
Tabla InstanceHealth_Score creada
Schema de Health Score creado exitosamente
```

**Verificar tablas:**
```sql
USE SQLNova;
GO

SELECT 
    name AS TableName,
    create_date AS CreatedDate
FROM sys.tables
WHERE name LIKE 'InstanceHealth_%'
ORDER BY name;
```

---

### **Paso 2: Configurar Variables en los Scripts**

En **cada uno de los 4 scripts**, ajustar la configuración al inicio:

```powershell
#region ===== CONFIGURACIÓN =====

$TestMode = $false         # 🔴 CAMBIAR A $false en producción
$IncludeAWS = $true        # $true = incluir AWS
$OnlyAWS = $false          # $false = incluir On-premise también

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 10

#endregion
```

**⚠️ IMPORTANTE:** Dejar `$TestMode = $true` solo para las primeras pruebas (procesa solo 5 instancias).

---

### **Paso 3: Probar Cada Script Manualmente**

#### **Test 1: Script Critical (5 min)**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

.\RelevamientoHealthScore_Critical.ps1 -Verbose
```

**Verificar en SQL:**
```sql
SELECT TOP 10 
    InstanceName,
    ConnectSuccess,
    ConnectLatencyMs,
    DiskWorstFreePct,
    AlwaysOnWorstState,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Critical
ORDER BY CollectedAtUtc DESC;
```

#### **Test 2: Script Backups (30 min)**
```powershell
.\RelevamientoHealthScore_Backups.ps1 -Verbose
```

**Verificar en SQL:**
```sql
SELECT TOP 10 
    InstanceName,
    LastFullBackup,
    LastLogBackup,
    FullBackupBreached,
    LogBackupBreached,
    BreachDetails,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Backups
ORDER BY CollectedAtUtc DESC;
```

#### **Test 3: Script Maintenance (4 horas)**
```powershell
.\RelevamientoHealthScore_Maintenance.ps1 -Verbose
```

**Verificar en SQL:**
```sql
SELECT TOP 10 
    InstanceName,
    CheckdbOk,
    IndexOptimizeOk,
    Severity20PlusCount,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Maintenance
ORDER BY CollectedAtUtc DESC;
```

#### **Test 4: Script Consolidador (15 min)**
```powershell
.\RelevamientoHealthScore_Consolidate.ps1 -Verbose
```

**Verificar en SQL:**
```sql
SELECT TOP 10 
    InstanceName,
    HealthScore,
    HealthStatus,
    AvailabilityScore,
    BackupScore,
    DiskScore,
    AlwaysOnScore,
    ErrorlogScore,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Score
ORDER BY HealthScore ASC;
```

**Verificar vista consolidada:**
```sql
SELECT TOP 10 * 
FROM SQLNova.dbo.vw_InstanceHealth_Latest
ORDER BY HealthScore ASC;
```

---

### **Paso 4: Configurar Scheduled Tasks**

```powershell
# Ejecutar como Administrador
.\scripts\Schedule-HealthScore.ps1 `
    -ScriptPath "C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts" `
    -ServiceAccount "DOMAIN\svc_sqlmonitor"
```

**Esto creará 4 tareas:**
- `SQLGuard_HealthScore_Critical` → Cada 5 minutos
- `SQLGuard_HealthScore_Backups` → Cada 30 minutos
- `SQLGuard_HealthScore_Maintenance` → Cada 4 horas
- `SQLGuard_HealthScore_Consolidate` → Cada 15 minutos

**Verificar tareas creadas:**
```powershell
Get-ScheduledTask -TaskName 'SQLGuard_HealthScore_*' | 
    Select-Object TaskName, State, @{N='NextRun';E={(Get-ScheduledTaskInfo $_).NextRunTime}}
```

**Ejecutar manualmente una tarea:**
```powershell
Start-ScheduledTask -TaskName 'SQLGuard_HealthScore_Critical'
```

**Ver historial de ejecución:**
```powershell
Get-ScheduledTaskInfo -TaskName 'SQLGuard_HealthScore_Critical' | 
    Select-Object LastRunTime, LastTaskResult, NextRunTime
```

---

### **Paso 5: Configurar Limpieza Automática**

Crear un SQL Agent Job para ejecutar el cleanup diariamente:

```sql
USE msdb;
GO

-- Crear job
EXEC sp_add_job 
    @job_name = N'SQLGuard - Cleanup Health History',
    @enabled = 1,
    @description = N'Limpia datos antiguos de tablas de Health Score';

-- Agregar paso
EXEC sp_add_jobstep 
    @job_name = N'SQLGuard - Cleanup Health History',
    @step_name = N'Run Cleanup Procedure',
    @subsystem = N'TSQL',
    @command = N'EXEC SQLNova.dbo.usp_CleanupHealthHistory @RetentionDays = 30',
    @database_name = N'SQLNova',
    @retry_attempts = 3,
    @retry_interval = 5;

-- Agregar schedule (diario a las 2 AM)
EXEC sp_add_schedule 
    @schedule_name = N'Daily at 2 AM',
    @freq_type = 4,  -- Daily
    @freq_interval = 1,
    @active_start_time = 020000;

-- Asociar schedule al job
EXEC sp_attach_schedule 
    @job_name = N'SQLGuard - Cleanup Health History',
    @schedule_name = N'Daily at 2 AM';

-- Agregar al servidor local
EXEC sp_add_jobserver 
    @job_name = N'SQLGuard - Cleanup Health History',
    @server_name = N'(local)';
```

---

## 🔍 **Queries de Monitoreo**

### **Dashboard de Estado**
```sql
-- Última recolección por tabla
SELECT 
    'Critical' AS Tabla,
    COUNT(*) AS TotalRegistros,
    MAX(CollectedAtUtc) AS UltimaRecoleccion,
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()) AS MinutosAtras,
    COUNT(DISTINCT InstanceName) AS InstanciasUnicas
FROM SQLNova.dbo.InstanceHealth_Critical
WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())

UNION ALL

SELECT 
    'Backups',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()),
    COUNT(DISTINCT InstanceName)
FROM SQLNova.dbo.InstanceHealth_Backups
WHERE CollectedAtUtc >= DATEADD(HOUR, -2, GETUTCDATE())

UNION ALL

SELECT 
    'Maintenance',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()),
    COUNT(DISTINCT InstanceName)
FROM SQLNova.dbo.InstanceHealth_Maintenance
WHERE CollectedAtUtc >= DATEADD(HOUR, -6, GETUTCDATE())

UNION ALL

SELECT 
    'Score',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()),
    COUNT(DISTINCT InstanceName)
FROM SQLNova.dbo.InstanceHealth_Score
WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE());
```

### **Instancias con Problemas**
```sql
-- Top 10 instancias con peor Health Score
SELECT TOP 10
    InstanceName,
    HealthScore,
    HealthStatus,
    AvailabilityScore,
    BackupScore,
    DiskScore,
    AlwaysOnScore,
    ErrorlogScore,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Score
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
ORDER BY HealthScore ASC, InstanceName;
```

### **Instancias sin Datos Recientes**
```sql
-- Instancias que no han reportado en últimos 15 minutos
WITH AllInstances AS (
    SELECT DISTINCT InstanceName
    FROM (
        SELECT InstanceName FROM SQLNova.dbo.InstanceHealth_Critical
        UNION
        SELECT InstanceName FROM SQLNova.dbo.InstanceHealth_Backups
        UNION
        SELECT InstanceName FROM SQLNova.dbo.InstanceHealth_Maintenance
    ) t
),
RecentReports AS (
    SELECT DISTINCT InstanceName
    FROM SQLNova.dbo.InstanceHealth_Critical
    WHERE CollectedAtUtc >= DATEADD(MINUTE, -15, GETUTCDATE())
)
SELECT 
    a.InstanceName,
    'Sin reporte reciente' AS Issue
FROM AllInstances a
LEFT JOIN RecentReports r ON a.InstanceName = r.InstanceName
WHERE r.InstanceName IS NULL;
```

---

## 🎯 **Ventajas de la Separación**

### **✅ Performance**
- Script Critical toma 2-3 min (vs 10-15 min monolítico)
- Datos críticos se actualizan cada 5 min (vs 15 min)
- Queries más rápidas (tablas especializadas)

### **✅ Resiliencia**
- Si Maintenance falla → Critical y Backups siguen funcionando
- Errores aislados por tipo de métrica
- Fácil reintentar scripts individuales

### **✅ Eficiencia**
- IntegrityCheck (1x/día) se consulta cada 4h (vs cada 15 min)
- Discos (cambian rápido) se consultan cada 5 min (vs cada 15 min)
- Menos carga en instancias SQL

### **✅ Escalabilidad**
- Fácil agregar nuevas métricas sin afectar existentes
- Retención diferenciada por tipo de dato
- Paralelizable en el futuro (múltiples workers)

---

## 🛠️ **Troubleshooting**

### **Problema: Script falla con "No se pudo conectar"**
```powershell
# Verificar conectividad SQL desde PowerShell
Test-NetConnection -ComputerName "SSPR17MON-01" -Port 1433

# Verificar módulo SqlServer
Import-Module SqlServer -Force
Get-Module SqlServer
```

### **Problema: Scheduled Task no se ejecuta**
```powershell
# Ver logs de Task Scheduler
Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 20 |
    Where-Object {$_.Message -like '*SQLGuard*'} |
    Select-Object TimeCreated, Message
```

### **Problema: Datos no se sincronizan en AlwaysOn**
```sql
-- Verificar que el script consolidador identificó los grupos AG
SELECT * FROM SQLNova.dbo.InstanceHealth_Score
WHERE AlwaysOnEnabled = 1
ORDER BY InstanceName;

-- Verificar que los valores se sincronizaron
SELECT 
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastFullBackup
FROM SQLNova.dbo.vw_InstanceHealth_Latest
WHERE AlwaysOnEnabled = 1
ORDER BY InstanceName;
```

---

## 📊 **Comparación: Antes vs Después**

| Aspecto | ANTES (Monolítico) | DESPUÉS (Separado) |
|---------|-------------------|-------------------|
| **Tiempo de ejecución** | 10-15 min | 2-3 min (Critical) |
| **Frecuencia de datos críticos** | 15 min | 5 min |
| **Resiliencia** | Todo o nada | Fallos aislados |
| **Consultas lentas (Errorlog)** | Cada 15 min | Cada 4 horas |
| **Tamaño de script** | 1419 líneas | 300-600 líneas c/u |
| **Mantenibilidad** | Difícil | Fácil (scripts enfocados) |
| **Lógica AlwaysOn** | Integrada | Consolidador (mantiene lógica) |

---

## 📝 **Notas Importantes**

### **🔴 Script Consolidador es CRÍTICO**
El script `RelevamientoHealthScore_Consolidate.ps1` contiene **toda la lógica de sincronización AlwaysOn** del script original (líneas 976-1214). **NO modificar** esta lógica sin entenderla completamente.

### **⚙️ TestMode**
- Dejar `$TestMode = $true` para pruebas iniciales (solo 5 instancias)
- Cambiar a `$TestMode = $false` en producción

### **📁 Archivos JSON**
Cada script genera un JSON de respaldo:
- `InstanceHealth_Critical_20251023_143000.json`
- `InstanceHealth_Backups_20251023_143000.json`
- `InstanceHealth_Maintenance_20251023_143000.json`
- `InstanceHealth_Score_20251023_143000.json`

Útiles para debugging, pero no requeridos para operación normal.

---

## ✅ **Checklist de Implementación**

- [ ] Ejecutar `CreateHealthScoreTables.sql` en SQLNova
- [ ] Verificar que se crearon las 4 tablas
- [ ] Ajustar `$TestMode = $true` en los 4 scripts
- [ ] Ejecutar manualmente cada script y verificar en SQL
- [ ] Verificar que el consolidador sincroniza AlwaysOn correctamente
- [ ] Cambiar `$TestMode = $false` en todos los scripts
- [ ] Ejecutar `Schedule-HealthScore.ps1` como Administrador
- [ ] Verificar que las 4 tareas se crearon
- [ ] Esperar 1 hora y verificar que los datos se están insertando
- [ ] Crear SQL Agent Job para cleanup diario
- [ ] Documentar en wiki interna

---

**Versión:** 1.0  
**Fecha:** 2025-10-23  
**Autor:** SQL Guard Observatory Team

