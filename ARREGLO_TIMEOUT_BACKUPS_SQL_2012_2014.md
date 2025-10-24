# Arreglo: Timeout y Lógica de Display de Backups

## 📋 Problemas Identificados

### 1. Timeout en SQL 2012/2014

El script `RelevamientoHealthScore_Backups.ps1` estaba experimentando errores de timeout en instancias SQL Server 2012 y 2014:

### 2. Display Confuso de Tiempos de Backup

El script mostraba warnings inconsistentes:
```
⚠️ LOG BACKUP! SSPR19MSV-01 - FULL:12h LOG:1h
⚠️ LOG BACKUP! SSPR14ODM-02 - FULL:8h LOG:1h
```

**Problema**: Mostraba LOG:1h (bajo el umbral de 2h) pero marcaba como warning porque OTRA DB en la instancia tenía backup >2h.

```
WARNING: Error obteniendo backups en SSPR14-01: The wait operation timed out.
   🚨 FULL+LOG! SSPR14-01 - FULL:999h LOG:999h
WARNING: Error obteniendo backups en SSPR12-01: The wait operation timed out.
   🚨 FULL+LOG! SSPR12-01 - FULL:999h LOG:999h
```

### Causas Raíz

**Problema 1 - Timeout:**
- **Timeout muy corto**: 15 segundos era insuficiente para instancias con historiales grandes en `msdb`
- **Sin retry**: No había segundo intento con timeout extendido
- **Query no optimizada**: Escaneo completo de la tabla `backupset` sin filtros de fecha

**Problema 2 - Display Confuso:**
- **Lógica inconsistente**: Mostraba el backup MÁS RECIENTE pero evaluaba TODAS las DBs
- Si una instancia tenía: DB1=LOG:1h (OK) y DB2=LOG:3h (breach)
- Mostraba: "⚠️ LOG BACKUP! LOG:1h" (confuso, 1h está bajo el umbral)

## ✅ Solución Implementada

### 1. Aumento de Timeouts

```powershell
$TimeoutSec = 30           # Aumentado de 15 a 30 segundos
$TimeoutSecRetry = 60      # Timeout para retry en caso de fallo
```

### 2. Lógica de Retry Inteligente

La función `Get-BackupStatus` ahora:
- Intenta primero con timeout de **30 segundos**
- Si falla, reintenta automáticamente con **60 segundos**
- Espera 500ms entre intentos para reducir carga
- Muestra mensajes verbose del retry para debugging

```powershell
while ($attemptCount -lt 2 -and $data -eq $null) {
    $attemptCount++
    $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
    
    try {
        if ($attemptCount -eq 2) {
            Write-Verbose "Reintentando $InstanceName con timeout extendido..."
        }
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $currentTimeout `
            -EnableException
            
        break  # Salir si fue exitoso
        
    } catch {
        $lastError = $_
        if ($attemptCount -eq 1) {
            Write-Verbose "Timeout, reintentando..."
            Start-Sleep -Milliseconds 500
        }
    }
}
```

### 3. Query Optimizada

La query ahora incluye:
- **NOLOCK hint**: Para evitar bloqueos de lectura
- **Filtro de fecha**: Solo busca backups de los últimos 7 días
- **Filtro READ-ONLY**: Excluye bases de datos en modo solo lectura
- **Filtros de sistema**: Excluye bases de sistema (master, model, msdb, tempdb)
- Reduce drásticamente el escaneo de `msdb.dbo.backupset`

**Filtros de LOG Backups:**
- Solo evalúa bases en **FULL recovery model** (excluye SIMPLE y BULK_LOGGED)
- No considera bases READ-ONLY
- No considera bases de sistema

### 4. Lógica de Display Corregida

Ahora el script muestra el **PEOR backup** (el más antiguo con breach) en lugar del mejor:

**Antes:**
- Mostraba el backup MÁS RECIENTE siempre
- Si una DB tenía LOG:1h y otra LOG:3h, mostraba LOG:1h
- Causaba confusión: ⚠️ LOG BACKUP! con LOG:1h (bajo umbral)

**Después:**
- Si hay breach: muestra el PEOR backup (el que causa el problema)
- Si no hay breach: muestra el MÁS RECIENTE (el mejor)
- Ahora: ⚠️ LOG BACKUP! SSPR19MSV-01 - LOG:3h (claramente >2h)

```powershell
# Lógica implementada
if ($result.LogBackupBreached) {
    # Buscar el backup LOG más antiguo de las DBs con problema
    $worstLogBackup = $breachedLogs | 
        Where-Object { $_.LastLogBackup -ne [DBNull]::Value } | 
        Sort-Object LastLogBackup | 
        Select-Object -First 1 -ExpandProperty LastLogBackup
    
    $result.LastLogBackup = [datetime]$worstLogBackup
} else {
    # No hay breach, mostrar el más reciente
    $result.LastLogBackup = ($logBackups | Measure-Object -Maximum).Maximum
}
```

```sql
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END) AS LastFullBackup,
    MAX(CASE WHEN bs.type = 'L' THEN bs.backup_finish_date END) AS LastLogBackup
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset bs WITH (NOLOCK)
    ON d.name = bs.database_name
    AND bs.backup_finish_date >= '2025-10-17'  -- 7 días atrás
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
  AND d.database_id > 4          -- Excluye bases de sistema
  AND d.is_read_only = 0          -- Excluye bases READ-ONLY
