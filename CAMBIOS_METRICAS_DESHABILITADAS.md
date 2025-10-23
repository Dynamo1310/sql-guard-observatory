# Cambios: Métricas Deshabilitadas y Correcciones

## 📋 Resumen

Se deshabilitaron las siguientes métricas por request del usuario:
1. ✅ **Blocking** (sesiones bloqueadas)
2. ✅ **Queries Lentos** (slow queries)

Además, se corrigió:
3. ✅ **AlwaysOn Status** - Ahora consulta SQL Server correctamente cuando está habilitado

---

## 🔧 Cambios Realizados

### 1️⃣ Blocking Deshabilitado

**Archivo:** `scripts/RelevamientoHealthScore_Availability.ps1`

**Cambios:**
```powershell
# ANTES: Se recolectaba blocking
$blocking = Get-BlockingInfo -InstanceName $instanceName -TimeoutSec $TimeoutSec

# DESPUÉS: Se deshabilita (valores en 0)
# NOTA: Blocking deshabilitado por request del usuario
# $blocking = Get-BlockingInfo -InstanceName $instanceName -TimeoutSec $TimeoutSec
$blocking = @{ BlockingCount = 0; MaxBlockTimeSeconds = 0; BlockedSessions = @() }
```

**Impacto:**
- `BlockingCount` siempre será **0**
- No se ejecuta el query `sys.dm_exec_requests` para detectar bloqueos
- El script es más rápido (una query menos por instancia)

---

### 2️⃣ Queries Lentos Deshabilitado

**Archivo:** `scripts/RelevamientoHealthScore_Resources.ps1`

**Cambios:**
```powershell
# ANTES: Se recolectaban queries lentos
$queries = Get-SlowQueries -InstanceName $instanceName -TimeoutSec $TimeoutSec

# DESPUÉS: Se deshabilita (valores en 0)
# NOTA: Queries lentos deshabilitado por request del usuario
# $queries = Get-SlowQueries -InstanceName $instanceName -TimeoutSec $TimeoutSec
$queries = @{ SlowQueriesCount = 0; LongRunningCount = 0; TopQueries = @() }
```

**Impacto:**
- `SlowQueriesCount` siempre será **0**
- `LongRunningQueriesCount` siempre será **0**
- No se ejecuta el query `sys.dm_exec_requests` para detectar queries lentos
- El script es más rápido (una query menos por instancia)

---

### 3️⃣ AlwaysOn Status Corregido

**Archivo:** `scripts/RelevamientoHealthScore_Availability.ps1`

**Problema Anterior:**
```powershell
# ❌ INCORRECTO: Solo ponía "N/A (from API)" sin consultar SQL
$alwaysOn = if ($alwaysOnFromAPI) {
    @{
        Enabled = $true
        WorstState = "N/A (from API)"  # ❌ Siempre N/A
        Details = @()
    }
} else {
    Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
}
```

**Solución:**
```powershell
# ✅ CORRECTO: Si API dice "Enabled", consulta SQL para obtener estado real
$alwaysOn = if ($alwaysOnFromAPI) {
    # AlwaysOn está habilitado según API, obtener estado real de SQL
    Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
} else {
    # No está habilitado
    @{
        Enabled = $false
        WorstState = "N/A"
        Details = @()
    }
}
```

**Impacto:**
- Ahora muestra el estado **real** de AlwaysOn: `HEALTHY`, `WARNING`, `CRITICAL`
- Si la API dice `"AlwaysOn": "Enabled"`, el script consulta `sys.dm_hadr_availability_replica_states` para obtener el estado
- Si la API dice que no está habilitado, no consulta SQL (optimización)

---

## 📊 Impacto en Health Score (100 pts)

### Métricas Deshabilitadas

| Métrica | Puntaje | Nuevo Valor |
|---------|---------|-------------|
| **Blocking** | 10 pts | Siempre **10 pts** (porque siempre es 0) |
| **Queries Lentos** | 7 pts | Siempre **7 pts** (porque siempre es 0) |

