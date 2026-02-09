using Microsoft.Data.SqlClient;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Factory para crear conexiones a instancias SQL Server
/// </summary>
public interface ISqlConnectionFactory
{
    /// <summary>
    /// Crea una conexión a una instancia SQL Server
    /// </summary>
    Task<SqlConnection> CreateConnectionAsync(string instanceName, int timeoutSeconds = 15, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null);
    
    /// <summary>
    /// Prueba la conectividad a una instancia
    /// </summary>
    Task<bool> TestConnectionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null);
    
    /// <summary>
    /// Obtiene la versión major de SQL Server de una instancia
    /// </summary>
    Task<int> GetSqlMajorVersionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null);
}

/// <summary>
/// Información de una instancia SQL Server
/// </summary>
public class SqlInstanceInfo
{
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public int SqlMajorVersion { get; set; }
    public string? SqlVersionString { get; set; }
    public bool IsAlwaysOnEnabled { get; set; }
    public bool IsDMZ { get; set; }
    public bool IsAWS { get; set; }
}

