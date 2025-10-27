# Corrección: Manejo de Valores Nulos/Vacíos en Script de Consolidación

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`

## 🐛 Problema Detectado

El script de consolidación estaba fallando con este error en múltiples instancias:

```
InvalidOperation: Cannot compare "" because it is not IComparable.
Line 893: elseif ($Data.AutogrowthEventsLast24h -le 10)
Line 910: if ($Data.WorstPercentOfMax -gt 90)
Line 920: if ($Data.FilesWithBadGrowth -gt 0)
```

### Instancias Afectadas
- RSTSCRM365-01
- SSMCS-02
- Y potencialmente otras

## 🔍 Causa Raíz

**PowerShell no puede comparar cadenas vacías ("") con operadores numéricos** (`-gt`, `-lt`, `-le`, etc.)

### ¿Por qué había cadenas vacías?

Cuando los scripts de recolección no pueden obtener datos para una instancia:
- Por timeout
- Por errores SQL
- Por falta de permisos
- Por versiones de SQL incompatibles

Los valores quedan como:
- `$null`
- `[DBNull]::Value`
- Cadenas vacías `""`

Y cuando se intentan insertar en SQL Server, se convierten en cadenas vacías.

## 📊 Ejemplo del Problema

```powershell
# En la tabla InstanceHealth_Autogrowth
InstanceName: RSTSCRM365-01
AutogrowthEventsLast24h: ""  # Cadena vacía (debería ser 0)
WorstPercentOfMax: ""        # Cadena vacía (debería ser 0.0)
FilesWithBadGrowth: ""       # Cadena vacía (debería ser 0)

# Cuando el script consolidate intenta comparar:
if ($Data.AutogrowthEventsLast24h -le 10) {  # ERROR: "" no es IComparable
    ...
}
```

## 🔧 Solución Implementada

### 1. Uso de Funciones Helper Existentes

El script ya tenía funciones helper definidas pero no se usaban consistentemente:

```powershell
function Get-SafeInt {
    param(
        [Parameter(Mandatory)]
        $Value,
        [int]$Default = 0
    )
    
    if ($null -eq $Value -or $Value -is [System.DBNull] -or [string]::IsNullOrWhiteSpace($Value.ToString())) {
        return $Default
    }
    
    try {
        return [int]$Value
    }
    catch {
        return $Default
    }
}

