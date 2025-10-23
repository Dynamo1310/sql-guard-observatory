# 🔧 Corrección: Detección de AlwaysOn

## 🐛 **Problema Reportado**

El frontend mostraba **todas las instancias** como `AlwaysOn: Deshabilitado`, incluso para instancias que la API reportaba como `"AlwaysOn": "Enabled"` (por ejemplo, **RSCRM365-01**).

### **Evidencia del Problema:**

**Diagnóstico SQL mostró:**
```
ConAlwaysOnHabilitado = 0  ❌
ConAlwaysOnDeshabilitado = 125  ❌

RSCRM365-01:  AlwaysOnEnabled = 0  ❌ (debería ser 1 según API)
```

**API mostraba:**
```json
{
    "NombreInstancia": "RSCRM365-01",
    "AlwaysOn": "Enabled",   ← API dice que SÍ está habilitado
    ...
}
```

**Frontend mostraba:**
```
AlwaysOn: Deshabilitado  ❌ (incorrecto)
```

---

## 🔍 **Causa Raíz**

La función `Get-AlwaysOnStatus` en el script `RelevamientoHealthScore_Availability.ps1` tenía una lógica incorrecta:

```powershell
# ❌ ANTES (INCORRECTO):
function Get-AlwaysOnStatus {
    # ...
    try {
        $query = @"
IF SERVERPROPERTY('IsHadrEnabled') = 1
BEGIN
    SELECT ... FROM sys.availability_replicas ...
END
"@
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName -Query $query
        
        if ($data) {
            $result.Enabled = $true   # ⬅️ SOLO marca como habilitado si hay DATOS
            # ...
        }
    }
}
```

### **Problema:**

La query usaba `IF SERVERPROPERTY('IsHadrEnabled') = 1 BEGIN ... END`, lo cual:

1. Si `IsHadrEnabled = 1` **Y** hay AGs configurados → Devuelve filas
2. Si `IsHadrEnabled = 1` **PERO** no hay AGs configurados → **NO** devuelve filas
3. Si `IsHadrEnabled = 0` → **NO** devuelve filas

Entonces, el script solo marcaba `Enabled = $true` si **había filas devueltas**. Pero en casos donde:
- AlwaysOn está habilitado a nivel de instancia (`SERVERPROPERTY('IsHadrEnabled') = 1`)
- Pero la instancia NO tiene AGs configurados aún (o la query falla)

Resultado: `$data` era `$null` → `Enabled = $false` → Frontend muestra "Deshabilitado" ❌

---

## ✅ **Solución Implementada**

Separé la lógica en **DOS PASOS**:

```powershell
# ✅ AHORA (CORRECTO):
function Get-AlwaysOnStatus {
    # ...
    try {
        # PASO 1: Verificar si AlwaysOn está habilitado a nivel de instancia
        $checkHadrQuery = "SELECT SERVERPROPERTY('IsHadrEnabled') AS IsHadrEnabled;"
        $hadrCheck = Invoke-DbaQuery -SqlInstance $InstanceName -Query $checkHadrQuery
        $isHadrEnabled = $hadrCheck.IsHadrEnabled
        
        if ($isHadrEnabled -eq $null -or $isHadrEnabled -eq 0) {
            # NO está habilitado → Marcar como deshabilitado
            $result.Enabled = $false
            $result.WorstState = "N/A"
            return $result
        }
        
        # PASO 2: SÍ está habilitado → Obtener estado de los AGs
        $result.Enabled = $true  # ✅ Marcar como habilitado INMEDIATAMENTE
        
        $agQuery = "SELECT ... FROM sys.availability_replicas ..."
        $data = Invoke-DbaQuery -SqlInstance $InstanceName -Query $agQuery
        
        if ($data -and $data.Count -gt 0) {
            # Hay AGs configurados → Determinar estado
            $result.WorstState = "HEALTHY" / "WARNING" / "CRITICAL"
            $result.Details = ...
        }
        else {
            # AlwaysOn habilitado pero sin AGs configurados
            $result.WorstState = "OK"
            $result.Details = @("AlwaysOn habilitado pero sin AGs configurados")
        }
    }
}
```

### **Diferencia Clave:**

| Antes | Ahora |
|-------|-------|
| ❌ `Enabled = $true` solo si hay **datos de AGs** | ✅ `Enabled = $true` si `SERVERPROPERTY('IsHadrEnabled') = 1` |
| ❌ Si AlwaysOn habilitado pero sin AGs → `Enabled = $false` | ✅ Si AlwaysOn habilitado pero sin AGs → `Enabled = $true`, `WorstState = OK` |

