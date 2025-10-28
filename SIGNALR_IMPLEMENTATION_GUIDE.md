# 🚀 SignalR Implementation Guide - SQL Guard Observatory

## 📋 Resumen

Implementación completa de SignalR para actualizaciones en tiempo real en toda la aplicación.

### ✅ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│              POWERSHELL COLLECTORS                           │
│  (Ejecutados por Windows Task Scheduler cada X minutos)     │
├─────────────────────────────────────────────────────────────┤
│  AlwaysOn, CPU, Memoria, IO, Discos, DatabaseStates         │ ⚡ 5 min
│  Backups, Waits                                              │ 🟡 30 min
│  Maintenance, ErroresCriticos, ConfigTempdb, Autogrowth     │ 🔵 4 horas
│  LogChain                                                    │ 🔵 4 horas
│  Consolidate (calcula score final 0-100)                    │ 🔄 10 min
└─────────────────────────────────────────────────────────────┘
                             │
                             │ HTTP POST con datos
                             ▼
┌─────────────────────────────────────────────────────────────┐
│               .NET BACKEND API                               │
├─────────────────────────────────────────────────────────────┤
│  POST /api/notifications/healthscore                         │
│      ↓                                                        │
│  NotificationController                                      │
│      ↓                                                        │
│  NotificationHub (SignalR)                                   │
│      ↓                                                        │
│  Clients.All.SendAsync("HealthScoreUpdated", data)          │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ WebSocket/SSE
                             ▼
┌─────────────────────────────────────────────────────────────┐
│              REACT FRONTEND                                  │
├─────────────────────────────────────────────────────────────┤
│  SignalRProvider (contexto global)                           │
│      ↓                                                        │
│  useHealthScoreNotifications() hook                          │
│      ↓                                                        │
│  HealthScore.tsx recibe evento y actualiza UI               │
│      ↓                                                        │
│  fetchHealthScores() refresca datos                         │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Backend Setup (.NET)

### 1. Instalar paquete NuGet

```bash
cd SQLGuardObservatory.API
dotnet add package Microsoft.AspNetCore.SignalR
```

### 2. Modificar `Program.cs`

Agregar **DESPUÉS** de `var builder = WebApplication.CreateBuilder(args);`:

```csharp
// ========== SIGNALR CONFIGURATION ==========
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true; // Solo en desarrollo
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

// CORS para SignalR
builder.Services.AddCors(options =>
{
    options.AddPolicy("SignalRCorsPolicy", policy =>
    {
        policy.WithOrigins(
            "http://localhost:5173",      // Vite dev
            "http://localhost:3000",      // React dev
            "http://asprbm-nov-01",       // Producción
            "https://tu-dominio.com"      // Producción HTTPS
        )
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials(); // REQUERIDO para SignalR
    });
});
```

Agregar **ANTES** de `app.Run();`:

```csharp
// Habilitar CORS (debe ir ANTES de UseAuthorization)
app.UseCors("SignalRCorsPolicy");

// Mapear Hub de SignalR
app.MapHub<NotificationHub>("/hubs/notifications");
```

### 3. Verificar archivos creados

- ✅ `Hubs/NotificationHub.cs` - Hub principal de SignalR
- ✅ `Controllers/NotificationController.cs` - Endpoints para collectors
- ✅ `Controllers/HealthScoreNotificationController.cs` - *(obsoleto, eliminar)*

---

## ⚛️ Frontend Setup (React + TypeScript)

### 1. Instalar dependencia

```bash
npm install @microsoft/signalr
```

### 2. Modificar `src/App.tsx`

Ya está configurado, verificar que tenga:

```tsx
import { SignalRProvider } from '@/contexts/SignalRContext';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SignalRProvider
          hubUrl={`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'}/hubs/notifications`}
          autoReconnect={true}
        >
          {/* ... resto de la app ... */}
        </SignalRProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

### 3. Configurar variables de entorno

Archivo `.env.local`:

```env
VITE_API_BASE_URL=http://asprbm-nov-01:5000
```

Archivo `.env.production`:

```env
VITE_API_BASE_URL=https://tu-dominio-produccion.com
```

### 4. Usar SignalR en componentes

**Ejemplo: HealthScore.tsx**

```tsx
import { useHealthScoreNotifications } from '@/hooks/useSignalRNotifications';

export default function HealthScore() {
  const [healthScores, setHealthScores] = useState<HealthScoreV3Dto[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  // Suscribirse a notificaciones de HealthScore
  useHealthScoreNotifications(
    (data) => {
      // Cuando un collector termina, refrescar datos
      console.log(`Collector ${data.collectorName} completó: ${data.instanceCount} instancias`);
      
      // Si es el consolidador, refrescar toda la tabla
      if (data.collectorName === 'Consolidate') {
        fetchHealthScores();
        setLastUpdate(new Date().toLocaleTimeString());
      }
    }
  );

  // ... resto del componente
}
```

### 5. Mostrar estado de conexión (opcional)

Agregar en el header o donde prefieras:

```tsx
import SignalRStatus from '@/components/SignalRStatus';

// En tu componente Layout o Header
<SignalRStatus />
```

### 6. Mostrar actividad de collectors (opcional)

```tsx
import CollectorActivity from '@/components/CollectorActivity';

// En Dashboard o HealthScore
<CollectorActivity />
```

---

## 🖥️ PowerShell Collectors Setup

### 1. Ejecutar script de configuración

```powershell
# Ejecutar como Administrador
cd C:\SQLGuardCollectors\scripts

.\Schedule-HealthScore-v3-FINAL.ps1 `
    -ScriptsPath "C:\SQLGuardCollectors\scripts" `
    -ApiBaseUrl "http://asprbm-nov-01:5000"
```

Esto creará:
- 13 Scheduled Tasks (collectors)
- 1 Scheduled Task (consolidador)
- Archivo `Send-SignalRNotification.ps1` (módulo de notificación)

### 2. Verificar tareas creadas

```powershell
Get-ScheduledTask -TaskName 'HealthScore_v3.2*' | Format-Table -AutoSize
```

### 3. Probar ejecución manual

```powershell
# Forzar ejecución del consolidador
Start-ScheduledTask -TaskName 'HealthScore_v3.2_Consolidate'

# Verificar logs
Get-ScheduledTask -TaskName 'HealthScore_v3.2_Consolidate' | Get-ScheduledTaskInfo
```

---

## 🧪 Testing

### 1. Probar backend

```bash
# Test de notificación
curl -X POST http://localhost:5000/api/notifications/healthscore \
  -H "Content-Type: application/json" \
  -d '{
    "collectorName": "TEST",
    "timestamp": "2025-01-28T12:00:00Z",
    "instanceCount": 150
  }'

# Test endpoint general
curl http://localhost:5000/api/notifications/test
```

### 2. Probar frontend

1. Abrir DevTools → Console
2. Iniciar sesión en la aplicación
3. Buscar en console:
   ```
   [SignalR] Conectado exitosamente
   [SignalR] Suscrito a evento: HealthScoreUpdated
   ```
4. Ejecutar un collector manualmente
5. Ver en console:
   ```
   [SignalR] HealthScore actualizado: { collectorName: "Consolidate", ... }
   ```

### 3. Probar notificación desde PowerShell

```powershell
.\Send-SignalRNotification.ps1 `
    -NotificationType 'HealthScore' `
    -CollectorName 'TEST' `
    -ApiBaseUrl 'http://localhost:5000' `
    -InstanceCount 150 `
    -Verbose
