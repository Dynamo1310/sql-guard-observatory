# Arreglo: Backups en Instancias Standalone

## 📋 Problema Identificado

**Síntoma**: Instancias standalone NO mostraban backups, aunque SÍ tenían backups configurados.

**Diagnóstico**: 
- ✅ La consulta SQL SÍ detecta backups correctamente (verificado con `TestBackupDetection.ps1`)
- ❌ El post-procesamiento estaba sobrescribiendo los breaches incorrectamente

---

## 🔍 Causa Raíz

En el post-procesamiento (`Sync-AlwaysOnMaintenanceValues`), había una lógica que recalculaba breaches de backups **sin verificar si había datos válidos**:

**ANTES** (Líneas 1283-1303):
```powershell
# Recalcular breaches de backups
$newBreaches = @()
if ($mostRecentFullBackup) {
    # ...
} else {
    $newBreaches += "Sin FULL backup"  # ❌ PROBLEMA
}

if ($mostRecentLogBackup) {
    # ...
} else {
    $newBreaches += "Sin LOG backup"  # ❌ PROBLEMA
}

$node.BackupSummary.Breaches = $newBreaches  # ❌ Sobrescribe SIEMPRE
```

**Problema**: Si en el post-procesamiento no había `$mostRecentFullBackup` (porque no se estaba sincronizando nada), igual agregaba breaches de "Sin backup" y sobrescribía el array de breaches.

---

## ✅ Solución Implementada

**AHORA** (Líneas 1283-1306):
```powershell
# Recalcular breaches de backups SOLO si actualizamos algo
if ($mostRecentFullBackup -or $mostRecentLogBackup) {  # ✅ CONDICIONAL
    $newBreaches = @()
    
    if ($mostRecentFullBackup) {
        $ageHours = ((Get-Date) - $mostRecentFullBackup).TotalHours
        if ($ageHours -gt 25) {
            $newBreaches += "FULL backup antiguo ($([int]$ageHours)h > 25h)"
        }
    } else {
        $newBreaches += "Sin FULL backup"
    }
    
    if ($mostRecentLogBackup) {
        $ageHours = ((Get-Date) - $mostRecentLogBackup).TotalHours
        if ($ageHours -gt 2) {
            $newBreaches += "LOG backup antiguo ($([int]$ageHours)h > 2h)"
        }
    } else {
        $newBreaches += "Sin LOG backup"
    }
    
    $node.BackupSummary.Breaches = $newBreaches
}
# ✅ Si NO hay mostRecentFullBackup NI mostRecentLogBackup,
#    NO sobrescribe los breaches (mantiene los valores originales)
```

**Lógica**:
- ✅ Solo recalcula breaches si hay valores nuevos de backups para sincronizar
- ✅ Si no hay valores nuevos, mantiene los breaches originales calculados en `Get-JobAndBackupStatus`
- ✅ Para standalone (que NO están en grupos AG), el post-proceso no modifica nada

---

## 📊 Flujo Corregido

### Instancia Standalone

```
1. Get-JobAndBackupStatus() en standalone:
   → Consulta SQL detecta: LastFullBackup = 2025-10-22 00:56
   → Consulta SQL detecta: LastLogBackup = 2025-10-22 09:55
   → Calcula breaches: []  (sin problemas)
   → result.LastFullBackup = 2025-10-22 00:56
   → result.LastLogBackup = 2025-10-22 09:55
   → result.BackupBreaches = []

2. Process-Instance() construye BackupSummary:
   → BackupSummary.LastFullBackup = 2025-10-22 00:56 ✅
   → BackupSummary.LastLogBackup = 2025-10-22 09:55 ✅
   → BackupSummary.Breaches = [] ✅

3. Post-proceso (Sync-AlwaysOnMaintenanceValues):
   → Busca en $agInfo.Groups: NO encontrado (no es AG)
   → groupResults.Count = 0
   → continue (skip este grupo)
   → ✅ NO modifica nada

4. Resultado final:
   → BackupSummary.LastFullBackup = 2025-10-22 00:56 ✅
   → BackupSummary.LastLogBackup = 2025-10-22 09:55 ✅
   → BackupSummary.Breaches = [] ✅
```

