# 🏥 TempDB Health Score Compuesto v3.0.1

## 📊 Resumen Ejecutivo

El **TempDB Health Score Compuesto** es una métrica integral de **0 a 100 puntos** que evalúa la salud general de TempDB considerando **TODAS las métricas recolectadas**, no solo contención PAGELATCH.

---

## 🎯 Fórmula del Score Compuesto

### **Total: 100 puntos**

```
TempDB Health Score = (Contención × 0.40) + (Latencia × 0.30) + (Configuración × 0.20) + (Recursos × 0.10)
```

---

## 📐 Componentes del Score

### 1️⃣ **CONTENCIÓN (40%)** - PAGELATCH Waits

Mide la competencia por páginas del sistema (PFS, GAM, SGAM).

| PAGELATCH Waits | Score | Interpretación |
|-----------------|-------|----------------|
| 0 ms | 100 | ✅ Sin contención |
| < 100 ms | 90 | ✅ Contención mínima |
| 100-999 ms | 70 | ⚠️ Contención moderada |
| 1,000-9,999 ms | 40 | 🚨 Contención alta |
| ≥ 10,000 ms | 0 | ❌ Contención crítica |

**Contribución al score final:** `ContentionScore × 0.40`

---

### 2️⃣ **LATENCIA DE DISCO (30%)** - Write Latency Promedio

Mide la velocidad de respuesta del subsistema de almacenamiento.

| Write Latency | Score | Interpretación | Tipo de Disco |
|---------------|-------|----------------|---------------|
| ≤ 5 ms | 100 | ✅ Excelente | SSD/NVMe |
| 6-10 ms | 90 | ✅ Muy bueno | SSD Enterprise |
| 11-20 ms | 70 | ⚠️ Aceptable | SAS 15K RPM |
| 21-50 ms | 40 | 🚨 Lento | SATA/HDD |
| > 50 ms | 0 | ❌ Crítico | Disco saturado |

**Contribución al score final:** `DiskScore × 0.30`

**💡 Nota:** La latencia de disco es frecuentemente la **causa raíz** de problemas de TempDB, no la contención.

---

### 3️⃣ **CONFIGURACIÓN (20%)** - Archivos, Size, Growth

Evalúa si TempDB está configurado según best practices de Microsoft.

#### **a) Número de Archivos**

| Configuración | Penalización | Score |
|---------------|--------------|-------|
| Óptimo (1 por CPU core, máx 8) | 0 pts | 100 |
| Al menos la mitad (≥ CPUs/2) | -20 pts | 80 |
| Al menos 2 archivos | -40 pts | 60 |
| **1 solo archivo** | **-60 pts** | **40** ❌ |

**Óptimo:**
- SQL 2016+: 1 archivo por CPU core, máximo 8
- SQL 2014-: 1 archivo por 4 CPU cores, mínimo 4

#### **b) Same Size**

| Configuración | Penalización |
|---------------|--------------|
| Todos los archivos igual tamaño | 0 pts ✅ |
| Archivos de distinto tamaño | **-20 pts** ❌ |

**⚠️ Crítico:** Archivos de distinto tamaño causan **hotspots** y desbalanceo en proportional fill algorithm.

#### **c) Same Growth**

| Configuración | Penalización |
|---------------|--------------|
| Todos con mismo growth | 0 pts ✅ |
| Growth inconsistente | **-10 pts** ⚠️ |

#### **d) Growth Config OK**

| Configuración | Penalización |
|---------------|--------------|
| Growth ≥64MB, sin % growth | 0 pts ✅ |
| Growth <64MB o % growth | **-10 pts** ⚠️ |

**Best Practice:** Growth de **512 MB** en instancias productivas.

**Contribución al score final:** `ConfigScore × 0.20`

---

### 4️⃣ **RECURSOS (10%)** - Espacio Libre y Version Store

Evalúa el uso de recursos de TempDB.

#### **a) Espacio Libre**

| Free Space % | Penalización | Estado |
|--------------|--------------|--------|
| ≥ 20% | 0 pts | ✅ Óptimo |
| 10-19% | -40 pts | ⚠️ Aceptable |
| < 10% | -100 pts | ❌ Crítico |
| Sin datos | -20 pts | ⚠️ Desconocido |

#### **b) Version Store**

El version store se usa para:
- Row versioning (RCSI, Snapshot Isolation)
- Online index rebuilds
- MARS (Multiple Active Result Sets)
- Triggers

