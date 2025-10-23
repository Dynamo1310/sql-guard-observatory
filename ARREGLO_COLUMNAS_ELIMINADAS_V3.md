# 🐛 Arreglo: Columnas Eliminadas en v3.0 (100 puntos)

## 📋 **Error**

```
Microsoft.Data.SqlClient.SqlException (0x80131904): Invalid column name 'BlockingScore'.
Invalid column name 'IOPSScore'.
Invalid column name 'QueryPerformanceScore'.
```

---

## 🔍 **Causa del Problema**

El backend estaba intentando leer columnas que **ya no existen** en la tabla `InstanceHealth_Score` después de la migración al sistema de **100 puntos (v3.0)**.

### **Columnas Eliminadas en v3.0:**

1. **`BlockingScore`** → Se fusionó con `ConnectivityScore`
2. **`LatencyScore`** → Se fusionó con `ConnectivityScore`
3. **`IOPSScore`** → Se fusionó con `DiskSpaceScore`
4. **`QueryPerformanceScore`** → Métrica deshabilitada (ya no se recolecta)

---

## 🔧 **Archivos Modificados**

### **1. Backend - Service**
📁 **`SQLGuardObservatory.API/Services/HealthScoreService.cs`**

**Eliminado del SELECT SQL:**
```csharp
// ANTES (v2.0 - 150 puntos)
ConnectivityScore,
BlockingScore,          // ❌ ELIMINADO
MemoryScore,
AlwaysOnScore,
FullBackupScore,
LogBackupScore,
DiskSpaceScore,
IOPSScore,              // ❌ ELIMINADO
QueryPerformanceScore,  // ❌ ELIMINADO
CheckdbScore,
IndexOptimizeScore,
ErrorlogScore,

// DESPUÉS (v3.0 - 100 puntos)
ConnectivityScore,
MemoryScore,
AlwaysOnScore,
FullBackupScore,
LogBackupScore,
DiskSpaceScore,
CheckdbScore,
IndexOptimizeScore,
ErrorlogScore,
```

**Eliminado del mapeo C#:**
```csharp
// ANTES
ConnectivityScore = reader["ConnectivityScore"] != DBNull.Value ? Convert.ToInt32(reader["ConnectivityScore"]) : null,
BlockingScore = reader["BlockingScore"] != DBNull.Value ? Convert.ToInt32(reader["BlockingScore"]) : null,  // ❌
MemoryScore = reader["MemoryScore"] != DBNull.Value ? Convert.ToInt32(reader["MemoryScore"]) : null,
...

// DESPUÉS
ConnectivityScore = reader["ConnectivityScore"] != DBNull.Value ? Convert.ToInt32(reader["ConnectivityScore"]) : null,
MemoryScore = reader["MemoryScore"] != DBNull.Value ? Convert.ToInt32(reader["MemoryScore"]) : null,
...
```

---

### **2. Backend - DTO**
📁 **`SQLGuardObservatory.API/DTOs/HealthScoreDto.cs`**

**Eliminado del DTO:**
```csharp
// ANTES
public int? ConnectivityScore { get; set; }
public int? BlockingScore { get; set; }          // ❌ ELIMINADO
public int? MemoryScore { get; set; }
public int? AlwaysOnScore { get; set; }
public int? FullBackupScore { get; set; }
public int? LogBackupScore { get; set; }
public int? DiskSpaceScore { get; set; }
public int? IOPSScore { get; set; }              // ❌ ELIMINADO
public int? QueryPerformanceScore { get; set; }  // ❌ ELIMINADO
public int? CheckdbScore { get; set; }
public int? IndexOptimizeScore { get; set; }
public int? ErrorlogScore { get; set; }

// DESPUÉS
public int? ConnectivityScore { get; set; }
public int? MemoryScore { get; set; }
public int? AlwaysOnScore { get; set; }
public int? FullBackupScore { get; set; }
public int? LogBackupScore { get; set; }
public int? DiskSpaceScore { get; set; }
public int? CheckdbScore { get; set; }
public int? IndexOptimizeScore { get; set; }
public int? ErrorlogScore { get; set; }
```

---

### **3. SQL - Vista Actualizada**
📁 **`scripts/SQL/UpdateVista_100Puntos.sql`** *(nuevo)*

**Se recreó la vista `vw_InstanceHealth_Latest` sin las columnas obsoletas:**

```sql
SELECT 
    s.InstanceName,
    s.HealthScore,
    s.HealthStatus,
    s.Tier1_Availability,
    s.Tier2_Continuity,
    s.Tier3_Resources,
    s.Tier4_Maintenance,
    s.ConnectivityScore,
    s.MemoryScore,
    s.AlwaysOnScore,
    s.FullBackupScore,
    s.LogBackupScore,
    s.DiskSpaceScore,
    s.CheckdbScore,
    s.IndexOptimizeScore,
    s.ErrorlogScore,
    s.Ambiente,
    s.HostingSite,
    s.SqlVersion,
    s.CollectedAtUtc AS ScoreCollectedAt,
    ...
FROM LatestScores s
...
```

