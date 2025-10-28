# 🔧 Guía de Troubleshooting: Task Scheduler + Health Score

## 🚨 Problema: Scripts se ejecutan pero no escriben datos

### Causas Comunes:

1. ❌ **Permisos insuficientes**: La cuenta del Task Scheduler no tiene permisos en SQL Server
2. ❌ **Ruta de trabajo incorrecta**: El script no encuentra archivos o módulos
3. ❌ **Módulos no disponibles**: dbatools no está instalado para la cuenta de servicio
4. ❌ **Errores silenciosos**: El script falla pero no genera logs
5. ❌ **Timeout**: El script se interrumpe antes de completar

---

## 🔍 PASO 1: Diagnóstico Inicial

Ejecuta este script **MANUALMENTE** desde la cuenta que usará el Task Scheduler:

```powershell
cd C:\Apps\SQLGuardObservatory\Scripts
.\Test-TaskScheduler-Execution.ps1
```

Este script verificará:
- ✅ Permisos de escritura
- ✅ Conectividad a SQL Server
- ✅ Permisos en base de datos
- ✅ Módulo dbatools
- ✅ API de inventario

**Revisa el log generado en:** `C:\Apps\SQLGuardObservatory\Scripts\Logs\`

---

## 🛠️ PASO 2: Configurar Task Scheduler Correctamente

### Opción A: Crear Tarea con PowerShell (RECOMENDADO)

```powershell
# Script: Create-HealthScore-Tasks.ps1
# Ejecutar como administrador

$scriptsPath = "C:\Apps\SQLGuardObservatory\Scripts"

# Definir tareas
$tasks = @(
    @{
        Name = "HealthScore - CPU (5 min)"
        Script = "Run-CPU-Clean.ps1"
        Interval = 5
    },
    @{
        Name = "HealthScore - Memoria (5 min)"
        Script = "Run-Memoria-Clean.ps1"
        Interval = 5
    },
    @{
        Name = "HealthScore - Backups (15 min)"
        Script = "Run-Backups-Clean.ps1"
        Interval = 15
    },
    @{
        Name = "HealthScore - AlwaysOn (5 min)"
        Script = "Run-AlwaysOn-Clean.ps1"
        Interval = 5
    },
    @{
        Name = "HealthScore - Consolidate (5 min)"
        Script = "Run-Consolidate-Clean.ps1"
        Interval = 5
    }
)

foreach ($task in $tasks) {
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptsPath\$($task.Script)`" >> `"$scriptsPath\Logs\TaskScheduler_$($task.Script).log`" 2>&1" `
        -WorkingDirectory $scriptsPath
    
    $trigger = New-ScheduledTaskTrigger `
        -Once `
        -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes $task.Interval)
    
    $principal = New-ScheduledTaskPrincipal `
        -UserId "NT AUTHORITY\SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest
    
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask `
        -TaskName $task.Name `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Force
    
    Write-Host "✅ Tarea creada: $($task.Name)" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Todas las tareas creadas exitosamente" -ForegroundColor Green
```

### Opción B: Configuración Manual en GUI

#### Pestaña General:
- ✅ **Nombre**: `HealthScore - CPU`
- ✅ **Ejecutar tanto si el usuario inició sesión como si no**: Marcado
- ✅ **Ejecutar con los privilegios más altos**: Marcado
- ✅ **Usuario**: `NT AUTHORITY\SYSTEM` o cuenta de servicio con permisos SQL

#### Pestaña Triggers:
- ✅ **Repetir tarea cada**: `5 minutos`
- ✅ **Durante**: `Indefinidamente`

#### Pestaña Actions:
- ✅ **Programa/script**: `powershell.exe`
- ✅ **Argumentos**:
```
-NoProfile -ExecutionPolicy Bypass -File "C:\Apps\SQLGuardObservatory\Scripts\Run-CPU-Clean.ps1" >> "C:\Apps\SQLGuardObservatory\Scripts\Logs\CPU.log" 2>&1
```
- ✅ **Iniciar en**: `C:\Apps\SQLGuardObservatory\Scripts`

#### Pestaña Conditions:
- ❌ **Iniciar solo si el equipo está en CA**: Desmarcar
- ✅ **Iniciar la tarea aunque el equipo funcione con batería**: Marcar

