# 🚀 Health Score v2.0 - Instrucciones de Uso

## 📁 Archivos Creados

### Scripts Principales
- ✅ `scripts/RelevamientoHealthScoreMant.ps1` → **Script principal v2.0 (NUEVO)**
- ✅ `scripts/RelevamientoHealthScoreMant_backup_*.ps1` → Backup del script v1.0
- ✅ `scripts/Test-HealthScoreV2.ps1` → Script de prueba rápida

### Documentación
- ✅ `scripts/README_HEALTHSCORE_V2.md` → Documentación técnica completa
- ✅ `REFACTORING_HEALTHSCORE_V2.md` → Resumen de cambios v1.0 → v2.0
- ✅ `INSTRUCCIONES_HEALTHSCORE_V2.md` → Este archivo

## 🎯 Cambios Principales

### ✅ Problemas Resueltos

1. **Backups no detectados** (standalone y AlwaysOn)
   - Queries SQL optimizados
   - Lógica simplificada
   - Post-procesamiento robusto

2. **AlwaysOn.Enabled inconsistente**
   - Pre-procesamiento dinámico
   - Validación en post-procesamiento
   - Sincronización garantizada

3. **Complejidad excesiva**
   - Arquitectura modular
   - Funciones atómicas
   - Fácil de debuggear

### 🏗️ Nueva Arquitectura

```
API → Filtros → Pre-Proceso → Proceso → Post-Proceso → Export
                    ↓            ↓           ↓
                Grupos AG    Métricas    Sincronizar
                             Locales     AlwaysOn
```

## 🧪 Cómo Probar

### Opción 1: Prueba Rápida (Script de Test)

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Probar instancias específicas
.\scripts\Test-HealthScoreV2.ps1 -InstanceNames "SSPR19MBK-01","SSPR19MBK-51"

# Probar más instancias
.\scripts\Test-HealthScoreV2.ps1 -InstanceNames "SSPR17SQL-01","SSPR19MBK-01","SSPR19MBK-51" -Verbose
```

**Qué verás:**
- Resumen de cada instancia (HealthScore, Backups, Mantenimiento, AlwaysOn)
- Validaciones automáticas
- Resultado: PASS/FAIL/WARNING

### Opción 2: Modo de Prueba (5 Instancias)

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# 1. Editar RelevamientoHealthScoreMant.ps1
# Verificar que está así:
$TestMode = $true          # Solo 5 instancias
$WriteToSql = $false       # No escribir a SQL
$IncludeAWS = $true

# 2. Ejecutar
.\RelevamientoHealthScoreMant.ps1 -Verbose

# 3. Ver resultados
Get-Content .\InstanceHealth_*.json | ConvertFrom-Json | 
    Select InstanceName, HealthScore, HealthStatus, 
           @{N='LastFull';E={$_.BackupSummary.LastFullBackup}},
           @{N='AOEnabled';E={$_.AlwaysOnSummary.Enabled}}
```

### Opción 3: Producción Completa

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# 1. Editar RelevamientoHealthScoreMant.ps1
$TestMode = $false         # Todas las instancias
$WriteToSql = $true        # Guardar en SQL
$IncludeAWS = $true

# 2. Ejecutar
.\RelevamientoHealthScoreMant.ps1 -Verbose

# 3. Verificar en SQL
```

```sql
-- Ver últimos resultados
SELECT TOP 20
    InstanceName,
    HealthStatus,
    HealthScore,
    JSON_VALUE(BackupJson, '$.LastFullBackup') AS LastFullBackup,
    JSON_VALUE(AlwaysOnJson, '$.Enabled') AS AlwaysOnEnabled,
    GeneratedAtUtc
FROM SQLNova.dbo.InstanceHealthSnapshot
ORDER BY GeneratedAtUtc DESC;
```

## 🔍 Validaciones Esperadas

### ✅ Para Instancias AlwaysOn

**Ejemplo: SSPR19MBK-01 y SSPR19MBK-51 (mismo AG)**

```json
{
  "InstanceName": "SSPR19MBK-01",
  "AlwaysOnSummary": { "Enabled": true },
  "BackupSummary": {
    "LastFullBackup": "2025-10-22T02:00:00",
    "LastLogBackup": "2025-10-22T16:45:00"
  },
  "MaintenanceSummary": {
    "LastCheckdb": "2025-10-20T03:00:00",
    "CheckdbOk": true
  }
}