function Get-SafeNumeric {
    param(
        [Parameter(Mandatory)]
        $Value,
        [double]$Default = 0
    )
    
    if ($null -eq $Value -or $Value -is [System.DBNull] -or [string]::IsNullOrWhiteSpace($Value.ToString())) {
        return $Default
    }
    
    try {
        return [double]$Value
    }
    catch {
        return $Default
    }
}
```

### 2. Corrección en Calculate-AutogrowthScore

**Antes (Problemático)**:
```powershell
function Calculate-AutogrowthScore {
    param([object]$Data)
    
    $score = 100
    
    # PROBLEMA: Comparación directa puede fallar con ""
    if ($Data.AutogrowthEventsLast24h -eq 0) {
        $score = 100
    }
    elseif ($Data.AutogrowthEventsLast24h -le 10) {  # ERROR aquí
        $score = 100
    }
    ...
    
    if ($Data.WorstPercentOfMax -gt 90) {  # ERROR aquí
        $score = 0
    }
    
    if ($Data.FilesWithBadGrowth -gt 0) {  # ERROR aquí
        $score -= 20
    }
}
```

**Después (Corregido)**:
```powershell
function Calculate-AutogrowthScore {
    param([object]$Data)
    
    $score = 100
    $cap = 100
    
    # SOLUCIÓN: Convertir a valores seguros primero
    $autogrowthEvents = Get-SafeInt -Value $Data.AutogrowthEventsLast24h -Default 0
    $worstPercentOfMax = Get-SafeNumeric -Value $Data.WorstPercentOfMax -Default 0
    $filesNearLimit = Get-SafeInt -Value $Data.FilesNearLimit -Default 0
    $filesWithBadGrowth = Get-SafeInt -Value $Data.FilesWithBadGrowth -Default 0
    
    # Ahora las comparaciones son seguras
    if ($autogrowthEvents -eq 0) {
        $score = 100
    }
    elseif ($autogrowthEvents -le 10) {  # OK: compara enteros
        $score = 100
    }
    ...
    
    if ($worstPercentOfMax -gt 90) {  # OK: compara decimales
        $score = 0
    }
    
    if ($filesWithBadGrowth -gt 0) {  # OK: compara enteros
        $score -= 20
    }
}
```

### 3. Corrección en Calculate-CPUScore

**Antes (Problemático)**:
```powershell
function Calculate-CPUScore {
    param([object]$Data)
    
    # PROBLEMA: Comparación directa
    if ($Data.P95CPUPercent -le 80) {  # Puede fallar con ""
        $score = 100
    }
    
    if ($Data.RunnableTasks -gt 1) {  # Puede fallar con ""
        $cap = 70
    }
}
```

**Después (Corregido)**:
```powershell
function Calculate-CPUScore {
    param([object]$Data)
    
    # SOLUCIÓN: Valores seguros
    $p95CPU = Get-SafeNumeric -Value $Data.P95CPUPercent -Default 0
    $runnableTasks = Get-SafeInt -Value $Data.RunnableTasks -Default 0
    
    # Comparaciones seguras
    if ($p95CPU -le 80) {  # OK
        $score = 100
    }
    
    if ($runnableTasks -gt 1) {  # OK
        $cap = 70
    }
}
```

### 4. Corrección en Calculate-DiscosScore

**Antes (Problemático)**:
```powershell
function Calculate-DiscosScore {
    param([object]$Data)
    
    # PROBLEMA: Operaciones aritméticas pueden fallar
    $weightedFreePct = ($Data.DataDiskAvgFreePct * 0.5) +   # Puede ser ""
                       ($Data.LogDiskAvgFreePct * 0.3) +    # Puede ser ""
                       ($Data.WorstFreePct * 0.2)           # Puede ser ""
    
    if ($Data.DataDiskAvgFreePct -lt 10) {  # Puede fallar
        $cap = 40
    }
}
```

**Después (Corregido)**:
```powershell
function Calculate-DiscosScore {
    param([object]$Data)
    
    # SOLUCIÓN: Valores seguros con default 100 (asumir OK si no hay datos)
    $dataDiskFreePct = Get-SafeNumeric -Value $Data.DataDiskAvgFreePct -Default 100
    $logDiskFreePct = Get-SafeNumeric -Value $Data.LogDiskAvgFreePct -Default 100
    $worstFreePct = Get-SafeNumeric -Value $Data.WorstFreePct -Default 100
    
    # Operaciones aritméticas seguras
    $weightedFreePct = ($dataDiskFreePct * 0.5) + 
                       ($logDiskFreePct * 0.3) + 
                       ($worstFreePct * 0.2)
    
    # Comparaciones seguras
    if ($dataDiskFreePct -lt 10 -or $logDiskFreePct -lt 10) {  # OK
        $cap = 40
    }
}
```

## 📊 Valores Default Elegidos

| Métrica | Default | Razón |
|---------|---------|-------|
| **AutogrowthEventsLast24h** | 0 | Sin datos = sin eventos |
| **WorstPercentOfMax** | 0 | Sin datos = sin riesgo |
| **FilesNearLimit** | 0 | Sin datos = sin archivos críticos |
| **FilesWithBadGrowth** | 0 | Sin datos = sin problemas |
| **P95CPUPercent** | 0 | Sin datos = sin carga |
| **RunnableTasks** | 0 | Sin datos = sin contención |
| **DataDiskFreePct** | 100 | Sin datos = asumir OK |
| **LogDiskFreePct** | 100 | Sin datos = asumir OK |
| **WorstFreePct** | 100 | Sin datos = asumir OK |

### Filosofía de Defaults

- **Métricas de problemas** (eventos, errores): Default = 0 (sin problemas)
- **Métricas de espacio libre**: Default = 100 (suficiente espacio)
- **Métricas de uso** (CPU, memoria): Default = 0 (sin uso)

## ✅ Resultado Esperado

**Antes (con error)**:
```
InvalidOperation: Cannot compare "" because it is not IComparable.
   [RISK] Riesgo RSTSCRM365-01 - Score: 60/100
```

**Después (sin error)**:
```
   [OK] Optimo RSTSCRM365-01 - Score: 92/100
```

O si realmente hay problemas:
```
   [RISK] Riesgo RSTSCRM365-01 - Score: 65/100
