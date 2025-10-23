# ✅ Implementación: Sincronización AlwaysOn

## 📋 **Resumen**

Se agregó lógica de sincronización AlwaysOn a los scripts de **Backups** y **Maintenance** para que los nodos del mismo Availability Group compartan los mejores valores de cada métrica.

---

## 🎯 **¿Por qué es Necesario?**

En un grupo AlwaysOn:
- Los **backups** pueden ejecutarse en cualquier nodo (PRIMARY o SECONDARY)
- Los **jobs de mantenimiento** pueden ejecutarse en cualquier nodo
- Pero el **score final** debe reflejar el MEJOR estado del grupo, no de cada nodo individual

**Ejemplo del problema (ANTES):**
- AG "AG-PROD" con 3 nodos: `SQL01`, `SQL02`, `SQL03`
- `SQL01` tiene backup FULL de 1 hora → ✅ OK
- `SQL02` tiene backup FULL de 25 horas → ❌ BREACH
- `SQL03` tiene backup FULL de 2 horas → ✅ OK

Sin sincronización, `SQL02` aparecería con score bajo, aunque el AG tiene backups recientes.

**Después de sincronización:**
- Los 3 nodos reportan el MEJOR backup (1 hora) → ✅ OK para los 3

---

## 🔧 **Archivos Modificados**

### **1️⃣ `scripts/RelevamientoHealthScore_Backups.ps1`**

#### **Nuevas Funciones:**

##### **`Get-AlwaysOnGroups`**
```powershell
# Identifica grupos de AlwaysOn consultando sys.availability_replicas
# Solo procesa instancias donde la API indica AlwaysOn = "Enabled"
# Retorna: @{ Groups = @{ AGName = @{ Nodes = @() } }, NodeToGroup = @{} }
```

**Lógica:**
1. Consulta `sys.availability_groups` y `sys.availability_replicas` en cada nodo
2. Arma un hashtable de grupos: `AGName` → `[Nodos]`
3. Muestra resumen visual de grupos encontrados

##### **`Sync-AlwaysOnBackups`**
```powershell
# Sincroniza datos de backups entre nodos de AlwaysOn
# Toma el MEJOR valor de cada grupo (backup más reciente)
# Aplica ese valor a TODOS los nodos del grupo
```

**Lógica:**
1. Para cada AG:
   - Recopila resultados de todos los nodos del grupo
   - Encuentra el `LastFullBackup` más reciente
   - Encuentra el `LastLogBackup` más reciente
   - Recalcula `FullBackupBreached` y `LogBackupBreached` con los valores sincronizados
   - Aplica estos valores a TODOS los nodos

#### **Flujo Principal Actualizado:**
```powershell
# 1. Obtener instancias desde API
# 2. PRE-PROCESO: Identificar grupos AlwaysOn
$agInfo = Get-AlwaysOnGroups -Instances $instances
# 3. Procesar cada instancia (loop)
# 4. POST-PROCESO: Sincronizar backups de AlwaysOn
$results = Sync-AlwaysOnBackups -AllResults $results -AGInfo $agInfo
# 5. Guardar en SQL
```

---

### **2️⃣ `scripts/RelevamientoHealthScore_Maintenance.ps1`**

#### **Nuevas Funciones:**

##### **`Get-AlwaysOnGroups`**
*(Idéntica a la de Backups)*

##### **`Sync-AlwaysOnMaintenance`**
```powershell
# Sincroniza datos de mantenimiento entre nodos de AlwaysOn
# Recopila TODOS los jobs de TODOS los nodos
# Para cada TIPO de job, toma el ÚLTIMO run exitoso
# Aplica ese valor a TODOS los nodos del grupo
```

**Lógica:**
1. Para cada AG:
   - Recopila `CheckdbJobs` de **TODOS** los nodos
   - Recopila `IndexOptimizeJobs` de **TODOS** los nodos
   - **Para CHECKDB:**
     - Busca el job exitoso más reciente (`Status = 'Success'`)
     - Si no hay exitosos, toma el más reciente (aunque haya fallado)
     - Determina `CheckdbOk` (si fue en los últimos 7 días)
   - **Para Index Optimize:**
     - Misma lógica que CHECKDB
   - Aplica estos valores a TODOS los nodos

**Ejemplo:**
```
AG-PROD tiene 3 nodos:
  - SQL01: CHECKDB hace 2 días (Success)
  - SQL02: CHECKDB hace 10 días (Failed)
  - SQL03: CHECKDB hace 5 días (Success)

Resultado sincronizado para los 3 nodos:
  - LastCheckdb: hace 2 días
  - CheckdbOk: TRUE
```

#### **Cambios en el Objeto de Resultado:**
```powershell
$results += [PSCustomObject]@{
    # ... propiedades existentes ...
    CheckdbJobs = $maintenance.CheckdbJobs  # ✅ NUEVO
    IndexOptimizeJobs = $maintenance.IndexOptimizeJobs  # ✅ NUEVO
    # ...
}
```

