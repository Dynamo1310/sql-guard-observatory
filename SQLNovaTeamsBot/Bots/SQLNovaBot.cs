using Microsoft.Bot.Builder;
using Microsoft.Bot.Schema;
using SQLNovaTeamsBot.Cards;
using SQLNovaTeamsBot.Services;
using System.Text.RegularExpressions;

namespace SQLNovaTeamsBot.Bots;

/// <summary>
/// Bot principal de SQL Nova para Microsoft Teams
/// Procesa comandos y responde con información operativa
/// </summary>
public class SQLNovaBot : ActivityHandler
{
    private readonly ISQLNovaApiClient _apiClient;
    private readonly ILogger<SQLNovaBot> _logger;

    public SQLNovaBot(ISQLNovaApiClient apiClient, ILogger<SQLNovaBot> logger)
    {
        _apiClient = apiClient;
        _logger = logger;
    }

    /// <summary>
    /// Se ejecuta cuando el usuario envía un mensaje
    /// </summary>
    protected override async Task OnMessageActivityAsync(ITurnContext<IMessageActivity> turnContext, CancellationToken cancellationToken)
    {
        var userMessage = turnContext.Activity.Text?.Trim() ?? "";
        var userId = turnContext.Activity.From?.Id ?? "unknown";
        var tenantId = turnContext.Activity.Conversation?.TenantId ?? "unknown";

        _logger.LogInformation("Mensaje recibido de {UserId} (Tenant: {TenantId}): {Message}", 
            userId, tenantId, userMessage);

        // Remover mención del bot si existe
        userMessage = RemoveBotMention(userMessage);

        // Procesar comando
        var response = await ProcessCommandAsync(userMessage, turnContext, cancellationToken);
        
        if (response != null)
        {
            await turnContext.SendActivityAsync(response, cancellationToken);
        }
    }

    /// <summary>
    /// Se ejecuta cuando el usuario inicia una conversación con el bot
    /// </summary>
    protected override async Task OnMembersAddedAsync(IList<ChannelAccount> membersAdded, ITurnContext<IConversationUpdateActivity> turnContext, CancellationToken cancellationToken)
    {
        foreach (var member in membersAdded)
        {
            if (member.Id != turnContext.Activity.Recipient.Id)
            {
                var welcomeCard = AdaptiveCardFactory.CreateWelcomeCard();
                var response = MessageFactory.Attachment(welcomeCard);
                await turnContext.SendActivityAsync(response, cancellationToken);
            }
        }
    }

    /// <summary>
    /// Procesa el comando del usuario y retorna la respuesta
    /// </summary>
    private async Task<IActivity?> ProcessCommandAsync(string command, ITurnContext turnContext, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return MessageFactory.Attachment(AdaptiveCardFactory.CreateHelpCard());
        }

        var parts = command.ToLower().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var mainCommand = parts.FirstOrDefault() ?? "";

        return mainCommand switch
        {
            "estado" or "status" => await HandleStatusCommandAsync(parts.Skip(1).FirstOrDefault()),
            "alertas" or "alerts" => await HandleAlertsCommandAsync(),
            "incidentes" or "incidents" => await HandleAlertsCommandAsync(), // Alias
            "guardia" or "oncall" => await HandleOnCallCommandAsync(),
            "ayuda" or "help" or "?" => MessageFactory.Attachment(AdaptiveCardFactory.CreateHelpCard()),
            "hola" or "hi" or "hello" => MessageFactory.Attachment(AdaptiveCardFactory.CreateWelcomeCard()),
            _ => MessageFactory.Text($"❓ Comando no reconocido: `{mainCommand}`\n\nEscribe **ayuda** para ver los comandos disponibles.")
        };
    }

    /// <summary>
    /// Maneja el comando 'estado' o 'status'
    /// </summary>
    private async Task<IActivity> HandleStatusCommandAsync(string? instanceFilter)
    {
        if (!string.IsNullOrEmpty(instanceFilter))
        {
            // Buscar instancia específica
            var scores = await _apiClient.GetHealthScoresAsync();
            if (scores == null)
            {
                return MessageFactory.Text("❌ Error al conectar con SQL Nova API");
            }

            var instance = scores.FirstOrDefault(s => 
                s.InstanceName.Contains(instanceFilter, StringComparison.OrdinalIgnoreCase));

            if (instance == null)
            {
                return MessageFactory.Text($"❓ No se encontró una instancia que coincida con: `{instanceFilter}`");
            }

            var card = AdaptiveCardFactory.CreateInstanceStatusCard(instance);
            return MessageFactory.Attachment(card);
        }
        else
        {
            // Resumen general
            var summary = await _apiClient.GetHealthSummaryAsync();
            if (summary == null)
            {
                return MessageFactory.Text("❌ Error al conectar con SQL Nova API");
            }

            var card = AdaptiveCardFactory.CreateStatusSummaryCard(summary);
            return MessageFactory.Attachment(card);
        }
    }

    /// <summary>
    /// Maneja el comando 'alertas' o 'alerts'
    /// </summary>
    private async Task<IActivity> HandleAlertsCommandAsync()
    {
        var alerts = await _apiClient.GetActiveAlertsAsync();
        if (alerts == null)
        {
            return MessageFactory.Text("❌ Error al conectar con SQL Nova API");
        }

        if (!alerts.Any())
        {
            return MessageFactory.Text("✅ **No hay alertas activas**\n\nTodas las instancias están funcionando correctamente.");
        }

        var card = AdaptiveCardFactory.CreateAlertsCard(alerts);
        return MessageFactory.Attachment(card);
    }

    /// <summary>
    /// Maneja el comando 'guardia' o 'oncall'
    /// </summary>
    private async Task<IActivity> HandleOnCallCommandAsync()
    {
        var onCall = await _apiClient.GetCurrentOnCallAsync();
        if (onCall == null)
        {
            return MessageFactory.Text("❌ Error al conectar con SQL Nova API");
        }

        var card = AdaptiveCardFactory.CreateOnCallCard(onCall);
        return MessageFactory.Attachment(card);
    }

    /// <summary>
    /// Remueve la mención del bot del mensaje
    /// </summary>
    private string RemoveBotMention(string text)
    {
        // Remover menciones de Teams (@SQLNova, <at>SQLNova</at>, etc.)
        text = Regex.Replace(text, @"<at>.*?</at>", "", RegexOptions.IgnoreCase);
        text = Regex.Replace(text, @"@\w+", "");
        return text.Trim();
    }
}






