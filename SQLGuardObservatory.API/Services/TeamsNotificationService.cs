using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Configuración de Teams desde appsettings.json
/// </summary>
public class TeamsSettings
{
    public string WebhookUrl { get; set; } = string.Empty;
    public string TenantId { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string TestUserEmail { get; set; } = string.Empty;
    public bool EnableWebhook { get; set; } = true;
    public bool EnableDirectMessages { get; set; } = false;
    public string AppUrl { get; set; } = "http://asprbm-nov-01:5173";
}

/// <summary>
/// Implementación del servicio de notificaciones a Microsoft Teams
/// Soporta Incoming Webhooks y Microsoft Graph API
/// </summary>
public class TeamsNotificationService : ITeamsNotificationService
{
    private readonly TeamsSettings _settings;
    private readonly ILogger<TeamsNotificationService> _logger;
    private readonly IHttpClientFactory _httpClientFactory;
    private string? _accessToken;
    private DateTime _tokenExpiration = DateTime.MinValue;

    public TeamsNotificationService(
        IConfiguration configuration,
        ILogger<TeamsNotificationService> logger,
        IHttpClientFactory httpClientFactory)
    {
        _settings = configuration.GetSection("TeamsSettings").Get<TeamsSettings>() ?? new TeamsSettings();
        _logger = logger;
        _httpClientFactory = httpClientFactory;
    }

    // ==================== ALERTAS ====================

