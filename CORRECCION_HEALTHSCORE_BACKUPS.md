# 🔧 Corrección: IndexOptimize y Backups en HealthScore

## 📋 Cambios Realizados

### 1. ✅ IndexOptimize: 48h → 7 días

**Problema**: IndexOptimize se consideraba "vencido" si no se ejecutaba en las últimas 48 horas, pero este job se ejecuta **solo los fines de semana**.

**Solución**: Cambiar el umbral de **48 horas a 7 días**.

#### Archivo: `scripts/RelevamientoHealthScoreMant.ps1`

```powershell
# ANTES (❌)
$result.IndexOptimizeOk = ($lastRun -gt (Get-Date).AddHours(-48))

# DESPUÉS (✅)
$result.IndexOptimizeOk = ($lastRun -gt (Get-Date).AddDays(-7))
```

**Línea 276** - Cambiado de `AddHours(-48)` a `AddDays(-7)`

---

### 2. ✅ BackupJson: Agregar Información de Backups

**Problema**: El JSON `BackupJson` guardaba información de CHECKDB e IndexOptimize, pero **NO** de los backups reales (FULL, DIFF, LOG).

**Ejemplo del problema**:
```json
{
  "Breaches": [],
  "LastCheckdb": "2025-10-18T00:00:00",
  "LastIndexOptimize": "2025-10-19T00:00:00",
  "CheckdbOk": true,
  "IndexOptimizeOk": false
}
```

❌ **Falta**: `LastFullBackup`, `LastDiffBackup`, `LastLogBackup`

**Solución**: Agregar campos para los últimos backups por tipo.

#### Cambios en PowerShell:

**1. Actualizar estructura de resultado** (Línea 228-237):
```powershell
$result = @{
    CheckdbOk = $false
    IndexOptimizeOk = $false
    LastCheckdb = $null
    LastIndexOptimize = $null
    BackupBreaches = @()
    LastFullBackup = $null        # ✅ NUEVO
    LastDiffBackup = $null        # ✅ NUEVO
    LastLogBackup = $null         # ✅ NUEVO
    BackupSummary = @{}
}
```

**2. Capturar backups más recientes** (Líneas 303-359):
```powershell
# Inicializar tracking de backups más recientes
$mostRecentFull = $null
$mostRecentDiff = $null
$mostRecentLog = $null

foreach ($db in $backups) {
    # FULL backup
    if ($db.LastFullBackup) {
        $fullDate = [datetime]$db.LastFullBackup
        if ($null -eq $mostRecentFull -or $fullDate -gt $mostRecentFull) {
            $mostRecentFull = $fullDate
        }
        # ... verificar breaches
    }
    
    # DIFF backup
    if ($db.LastDiffBackup) {
        $diffDate = [datetime]$db.LastDiffBackup
        if ($null -eq $mostRecentDiff -or $diffDate -gt $mostRecentDiff) {
            $mostRecentDiff = $diffDate
        }
    }
    
    # LOG backup
    if ($db.LastLogBackup) {
        $logDate = [datetime]$db.LastLogBackup
        if ($null -eq $mostRecentLog -or $logDate -gt $mostRecentLog) {
            $mostRecentLog = $logDate
        }
        # ... verificar breaches
    }
}

# Guardar los backups más recientes
$result.LastFullBackup = $mostRecentFull
$result.LastDiffBackup = $mostRecentDiff
$result.LastLogBackup = $mostRecentLog
```

**3. Incluir en BackupSummary** (Líneas 711-720):
```powershell
BackupSummary = @{
    CheckdbOk = $jobBackup.CheckdbOk
    IndexOptimizeOk = $jobBackup.IndexOptimizeOk
    LastCheckdb = $jobBackup.LastCheckdb
    LastIndexOptimize = $jobBackup.LastIndexOptimize
    LastFullBackup = $jobBackup.LastFullBackup     # ✅ NUEVO
    LastDiffBackup = $jobBackup.LastDiffBackup     # ✅ NUEVO
    LastLogBackup = $jobBackup.LastLogBackup       # ✅ NUEVO
    Breaches = $jobBackup.BackupBreaches
}
```

**4. Actualizar mock data** (Líneas 851-860):
```powershell
BackupSummary = @{
    CheckdbOk = $isHealthy
    IndexOptimizeOk = $isHealthy
    LastCheckdb = if ($isHealthy) { (Get-Date).AddDays(-2) } else { $null }
    LastIndexOptimize = if ($isHealthy) { (Get-Date).AddDays(-1) } else { $null }
    LastFullBackup = if ($isHealthy) { (Get-Date).AddHours(-8) } else { (Get-Date).AddDays(-3) }    # ✅ NUEVO
    LastDiffBackup = if ($isHealthy) { (Get-Date).AddHours(-4) } else { $null }                    # ✅ NUEVO
    LastLogBackup = if ($isHealthy) { (Get-Date).AddMinutes(-30) } else { $null }                  # ✅ NUEVO
    Breaches = if ($isHealthy) { @() } else { @("FULL de TestDB antiguo (72h)", "LOG de TestDB nunca ejecutado") }
}
```

---

#### Cambios en Backend (C#):

**Archivo**: `SQLGuardObservatory.API/DTOs/HealthScoreDto.cs` (Líneas 24-34)

```csharp
public class BackupSummary
{
    public bool? CheckdbOk { get; set; }
    public bool? IndexOptimizeOk { get; set; }
    public string? LastCheckdb { get; set; }
    public string? LastIndexOptimize { get; set; }
    public DateTime? LastFullBackup { get; set; }      // ✅ NUEVO
    public DateTime? LastDiffBackup { get; set; }      // ✅ NUEVO
    public DateTime? LastLogBackup { get; set; }       // ✅ NUEVO
    public List<string>? Breaches { get; set; }
}
```

