# 🚀 Pasos de Ejecución Completos - Sistema v3.0 (100 puntos)

## 📋 **Resumen de Cambios**

### ✅ **Completado:**
1. Backend: SELECT SQL actualizado para incluir `DiskDetails`
2. Frontend: 
   - Iconos en lugar de emojis (Shield, Database, Server, Wrench)
   - Puntajes actualizados a 100 puntos (40/30/20/10)
   - Eliminado Blocking y Queries lentas de explicación y detalles
3. Scripts PowerShell:
   - Consolidación actualizada para 100 puntos
   - Sincronización AlwaysOn en Backups y Maintenance
   - **Eliminada métrica de fragmentación** (redundante con estado del job)
   - **Corregida detección de AlwaysOn** (ahora usa `SERVERPROPERTY('IsHadrEnabled')` directamente)

---

## 🔧 **PASO 1: Recompilar Backend**

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API
dotnet publish -c Release -o C:\Temp\Backend
```

**Esperado:** Compilación exitosa sin errores.

---

## 🎨 **PASO 2: Recompilar Frontend**

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
npm run build
```

**Esperado:** Build exitoso, archivos generados en `dist/`.

---

## 📦 **PASO 3: Desplegar al Servidor**

### **Backend:**
```powershell
# Detener el sitio o servicio (si aplica)
# Stop-WebSite "SQLGuard API"

# Copiar archivos
xcopy /Y /E C:\Temp\Backend\* "C:\Apps\SQLGuardObservatory\Backend\"

# Si usas servicio de Windows:
# Stop-Service -Name "SQLGuardAPI"
# xcopy /Y /E C:\Temp\Backend\* "C:\Apps\SQLGuardObservatory\Backend\"
# Start-Service -Name "SQLGuardAPI"
```

### **Frontend:**
```powershell
xcopy /Y /E C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\dist\* "C:\Apps\SQLGuardObservatory\Frontend\"
```

---

## 🔄 **PASO 4: Reiniciar IIS**

```powershell
iisreset
```

---

## 📊 **PASO 5: Ejecutar Scripts de Recolección**

### **5.1 - Backups (con sincronización AlwaysOn):**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Backups.ps1
```

**Esperado:**
```
🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn...
  ✅ X grupo(s) identificado(s)
🔄 [POST-PROCESO] Sincronizando backups entre nodos AlwaysOn...
  ✅ Total: X nodos sincronizados
```

### **5.2 - Maintenance (con sincronización AlwaysOn):**
```powershell
.\RelevamientoHealthScore_Maintenance.ps1
```

**Esperado:**
```
🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn...
  ✅ X grupo(s) identificado(s)
  
2️⃣  Recolectando métricas de mantenimiento...
   ✅ SQL01 - CHECKDB:2 days IndexOpt:1 days Errors:0
   ✅ SQL02 - CHECKDB:3 days IndexOpt:2 days Errors:0
   
🔄 [POST-PROCESO] Sincronizando mantenimiento entre nodos AlwaysOn...
  ✅ Total: X nodos sincronizados
  
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - MAINTENANCE                                ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:         45                         ║
║  CHECKDB OK:               42                         ║
║  IndexOptimize OK:         40                         ║
║  Con errores severity 20+: 2                          ║
╚═══════════════════════════════════════════════════════╝
```

**NOTA:** Ya NO muestra fragmentación (se eliminó porque era redundante con el estado del job).  
Ver: `ELIMINACION_METRICA_FRAGMENTACION.md` para detalles.

### **5.3 - Availability (con detección corregida de AlwaysOn):**
```powershell
.\RelevamientoHealthScore_Availability.ps1
```

**Esperado:**
```
   ✅ RSCRM365-01 - Latency:15ms Memory:OK AlwaysOn:Enabled(HEALTHY)
   ✅ TQRSA-02 - Latency:12ms Memory:OK AlwaysOn:Disabled
