using Microsoft.Bot.Builder.Integration.AspNet.Core;
using Microsoft.Bot.Builder.TraceExtensions;
using Microsoft.Bot.Connector.Authentication;

namespace SQLNovaTeamsBot;

/// <summary>
/// Adaptador del Bot con manejo de errores
/// </summary>
public class AdapterWithErrorHandler : CloudAdapter
{
    public AdapterWithErrorHandler(
        BotFrameworkAuthentication auth,
        ILogger<IBotFrameworkHttpAdapter> logger)
        : base(auth, logger)
    {
        OnTurnError = async (turnContext, exception) =>
        {
            // Log del error
            logger.LogError(exception, "[OnTurnError] Error no controlado: {Message}", exception.Message);

            // Enviar mensaje de error al usuario
            await turnContext.SendActivityAsync("❌ Ocurrió un error procesando tu solicitud. Por favor intenta nuevamente.");

            // Enviar trace activity (solo visible en Bot Framework Emulator)
            await turnContext.TraceActivityAsync("OnTurnError Trace", exception.Message, "https://www.botframework.com/schemas/error", "TurnError");
        };
    }
}



