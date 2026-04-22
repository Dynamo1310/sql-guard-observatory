namespace SQLGuardObservatory.API.Helpers;

/// <summary>
/// Resuelve el datacenter (Mitre / Martínez) de un Availability Group
/// mirando los dos nodos del par, no un sufijo absoluto.
///
/// Regla (confirmada sobre el inventario real de AGs):
///   - Cada AG tiene dos nodos con sufijo numérico post-último-guion: p.ej. SSPR19USR-01 / SSPR19USR-51.
///   - Dentro del par, el nodo con sufijo numérico MENOR está en Mitre (principal),
///     el de sufijo MAYOR está en Martínez (contingencia).
///   - Ejemplos: 01/02 → 01=Mitre, 02=Martínez | 02/52 → 02=Mitre, 52=Martínez |
///               01/51 → 01=Mitre, 51=Martínez.
///
/// El hostname se aísla descartando la instancia nombrada (lo que va después de `\`),
/// porque lo que define el datacenter es el servidor físico, no la instancia SQL.
/// </summary>
public static class DatacenterResolver
{
    /// <summary>
    /// Resuelve el datacenter correspondiente a la réplica primaria. Necesita la lista de
    /// réplicas del par para poder comparar sufijos — sin ella no se puede distinguir
    /// un "-02" que es Mitre de un "-02" que es Martínez.
    /// </summary>
    public static string? Resolve(string? agName, string? primaryReplica, IEnumerable<string?>? allReplicas)
    {
        var primarySuffix = ExtractNumericSuffix(primaryReplica);
        if (primarySuffix == null) return null;

        if (allReplicas == null) return null;

        var suffixes = allReplicas
            .Select(ExtractNumericSuffix)
            .Where(s => s.HasValue)
            .Select(s => s!.Value)
            .Distinct()
            .OrderBy(s => s)
            .ToList();

        if (suffixes.Count < 2) return null;

        var minSuffix = suffixes[0];
        return primarySuffix.Value == minSuffix ? "Mitre" : "Martínez";
    }

    /// <summary>
    /// Extrae el sufijo numérico post-último-guion del hostname.
    /// "SSPR19USR-51\INSTANCIA01"         → 51
    /// "SSPR19USR-51,1433"                → 51
    /// "SSPR14ODM-02.supervielle.com.ar"  → 2
    /// "SSPR14ODM-02"                     → 2
    /// "SSPR17"                           → null (sin guion terminal)
    /// </summary>
    private static int? ExtractNumericSuffix(string? replica)
    {
        if (string.IsNullOrWhiteSpace(replica)) return null;
        var host = replica.Trim();
        var backslashIdx = host.IndexOf('\\');
        if (backslashIdx >= 0) host = host[..backslashIdx];
        var commaIdx = host.IndexOf(',');
        if (commaIdx >= 0) host = host[..commaIdx];
        var dotIdx = host.IndexOf('.');
        if (dotIdx >= 0) host = host[..dotIdx];
        var dashIdx = host.LastIndexOf('-');
        if (dashIdx < 0 || dashIdx == host.Length - 1) return null;
        var suffix = host[(dashIdx + 1)..];
        return int.TryParse(suffix, out var n) ? n : null;
    }
}
