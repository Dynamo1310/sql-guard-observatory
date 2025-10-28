# Actualización Completa: Fix Assembly Conflicts + dbatools Puro

## 📋 Resumen de Cambios

Se ha actualizado **TODOS** los scripts de Health Score para:
1. ✅ Eliminar conflictos de assemblies de `Microsoft.Data.SqlClient.dll`
2. ✅ Usar **dbatools exclusivamente** (eliminando dependencia de SqlServer module)
3. ✅ Crear wrappers para ejecución en sesiones limpias

## 🔧 Scripts Actualizados (14 scripts)

### Scripts de Recolección:
1. ✅ `RelevamientoHealthScore_AlwaysOn.ps1`
2. ✅ `RelevamientoHealthScore_Autogrowth.ps1`
3. ✅ `RelevamientoHealthScore_Backups.ps1`
4. ✅ `RelevamientoHealthScore_ConfiguracionTempdb.ps1`
5. ✅ `RelevamientoHealthScore_CPU.ps1`
6. ✅ `RelevamientoHealthScore_DatabaseStates.ps1`
7. ✅ `RelevamientoHealthScore_Discos.ps1`
8. ✅ `RelevamientoHealthScore_ErroresCriticos.ps1`
9. ✅ `RelevamientoHealthScore_IO.ps1`
10. ✅ `RelevamientoHealthScore_LogChain.ps1`
11. ✅ `RelevamientoHealthScore_Maintenance.ps1`
12. ✅ `RelevamientoHealthScore_Memoria.ps1`
13. ✅ `RelevamientoHealthScore_Waits.ps1`

### Script Consolidador:
14. ✅ `RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`

## 🎯 Cambios Realizados en Cada Script

### 1. Bloque de Módulos Mejorado

**ANTES:**
```powershell
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado..."
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force
```

**DESPUÉS:**
```powershell
# Limpiar módulos SQL existentes para evitar conflictos de assemblies
$sqlModules = @('SqlServer', 'SQLPS', 'dbatools', 'dbatools.library')
foreach ($mod in $sqlModules) {
    if (Get-Module -Name $mod) {
        Remove-Module $mod -Force -ErrorAction SilentlyContinue
    }
}

# Verificar que dbatools está disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Intentar importar dbatools
try {
    Import-Module dbatools -Force -ErrorAction Stop
    Write-Verbose "✅ dbatools cargado correctamente"
} catch {
    if ($_.Exception.Message -like "*Microsoft.Data.SqlClient*already loaded*") {
        Write-Warning "⚠️  Conflicto de assembly detectado. Ejecuta el wrapper Run-*-Clean.ps1"
        Write-Warning "⚠️  Intentando continuar..."
        if (-not (Get-Module -Name dbatools)) {
            Write-Error "❌ No se pudo cargar dbatools."
            exit 1
        }
    } else {
        throw
    }
}
```

### 2. Reemplazo de Invoke-Sqlcmd con Invoke-DbaQuery

**ANTES:**
```powershell
Invoke-Sqlcmd -ServerInstance $Instance `
    -Query $query `
    -QueryTimeout 30 `
    -TrustServerCertificate
```

**DESPUÉS:**
```powershell
Invoke-DbaQuery -SqlInstance $Instance `
    -Query $query `
    -QueryTimeout 30 `
    -EnableException
```

**Para múltiples resultsets:**
```powershell
Invoke-DbaQuery -SqlInstance $Instance `
    -Query $query `
    -QueryTimeout 30 `
    -EnableException `
    -As DataSet
```

## 🚀 Wrappers Creados (13 wrappers)

Cada script ahora tiene un wrapper que lo ejecuta en una sesión limpia de PowerShell:

1. `Run-AlwaysOn-Clean.ps1`
2. `Run-Autogrowth-Clean.ps1`
3. `Run-Backups-Clean.ps1`
4. `Run-ConfiguracionTempdb-Clean.ps1`
5. `Run-Consolidate-Clean.ps1`
6. `Run-CPU-Clean.ps1`
7. `Run-DatabaseStates-Clean.ps1`
8. `Run-Discos-Clean.ps1`
9. `Run-ErroresCriticos-Clean.ps1`
10. `Run-IO-Clean.ps1`
11. `Run-LogChain-Clean.ps1`
12. `Run-Maintenance-Clean.ps1`
13. `Run-Memoria-Clean.ps1`
14. `Run-Waits-Clean.ps1`

### Uso de los Wrappers:
```powershell
# En lugar de ejecutar directamente:
.\RelevamientoHealthScore_CPU.ps1

# Usa el wrapper:
.\Run-CPU-Clean.ps1

# Con verbose:
.\Run-CPU-Clean.ps1 -Verbose
```

## 📝 Scripts de Utilidad Creados