---

#### Cambios en Frontend (TypeScript):

**Archivo**: `src/services/api.ts` (Líneas 492-501)

```typescript
backupSummary?: {
  checkdbOk?: boolean;
  indexOptimizeOk?: boolean;
  lastCheckdb?: string;
  lastIndexOptimize?: string;
  lastFullBackup?: string;     // ✅ NUEVO
  lastDiffBackup?: string;     // ✅ NUEVO
  lastLogBackup?: string;      // ✅ NUEVO
  breaches?: string[];
};
```

**Archivo**: `src/pages/HealthScore.tsx` (Líneas 429-476)

Agregada sección para mostrar los últimos backups:

```tsx
{/* Backups - Información adicional */}
{score.backupSummary && (
  <div className="mt-2 pt-2 border-t space-y-1">
    <p className="text-xs font-semibold text-muted-foreground mb-1">Últimos Backups:</p>
    {score.backupSummary.lastFullBackup && (
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">FULL</span>
        <span className="font-mono">
          {new Date(score.backupSummary.lastFullBackup).toLocaleString('es-AR', { 
            year: 'numeric', month: '2-digit', day: '2-digit', 
            hour: '2-digit', minute: '2-digit' 
          })}
        </span>
      </div>
    )}
    {/* Similar para DIFF y LOG */}
  </div>
)}
```

---

### 3. ✅ Documentación Actualizada

#### Archivos actualizados:

1. **`scripts/README_HEALTHSCORE.md`**
   - Línea 31: Cambiado "IndexOptimize < 48h" → "IndexOptimize < 7 días"
   - Línea 245: Cambiado "IndexOptimize: <= 48 horas" → "IndexOptimize: <= 7 días"

2. **`IMPLEMENTACION_HEALTHSCORE.md`**
   - Línea 454: Cambiado "IndexOptimize: <= 48 horas" → "IndexOptimize: <= 7 días"

---

## 📊 Resultado Final

### JSON Antes (❌):
```json
{
  "BackupJson": "{\"Breaches\":[],\"LastCheckdb\":\"2025-10-18T00:00:00\",\"LastIndexOptimize\":\"2025-10-19T00:00:00\",\"CheckdbOk\":true,\"IndexOptimizeOk\":false}"
}
```

### JSON Después (✅):
```json
{
  "BackupJson": "{
    \"CheckdbOk\": true,
    \"IndexOptimizeOk\": true,
    \"LastCheckdb\": \"2025-10-18T00:00:00\",
    \"LastIndexOptimize\": \"2025-10-19T00:00:00\",
    \"LastFullBackup\": \"2025-10-22T15:30:00\",
    \"LastDiffBackup\": \"2025-10-22T11:00:00\",
    \"LastLogBackup\": \"2025-10-22T19:15:00\",
    \"Breaches\": []
  }"
}
```

### Vista Frontend:

**Backups & Mantenimiento** ahora muestra:
```
✓ CHECKDB: OK
  Último: 2025-10-18

✓ Index Optimize: OK  
  Último: 2025-10-19

─────────────────────────
Últimos Backups:
  FULL: 22/10/2025 15:30
  DIFF: 22/10/2025 11:00
  LOG:  22/10/2025 19:15
─────────────────────────
Problemas de Backup:
  (ninguno)
```

---

## 🚀 Despliegue

### Backend

```powershell
cd SQLGuardObservatory.API
dotnet build -c Release
Restart-Service SQLGuardObservatory.API
```

### Frontend

```powershell
npm run build
.\deploy-frontend.ps1
```

### Repoblar Datos

```powershell
cd scripts

# Editar RelevamientoHealthScoreMant.ps1:
# $WriteToSql = $true

.\RelevamientoHealthScoreMant.ps1
```

---

## 📝 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `scripts/RelevamientoHealthScoreMant.ps1` | ✅ IndexOptimize 7 días + Campos de backups |
| `scripts/README_HEALTHSCORE.md` | ✅ Documentación actualizada |
| `IMPLEMENTACION_HEALTHSCORE.md` | ✅ Documentación actualizada |
| `SQLGuardObservatory.API/DTOs/HealthScoreDto.cs` | ✅ BackupSummary con campos adicionales |
| `src/services/api.ts` | ✅ TypeScript interface actualizada |
| `src/pages/HealthScore.tsx` | ✅ UI para mostrar backups |

---

## ✅ Verificación

Después de re-ejecutar el script PowerShell, verifica:

1. **En SQL**:
```sql
SELECT TOP 1 BackupJson 
FROM dbo.InstanceHealthSnapshot 
ORDER BY GeneratedAtUtc DESC
```

Deberías ver `LastFullBackup`, `LastDiffBackup`, `LastLogBackup` en el JSON.

2. **En la App**:
   - Navega a `/healthscore`
   - Expande una fila
   - Verifica que aparece la sección "Últimos Backups:" con FULL, DIFF, LOG

3. **IndexOptimize OK**:
   - Instancias con IndexOptimize ejecutado en los últimos 7 días deberían mostrar "✓ OK"

---

## 💡 Beneficios

✅ **IndexOptimize**: Umbral realista alineado con la frecuencia de ejecución (semanal)
✅ **Backups visibles**: Información completa de backups ahora disponible en la UI
✅ **Mejor troubleshooting**: Puedes ver rápidamente cuándo fue el último backup de cada tipo
✅ **Consistencia**: BackupJson ahora tiene toda la información relacionada con backups

---

## 🎯 Próximos Pasos

1. ✅ Re-ejecutar script PowerShell para poblar nuevos datos
2. ✅ Verificar que aparecen los backups en la UI
3. ✅ Confirmar que IndexOptimize ya no marca instancias como "vencidas" incorrectamente

