using System.Net;
using System.Text.Json;

namespace SQLGuardObservatory.API.Middleware;

/// <summary>
/// Middleware global de manejo de excepciones.
/// Captura excepciones no controladas y retorna respuestas JSON estandarizadas.
/// </summary>
public class ExceptionHandlingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public ExceptionHandlingMiddleware(RequestDelegate next, ILogger<ExceptionHandlingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        var traceId = context.TraceIdentifier;

        var (statusCode, message) = exception switch
        {
            ArgumentException argEx => (HttpStatusCode.BadRequest, argEx.Message),
            KeyNotFoundException => (HttpStatusCode.NotFound, "El recurso solicitado no fue encontrado."),
            UnauthorizedAccessException => (HttpStatusCode.Unauthorized, "No tiene permisos para realizar esta acción."),
            InvalidOperationException invEx => (HttpStatusCode.Conflict, invEx.Message),
            _ => (HttpStatusCode.InternalServerError, "Ocurrió un error interno en el servidor.")
        };

        _logger.LogError(exception,
            "Error no controlado: {StatusCode} - {Message} | TraceId: {TraceId} | Path: {Path}",
            (int)statusCode, exception.Message, traceId, context.Request.Path);

        context.Response.ContentType = "application/json";
        context.Response.StatusCode = (int)statusCode;

        var errorResponse = new
        {
            status = (int)statusCode,
            message,
            traceId
        };

        var json = JsonSerializer.Serialize(errorResponse, JsonOptions);
        await context.Response.WriteAsync(json);
    }
}
