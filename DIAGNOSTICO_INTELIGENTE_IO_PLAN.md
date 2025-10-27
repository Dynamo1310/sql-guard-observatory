# 🧠 Plan: Sistema de Diagnóstico Inteligente de I/O

## 🎯 Objetivo

Crear un sistema que **identifique la causa raíz** de problemas de I/O, no solo el síntoma (latencia alta).

---

## 📊 Fase 1: Recolectar Métricas Avanzadas

### **1.1 Tipo de Disco (HDD/SSD/NVMe)**

**Actualizar:** `RelevamientoHealthScore_Discos.ps1`

```powershell
function Get-DiskMediaType {
    param([string]$InstanceName, [string]$MountPoint)
    
    try {
        # Intentar obtener info del disco físico
        $serverName = $InstanceName.Split('\')[0]
        
        $diskInfo = Invoke-Command -ComputerName $serverName -ScriptBlock {
            param($mount)
            
            # Limpiar mount point (C:\ -> C:)
            $driveLetter = $mount.TrimEnd('\').TrimEnd(':')
            
            # Obtener disco físico
            $partition = Get-Partition | Where-Object { $_.DriveLetter -eq $driveLetter } | Select-Object -First 1
            if ($partition) {
                $disk = Get-Disk -Number $partition.DiskNumber
                return @{
                    MediaType = $disk.MediaType  # HDD, SSD, Unspecified
                    BusType = $disk.BusType      # SATA, SAS, NVMe, etc.
                    HealthStatus = $disk.HealthStatus
                    OperationalStatus = $disk.OperationalStatus
                }
            }
            return $null
        } -ArgumentList $MountPoint -ErrorAction SilentlyContinue
        
        return $diskInfo
        
    } catch {
        # Si falla, intentar inferir por latencia
        return @{
            MediaType = "Unknown"
            BusType = "Unknown"
            HealthStatus = "Unknown"
            OperationalStatus = "Unknown"
        }
    }
}
```

**Almacenar en:** `InstanceHealth_Discos`
- `MediaType` (VARCHAR(20)): HDD, SSD, Unspecified, Unknown
- `BusType` (VARCHAR(20)): SATA, SAS, NVMe, iSCSI, etc.
- `HealthStatus` (VARCHAR(20)): Healthy, Warning, Unhealthy
- `OperationalStatus` (VARCHAR(20)): Online, Offline, Degraded

---

### **1.2 Métricas de Carga de I/O**

**Actualizar:** `RelevamientoHealthScore_IO.ps1`

```sql
-- Agregar a la query existente:
SELECT 
    -- Métricas existentes...
    
    -- NUEVAS MÉTRICAS:
    
    -- Queue Depth (indicador de sobrecarga)
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Disk Queue Length'
     AND instance_name = '_Total') AS DiskQueueLength,
    
    -- IOPS actuales (snapshot, no acumulativo)
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Batch Requests/sec') AS BatchRequestsPerSec,
    
    -- Throughput actual
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Page reads/sec') AS PageReadsPerSec,
    
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Page writes/sec') AS PageWritesPerSec,
    
    -- Lazy writes (indicador de memoria presionada = más I/O)
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Lazy writes/sec') AS LazyWritesPerSec,
    
    -- Checkpoint pages/sec (carga de escritura)
    (SELECT CAST(cntr_value AS BIGINT)
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Checkpoint pages/sec') AS CheckpointPagesPerSec
```

**Almacenar en:** `InstanceHealth_IO`
- `DiskQueueLength` (INT)
- `PageReadsPerSec` (INT)
- `PageWritesPerSec` (INT)
- `LazyWritesPerSec` (INT)
- `CheckpointPagesPerSec` (INT)

---

### **1.3 Análisis de Competencia por Disco**

**Actualizar:** `RelevamientoHealthScore_Discos.ps1`

```sql
-- Análisis de competencia por volumen
SELECT 
    vs.volume_mount_point AS MountPoint,
    COUNT(DISTINCT mf.database_id) AS DatabaseCount,
    COUNT(mf.file_id) AS FileCount,
    SUM(mf.size * 8.0 / 1024) AS TotalSizeMB,
    STRING_AGG(DB_NAME(mf.database_id), ', ') AS DatabaseList
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
WHERE mf.type = 0  -- Solo archivos de datos
GROUP BY vs.volume_mount_point
```

