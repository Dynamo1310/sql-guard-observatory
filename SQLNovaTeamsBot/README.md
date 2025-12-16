# SQL Nova Teams Bot

Bot de Microsoft Teams para consultar información operativa de SQL Nova.

## Características

- ✅ Chat 1:1 con el bot
- ✅ Funciona en canales de Teams
- ✅ Sin Microsoft Graph
- ✅ Sin Admin Consent
- ✅ Sin permisos de Azure AD
- ✅ Instalable via side-loading (ZIP)
- ✅ No requiere Power Automate

## Comandos Disponibles

| Comando | Descripción |
|---------|-------------|
| `estado` | Ver resumen general de instancias |
| `estado [nombre]` | Ver estado de instancia específica |
| `alertas` | Ver alertas activas |
| `incidentes` | Alias de alertas |
| `guardia` | Ver operador de guardia actual |
| `ayuda` | Mostrar ayuda |

## Arquitectura

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  Microsoft      │      │  SQL Nova        │      │  SQL Nova       │
│  Teams          │◄────►│  Teams Bot       │◄────►│  API            │
│  (Cloud)        │      │  (HTTPS público) │      │  (Red interna)  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
        │                        │
        │                        │
        ▼                        ▼
   Bot Framework            ASP.NET Core
   Channel (Teams)          .NET 8
```

## Requisitos

1. **Endpoint HTTPS público** para el bot (ngrok, Azure, servidor con IP pública)
2. **Azure Bot Registration** (solo identidad, sin permisos de Graph)
3. **SQL Nova API** accesible desde el servidor del bot

---

## Configuración Paso a Paso

### Paso 1: Crear Azure Bot Registration

1. Ve a [Azure Portal](https://portal.azure.com)
2. Busca "Azure Bot" y click en "Create"
3. Configuración:
   - **Bot handle**: `sqlnova-bot`
   - **Subscription**: Tu suscripción
   - **Resource group**: Crear uno nuevo o usar existente
   - **Pricing tier**: F0 (Free)
   - **Type of App**: Single Tenant
   - **Creation type**: Create new Microsoft App ID
4. Click en "Create"

### Paso 2: Obtener App ID y Password

1. Ve al recurso del bot creado
2. En "Configuration", copia el **Microsoft App ID**
3. Click en "Manage Password" → "New client secret"
4. Copia el **Value** del secreto (solo se muestra una vez)

### Paso 3: Habilitar Canal de Teams

1. En el recurso del bot, ve a "Channels"
2. Click en "Microsoft Teams"
3. Acepta los términos y click en "Apply"

### Paso 4: Configurar Endpoint del Bot

Necesitas exponer el bot a internet. Opciones:

#### Opción A: ngrok (desarrollo/pruebas)

```bash
# Instalar ngrok
choco install ngrok

# Exponer puerto local
ngrok http 5001 --host-header=localhost:5001
```

Copia la URL HTTPS que te da ngrok (ej: `https://abc123.ngrok.io`)

#### Opción B: Azure App Service

Publicar el bot en Azure App Service (fuera del alcance de este documento)

#### Opción C: Servidor propio con HTTPS

Necesitas un servidor con IP pública y certificado SSL válido.

### Paso 5: Configurar Messaging Endpoint

1. En el recurso del bot en Azure, ve a "Configuration"
2. En "Messaging endpoint", pon: `https://TU-URL-PUBLICA/api/messages`
3. Click en "Apply"

### Paso 6: Actualizar appsettings.json

```json
{
  "MicrosoftAppType": "SingleTenant",
  "MicrosoftAppId": "TU-APP-ID-DEL-PASO-2",
  "MicrosoftAppPassword": "TU-PASSWORD-DEL-PASO-2",
  "MicrosoftAppTenantId": "e9d72534-ad36-4657-bc30-46bd7f6add1a",
  "SQLNovaApi": {
    "BaseUrl": "http://asprbm-nov-01:5000"
  }
}
```

### Paso 7: Actualizar manifest.json

1. Abre `TeamsAppManifest/manifest.json`
2. Reemplaza `TU-BOT-APP-ID-AQUI` con el App ID del Paso 2
3. Agrega iconos reales (color.png 192x192, outline.png 32x32)

### Paso 8: Crear paquete ZIP

```powershell
cd SQLNovaTeamsBot\TeamsAppManifest
Compress-Archive -Path manifest.json, color.png, outline.png -DestinationPath SQLNovaBot.zip
```

### Paso 9: Instalar en Teams (Side-loading)

1. Abre Microsoft Teams
2. Ve a "Apps" (barra lateral izquierda)
3. Click en "Manage your apps" (abajo)
4. Click en "Upload an app"
5. Selecciona "Upload a custom app"
6. Sube el archivo `SQLNovaBot.zip`
7. Click en "Add"

### Paso 10: Probar el Bot

1. En Teams, busca "SQL Nova" en la barra de búsqueda
2. Inicia un chat con el bot
3. Escribe `ayuda` para ver los comandos

---

## Checklist de Configuración

### ✅ Configurar en Azure

- [ ] Crear Azure Bot Registration (F0 Free)
- [ ] Obtener Microsoft App ID
- [ ] Crear Client Secret
- [ ] Habilitar canal Microsoft Teams
- [ ] Configurar Messaging endpoint

### ❌ NO configurar (no necesario)

- ~~API Permissions~~
- ~~Admin Consent~~
- ~~Microsoft Graph~~
- ~~OAuth/SSO~~
- ~~Azure AD App Registration separado~~

---

## Ejecutar el Bot Localmente

```bash
cd SQLNovaTeamsBot
dotnet restore
dotnet run
```

El bot se ejecutará en `https://localhost:5001`

---

## Troubleshooting

### Error: "Bot not reachable"

- Verificar que el endpoint HTTPS es accesible desde internet
- Verificar que el Messaging endpoint en Azure está correcto
- Verificar certificado SSL válido

### Error: "Unauthorized"

- Verificar MicrosoftAppId y MicrosoftAppPassword en appsettings.json
- Verificar que el Tenant ID es correcto

### Bot no responde

- Revisar logs del bot
- Verificar que SQL Nova API está accesible
- Verificar conexión de red entre bot y API

---

## Diagrama de Flujo

```
Usuario en Teams
       │
       ▼
   Escribe mensaje
   "estado PROD-SQL-01"
       │
       ▼
Microsoft Teams Cloud
       │
       ▼
Bot Framework Service
       │
       ▼
POST /api/messages
(SQL Nova Teams Bot)
       │
       ▼
SQLNovaBot.OnMessageActivityAsync()
       │
       ▼
ProcessCommandAsync("estado PROD-SQL-01")
       │
       ▼
SQLNovaApiClient.GetHealthScoresAsync()
       │
       ▼
GET http://asprbm-nov-01:5000/api/healthscore
       │
       ▼
AdaptiveCardFactory.CreateInstanceStatusCard()
       │
       ▼
Respuesta con Adaptive Card
       │
       ▼
Usuario ve el resultado en Teams
```

---

## Licencia

Uso interno - Supervielle



