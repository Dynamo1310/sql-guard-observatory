# 🚀 Guía Rápida - dbatools para Health Score v2.0

## 📋 Resumen

Todos los scripts de **Health Score v2.0** ahora usan **`dbatools`** en lugar de `Invoke-Sqlcmd` para mayor robustez y rendimiento.

---

## ✅ Instalación en 3 Pasos

### **Paso 1: Instalar dbatools**

```powershell
# Opción A: Script automatizado (RECOMENDADO)
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
.\scripts\Install-DbaTools.ps1

# Opción B: Manual
Install-Module -Name dbatools -Force -AllowClobber -Scope CurrentUser
```

---

### **Paso 2: Verificar instalación**

```powershell
# Verificar que dbatools está disponible
Get-Module -ListAvailable -Name dbatools

# Importar módulo
Import-Module dbatools

# Ver comandos disponibles
Get-Command -Module dbatools | Select-Object -First 10
```

---

### **Paso 3: Probar conectividad**

```powershell
# Test rápido con primeras 5 instancias
.\Test-DbaToolsConnection.ps1

# Test con más instancias
.\Test-DbaToolsConnection.ps1 -Top 10
```

---

## 🧪 Probar Scripts Actualizados

### **Test 1: Script de Availability (1-2 min)**

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# Ejecutar en modo test (solo 5 instancias)
# Editar el script y cambiar $TestMode = $true
.\RelevamientoHealthScore_Availability.ps1 -Verbose
```

**Resultado esperado:**
```
╔═══════════════════════════════════════════════════════╗
║  Health Score v2.0 - AVAILABILITY METRICS             ║
╚═══════════════════════════════════════════════════════╝

1️⃣  Obteniendo instancias desde API...
   Total encontradas: 177
   Después de filtros: 5

2️⃣  Recolectando métricas de disponibilidad...
   ✅ INSTANCE01 - Lat:45ms Block:0 PLE:1200
   ✅ INSTANCE02 - Lat:32ms Block:0 PLE:3500
   ...

3️⃣  Guardando en SQL Server...
   ✅ Guardados 5 registros en SQL Server

╔═══════════════════════════════════════════════════════╗
║  RESUMEN - AVAILABILITY                               ║
║  Total instancias:     5                              ║
║  Conectadas:           5                              ║
║  Con blocking:         0                              ║
║  Memory pressure:      1                              ║
║  AlwaysOn enabled:     2                              ║
╚═══════════════════════════════════════════════════════╝

✅ Script completado!
```

---

### **Test 2: Script de Resources (5 min)**

```powershell
.\RelevamientoHealthScore_Resources.ps1 -Verbose
```

---

### **Test 3: Script de Consolidación**

```powershell
.\RelevamientoHealthScore_Consolidate.ps1 -Verbose
```

**Resultado esperado:**
```
╔═══════════════════════════════════════════════════════╗
║  Health Score v2.0 - CONSOLIDATOR (150 puntos)       ║
╚═══════════════════════════════════════════════════════╝

1️⃣  Obteniendo lista de instancias...
   Encontradas: 5 instancias

2️⃣  Calculando Health Score...
   ✅ INSTANCE01 - Score: 145/150 (Healthy) [T1:48 T2:40 T3:37 T4:20]
   ✅ INSTANCE02 - Score: 138/150 (Healthy) [T1:50 T2:40 T3:35 T4:13]
   ⚠️  INSTANCE03 - Score: 112/150 (Warning) [T1:45 T2:25 T3:30 T4:12]
   ...

╔═══════════════════════════════════════════════════════╗
║  RESUMEN FINAL - HEALTH SCORE v2.0                   ║
║  Total instancias:     5                              ║
║  Score promedio:       135/150                        ║
║  ✅ Healthy (≥135):    3                              ║
║  ⚠️  Warning (105-134): 2                             ║
║  🚨 Critical (<105):    0                             ║
╠═══════════════════════════════════════════════════════╣
║  Promedios por Tier:                                  ║
║  Tier 1 (Availability): 47/50                         ║
║  Tier 2 (Continuity):   35/40                         ║
║  Tier 3 (Resources):    33/40                         ║
║  Tier 4 (Maintenance):  17/20                         ║
╚═══════════════════════════════════════════════════════╝

✅ Consolidación completada!
```

---

## 📅 Configurar Scheduled Tasks

Una vez validados los scripts, configura las tareas programadas:

```powershell
# Ejecutar como Administrador
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

.\Schedule-HealthScore-v2.ps1 `
    -ScriptsPath "C:\SQL-Guard-Observatory\scripts" `
    -LogPath "C:\SQL-Guard-Observatory\logs" `
    -TaskUser "DOMAIN\svc_sqlguard"
```

**El script verificará automáticamente que dbatools esté instalado antes de crear las tareas.**

---

## 🔧 Troubleshooting

### **Problema 1: "dbatools no está instalado"**

**Error:**
```
❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force
```

**Solución:**
```powershell
.\scripts\Install-DbaTools.ps1
```

---

### **Problema 2: "Test-DbaConnection no reconocido"**

**Error:**
```
Test-DbaConnection : El término 'Test-DbaConnection' no se reconoce...
```

**Solución:**
```powershell
Import-Module dbatools -Force
```

---

### **Problema 3: "Las 177 instancias reportan SIN CONEXIÓN"**

