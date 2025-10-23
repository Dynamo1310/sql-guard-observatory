# Guía de Scheduling y Tiempo Real - Health Score

## 📋 **Índice**

1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Arquitectura Propuesta](#arquitectura-propuesta)
3. [Frecuencias de Recolección](#frecuencias-de-recolección)
4. [Configuración de Scheduled Tasks](#configuración-de-scheduled-tasks)
5. [Schema de Base de Datos](#schema-de-base-de-datos)
6. [API en Tiempo Real](#api-en-tiempo-real)
7. [Frontend con Actualización Automática](#frontend-con-actualización-automática)
8. [Mantenimiento y Troubleshooting](#mantenimiento-y-troubleshooting)

---

## 🎯 **Resumen Ejecutivo**

### **Problema Actual**
- Script monolítico que toma 10-15 minutos en ejecutarse
- Todas las métricas se recolectan con la misma frecuencia
- No hay actualización en tiempo real en el frontend

### **Solución Propuesta**
- **Dividir en 3 scripts especializados** con diferentes frecuencias
- **Base de datos normalizada** con tablas por tipo de métrica
- **API con streaming en tiempo real** (SSE o polling)
- **Frontend reactivo** que actualiza automáticamente

---

## 🏗️ **Arquitectura Propuesta**

```
┌─────────────────────────────────────────────────────────────┐
│                     SCHEDULED TASKS                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [RealTime.ps1]        [Backups.ps1]      [Maintenance.ps1] │
│   Cada 5 min            Cada 30 min        Cada 4 horas     │
│        │                    │                    │           │
│        └────────────────────┴────────────────────┘           │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │   SQL Server Tables  │
                  ├──────────────────────┤
                  │ • RealTime           │
                  │ • Backups            │
                  │ • Maintenance        │
                  │ • Score (agregada)   │
                  └──────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │    .NET Web API      │
                  ├──────────────────────┤
                  │ • REST endpoints     │
                  │ • SSE streaming      │
                  │ • SignalR (opcional) │
                  └──────────────────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │   React Frontend     │
                  ├──────────────────────┤
                  │ • Auto-refresh       │
                  │ • Real-time updates  │
                  │ • WebSocket/SSE      │
                  └──────────────────────┘
```

---

## ⏱️ **Frecuencias de Recolección**

### **Tabla de Decisiones**

| Métrica | Frecuencia | Justificación | Prioridad |
|---------|------------|---------------|-----------|
| **Conectividad** | 5 min | Alerta temprana de caídas | 🔴 Alta |
| **Discos** | 5 min | Puede llenarse rápido en producción | 🔴 Alta |
| **AlwaysOn Status** | 5 min | Sincronización puede fallar rápidamente | 🔴 Alta |
| **Backups (LOG)** | 30 min | Logs suelen ser cada 15-30 min | 🟡 Media |
| **Backups (FULL)** | 30 min | Suficiente para detectar breaches | 🟡 Media |
| **IntegrityCheck** | 4 horas | Solo se ejecuta una vez al día | 🔵 Baja |
| **IndexOptimize** | 4 horas | Solo se ejecuta una vez al día | 🔵 Baja |
| **Errorlog** | 4 horas | Errores 20+ son raros | 🔵 Baja |

### **Script Consolidado**
Además de los 3 scripts de recolección, un **script consolidador** que:
- Se ejecuta cada 15 minutos
- Lee las tablas individuales
- Calcula el **HealthScore final**
- Escribe en `InstanceHealth_Score`

---

## 🔧 **Configuración de Scheduled Tasks**

### **Paso 1: Preparar Scripts**

```powershell
# Directorio de scripts
$scriptPath = "C:\Scripts\HealthScore"

# Copiar scripts
Copy-Item ".\scripts\RelevamientoHealthScore_RealTime.ps1" $scriptPath
Copy-Item ".\scripts\RelevamientoHealthScore_Backups.ps1" $scriptPath
Copy-Item ".\scripts\RelevamientoHealthScore_Maintenance.ps1" $scriptPath
Copy-Item ".\scripts\RelevamientoHealthScore_Consolidate.ps1" $scriptPath
```

### **Paso 2: Configurar Scheduled Tasks**

```powershell
# Ejecutar como Administrador
.\scripts\Schedule-HealthScore.ps1 `
    -ScriptPath "C:\Scripts\HealthScore" `
    -ServiceAccount "DOMAIN\svc_sqlmonitor"
```

### **Paso 3: Verificar Tareas**

```powershell
# Listar tareas creadas
Get-ScheduledTask | Where-Object {$_.TaskName -like 'SQLGuard_HealthScore_*'} | 
    Select-Object TaskName, State, @{N='NextRun';E={(Get-ScheduledTaskInfo $_).NextRunTime}}

# Ejecutar manualmente para probar
Start-ScheduledTask -TaskName 'SQLGuard_HealthScore_RealTime'

# Ver resultado
Get-ScheduledTask -TaskName 'SQLGuard_HealthScore_RealTime' | Get-ScheduledTaskInfo
```

### **Paso 4: Monitorear Ejecución**

```sql
-- Ver últimas recolecciones por tabla
SELECT 'RealTime' AS TableName, MAX(CollectedAtUtc) AS LastCollection
FROM dbo.InstanceHealth_RealTime
UNION ALL
SELECT 'Backups', MAX(CollectedAtUtc)
FROM dbo.InstanceHealth_Backups
UNION ALL
SELECT 'Maintenance', MAX(CollectedAtUtc)
FROM dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 'Score', MAX(CollectedAtUtc)
FROM dbo.InstanceHealth_Score;
```

---

## 🗄️ **Schema de Base de Datos**

### **Tablas Creadas**

1. **`InstanceHealth_RealTime`** (cada 5 min)
   - Conectividad, latencia
   - Discos, espacio libre
   - AlwaysOn status

2. **`InstanceHealth_Backups`** (cada 30 min)
   - FULL, DIFF, LOG backups
   - Breaches calculados

3. **`InstanceHealth_Maintenance`** (cada 4 horas)
   - IntegrityCheck jobs
   - IndexOptimize jobs
   - Errorlog severity 20+

4. **`InstanceHealth_Score`** (cada 15 min)
   - Score consolidado (0-100)
   - Status (Healthy/Warning/Critical)
   - Breakdown por categoría

### **Vista Consolidada**

```sql
-- Obtener último estado de cada instancia
SELECT * FROM dbo.vw_InstanceHealth_Latest;
```

### **Mantenimiento Automático**

```sql
-- Ejecutar diariamente para limpiar datos antiguos
EXEC dbo.usp_CleanupHealthHistory @RetentionDays = 30;
```

```sql
-- Crear Job de SQL Server para ejecutar cleanup
USE msdb;
GO

EXEC sp_add_job 
    @job_name = N'SQLGuard - Cleanup Health History',
    @enabled = 1;

EXEC sp_add_jobstep 
    @job_name = N'SQLGuard - Cleanup Health History',
    @step_name = N'Run Cleanup',
    @subsystem = N'TSQL',
    @command = N'EXEC SQLNova.dbo.usp_CleanupHealthHistory @RetentionDays = 30',
    @database_name = N'SQLNova';

EXEC sp_add_schedule 
    @schedule_name = N'Daily at 2 AM',
    @freq_type = 4, -- Daily
    @freq_interval = 1,
    @active_start_time = 020000; -- 2:00 AM

EXEC sp_attach_schedule 
    @job_name = N'SQLGuard - Cleanup Health History',
    @schedule_name = N'Daily at 2 AM';

EXEC sp_add_jobserver 
    @job_name = N'SQLGuard - Cleanup Health History';
```

---

## 🚀 **API en Tiempo Real**

### **Endpoints Disponibles**

#### 1. **Obtener último estado de todas las instancias**
```http
GET /api/HealthScoreRealtime/latest
```

**Respuesta:**
```json
{
  "success": true,
  "count": 150,
  "data": [
    {
      "instanceName": "SQLPROD01",
      "healthScore": 95,
      "healthStatus": "Healthy",
      "connectSuccess": true,
      "connectLatencyMs": 23,
      "worstFreePct": 35.5,
      "lastFullBackup": "2025-10-22T02:00:00Z",
      "lastLogBackup": "2025-10-22T09:15:00Z",
      "collectedAt": {
        "score": "2025-10-22T09:30:00Z",
        "realTime": "2025-10-22T09:35:00Z",
        "backup": "2025-10-22T09:30:00Z",
        "maintenance": "2025-10-22T08:00:00Z"
      }
    }
  ],
  "timestamp": "2025-10-22T09:35:12Z"
}
```

#### 2. **Streaming en tiempo real (SSE)**
```http
GET /api/HealthScoreRealtime/stream
```

**Uso:**
```javascript
const eventSource = new EventSource('http://api/HealthScoreRealtime/stream');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Actualización:', data);
};
```

#### 3. **Historial de una instancia**
```http
GET /api/HealthScoreRealtime/history/SQLPROD01?hours=24
```

#### 4. **Estadísticas agregadas**
```http
GET /api/HealthScoreRealtime/stats
```

**Respuesta:**
```json
{
  "success": true,
  "stats": {
    "Healthy": { "count": 120, "avgScore": 92, "minScore": 85, "maxScore": 100 },
    "Warning": { "count": 25, "avgScore": 75, "minScore": 70, "maxScore": 84 },
    "Critical": { "count": 5, "avgScore": 45, "minScore": 20, "maxScore": 69 }
  }
}
```

---

## ⚛️ **Frontend con Actualización Automática**

### **Componente React**

```tsx
import { HealthScoreRealtime } from '@/components/HealthScoreRealtime';

function OverviewPage() {
  return (
    <div className="p-6">
      <HealthScoreRealtime />
    </div>
  );
}
```

### **Modos de Actualización**

#### **Opción 1: Polling (Simple)**
- Fetch cada 10 segundos
- Fácil de implementar
- Funciona en todos los navegadores
- Más carga en el servidor

#### **Opción 2: Server-Sent Events (Recomendado)**
- Push desde servidor cada 5 segundos
- Más eficiente
- Conexión persistente
- Compatible con HTTP/1.1

#### **Opción 3: SignalR / WebSockets (Avanzado)**
- Comunicación bidireccional
- Baja latencia
- Requiere más configuración
- Ideal para >500 clientes concurrentes

### **Agregar a Configuración**

```json
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://asprbm-nov-01:5000',
        changeOrigin: true
      }
    }
  }
})
```

```env
# .env.production
VITE_API_BASE_URL=http://asprbm-nov-01:5000
```

---

## 🛠️ **Mantenimiento y Troubleshooting**

### **Verificar que Scheduled Tasks Funcionan**

```powershell
# Ver estado de tareas
Get-ScheduledTask -TaskName 'SQLGuard_HealthScore_*' | 
    Select-Object TaskName, State, LastRunTime, LastTaskResult

# Ver historial de ejecución
Get-ScheduledTask -TaskName 'SQLGuard_HealthScore_RealTime' | 
    Get-ScheduledTaskInfo | 
    Select-Object LastRunTime, LastTaskResult, NextRunTime

# Ver logs de eventos
Get-WinEvent -LogName 'Microsoft-Windows-TaskScheduler/Operational' -MaxEvents 50 |
    Where-Object {$_.Message -like '*SQLGuard*'} |
    Select-Object TimeCreated, Message
```

### **Troubleshooting: Datos No Actualizan**

```sql
-- 1. Verificar última inserción en cada tabla
SELECT 
    'RealTime' AS Tabla,
    COUNT(*) AS Registros,
    MAX(CollectedAtUtc) AS UltimaRecoleccion,
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()) AS MinutosAtras
FROM dbo.InstanceHealth_RealTime
UNION ALL
SELECT 
    'Backups',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE())
FROM dbo.InstanceHealth_Backups
UNION ALL
SELECT 
    'Maintenance',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE())
FROM dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 
    'Score',
    COUNT(*),
    MAX(CollectedAtUtc),
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE())
FROM dbo.InstanceHealth_Score;

-- 2. Ver errores en ejecución de scripts
SELECT TOP 20 *
FROM sys.dm_exec_requests
WHERE command LIKE '%INSERT%'
ORDER BY start_time DESC;
```

### **Alertas Recomendadas**

```sql
-- Crear alerta si no hay datos en últimos 15 minutos
IF EXISTS (
    SELECT 1 
    FROM dbo.InstanceHealth_RealTime
    WHERE CollectedAtUtc >= DATEADD(MINUTE, -15, GETUTCDATE())
)
    PRINT 'OK - Datos actualizados'
ELSE
    RAISERROR('ALERTA: No hay datos de RealTime en últimos 15 minutos', 16, 1);
```

### **Performance: Índices Críticos**

```sql
-- Ya incluidos en el schema, pero verificar:
SELECT 
    OBJECT_NAME(i.object_id) AS TableName,
    i.name AS IndexName,
    i.type_desc,
    s.user_seeks,
    s.user_scans,
    s.user_lookups,
    s.user_updates
FROM sys.indexes i
LEFT JOIN sys.dm_db_index_usage_stats s 
    ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE OBJECT_NAME(i.object_id) LIKE 'InstanceHealth_%'
ORDER BY TableName, IndexName;
```

---

## 📊 **Métricas de Éxito**

Después de implementar, monitorear:

1. **Frecuencia de recolección real** vs esperada
2. **Tamaño de tablas** (crecimiento diario)
3. **Tiempo de respuesta de API** (<200ms para latest)
4. **Conexiones SSE activas**
5. **Uso de CPU/Memoria** en servidor de monitoreo

```sql
-- Dashboard de métricas de recolección
SELECT 
    DATEADD(HOUR, DATEDIFF(HOUR, 0, CollectedAtUtc), 0) AS Hora,
    COUNT(*) AS RecoleccionesPorHora,
    COUNT(DISTINCT InstanceName) AS InstanciasUnicas
FROM dbo.InstanceHealth_RealTime
WHERE CollectedAtUtc >= DATEADD(DAY, -1, GETUTCDATE())
GROUP BY DATEADD(HOUR, DATEDIFF(HOUR, 0, CollectedAtUtc), 0)
ORDER BY Hora DESC;
```

---

## 🎯 **Próximos Pasos**

1. ✅ **Crear schema de base de datos**
   ```powershell
   Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" `
       -InputFile ".\scripts\SQL\CreateHealthScoreTables.sql"
   ```

2. ✅ **Dividir script monolítico** en 3 scripts especializados
   - RelevamientoHealthScore_RealTime.ps1
   - RelevamientoHealthScore_Backups.ps1
   - RelevamientoHealthScore_Maintenance.ps1

3. ✅ **Crear script consolidador**
   - RelevamientoHealthScore_Consolidate.ps1

4. ✅ **Configurar Scheduled Tasks**
   ```powershell
   .\scripts\Schedule-HealthScore.ps1
   ```

5. ✅ **Agregar controlador a API**
   - Ya creado: `HealthScoreRealtimeController.cs`

6. ✅ **Agregar componente React**
   - Ya creado: `HealthScoreRealtime.tsx`

7. ⏳ **Testing inicial** (1-2 días)
   - Verificar frecuencias
   - Ajustar timeouts
   - Validar sincronización AlwaysOn

8. ⏳ **Monitoreo y ajustes** (1 semana)
   - Revisar performance
   - Ajustar retención de datos
   - Optimizar consultas lentas

---

## ❓ **FAQ**

### **¿Por qué dividir el script en lugar de usar jobs de SQL Agent?**
- **Flexibilidad**: PowerShell permite lógica compleja (API calls, sincronización AG)
- **Mantenimiento**: Más fácil versionar y desplegar scripts
- **Logging**: Mejor control de logs y errores
- **Cross-instance**: SQL Agent jobs son por instancia

### **¿Por qué SSE en lugar de WebSockets/SignalR?**
- **Simplicidad**: No requiere librería especial
- **Unidireccional**: Solo necesitamos server → client
- **HTTP compatible**: Funciona con proxies/load balancers
- **Bajo overhead**: Conexión HTTP persistente

### **¿Cuánto espacio ocupará en disco?**
Estimación para 150 instancias:
- RealTime (cada 5 min): ~50KB/instancia/día = 7.5MB/día
- Backups (cada 30 min): ~10KB/instancia/día = 1.5MB/día
- Maintenance (cada 4h): ~5KB/instancia/día = 0.75MB/día
- Score (cada 15 min): ~2KB/instancia/día = 0.3MB/día

**Total: ~10MB/día × 30 días = 300MB/mes**

Con limpieza automática (7 días para RealTime, 30 días para resto): **~150MB total**

---

## 📞 **Soporte**

Para problemas o preguntas:
1. Verificar logs de Scheduled Tasks
2. Revisar evento de Windows (Task Scheduler)
3. Consultar `sys.dm_db_index_usage_stats` para performance
4. Revisar API logs en IIS

---

**Versión:** 1.0  
**Fecha:** 2025-10-22  
**Autor:** SQL Guard Observatory Team