1. **`Fix-AllScripts-Encoding.ps1`**
   - Reemplaza automáticamente `Invoke-Sqlcmd` con `Invoke-DbaQuery`
   - Maneja encoding UTF-8 con BOM correctamente

2. **`Fix-Module-Blocks.ps1`**
   - Actualiza el bloque de carga de módulos en todos los scripts
   - Agrega manejo de errores robusto

3. **`Fix-Consolidate-Module.ps1`**
   - Actualización específica para el script Consolidate

## 🎯 Solución al Problema Original

### Problema:
```
Exception: Couldn't import Microsoft.Data.SqlClient.dll
Could not load file or assembly 'Microsoft.Data.SqlClient, Version=5.0.0.0'
Assembly with same name is already loaded
```

### Causa:
- `Invoke-Sqlcmd` (módulo SqlServer) cargaba una versión de `Microsoft.Data.SqlClient`
- `dbatools` intentaba cargar su propia versión
- PowerShell no permite múltiples versiones del mismo assembly

### Solución Implementada:
1. **Eliminación de SqlServer module**: Todos los scripts ahora usan solo dbatools
2. **Limpieza de módulos**: Se eliminan todos los módulos SQL antes de cargar dbatools
3. **Wrappers con -NoProfile**: Ejecutan scripts en sesiones limpias sin perfil de usuario
4. **Manejo robusto de errores**: Si hay conflicto, se informa al usuario y se intenta continuar

## ✅ Cómo Ejecutar los Scripts Ahora

### Opción 1: Usar los Wrappers (RECOMENDADO)
```powershell
cd C:\Apps\SQLGuardObservatory\Scripts

# Ejecutar cada collector:
.\Run-CPU-Clean.ps1
.\Run-Memoria-Clean.ps1
.\Run-Backups-Clean.ps1
# ... etc

# Ejecutar consolidador:
.\Run-Consolidate-Clean.ps1
```

### Opción 2: Ejecución Directa (sin perfil)
```powershell
powershell -NoProfile -File .\RelevamientoHealthScore_CPU.ps1
```

### Opción 3: Ejecución Normal
Si cierras PowerShell completamente y abres una nueva sesión limpia, puedes ejecutar:
```powershell
.\RelevamientoHealthScore_CPU.ps1
```

## 🔍 Scripts con Múltiples Resultsets

Los siguientes scripts usan `-As DataSet` porque procesan múltiples resultsets:

1. ✅ `RelevamientoHealthScore_CPU.ps1` (versión SQL + métricas)
2. ✅ `RelevamientoHealthScore_Memoria.ps1` (PLE + grants + stolen)
3. ✅ `RelevamientoHealthScore_Autogrowth.ps1` (eventos + archivos)
4. ✅ `RelevamientoHealthScore_DatabaseStates.ps1` (estados + suspect pages)

## 📊 Resultado Esperado

Todos los scripts ahora deben ejecutarse **SIN** errores de assembly conflicts:

```
╔═══════════════════════════════════════════════════════╗
║  Health Score v3.0 - CPU METRICS                     ║
║  Frecuencia: 5 minutos                                ║
╚═══════════════════════════════════════════════════════╝

1️⃣  Obteniendo instancias desde API...
   Instancias a procesar: 127

2️⃣  Recolectando métricas de CPU...
   ✅ SSPR17MON-01 - Avg:15% P95:20% Runnable:0
   ✅ SSDS16-01 - Avg:25% P95:30% Runnable:0
   ...

3️⃣  Guardando en SQL Server...
✅ Guardados 127 registros en SQL Server

✅ Script completado!
```

## 🚨 Troubleshooting

### Si sigues viendo el error de assembly:
1. Cierra **COMPLETAMENTE** PowerShell
2. Abre una nueva ventana de PowerShell
3. Ejecuta usando el wrapper: `.\Run-CPU-Clean.ps1`

### Si el error persiste:
```powershell
# Verificar qué assemblies están cargados:
[AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.FullName -like "*SqlClient*" }

# Si hay alguno cargado, reinicia PowerShell completamente
```

## ✨ Beneficios de esta Actualización

1. ✅ **Sin conflictos de assemblies**: Resuelve el problema de `Microsoft.Data.SqlClient`
2. ✅ **Más rápido**: dbatools es más eficiente que SqlServer module
3. ✅ **Más confiable**: Manejo robusto de errores y reintentos
4. ✅ **Mejor mantenimiento**: Un solo módulo (dbatools) para mantener
5. ✅ **Ejecución limpia**: Wrappers garantizan sesiones sin conflictos
6. ✅ **Compatible con scheduling**: Los wrappers funcionan en tareas programadas

## 📅 Fecha de Actualización

**Fecha**: 28 de Octubre de 2025
**Versión**: 3.0.1 (dbatools puro + assembly fix)