#### Pestaña Settings:
- ✅ **Permitir que se ejecute la tarea a petición**: Marcar
- ✅ **Ejecutar la tarea lo antes posible después de perder un inicio programado**: Marcar
- ✅ **Si la tarea falla, reiniciar cada**: `1 minuto`, `3 veces`
- ✅ **Detener la tarea si se ejecuta más de**: `1 hora`

---

## 🔐 PASO 3: Verificar Permisos SQL Server

### Si usas cuenta de servicio o SYSTEM:

```sql
-- En SQL Server, ejecutar:
USE [SQLNova];
GO

-- Crear login si no existe (para cuenta SYSTEM)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'NT AUTHORITY\SYSTEM')
BEGIN
    CREATE LOGIN [NT AUTHORITY\SYSTEM] FROM WINDOWS;
END
GO

-- Dar permisos en base de datos
USE [SQLNova];
GO

CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
GO

ALTER ROLE [db_datawriter] ADD MEMBER [NT AUTHORITY\SYSTEM];
ALTER ROLE [db_datareader] ADD MEMBER [NT AUTHORITY\SYSTEM];
GO

-- Verificar permisos
SELECT 
    dp.name AS UserName,
    dp.type_desc AS UserType,
    r.name AS RoleName
FROM sys.database_principals dp
LEFT JOIN sys.database_role_members rm ON dp.principal_id = rm.member_principal_id
LEFT JOIN sys.database_principals r ON rm.role_principal_id = r.principal_id
WHERE dp.name = 'NT AUTHORITY\SYSTEM';
```

---

## 📊 PASO 4: Verificar Ejecución

### 4.1 Ver logs del Task Scheduler:

```powershell
# Ver últimos logs
Get-Content "C:\Apps\SQLGuardObservatory\Scripts\Logs\CPU.log" -Tail 50
```

### 4.2 Ver historial de Task Scheduler:

1. Abrir **Task Scheduler**
2. Navegar a la tarea
3. Click en pestaña **History** (Historial)
4. Buscar errores (Event ID 103, 201, etc.)

### 4.3 Ver si hay datos en la base de datos:

```sql
-- Verificar últimos registros
USE SQLNova;
GO

-- CPU
SELECT TOP 10 * 
FROM dbo.InstanceHealth_CPU 
ORDER BY CollectedAtUtc DESC;

-- Ver conteo por hora
SELECT 
    DATEADD(HOUR, DATEDIFF(HOUR, 0, CollectedAtUtc), 0) AS HourBucket,
    COUNT(*) AS RecordCount
FROM dbo.InstanceHealth_CPU
WHERE CollectedAtUtc >= DATEADD(HOUR, -2, GETDATE())
GROUP BY DATEADD(HOUR, DATEDIFF(HOUR, 0, CollectedAtUtc), 0)
ORDER BY HourBucket DESC;
```

---

## 🐛 PASO 5: Problemas Comunes y Soluciones

### Problema 1: "dbatools no encontrado"

**Síntoma**: Error al cargar dbatools

**Solución**:
```powershell
# Instalar dbatools para SYSTEM o cuenta de servicio
# Ejecutar como la cuenta que usará Task Scheduler:
Install-Module dbatools -Scope AllUsers -Force

# Verificar instalación:
Get-Module dbatools -ListAvailable
```

### Problema 2: "Access Denied" al escribir en SQL

**Síntoma**: Scripts se ejecutan pero no hay datos

**Solución**: Ejecutar el script de permisos SQL del PASO 3

### Problema 3: Script se ejecuta pero termina prematuramente

**Síntoma**: Logs incompletos, no llega a guardar datos

**Solución**:
1. Aumentar el timeout en Task Scheduler a 2 horas
2. Verificar que no hay límites de memoria
3. Revisar el Event Viewer de Windows:
   ```
   Event Viewer > Windows Logs > Application
   Buscar errores de PowerShell
   ```

### Problema 4: "Cannot find path" o módulos no encontrados

**Síntoma**: Error de rutas

**Solución**: Verificar que en Task Scheduler:
- ✅ **Iniciar en** está configurado: `C:\Apps\SQLGuardObservatory\Scripts`
- ✅ Rutas en el script son absolutas, no relativas

### Problema 5: Script funciona manual pero falla en Task Scheduler

**Síntoma**: Comportamiento diferente

**Solución**:
```powershell
# Ejecutar como la cuenta del Task Scheduler:
runas /user:SYSTEM powershell.exe
# O usar psexec:
psexec -i -s powershell.exe
# Luego ejecutar el script manualmente
cd C:\Apps\SQLGuardObservatory\Scripts
.\Run-CPU-Clean.ps1
```

