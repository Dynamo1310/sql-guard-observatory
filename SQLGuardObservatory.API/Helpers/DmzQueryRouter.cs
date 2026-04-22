using SQLGuardObservatory.API.Services.Collectors;

namespace SQLGuardObservatory.API.Helpers;

/// <summary>
/// Centraliza el ruteo de queries hacia instancias DMZ vía linked server sobre
/// el jump server (config `DMZ:JumpServer`).
///
/// Convención: el nombre del linked server en el jump coincide exactamente con
/// el nombre de la instancia DMZ (ej. SSPRDMZ14-01 → [SSPRDMZ14-01]).
///
/// Uso desde un collector:
///
///     var (target, effectiveQuery) = DmzQueryRouter.Route(_configuration, instance, query);
///     var table = await ExecuteQueryAsync(target, effectiveQuery, timeoutSeconds, ct);
///
/// Si `instance.IsDMZ == false`, retorna la instancia y query originales intactas.
/// </summary>
public static class DmzQueryRouter
{
    public static (string target, string query) Route(
        IConfiguration configuration,
        SqlInstanceInfo instance,
        string originalQuery)
    {
        if (!instance.IsDMZ)
            return (instance.InstanceName, originalQuery);

        var jump = configuration["DMZ:JumpServer"];
        if (string.IsNullOrWhiteSpace(jump))
            throw new InvalidOperationException(
                "DMZ:JumpServer no está configurado en appsettings — no se pueden relevar instancias DMZ.");

        return (jump, WrapForLinkedServer(instance.InstanceName, originalQuery));
    }

    /// <summary>
    /// Envuelve una query para ejecutarla vía RPC sobre un linked server.
    /// Duplica las comillas simples del cuerpo para que queden válidas dentro del literal.
    /// </summary>
    public static string WrapForLinkedServer(string linkedServer, string innerQuery)
    {
        var escaped = innerQuery.Replace("'", "''");
        return $"EXEC (N'{escaped}') AT [{linkedServer}]";
    }
}
