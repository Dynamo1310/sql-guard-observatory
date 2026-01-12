using Microsoft.AspNetCore.Mvc;
using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Integration.AspNet.Core;

namespace SQLNovaTeamsBot.Controllers;

/// <summary>
/// Controller que recibe los mensajes de Teams via Bot Framework
/// </summary>
[Route("api/messages")]
[ApiController]
public class BotController : ControllerBase
{
    private readonly IBotFrameworkHttpAdapter _adapter;
    private readonly IBot _bot;

    public BotController(IBotFrameworkHttpAdapter adapter, IBot bot)
    {
        _adapter = adapter;
        _bot = bot;
    }

    /// <summary>
    /// Endpoint principal que recibe todos los mensajes del bot
    /// Teams envía las actividades aquí
    /// </summary>
    [HttpPost]
    [HttpGet]
    public async Task PostAsync()
    {
        // Delegar el procesamiento al adaptador del bot
        await _adapter.ProcessAsync(Request, Response, _bot);
    }
}









