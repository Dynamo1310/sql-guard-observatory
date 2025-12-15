namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para mensajes de Teams via Webhook
/// </summary>
public class TeamsWebhookMessageDto
{
    public string Type { get; set; } = "message";
    public List<TeamsAttachmentDto> Attachments { get; set; } = new();
}

/// <summary>
/// DTO para attachments de Teams (Adaptive Cards)
/// </summary>
public class TeamsAttachmentDto
{
    public string ContentType { get; set; } = "application/vnd.microsoft.card.adaptive";
    public AdaptiveCardDto Content { get; set; } = new();
}

/// <summary>
/// DTO para Adaptive Card
/// </summary>
public class AdaptiveCardDto
{
    public string Type { get; set; } = "AdaptiveCard";
    public string Version { get; set; } = "1.4";
    public List<object> Body { get; set; } = new();
    public List<AdaptiveCardActionDto>? Actions { get; set; }
    public AdaptiveCardMsTeamsDto? MsTeams { get; set; }
}

/// <summary>
/// DTO para configuración específica de MS Teams
/// </summary>
public class AdaptiveCardMsTeamsDto
{
    public string Width { get; set; } = "Full";
}

/// <summary>
/// DTO para acciones en Adaptive Cards
/// </summary>
public class AdaptiveCardActionDto
{
    public string Type { get; set; } = "Action.OpenUrl";
    public string Title { get; set; } = string.Empty;
    public string? Url { get; set; }
    public string? Data { get; set; }
}

/// <summary>
/// DTO para bloque de texto en Adaptive Card
/// </summary>
public class AdaptiveCardTextBlockDto
{
    public string Type { get; set; } = "TextBlock";
    public string Text { get; set; } = string.Empty;
    public string? Weight { get; set; }
    public string? Size { get; set; }
    public string? Color { get; set; }
    public bool? IsSubtle { get; set; }
    public bool Wrap { get; set; } = true;
}

/// <summary>
/// DTO para conjunto de hechos en Adaptive Card
/// </summary>
public class AdaptiveCardFactSetDto
{
    public string Type { get; set; } = "FactSet";
    public List<AdaptiveCardFactDto> Facts { get; set; } = new();
}