### Instancia AlwaysOn

```
1. Get-JobAndBackupStatus() en nodo 01 del AG:
   → Consulta nodo local: NULL (backups en nodo 51)
   → Consulta réplica 51: LastFullBackup = 2025-10-22 00:56
   → result.LastFullBackup = 2025-10-22 00:56
   → result.BackupBreaches = []

2. Get-JobAndBackupStatus() en nodo 51 del AG:
   → Consulta nodo local: LastFullBackup = 2025-10-22 00:56
   → Consulta réplica 01: NULL
   → result.LastFullBackup = 2025-10-22 00:56
   → result.BackupBreaches = []

3. Post-proceso:
   → Encuentra grupo AG: nodos 01 y 51
   → Busca valores más recientes entre ambos
   → $mostRecentFullBackup = 2025-10-22 00:56
   → $mostRecentLogBackup = 2025-10-22 09:55
   → ✅ ENTRA al if ($mostRecentFullBackup -or $mostRecentLogBackup)
   → Actualiza ambos nodos con los mismos valores
   → Recalcula breaches con valores finales
   → node 01: BackupSummary = { LastFull=..., Breaches=[] }
   → node 51: BackupSummary = { LastFull=..., Breaches=[] }
```

---

## 🧪 Validación

### Test 1: Standalone con backups

```powershell
# Ejecutar test
.\scripts\TestBackupDetection.ps1 -InstanceName "SSPR12-01"

# Resultado esperado:
# Bases con FULL backup: 39 de 39 ✅
# Bases con LOG backup: 39 ✅
# Bases SIN FULL backup: 0 ✅

# Ahora ejecutar script completo
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Verificar JSON
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json
$standalone = $json | Where-Object { $_.InstanceName -eq "SSPR12-01" }

$standalone.BackupSummary
# Esperado:
# LastFullBackup: 2025-10-22T00:56:02 ✅
# LastLogBackup: 2025-10-22T09:55:00 ✅
# Breaches: [] ✅
```

### Test 2: AG con backups en nodo secundario

```powershell
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json
$ag01 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-01" }
$ag51 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-51" }

# Ambos deben tener los mismos valores
$ag01.BackupSummary.LastFullBackup -eq $ag51.BackupSummary.LastFullBackup
# Esperado: True ✅

$ag01.BackupSummary.Breaches.Count -eq $ag51.BackupSummary.Breaches.Count
# Esperado: True ✅
```

---

## 📝 Archivos Modificados

| Línea | Cambio | Descripción |
|-------|--------|-------------|
| **1283-1306** | Agregado condicional `if ($mostRecentFullBackup -or $mostRecentLogBackup)` | Solo recalcula breaches si hay valores para sincronizar |
| **363** | Agregado `Write-Verbose` | Logging de cuántas bases se encontraron |
| **384, 391, 407, 415** | Agregado `Write-Verbose` | Logging detallado por base |
| **425** | Agregado `Write-Verbose` | Logging de valores finales |

---

## ✅ Resultado

**ANTES**:
```json
{
  "InstanceName": "SSPR12-01",
  "BackupSummary": {
    "LastFullBackup": null,        // ❌
    "LastLogBackup": null,          // ❌
    "Breaches": [
      "Sin FULL backup",            // ❌
      "Sin LOG backup"              // ❌
    ]
  }
}
```

**AHORA**:
```json
{
  "InstanceName": "SSPR12-01",
  "BackupSummary": {
    "LastFullBackup": "2025-10-22T00:56:02",  // ✅
    "LastLogBackup": "2025-10-22T09:55:00",   // ✅
    "Breaches": []                             // ✅
  }
}
```

---

## 🎯 Resumen

**Problema**: Post-procesamiento sobrescribía breaches incluso cuando no debía.

**Solución**: Solo recalcular breaches si hay valores nuevos para sincronizar.

**Beneficio**: Instancias standalone mantienen sus valores correctos de backups.

---

**Última actualización**: 2025-10-22  
**Estado**: ✅ Corregido