**Resultado:** Estas 2 métricas ahora **siempre otorgan el puntaje máximo** porque los valores son 0.

### Distribución Real (Con Métricas Deshabilitadas)

**Tier 1: Disponibilidad (35 pts)**
- ~~Conectividad: 15 pts~~ ✅ Se recolecta
- ~~Blocking: 10 pts~~ ✅ **Siempre 10 pts**
- ~~Memoria (PLE): 10 pts~~ ✅ Se recolecta

**Tier 3: Performance & Recursos (25 pts)**
- ~~Disk Space: 10 pts~~ ✅ Se recolecta
- ~~IOPS: 8 pts~~ ✅ Se recolecta
- ~~Queries: 7 pts~~ ✅ **Siempre 7 pts**

**Total de pts "regalados":** 17 pts (10 + 7)

---

## ⚠️ Consideraciones

### 1. Health Scores Inflados

Como estas métricas siempre otorgan puntos máximos, los Health Scores serán **artificialmente más altos** (hasta +17 pts por instancia).

**Ejemplo:**
- Una instancia que antes tenía **75/100** ahora podría tener **92/100** solo por no restar puntos de blocking y queries

### 2. Ajuste de Umbrales (Opcional)

Si quieres compensar, podrías:
- **Opción A:** Ajustar umbrales:
  - Healthy: ≥95 (en lugar de ≥90)
  - Warning: 80-94 (en lugar de 70-89)
  - Critical: <80 (en lugar de <70)

- **Opción B:** Redistribuir esos 17 pts a otras métricas más importantes

### 3. Reactivar Métricas

Si en el futuro quieres reactivar estas métricas:

```powershell
# Simplemente descomentar estas líneas:

# En RelevamientoHealthScore_Availability.ps1:
$blocking = Get-BlockingInfo -InstanceName $instanceName -TimeoutSec $TimeoutSec

# En RelevamientoHealthScore_Resources.ps1:
$queries = Get-SlowQueries -InstanceName $instanceName -TimeoutSec $TimeoutSec
```

---

## ✅ Archivos Actualizados

1. **`scripts/RelevamientoHealthScore_Availability.ps1`**
   - Blocking deshabilitado
   - AlwaysOn status corregido
   - Resumen actualizado (sin línea de blocking)

2. **`scripts/RelevamientoHealthScore_Resources.ps1`**
   - Queries lentos deshabilitado
   - Resumen actualizado (sin línea de queries lentos)

---

## 🔍 Problema Pendiente: Discos No Se Muestran

**Problema reportado:** El frontend NO muestra el estado de los discos en el detalle de cada instancia.

**Diagnóstico:**
- ✅ Frontend está preparado: `src/pages/HealthScore.tsx` línea 820-860
- ✅ Backend está leyendo: `HealthScoreService.cs` línea 144-147
- ✅ Vista SQL incluye el campo: `vw_InstanceHealth_Latest` incluye `DiskWorstFreePct`
- ❓ **Posible causa:** Los datos de `InstanceHealth_Critical_Resources` están vacíos

**Verificación necesaria:**
```sql
-- Verificar si hay datos de discos
SELECT TOP 10
    InstanceName,
    DiskWorstFreePct,
    CollectedAtUtc
FROM dbo.InstanceHealth_Critical_Resources
ORDER BY CollectedAtUtc DESC;

-- Verificar en la vista
SELECT TOP 10
    InstanceName,
    DiskWorstFreePct,
    HealthScore
FROM dbo.vw_InstanceHealth_Latest
WHERE DiskWorstFreePct IS NOT NULL
ORDER BY HealthScore DESC;
```

**Solución:** Ejecutar el script de Resources para poblar los datos:
```powershell
.\scripts\RelevamientoHealthScore_Resources.ps1
```

---

**Fecha:** Octubre 2025  
**Versión:** v3.0  
**Autor:** SQL Guard Observatory Team