**Almacenar en JSON:** `InstanceHealth_Discos.VolumesJson`
```json
{
  "MountPoint": "E:",
  "DatabaseCount": 15,
  "FileCount": 23,
  "Databases": ["DB1", "DB2", "TempDB", ...]
}
```

---

## 🧠 Fase 2: Lógica de Diagnóstico en Consolidador

**Actualizar:** `RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`

### **2.1 Función de Diagnóstico**

```powershell
function Get-IODiagnosisForTempDB {
    param(
        [decimal]$WriteLatencyMs,
        [decimal]$ReadLatencyMs,
        [string]$MediaType,          # HDD, SSD, NVMe
        [string]$HealthStatus,        # Healthy, Warning, Unhealthy
        [int]$DiskQueueLength,
        [int]$DatabaseCount,          # Cuántas DBs en el mismo disco
        [int]$FileCount,              # Cuántos archivos en el mismo disco
        [decimal]$PageWritesPerSec,
        [decimal]$LazyWritesPerSec
    )
    
    $diagnosis = @{
        Problem = $null
        Severity = "OK"
        Suggestion = $null
        Icon = "✅"
    }
    
    # --- CASO 1: Disco no saludable ---
    if ($HealthStatus -in @("Warning", "Unhealthy", "Degraded")) {
        $diagnosis.Problem = "Hardware degradado o fallando"
        $diagnosis.Severity = "CRITICAL"
        $diagnosis.Suggestion = "🚨 El disco físico reporta problemas de hardware. Revisar SMART, RAID, o reemplazar disco urgentemente"
        $diagnosis.Icon = "🚨"
        return $diagnosis
    }
    
    # --- CASO 2: HDD con latencia alta ---
    if ($MediaType -eq "HDD") {
        if ($WriteLatencyMs -gt 50) {
            $diagnosis.Problem = "Disco HDD mecánico (lento por naturaleza)"
            $diagnosis.Severity = "HIGH"
            $diagnosis.Suggestion = "🐌 TempDB en disco HDD ($([int]$WriteLatencyMs)ms escritura). Migrar a SSD/NVMe urgentemente"
            $diagnosis.Icon = "🐌"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -gt 20) {
            $diagnosis.Problem = "Disco HDD (considerar actualizar)"
            $diagnosis.Severity = "MEDIUM"
            $diagnosis.Suggestion = "⚠️ TempDB en HDD. Migrar a SSD para mejor rendimiento (latencia actual: $([int]$WriteLatencyMs)ms)"
            $diagnosis.Icon = "⚠️"
            return $diagnosis
        }
    }
    
    # --- CASO 3: SSD con latencia alta (problema real) ---
    if ($MediaType -in @("SSD", "NVMe")) {
        
        # CRÍTICO: SSD con >100ms
        if ($WriteLatencyMs -gt 100) {
            # Diagnosticar causa específica
            if ($DiskQueueLength -gt 10) {
                $diagnosis.Problem = "Sobrecarga de IOPS (Queue: $DiskQueueLength)"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "🚨 SSD sobrecargado con $([int]$WriteLatencyMs)ms escritura (Queue: $DiskQueueLength). Reducir carga, separar archivos a otro disco, o agregar IOPS"
                $diagnosis.Icon = "🚨"
            }
            elseif ($DatabaseCount -gt 10 -or $FileCount -gt 20) {
                $diagnosis.Problem = "Storage compartido con muchas DBs ($DatabaseCount DBs, $FileCount archivos)"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "🚨 SSD con $([int]$WriteLatencyMs)ms (compartido con $DatabaseCount DBs). Mover TempDB a disco dedicado o reducir competencia"
                $diagnosis.Icon = "🚨"
            }
            elseif ($HealthStatus -eq "Online" -and $WriteLatencyMs -gt 100) {
                $diagnosis.Problem = "Posible problema de hardware, RAID, o storage backend"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "🚨 SSD con latencia anormal ($([int]$WriteLatencyMs)ms). Revisar: RAID cache, BBU, cableado, storage backend, o firmware"
                $diagnosis.Icon = "🚨"
            }
            return $diagnosis
        }
        
        # ADVERTENCIA: SSD con 50-100ms
        if ($WriteLatencyMs -gt 50) {
            if ($DiskQueueLength -gt 5) {
                $diagnosis.Problem = "Carga moderada de IOPS (Queue: $DiskQueueLength)"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "⚠️ SSD con carga moderada ($([int]$WriteLatencyMs)ms, Queue: $DiskQueueLength). Revisar queries costosos o considerar más IOPS"
                $diagnosis.Icon = "⚠️"
            }
            elseif ($LazyWritesPerSec -gt 100) {
                $diagnosis.Problem = "Presión de memoria generando lazy writes ($LazyWritesPerSec/s)"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "⚠️ Alta escritura por presión de memoria ($([int]$WriteLatencyMs)ms). Revisar Page Life Expectancy y considerar más RAM"
                $diagnosis.Icon = "⚠️"
            }
            else {
                $diagnosis.Problem = "Storage compartido o IOPS limitados"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "⚠️ SSD más lento de lo esperado ($([int]$WriteLatencyMs)ms). Revisar: storage compartido, IOPS provisionados, o competencia de VMs"
                $diagnosis.Icon = "⚠️"
            }
            return $diagnosis
        }
        
        # MONITOREO: SSD con 10-50ms
        if ($WriteLatencyMs -gt 10) {
            $diagnosis.Problem = "Rendimiento por debajo del ideal"
            $diagnosis.Severity = "LOW"
            $diagnosis.Suggestion = "📊 SSD con rendimiento aceptable pero mejorable ($([int]$WriteLatencyMs)ms). Monitorear tendencia"
            $diagnosis.Icon = "📊"
            return $diagnosis
        }
    }
    
    # --- CASO 4: Tipo desconocido (inferir por latencia) ---
    if ($MediaType -in @("Unspecified", "Unknown")) {
        if ($WriteLatencyMs -gt 100) {
            $diagnosis.Problem = "Latencia muy alta (tipo de disco desconocido)"
            $diagnosis.Severity = "CRITICAL"
            $diagnosis.Suggestion = "🚨 TempDB muy lento ($([int]$WriteLatencyMs)ms). Verificar tipo de disco y migrar a SSD si es HDD"
            $diagnosis.Icon = "🚨"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -gt 50) {
            $diagnosis.Problem = "Latencia alta (posible HDD)"
            $diagnosis.Severity = "MEDIUM"
            $diagnosis.Suggestion = "⚠️ TempDB lento ($([int]$WriteLatencyMs)ms). Verificar tipo de disco y considerar SSD"
            $diagnosis.Icon = "⚠️"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -lt 10) {
            # Inferir que es SSD
            $diagnosis.Problem = $null
            $diagnosis.Severity = "OK"
            $diagnosis.Suggestion = $null
            $diagnosis.Icon = "✅"
            return $diagnosis
        }
    }
    
    # --- CASO 5: Todo OK ---
    $diagnosis.Problem = $null
    $diagnosis.Severity = "OK"
    $diagnosis.Suggestion = $null
    $diagnosis.Icon = "✅"
    return $diagnosis
}
```