---

## 📝 **Pasos de Implementación**

### **Paso 1: Actualizar la Vista SQL**
Ejecuta el script en el servidor SQL:

```powershell
sqlcmd -S "SSMCS-05" -d SQLNova -i "scripts\SQL\UpdateVista_100Puntos.sql"
```

### **Paso 2: Recompilar Backend**
```powershell
cd SQLGuardObservatory.API
dotnet publish -c Release -o C:\Temp\Backend
```

### **Paso 3: Copiar archivos al servidor**
```powershell
xcopy /Y /E C:\Temp\Backend\* "\\SERVIDOR\Path\Backend\"
```

### **Paso 4: Reiniciar el servicio/IIS**
```powershell
iisreset
# O si es un servicio de Windows:
# Restart-Service -Name "NombreServicio"
```

---

## ✅ **Verificación**

### **SQL:**
Verifica que la vista solo tenga las columnas v3.0:

```sql
SELECT TOP 5
    InstanceName,
    HealthScore,
    ConnectivityScore,
    DiskSpaceScore,
    ScoreCollectedAt
FROM dbo.vw_InstanceHealth_Latest
ORDER BY ScoreCollectedAt DESC;
```

### **API:**
Verifica que el endpoint responda sin errores:

```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/healthscore/latest" | Select-Object -First 1
```

---

## 📊 **Mapeo de Columnas v2.0 → v3.0**

| **v2.0 (150 pts)**          | **v3.0 (100 pts)**              | **Acción**                    |
|-----------------------------|---------------------------------|-------------------------------|
| `ConnectivityScore`         | `ConnectivityScore`             | ✅ Mantenido (incluye latencia + blocking) |
| `LatencyScore`              | *(fusionado)*                   | ❌ Eliminado (fusionado con Connectivity) |
| `BlockingScore`             | *(fusionado)*                   | ❌ Eliminado (fusionado con Connectivity) |
| `MemoryScore`               | `MemoryScore`                   | ✅ Mantenido                  |
| `AlwaysOnScore`             | `AlwaysOnScore`                 | ✅ Mantenido                  |
| `FullBackupScore`           | `FullBackupScore`               | ✅ Mantenido                  |
| `LogBackupScore`            | `LogBackupScore`                | ✅ Mantenido                  |
| `DiskSpaceScore`            | `DiskSpaceScore`                | ✅ Mantenido (incluye IOPS)   |
| `IOPSScore`                 | *(fusionado)*                   | ❌ Eliminado (fusionado con DiskSpace) |
| `QueryPerformanceScore`     | *(deshabilitado)*               | ❌ Eliminado (métrica deshabilitada) |
| `CheckdbScore`              | `CheckdbScore`                  | ✅ Mantenido                  |
| `IndexOptimizeScore`        | `IndexOptimizeScore`            | ✅ Mantenido                  |
| `ErrorlogScore`             | `ErrorlogScore`                 | ✅ Mantenido                  |

---

## 🚀 **Sistema de Puntuación v3.0 (100 puntos)**

| **Tier**                | **Puntos** | **Componentes**                          |
|-------------------------|------------|------------------------------------------|
| **Tier 1: Disponibilidad** | **40**   | Conectividad (15), Memoria (10), AlwaysOn (15) |
| **Tier 2: Continuidad**    | **30**   | Full Backup (15), Log Backup (15)        |
| **Tier 3: Recursos**       | **20**   | Discos (20)                              |
| **Tier 4: Mantenimiento**  | **10**   | CHECKDB (4), Index Optimize (3), Errorlog (3) |
| **TOTAL**                  | **100**  |                                          |

---

## 📌 **Notas Importantes**

1. **Las columnas físicas** en la tabla `InstanceHealth_Score` todavía existen (para no perder datos históricos), pero:
   - La **vista** ya no las expone
   - El **backend** ya no las lee
   - El **frontend** ya no las espera

2. **Los datos viejos** (con 150 puntos) seguirán existiendo en la tabla, pero:
   - Los nuevos datos se guardan con el sistema de 100 puntos
   - La vista siempre devuelve el último dato por instancia

3. **No se necesita migración de datos** - los datos nuevos sobrescriben automáticamente a los viejos porque usamos `ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC)` en la vista.

---

## 🎯 **¡Listo!**

Con estos cambios, el backend está sincronizado con el sistema de **100 puntos (v3.0)** y el error `Invalid column name` ya no debería ocurrir.

