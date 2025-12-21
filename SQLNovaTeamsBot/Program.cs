using Microsoft.Bot.Builder;
using Microsoft.Bot.Builder.Integration.AspNet.Core;
using Microsoft.Bot.Connector.Authentication;
using SQLNovaTeamsBot.Bots;
using SQLNovaTeamsBot.Services;

var builder = WebApplication.CreateBuilder(args);

// Configuración del Bot Framework
builder.Services.AddSingleton<BotFrameworkAuthentication, ConfigurationBotFrameworkAuthentication>();
builder.Services.AddSingleton<IBotFrameworkHttpAdapter, AdapterWithErrorHandler>();

// Registrar el bot
builder.Services.AddTransient<IBot, SQLNovaBot>();

// Cliente HTTP para comunicarse con la API de SQL Nova
builder.Services.AddHttpClient<ISQLNovaApiClient, SQLNovaApiClient>(client =>
{
    var apiUrl = builder.Configuration["SQLNovaApi:BaseUrl"] ?? "http://asprbm-nov-01:5000";
    client.BaseAddress = new Uri(apiUrl);
    client.Timeout = TimeSpan.FromSeconds(30);
});

builder.Services.AddControllers();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

Console.WriteLine("===========================================");
Console.WriteLine("SQL Nova Teams Bot iniciado");
Console.WriteLine($"Endpoint: /api/messages");
Console.WriteLine("===========================================");

app.Run();