### **2.2 Integración en el Consolidador**

```powershell
# En Calculate-ConfiguracionTempdbScore
$ioDiagnosis = Get-IODiagnosisForTempDB `
    -WriteLatencyMs $data.TempDBAvgWriteLatencyMs `
    -ReadLatencyMs $data.TempDBAvgReadLatencyMs `
    -MediaType $data.TempDBDiskMediaType `
    -HealthStatus $data.TempDBDiskHealthStatus `
    -DiskQueueLength $data.DiskQueueLength `
    -DatabaseCount $data.TempDBDiskDatabaseCount `
    -FileCount $data.TempDBDiskFileCount `
    -PageWritesPerSec $data.PageWritesPerSec `
    -LazyWritesPerSec $data.LazyWritesPerSec

# Agregar al resultado
$result.TempDBIODiagnosis = $ioDiagnosis.Problem
$result.TempDBIOSuggestion = $ioDiagnosis.Suggestion
$result.TempDBIOSeverity = $ioDiagnosis.Severity
```

---

## 📊 Fase 3: Actualizar Modelos de Datos

### **3.1 Migración SQL**

```sql
-- Agregar a InstanceHealth_Discos
ALTER TABLE dbo.InstanceHealth_Discos ADD MediaType VARCHAR(20) NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD BusType VARCHAR(20) NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD HealthStatus VARCHAR(20) NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD OperationalStatus VARCHAR(20) NULL;

