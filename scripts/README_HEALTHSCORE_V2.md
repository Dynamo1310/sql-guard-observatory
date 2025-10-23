# Health Score v2.0 - Documentación

## 📋 Resumen

Script de PowerShell 7+ completamente **refactorizado desde cero** para calcular el Health Score de instancias SQL Server con una arquitectura simplificada y clara.

## 🎯 Arquitectura

### Flujo de Ejecución

```
1. API → Obtener instancias
2. FILTROS → DMZ, AWS, TestMode
3. PRE-PROCESO → Identificar grupos AlwaysOn
4. PROCESO → Recopilar métricas individuales
5. POST-PROCESO → Sincronizar nodos AlwaysOn
6. EXPORT → JSON, CSV, SQL
```

### Principios de Diseño

- ✅ **Una función = una responsabilidad**
- ✅ **Sin sincronización durante recolección**
- ✅ **Post-procesamiento centralizado**
- ✅ **Queries SQL optimizados**

## 📊 Modelo de Cálculo

### Health Score (0-100)

| Categoría | Peso | Descripción |
|-----------|------|-------------|
| **Availability** | 30 pts | Conectividad y latencia |
| **Jobs & Backups** | 25 pts | Mantenimiento y backups |
| **Disks** | 20 pts | Espacio libre en discos |
| **AlwaysOn** | 15 pts | Estado de sincronización |
| **Errorlog** | 10 pts | Errores severity >= 20 |

### Thresholds

#### Backups
- **FULL:** <= 25 horas
- **LOG:** <= 2 horas

#### Mantenimiento
- **IntegrityCheck:** <= 7 días
- **IndexOptimize:** <= 7 días

#### AlwaysOn
- Solo penaliza nodos **SYNCHRONOUS_COMMIT** no sincronizados
- Nodos **ASYNCHRONOUS_COMMIT** (DR) no penalizan por NOT_SYNC
- Redo queue threshold: 500 MB

### Estados Finales

- **Healthy:** >= 90 puntos
- **Warning:** 70-89 puntos
- **Critical:** < 70 puntos

## ⚙️ Configuración Interna

Edita las variables al inicio del script:

```powershell
# Modo de ejecución
$TestMode = $true          # $true = solo 5 instancias
$WriteToSql = $false       # $true = guardar en SQL
$IncludeAWS = $true        # $true = incluir AWS
$OnlyAWS = $false          # $true = solo AWS

# SQL Server destino
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 10
```

## 🚀 Uso

### Modo de Prueba (5 instancias, sin SQL)

```powershell
# Dejar configuración por defecto:
$TestMode = $true
$WriteToSql = $false

# Ejecutar
.\RelevamientoHealthScoreMant.ps1
```

### Modo Producción (todas las instancias + SQL)

```powershell
# Cambiar configuración:
$TestMode = $false
$WriteToSql = $true

# Ejecutar
.\RelevamientoHealthScoreMant.ps1 -Verbose
```

### Solo AWS

```powershell
$OnlyAWS = $true
.\RelevamientoHealthScoreMant.ps1
```

### Excluir AWS

```powershell
$IncludeAWS = $false
.\RelevamientoHealthScoreMant.ps1
```

## 🔍 Funciones Principales

### Recolección de Métricas (Individuales)

```powershell
Get-MaintenanceJobs        # IntegrityCheck, IndexOptimize
Get-BackupStatus           # FULL, DIFF, LOG
Get-DiskStatus             # Espacio libre por volumen
Get-ResourceStatus         # CPU, Memoria
Get-AlwaysOnStatus         # Estado de sincronización
Get-ErrorlogStatus         # Errores severity >= 20
```

### Pre-Procesamiento

```powershell
Get-AlwaysOnGroups         # Identifica grupos AG dinámicamente
```

### Post-Procesamiento

```powershell
Sync-AlwaysOnData          # Sincroniza valores entre nodos AG
Calculate-HealthScore      # Calcula score final
```

## 📂 Estructura de Salida

### JSON (Completo)

```json
{
  "InstanceName": "SSPR17SQL-01",
  "Ambiente": "Produccion",
  "HostingSite": "Onpremise",
  "Version": "SQL Server 2019",
  "ConnectSuccess": true,
  "ConnectLatencyMs": 45,
  "MaintenanceSummary": {
    "LastCheckdb": "2025-10-20T03:00:00",
    "LastIndexOptimize": "2025-10-19T02:00:00",
    "CheckdbOk": true,
    "IndexOptimizeOk": true
  },
  "BackupSummary": {
    "LastFullBackup": "2025-10-22T02:00:00",
    "LastDiffBackup": "2025-10-22T14:00:00",
    "LastLogBackup": "2025-10-22T16:45:00",
    "Breaches": []
  },
  "DiskSummary": {
    "WorstFreePct": 42.5,
    "Volumes": [...]
  },
  "AlwaysOnSummary": {
    "Enabled": true,
    "WorstState": "OK",
    "Issues": []
  },
  "ErrorlogSummary": {
    "Severity20PlusCount": 0,
    "Skipped": false
  },
  "HealthScore": 95,
  "HealthStatus": "Healthy",
  "GeneratedAtUtc": "2025-10-22T19:30:00Z"
}
```