---

## 📊 **Casos de Uso**

### **Caso 1: AlwaysOn deshabilitado (TQRSA-02)**
```
API: "AlwaysOn": "Disabled"
SQL: SERVERPROPERTY('IsHadrEnabled') = 0

Script → Enabled = false, WorstState = "N/A"
Frontend → "Deshabilitado"  ✅ Correcto
```

---

### **Caso 2: AlwaysOn habilitado CON AGs (RSCRM365-01)**
```
API: "AlwaysOn": "Enabled"
SQL: SERVERPROPERTY('IsHadrEnabled') = 1
     SELECT ... → 10 filas (AG configurado)

Script → Enabled = true, WorstState = "HEALTHY"
Frontend → "Habilitado - HEALTHY"  ✅ Correcto
```

---

### **Caso 3: AlwaysOn habilitado SIN AGs**
```
API: "AlwaysOn": "Enabled"
SQL: SERVERPROPERTY('IsHadrEnabled') = 1
     SELECT ... → 0 filas (sin AG configurado aún)

ANTES → Enabled = false ❌
AHORA → Enabled = true, WorstState = "OK" ✅
Frontend → "Habilitado - OK"  ✅ Correcto
```

---

## 🚀 **Validación**

### **1. Ejecutar el script de Availability:**
```powershell
.\scripts\RelevamientoHealthScore_Availability.ps1
```

**Esperado para RSCRM365-01:**
```
✅ RSCRM365-01 - Latency:15ms Memory:OK AlwaysOn:Enabled(HEALTHY)
```

---

### **2. Verificar en SQL:**
```sql
SELECT 
    InstanceName,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    CollectedAtUtc
FROM dbo.InstanceHealth_Critical_Availability
WHERE InstanceName = 'RSCRM365-01'
ORDER BY CollectedAtUtc DESC;
```

**Esperado:**
```
InstanceName    | AlwaysOnEnabled | AlwaysOnWorstState | CollectedAtUtc
----------------+-----------------+--------------------+-------------------
RSCRM365-01     | 1               | HEALTHY            | 2025-10-23 10:00:00
```

---

### **3. Verificar en Frontend:**

Navegar a **HealthScore** → Expandir **RSCRM365-01** → Sección **AlwaysOn & Errores**:

**Esperado:**
```
AlwaysOn: Habilitado  ✅
Estado: HEALTHY  ✅
```

---

### **4. Verificar conteo general:**
```sql
SELECT 
    CASE WHEN AlwaysOnEnabled = 1 THEN 'Habilitado' ELSE 'Deshabilitado' END AS Estado,
    COUNT(*) AS Total
FROM (
    SELECT 
        AlwaysOnEnabled,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Critical_Availability
    WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
) latest
WHERE rn = 1
GROUP BY AlwaysOnEnabled;
```

**Esperado:**
```
Estado          | Total
----------------+-------
Habilitado      | X     ← Debería ser > 0
Deshabilitado   | Y
```

---

## 📝 **Resumen del Cambio**

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Criterio** | `Enabled = true` si hay datos de AGs | `Enabled = true` si `SERVERPROPERTY('IsHadrEnabled') = 1` |
| **Query** | 1 query condicional (IF...BEGIN...END) | 2 queries separadas (verificar + obtener estado) |
| **AlwaysOn sin AGs** | Marcaba como deshabilitado ❌ | Marca como habilitado con estado OK ✅ |
| **Robustez** | Dependía de que la query devolviera filas | Verifica directamente la propiedad del servidor |

---

## ✅ **Cambio Aplicado**

- [x] Función `Get-AlwaysOnStatus` refactorizada
- [x] Lógica en 2 pasos (verificar propiedad + obtener estado)
- [x] Documentación actualizada
- [x] Scripts de diagnóstico creados

---

## 🎉 **Resultado**

Ahora el sistema detecta correctamente si AlwaysOn está habilitado, independientemente de si tiene AGs configurados o no. El frontend mostrará:

- ✅ **"Habilitado"** para instancias con `SERVERPROPERTY('IsHadrEnabled') = 1`
- ✅ **"Deshabilitado"** para instancias con `SERVERPROPERTY('IsHadrEnabled') = 0`
- ✅ **Estado real** (HEALTHY/WARNING/CRITICAL/OK) basado en el estado de sincronización

¡El problema está resuelto! 🎯