{
  "InstanceName": "SSPR19MBK-51",
  "AlwaysOnSummary": { "Enabled": true },  ← DEBE SER TRUE
  "BackupSummary": {
    "LastFullBackup": "2025-10-22T02:00:00",  ← MISMO VALOR
    "LastLogBackup": "2025-10-22T16:45:00"    ← MISMO VALOR
  },
  "MaintenanceSummary": {
    "LastCheckdb": "2025-10-20T03:00:00",  ← MISMO VALOR
    "CheckdbOk": true
  }
}
```

**Validación:**
- ✅ Ambos nodos tienen `AlwaysOn.Enabled = true`
- ✅ Ambos nodos tienen los mismos valores de `LastFullBackup`, `LastLogBackup`
- ✅ Ambos nodos tienen los mismos valores de `LastCheckdb`, `LastIndexOptimize`
- ✅ Ambos nodos tienen el mismo `HealthScore` (o muy similar)

### ✅ Para Instancias Standalone

**Ejemplo: SSPR17SQL-01**

```json
{
  "InstanceName": "SSPR17SQL-01",
  "AlwaysOnSummary": { "Enabled": false },
  "BackupSummary": {
    "LastFullBackup": "2025-10-22T01:30:00",  ← DEBE TENER VALOR
    "LastLogBackup": "2025-10-22T16:40:00",   ← DEBE TENER VALOR
    "Breaches": []  ← NO DEBE TENER BREACHES SI ESTÁ AL DÍA
  }
}
```

**Validación:**
- ✅ `AlwaysOn.Enabled = false`
- ✅ `LastFullBackup` y `LastLogBackup` tienen valores (no null)
- ✅ Si los backups están al día, `Breaches = []`

## ⚠️ Qué Revisar Si Algo Falla

### 1. Backups No Detectados

```powershell
# Ejecutar con Verbose para ver queries
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar líneas como:
# "Error obteniendo backups de XXXX"
# "Procesando: XXXX"
```

**Causas comunes:**
- Timeout (aumentar `$TimeoutSec`)
- Permisos SQL (debe tener acceso a `msdb.dbo.backupset`)
- Realmente no hay backups (verificar en SQL)

### 2. AlwaysOn.Enabled Inconsistente

```powershell
# Ver si se detectaron grupos
# Buscar línea: "[OK] X grupo(s) identificado(s)"
```

**Causas comunes:**
- Un nodo no respondió durante pre-procesamiento
- No tiene permisos para `sys.availability_replicas`
- El post-procesamiento debe corregir esto automáticamente

### 3. Nodos AG con Valores Diferentes

```powershell
# Ver post-procesamiento
# Buscar línea: "[SYNC] InstanceName"
```

**Causas comunes:**
- Error en pre-procesamiento (no detectó el grupo)
- Verificar que el AG existe en `sys.availability_groups`

## 📊 Interpretación de Resultados

### Health Score

| Rango | Estado | Significado |
|-------|--------|-------------|
| 90-100 | Healthy | ✅ Todo OK |
| 70-89 | Warning | ⚠️ Requiere atención |
| 0-69 | Critical | ❌ Requiere acción inmediata |

### Componentes del Score

- **Availability (30 pts):** Conectividad y latencia
- **Jobs & Backups (25 pts):** CHECKDB, IndexOptimize, Backups
- **Disks (20 pts):** Espacio libre
- **AlwaysOn (15 pts):** Estado de sincronización
- **Errorlog (10 pts):** Errores severity >= 20

### Breaches Comunes

- `"FULL: 48h > 25h"` → FULL backup tiene 48 horas (SLA: 25h)
- `"LOG: 4h > 2h"` → LOG backup tiene 4 horas (SLA: 2h)

## 📞 Siguientes Pasos

### Fase 1: Validación (AHORA)

1. ✅ Ejecutar script de test
2. ✅ Verificar instancias AlwaysOn específicas
3. ✅ Verificar instancias standalone específicas
4. ✅ Confirmar que no hay falsos negativos

### Fase 2: Prueba Extendida

1. Ejecutar en modo de prueba (5 instancias)
2. Revisar JSON/CSV generados
3. Validar resultados manualmente en SQL
4. Comparar con monitoreo actual

### Fase 3: Producción

1. Configurar `$WriteToSql = $true`
2. Ejecutar con todas las instancias
3. Monitorear durante 24-48h
4. Ajustar thresholds si es necesario

### Fase 4: Automatización

1. Crear scheduled task (ejecutar cada hora)
2. Configurar alertas en frontend
3. Establecer SLAs de respuesta

## 🆘 Soporte

Si encuentras algún problema:

1. **Ejecutar con `-Verbose`** para ver detalles
2. **Revisar el JSON generado** para ver valores exactos
3. **Verificar permisos SQL** en las instancias
4. **Consultar la documentación** en `README_HEALTHSCORE_V2.md`

## 📝 Checklist de Prueba

```
[ ] Script se ejecuta sin errores
[ ] JSON y CSV se generan correctamente
[ ] Instancias AlwaysOn tienen valores sincronizados
[ ] Instancias AlwaysOn tienen Enabled = true
[ ] Instancias standalone detectan backups
[ ] HealthScore se calcula correctamente
[ ] Post-procesamiento sincroniza nodos AG
[ ] Escritura a SQL funciona (si está habilitada)
```

---

**¿Listo para probar?** 🚀

```powershell
# ¡Empezar ahora!
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
.\scripts\Test-HealthScoreV2.ps1 -Verbose
```