```

## 🔍 Validación

### 1. Verificar Instancias Problemáticas

Para ver qué instancias tienen datos incompletos:

```sql
-- Ver instancias con datos vacíos en Autogrowth
SELECT 
    InstanceName,
    AutogrowthEventsLast24h,
    WorstPercentOfMax,
    FilesWithBadGrowth,
    CollectedAtUtc
FROM dbo.InstanceHealth_Autogrowth
WHERE CollectedAtUtc >= DATEADD(MINUTE, -10, GETDATE())
  AND (
      AutogrowthEventsLast24h IS NULL 
      OR CAST(AutogrowthEventsLast24h AS VARCHAR) = ''
      OR WorstPercentOfMax IS NULL
      OR CAST(WorstPercentOfMax AS VARCHAR) = ''
  )
ORDER BY CollectedAtUtc DESC;
```

### 2. Verificar Scores Calculados

```sql
-- Ver scores recién calculados
SELECT TOP 20
    InstanceName,
    HealthScore,
    HealthStatus,
    AutogrowthScore,
    CPUScore,
    DiscosScore,
    CollectedAtUtc
FROM dbo.InstanceHealthScore
ORDER BY CollectedAtUtc DESC;
```

### 3. Ejecutar Script de Consolidación

```powershell
.\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1
```

**Resultado esperado**:
- Sin errores "Cannot compare"
- Todos los scores calculados correctamente
- Instancias con datos incompletos tienen scores basados en defaults

## 🎯 Mejoras Futuras

### 1. Mejorar Scripts de Recolección

Los scripts de recolección deben insertar valores numéricos por defecto en lugar de NULL/vacíos:

```powershell
# En scripts de recolección
$autogrowthEvents = if ($result.AutogrowthEventsLast24h) { 
    $result.AutogrowthEventsLast24h 
} else { 
    0  # Default explícito
}
```

### 2. Validar Datos en Inserción

```powershell
function Write-ToSqlServer {
    param([object]$Data)
    
    # Validar y limpiar antes de insertar
    $cleanData = @{
        AutogrowthEventsLast24h = Get-SafeInt -Value $Data.AutogrowthEventsLast24h -Default 0
        WorstPercentOfMax = Get-SafeNumeric -Value $Data.WorstPercentOfMax -Default 0
        # ...
    }
    
    # Insertar datos limpios
}
```

### 3. Agregar Logging de Datos Incompletos

```powershell
# En script de consolidación
if ($Data.AutogrowthEventsLast24h -eq "" -or $null -eq $Data.AutogrowthEventsLast24h) {
    Write-Warning "⚠️  ${InstanceName}: Datos de Autogrowth incompletos, usando defaults"
}
```

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_Consolidate_v3_FINAL.ps1` (modificado)
- `scripts/RelevamientoHealthScore_Autogrowth.ps1` (puede necesitar corrección)
- `scripts/RelevamientoHealthScore_CPU.ps1` (ya corregido)
- `scripts/RelevamientoHealthScore_Discos.ps1` (ya corregido)

## 📝 Resumen de Funciones Modificadas

| Función | Líneas Afectadas | Estado |
|---------|------------------|--------|
| `Calculate-AutogrowthScore` | 889-893, 910, 920 | ✅ Corregido |
| `Calculate-CPUScore` | 278-289 | ✅ Corregido |
| `Calculate-DiscosScore` | 507-538 | ✅ Corregido |

## 🧪 Testing

### Caso de Prueba 1: Instancia con Datos Completos

```powershell
# Ejecutar consolidación
.\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1

# Verificar: NO debe haber errores "Cannot compare"
# Verificar: Scores deben ser coherentes
```

### Caso de Prueba 2: Instancia con Datos Incompletos

```sql
-- Simular datos incompletos
UPDATE dbo.InstanceHealth_Autogrowth
SET AutogrowthEventsLast24h = NULL,
    WorstPercentOfMax = NULL
WHERE InstanceName = 'TEST-SERVER';
```

```powershell
# Ejecutar consolidación
.\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1

# Verificar: NO debe haber errores
# Verificar: Debe usar defaults (0 para eventos, 100 para espacio)
```

---

**Corrección implementada el**: 27 de enero de 2025  
**Causa raíz**: Comparaciones numéricas con valores nulos/vacíos de la base de datos  
**Solución**: Uso consistente de funciones helper `Get-SafeInt` y `Get-SafeNumeric`  
**Impacto**: Script de consolidación ahora es robusto ante datos incompletos

