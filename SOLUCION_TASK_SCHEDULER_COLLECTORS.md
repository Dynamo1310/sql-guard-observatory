# 🔧 Solución: Collectors no guardan datos desde Task Scheduler

## 🎯 Problema

Los scripts PowerShell (`.ps1`) funcionan perfectamente cuando los ejecutas manualmente, pero cuando se ejecutan desde Task Scheduler **no guardan datos en SQL Server**.

## ❌ NO Recomendado: Ejecutar desde Backend

**Razones para NO hacerlo:**

1. ✋ **Cambio arquitectónico innecesario**: El sistema está diseñado para que los collectors sean independientes
2. 🔴 **Punto único de falla**: Si el backend cae, todos los collectors dejan de funcionar
3. 🐌 **Performance**: El backend quedaría bloqueado ejecutando scripts pesados
4. 🔒 **Mismos problemas de permisos**: El backend tendría los mismos problemas que Task Scheduler
5. 🛠️ **Complejidad**: Requiere refactorizar todo el backend para invocar PowerShell

## ✅ Solución Recomendada: Arreglar Task Scheduler

### 📋 Causas Comunes

| Problema | Síntoma | Solución |
|----------|---------|----------|
| **Usuario incorrecto** | Script corre pero no tiene permisos SQL | Cambiar usuario de la tarea |
| **Módulos no disponibles** | dbatools no se encuentra | Instalar para el usuario correcto |
| **Sin permisos SQL** | Error de INSERT | Agregar rol db_datawriter |
| **Conflicto SqlServer** | Cmdlets incorrectos | Remover módulo SqlServer |
| **Sin privilegios elevados** | Acceso denegado | Ejecutar con highest privileges |

---

## 🚀 Pasos de Solución

### 1️⃣ Ejecutar Diagnóstico

```powershell
# Ejecuta como el MISMO usuario que usarás en Task Scheduler
.\Diagnosticar-TaskScheduler-Collectors.ps1

# O especifica parámetros:
.\Diagnosticar-TaskScheduler-Collectors.ps1 `
    -TaskNamePattern "HealthScore_v3*" `
    -SqlServer "SSPR17MON-01" `
    -SqlDatabase "SQLNova"
```

Este script te mostrará todos los problemas detectados.

---

### 2️⃣ Configurar Usuario Correcto

**Opción A: Usar tu usuario de dominio (Recomendado)**

1. Abre Task Scheduler (`taskschd.msc`)
2. Busca una tarea: `HealthScore_v3.2_IO`
3. Click derecho → **Properties**
4. Tab **General**:
   - ✅ **Run whether user is logged on or not**
   - ✅ **Run with highest privileges**
   - Click **Change User or Group**
   - Ingresa tu usuario: `DOMAIN\TB03260` (ejemplo)
   - Click OK

5. Te pedirá la contraseña → Ingrésala

6. Repite para **todas las tareas** de HealthScore

**Opción B: Usar cuenta de servicio**

Si tienes una cuenta de servicio dedicada:

```powershell
# Crear todas las tareas con el usuario correcto
.\Schedule-HealthScore-v3-FINAL.ps1 `
    -ScriptsPath "C:\Apps\SQLGuardObservatory\Scripts" `
    -ApiBaseUrl "http://asprbm-nov-01:5000" `
    -TaskUser "DOMAIN\svc_sqlmonitor"
```

---

### 3️⃣ Instalar dbatools para el Usuario

Instala dbatools para el usuario que ejecutará las tareas:

```powershell
# Como el usuario que ejecutará las tareas
Install-Module -Name dbatools -Scope CurrentUser -Force

# Verificar instalación
Get-Module -ListAvailable -Name dbatools

# Si aparece SqlServer (causa conflictos), remuévelo:
Uninstall-Module -Name SqlServer -Force
```

---

### 4️⃣ Configurar Permisos en SQL Server

Ejecuta esto en SQL Server Management Studio:

```sql
-- Reemplaza con tu usuario
USE SQLNova;
GO

-- Dar permisos de escritura
ALTER ROLE db_datawriter ADD MEMBER [DOMAIN\TB03260];
GO

-- Verificar
SELECT 
    dp.name AS [User],
    dp.type_desc AS [Type],
    r.name AS [Role]
FROM sys.database_principals dp
LEFT JOIN sys.database_role_members drm ON dp.principal_id = drm.member_principal_id
LEFT JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
WHERE dp.name = 'DOMAIN\TB03260';
GO
```

---

### 5️⃣ Configurar Execution Policy

Las tareas deben ejecutarse con estos argumentos:

```powershell
-NoProfile -ExecutionPolicy Bypass -File "C:\Path\To\Script.ps1"
```

**Para actualizar una tarea existente:**

1. Task Scheduler → Properties de la tarea
2. Tab **Actions** → Edit
3. **Add arguments**: `-NoProfile -ExecutionPolicy Bypass -File "C:\Apps\SQLGuardObservatory\Scripts\RelevamientoHealthScore_IO.ps1"`

---

### 6️⃣ Verificar Path del Script

Asegúrate de que el path completo sea correcto:

```powershell
# Verificar que el archivo existe
Test-Path "C:\Apps\SQLGuardObservatory\Scripts\RelevamientoHealthScore_IO.ps1"

# Debe devolver: True
```

---

### 7️⃣ Probar Ejecución Manual

Ejecuta la tarea manualmente para verificar:

```powershell
# Ejecutar una tarea
Start-ScheduledTask -TaskName "HealthScore_v3.2_IO"

# Ver resultado
Get-ScheduledTaskInfo -TaskName "HealthScore_v3.2_IO" | 
    Select-Object LastRunTime, LastTaskResult, NextRunTime

# LastTaskResult debe ser 0 (éxito)
```

