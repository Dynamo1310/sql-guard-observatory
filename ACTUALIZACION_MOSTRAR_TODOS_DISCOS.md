# 🔧 Actualización: Mostrar Todos los Discos

## 📋 **Resumen**

Se actualizó el sistema para mostrar **TODOS los discos** de cada instancia en el frontend, no solo el peor disco.

---

## 🎯 **Archivos Modificados**

### **1. PowerShell - Formato de DiskDetails**
📁 **`scripts/RelevamientoHealthScore_Resources.ps1`**

**Cambio:** Actualizado el formato de `DiskDetails` para incluir TotalGB, FreeGB y FreePct.

**Antes:**
```powershell
$result.Details = $data | ForEach-Object {
    "$($_.Drive):$($_.FreePct)%"
}
# Formato: C:\:75%,D:\:90%
```

**Después:**
```powershell
$result.Details = $data | ForEach-Object {
    # Formato: C:\|500.5|125.2|25
    "$($_.Drive)|$([Math]::Round($_.TotalGB, 2))|$([Math]::Round($_.FreeGB, 2))|$($_.FreePct)"
}
# Formato: C:\|500.5|125.2|25,D:\|1000|750|75
```

---

### **2. Backend - Parser de DiskDetails**
📁 **`SQLGuardObservatory.API/Services/HealthScoreService.cs`**

**Cambio 1:** Actualizado el mapeo de `DiskSummary` para incluir volúmenes.

```csharp
// Discos
DiskSummary = new DiskSummary
{
    WorstFreePct = reader["DiskWorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["DiskWorstFreePct"]) : 100,
    Volumes = ParseDiskDetails(reader["DiskDetails"]?.ToString())  // ✅ NUEVO
},
```

**Cambio 2:** Nueva función `ParseDiskDetails`.

```csharp
private static List<VolumeInfo>? ParseDiskDetails(string? diskDetails)
{
    if (string.IsNullOrWhiteSpace(diskDetails))
        return null;

    try
    {
        // Formato: C:\|500.5|125.2|25,D:\|1000|750|75
        var volumes = new List<VolumeInfo>();
        var diskEntries = diskDetails.Split(',', StringSplitOptions.RemoveEmptyEntries);

        foreach (var entry in diskEntries)
        {
            var parts = entry.Split('|', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 4)
            {
                volumes.Add(new VolumeInfo
                {
                    Drive = parts[0].Trim(),
                    TotalGB = decimal.TryParse(parts[1], out var total) ? total : 0,
                    FreeGB = decimal.TryParse(parts[2], out var free) ? free : 0,
                    FreePct = decimal.TryParse(parts[3], out var pct) ? pct : 0
                });
            }
        }

        return volumes.Count > 0 ? volumes : null;
    }
    catch
    {
        return null;
    }
}
```

---

### **3. SQL - Vista Actualizada**
📁 **`scripts/SQL/CreateHealthScoreTables_v2_SAFE.sql`**
📁 **`scripts/SQL/UpdateVista_AgregarDiskDetails.sql`** *(nuevo)*

**Cambio:** Agregado `r.DiskDetails` a la vista `vw_InstanceHealth_Latest`.

```sql
SELECT 
    ...
    r.DiskWorstFreePct,
    r.DiskDetails,  -- ✅ NUEVO
    r.AvgReadLatencyMs,
    ...
FROM LatestScores s
LEFT JOIN LatestResources r ON s.InstanceName = r.InstanceName AND r.rn = 1
...
```

---

### **4. Frontend - Propiedad Actualizada**
📁 **`src/services/api.ts`**

**Cambio:** Renombrado `worstVolumeFreePct` → `worstFreePct` para coincidir con el backend.

```typescript
diskSummary?: {
  worstFreePct?: number;  // ✅ ANTES: worstVolumeFreePct
  volumes?: Array<{
    drive?: string;
    totalGB?: number;
    freeGB?: number;
    freePct?: number;
  }>;
};
```

---

📁 **`src/pages/HealthScore.tsx`**

