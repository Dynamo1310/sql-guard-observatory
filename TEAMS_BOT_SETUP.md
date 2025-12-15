# Configuración del Bot de Microsoft Teams para SQL Nova

## Resumen

SQL Nova ahora incluye integración con Microsoft Teams para:
- **Notificaciones push**: Alertas críticas, cambios de guardia, jobs fallidos
- **Mensajes directos**: Solicitudes de intercambio, aprobaciones/rechazos
- **Bot interactivo**: Comandos para consultar estado de servidores

---

## Fase 1: Configuración de Incoming Webhook (Notificaciones a Canal)

### Paso 1: Crear Webhook en Teams

1. Abrir Microsoft Teams
2. Ir al canal donde se enviarán las notificaciones (ej: "DBA Alerts")
3. Click en los tres puntos (`...`) junto al nombre del canal
4. Seleccionar **Conectores** > **Editar**
5. Buscar **Incoming Webhook** y click en **Agregar**
6. Configurar:
   - **Nombre**: `SQL Nova Bot`
   - **Imagen**: (opcional) subir logo de SQL Nova
7. Click en **Crear**
8. **Copiar la URL del webhook** (la necesitarás para la configuración)

### Paso 2: Configurar appsettings.json

Editar `SQLGuardObservatory.API/appsettings.json`:

```json
{
  "TeamsSettings": {
    "WebhookUrl": "https://outlook.office.com/webhook/XXXXXX/IncomingWebhook/YYYYYY/ZZZZZZ",
    "TenantId": "",
    "ClientId": "",
    "ClientSecret": "",
    "TestUserEmail": "tballesteros.megatech@supervielle.com.ar",
    "EnableWebhook": true,
    "EnableDirectMessages": false,
    "AppUrl": "http://asprbm-nov-01:8080"
  }
}
```

### Paso 3: Probar la conexión

```bash
# Usando PowerShell
Invoke-RestMethod -Uri "http://localhost:5000/api/notifications/teams/test" -Method GET

# O desde el navegador
http://localhost:5000/api/notifications/teams/test
```

---

## Fase 2: Configuración de Graph API (Mensajes Directos)

### Paso 1: Registrar App en Azure AD