**Causa:** El problema original que detectaste - la API devuelve datos pero el formato JSON no coincide con lo esperado.

**Diagnóstico:**
```powershell
# Ejecutar el script de diagnóstico
.\Test-DbaToolsConnection.ps1 -Top 5
```

**Si el test muestra conexiones exitosas**, el problema está en cómo el script parsea la respuesta de la API.

**Solución:** Revisar la estructura del JSON de la API:
```powershell
$response = Invoke-RestMethod -Uri "http://asprbm-nov-01/InventoryDBA/inventario/"
$response.message | Select-Object -First 5 | Format-List
```

---

### **Problema 4: Permisos de ejecución**

**Error:**
```
No se puede cargar el archivo porque la ejecución de scripts está deshabilitada
```

**Solución:**
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

## 📊 Verificar que todo funciona

### **1. Verificar tablas SQL**

```sql
USE SQLNova;
GO

-- Ver últimos registros de cada tabla
SELECT TOP 5 * FROM dbo.InstanceHealth_Critical_Availability ORDER BY CollectedAtUtc DESC;
SELECT TOP 5 * FROM dbo.InstanceHealth_Critical_Resources ORDER BY CollectedAtUtc DESC;
SELECT TOP 5 * FROM dbo.InstanceHealth_Backups ORDER BY CollectedAtUtc DESC;
SELECT TOP 5 * FROM dbo.InstanceHealth_Maintenance ORDER BY CollectedAtUtc DESC;
SELECT TOP 5 * FROM dbo.InstanceHealth_Score ORDER BY CollectedAtUtc DESC;

-- Ver scores calculados
SELECT 
    InstanceName,
    HealthScore,
    HealthStatus,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    CollectedAtUtc
FROM dbo.InstanceHealth_Score
WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
ORDER BY HealthScore DESC;
```

---

### **2. Verificar Scheduled Tasks**

```powershell
# Ver todas las tareas de Health Score
Get-ScheduledTask | Where-Object {$_.TaskName -like 'HealthScore_v2*'} | Format-Table TaskName, State, LastRunTime

# Ver detalles de una tarea específica
Get-ScheduledTask -TaskName 'HealthScore_v2_Availability' | Format-List

# Ejecutar manualmente una tarea
Start-ScheduledTask -TaskName 'HealthScore_v2_Availability'

# Ver historial de ejecución
Get-ScheduledTaskInfo -TaskName 'HealthScore_v2_Availability'
```

---

### **3. Monitorear logs**

```powershell
# Ver logs en tiempo real
Get-Content "C:\SQL-Guard-Observatory\logs\HealthScore_v2_Availability_20251023.log" -Wait -Tail 20

# Buscar errores
Get-ChildItem "C:\SQL-Guard-Observatory\logs\*.log" | 
    Select-String "ERROR|FAIL|Exception" -Context 2,2
```

---

## 🎯 Checklist Final

- [ ] ✅ dbatools instalado (`.\scripts\Install-DbaTools.ps1`)
- [ ] ✅ Test de conectividad exitoso (`.\Test-DbaToolsConnection.ps1`)
- [ ] ✅ Script Availability probado
- [ ] ✅ Script Resources probado
- [ ] ✅ Script Backups probado
- [ ] ✅ Script Maintenance probado
- [ ] ✅ Script Consolidate probado
- [ ] ✅ Scheduled Tasks creadas (`.\scripts\Schedule-HealthScore-v2.ps1`)
- [ ] ✅ Tablas SQL verificadas
- [ ] ✅ Logs monitoreados
- [ ] ✅ Frontend actualizado mostrando datos v2.0

---

## 📚 Comandos Útiles de dbatools

```powershell
# Test de conexión básico
Test-DbaConnection -SqlInstance "SERVER01\INSTANCE"

# Ejecutar query
Invoke-DbaQuery -SqlInstance "SERVER01" -Query "SELECT @@VERSION"

# Obtener bases de datos
Get-DbaDatabase -SqlInstance "SERVER01"

# Obtener último backup
Get-DbaLastBackup -SqlInstance "SERVER01"

# Ver réplicas AlwaysOn
Get-DbaAgReplica -SqlInstance "SERVER01"

# Verificar espacio en disco
Get-DbaDiskSpace -ComputerName "SERVER01"

# Ver índices fragmentados
Get-DbaDbFragmentation -SqlInstance "SERVER01" -Database "MyDB"
```

---

## 📖 Documentación Completa

- 📄 **MIGRACION_DBATOOLS.md** - Detalles técnicos de todos los cambios
- 📄 **GUIA_HEALTHSCORE_V2_PARA_DBAS.md** - Explicación del sistema de scoring
- 📄 **INSTRUCCIONES_HEALTHSCORE_V2.md** - Instrucciones completas de implementación

---

## 🆘 Ayuda

Si tienes problemas:

1. **Verifica dbatools:** `Get-Module -ListAvailable -Name dbatools`
2. **Test conectividad:** `.\Test-DbaToolsConnection.ps1`
3. **Revisa logs:** `Get-Content C:\SQL-Guard-Observatory\logs\*.log -Tail 50`
4. **Consulta docs:** https://docs.dbatools.io

---

**Fecha:** {{ date }}  
**Versión:** 2.0 (dbatools)  
**Estado:** ✅ Listo para producción