---

### 8️⃣ Verificar Logs

**Event Viewer:**

1. Abre Event Viewer (`eventvwr.msc`)
2. Ve a: **Windows Logs → Application**
3. Filtra por: **Source = Task Scheduler**
4. Busca errores relacionados con tus tareas

**Logs de PowerShell:**

Si configuraste logging, revisa:
```powershell
# Ver últimas ejecuciones
Get-Content "C:\Apps\SQLGuardObservatory\Logs\IO_*.log" -Tail 50
```

---

## 🔍 Diagnóstico Avanzado

### Crear una Tarea de Prueba

Crea una tarea simple que escriba a un archivo:

```powershell
# Test.ps1
"Ejecutado: $(Get-Date)" | Out-File "C:\Temp\test_task.txt" -Append
whoami | Out-File "C:\Temp\test_task.txt" -Append
```

1. Crea la tarea en Task Scheduler
2. Ejecútala
3. Verifica si se creó `C:\Temp\test_task.txt`

**Si NO se crea el archivo:** Problema de permisos del usuario

**Si se crea:** Problema específico de SQL o dbatools

---

### Habilitar Logging en Scripts

Agrega al inicio de tus scripts:

```powershell
# Al inicio del script
Start-Transcript -Path "C:\Logs\HealthScore_IO_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"

# ... tu código ...

# Al final
Stop-Transcript
```

Esto guardará TODO el output en un archivo.

---

## 🎯 Checklist Rápido

Verifica que tengas TODO esto configurado:

- [ ] Usuario correcto en Task Scheduler
- [ ] "Run with highest privileges" activado
- [ ] dbatools instalado para ese usuario
- [ ] Permisos db_datawriter en SQLNova
- [ ] ExecutionPolicy Bypass en argumentos
- [ ] Path completo al script correcto
- [ ] No hay módulo SqlServer cargado
- [ ] Conexión exitosa a SQL Server
- [ ] Tablas existen en SQLNova

---

## 🆘 Si Nada Funciona

### Opción 1: Ejecutar con SYSTEM

Si tu usuario tiene problemas, usa la cuenta SYSTEM:

```powershell
# En Task Scheduler > Properties > General
# Change User > "NT AUTHORITY\SYSTEM"
```

**PERO** asegúrate de dar permisos a SYSTEM en SQL:

```sql
USE SQLNova;
ALTER ROLE db_datawriter ADD MEMBER [NT AUTHORITY\SYSTEM];
```

### Opción 2: Crear Usuario de Servicio Dedicado

Solicita a IT una cuenta de servicio:
- Con permisos en SQL Server
- Sin vencimiento de contraseña
- Para ejecutar tareas programadas

### Opción 3: Usar SQL Agent Jobs

Como último recurso, convierte los scripts a SQL Agent Jobs:

```sql
-- Crear un job que ejecute PowerShell
USE msdb;
GO

EXEC sp_add_job @job_name = 'HealthScore_IO';

EXEC sp_add_jobstep
    @job_name = 'HealthScore_IO',
    @step_name = 'Ejecutar Script',
    @subsystem = 'PowerShell',
    @command = 'C:\Apps\SQLGuardObservatory\Scripts\RelevamientoHealthScore_IO.ps1';

EXEC sp_add_schedule
    @schedule_name = 'Cada_5_min',
    @freq_type = 4,
    @freq_interval = 1,
    @freq_subday_type = 4,
    @freq_subday_interval = 5;

EXEC sp_attach_schedule
    @job_name = 'HealthScore_IO',
    @schedule_name = 'Cada_5_min';

EXEC sp_add_jobserver @job_name = 'HealthScore_IO';
```

---

## 📞 Soporte

Si después de seguir todos los pasos aún no funciona:

1. **Corre el script de diagnóstico** y guarda el output
2. **Revisa Event Viewer** y captura los errores
3. **Ejecuta manualmente** y captura el output
4. Compara las diferencias entre manual y Task Scheduler

---

## ✅ Verificación Final

Una vez configurado todo:

```powershell
# Verificar que las últimas ejecuciones fueron exitosas
Get-ScheduledTask -TaskName "HealthScore_v3*" | 
    ForEach-Object {
        $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
        [PSCustomObject]@{
            Tarea = $_.TaskName
            UltimaEjecucion = $info.LastRunTime
            Resultado = $info.LastTaskResult
            ProximaEjecucion = $info.NextRunTime
            Estado = if($info.LastTaskResult -eq 0) {"✅ OK"} else {"❌ Error"}
        }
    } | Format-Table -AutoSize
```

```powershell
# Verificar que hay datos recientes en las tablas
Invoke-DbaQuery -SqlInstance "SSPR17MON-01" -Database "SQLNova" -Query @"
SELECT 
    'InstanceHealth_IO' AS Tabla,
    MAX(CollectedAtUtc) AS UltimoRegistro,
    COUNT(*) AS TotalRegistros,
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETDATE()) AS MinutosAtras
FROM InstanceHealth_IO
UNION ALL
SELECT 
    'InstanceHealth_CPU',
    MAX(CollectedAtUtc),
    COUNT(*),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETDATE())
FROM InstanceHealth_CPU
UNION ALL
SELECT 
    'InstanceHealth_Memoria',
    MAX(CollectedAtUtc),
    COUNT(*),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETDATE())
FROM InstanceHealth_Memoria
ORDER BY MinutosAtras;
"@
```

**Resultado esperado:** Datos con menos de 10 minutos de antigüedad.

---

**Última actualización:** Octubre 2024