| Version Store | Penalización | Estado |
|---------------|--------------|--------|
| < 1 GB | 0 pts | ✅ Normal |
| 1-2 GB | -10 pts | ⚠️ Monitorear |
| 2-5 GB | -30 pts | 🚨 Advertencia |
| > 5 GB | -50 pts | ❌ Problema serio |

**Señal de alerta:** Version store >2GB puede indicar:
- Transacciones largas sin commit
- Index rebuilds online sin finalizar
- Aplicaciones con RCSI/Snapshot mal implementadas

**Contribución al score final:** `ResourceScore × 0.10`

---

## 📈 Interpretación del Score Final

### 🟢 **HEALTHY (90-100 pts)**
- TempDB óptimamente configurado
- Sin problemas de rendimiento
- Disco rápido (SSD/NVMe)
- Configuración según best practices

**Acción:** Mantener monitoreo rutinario.

---

### 🟡 **WARNING (70-89 pts)**
- Posibles problemas menores
- Latencia de disco aceptable pero no óptima
- Configuración subóptima (ej: 2 archivos en servidor con 8 CPUs)
- Contención moderada

**Acción:** Revisar configuración y considerar mejoras.

---

### 🟠 **PROBLEMAS (40-69 pts)**
- Problemas moderados que afectan rendimiento
- Disco lento (HDD/SATA)
- Archivos mal configurados
- Contención alta

**Acción:** Planificar remediación prioritaria.

---

### 🔴 **CRÍTICO (<40 pts)**
- Problemas severos que impactan producción
- Disco saturado (>50ms latency)
- 1 solo archivo de TempDB
- Contención crítica (PAGELATCH >10 segundos)
- Espacio libre <10%

**Acción:** **Intervención urgente requerida.**

---

## 🎯 Ejemplos Prácticos

### ✅ **Ejemplo 1: Score 100 (Perfecto)**
```
Contención:      0 PAGELATCH waits → 100 × 0.40 = 40 pts
Latencia:        3 ms write        → 100 × 0.30 = 30 pts
Configuración:   8 files, same size → 100 × 0.20 = 20 pts
Recursos:        35% free, 500MB VS → 100 × 0.10 = 10 pts
───────────────────────────────────────────────────────
Total: 100 pts 🟢 HEALTHY
```

**Análisis:** Instancia perfectamente configurada con SSD NVMe.

---

### ⚠️ **Ejemplo 2: Score 62 (Problemas)**
```
Contención:      500 PAGELATCH waits → 70 × 0.40 = 28 pts
Latencia:        35 ms write         → 40 × 0.30 = 12 pts
Configuración:   2 files (8 CPUs)    → 80 × 0.20 = 16 pts
Recursos:        22% free, 800MB VS  → 90 × 0.10 = 9 pts
───────────────────────────────────────────────────────
Total: 65 pts 🟠 PROBLEMAS
```

**Análisis:** 
- **Causa raíz:** Disco lento (HDD 35ms)
- **Efecto secundario:** Contención moderada por I/O lento
- **Recomendación:** Migrar TempDB a SSD

---

### 🚨 **Ejemplo 3: Score 24 (Crítico)**
```
Contención:      15,000 PAGELATCH     → 0 × 0.40 = 0 pts
Latencia:        68 ms write          → 0 × 0.30 = 0 pts
Configuración:   1 file, size mismatch → 40 × 0.20 = 8 pts
Recursos:        8% free, 6GB VS      → 0 × 0.10 = 0 pts
───────────────────────────────────────────────────────
Total: 8 pts 🔴 CRÍTICO
```

**Análisis:** 
- **Múltiples problemas críticos:**
  1. Disco saturado (68ms)
  2. 1 solo archivo (single point of contention)
  3. Espacio casi lleno (8%)
  4. Version store gigante (6GB = transacción larga)

**Acciones urgentes:**
1. Investigar transacciones largas (version store 6GB)
2. Agregar archivos de TempDB (mínimo 4)
3. Expandir espacio en disco
4. Considerar SSD dedicado para TempDB

---

## 🔄 Comparación: Score Simple vs Score Compuesto

### **Caso Real: SSDS17-03**

#### **ANTES (Score Simple - solo PAGELATCH):**
```
✅ SSDS17-03 | Files:2 Mem:N/A Score:100 [Disk:45ms🐌]
     ↑ Score "perfecto"          ↑ Pero disco LENTO!
```

**Problema:** El score 100 sugiere que todo está bien, pero el disco está lento (45ms).