```

---

## 📊 Eventos Disponibles

### HealthScore

| Evento | Cuándo se emite | Datos |
|--------|----------------|-------|
| `HealthScoreUpdated` | Cuando cualquier collector termina | `{ CollectorName, Timestamp, InstanceCount }` |
| `InstanceHealthUpdated` | Cuando una instancia específica actualiza | `{ InstanceName, HealthScore, HealthStatus }` |

### Otros (Futuro)

| Evento | Descripción |
|--------|-------------|
| `BackupsUpdated` | Actualización de backups |
| `AlertCreated` | Nueva alerta generada |
| `AlertResolved` | Alerta resuelta |
| `MaintenanceStarted` | Inicio de mantenimiento |
| `MaintenanceCompleted` | Fin de mantenimiento |
| `SystemNotification` | Notificación general del sistema |

---

## 🔍 Troubleshooting

### Problema: Frontend no recibe notificaciones

**Verificar:**
1. Backend está corriendo y accesible
2. SignalR está configurado en `Program.cs`
3. CORS permite el origen del frontend
4. En DevTools → Network → WS (WebSockets), ver si hay conexión activa

**Solución:**
```powershell
# Verificar que el backend responde
curl http://localhost:5000/api/notifications/test

# Ver logs del backend
# Buscar: "Cliente conectado al Notification Hub"
```

### Problema: Collectors no notifican

**Verificar:**
1. Script `Send-SignalRNotification.ps1` existe en la carpeta scripts
2. Scheduled Tasks tienen el comando correcto (ver "Actions" en Task Scheduler)
3. Backend está accesible desde el servidor que ejecuta los collectors

**Solución:**
```powershell
# Probar notificación manual
.\Send-SignalRNotification.ps1 `
    -NotificationType 'HealthScore' `
    -CollectorName 'TEST' `
    -ApiBaseUrl 'http://asprbm-nov-01:5000' `
    -Verbose

# Ver si llegó al backend (check logs)
```

### Problema: "CORS policy blocked"

**Error en console:**
```
Access to XMLHttpRequest at 'http://backend/hubs/notifications' 
from origin 'http://localhost:5173' has been blocked by CORS policy
```

**Solución:**
Verificar en `Program.cs`:
```csharp
policy.WithOrigins("http://localhost:5173") // ← Debe coincidir exactamente
      .AllowCredentials(); // ← DEBE estar presente
```

### Problema: Conexión se cae constantemente

**Verificar:**
1. Firewall no bloquea WebSockets
2. Proxy/Load Balancer permite conexiones persistentes
3. Timeout del servidor no es muy corto

**Solución:**
```csharp
// En Program.cs, aumentar timeouts
builder.Services.AddSignalR(options =>
{
    options.KeepAliveInterval = TimeSpan.FromSeconds(30);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);
});
```

---

## 📈 Monitoreo

### Logs del Backend

```bash
# Ver conexiones activas
grep "Cliente conectado" logs.txt

# Ver notificaciones recibidas
grep "Collector.*completó" logs.txt
```

### Métricas a monitorear

1. **Conexiones activas**: Número de clientes conectados al hub
2. **Notificaciones enviadas**: Contador de eventos emitidos
3. **Latencia**: Tiempo entre POST del collector y recepción en frontend
4. **Reconexiones**: Número de reconexiones por cliente

---

## 🚀 Deployment

### Desarrollo

Ya configurado con:
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

### Producción

1. **Backend IIS:**
   - Habilitar WebSockets en IIS
   - Configurar CORS con dominio de producción
   - Asegurar firewall permite puerto

2. **Frontend:**
   - Build con `npm run build`
   - Configurar `VITE_API_BASE_URL` en `.env.production`
   - Deploy a servidor web

3. **Collectors:**
   - Actualizar `-ApiBaseUrl` en Scheduled Tasks
   - Verificar conectividad desde servidor de collectors al backend

---

## 📚 Referencias

- [SignalR Documentation](https://learn.microsoft.com/en-us/aspnet/core/signalr/)
- [@microsoft/signalr NPM Package](https://www.npmjs.com/package/@microsoft/signalr)
- [React Context API](https://react.dev/reference/react/useContext)

---

**Versión:** 3.2  
**Fecha:** 28 Enero 2025  
**Autor:** SQL Guard Observatory Team