```

**NOTA:** Ahora detecta correctamente AlwaysOn usando `SERVERPROPERTY('IsHadrEnabled')`.  
Ver: `CORRECCION_ALWAYSON_DETECCION.md` para detalles.

### **5.4 - Resources:**
```powershell
.\RelevamientoHealthScore_Resources.ps1
```

### **5.5 - Consolidación (calcula scores de 100 puntos):**
```powershell
.\RelevamientoHealthScore_Consolidate.ps1
```

**Esperado:**
```
✅ SSPR17MON-01 - Score: 87/100 (Healthy) [T1:35 T2:30 T3:17 T4:5]
```

---

## ✅ **PASO 6: Verificación en SQL**

### **6.1 - Verificar Scores (100 puntos):**
```sql
SELECT TOP 10
    InstanceName,
    HealthScore,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    (Tier1_Availability + Tier2_Continuity + Tier3_Resources + Tier4_Maintenance) AS TotalCalculado,
    CASE 
        WHEN HealthScore = (Tier1_Availability + Tier2_Continuity + Tier3_Resources + Tier4_Maintenance)
        THEN '✅ OK'
        ELSE '❌ ERROR'
    END AS Validacion,
    CollectedAtUtc
FROM dbo.InstanceHealth_Score
ORDER BY CollectedAtUtc DESC;
```

**Esperado:** 
- `HealthScore` debe ser ≤ 100
- `TotalCalculado` debe ser igual a `HealthScore`
- `Validacion` debe ser `✅ OK`

### **6.2 - Verificar Sincronización AlwaysOn (Backups):**
```sql
-- Ejemplo: Verificar que los nodos del mismo AG tengan los mismos backups
SELECT 
    InstanceName,
    LastFullBackup,
    LastLogBackup,
    FullBackupBreached,
    LogBackupBreached,
    CollectedAtUtc
FROM dbo.InstanceHealth_Backups
WHERE InstanceName IN ('NODO1', 'NODO2', 'NODO3')  -- Reemplazar con nodos reales del mismo AG
  AND CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
ORDER BY InstanceName, CollectedAtUtc DESC;
```

**Esperado:** Los nodos del mismo AG deben tener los MISMOS valores de `LastFullBackup` y `LastLogBackup`.

### **6.3 - Verificar Sincronización AlwaysOn (Maintenance):**
```sql
SELECT 
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    CollectedAtUtc
FROM dbo.InstanceHealth_Maintenance
WHERE InstanceName IN ('NODO1', 'NODO2', 'NODO3')  -- Reemplazar con nodos reales del mismo AG
  AND CollectedAtUtc >= DATEADD(HOUR, -2, GETUTCDATE())
ORDER BY InstanceName, CollectedAtUtc DESC;
```

**Esperado:** Los nodos del mismo AG deben tener los MISMOS valores de `LastCheckdb` y `LastIndexOptimize`.

### **6.4 - Verificar Discos:**
```sql
SELECT TOP 5
    InstanceName,
    DiskWorstFreePct,
    DiskDetails,
    CollectedAtUtc
FROM dbo.vw_InstanceHealth_Latest
WHERE DiskDetails IS NOT NULL
ORDER BY CollectedAtUtc DESC;
```

**Esperado:** `DiskDetails` debe tener formato: `C:\|500.5|125.2|25,D:\|1000|750|75`

### **6.5 - Verificar AlwaysOn:**
```sql
-- Verificar que AlwaysOn se detecta correctamente
SELECT 
    CASE WHEN AlwaysOnEnabled = 1 THEN 'Habilitado' ELSE 'Deshabilitado' END AS Estado,
    COUNT(*) AS Total
FROM (
    SELECT 
        AlwaysOnEnabled,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Critical_Availability
    WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
) latest
WHERE rn = 1
GROUP BY AlwaysOnEnabled;

-- Verificar instancias específicas
SELECT 
    InstanceName,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    CollectedAtUtc
FROM dbo.InstanceHealth_Critical_Availability
WHERE InstanceName IN ('RSCRM365-01', 'TQRSA-02')  -- Reemplazar con tus instancias
ORDER BY InstanceName, CollectedAtUtc DESC;
```

**Esperado:** 
- Debería haber instancias con `AlwaysOnEnabled = 1` (habilitado)
- RSCRM365-01 debería tener `AlwaysOnEnabled = 1` (según API)

---

## 🌐 **PASO 7: Verificar Frontend**

### **7.1 - Abrir el navegador:**
```
http://SSMCS-05
```
*(Ajusta la URL según tu servidor)*

### **7.2 - Navegar a HealthScore**

### **7.3 - Verificar:**
- ✅ Los scores se muestran como `X/100` (no `X/150`)
- ✅ Los Tiers muestran: 40/30/20/10 (no 50/40/40/20)
- ✅ Los Tiers usan iconos (Shield, Database, Server, Wrench) en lugar de emojis
- ✅ NO se muestra "Blocking" en ningún lado
- ✅ NO se muestran "Queries lentos" en ningún lado
- ✅ Al expandir una instancia, se muestran **todos los discos** (no solo el peor)
- ✅ Los nodos AlwaysOn tienen los mismos valores de backups/maintenance

---

## 📊 **Verificaciones Adicionales**

### **API Endpoint:**
```powershell
$response = Invoke-RestMethod -Uri "http://SSMCS-05:5000/api/healthscore/latest"
$response | Select-Object -First 1 | Format-List

