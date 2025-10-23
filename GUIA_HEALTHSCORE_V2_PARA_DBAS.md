# 🏥 Guía del Health Score v2.0 para DBAs

## 📚 **Índice**

1. [¿Qué es el Health Score?](#qué-es-el-health-score)
2. [Cómo funciona (arquitectura simple)](#cómo-funciona)
3. [Sistema de puntuación (150 puntos)](#sistema-de-puntuación)
4. [Explicación de cada métrica](#explicación-de-cada-métrica)
5. [Qué hacer cuando algo está mal](#qué-hacer-cuando-algo-está-mal)
6. [FAQs](#faqs)
7. [Troubleshooting](#troubleshooting)

---

## ❓ **¿Qué es el Health Score?**

El **Health Score** es un **número del 0 al 150** que indica qué tan saludable está tu instancia SQL Server.

### 🎯 **Escala:**

| Puntos | Status | Significado | Acción |
|--------|--------|-------------|--------|
| **135-150** | ✅ **Healthy** | Todo está bien | Monitoreo normal |
| **105-134** | ⚠️ **Warning** | Algo necesita atención | Investigar y planear fix |
| **0-104** | 🚨 **Critical** | Problema serio | Actuar inmediatamente |

### 💡 **Ejemplo:**

```
SQLPROD01: 142/150 pts → ✅ Healthy
SQLPROD02: 118/150 pts → ⚠️ Warning (revisar backups vencidos)
SQLPROD03: 89/150 pts  → 🚨 Critical (sin conexión!)
```

**Piénsalo como un examen:** 
- 90%+ = Aprobado con honores (Healthy)
- 70-89% = Aprobado justo (Warning)
- <70% = Reprobado (Critical)

---

## 🔧 **Cómo funciona**

### **Arquitectura Simple:**

```
┌─────────────────────────────────────────────────────┐
│  PASO 1: Recolectar Métricas (4 scripts)           │
├─────────────────────────────────────────────────────┤
│  Script                    Frecuencia    Tabla      │
│  ─────────────────────────────────────────────────  │
│  1. Availability          1 minuto       Critical_A │
│     ├─ ¿Conecta?                                    │
│     ├─ ¿Blocking?                                   │
│     ├─ ¿Memory OK?                                  │
│     └─ ¿AlwaysOn OK?                                │
│                                                      │
│  2. Resources             5 minutos      Critical_R │
│     ├─ Espacio en discos                            │
│     ├─ Latencia de disco (IOPS)                     │
│     └─ Queries lentos                               │
│                                                      │
│  3. Backups               15 minutos     Backups    │
│     ├─ Backup FULL reciente?                        │
│     └─ Backup LOG reciente?                         │
│                                                      │
│  4. Maintenance           1 hora         Maintenance│
│     ├─ CHECKDB OK?                                  │
│     ├─ IndexOptimize OK?                            │
│     ├─ Fragmentación índices                        │
│     └─ Errores severity 20+                         │
└─────────────────────────────────────────────────────┘

                         ↓

┌─────────────────────────────────────────────────────┐
│  PASO 2: Consolidar y Calcular (1 script)          │
├─────────────────────────────────────────────────────┤
│  Script: Consolidate       Frecuencia: 2 minutos   │
│                                                      │
│  Lee las 4 tablas → Calcula 150 puntos → Guarda    │
│                      en tabla Score                 │
└─────────────────────────────────────────────────────┘

                         ↓

┌─────────────────────────────────────────────────────┐
│  PASO 3: Frontend muestra el score                 │
└─────────────────────────────────────────────────────┘
```

**En resumen:**
1. Cada X minutos, un script recolecta métricas y las guarda en SQL
2. El consolidador suma todo y calcula un número de 0 a 150
3. Tú ves ese número en el dashboard

---

## 📊 **Sistema de Puntuación (150 puntos)**

El Health Score se divide en **4 Tiers** (categorías):

### **Tier 1: Disponibilidad (50 puntos) 🚨**

**¿Qué mide?** Si la instancia está viva y respondiendo bien.

| Métrica | Puntos | ¿Qué es? |
|---------|--------|----------|
| **Conectividad** | 20 | ¿Puedo conectarme? ¿Responde rápido? |
| **Blocking** | 10 | ¿Hay queries bloqueados esperando? |
| **Memory (PLE)** | 10 | ¿Hay suficiente memoria RAM? |
| **AlwaysOn** | 10 | ¿Los nodos del AG están sincronizados? |
| **TOTAL** | **50** | |

**Prioridad:** 🔴 **CRÍTICA** - Sin disponibilidad, nada funciona.

---

### **Tier 2: Continuidad (40 puntos) 💾**

**¿Qué mide?** Si puedo recuperarme de un desastre.

| Métrica | Puntos | ¿Qué es? |
|---------|--------|----------|
| **FULL Backup** | 15 | ¿Tengo backup completo reciente (<24h)? |
| **LOG Backup** | 15 | ¿Tengo backup de logs reciente (<2h)? |
| **AlwaysOn** | 10 | ¿Alta disponibilidad configurada? |
| **TOTAL** | **40** | |

**Prioridad:** 🟠 **ALTA** - Sin backups, pierdo datos.

---

### **Tier 3: Recursos (40 puntos) 💻**

**¿Qué mide?** Si hay suficientes recursos (disco, IOPS, CPU indirecto).

| Métrica | Puntos | ¿Qué es? |
|---------|--------|----------|
| **Disk Space** | 15 | ¿Hay espacio libre en los discos? |
| **IOPS/Latencia** | 15 | ¿Los discos responden rápido? |
| **Query Performance** | 10 | ¿Hay queries lentos ejecutándose? |
| **TOTAL** | **40** | |

**Prioridad:** 🟡 **MEDIA** - Afecta performance pero no es inmediato.

---

### **Tier 4: Mantenimiento (20 puntos) 🔧**

**¿Qué mide?** Si el mantenimiento está al día.

| Métrica | Puntos | ¿Qué es? |
|---------|--------|----------|
| **CHECKDB** | 10 | ¿Revisé integridad de datos? |
| **IndexOptimize** | 5 | ¿Optimicé los índices? |
| **Errorlog** | 5 | ¿Hay errores críticos (severity 20+)? |
| **TOTAL** | **20** | |

**Prioridad:** 🟢 **BAJA** - Importante a largo plazo pero no urgente.

---

## 📖 **Explicación de cada Métrica**

### **TIER 1: Disponibilidad (50 pts)**

---

#### **1.1 Conectividad (20 pts)** 🔌

**¿Qué es?**
- Intenta conectarse a SQL Server y mide cuánto tarda.

**Cómo se calcula:**

```
Si NO conecta:     0 pts  💥
Si conecta:        15 pts base

Bonus por latencia:
  ≤10ms:  +5 pts  (total 20) ✅ Excelente
  ≤50ms:  +3 pts  (total 18) ✅ Bueno
  ≤100ms: +1 pt   (total 16) ⚠️ Aceptable
  >100ms:  0 pts  (total 15) 🚨 Lento
```

**Ejemplo:**
```
SQLPROD01 conecta en 8ms  → 20 pts ✅
SQLPROD02 conecta en 85ms → 16 pts ⚠️
SQLPROD03 no conecta      → 0 pts  🚨
```

**¿Qué hacer si está bajo?**
1. **0 pts:** Instancia caída, revisar:
   - ¿Está encendido el servidor?
   - ¿El servicio SQL Server está running?
   - ¿Firewall bloqueando puerto 1433?
   
2. **<18 pts:** Latencia alta, revisar:
   - Red saturada
   - Servidor sobrecargado
   - Switches/routers lentos

---

#### **1.2 Blocking (10 pts)** 🚫

**¿Qué es?**
- Cuenta cuántos usuarios están esperando porque otro query los está bloqueando.

**Cómo se calcula:**

```
0 bloqueados:        10 pts ✅
1-3 bloqueados:       7 pts ⚠️
4-10 bloqueados:      3 pts 🚨
10+ bloqueados:       0 pts 💥
```

**Ejemplo:**
```sql
-- Query que detecta blocking:
SELECT blocking_session_id, session_id, wait_time
FROM sys.dm_exec_requests
WHERE blocking_session_id > 0;

-- Si esto devuelve 15 filas = 15 queries bloqueados = 0 pts
```

**¿Qué hacer si está bajo?**
1. Identificar quién está bloqueando:
   ```sql
   EXEC sp_who2 'active'
   ```

2. Ver qué está haciendo el bloqueador:
   ```sql
   DBCC INPUTBUFFER(session_id_bloqueador)
   ```

3. Opciones:
   - Esperar a que termine (si es rápido)
   - Matar la sesión bloqueadora: `KILL session_id`
   - Optimizar el query problemático

**Causas comunes:**
- Queries muy largos sin índices
- Transacciones largas sin commit
- Locks de tabla (table scans)

---

#### **1.3 Memory / Page Life Expectancy (10 pts)** 🧠

**¿Qué es?**
- **PLE** = Cuántos segundos una página de datos permanece en memoria RAM antes de ser expulsada al disco.
- Si PLE es bajo = SQL está usando disco en lugar de RAM = LENTO.

**Cómo se calcula:**

```
PLE ≥300 segundos:  10 pts ✅ (5+ minutos = excelente)
PLE 200-299:         7 pts ✅ (3-5 min = bueno)
PLE 100-199:         3 pts ⚠️ (1-3 min = aceptable)
PLE <100:            0 pts 🚨 (memory pressure = malo)
```

**Ejemplo:**
```sql
-- Ver PLE actual:
SELECT cntr_value AS PageLifeExpectancy
FROM sys.dm_os_performance_counters
WHERE counter_name = 'Page life expectancy';

-- Resultado: 450 = 450 segundos = 7.5 minutos = 10 pts ✅
```

**¿Qué hacer si está bajo?**
1. **Verificar memoria asignada:**
   ```sql
   EXEC sp_configure 'max server memory'
   ```
   
2. **Agregar más RAM al servidor**

3. **Optimizar queries que consumen mucha memoria**

4. **Revisar si hay memory leaks** (aplicaciones mal programadas)

**Nota para junior:** PLE bajo = datos van y vienen entre RAM y disco = queries lentos.

---

#### **1.4 AlwaysOn (10 pts)** 🔄

**¿Qué es?**
- Si tienes **AlwaysOn Availability Groups** (alta disponibilidad), revisa si los nodos están sincronizados.

**Cómo se calcula:**

```
No tiene AlwaysOn:       10 pts ✅ (N/A = OK)
AlwaysOn HEALTHY:        10 pts ✅
AlwaysOn PARTIALLY:       5 pts ⚠️
AlwaysOn NOT_HEALTHY:     0 pts 🚨
```

**Ejemplo:**
```sql
-- Ver estado AlwaysOn:
SELECT 
    ar.replica_server_name,
    ars.synchronization_health_desc
FROM sys.dm_hadr_availability_replica_states ars
JOIN sys.availability_replicas ar ON ars.replica_id = ar.replica_id;

-- Si devuelve "HEALTHY" = 10 pts ✅
```

**¿Qué hacer si está bajo?**
1. **Revisar log de AlwaysOn:**
   ```sql
   SELECT * FROM sys.dm_hadr_availability_replica_states;
   ```

2. **Verificar red entre nodos** (ping, latencia)

3. **Revisar si hay mucho log pendiente de sincronizar**

4. **Contactar al DBA senior si no sabes cómo arreglarlo**

---

### **TIER 2: Continuidad (40 pts)**

---

#### **2.1 FULL Backup (15 pts)** 💾

**¿Qué es?**
- ¿Cuándo fue el último backup completo de todas las bases de datos?

**Cómo se calcula:**

```
Todas las DBs con backup FULL <24 horas:  15 pts ✅
Alguna DB sin backup o >24 horas:          0 pts 🚨
```

**Ejemplo:**
```sql
-- Ver últimos backups FULL:
SELECT 
    d.name,
    MAX(bs.backup_finish_date) AS LastFullBackup,
    DATEDIFF(HOUR, MAX(bs.backup_finish_date), GETDATE()) AS HoursAgo
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset bs ON d.name = bs.database_name AND bs.type = 'D'
GROUP BY d.name;

-- Si alguna DB tiene HoursAgo > 24 = 0 pts
```

**¿Qué hacer si está bajo?**
1. **Verificar job de backups:**
   - ¿Está habilitado?
   - ¿Tiene errores?

2. **Ejecutar backup manual:**
   ```sql
   BACKUP DATABASE [NombreDB] 
   TO DISK = 'D:\Backups\NombreDB_FULL.bak' 
   WITH COMPRESSION;
   ```

3. **Revisar espacio en disco de backups**

---

#### **2.2 LOG Backup (15 pts)** 📝

**¿Qué es?**
- Para bases en modo **FULL recovery**, ¿cuándo fue el último backup de transaction log?

**Cómo se calcula:**

```
Todas las DBs FULL con backup LOG <2 horas:  15 pts ✅
Alguna DB FULL sin backup LOG o >2 horas:     0 pts 🚨
```

**¿Por qué es importante?**
- Sin backups de LOG, el archivo .ldf crece sin control y llenas el disco.
- Pierdes RPO (Recovery Point Objective) - puedes perder hasta 2 horas de datos.

**Ejemplo:**
```sql
-- Ver últimos backups LOG:
SELECT 
    d.name,
    d.recovery_model_desc,
    MAX(bs.backup_finish_date) AS LastLogBackup,
    DATEDIFF(MINUTE, MAX(bs.backup_finish_date), GETDATE()) AS MinutesAgo
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset bs ON d.name = bs.database_name AND bs.type = 'L'
WHERE d.recovery_model_desc = 'FULL'
GROUP BY d.name, d.recovery_model_desc;
```

**¿Qué hacer si está bajo?**
1. **Ejecutar backup de LOG manual:**
   ```sql
   BACKUP LOG [NombreDB] 
   TO DISK = 'D:\Backups\NombreDB_LOG.trn' 
   WITH COMPRESSION;
   ```

2. **Verificar job de backups de LOG** (debería correr cada 15-30 minutos)

---

### **TIER 3: Recursos (40 pts)**

---

#### **3.1 Disk Space (15 pts)** 💿

**¿Qué es?**
- ¿Cuánto espacio libre queda en el disco más lleno que usa SQL Server?

**Cómo se calcula:**

```
Peor disco ≥30% libre:  15 pts ✅
Peor disco 20-29% libre: 10 pts ⚠️
Peor disco 10-19% libre:  5 pts 🚨
Peor disco <10% libre:    0 pts 💥
```

**Ejemplo:**
```sql
-- Ver espacio en discos:
SELECT DISTINCT 
    vs.volume_mount_point AS Drive,
    vs.total_bytes / 1024 / 1024 / 1024 AS TotalGB,
    vs.available_bytes / 1024 / 1024 / 1024 AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS INT) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs;

-- Si el Drive con menor FreePct tiene 8% = 0 pts
```

**¿Qué hacer si está bajo?**
1. **Liberar espacio:**
   - Borrar backups viejos
   - Shrink de archivos de log (con cuidado)
   - Archivar datos viejos

2. **Extender disco** (Storage/VMware)

3. **Mover archivos a otro disco:**
   ```sql
   ALTER DATABASE [NombreDB] 
   MODIFY FILE (NAME = 'archivo', FILENAME = 'E:\Data\archivo.mdf');
   ```

---

#### **3.2 IOPS / Latencia de Disco (15 pts)** ⚡

**¿Qué es?**
- ¿Qué tan rápido responden los discos cuando SQL pide leer/escribir datos?
- **Latencia** = tiempo en milisegundos (ms) que tarda una operación de disco.

**Cómo se calcula:**

```
Latencia promedio ≤10ms:   15 pts ✅ (SSD rápido)
Latencia 11-20ms:          12 pts ✅ (SSD normal)
Latencia 21-50ms:           7 pts ⚠️ (HDD o SSD lento)
Latencia >50ms:             0 pts 🚨 (disco muy lento)
```

**Ejemplo:**
```sql
-- Ver latencia de I/O:
SELECT 
    DB_NAME(database_id) AS DatabaseName,
    CAST(io_stall_read_ms / NULLIF(num_of_reads, 0) AS INT) AS AvgReadLatencyMs,
    CAST(io_stall_write_ms / NULLIF(num_of_writes, 0) AS INT) AS AvgWriteLatencyMs
FROM sys.dm_io_virtual_file_stats(NULL, NULL)
WHERE num_of_reads > 100;

-- Si promedio es 78ms = 0 pts (disco lento)
```

**¿Qué hacer si está bajo?**
1. **Verificar carga del disco:**
   - Resource Monitor (perfmon) → Disk Queue Length
   
2. **Upgrade a SSD** (HDD → SSD = 5-10x más rápido)

3. **Distribuir archivos en más discos**

4. **Optimizar queries que hacen muchos scans**

**Nota:** Latencia <10ms = SSD, >20ms = probablemente HDD tradicional.

---

#### **3.3 Query Performance (10 pts)** 🐌

**¿Qué es?**
- ¿Cuántos queries llevan más de 30 segundos ejecutándose?

**Cómo se calcula:**

```
0 queries lentos:      10 pts ✅
1-3 queries lentos:     7 pts ⚠️
4-10 queries lentos:    3 pts 🚨
10+ queries lentos:     0 pts 💥
```

**Ejemplo:**
```sql
-- Ver queries actualmente lentos:
SELECT 
    session_id,
    total_elapsed_time / 1000 AS ElapsedSeconds,
    wait_type,
    DB_NAME(database_id) AS DatabaseName
FROM sys.dm_exec_requests
WHERE session_id > 50
  AND total_elapsed_time > 30000;  -- >30 segundos
```

**¿Qué hacer si está bajo?**
1. **Identificar el query lento:**
   ```sql
   SELECT st.text
   FROM sys.dm_exec_requests r
   CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
   WHERE r.session_id = <session_id>;
   ```

2. **Ver el execution plan** para optimizarlo

3. **Agregar índices faltantes**

4. **Esperar o matar si es necesario:** `KILL <session_id>`

---

### **TIER 4: Mantenimiento (20 pts)**

---

#### **4.1 CHECKDB (10 pts)** 🔍

**¿Qué es?**
- `DBCC CHECKDB` revisa la **integridad física** de la base de datos (detecta corrupción).

**Cómo se calcula:**

```
Todos los IntegrityCheck jobs OK (<7 días):  10 pts ✅
Algún job falló o >7 días sin ejecutar:       0 pts 🚨
```

**¿Por qué es crítico?**
- Sin CHECKDB, no sabes si tu base está corrupta hasta que es tarde.
- Los backups de una DB corrupta también están corruptos.

**¿Qué hacer si está bajo?**
1. **Verificar job:** `DatabaseIntegrityCheck - USER_DATABASES`

2. **Ejecutar manualmente (¡puede tardar horas!):**
   ```sql
   DBCC CHECKDB('[NombreDB]') WITH NO_INFOMSGS;
   ```

3. **Si encuentra errores:**
   - Severidad baja: `DBCC CHECKDB(...) WITH REPAIR_REBUILD`
   - Severidad alta: Restaurar desde backup

---

#### **4.2 IndexOptimize (5 pts)** 🔧

**¿Qué es?**
- Job que reorganiza/reconstruye índices fragmentados.

**Cómo se calcula:**

```
Todos los IndexOptimize jobs OK (<7 días):  5 pts ✅
Algún job falló o >7 días sin ejecutar:     0 pts 🚨
```

**¿Por qué importa?**
- Índices fragmentados = queries más lentos.

**¿Qué hacer si está bajo?**
1. **Verificar job:** `IndexOptimize - USER_DATABASES`

2. **Ejecutar manualmente** (puede tardar):
   ```sql
   EXEC dbo.IndexOptimize 
       @Databases = 'USER_DATABASES',
       @FragmentationLow = NULL,
       @FragmentationMedium = 'INDEX_REORGANIZE',
       @FragmentationHigh = 'INDEX_REBUILD_ONLINE,INDEX_REBUILD_OFFLINE';
   ```

---

#### **4.3 Errorlog (5 pts)** ⚠️

**¿Qué es?**
- Cuenta errores **severity 20 o mayor** en las últimas 24 horas.
- Severity 20+ = **errores críticos** (ej: corrupción, out of memory, crashes).

**Cómo se calcula:**

```
0 errores severity 20+:   5 pts ✅
1-2 errores:              3 pts ⚠️
3+ errores:               0 pts 🚨
```

**Ejemplo:**
```sql
-- Ver errores recientes:
CREATE TABLE #ErrorLog (LogDate DATETIME, ProcessInfo NVARCHAR(128), [Text] NVARCHAR(MAX));
INSERT INTO #ErrorLog EXEC sp_readerrorlog 0;

SELECT * 
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE());

DROP TABLE #ErrorLog;
```

**¿Qué hacer si está bajo?**
1. **Leer los errores** y entender qué pasó

2. **Errores comunes:**
   - Severity 20: Connection broken
   - Severity 21: Database corruption
   - Severity 24: Hardware failure

3. **Contactar al DBA senior** si no entiendes el error

---

## 🚨 **Qué hacer cuando algo está mal**

### **Guía Rápida de Acción**

| Score | Qué hacer |
|-------|-----------|
| **135-150** | ✅ Monitoreo normal, todo bien |
| **120-134** | ⚠️ Revisar qué métrica está baja, planear fix en próximos días |
| **105-119** | ⚠️ Investigar hoy, fix en próximas horas/días |
| **90-104** | 🚨 Problema serio, escalar a senior |
| **<90** | 🚨 URGENTE: Escalar inmediatamente |

### **Matriz de Prioridades**

| Métrica baja | Impacto | Urgencia | Acción |
|--------------|---------|----------|--------|
| Conectividad 0 pts | 💥 Catastrófico | Inmediata | Revisar servicio SQL |
| Blocking >10 | 🚨 Alto | 15 minutos | Identificar bloqueador |
| Memory PLE <100 | 🚨 Alto | 1 hora | Revisar memoria disponible |
| Full Backup vencido | 🚨 Alto | 1 hora | Ejecutar backup |
| Disk <10% free | 🚨 Alto | 1 día | Liberar espacio |
| IOPS >50ms | ⚠️ Medio | 1 semana | Evaluar upgrade SSD |
| CHECKDB vencido | ⚠️ Medio | 1 semana | Ejecutar CHECKDB |
| IndexOptimize vencido | 🟢 Bajo | 1 mes | Ejecutar IndexOptimize |
| Errorlog 1-2 errors | 🟢 Bajo | Revisar | Leer errores y documentar |

---

## ❓ **FAQs (Preguntas Frecuentes)**

### **1. ¿Por qué mi instancia tiene 140 pts pero sigue lenta?**

El Health Score mide **salud general**, no **performance específico** de tu aplicación.

Posibles causas:
- Query mal optimizado (sin índices)
- Aplicación mal programada
- Red lenta entre app y SQL
- Contención de locks (blocking transitorio que no capturamos)

**Solución:** Usar Extended Events o Query Store para analizar queries específicos.

---

### **2. ¿Cada cuánto se actualiza el Health Score?**

- **Availability metrics:** Cada 1 minuto
- **Resources metrics:** Cada 5 minutos
- **Backup metrics:** Cada 15 minutos
- **Maintenance metrics:** Cada 1 hora
- **Score final:** Cada 2 minutos

**Nota:** El score final se calcula cada 2 minutos usando los datos más recientes de cada tabla.

---

### **3. ¿Qué significa "N/A" en una métrica?**

- La métrica no aplica para esa instancia.
- **Ejemplo:** AlwaysOn = N/A si no tienes Availability Groups configurados.
- En estos casos, recibes los puntos completos (no te penaliza).

---

### **4. Mi instancia tiene 105 pts (Warning) pero no veo problemas. ¿Es normal?**

Sí, puede pasar. **105 pts = 70% de 150 = justo en el límite.**

Revisa el **breakdown** para ver qué métricas están bajas:
- Tal vez backups vencidos por 30 minutos (se actualiza cada 15 min)
- Tal vez fragmentación alta (no urgente pero suma puntos)

**Acción:** Revisar detalles en el dashboard, no es urgente pero sí importante.

---

### **5. ¿Puedo modificar los pesos de las métricas?**

Sí, editando el script `RelevamientoHealthScore_Consolidate.ps1`.

**Ejemplo:** Si quieres dar más importancia a backups:
```powershell
# Cambiar de:
function Calculate-FullBackupScore {
    return if ($FullBackupBreached) { 0 } else { 15 }
}

# A:
function Calculate-FullBackupScore {
    return if ($FullBackupBreached) { 0 } else { 25 }  # Aumentado de 15 a 25
}
```

**⚠️ Advertencia:** Si cambias los pesos, el máximo ya no será 150. Ajusta todos los valores proporcionalmente.

---

## 🔧 **Troubleshooting**

### **Problema 1: "No se están recolectando métricas"**

**Síntomas:**
- Dashboard muestra datos viejos
- Tablas SQL vacías

**Diagnóstico:**
1. Verificar scheduled tasks:
   ```powershell
   Get-ScheduledTask | Where-Object {$_.TaskName -like 'HealthScore*'}
   ```

2. Ver logs:
   ```powershell
   Get-Content "C:\SQL-Guard-Observatory\logs\HealthScore_v2_Availability_*.log" -Tail 50
   ```

3. Ejecutar script manualmente:
   ```powershell
   cd C:\SQL-Guard-Observatory\scripts
   .\RelevamientoHealthScore_Availability.ps1
   ```

**Soluciones:**
- Task deshabilitado → Habilitar
- Error de permisos → Verificar que la cuenta tiene permisos sysadmin
- Error de conexión → Verificar conectividad a API/SQL

---

### **Problema 2: "Score siempre en 0"**

**Síntomas:**
- Todas las instancias muestran 0 puntos

**Diagnóstico:**
1. Verificar que el consolidador está corriendo:
   ```sql
   SELECT TOP 10 * 
   FROM dbo.InstanceHealth_Score 
   ORDER BY CollectedAtUtc DESC;
   ```

2. Si está vacío, ejecutar consolidador manualmente:
   ```powershell
   .\RelevamientoHealthScore_Consolidate.ps1
   ```

**Soluciones:**
- Consolidador no corriendo → Verificar scheduled task
- Tablas fuente vacías → Verificar que los otros 4 scripts están corriendo
- Error de lógica → Revisar logs del consolidador

---

### **Problema 3: "Métricas inconsistentes"**

**Síntomas:**
- Score cambia drásticamente (de 140 a 80 en 2 minutos)

**Causas:**
- Backup acabó de vencer (pasa de 15 pts a 0 pts)
- Instancia se cayó (conectividad pasa de 20 pts a 0 pts)
- Blocking transitorio

**Solución:**
- **Normal:** Si es un cambio real (instancia caída, backup vencido)
- **Falso positivo:** Esperar 5 minutos, si se recupera era transitorio

---

### **Problema 4: "Scripts tardan mucho"**

**Síntomas:**
- Script de Maintenance tarda >10 minutos
- Task Scheduler muestra "Running" por mucho tiempo

**Causas:**
- Muchas instancias (>100)
- Instancias lentas (timeout)
- Query de fragmentación pesado

**Soluciones:**
1. **Aumentar timeout:**
   ```powershell
   $TimeoutSec = 30  # Cambiar a 60
   ```

2. **Paralelizar (avanzado):** Usar `ForEach-Object -Parallel` en PowerShell 7

3. **Filtrar instancias:** Excluir instancias de desarrollo/QA

---

## 📚 **Recursos Adicionales**

### **Scripts Útiles**

#### **Ver últimos 10 scores:**
```sql
SELECT TOP 10 
    InstanceName,
    HealthScore,
    HealthStatus,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    CollectedAtUtc
FROM dbo.InstanceHealth_Score
ORDER BY CollectedAtUtc DESC;
```

#### **Ver instancias críticas:**
```sql
SELECT * 
FROM dbo.vw_InstanceHealth_Latest
WHERE HealthStatus = 'Critical'
ORDER BY HealthScore;
```

#### **Comparar score actual vs hace 24 horas:**
```sql
WITH CurrentScore AS (
    SELECT InstanceName, HealthScore AS CurrentScore
    FROM dbo.vw_InstanceHealth_Latest
),
PreviousScore AS (
    SELECT TOP 1 WITH TIES
        InstanceName,
        HealthScore AS PreviousScore
    FROM dbo.InstanceHealth_Score
    WHERE CollectedAtUtc >= DATEADD(HOUR, -24, GETUTCDATE())
    ORDER BY ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY ABS(DATEDIFF(SECOND, CollectedAtUtc, DATEADD(HOUR, -24, GETUTCDATE()))))
)
SELECT 
    c.InstanceName,
    c.CurrentScore,
    p.PreviousScore,
    c.CurrentScore - p.PreviousScore AS Difference
FROM CurrentScore c
LEFT JOIN PreviousScore p ON c.InstanceName = p.InstanceName
ORDER BY Difference;
```

---

## ✅ **Checklist para DBAs Junior**

### **Monitoreo Diario:**

- [ ] Revisar dashboard de Health Score
- [ ] Investigar instancias con score <120
- [ ] Verificar que scheduled tasks están corriendo
- [ ] Revisar log de errores de scripts

### **Monitoreo Semanal:**

- [ ] Comparar tendencia de scores (¿están mejorando o empeorando?)
- [ ] Verificar que cleanup de datos históricos está funcionando
- [ ] Revisar métricas individuales (no solo el score total)

### **Monitoreo Mensual:**

- [ ] Generar reporte de instancias con peor score promedio
- [ ] Identificar métricas que más afectan el score
- [ ] Proponer mejoras (ej: upgrade a SSD, más RAM)

---

**Versión:** 2.0  
**Fecha:** 2025-10-23  
**Autor:** SQL Guard Observatory Team  
**Contacto:** Escalar a DBA Senior si tienes dudas

---

## 🎓 **Glosario para Juniors**

| Término | Significado Simple |
|---------|-------------------|
| **PLE (Page Life Expectancy)** | Cuánto tiempo una página de datos vive en memoria antes de ser expulsada |
| **IOPS** | Input/Output Operations Per Second - cuántas operaciones de disco por segundo |
| **Latency** | Tiempo de espera (en milisegundos) para una operación |
| **Blocking** | Cuando un query espera porque otro lo está bloqueando (lock) |
| **Fragmentation** | Cuando los datos están desordenados en disco (como un libro con páginas mezcladas) |
| **CHECKDB** | Comando que revisa si la base de datos tiene corrupción |
| **AG (Availability Group)** | AlwaysOn - sistema de alta disponibilidad con réplicas |
| **Severity 20+** | Errores muy graves en SQL Server (crashes, corrupción, etc.) |
| **Recovery Model FULL** | Modo que permite recuperar datos punto en el tiempo (necesita backups de LOG) |
| **Threshold** | Umbral o límite (ej: "threshold de 24 horas para backups") |

---

**🎉 ¡Felicitaciones!** Si llegaste hasta acá, ya sabes más de Health Score que el 80% de los DBAs 😄

