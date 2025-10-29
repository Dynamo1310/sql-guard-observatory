# 🔧 Solución: PowerShell 7 vs PowerShell 5.1 en Task Scheduler

## 🎯 El Problema

Los collectors funcionan manualmente pero **NO guardan datos** cuando se ejecutan desde Task Scheduler.

### ❌ Síntoma
- ✅ Ejecutar manualmente: `.\RelevamientoHealthScore_CPU.ps1` → **FUNCIONA**
- ❌ Ejecutar desde Task Scheduler → **NO guarda datos en SQL**
- ✅ Event Viewer muestra que la tarea se ejecutó sin errores
- ❌ Pero las tablas `InstanceHealth_*` no tienen datos nuevos

---

## 🔍 Causa Raíz

**PowerShell 5.1 vs PowerShell 7**

| Aspecto | PowerShell 5.1 | PowerShell 7+ |
|---------|----------------|---------------|
| **Ejecutable** | `PowerShell.exe` | `pwsh.exe` |
| **Ruta** | `C:\Windows\System32\WindowsPowerShell\v1.0\` | `C:\Program Files\PowerShell\7\` |
| **Módulos** | `%USERPROFILE%\Documents\WindowsPowerShell\Modules` | `%USERPROFILE%\Documents\PowerShell\Modules` |
| **Built-in** | Incluido en Windows | Instalación separada |
| **dbatools** | Puede no estar instalado | Instalado aquí ✅ |

### Lo que Pasaba

1. Instalaste dbatools en **PowerShell 7**
2. Cuando ejecutas manualmente, usas **PowerShell 7** (`pwsh.exe`)
3. Task Scheduler estaba configurado con **PowerShell.exe** (5.1)
4. PowerShell 5.1 no encontraba dbatools → Scripts fallaban silenciosamente

---

## ✅ Solución Aplicada

El script `Schedule-HealthScore-v3-FINAL.ps1` ahora usa **PowerShell 7 por defecto**:

```powershell
# Ahora usa pwsh.exe por defecto
[string]$PowerShellPath = "C:\Program Files\PowerShell\7\pwsh.exe"
```

---

## 🚀 Uso

### Opción 1: Usar PowerShell 7 (Recomendado)

```powershell
# Crear tareas con PowerShell 7 (default)
.\Schedule-HealthScore-v3-FINAL.ps1 -ApiBaseUrl "http://asprbm-nov-01:5000"
```

Las tareas se crearán usando `pwsh.exe`.

### Opción 2: Forzar PowerShell 5.1

Si por alguna razón necesitas usar PowerShell 5.1:

```powershell
# Usar PowerShell 5.1
.\Schedule-HealthScore-v3-FINAL.ps1 `
    -ApiBaseUrl "http://asprbm-nov-01:5000" `
    -PowerShellPath "PowerShell.exe"
```

**NOTA:** Si usas PowerShell 5.1, debes instalar dbatools en ese entorno:

```powershell
# Desde PowerShell 5.1 (PowerShell.exe)
Install-Module -Name dbatools -Scope AllUsers -Force
```

---

## 🔍 Verificar qué PowerShell Usa una Tarea

```powershell
# Ver configuración de una tarea
$task = Get-ScheduledTask -TaskName "HealthScore_v3.2_CPU"
$task.Actions[0].Execute

# Debe mostrar:
# C:\Program Files\PowerShell\7\pwsh.exe  ← PowerShell 7 ✅
# PowerShell.exe                          ← PowerShell 5.1 ⚠️
```

---

## 🧪 Probar Módulos en Cada Versión

### PowerShell 7:
```powershell
# Ejecutar PowerShell 7
pwsh.exe

# Ver módulos disponibles
Get-Module -ListAvailable -Name dbatools
```

### PowerShell 5.1:
```powershell
# Ejecutar PowerShell 5.1
powershell.exe

# Ver módulos disponibles
Get-Module -ListAvailable -Name dbatools
```

Si dbatools solo aparece en uno, ahí está el problema.

---

## 🎓 Lecciones Aprendidas

1. **PowerShell 5.1 y PowerShell 7 son entornos separados**
   - Diferentes rutas de módulos
   - Instalaciones de módulos independientes

2. **Task Scheduler por defecto usa PowerShell.exe (5.1)**
   - Debes especificar explícitamente `pwsh.exe` para usar PowerShell 7

3. **Los módulos deben estar instalados en el contexto correcto**
   - Si usas `pwsh.exe`, instala módulos en PowerShell 7
   - Si usas `PowerShell.exe`, instala módulos en PowerShell 5.1

4. **`-NoProfile` oculta problemas**
   - Task Scheduler usa `-NoProfile` por defecto
   - No carga módulos del perfil de usuario
   - Mejor instalar módulos con `-Scope AllUsers`

---

## 📋 Checklist de Configuración

- [ ] PowerShell 7 instalado en `C:\Program Files\PowerShell\7\pwsh.exe`
- [ ] dbatools instalado para PowerShell 7: `pwsh -Command "Get-Module -ListAvailable dbatools"`
- [ ] Script `Schedule-HealthScore-v3-FINAL.ps1` actualizado con parámetro `$PowerShellPath`
- [ ] Tareas creadas con `pwsh.exe`
- [ ] Prueba manual exitosa: `Start-ScheduledTask -TaskName "HealthScore_v3.2_CPU"`
- [ ] Datos guardándose en tablas `InstanceHealth_*`

---

## 🆘 Troubleshooting

### Problema: "pwsh.exe no encontrado"

**Solución:** Instalar PowerShell 7

```powershell
# Descargar e instalar PowerShell 7
winget install --id Microsoft.Powershell --source winget

# O descarga manual desde:
# https://github.com/PowerShell/PowerShell/releases
```

### Problema: dbatools no encontrado en PowerShell 7

**Solución:** Instalar en PowerShell 7

```powershell
# Desde PowerShell 7
pwsh -Command "Install-Module -Name dbatools -Scope AllUsers -Force"
```

### Problema: Quiero usar PowerShell 5.1

**Solución:** Instalar dbatools allí también

```powershell
# Desde PowerShell 5.1
PowerShell.exe -Command "Install-Module -Name dbatools -Scope AllUsers -Force"
```

---

## 📚 Referencias

- [PowerShell 7 vs Windows PowerShell 5.1](https://docs.microsoft.com/powershell/scripting/whats-new/differences-from-windows-powershell)
- [dbatools Installation Guide](https://dbatools.io/download/)
- [Task Scheduler PowerShell Best Practices](https://docs.microsoft.com/windows-server/administration/windows-commands/schtasks)

---

**Última actualización:** Octubre 2024  
**Problema reportado por:** TB03260ADM  
**Solución:** Usar `pwsh.exe` en lugar de `PowerShell.exe`