# Verificar propiedades:
# - healthScore debe ser ≤ 100
# - tier1_Availability debe ser ≤ 40
# - tier2_Continuity debe ser ≤ 30
# - tier3_Resources debe ser ≤ 20
# - tier4_Maintenance debe ser ≤ 10
# - diskSummary.worstFreePct debe existir
# - diskSummary.volumes debe tener lista de discos
```

---

## 📝 **Checklist Final**

```
☑️ PASO 1: Backend compilado
☑️ PASO 2: Frontend compilado
☑️ PASO 3: Archivos desplegados al servidor
☑️ PASO 4: IIS reiniciado
☑️ PASO 5.1: Script Backups ejecutado (con sincronización AG)
☑️ PASO 5.2: Script Maintenance ejecutado (con sincronización AG)
☑️ PASO 5.3: Script Availability ejecutado
☑️ PASO 5.4: Script Resources ejecutado
☑️ PASO 5.5: Script Consolidación ejecutado
☑️ PASO 6.1: Scores verificados en SQL (≤100 puntos)
☑️ PASO 6.2: Sincronización AG Backups verificada
☑️ PASO 6.3: Sincronización AG Maintenance verificada
☑️ PASO 6.4: DiskDetails verificados
☑️ PASO 7: Frontend verificado visualmente
```

---

## 🎯 **Resultado Esperado Final**

### **Frontend:**
```
╔════════════════════════════════════════════════════╗
║ SSMCS-05              Score: 87/100  [✅ Healthy] ║
╠════════════════════════════════════════════════════╣
║                                                    ║
║ Breakdown por Tiers (100 pts):                    ║
║  🛡️  T1: Disponibilidad    35/40                   ║
║  💾  T2: Continuidad       30/30                   ║
║  🖥️  T3: Recursos          15/20                   ║
║  🔧  T4: Mantenimiento      7/10                   ║
║                                                    ║
║ Almacenamiento:                                    ║
║  • Peor Volumen: 25.3% libre                       ║
║  ────────────────────────────────                  ║
║  • C:\  125.2 / 500.5 GB    25.0%  [🚨 Crítico]   ║
║  • D:\  750.0 / 1000.0 GB   75.0%  [✅ OK]        ║
║  • E:\  80.5 / 200.0 GB     40.2%  [⚠️ Warning]   ║
║                                                    ║
╚════════════════════════════════════════════════════╝
```

### **Nodos AlwaysOn (AG-PROD):**
```sql
InstanceName  | LastFullBackup      | LastCheckdb        
--------------+---------------------+--------------------
SQL01         | 2025-10-23 14:30:00 | 2025-10-22 01:00:00
SQL02         | 2025-10-23 14:30:00 | 2025-10-22 01:00:00  -- ✅ MISMO valor
SQL03         | 2025-10-23 14:30:00 | 2025-10-22 01:00:00  -- ✅ MISMO valor
```

---

## 🎉 **¡Sistema v3.0 Completamente Implementado!**

- ✅ 100 puntos funcionando
- ✅ AlwaysOn sincronizado
- ✅ Frontend con iconos
- ✅ Blocking y Queries deshabilitados
- ✅ Todos los discos visibles
- ✅ Backend y Frontend actualizados

---

## 📚 **Documentación Adicional**

- `IMPLEMENTACION_ALWAYSON_SYNC.md` - Detalles de sincronización AlwaysOn
- `ACTUALIZACION_CONSOLIDATE_V3_FINAL.md` - Cambios en el script de consolidación
- `ACTUALIZACION_MOSTRAR_TODOS_DISCOS.md` - Cambios en el sistema de discos
- `HEALTH_SCORE_V3_100_PUNTOS.md` - Sistema de puntuación completo
- `RESUMEN_CAMBIOS_COMPLETOS_V3.md` - Resumen ejecutivo de todos los cambios

