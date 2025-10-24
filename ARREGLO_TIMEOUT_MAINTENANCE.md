# Arreglo: Lógica de Timeout con Retry en Maintenance Script

## 📋 Objetivo

Aplicar la misma lógica de timeout con retry automático del script de Backups al script de Maintenance para mejorar la tolerancia a instancias lentas o con alta carga.

## ✅ Cambios Implementados

### 1. Configuración de Timeouts

Se agregó la variable de timeout para retry:

```powershell
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 60      # Timeout para retry en caso de fallo
```

### 2. Funciones Actualizadas

Se agregó lógica de retry a **3 funciones principales**:

#### A. `Get-MaintenanceJobs`

Esta función ejecuta **2 queries separadas**:
- **CHECKDB jobs** (IntegrityCheck)
- **IndexOptimize jobs**

Ambas ahora tienen retry independiente:

```powershell
# Query CHECKDB con retry
while ($attemptCount -lt 2 -and $checkdbJobs -eq $null) {
    $attemptCount++
    $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
    
    try {
        $checkdbJobs = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $checkdbQuery `
            -QueryTimeout $currentTimeout `
            -EnableException
        break
    } catch {
        if ($attemptCount -eq 1) {
            Write-Verbose "Timeout, reintentando..."
            Start-Sleep -Milliseconds 500
        }
    }
}
```

#### B. `Get-ErrorlogStatus`

Lee el errorlog de SQL Server buscando errores severity 20+:

```powershell
# Query con retry
while ($attemptCount -lt 2 -and $data -eq $null) {
    $attemptCount++
    $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
    
    try {
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $currentTimeout `
            -EnableException
        break
    } catch {
        if ($attemptCount -eq 1) {
            Write-Verbose "Timeout, reintentando..."
            Start-Sleep -Milliseconds 500
        }
    }
}
```

#### C. Llamadas Actualizadas

```powershell
# Antes:
$maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec
$errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec

# Después:
$maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
$errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
```

## 🎯 Beneficios

### 1. Mayor Tolerancia a Timeouts
- **Primer intento**: 30 segundos
- **Segundo intento**: 60 segundos (automático)
- Reduce fallos en instancias con alta carga

### 2. Múltiples Queries Protegidas
- CHECKDB jobs query
- IndexOptimize jobs query
- ErrorLog query

### 3. Mejor Experiencia
- Menos falsos negativos por timeouts transitorios
- Mensajes verbose para debugging
- Pausa entre intentos para reducir carga

## 📊 Impacto Esperado

### Antes
```
WARNING: Error obteniendo maintenance en SSPR14-01: The wait operation timed out.
   🚨 CRITICAL! SSPR14-01 - Sin datos de mantenimiento
```

### Después
```
VERBOSE: Timeout en CHECKDB SSPR14-01 (intento 1/30s), reintentando...
VERBOSE: Reintentando CHECKDB en SSPR14-01 con timeout extendido de 60s...
   ✅ SSPR14-01 - CHECKDB:24h IndexOpt:18h
```

## 🔧 Queries Afectadas

### 1. CHECKDB Jobs Query
Query compleja con CTEs que consulta `msdb.dbo.sysjobs` y `msdb.dbo.sysjobhistory`:
- Busca jobs con patrón `%IntegrityCheck%`
- Excluye jobs con `STOP` en el nombre
- Calcula tiempo de finalización con run_duration
- Puede ser lenta en instancias con muchos jobs

### 2. IndexOptimize Jobs Query
Similar a CHECKDB pero para:
- Busca jobs con patrón `%IndexOptimize%`
- Misma lógica de cálculo de tiempos
- Puede ser lenta con historial extenso

### 3. ErrorLog Query
```sql
CREATE TABLE #ErrorLog (...)
INSERT INTO #ErrorLog EXEC sp_readerrorlog 0;
SELECT COUNT(*) WHERE [Text] LIKE '%Severity: 2[0-9]%'
```
- Puede ser lenta si el errorlog es muy grande
- `sp_readerrorlog` lee archivos del disco

## 🧪 Testing Recomendado

Ejecutar el script con verbose para ver la lógica de retry:

```powershell
.\scripts\RelevamientoHealthScore_Maintenance.ps1 -Verbose
```

Monitorear instancias que anteriormente daban timeout:
- Instancias SQL 2012/2014 (más lentas)
- Instancias con muchos jobs en historial
- Instancias con errorlog grande

## 📝 Notas Técnicas

### Lógica de Retry
1. **Intento 1**: Timeout de 30 segundos
2. **Si falla**: Espera 500ms
3. **Intento 2**: Timeout de 60 segundos (extendido)
4. **Si falla**: Propaga el error al catch principal

### Por Qué 3 Queries Separadas
El script ejecuta 3 queries porque:
- `Invoke-DbaQuery` no maneja múltiples resultsets correctamente
- Se necesita separar CHECKDB de IndexOptimize
- ErrorLog es independiente

Cada una tiene su propia lógica de retry independiente.

## ✅ Verificación

Después de ejecutar, deberías ver:
- ✅ Menos errores de timeout en instancias lentas
- ✅ Más instancias completando exitosamente
- ✅ Mensajes verbose indicando retries (si se usa -Verbose)
- ✅ Datos de mantenimiento más consistentes

## 🔧 Configuración

Si necesitas ajustar los timeouts:

```powershell
# En el script RelevamientoHealthScore_Maintenance.ps1
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 60      # Timeout de retry
```

Para scripts muy lentos, puedes aumentar a:
```powershell
$TimeoutSec = 45
$TimeoutSecRetry = 90
```

## 📄 Archivos Modificados

- `scripts/RelevamientoHealthScore_Maintenance.ps1`
  - Líneas modificadas: ~120 líneas
  - Funciones actualizadas: 3
  - Queries protegidas: 3

---
**Versión**: 2.1  
**Fecha**: Octubre 2025  
**Archivo modificado**: `scripts/RelevamientoHealthScore_Maintenance.ps1`