/// <summary>
/// DTO para un hecho individual
/// </summary>
public class AdaptiveCardFactDto
{
    public string Title { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
}

/// <summary>
/// DTO para columnas en Adaptive Card
/// </summary>
public class AdaptiveCardColumnSetDto
{
    public string Type { get; set; } = "ColumnSet";
    public List<AdaptiveCardColumnDto> Columns { get; set; } = new();
}

/// <summary>
/// DTO para una columna individual
/// </summary>
public class AdaptiveCardColumnDto
{
    public string Type { get; set; } = "Column";
    public string Width { get; set; } = "auto";
    public List<object> Items { get; set; } = new();
}

/// <summary>
/// DTO para imagen en Adaptive Card
/// </summary>
public class AdaptiveCardImageDto
{
    public string Type { get; set; } = "Image";
    public string Url { get; set; } = string.Empty;
    public string? Size { get; set; }
    public string? Style { get; set; }
    public string? AltText { get; set; }
}

/// <summary>
/// DTO para contenedor en Adaptive Card
/// </summary>
public class AdaptiveCardContainerDto
{
    public string Type { get; set; } = "Container";
    public List<object> Items { get; set; } = new();
    public string? Style { get; set; }
    public AdaptiveCardBackgroundImageDto? BackgroundImage { get; set; }
}

/// <summary>
/// DTO para imagen de fondo
/// </summary>
public class AdaptiveCardBackgroundImageDto
{
    public string Url { get; set; } = string.Empty;
    public string FillMode { get; set; } = "cover";
}

/// <summary>
/// DTO para solicitudes del bot de Teams
/// </summary>
public class TeamsBotRequestDto
{
    public string Type { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public TeamsBotFromDto? From { get; set; }
    public TeamsBotConversationDto? Conversation { get; set; }
    public string? ServiceUrl { get; set; }
    public string? ChannelId { get; set; }
    public TeamsBotValueDto? Value { get; set; }
}

/// <summary>
/// DTO para el remitente del mensaje
/// </summary>
public class TeamsBotFromDto
{
    public string Id { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? AadObjectId { get; set; }
}

/// <summary>
/// DTO para la conversación
/// </summary>
public class TeamsBotConversationDto
{
    public string Id { get; set; } = string.Empty;
    public string? ConversationType { get; set; }
    public string? TenantId { get; set; }
}

/// <summary>
/// DTO para valores de acciones del bot
/// </summary>
public class TeamsBotValueDto
{
    public string? Action { get; set; }
    public string? AlertId { get; set; }
    public string? InstanceName { get; set; }
    public int? SwapRequestId { get; set; }
}

/// <summary>
/// DTO para respuestas del bot
/// </summary>
public class TeamsBotResponseDto
{
    public string Type { get; set; } = "message";
    public string Text { get; set; } = string.Empty;
    public List<TeamsAttachmentDto>? Attachments { get; set; }
}

/// <summary>
/// Clase helper para construir Adaptive Cards
/// </summary>
public static class AdaptiveCardBuilder
{
    /// <summary>
    /// Crea una Adaptive Card para alertas
    /// </summary>
    public static TeamsWebhookMessageDto CreateAlertCard(
        string title,
        string instanceName,
        int healthScore,
        string alertType,
        string message,
        string appUrl)
    {
        var color = healthScore < 50 ? "attention" : healthScore < 70 ? "warning" : "good";
        var emoji = healthScore < 50 ? "🔴" : healthScore < 70 ? "🟡" : "🟢";

        return new TeamsWebhookMessageDto
        {
            Attachments = new List<TeamsAttachmentDto>
            {
                new TeamsAttachmentDto
                {
                    Content = new AdaptiveCardDto
                    {
                        Body = new List<object>
                        {
                            new AdaptiveCardTextBlockDto
                            {
                                Text = $"{emoji} {title}",
                                Weight = "bolder",
                                Size = "large"
                            },
                            new AdaptiveCardTextBlockDto
                            {
                                Text = $"Instancia: {instanceName} | Health Score: {healthScore}/100",
                                IsSubtle = true
                            },
                            new AdaptiveCardTextBlockDto
                            {
                                Text = message
                            },
                            new AdaptiveCardFactSetDto
                            {
                                Facts = new List<AdaptiveCardFactDto>
                                {
                                    new() { Title = "Tipo", Value = alertType },
                                    new() { Title = "Hora", Value = DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss") }
                                }
                            }
                        },
                        Actions = new List<AdaptiveCardActionDto>
                        {
                            new()
                            {
                                Type = "Action.OpenUrl",
                                Title = "Ver en SQL Nova",
                                Url = $"{appUrl}/health-score"
                            }
                        },
                        MsTeams = new AdaptiveCardMsTeamsDto { Width = "Full" }
                    }
                }
            }
        };
    }

    /// <summary>
    /// Crea una Adaptive Card para notificaciones de guardia
    /// </summary>
    public static TeamsWebhookMessageDto CreateOnCallCard(
        string title,
        string subtitle,
        string body,
        DateTime weekStart,
        DateTime weekEnd,
        string appUrl,
        string color = "accent")
    {
        var emoji = color switch
        {
            "good" => "✅",
            "attention" => "❌",
            "warning" => "⚠️",
            _ => "📅"
        };

        return new TeamsWebhookMessageDto
        {
            Attachments = new List<TeamsAttachmentDto>
            {
                new TeamsAttachmentDto
                {
                    Content = new AdaptiveCardDto
                    {
                        Body = new List<object>
                        {
                            new AdaptiveCardTextBlockDto
                            {
                                Text = $"{emoji} {title}",
                                Weight = "bolder",
                                Size = "large"
                            },
                            new AdaptiveCardTextBlockDto
                            {
                                Text = subtitle,
                                IsSubtle = true
                            },
                            new AdaptiveCardTextBlockDto
                            {
                                Text = body
                            },
                            new AdaptiveCardFactSetDto
                            {
                                Facts = new List<AdaptiveCardFactDto>
                                {
                                    new() { Title = "Desde", Value = weekStart.ToString("dddd dd/MM/yyyy HH:mm") },
                                    new() { Title = "Hasta", Value = weekEnd.ToString("dddd dd/MM/yyyy HH:mm") }
                                }
                            }
                        },
                        Actions = new List<AdaptiveCardActionDto>
                        {
                            new()
                            {
                                Type = "Action.OpenUrl",
                                Title = "Ver Calendario",
                                Url = $"{appUrl}/oncall"
                            }
                        },
                        MsTeams = new AdaptiveCardMsTeamsDto { Width = "Full" }
                    }
                }
            }
        };
    }

    /// <summary>
    /// Crea una Adaptive Card simple para mensajes genéricos
    /// </summary>
    public static TeamsWebhookMessageDto CreateSimpleCard(
        string title,
        string message,
        string? actionUrl = null,
        string? actionText = null)
    {
        var card = new AdaptiveCardDto
        {
            Body = new List<object>
            {
                new AdaptiveCardTextBlockDto
                {
                    Text = title,
                    Weight = "bolder",
                    Size = "large"
                },
                new AdaptiveCardTextBlockDto
                {
                    Text = message
                }
            },
            MsTeams = new AdaptiveCardMsTeamsDto { Width = "Full" }
        };

        if (!string.IsNullOrEmpty(actionUrl))
        {
            card.Actions = new List<AdaptiveCardActionDto>
            {
                new()
                {
                    Type = "Action.OpenUrl",
                    Title = actionText ?? "Ver más",
                    Url = actionUrl
                }
            };
        }

        return new TeamsWebhookMessageDto
        {
            Attachments = new List<TeamsAttachmentDto>
            {
                new TeamsAttachmentDto { Content = card }
            }
        };
    }
}