1. Ir a [Azure Portal](https://portal.azure.com)
2. Navegar a **Azure Active Directory** > **App registrations**
3. Click en **New registration**
4. Configurar:
   - **Name**: `SQLNova-TeamsBot`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: (dejar vacío)
5. Click en **Register**
6. Anotar el **Application (client) ID** y **Directory (tenant) ID**

### Paso 2: Configurar Permisos de API

1. En la app registrada, ir a **API permissions**
2. Click en **Add a permission** > **Microsoft Graph** > **Application permissions**
3. Agregar los siguientes permisos:
   - `Chat.Create`
   - `Chat.ReadWrite.All`
   - `User.Read.All`
   - `TeamsActivity.Send`
4. Click en **Grant admin consent for [Organización]**

### Paso 3: Crear Client Secret

1. En la app registrada, ir a **Certificates & secrets**
2. Click en **New client secret**
3. Configurar:
   - **Description**: `SQL Nova Teams Bot`
   - **Expires**: `24 months` (o según política de seguridad)
4. Click en **Add**
5. **Copiar el Value del secreto** (solo se muestra una vez)

### Paso 4: Actualizar appsettings.json

```json
{
  "TeamsSettings": {
    "WebhookUrl": "https://outlook.office.com/webhook/...",
    "TenantId": "tu-tenant-id-de-azure-ad",
    "ClientId": "tu-client-id-de-la-app",
    "ClientSecret": "tu-client-secret",
    "TestUserEmail": "tballesteros.megatech@supervielle.com.ar",
    "EnableWebhook": true,
    "EnableDirectMessages": true,
    "AppUrl": "http://asprbm-nov-01:8080"
  }
}
```

---

## Endpoints de API Disponibles

### Probar conexión
```http
GET /api/notifications/teams/test
```

### Enviar mensaje de prueba
```http
POST /api/notifications/teams/send
Content-Type: application/json

{
  "title": "Mensaje de Prueba",
  "message": "Este es un mensaje de prueba desde SQL Nova",
  "userEmail": "tballesteros.megatech@supervielle.com.ar"
}
```

### Enviar alerta de prueba
```http
POST /api/notifications/teams/test-alert
Content-Type: application/json

{
  "instanceName": "PROD-SQL-01",
  "healthScore": 45,
  "alertType": "HealthScore",
  "message": "Health Score bajo detectado"
}
```

### Bot Webhook (para comandos simples)
```http
POST /api/teams/bot/webhook
Content-Type: application/json

{
  "command": "status",
  "responseEmail": "tballesteros.megatech@supervielle.com.ar"
}
```

### Ayuda de comandos del bot
```http
GET /api/teams/bot/help
```

---

## Comandos del Bot

El bot de SQL Nova responde a los siguientes comandos:

| Comando | Descripción |
|---------|-------------|
| `status` | Ver resumen general de todas las instancias |
| `status [nombre]` | Ver Health Score de una instancia específica |
| `alerts` | Ver alertas activas (instancias críticas y con advertencias) |
| `oncall` | Ver quién está de guardia actualmente |
| `help` | Mostrar ayuda de comandos |

### Ejemplos de uso:
```
@SQLNova status
@SQLNova status PROD-SQL-01
@SQLNova alerts
@SQLNova oncall
```

---

## Tipos de Notificaciones Automáticas

### Enviadas al Canal (Webhook)

| Evento | Condición |
|--------|-----------|
| Alerta Crítica | Health Score < 50 |
| Alerta Warning | Health Score 50-70 |
| Job Fallido | Cuando un job SQL falla |
| Inicio de Guardia | Cuando comienza una nueva guardia |

### Enviadas como Mensaje Directo

| Evento | Destinatario |
|--------|--------------|
| Solicitud de Intercambio | Usuario objetivo |
| Intercambio Aprobado | Solicitante |
| Intercambio Rechazado | Solicitante |
| Modificación de Guardia | Usuario afectado |
| Alerta Crítica | Operador de guardia actual |

---

## Modo de Prueba

Durante las pruebas, todos los mensajes directos se envían a:
- **Email**: `tballesteros.megatech@supervielle.com.ar`

Para cambiar a modo producción:
1. Configurar `EnableDirectMessages: true`
2. Asegurar que Graph API esté correctamente configurada
3. Los mensajes se enviarán a los usuarios reales

---

## Troubleshooting

### El webhook no envía mensajes

1. Verificar que `WebhookUrl` esté configurado correctamente
2. Verificar que el webhook esté activo en Teams
3. Revisar logs en `SQLGuardObservatory.API/Logs/`

### Graph API retorna error 401

1. Verificar que `TenantId`, `ClientId` y `ClientSecret` sean correctos
2. Verificar que los permisos de API estén otorgados con admin consent
3. Verificar que el Client Secret no haya expirado

### No se encuentra el usuario

1. Verificar que el email del usuario exista en Azure AD
2. Verificar que el usuario tenga licencia de Teams

---

## Archivos Modificados/Creados

### Nuevos Archivos
- `Services/ITeamsNotificationService.cs` - Interface del servicio
- `Services/TeamsNotificationService.cs` - Implementación
- `DTOs/TeamsMessageDto.cs` - DTOs para Adaptive Cards
- `Controllers/TeamsBotController.cs` - Controller para el bot

### Archivos Modificados
- `appsettings.json` - Configuración de Teams
- `Program.cs` - Registro del servicio
- `Services/OnCallService.cs` - Integración de notificaciones
- `Controllers/NotificationController.cs` - Endpoints de Teams

---

## Próximos Pasos (Opcionales)

1. **Bot Framework completo**: Registrar el bot en Azure Bot Service para funcionalidad completa
2. **Acciones interactivas**: Implementar botones de aprobar/rechazar directamente en Teams
3. **Notificaciones de inicio de guardia**: Job programado para notificar inicio de turno
4. **Dashboard en Teams**: Crear tab de Teams con dashboard de SQL Nova