-- Agregar a InstanceHealth_IO
ALTER TABLE dbo.InstanceHealth_IO ADD DiskQueueLength INT NULL;
ALTER TABLE dbo.InstanceHealth_IO ADD PageReadsPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_IO ADD PageWritesPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_IO ADD LazyWritesPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_IO ADD CheckpointPagesPerSec INT NULL;

-- Agregar diagnóstico a InstanceHealth_Score
ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIODiagnosis NVARCHAR(200) NULL;
ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIOSuggestion NVARCHAR(500) NULL;
ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIOSeverity VARCHAR(20) NULL;
```

### **3.2 Actualizar Backend (C#)**

```csharp
// InstanceHealthDiscos.cs
public string? MediaType { get; set; }
public string? BusType { get; set; }
public string? HealthStatus { get; set; }
public string? OperationalStatus { get; set; }

// InstanceHealthIO.cs
public int? DiskQueueLength { get; set; }
public int? PageReadsPerSec { get; set; }
public int? PageWritesPerSec { get; set; }
public int? LazyWritesPerSec { get; set; }
public int? CheckpointPagesPerSec { get; set; }

// InstanceHealthScore.cs
public string? TempDBIODiagnosis { get; set; }
public string? TempDBIOSuggestion { get; set; }
public string? TempDBIOSeverity { get; set; }
```

---

## 🎨 Fase 4: Actualizar Frontend

### **4.1 Mostrar Diagnóstico Inteligente**

```tsx
// En HealthScore.tsx - Sección TempDB
{detail.configuracionTempdbDetails && (
  <>
    {/* Diagnóstico Inteligente */}
    {detail.tempDBIOSuggestion && (
      <div className={`p-2 rounded text-xs ${
        detail.tempDBIOSeverity === 'CRITICAL' ? 'bg-red-500/10 text-red-300' :
        detail.tempDBIOSeverity === 'HIGH' ? 'bg-orange-500/10 text-orange-300' :
        detail.tempDBIOSeverity === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-300' :
        'bg-blue-500/10 text-blue-300'
      }`}>
        <div className="font-medium mb-1">
          🧠 Diagnóstico: {detail.tempDBIODiagnosis}
        </div>
        <div>{detail.tempDBIOSuggestion}</div>
      </div>
    )}
    
    {/* Tipo de Disco */}
    {detail.configuracionTempdbDetails.tempDBDiskMediaType && (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">Tipo disco</span>
        <span className={`font-medium ${
          detail.configuracionTempdbDetails.tempDBDiskMediaType === 'NVMe' ? 'text-green-400' :
          detail.configuracionTempdbDetails.tempDBDiskMediaType === 'SSD' ? 'text-blue-400' :
          detail.configuracionTempdbDetails.tempDBDiskMediaType === 'HDD' ? 'text-orange-400' :
          'text-gray-400'
        }`}>
          {detail.configuracionTempdbDetails.tempDBDiskMediaType}
          {detail.configuracionTempdbDetails.tempDBDiskBusType && 
            ` (${detail.configuracionTempdbDetails.tempDBDiskBusType})`
          }
        </span>
      </div>
    )}
    
    {/* Estado de Salud del Disco */}
    {detail.configuracionTempdbDetails.tempDBDiskHealthStatus && 
     detail.configuracionTempdbDetails.tempDBDiskHealthStatus !== 'Healthy' && (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">Estado disco</span>
        <Badge variant={
          detail.configuracionTempdbDetails.tempDBDiskHealthStatus === 'Unhealthy' ? 'destructive' :
          'warning'
        }>
          {detail.configuracionTempdbDetails.tempDBDiskHealthStatus}
        </Badge>
      </div>
    )}
    
    {/* Carga de I/O */}
    {detail.ioDetails?.diskQueueLength > 0 && (
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-400">Queue Length</span>
        <span className={`font-medium ${
          detail.ioDetails.diskQueueLength > 10 ? 'text-red-400' :
          detail.ioDetails.diskQueueLength > 5 ? 'text-yellow-400' :
          'text-gray-300'
        }`}>
          {detail.ioDetails.diskQueueLength}
          {detail.ioDetails.diskQueueLength > 10 && ' 🚨'}
          {detail.ioDetails.diskQueueLength > 5 && detail.ioDetails.diskQueueLength <= 10 && ' ⚠️'}
        </span>
      </div>
    )}
  </>
)}
```

---

## ✅ Ejemplos de Diagnóstico

### **Ejemplo 1: SSD Sobrecargado**
```
🧠 Diagnóstico: Sobrecarga de IOPS (Queue: 15)
🚨 SSD sobrecargado con 111ms escritura (Queue: 15). 
   Reducir carga, separar archivos a otro disco, o agregar IOPS
   
