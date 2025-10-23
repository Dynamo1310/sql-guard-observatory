# 🔧 Solución: Conflicto de Módulos dbatools + SqlServer

## ❌ Problema Detectado

Al ejecutar los scripts con dbatools, obtenías estos errores:

```
❌ Error: Could not load file or assembly 'Microsoft.Data.SqlClient, Version=5.0.0.0'
Assembly with same name is already loaded
```

**Causa raíz:** Los módulos `SqlServer` (con `Invoke-Sqlcmd`) y `dbatools` usan **versiones diferentes** de la misma DLL `Microsoft.Data.SqlClient`, causando un conflicto.

---

## ✅ Soluciones Implementadas

### **1. Descarga automática del módulo SqlServer**

Todos los scripts ahora descargan el módulo `SqlServer` antes de importar `dbatools`:

```powershell
# Descargar SqlServer si está cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force -ErrorAction Stop
```

---

### **2. Agregado `-TrustServerCertificate` a todas las conexiones**

Tenías razón - faltaba este parámetro. Ahora **TODOS** los comandos de dbatools lo incluyen:

```powershell
# Test de conexión
$connection = Test-DbaConnection -SqlInstance $instance -TrustServerCertificate -EnableException

# Ejecutar queries
$data = Invoke-DbaQuery -SqlInstance $instance -Query $query -TrustServerCertificate -EnableException
```

---

## 📋 Scripts Actualizados

✅ `RelevamientoHealthScore_Availability.ps1`  
✅ `RelevamientoHealthScore_Resources.ps1`  
✅ `RelevamientoHealthScore_Backups.ps1`  
✅ `RelevamientoHealthScore_Maintenance.ps1`  
✅ `RelevamientoHealthScore_Consolidate.ps1`  
✅ `Test-DbaToolsConnection.ps1`  
✅ `scripts/Install-DbaTools.ps1`

---

## 🚀 Cómo Probar Ahora

### **Opción A: Nueva Sesión de PowerShell (RECOMENDADO)**

```powershell
# 1. CIERRA la ventana de PowerShell actual
# 2. ABRE una nueva ventana de PowerShell
# 3. Navega al directorio

cd C:\Temp\Tobi\ScriptsApp

# 4. Prueba nuevamente
.\RelevamientoHealthScore_Availability.ps1 -Verbose
```

**¿Por qué?** Esto garantiza que no haya módulos cargados en memoria.

---

### **Opción B: Forzar descarga de módulos**

Si no puedes cerrar la sesión:

```powershell
# Descargar TODOS los módulos
Remove-Module SqlServer, dbatools -Force -ErrorAction SilentlyContinue

# Importar solo dbatools
Import-Module dbatools -Force

# Probar
.\RelevamientoHealthScore_Availability.ps1 -Verbose
```

---

## 🧪 Test Rápido

```powershell
# Verificar que dbatools carga correctamente
cd C:\Temp\Tobi\ScriptsApp
.\Test-DbaToolsConnection.ps1 -Top 5
```

**Resultado esperado:**
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN                                              ║
║  Total probadas:    5                                 ║
║  ✅ Exitosas:       5                                 ║
║  ❌ Fallidas:       0                                 ║
║  ⚡ Latencia promedio: 35ms                           ║
╚═══════════════════════════════════════════════════════╝

✅ Instancias conectadas exitosamente
```

---

## 📊 Diferencias Clave: Antes vs Después

### **Antes:**
```powershell
# Sin TrustServerCertificate
$data = Invoke-DbaQuery -SqlInstance $instance -Query $query

# Sin manejo de conflictos
Import-Module dbatools
```

### **Después:**
```powershell
# ✅ Con TrustServerCertificate
$data = Invoke-DbaQuery -SqlInstance $instance -Query $query -TrustServerCertificate

# ✅ Con manejo de conflictos
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}
Import-Module dbatools -Force
```

---

## ⚠️ Si Aún Tienes Problemas

### **Error: "SIN CONEXIÓN" en todas las instancias**

Si después de estos cambios sigues viendo:
```
⚠️   - SIN CONEXIÓN
⚠️   - SIN CONEXIÓN
```

**Diagnóstico:**

```powershell
# Verificar estructura del JSON de la API
$response = Invoke-RestMethod -Uri "http://asprbm-nov-01/InventoryDBA/inventario/"
$response.message | Select-Object -First 5 | Format-List *
```

**Busca qué propiedad contiene el nombre de la instancia:**
- ¿Es `nombreInstancia`?
- ¿Es `instanceName`?
- ¿Es `name`?
- ¿Es `serverName`?

**Si es diferente a `nombreInstancia`, avísame** y actualizaré los scripts para usar la propiedad correcta.

---

## ✅ Checklist de Verificación

- [ ] Cerrar sesión actual de PowerShell
- [ ] Abrir nueva sesión de PowerShell
- [ ] Verificar que dbatools carga: `Import-Module dbatools -Force`
- [ ] Probar test de conectividad: `.\Test-DbaToolsConnection.ps1`
- [ ] Probar script Availability: `.\RelevamientoHealthScore_Availability.ps1`
- [ ] Verificar resultados en SQL: `SELECT TOP 10 * FROM dbo.InstanceHealth_Critical_Availability ORDER BY CollectedAtUtc DESC`

---

## 🎯 Resultado Esperado

Después de estos cambios, deberías ver:

```
╔═══════════════════════════════════════════════════════╗
║  Health Score v2.0 - AVAILABILITY METRICS             ║
╚═══════════════════════════════════════════════════════╝

1️⃣  Obteniendo instancias desde API...
   Total encontradas: 177
   Después de filtros: 177

2️⃣  Recolectando métricas de disponibilidad...
   ✅ SERVER01\INST01 - Lat:45ms Block:0 PLE:1200
   ✅ SERVER02\INST02 - Lat:32ms Block:0 PLE:3500
   ✅ SERVER03\INST03 - Lat:28ms Block:1 PLE:2800
   ...

3️⃣  Guardando en SQL Server...
   ✅ Guardados 177 registros en SQL Server

╔═══════════════════════════════════════════════════════╗
║  RESUMEN - AVAILABILITY                               ║
║  Total instancias:     177                            ║
║  Conectadas:           175                            ║
║  Con blocking:         3                              ║
║  Memory pressure:      12                             ║
║  AlwaysOn enabled:     45                             ║
╚═══════════════════════════════════════════════════════╝

✅ Script completado!
```

---

**¿Funciona ahora? Prueba con una nueva sesión de PowerShell y avísame!** 🚀

---

**Fecha:** 23 de Octubre de 2025  
**Versión:** Health Score v2.0 (dbatools + TrustServerCertificate)

