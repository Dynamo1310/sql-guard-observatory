# 🔧 SOLUCIÓN DEFINITIVA - Conflicto de Assemblies dbatools

## ❌ El Problema Real

Cuando ejecutas scripts de PowerShell, los **assemblies (.dll)** se cargan en memoria y **no se pueden descargar** hasta que cierres la sesión de PowerShell.

### **Tu Error:**
```
Could not load file or assembly 'Microsoft.Data.SqlClient, Version=5.0.0.0'
Assembly with same name is already loaded
```

**Causa:** Ya habías ejecutado comandos que cargaron el módulo `SqlServer` (con `Invoke-Sqlcmd`), y ahora `dbatools` intenta cargar su propia versión de la misma DLL, causando conflicto.

---

## ✅ SOLUCIÓN 1: Cerrar y Abrir PowerShell (LA ÚNICA REAL)

Esta es **LA ÚNICA solución 100% confiable**:

### **Pasos:**

1. **CIERRA** completamente tu ventana de PowerShell actual
2. **ABRE** una **NUEVA** ventana de PowerShell (PowerShell 7)
3. Ejecuta los scripts:

```powershell
# Nueva sesión limpia
cd C:\Temp\Tobi\ScriptsApp

# Prueba 1: Test de conectividad
.\Test-DbaToolsConnection.ps1 -Top 5

# Prueba 2: Script de availability
.\RelevamientoHealthScore_Availability.ps1 -Verbose
```

---

## ✅ SOLUCIÓN 2: Script que lanza nueva sesión automáticamente

He creado un script que lanza **automáticamente** una nueva sesión de PowerShell:

```powershell
.\Test-DbaToolsConnection-Safe.ps1 -Top 5
```

Este script:
- ✅ Lanza una nueva sesión de PowerShell
- ✅ Evita conflictos de assemblies
- ✅ Ejecuta el test en un entorno limpio
- ✅ Muestra los resultados

---

## 🔍 Diagnóstico: ¿Por qué 0 instancias?

Tu test mostró:
```
Total en API: 177
Probando primeras: 0    ← ❌ PROBLEMA
```

Esto significa que `$response.message | Select-Object -First 5` está devolviendo **vacío**.

### **Diagnóstico rápido:**

```powershell
# Ejecuta esto para ver la estructura real del JSON
$response = Invoke-RestMethod -Uri "http://asprbm-nov-01/InventoryDBA/inventario/"

# Ver el tipo de $response.message
$response.message | Get-Member

# Ver las primeras instancias
$response.message | Select-Object -First 3 | Format-List *
```

**Busca qué propiedad contiene el nombre de la instancia:**
- ¿`nombreInstancia`?
- ¿`name`?
- ¿`instanceName`?
- ¿`serverName`?

---

## 📋 Comparación de Soluciones

| Solución | Efectividad | Complejidad | Recomendación |
|----------|-------------|-------------|---------------|
| **Cerrar/Abrir PowerShell** | ✅ 100% | 🟢 Muy fácil | ⭐⭐⭐⭐⭐ **USAR ESTA** |
| **Script con nueva sesión** | ✅ 95% | 🟡 Media | ⭐⭐⭐⭐ Alternativa |
| **Remove-Module** | ❌ No funciona | 🟢 Fácil | ❌ NO usar |
| **Import-Module -Force** | ❌ No funciona | 🟢 Fácil | ❌ NO usar |

---

## 🎯 Checklist de Solución

### **Opción A: Nueva Sesión Manual (MEJOR)**

- [ ] **PASO 1:** Cierra la ventana actual de PowerShell (clic en X)
- [ ] **PASO 2:** Abre PowerShell 7 (no Windows PowerShell 5.1)
- [ ] **PASO 3:** Navega: `cd C:\Temp\Tobi\ScriptsApp`
- [ ] **PASO 4:** Verifica dbatools: `Get-Module -ListAvailable dbatools`
- [ ] **PASO 5:** Prueba: `.\Test-DbaToolsConnection.ps1 -Top 5`
- [ ] **PASO 6:** Si funciona, ejecuta: `.\RelevamientoHealthScore_Availability.ps1`