#### **Flujo Principal Actualizado:**
```powershell
# 1. Obtener instancias desde API
# 2. PRE-PROCESO: Identificar grupos AlwaysOn
$agInfo = Get-AlwaysOnGroups -Instances $instances
# 3. Procesar cada instancia (loop)
# 4. POST-PROCESO: Sincronizar mantenimiento de AlwaysOn
$results = Sync-AlwaysOnMaintenance -AllResults $results -AGInfo $agInfo
# 5. Guardar en SQL
```

---

## 📊 **Funcionamiento Visual**

### **Pre-Proceso:**
```
🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn...
  ✅ 3 grupo(s) identificado(s):
    • AG-PROD : SQL01, SQL02, SQL03
    • AG-TEST : SQLTEST01, SQLTEST02
    • AG-DEV : SQLDEV01, SQLDEV02, SQLDEV03
```

### **Post-Proceso (Backups):**
```
🔄 [POST-PROCESO] Sincronizando backups entre nodos AlwaysOn...
  📦 Procesando AG: AG-PROD
    Nodos: SQL01, SQL02, SQL03
    🔄 Mejor FULL: 2025-10-23 14:30:00
    🔄 Mejor LOG:  2025-10-23 15:45:00
    ✅ Sincronizados 3 nodos
  ✅ Total: 9 nodos sincronizados
```

### **Post-Proceso (Maintenance):**
```
🔄 [POST-PROCESO] Sincronizando mantenimiento entre nodos AlwaysOn...
  🔧 Procesando AG: AG-PROD
    Nodos: SQL01, SQL02, SQL03
    🔄 Mejor CHECKDB: 2025-10-22 01:00:00 (OK: True)
    🔄 Mejor IndexOptimize: 2025-10-22 23:00:00 (OK: True)
    ✅ Sincronizados 3 nodos
  ✅ Total: 9 nodos sincronizados
```

---

## ✅ **Validación**

### **Verificar Backups Sincronizados:**
```sql
SELECT 
    InstanceName,
    LastFullBackup,
    LastLogBackup,
    FullBackupBreached,
    LogBackupBreached,
    CollectedAtUtc
FROM dbo.InstanceHealth_Backups
WHERE InstanceName IN ('SQL01', 'SQL02', 'SQL03')  -- Nodos del mismo AG
ORDER BY CollectedAtUtc DESC;
```

**Esperado:** Los 3 nodos deben tener los MISMOS valores de `LastFullBackup` y `LastLogBackup`.

### **Verificar Maintenance Sincronizado:**
```sql
SELECT 
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    CollectedAtUtc
FROM dbo.InstanceHealth_Maintenance
WHERE InstanceName IN ('SQL01', 'SQL02', 'SQL03')  -- Nodos del mismo AG
ORDER BY CollectedAtUtc DESC;
```

**Esperado:** Los 3 nodos deben tener los MISMOS valores de `LastCheckdb` y `LastIndexOptimize`.

---

## 🚀 **Ejecución**

### **Script de Backups:**
```powershell
.\scripts\RelevamientoHealthScore_Backups.ps1
```

### **Script de Maintenance:**
```powershell
.\scripts\RelevamientoHealthScore_Maintenance.ps1
```

---

## 📌 **Notas Importantes**

1. **Solo sincroniza instancias donde la API indica `AlwaysOn = "Enabled"`**
   - Si la API no tiene este dato, el nodo no se sincroniza

2. **La sincronización es DESPUÉS de recolectar, ANTES de guardar**
   - Cada nodo recolecta sus propios datos
   - La sincronización ajusta los valores en memoria
   - Los valores sincronizados se guardan en la BD

3. **Los nodos que no pertenecen a ningún AG no se afectan**
   - Standalone instances se guardan con sus propios valores

4. **Si un AG tiene solo 1 nodo activo:**
   - La sincronización no hace nada (no hay otros nodos con qué comparar)
   - Se guarda el valor de ese nodo único

5. **La lógica de "mejor valor" es:**
   - **Backups:** El más reciente (fecha mayor)
   - **Maintenance:** El job exitoso más reciente, o el más reciente si no hay exitosos

---

## 🎯 **Resultado Final**

Con esta implementación:
- ✅ Los grupos AlwaysOn se detectan automáticamente
- ✅ Los backups se sincronizan (mejor = más reciente)
- ✅ Los jobs de mantenimiento se sincronizan (mejor = último exitoso)
- ✅ El Health Score refleja el VERDADERO estado del AG, no de cada nodo individual
- ✅ Los nodos standalone no se afectan

¡El sistema ahora maneja correctamente los grupos AlwaysOn! 🎉

