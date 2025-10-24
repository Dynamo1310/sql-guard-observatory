# Corrección de Metadata y Estado de AlwaysOn en HealthScore

**Fecha:** 24/10/2024  
**Problemas Corregidos:**
1. ❌ No se mostraban Versión, Ambiente y Hosting en el frontend
2. ❌ La fecha de última actualización no se mostraba en UTC-3
3. ❌ El estado de AlwaysOn aparecía como "N/A" incluso cuando estaba habilitado

---

## 📋 Resumen de Cambios

### 1. Backend - HealthScoreService.cs

**Problema:** La query no incluía las columnas `Ambiente`, `HostingSite` y `SqlVersion` aunque la vista `vw_InstanceHealth_Latest` sí las tiene.

**Solución:** Se actualizó la query para incluir estas columnas:

```csharp
SELECT 
    -- Score y Status
    InstanceName,
    HealthScore,
    HealthStatus,
    ScoreCollectedAt,
    
    -- Metadata de instancia ✅ AGREGADO
    Ambiente,
    HostingSite,
    SqlVersion,
    
    -- ... resto de columnas ...
FROM dbo.vw_InstanceHealth_Latest
```

**Mapeo al DTO:**
```csharp
var dto = new HealthScoreDto
{
    InstanceName = reader["InstanceName"].ToString(),
    Ambiente = reader["Ambiente"]?.ToString(),       // ✅ AGREGADO
    HostingSite = reader["HostingSite"]?.ToString(), // ✅ AGREGADO
    Version = reader["SqlVersion"]?.ToString(),      // ✅ AGREGADO
    // ... resto de propiedades ...
};
```

**Archivo modificado:**
- `SQLGuardObservatory.API/Services/HealthScoreService.cs`

---

### 2. Frontend - Formateo de Fechas en UTC-3

**Problema:** Las fechas se mostraban en la zona horaria local del navegador, no en UTC-3 (Argentina).

**Solución:** Se creó una función utilitaria para formatear fechas en UTC-3:

```typescript
/**
 * Formatea una fecha UTC a la zona horaria de Argentina (UTC-3)
 */
export function formatDateUTC3(dateString: string | Date | null | undefined, includeTime: boolean = true): string {
  if (!dateString) return 'N/A';
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';
  
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(includeTime && {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  };
  
  return new Intl.DateTimeFormat('es-AR', options).format(date);
}
```

**Uso en el frontend:**
```typescript
// Antes:
{new Date(score.generatedAtUtc).toLocaleString('es-AR')}

// Después:
{formatDateUTC3(score.generatedAtUtc)}
```

**Archivos modificados:**
- `src/lib/utils.ts` (función creada)
- `src/pages/HealthScore.tsx` (se usa la función en múltiples lugares)

---

### 3. Script PowerShell - Detección de Estado de AlwaysOn

**Problema:** Cuando AlwaysOn estaba habilitado pero ocurría un error al consultar el estado de los AGs, el campo `AlwaysOnWorstState` quedaba como "N/A".

**Solución:** Se agregó un bloque `try-catch` interno para manejar errores al consultar el estado de AGs:

**ANTES:**
```powershell
# PASO 2: AlwaysOn SÍ está habilitado, obtener estado de los AGs
$result.Enabled = $true

$agQuery = @"...query..."@

$data = Invoke-DbaQuery -SqlInstance $InstanceName ...

if ($data -and $data.Count -gt 0) {
    # Determinar estado...
}
else {
    $result.WorstState = "OK"
}

} catch {
    # Si falla, asumimos que no tiene AlwaysOn
}
```

**DESPUÉS:**
```powershell
# PASO 2: AlwaysOn SÍ está habilitado, obtener estado de los AGs
$result.Enabled = $true

try {
    $agQuery = @"...query..."@
    
    $data = Invoke-DbaQuery -SqlInstance $InstanceName ...
    
    if ($data -and $data.Count -gt 0) {
        # Determinar peor estado
        $states = $data | Select-Object -ExpandProperty SyncHealth -Unique
        if ($states -contains "NOT_HEALTHY") {
            $result.WorstState = "CRITICAL"
        }
        elseif ($states -contains "PARTIALLY_HEALTHY") {
            $result.WorstState = "WARNING"
        }
        else {
            $result.WorstState = "HEALTHY"
        }
    }
    else {
        # AlwaysOn habilitado pero sin AGs
        $result.WorstState = "OK"
    }
}
catch {
    # ✅ NUEVO: Error al consultar AGs, pero AlwaysOn está habilitado
    $result.WorstState = "OK"
    $result.Details = @("AlwaysOn habilitado - no se pudo consultar estado de AGs")
    Write-Warning "Error obteniendo estado de AGs en ${InstanceName}: $($_.Exception.Message)"
}

} catch {
    # Error al verificar si AlwaysOn está habilitado
}
```

**Archivo modificado:**
- `scripts/RelevamientoHealthScore_Availability.ps1`

---

### 4. Frontend - Visualización Mejorada de Estados de AlwaysOn

**Problema:** El badge de estado de AlwaysOn solo distinguía entre 'OK' y otros estados.

**Solución:** Se mejoró la lógica para manejar todos los estados posibles:

```typescript
<Badge 
  variant={
    score.alwaysOnSummary.worstState === 'OK' || score.alwaysOnSummary.worstState === 'HEALTHY' ? 'outline' : 
    score.alwaysOnSummary.worstState === 'WARNING' || score.alwaysOnSummary.worstState === 'PARTIALLY_HEALTHY' ? 'default' :
    'destructive'
  } 
  className={cn(
    'text-xs',
    (score.alwaysOnSummary.worstState === 'OK' || score.alwaysOnSummary.worstState === 'HEALTHY') && 'border-green-500 text-green-700',
    (score.alwaysOnSummary.worstState === 'WARNING' || score.alwaysOnSummary.worstState === 'PARTIALLY_HEALTHY') && 'border-yellow-500 text-yellow-700 bg-yellow-50'
  )}
>
  {score.alwaysOnSummary.worstState}
</Badge>
```

**Estados soportados:**
- ✅ `OK` / `HEALTHY` → Verde (outline)
- ⚠️ `WARNING` / `PARTIALLY_HEALTHY` → Amarillo
- 🔴 `CRITICAL` / `NOT_HEALTHY` → Rojo (destructive)
- ℹ️ `N/A` → Gris (cuando AlwaysOn está deshabilitado)

**Archivo modificado:**
- `src/pages/HealthScore.tsx`

---

## 🗂️ Script SQL para Verificar la Vista

Se creó un script SQL para verificar y actualizar la vista si es necesario:

**Archivo:** `scripts/SQL/UpdateVista_AgregarMetadata.sql`

Este script:
1. ✅ Verifica si la vista `vw_InstanceHealth_Latest` existe
2. ✅ Verifica si tiene las columnas `Ambiente`, `HostingSite` y `SqlVersion`
3. ✅ Si falta alguna columna, recrea la vista con todas las columnas necesarias
4. ✅ Muestra datos de ejemplo para verificar que funciona

---

## 📦 Archivos Modificados

### Backend (.NET)
- `SQLGuardObservatory.API/Services/HealthScoreService.cs`

### Frontend (React/TypeScript)
- `src/lib/utils.ts`
- `src/pages/HealthScore.tsx`

### Scripts PowerShell
- `scripts/RelevamientoHealthScore_Availability.ps1`

### Scripts SQL
- `scripts/SQL/UpdateVista_AgregarMetadata.sql` (nuevo)

---

## 🚀 Despliegue

### 1. Backend
```powershell
cd SQLGuardObservatory.API
dotnet build --configuration Release
dotnet publish --configuration Release --output ./publish

# Copiar a IIS
Copy-Item -Path ./publish/* -Destination "C:\inetpub\wwwroot\InventoryDBA" -Recurse -Force

# Reiniciar IIS
iisreset
```

### 2. Frontend
```powershell
npm run build

# Copiar a IIS
Copy-Item -Path ./dist/* -Destination "C:\inetpub\wwwroot\InventoryDBAFrontend" -Recurse -Force
```

### 3. SQL Server
```powershell
# Ejecutar script de verificación/actualización de vista
sqlcmd -S SSPR17MON-01 -d SQLNova -E -i "scripts\SQL\UpdateVista_AgregarMetadata.sql"
```

### 4. Scripts de Recolección
```powershell
# No es necesario reiniciar, los cambios se aplican en la próxima ejecución
# El script de Availability se ejecuta cada 1-2 minutos automáticamente
```

---

## ✅ Verificación

Después del despliegue, verificar:

1. **Metadata visible:**
   - ✅ Versión de SQL Server se muestra (ej: "Microsoft SQL Server 2019")
   - ✅ Ambiente se muestra (ej: "Testing", "Producción")
   - ✅ Hosting se muestra (ej: "Onpremise", "AWS")

2. **Fechas en UTC-3:**
   - ✅ Última actualización se muestra en formato: dd/MM/yyyy, HH:mm:ss
   - ✅ Fechas de backups en formato correcto (UTC-3)

3. **Estado de AlwaysOn:**
   - ✅ Si AlwaysOn está habilitado, muestra estado (OK, HEALTHY, WARNING, CRITICAL)
   - ✅ Si AlwaysOn está deshabilitado, muestra "N/A"
   - ✅ Los colores son correctos según el estado

---

## 📝 Notas Importantes

1. **La vista SQL ya existía con las columnas correctas** (`UpdateVista_AgregarDiskDetails.sql`), solo faltaba incluirlas en la query del backend.

2. **Los estados de AlwaysOn posibles:**
   - `OK` → AlwaysOn habilitado pero sin AGs configurados o no se pudo consultar estado
   - `HEALTHY` → Todos los AGs en estado saludable
   - `WARNING` / `PARTIALLY_HEALTHY` → Algunos AGs con problemas
   - `CRITICAL` / `NOT_HEALTHY` → AGs en estado crítico
   - `N/A` → AlwaysOn no está habilitado

3. **Zona horaria:** Se usa `America/Argentina/Buenos_Aires` que maneja automáticamente el horario de verano si aplica.

---

## 🔄 Próximos Pasos

1. Ejecutar el script de Availability manualmente para verificar que los cambios funcionan
2. Monitorear los logs durante 5-10 minutos para verificar que no hay errores
3. Refrescar el frontend y verificar que se muestran correctamente los datos
4. Validar con instancias que tienen AlwaysOn habilitado

---

**Resultado Esperado:**

Todas las instancias ahora deberían mostrar:
- ✅ Versión de SQL Server
- ✅ Ambiente y Hosting  
- ✅ Fecha de actualización en UTC-3
- ✅ Estado de AlwaysOn correcto (no más "N/A" cuando está habilitado)