---

#### **DESPUÉS (Score Compuesto):**
```
🟠 SSDS17-03 | Files:2 Mem:N/A TempDB_Score:58 [Disk:45ms🐌]

Desglose:
- Contención:     100 × 0.40 = 40 pts (sin PAGELATCH)
- Latencia:       40 × 0.30 = 12 pts (disco lento 45ms)
- Configuración:  80 × 0.20 = 16 pts (solo 2 archivos)
- Recursos:       100 × 0.10 = 10 pts (espacio OK)
───────────────────────────────────────────────────────
Total: 58 pts 🟠 PROBLEMAS
```

**Mejora:** Ahora el score refleja correctamente que hay problemas (disco lento + pocos archivos).

---

## 🛠️ Remediation Guide por Componente

### **1. Score bajo por CONTENCIÓN (40%)**

**Síntomas:**
- PAGELATCH_UP, PAGELATCH_EX waits altos
- Script muestra: `🚨 CRÍTICO! PAGELATCH_CRÍTICO`

**Soluciones (en orden de impacto):**

1. **Migrar TempDB a SSD** (90% de casos se soluciona aquí)
   ```sql
   -- Mover archivos a SSD
   ALTER DATABASE tempdb MODIFY FILE (NAME = tempdev, FILENAME = 'S:\TempDB\tempdb.mdf');
   -- Requiere reinicio de SQL Server
   ```

2. **Agregar archivos de TempDB**
   ```sql
   -- Agregar 1 archivo por CPU core (máximo 8)
   USE master;
   GO
   ALTER DATABASE tempdb ADD FILE (
       NAME = tempdev2,
       FILENAME = 'S:\TempDB\tempdb2.ndf',
       SIZE = 8GB,
       FILEGROWTH = 512MB
   );
   GO
   ```

3. **Igualar tamaños de archivos**
   ```sql
   -- Obtener tamaño del archivo más grande
   SELECT name, (size * 8 / 1024) AS SizeMB
   FROM sys.master_files
   WHERE database_id = DB_ID('tempdb') AND type = 0;
   
   -- Expandir todos al tamaño del más grande
   ALTER DATABASE tempdb MODIFY FILE (NAME = tempdev, SIZE = 8192MB);
   ALTER DATABASE tempdb MODIFY FILE (NAME = tempdev2, SIZE = 8192MB);
   -- Repetir para todos los archivos
   ```

---

### **2. Score bajo por LATENCIA (30%)**

**Síntomas:**
- Write latency >20ms
- Script muestra: `[Disk:45ms🐌]` o `Disco_Lento(>50ms)`

**Soluciones:**

1. **Migrar a SSD/NVMe** (solución definitiva)
   - SSD Enterprise: <5ms latency
   - NVMe: <2ms latency

2. **Verificar configuración de disco:**
   ```powershell
   # Verificar alineación de particiones
   Get-WmiObject -Class Win32_DiskPartition | Select-Object Name, StartingOffset
   
   # Verificar write cache
   Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus
   ```

3. **Aislar TempDB en volumen dedicado:**
   - TempDB en su propio LUN/disco
   - Sin competencia con datos/logs de usuario
   - Stripe RAID 0 para múltiples discos (si no hay SSD)

4. **Configurar Instant File Initialization:**
   ```powershell
   # Agregar cuenta de servicio SQL al "Perform Volume Maintenance Tasks"
   secpol.msc → Local Policies → User Rights Assignment
   ```

---

### **3. Score bajo por CONFIGURACIÓN (20%)**

**Síntomas:**
- `1 file only!`
- `Size mismatch`
- `GrowthMismatch`
- `SmallGrowth`

**Soluciones:**

1. **Script automático para configurar TempDB (SQL 2016+):**
   ```sql
   -- Número óptimo de archivos
   DECLARE @FileCount INT = (SELECT cpu_count FROM sys.dm_os_sys_info);
   IF @FileCount > 8 SET @FileCount = 8;
   IF @FileCount < 4 SET @FileCount = 4;
   
   DECLARE @FileSize INT = 8192; -- 8 GB inicial
   DECLARE @FileGrowth INT = 512; -- 512 MB growth
   
   -- Crear archivos faltantes
   DECLARE @CurrentFiles INT = (
       SELECT COUNT(*) FROM sys.master_files 
       WHERE database_id = DB_ID('tempdb') AND type = 0
   );
   
   DECLARE @i INT = @CurrentFiles + 1;
   WHILE @i <= @FileCount
   BEGIN
       DECLARE @SQL NVARCHAR(500) = 
           'ALTER DATABASE tempdb ADD FILE (' +
           'NAME = tempdev' + CAST(@i AS VARCHAR(2)) + ', ' +
           'FILENAME = ''S:\TempDB\tempdb' + CAST(@i AS VARCHAR(2)) + '.ndf'', ' +
           'SIZE = ' + CAST(@FileSize AS VARCHAR(10)) + 'MB, ' +
           'FILEGROWTH = ' + CAST(@FileGrowth AS VARCHAR(10)) + 'MB);';
       
       EXEC sp_executesql @SQL;
       SET @i = @i + 1;
   END
   ```