**Cambio:** Actualizado el código para usar `worstFreePct` y agregar mensaje de fallback.

```tsx
{score.diskSummary && score.diskSummary.worstFreePct !== null && score.diskSummary.worstFreePct !== undefined ? (
  <>
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">Peor Volumen</span>
      <span className={cn(
        'font-mono font-bold',
        (score.diskSummary.worstFreePct || 0) < 10 && 'text-destructive',
        (score.diskSummary.worstFreePct || 0) >= 10 && (score.diskSummary.worstFreePct || 0) < 20 && 'text-warning',
        (score.diskSummary.worstFreePct || 0) >= 20 && 'text-success'
      )}>
        {score.diskSummary.worstFreePct?.toFixed(1)}% libre
      </span>
    </div>
    {score.diskSummary.volumes && score.diskSummary.volumes.length > 0 && (
      <div className="mt-2 pt-2 border-t space-y-1">
        {score.diskSummary.volumes.map((vol, idx) => (
          <div key={idx} className="flex items-center justify-between text-xs">
            <span className="font-mono">{vol.drive}</span>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {vol.freeGB?.toFixed(1)} / {vol.totalGB?.toFixed(1)} GB
              </span>
              <span className={cn(
                'font-mono font-bold',
                (vol.freePct || 0) < 10 && 'text-destructive',
                (vol.freePct || 0) >= 10 && (vol.freePct || 0) < 20 && 'text-warning',
                (vol.freePct || 0) >= 20 && 'text-success'
              )}>
                {vol.freePct?.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </>
) : (
  <p className="text-xs text-muted-foreground">Sin datos de discos</p>
)}
```

---

## 📝 **Pasos de Implementación**

### **Paso 1: Actualizar la Vista SQL**
Ejecuta el script en el servidor SQL:

```powershell
sqlcmd -S "TU_SERVIDOR\SQLNova" -d SQLNova -i "scripts\SQL\UpdateVista_AgregarDiskDetails.sql"
```

### **Paso 2: Ejecutar el Script de Recursos**
Para que se recolecten los discos con el nuevo formato:

```powershell
.\scripts\RelevamientoHealthScore_Resources.ps1
```

### **Paso 3: Recompilar Backend**
```powershell
cd SQLGuardObservatory.API
dotnet publish -c Release -o C:\Temp\Backend
```

### **Paso 4: Recompilar Frontend**
```powershell
npm run build
```

### **Paso 5: Reiniciar IIS/Servicio**
```powershell
iisreset
```

---

## ✅ **Resultado Esperado**

Antes de esta actualización, el frontend mostraba:
```
Peor Volumen: 25.3% libre
```

Después de esta actualización, el frontend mostrará:
```
Peor Volumen: 25.3% libre

─────────────────────────────
C:\     125.2 / 500.5 GB    25.0%
D:\     750.0 / 1000.0 GB   75.0%
E:\     80.5 / 200.0 GB     40.2%
```

---

## 🔍 **Verificación**

### **SQL:**
```sql
SELECT TOP 5
    InstanceName,
    DiskWorstFreePct,
    DiskDetails
FROM dbo.vw_InstanceHealth_Latest
WHERE DiskDetails IS NOT NULL
ORDER BY ScoreCollectedAt DESC;
```

### **API:**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/healthscore/latest" | Select-Object -First 1 -ExpandProperty diskSummary
```

---

## 📌 **Notas Importantes**

1. **Los datos antiguos** en la tabla seguirán teniendo el formato viejo (`C:\:75%`). El parser del backend los ignorará gracefully.
2. **Los datos nuevos** se guardarán con el formato nuevo (`C:\|500.5|125.2|25`).
3. **No se necesita limpiar datos viejos** - el parser maneja ambos formatos sin problemas.
4. El frontend mostrará "Sin datos de discos" si `DiskDetails` está vacío o en formato inválido.

---

## 🚀 **¡Listo!**

Con estos cambios, ahora podrás ver **todos los discos** de cada instancia SQL Server en el HealthScore dashboard.