    public async Task SendCriticalAlertAsync(
        string instanceName,
        int healthScore,
        string alertType,
        string message,
        string? onCallUserEmail = null)
    {
        var color = healthScore < 50 ? "attention" : healthScore < 70 ? "warning" : "good";
        var statusEmoji = healthScore < 50 ? "🔴" : healthScore < 70 ? "🟡" : "🟢";

        var card = CreateAdaptiveCard(
            title: $"{statusEmoji} Alerta: {instanceName}",
            subtitle: $"Health Score: {healthScore}/100 | Tipo: {alertType}",
            body: message,
            color: color,
            facts: new Dictionary<string, string>
            {
                { "Instancia", instanceName },
                { "Health Score", $"{healthScore}/100" },
                { "Tipo de Alerta", alertType },
                { "Hora", DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss") }
            },
            actionUrl: $"{_settings.AppUrl}/health-score",
            actionText: "Ver en SQL Nova"
        );

        // Enviar al canal
        await SendWebhookMessageAsync(card);

        // Enviar mensaje directo al operador de guardia si está configurado
        if (!string.IsNullOrEmpty(onCallUserEmail) && _settings.EnableDirectMessages)
        {
            await SendDirectMessageWithCardAsync(onCallUserEmail, card);
        }
        else if (!string.IsNullOrEmpty(_settings.TestUserEmail))
        {
            // En modo prueba, enviar al usuario de test
            _logger.LogInformation("Enviando alerta a usuario de prueba: {Email}", _settings.TestUserEmail);
            await SendDirectMessageWithCardAsync(_settings.TestUserEmail, card);
        }
    }

    public async Task SendAlertResolvedAsync(
        string instanceName,
        string alertType,
        string message)
    {
        var card = CreateAdaptiveCard(
            title: $"✅ Alerta Resuelta: {instanceName}",
            subtitle: $"Tipo: {alertType}",
            body: message,
            color: "good",
            facts: new Dictionary<string, string>
            {
                { "Instancia", instanceName },
                { "Tipo de Alerta", alertType },
                { "Resuelta", DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss") }
            }
        );

        await SendWebhookMessageAsync(card);
    }

    // ==================== GUARDIAS (ON-CALL) ====================

    public async Task SendSwapRequestNotificationAsync(
        string targetUserEmail,
        string targetUserName,
        string requesterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason,
        int swapRequestId)
    {
        var card = CreateAdaptiveCard(
            title: "📅 Solicitud de Intercambio de Guardia",
            subtitle: $"De: {requesterName}",
            body: $"**{requesterName}** te ha solicitado un intercambio de guardia DBA.\n\n" +
                  $"**Guardia solicitada:**\n" +
                  $"Desde: {weekStart:dddd dd/MM/yyyy HH:mm}\n" +
                  $"Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}" +
                  (string.IsNullOrEmpty(reason) ? "" : $"\n\n**Motivo:** {reason}"),
            color: "accent",
            facts: new Dictionary<string, string>
            {
                { "Solicitante", requesterName },
                { "Desde", weekStart.ToString("dd/MM/yyyy HH:mm") },
                { "Hasta", weekEnd.ToString("dd/MM/yyyy HH:mm") }
            },
            actionUrl: $"{_settings.AppUrl}/oncall",
            actionText: "Ver Solicitud"
        );

        var targetEmail = _settings.EnableDirectMessages ? targetUserEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    public async Task SendSwapApprovedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var card = CreateAdaptiveCard(
            title: "✅ Intercambio de Guardia Aprobado",
            subtitle: $"Aprobado por: {approverName}",
            body: $"Tu solicitud de intercambio ha sido **aprobada**.\n\n" +
                  $"**Guardia intercambiada:**\n" +
                  $"Desde: {weekStart:dddd dd/MM/yyyy HH:mm}\n" +
                  $"Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}",
            color: "good",
            facts: new Dictionary<string, string>
            {
                { "Aprobado por", approverName },
                { "Desde", weekStart.ToString("dd/MM/yyyy HH:mm") },
                { "Hasta", weekEnd.ToString("dd/MM/yyyy HH:mm") }
            },
            actionUrl: $"{_settings.AppUrl}/oncall",
            actionText: "Ver Calendario"
        );

        var targetEmail = _settings.EnableDirectMessages ? requesterEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    public async Task SendSwapRejectedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var card = CreateAdaptiveCard(
            title: "❌ Intercambio de Guardia Rechazado",
            subtitle: $"Rechazado por: {rejecterName}",
            body: $"Tu solicitud de intercambio ha sido **rechazada**.\n\n" +
                  $"**Guardia solicitada:**\n" +
                  $"Desde: {weekStart:dddd dd/MM/yyyy HH:mm}\n" +
                  $"Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}" +
                  (string.IsNullOrEmpty(reason) ? "" : $"\n\n**Motivo:** {reason}"),
            color: "attention",
            facts: new Dictionary<string, string>
            {
                { "Rechazado por", rejecterName },
                { "Desde", weekStart.ToString("dd/MM/yyyy HH:mm") },
                { "Hasta", weekEnd.ToString("dd/MM/yyyy HH:mm") }
            },
            actionUrl: $"{_settings.AppUrl}/oncall",
            actionText: "Ver Calendario"
        );

        var targetEmail = _settings.EnableDirectMessages ? requesterEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    public async Task SendOnCallStartNotificationAsync(
        string operatorEmail,
        string operatorName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var card = CreateAdaptiveCard(
            title: "🔔 Tu Guardia DBA Comienza",
            subtitle: $"Operador: {operatorName}",
            body: $"Hola **{operatorName}**,\n\n" +
                  $"Tu guardia DBA comienza ahora.\n\n" +
                  $"**Período:**\n" +
                  $"Desde: {weekStart:dddd dd/MM/yyyy HH:mm}\n" +
                  $"Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}",
            color: "accent",
            facts: new Dictionary<string, string>
            {
                { "Operador", operatorName },
                { "Desde", weekStart.ToString("dd/MM/yyyy HH:mm") },
                { "Hasta", weekEnd.ToString("dd/MM/yyyy HH:mm") }
            },
            actionUrl: $"{_settings.AppUrl}/health-score",
            actionText: "Ver Estado de Servidores"
        );

        // Enviar al canal también
        await SendWebhookMessageAsync(card);

        var targetEmail = _settings.EnableDirectMessages ? operatorEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    public async Task SendEscalationOverrideNotificationAsync(
        string affectedUserEmail,
        string affectedUserName,
        string escalationUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var card = CreateAdaptiveCard(
            title: "⚠️ Tu Guardia Ha Sido Modificada",
            subtitle: $"Por: {escalationUserName} (Escalamiento)",
            body: $"**{escalationUserName}** ha modificado tu asignación de guardia.\n\n" +
                  $"**Guardia afectada:**\n" +
                  $"Desde: {weekStart:dddd dd/MM/yyyy HH:mm}\n" +
                  $"Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}" +
                  (string.IsNullOrEmpty(reason) ? "" : $"\n\n**Motivo:** {reason}"),
            color: "warning",
            facts: new Dictionary<string, string>
            {
                { "Modificado por", escalationUserName },
                { "Desde", weekStart.ToString("dd/MM/yyyy HH:mm") },
                { "Hasta", weekEnd.ToString("dd/MM/yyyy HH:mm") }
            },
            actionUrl: $"{_settings.AppUrl}/oncall",
            actionText: "Ver Calendario"
        );

        var targetEmail = _settings.EnableDirectMessages ? affectedUserEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    // ==================== JOBS ====================

    public async Task SendJobFailedNotificationAsync(
        string instanceName,
        string jobName,
        DateTime failedAt,
        string? errorMessage)
    {
        var card = CreateAdaptiveCard(
            title: $"⚠️ Job Fallido: {jobName}",
            subtitle: $"Instancia: {instanceName}",
            body: $"El job **{jobName}** ha fallado en la instancia **{instanceName}**." +
                  (string.IsNullOrEmpty(errorMessage) ? "" : $"\n\n**Error:** {errorMessage}"),
            color: "attention",
            facts: new Dictionary<string, string>
            {
                { "Instancia", instanceName },
                { "Job", jobName },
                { "Hora", failedAt.ToString("dd/MM/yyyy HH:mm:ss") }
            },
            actionUrl: $"{_settings.AppUrl}/jobs",
            actionText: "Ver Jobs"
        );

        await SendWebhookMessageAsync(card);
    }

    // ==================== CANAL ====================

    public async Task SendChannelMessageAsync(
        string title,
        string message,
        string color = "default")
    {
        var card = CreateAdaptiveCard(
            title: title,
            subtitle: null,
            body: message,
            color: color
        );

        await SendWebhookMessageAsync(card);
    }

    // ==================== MENSAJE DIRECTO ====================

    public async Task SendDirectMessageAsync(
        string userEmail,
        string title,
        string message,
        string? actionUrl = null,
        string? actionText = null)
    {
        var card = CreateAdaptiveCard(
            title: title,
            subtitle: null,
            body: message,
            color: "default",
            actionUrl: actionUrl,
            actionText: actionText
        );

        var targetEmail = _settings.EnableDirectMessages ? userEmail : _settings.TestUserEmail;
        if (!string.IsNullOrEmpty(targetEmail))
        {
            await SendDirectMessageWithCardAsync(targetEmail, card);
        }
    }

    // ==================== HEALTH CHECK ====================

    public async Task<bool> TestConnectionAsync()
    {
        try
        {
            if (!string.IsNullOrEmpty(_settings.WebhookUrl))
            {
                var testCard = CreateAdaptiveCard(
                    title: "🧪 Test de Conexión",
                    subtitle: "SQL Nova",
                    body: "Conexión con Teams establecida correctamente.",
                    color: "good"
                );

                await SendWebhookMessageAsync(testCard);
                return true;
            }

            _logger.LogWarning("No hay WebhookUrl configurada para Teams");
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en test de conexión con Teams");
            return false;
        }
    }

    // ==================== MÉTODOS PRIVADOS ====================

    /// <summary>
    /// Crea una Adaptive Card para Teams
    /// </summary>
    private object CreateAdaptiveCard(
        string title,
        string? subtitle,
        string body,
        string color = "default",
        Dictionary<string, string>? facts = null,
        string? actionUrl = null,
        string? actionText = null)
    {
        var bodyElements = new List<object>
        {
            new
            {
                type = "TextBlock",
                text = title,
                weight = "bolder",
                size = "large",
                wrap = true,
                style = color == "attention" ? "attention" : 
                        color == "warning" ? "warning" : 
                        color == "good" ? "good" : "default"
            }
        };

        if (!string.IsNullOrEmpty(subtitle))
        {
            bodyElements.Add(new
            {
                type = "TextBlock",
                text = subtitle,
                isSubtle = true,
                wrap = true
            });
        }

        bodyElements.Add(new
        {
            type = "TextBlock",
            text = body,
            wrap = true
        });

        if (facts != null && facts.Count > 0)
        {
            bodyElements.Add(new
            {
                type = "FactSet",
                facts = facts.Select(f => new { title = f.Key, value = f.Value }).ToArray()
            });
        }

        var cardContent = new
        {
            type = "AdaptiveCard",
            body = bodyElements,
            actions = !string.IsNullOrEmpty(actionUrl) ? new object[]
            {
                new
                {
                    type = "Action.OpenUrl",
                    title = actionText ?? "Ver más",
                    url = actionUrl
                }
            } : Array.Empty<object>(),
            version = "1.4",
            msteams = new
            {
                width = "Full"
            }
        };

        // Formato para Incoming Webhook
        return new
        {
            type = "message",
            attachments = new[]
            {
                new
                {
                    contentType = "application/vnd.microsoft.card.adaptive",
                    content = cardContent
                }
            }
        };
    }

    /// <summary>
    /// Envía mensaje a través del Incoming Webhook
    /// </summary>
    private async Task SendWebhookMessageAsync(object card)
    {
        if (string.IsNullOrEmpty(_settings.WebhookUrl))
        {
            _logger.LogWarning("Teams Webhook no configurado. Mensaje no enviado.");
            return;
        }

        try
        {
            var client = _httpClientFactory.CreateClient("TeamsWebhook");
            var json = JsonSerializer.Serialize(card, new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase
            });

            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var response = await client.PostAsync(_settings.WebhookUrl, content);

            if (response.IsSuccessStatusCode)
            {
                _logger.LogInformation("Mensaje enviado a Teams via Webhook exitosamente");
            }
            else
            {
                var responseBody = await response.Content.ReadAsStringAsync();
                _logger.LogError("Error enviando mensaje a Teams: {StatusCode} - {Response}", 
                    response.StatusCode, responseBody);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando mensaje a Teams via Webhook");
        }
    }

    /// <summary>
    /// Envía mensaje directo a un usuario usando Microsoft Graph API
    /// </summary>
    private async Task SendDirectMessageWithCardAsync(string userEmail, object card)
    {
        if (string.IsNullOrEmpty(_settings.ClientId) || 
            string.IsNullOrEmpty(_settings.ClientSecret) || 
            string.IsNullOrEmpty(_settings.TenantId))
        {
            _logger.LogWarning("Graph API no configurada. Usando Webhook como fallback para {Email}", userEmail);
            // Fallback: enviar al webhook con mención
            await SendWebhookMessageAsync(card);
            return;
        }

        try
        {
            var token = await GetGraphAccessTokenAsync();
            if (string.IsNullOrEmpty(token))
            {
                _logger.LogError("No se pudo obtener token de Graph API");
                return;
            }

            var client = _httpClientFactory.CreateClient("GraphAPI");
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            // Obtener el ID del usuario por email
            var userResponse = await client.GetAsync(
                $"https://graph.microsoft.com/v1.0/users/{userEmail}");

            if (!userResponse.IsSuccessStatusCode)
            {
                _logger.LogError("No se encontró el usuario {Email} en Azure AD", userEmail);
                return;
            }

            var userJson = await userResponse.Content.ReadAsStringAsync();
            using var userDoc = JsonDocument.Parse(userJson);
            var userId = userDoc.RootElement.GetProperty("id").GetString();

            // Crear o obtener el chat con el usuario
            var chatPayload = new
            {
                chatType = "oneOnOne",
                members = new[]
                {
                    new
                    {
                        type = "#microsoft.graph.aadUserConversationMember",
                        roles = new[] { "owner" },
                        userId = userId
                    }
                }
            };

            var chatContent = new StringContent(
                JsonSerializer.Serialize(chatPayload),
                Encoding.UTF8,
                "application/json");

            var chatResponse = await client.PostAsync(
                "https://graph.microsoft.com/v1.0/chats",
                chatContent);

            string? chatId;
            if (chatResponse.IsSuccessStatusCode)
            {
                var chatJson = await chatResponse.Content.ReadAsStringAsync();
                using var chatDoc = JsonDocument.Parse(chatJson);
                chatId = chatDoc.RootElement.GetProperty("id").GetString();
            }
            else
            {
                // Si falla crear el chat, intentar obtener chats existentes
                _logger.LogWarning("No se pudo crear chat, intentando obtener existente");
                return;
            }

            // Enviar el mensaje al chat
            // Extraer el contenido de la adaptive card
            var cardObj = card as dynamic;
            var messagePayload = new
            {
                body = new
                {
                    contentType = "html",
                    content = $"<attachment id=\"adaptiveCard\"></attachment>"
                },
                attachments = new[]
                {
                    new
                    {
                        id = "adaptiveCard",
                        contentType = "application/vnd.microsoft.card.adaptive",
                        content = JsonSerializer.Serialize(((dynamic)card).attachments[0].content)
                    }
                }
            };

            var messageContent = new StringContent(
                JsonSerializer.Serialize(messagePayload),
                Encoding.UTF8,
                "application/json");

            var messageResponse = await client.PostAsync(
                $"https://graph.microsoft.com/v1.0/chats/{chatId}/messages",
                messageContent);

            if (messageResponse.IsSuccessStatusCode)
            {
                _logger.LogInformation("Mensaje directo enviado a {Email} exitosamente", userEmail);
            }
            else
            {
                var errorBody = await messageResponse.Content.ReadAsStringAsync();
                _logger.LogError("Error enviando mensaje directo: {StatusCode} - {Error}",
                    messageResponse.StatusCode, errorBody);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando mensaje directo a {Email}", userEmail);
        }
    }

    /// <summary>
    /// Obtiene token de acceso para Microsoft Graph API
    /// </summary>
    private async Task<string?> GetGraphAccessTokenAsync()
    {
        if (!string.IsNullOrEmpty(_accessToken) && DateTime.UtcNow < _tokenExpiration)
        {
            return _accessToken;
        }

        try
        {
            var client = _httpClientFactory.CreateClient("GraphAuth");
            var tokenEndpoint = $"https://login.microsoftonline.com/{_settings.TenantId}/oauth2/v2.0/token";

            var parameters = new Dictionary<string, string>
            {
                { "client_id", _settings.ClientId },
                { "client_secret", _settings.ClientSecret },
                { "scope", "https://graph.microsoft.com/.default" },
                { "grant_type", "client_credentials" }
            };

            var content = new FormUrlEncodedContent(parameters);
            var response = await client.PostAsync(tokenEndpoint, content);

            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync();
                using var doc = JsonDocument.Parse(json);
                _accessToken = doc.RootElement.GetProperty("access_token").GetString();
                var expiresIn = doc.RootElement.GetProperty("expires_in").GetInt32();
                _tokenExpiration = DateTime.UtcNow.AddSeconds(expiresIn - 60); // 1 minuto de margen
                return _accessToken;
            }

            _logger.LogError("Error obteniendo token de Graph API: {StatusCode}", response.StatusCode);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo token de Graph API");
            return null;
        }
    }
}