2. **Igualar tamaños con script:**
   ```sql
   -- Script para igualar todos los archivos al tamaño del más grande
   DECLARE @MaxSizeMB INT = (
       SELECT MAX(size * 8 / 1024)
       FROM sys.master_files
       WHERE database_id = DB_ID('tempdb') AND type = 0
   );
   
   DECLARE @FileName SYSNAME;
   DECLARE file_cursor CURSOR FOR
       SELECT name
       FROM sys.master_files
       WHERE database_id = DB_ID('tempdb') 
         AND type = 0
         AND (size * 8 / 1024) < @MaxSizeMB;
   
   OPEN file_cursor;
   FETCH NEXT FROM file_cursor INTO @FileName;
   
   WHILE @@FETCH_STATUS = 0
   BEGIN
       DECLARE @SQL NVARCHAR(500) = 
           'ALTER DATABASE tempdb MODIFY FILE (' +
           'NAME = ' + @FileName + ', ' +
           'SIZE = ' + CAST(@MaxSizeMB AS VARCHAR(10)) + 'MB, ' +
           'FILEGROWTH = 512MB);';
       
       EXEC sp_executesql @SQL;
       FETCH NEXT FROM file_cursor INTO @FileName;
   END
   
   CLOSE file_cursor;
   DEALLOCATE file_cursor;
   ```

---

### **4. Score bajo por RECURSOS (10%)**

**Síntomas:**
- `LowFreeSpace(<10%)`
- `LargeVersionStore(>1GB)`
- `[Free:8%⚠️]`

**Soluciones:**

1. **Espacio bajo (<10%):**
   ```sql
   -- Expandir archivos de TempDB
   ALTER DATABASE tempdb MODIFY FILE (NAME = tempdev, SIZE = 16384MB);
   
   -- Agregar más archivos si es necesario
   ALTER DATABASE tempdb ADD FILE (
       NAME = tempdev5,
       FILENAME = 'S:\TempDB\tempdb5.ndf',
       SIZE = 8192MB,
       FILEGROWTH = 512MB
   );
   ```

2. **Version Store grande (>2GB):**
   
   **Investigar transacciones largas:**
   ```sql
   -- Encontrar transacciones con mayor uso de version store
   SELECT 
       t.session_id,
       t.transaction_id,
       t.transaction_begin_time,
       DATEDIFF(MINUTE, t.transaction_begin_time, GETDATE()) AS MinutesOpen,
       s.login_name,
       s.host_name,
       s.program_name,
       r.command,
       r.status,
       st.text AS LastSQL
   FROM sys.dm_tran_active_transactions t
   INNER JOIN sys.dm_tran_session_transactions st_sess ON t.transaction_id = st_sess.transaction_id
   INNER JOIN sys.dm_exec_sessions s ON st_sess.session_id = s.session_id
   LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
   OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) st
   WHERE t.transaction_begin_time < DATEADD(MINUTE, -5, GETDATE()) -- Más de 5 min abiertas
   ORDER BY t.transaction_begin_time;
   ```
   
   **Verificar isolation level:**
   ```sql
   -- Ver sesiones con Snapshot Isolation
   SELECT 
       session_id,
       transaction_isolation_level,
       CASE transaction_isolation_level
           WHEN 0 THEN 'Unspecified'
           WHEN 1 THEN 'ReadUncommitted'
           WHEN 2 THEN 'ReadCommitted'
           WHEN 3 THEN 'Repeatable'
           WHEN 4 THEN 'Serializable'
           WHEN 5 THEN 'Snapshot'
       END AS IsolationLevel
   FROM sys.dm_exec_sessions
   WHERE is_user_process = 1
     AND transaction_isolation_level = 5;
   ```
   
   **Deshabilitar RCSI si no se usa:**
   ```sql
   -- Verificar si RCSI está habilitado
   SELECT name, is_read_committed_snapshot_on
   FROM sys.databases
   WHERE is_read_committed_snapshot_on = 1;
   
   -- Deshabilitar RCSI (requiere acceso exclusivo)
   -- CUIDADO: Validar con desarrollo antes de deshabilitar
   ALTER DATABASE YourDatabase SET READ_COMMITTED_SNAPSHOT OFF;
   ```