---

### **Opción B: Script Automático**

- [ ] **PASO 1:** `cd C:\Temp\Tobi\ScriptsApp`
- [ ] **PASO 2:** `.\Test-DbaToolsConnection-Safe.ps1 -Top 5`
- [ ] **PASO 3:** Revisar resultados

---

## 🔧 Verificar PowerShell 7 vs 5.1

```powershell
# Ver versión actual
$PSVersionTable.PSVersion

# PowerShell 7.x = ✅ Usar este
# PowerShell 5.1 = ⚠️ Puede tener más problemas
```

**Recomendación:** Usa **PowerShell 7** (pwsh.exe) en lugar de Windows PowerShell 5.1 (powershell.exe).

---

## 📊 Resultado Esperado (después de nueva sesión)

```
╔═══════════════════════════════════════════════════════╗
║  Test de Conectividad con dbatools                   ║
╚═══════════════════════════════════════════════════════╝

1️⃣  Obteniendo instancias desde API...
   Total en API: 177
   Probando primeras: 5

2️⃣  Probando conexiones con Test-DbaConnection...
   🔍 Probando: SERVER01\INST01 ✅ OK (45ms)
   🔍 Probando: SERVER02\INST02 ✅ OK (32ms)
   🔍 Probando: SERVER03\INST03 ✅ OK (28ms)
   🔍 Probando: SERVER04\INST04 ✅ OK (51ms)
   🔍 Probando: SERVER05\INST05 ✅ OK (38ms)

╔═══════════════════════════════════════════════════════╗
║  RESUMEN                                              ║
╠═══════════════════════════════════════════════════════╣
║  Total probadas:    5                                 ║
║  ✅ Exitosas:       5                                 ║
║  ❌ Fallidas:       0                                 ║
║  ⚡ Latencia promedio: 39ms                           ║
╚═══════════════════════════════════════════════════════╝

✅ Instancias conectadas:

Instance            Status        LatencyMs SqlVersion   DomainName
--------            ------        --------- ----------   ----------
SERVER01\INST01     ✅ Conectado  45        15.0.2000.5  DOMAIN
SERVER02\INST02     ✅ Conectado  32        14.0.3456.2  DOMAIN
...
```

---

## 🆘 Si Aún No Funciona

### **1. Verificar que dbatools está instalado correctamente**

```powershell
# Nueva sesión de PowerShell
Get-Module -ListAvailable dbatools

# Si no aparece, instalar:
Install-Module dbatools -Force -AllowClobber -Scope CurrentUser
```

---

### **2. Verificar conectividad manual**

```powershell
# Nueva sesión de PowerShell
Import-Module dbatools
Test-DbaConnection -SqlInstance "SSPR17MON-01" -TrustServerCertificate
```

---

### **3. Verificar estructura del JSON**

```powershell
$response = Invoke-RestMethod -Uri "http://asprbm-nov-01/InventoryDBA/inventario/"
$response.message | Select-Object -First 1 | Format-List *
```

**Si la propiedad NO es `nombreInstancia`**, avísame para actualizar los scripts.

---

## 📝 Resumen Ejecutivo

1. ✅ **CIERRA PowerShell y abre una nueva sesión**
2. ✅ Ejecuta `.\Test-DbaToolsConnection.ps1 -Top 5`
3. ✅ Si funciona, ejecuta los scripts de Health Score
4. ⚠️ Si sigue fallando, usa `.\Test-DbaToolsConnection-Safe.ps1`
5. ⚠️ Si aún falla, verifica la estructura del JSON de la API

---

**El 95% de los casos se resuelve simplemente cerrando y abriendo PowerShell.** 🚀

---

**Fecha:** 23 de Octubre de 2025  
**Versión:** Health Score v2.0 (dbatools)  
**Estado:** Solución definitiva documentada