Tipo disco: SSD (SATA)
Queue Length: 15 🚨
```

### **Ejemplo 2: HDD Lento**
```
🧠 Diagnóstico: Disco HDD mecánico (lento por naturaleza)
🐌 TempDB en disco HDD (87ms escritura). 
   Migrar a SSD/NVMe urgentemente
   
Tipo disco: HDD (SATA)
```

### **Ejemplo 3: SSD con Problema de Hardware**
```
🧠 Diagnóstico: Posible problema de hardware, RAID, o storage backend
🚨 SSD con latencia anormal (156ms). 
   Revisar: RAID cache, BBU, cableado, storage backend, o firmware
   
Tipo disco: SSD (SAS)
Estado disco: Warning ⚠️
Queue Length: 3
```

### **Ejemplo 4: Storage Compartido**
```
🧠 Diagnóstico: Storage compartido con muchas DBs (18 DBs, 34 archivos)
🚨 SSD con 98ms (compartido con 18 DBs). 
   Mover TempDB a disco dedicado o reducir competencia
   
Tipo disco: SSD (iSCSI)
Queue Length: 8 ⚠️
```

---

## 📋 Checklist de Implementación

### **Fase 1: Collectors** ⏳
- [ ] Actualizar `RelevamientoHealthScore_Discos.ps1` → Agregar `Get-DiskMediaType()`
- [ ] Actualizar `RelevamientoHealthScore_IO.ps1` → Agregar métricas de carga
- [ ] Probar en 5 instancias de prueba
- [ ] Validar permisos de PowerShell remoting

### **Fase 2: Base de Datos** ⏳
- [ ] Crear migración `20250127_io_diagnostics.sql`
- [ ] Ejecutar en DEV
- [ ] Validar tipos de datos
- [ ] Ejecutar en PROD

### **Fase 3: Consolidador** ⏳
- [ ] Agregar función `Get-IODiagnosisForTempDB()`
- [ ] Integrar en `Calculate-ConfiguracionTempdbScore()`
- [ ] Guardar diagnóstico en `InstanceHealth_Score`
- [ ] Probar con datos reales

### **Fase 4: Backend** ⏳
- [ ] Actualizar modelos C#
- [ ] Actualizar DTOs
- [ ] Actualizar queries del controller
- [ ] Probar API

### **Fase 5: Frontend** ⏳
- [ ] Actualizar interfaces TypeScript
- [ ] Agregar sección de diagnóstico
- [ ] Mostrar tipo de disco y estado
- [ ] Mostrar Queue Length y métricas de carga
- [ ] Validar en UI

---

## ⏱️ Estimación de Tiempo

- **Fase 1 (Collectors):** 2-3 horas ⚠️ *Requiere permisos de WinRM*
- **Fase 2 (Base de Datos):** 30 minutos
- **Fase 3 (Consolidador):** 1-2 horas
- **Fase 4 (Backend):** 30 minutos
- **Fase 5 (Frontend):** 1 hora

**TOTAL:** ~5-7 horas

---

## ⚠️ Consideraciones

1. **Permisos de PowerShell Remoting:**
   - Requiere WinRM habilitado en los servidores
   - Requiere credenciales de administrador local o dominio
   - Puede fallar en servidores bloqueados por firewall

2. **Fallback:**
   - Si no se puede obtener tipo de disco → Inferir por latencia
   - Si no hay permisos → Marcar como "Unknown"

3. **Performance:**
   - PowerShell remoting puede ser lento (1-2 seg por instancia)
   - Considerar caché de tipo de disco (no cambia frecuentemente)

---

¿Quieres que **implemente esto completo**? 🚀