---

## 📊 Dashboard de Monitoreo

### **Query para ver Score Histórico:**

```sql
SELECT 
    InstanceName,
    CollectedAtUtc AT TIME ZONE 'UTC' AT TIME ZONE 'Argentina Standard Time' AS FechaLocal,
    TempDBContentionScore AS [TempDB Health Score],
    TempDBFileCount AS Files,
    TempDBPageLatchWaits AS [PAGELATCH (ms)],
    TempDBAvgWriteLatencyMs AS [Write Latency (ms)],
    CASE 
        WHEN TempDBAllSameSize = 1 THEN '✅'
        ELSE '❌'
    END AS [Same Size],
    TempDBFreeSpacePct AS [Free %],
    TempDBVersionStoreMB AS [VersionStore (MB)],
    CASE
        WHEN TempDBContentionScore >= 90 THEN '🟢 HEALTHY'
        WHEN TempDBContentionScore >= 70 THEN '🟡 WARNING'
        WHEN TempDBContentionScore >= 40 THEN '🟠 PROBLEMAS'
        ELSE '🔴 CRÍTICO'
    END AS [Estado]
FROM InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(HOUR, -24, GETUTCDATE())
ORDER BY TempDBContentionScore ASC, InstanceName;
```

### **Top 10 Instancias con Score Bajo:**

```sql
SELECT TOP 10
    InstanceName,
    TempDBContentionScore,
    TempDBFileCount,
    TempDBAvgWriteLatencyMs,
    TempDBPageLatchWaits,
    CASE
        WHEN TempDBAvgWriteLatencyMs > 50 THEN '🚨 Disco crítico'
        WHEN TempDBAvgWriteLatencyMs > 20 THEN '⚠️ Disco lento'
        WHEN TempDBFileCount = 1 THEN '⚠️ 1 solo archivo'
        WHEN TempDBAllSameSize = 0 THEN '⚠️ Size mismatch'
        WHEN TempDBPageLatchWaits > 10000 THEN '🚨 PAGELATCH crítico'
        ELSE 'Multiple issues'
    END AS [Problema Principal],
    ConfigDetails
FROM InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -60, GETUTCDATE())
  AND TempDBContentionScore < 70
ORDER BY TempDBContentionScore ASC;
```

---

## 🎓 Conclusiones

### **Ventajas del Score Compuesto:**

✅ **Diagnóstico más preciso:** Identifica la causa raíz (ej: disco lento vs contención)  
✅ **Priorización efectiva:** Score bajo = intervención requerida  
✅ **Prevención proactiva:** Detecta problemas antes de que causen outages  
✅ **Métricas accionables:** Cada componente tiene remediation específica  

### **Integración con HealthScore v3.0:**

El **TempDB Health Score Compuesto** (0-100) es usado por el **script consolidador** para calcular:

```
ConfiguracionTempdbScore (0-100) = 
    (TempDB Health Score × 0.60) + (MaxMemory Config × 0.40)

ConfiguracionTempdbContribution (0-8) = 
    ConfiguracionTempdbScore × 0.08

HealthScore Total (0-100) = Suma de 12 contribuciones
```

**Peso en HealthScore v3:** 8% del total

---

## 📚 Referencias

- [Microsoft: Optimize tempdb performance](https://docs.microsoft.com/en-us/sql/relational-databases/databases/tempdb-database)
- [Microsoft: Troubleshoot tempdb performance](https://docs.microsoft.com/en-us/troubleshoot/sql/performance/troubleshoot-tempdb-performance)
- [Brent Ozar: TempDB Performance Troubleshooting](https://www.brentozar.com/archive/2019/01/how-to-troubleshoot-tempdb-performance/)
- [Paul Randal: Why tempdb configuration matters](https://www.sqlskills.com/blogs/paul/why-is-tempdb-configuration-important/)

---

**Versión:** 3.0.1  
**Fecha:** Octubre 2024  
**Autor:** SQL Guard Observatory