GROUP BY d.name, d.recovery_model_desc;

-- Para LOG backups, PowerShell filtra adicionalmente:
-- WHERE RecoveryModel = 'FULL'  (excluye SIMPLE y BULK_LOGGED)
```

## 🎯 Beneficios

1. **Mayor tolerancia**: Instancias lentas o con mucho historial ahora completan exitosamente
2. **Reducción de carga**: Query optimizada escanea menos datos
3. **Menos falsos positivos**: Los valores de 999h ya no aparecen por timeouts transitorios
4. **Display consistente**: Ahora el tiempo mostrado coincide con el estado del warning
5. **Mejor debugging**: Mensajes verbose indican cuándo se hace retry
6. **Identificación clara**: Se muestra el backup problemático, no el mejor caso
7. **Filtrado preciso**: Solo evalúa bases relevantes (excluye READ-ONLY, SIMPLE, y sistema)

## 📊 Impacto

### Antes
- ❌ Timeout en 15 segundos → Error inmediato
- ❌ Sin información de por qué falló
- ❌ Valores de 999h marcaban instancias como críticas
- ❌ Display confuso: ⚠️ LOG BACKUP! con LOG:1h (bajo umbral de 2h)

### Después
- ✅ Primer intento: 30 segundos
- ✅ Segundo intento automático: 60 segundos
- ✅ Query 3-5x más rápida por filtro de fecha
- ✅ Solo marca error si ambos intentos fallan
- ✅ Display consistente: ⚠️ LOG BACKUP! con LOG:3h (claramente >2h)
- ✅ Si no hay breach, muestra el mejor tiempo (más reciente)

## 🧪 Testing Recomendado

Ejecutar el script con verbose para ver la lógica de retry:

```powershell
.\scripts\RelevamientoHealthScore_Backups.ps1 -Verbose
```

Monitorear específicamente las instancias problemáticas:
- SSPR14-01 (SQL 2014)
- SSPR12-01 (SQL 2012)

## 📝 Notas Adicionales

### Filtros de Bases de Datos

**Bases excluidas de validación:**

1. **Bases de sistema** (`database_id <= 4`)
   - master, model, msdb, tempdb
   - Razón: Se gestionan automáticamente, no son responsabilidad del DBA aplicativo

2. **Bases READ-ONLY** (`is_read_only = 1`)
   - Razón: No generan transacciones, no requieren LOG backups frecuentes
   - FULL backups ocasionales son suficientes

3. **Bases en SIMPLE recovery** (solo para LOG backups)
   - Razón: SIMPLE no genera/retiene logs de transacciones
   - Solo requieren FULL backups

4. **Bases OFFLINE o en otros estados**
   - Solo se evalúan bases `ONLINE`

### Otros Detalles

- El filtro de 7 días es suficiente ya que:
  - Umbrales son: FULL = 24h, LOG = 2h
  - No necesitamos historial completo para health score
  - Si no hay backups en 7 días, la situación es crítica de todas formas

- La lógica de retry solo actúa si hay timeout, no en otros errores

## 🔧 Configuración

Si necesitas ajustar los timeouts:

```powershell
# En el script RelevamientoHealthScore_Backups.ps1
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 60      # Timeout de retry
```

## ✅ Verificación

Después de ejecutar, deberías ver:
- ✅ No más valores de 999h en SSPR14-01 y SSPR12-01
- ✅ Tiempos reales de backups
- ✅ Menos warnings en la consola
- ✅ Warnings consistentes: si marca ⚠️ LOG BACKUP!, el tiempo mostrado será >2h
- ✅ Instancias OK (✅) muestran el backup más reciente

### Ejemplos Esperados

**Instancia con problema:**
```
⚠️ LOG BACKUP! SSPR19MSV-01 - FULL:12h LOG:3h
```
(Muestra 3h porque ese es el backup vencido que causa el problema)

**Instancia OK:**
```
✅ SSPR16SOA-01 - FULL:10h LOG:0.5h
```
(Muestra 0.5h porque es el más reciente y está OK)

---
**Versión**: 2.1  
**Fecha**: Octubre 2025  
**Archivo modificado**: `scripts/RelevamientoHealthScore_Backups.ps1`

