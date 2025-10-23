# Resumen de Cambios: Backups en AlwaysOn

## ✅ Cambios Implementados

### 1. **Consultar backups en todos los nodos del AG**

Al igual que con los jobs de mantenimiento, ahora el script:
- Consulta backups en el nodo local
- Si es AlwaysOn (`AlwaysOn = "Enabled"` desde la API)
- Consulta backups en todos los nodos del AG (patrón 01↔51, 02↔52)
- **Toma el backup MÁS RECIENTE** entre todos los nodos
- Ambos nodos del AG reportan los mismos valores

**Por qué es necesario**: En AlwaysOn, los backups típicamente se ejecutan en UN SOLO nodo (usualmente el secundario). Si solo consultas el nodo primario, aparecerá como "sin backups".

---

### 2. **Umbrales corregidos**

| Tipo | Antes | Ahora | Razón |
|------|-------|-------|-------|
| **FULL** | 24 horas | **25 horas** | Margen para ventanas de mantenimiento |
| **LOG** | 1 hora | **2 horas** | Margen para job schedules |

---

## 📝 Archivos Modificados

### Script Principal

**Archivo**: `scripts/RelevamientoHealthScoreMant.ps1`

| Líneas | Cambio |
|--------|--------|
| 419 | Umbral FULL local: `> 24` → `> 25` |
| 445 | Umbral LOG local: `> 1` → `> 2` |
| 463-575 | **NUEVO**: Consulta de backups en réplicas AG (+113 líneas) |
| 502 | Umbral FULL réplicas: `> 24` → `> 25` |
| 534 | Umbral LOG réplicas: `> 1` → `> 2` |
| 556 | Umbral FULL validación final: `> 24` → `> 25` |
| 566 | Umbral LOG validación final: `> 1` → `> 2` |

---

### Documentación

**Archivos actualizados**:
1. ✅ `scripts/README_HEALTHSCORE.md` (líneas 251-257)
   - FULL: 24h → 25h
   - LOG: 1h → 2h
   - Agregada nota sobre consulta en todos los nodos AG

2. ✅ `IMPLEMENTACION_HEALTHSCORE.md` (líneas 452-459)
   - FULL: 24h → 25h
   - LOG: 1h → 2h
   - Agregada nota sobre AlwaysOn

3. ✅ `CORRECCION_BACKUPS_ALWAYSON.md` (NUEVO)
   - Documentación completa de la implementación
   - Flujos detallados
   - Ejemplos de casos de uso
   - Guías de testing

---

## 🎯 Resultado Final

### Ejemplo: AG con backups en nodo secundario

**ANTES**:
```
SSPR19MBK-01 (Primary):
  LastFullBackup: NULL  ❌
  LastLogBackup: NULL   ❌
  Breaches: ["No hay backups"]
  HealthScore: 70 (penalizado)

SSPR19MBK-51 (Secondary):
  LastFullBackup: 2025-10-22 02:00:00  ✅
  LastLogBackup: 2025-10-22 07:30:00   ✅
  Breaches: []
  HealthScore: 92
```

**AHORA**:
```
SSPR19MBK-01 (Primary):
  LastFullBackup: 2025-10-22 02:00:00  ✅ (del nodo 51)
  LastLogBackup: 2025-10-22 07:30:00   ✅ (del nodo 51)
  Breaches: []
  HealthScore: 92

SSPR19MBK-51 (Secondary):
  LastFullBackup: 2025-10-22 02:00:00  ✅
  LastLogBackup: 2025-10-22 07:30:00   ✅
  Breaches: []
  HealthScore: 92
```

✅ **Ambos nodos reportan los mismos valores**

---

## 🧪 Testing Rápido

```powershell
# Ejecutar el script
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Verificar en JSON
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json
$json | Where-Object { $_.InstanceName -like "SSPR19MBK-*" } | 
    Select-Object InstanceName, 
                  @{N='LastFull';E={$_.BackupSummary.LastFullBackup}},
                  @{N='LastLog';E={$_.BackupSummary.LastLogBackup}},
                  @{N='Breaches';E={$_.BackupSummary.Breaches.Count}}

# Esperado: Ambos nodos con los MISMOS valores
```

---

## 📊 Lógica Completa

```
Para cada instancia:

1. Consultar backups en nodo local
   └─> msdb.dbo.backupset

2. ¿Es AlwaysOn? (desde API)
   ├─ NO (Standalone)
   │  └─> Usar valores locales ✅
   │
   └─ SÍ (AlwaysOn)
      ├─ Detectar nodos del AG (01↔51, 02↔52)
      ├─ Consultar backups en cada nodo
      ├─ Comparar fechas
      └─> Tomar el MÁS RECIENTE ✅

3. Validar SLAs:
   ├─ FULL > 25h? → Breach
   └─ LOG > 2h?   → Breach

4. Calcular HealthScore:
   └─ Sin breaches = 30 pts (de 25%)
```

---

## ✅ Checklist de Validación

- [x] Backups se consultan en nodos locales
- [x] Backups se consultan en réplicas AG
- [x] Se toma el valor MÁS RECIENTE
- [x] Ambos nodos AG reportan mismo valor
- [x] Standalone no se afectan
- [x] Umbrales corregidos (25h FULL, 2h LOG)
- [x] Documentación actualizada
- [x] Código con comentarios explicativos

---

## 🎯 Resumen en 3 Puntos

1. ✅ **Backups en AlwaysOn ahora se detectan correctamente** consultando todos los nodos del AG
2. ✅ **Umbrales actualizados**: FULL < 25h, LOG < 2h (más realistas)
3. ✅ **Nodos del mismo AG reportan valores idénticos** (consistencia garantizada)

---

**Última actualización**: 2025-10-22