---

## 📝 PASO 6: Crear Script de Verificación Automática

```powershell
# Script: Verify-HealthScore-Data.ps1
# Ejecutar periódicamente para verificar que hay datos nuevos

$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"

$query = @"
-- Verificar datos recientes (últimos 15 minutos)
SELECT 
    'CPU' AS Category,
    COUNT(*) AS RecentRecords,
    MAX(CollectedAtUtc) AS LastCollection
FROM dbo.InstanceHealth_CPU
WHERE CollectedAtUtc >= DATEADD(MINUTE, -15, GETDATE())

UNION ALL

SELECT 
    'Memoria' AS Category,
    COUNT(*) AS RecentRecords,
    MAX(CollectedAtUtc) AS LastCollection
FROM dbo.InstanceHealth_Memoria
WHERE CollectedAtUtc >= DATEADD(MINUTE, -15, GETDATE())

UNION ALL

SELECT 
    'Backups' AS Category,
    COUNT(*) AS RecentRecords,
    MAX(CollectedAtUtc) AS LastCollection
FROM dbo.InstanceHealth_Backups
WHERE CollectedAtUtc >= DATEADD(MINUTE, -20, GETDATE());
"@

$result = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $query

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  VERIFICACIÓN DE DATOS - HEALTH SCORE                 ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

foreach ($row in $result) {
    $status = if ($row.RecentRecords -gt 0) { "✅" } else { "❌" }
    $color = if ($row.RecentRecords -gt 0) { "Green" } else { "Red" }
    
    Write-Host "$status $($row.Category.PadRight(15)) - Registros: $($row.RecentRecords.ToString().PadLeft(4)) - Último: $($row.LastCollection)" -ForegroundColor $color
}

Write-Host ""
```

---

## ✅ Checklist de Verificación

Antes de declarar el problema resuelto, verifica:

- [ ] El script `Test-TaskScheduler-Execution.ps1` se ejecuta sin errores
- [ ] La cuenta del Task Scheduler tiene permisos en SQL Server
- [ ] dbatools está instalado para AllUsers
- [ ] Task Scheduler tiene configuración correcta (sin límites, con reintentos)
- [ ] Los logs se están generando en `C:\Apps\SQLGuardObservatory\Scripts\Logs\`
- [ ] Hay datos nuevos en las tablas SQL (verificar con query)
- [ ] No hay errores en Event Viewer de Windows

---

## 📞 Comandos Útiles de Diagnóstico

```powershell
# Ver tareas programadas relacionadas con Health Score
Get-ScheduledTask | Where-Object { $_.TaskName -like "*HealthScore*" }

# Ver última ejecución de una tarea
Get-ScheduledTask -TaskName "HealthScore - CPU" | Get-ScheduledTaskInfo

# Ver logs recientes
Get-ChildItem "C:\Apps\SQLGuardObservatory\Scripts\Logs\" | Sort-Object LastWriteTime -Descending | Select-Object -First 5

# Ejecutar tarea manualmente
Start-ScheduledTask -TaskName "HealthScore - CPU"

# Ver eventos de PowerShell en Event Viewer
Get-EventLog -LogName Application -Source PowerShell -Newest 20
```

---

## 🎯 Solución Rápida (Quick Fix)

Si necesitas una solución inmediata:

1. **Ejecuta el diagnóstico**:
   ```powershell
   .\Test-TaskScheduler-Execution.ps1
   ```

2. **Configura permisos SQL** (si falló el test):
   ```sql
   USE [SQLNova];
   CREATE USER [NT AUTHORITY\SYSTEM] FOR LOGIN [NT AUTHORITY\SYSTEM];
   ALTER ROLE [db_datawriter] ADD MEMBER [NT AUTHORITY\SYSTEM];
   ALTER ROLE [db_datareader] ADD MEMBER [NT AUTHORITY\SYSTEM];
   ```

3. **Ejecuta la tarea manualmente** y revisa logs:
   ```powershell
   Start-ScheduledTask -TaskName "HealthScore - CPU"
   # Espera 1 minuto
   Get-Content "C:\Apps\SQLGuardObservatory\Scripts\Logs\CPU.log" -Tail 30
   ```

4. **Verifica datos en SQL**:
   ```sql
   SELECT TOP 5 * FROM dbo.InstanceHealth_CPU ORDER BY CollectedAtUtc DESC;
   ```