### CSV (Simplificado)

```csv
InstanceName,HealthStatus,HealthScore,ConnectLatencyMs,WorstFreePct,BackupBreaches,AlwaysOnIssues,...
```

### SQL (Tabla: InstanceHealthSnapshot)

Los datos JSON se guardan en columnas `MaintenanceJson`, `BackupJson`, etc.

## 🔄 Lógica de AlwaysOn

### Pre-Procesamiento

1. Para cada instancia con `AlwaysOn = "Enabled"`
2. Consulta `sys.availability_replicas` para obtener **todos los nodos del AG**
3. Construye un mapa:
   - `Groups[AGName] = { Nodes: [...] }`
   - `NodeToGroup[NodeName] = AGName`

### Procesamiento Individual

- Cada instancia recopila sus métricas **localmente**
- **No consulta otros nodos** durante esta fase

### Post-Procesamiento (Sincronización)

Para cada grupo AlwaysOn:

1. **Encuentra el mejor valor** de cada métrica:
   - `LastCheckdb` más reciente
   - `LastIndexOptimize` más reciente
   - `LastFullBackup` más reciente
   - `LastLogBackup` más reciente
   - `LastDiffBackup` más reciente

2. **Aplica a todos los nodos** del grupo:
   - Actualiza `MaintenanceSummary`
   - Actualiza `BackupSummary`
   - Marca `AlwaysOnSummary.Enabled = true`

3. **Recalcula breaches y HealthScore**

### Ejemplo

```
AG: SSPR19MBKAG
Nodos: SSPR19MBK-01, SSPR19MBK-51

Procesamiento Individual:
- SSPR19MBK-01: LastCheckdb = 2025-10-20, LastFullBackup = 2025-10-22
- SSPR19MBK-51: LastCheckdb = NULL, LastFullBackup = NULL

Post-Procesamiento:
- Mejor LastCheckdb: 2025-10-20 (de -01)
- Mejor LastFullBackup: 2025-10-22 (de -01)
- Aplicar a AMBOS nodos
- Resultado: Ambos muestran LastCheckdb y LastFullBackup actualizados
```

## 🐛 Troubleshooting

### Backups no detectados

**Síntoma:** `LastFullBackup` o `LastLogBackup` son `null`

**Solución:**
1. Ejecutar con `-Verbose` para ver queries
2. Verificar que hay backups en `msdb.dbo.backupset`
3. Verificar que no son bases de sistema
4. Para AlwaysOn, verificar que al menos un nodo tiene backups

### AlwaysOn deshabilitado en un nodo

**Síntoma:** Un nodo muestra `Enabled = false` y su réplica `Enabled = true`

**Solución:**
- El post-procesamiento corrige esto automáticamente
- Verificar que el nodo aparece en `sys.availability_replicas`

### Jobs no detectados

**Síntoma:** `LastCheckdb` o `LastIndexOptimize` son `null`

**Solución:**
1. Verificar nombre del job: debe contener `%IntegrityCheck%` o `%IndexOptimize%`
2. Verificar que el job se ejecutó exitosamente (`run_status = 1`)
3. Verificar que se ejecutó en los últimos 7 días
4. Para AlwaysOn, verificar que al menos un nodo tiene el job ejecutado

## 📝 Cambios vs v1.0

| Aspecto | v1.0 | v2.0 |
|---------|------|------|
| **Arquitectura** | Monolítica | Modular |
| **Sincronización AG** | Durante recolección | Post-procesamiento |
| **Queries SQL** | Múltiples por nodo | Uno por métrica |
| **Lógica de breaches** | Fragmentada | Centralizada |
| **Debugging** | Difícil | Fácil con `-Verbose` |
| **Mantenimiento** | Complejo | Simple |

## 🔐 Permisos SQL Necesarios

```sql
-- En cada instancia monitorizada:
GRANT VIEW SERVER STATE TO [DOMAIN\MonitorUser];
GRANT VIEW ANY DEFINITION TO [DOMAIN\MonitorUser];
EXEC sp_addrolemember 'SQLAgentUserRole', 'DOMAIN\MonitorUser';

-- En SSPR17MON-01.SQLNova (si WriteToSql = true):
GRANT INSERT ON dbo.InstanceHealthSnapshot TO [DOMAIN\MonitorUser];
```

## 📞 Soporte

Para reportar problemas o sugerencias, contactar al equipo de SQL Guard Observatory.

---

**Versión:** 2.0  
**Fecha:** 2025-10-22  
**Autor:** SQL Guard Observatory Team

