using Microsoft.Data.SqlClient;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Implementación del factory de conexiones SQL.
/// Usa SystemCredentialService para resolver credenciales (Vault DBA).
/// Fallback a Windows Authentication si no hay credencial asignada.
/// 
/// NOTA: Usa IServiceScopeFactory para crear un scope nuevo por cada resolución
/// de credenciales, evitando problemas de concurrencia con DbContext cuando
/// los collectors procesan instancias en paralelo (Parallel.ForEachAsync).
/// </summary>
public class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly ILogger<SqlConnectionFactory> _logger;
    private readonly IConfiguration _configuration;
    private readonly IServiceScopeFactory _scopeFactory;

    public SqlConnectionFactory(
        ILogger<SqlConnectionFactory> logger, 
        IConfiguration configuration,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _configuration = configuration;
        _scopeFactory = scopeFactory;
    }

    public async Task<SqlConnection> CreateConnectionAsync(string instanceName, int timeoutSeconds = 15, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null)
    {
        var connectionString = await BuildConnectionStringAsync(instanceName, timeoutSeconds, hostingSite, ambiente);
        var connection = new SqlConnection(connectionString);
        
        try
        {
            await connection.OpenAsync(ct);
            return connection;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to connect to {InstanceName} (HostingSite: {HostingSite})", instanceName, hostingSite);
            await connection.DisposeAsync();
            throw;
        }
    }

    public async Task<bool> TestConnectionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null)
    {
        try
        {
            await using var connection = await CreateConnectionAsync(instanceName, timeoutSeconds, ct, hostingSite, ambiente);
            return connection.State == System.Data.ConnectionState.Open;
        }
        catch
        {
            return false;
        }
    }

    public async Task<int> GetSqlMajorVersionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default, string? hostingSite = null, string? ambiente = null)
    {
        try
        {
            await using var connection = await CreateConnectionAsync(instanceName, timeoutSeconds, ct, hostingSite, ambiente);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS INT)";
            command.CommandTimeout = timeoutSeconds;

            var result = await command.ExecuteScalarAsync(ct);
            
            if (result != null && result != DBNull.Value)
            {
                return Convert.ToInt32(result);
            }

            // Fallback: parse from full version string
            command.CommandText = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50))";
            var versionString = await command.ExecuteScalarAsync(ct) as string;
            
            if (!string.IsNullOrEmpty(versionString))
            {
                var parts = versionString.Split('.');
                if (parts.Length > 0 && int.TryParse(parts[0], out var majorVersion))
                {
                    return majorVersion;
                }
            }

            return 11; // Default to SQL 2012 if unknown
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to get SQL version for {InstanceName}, defaulting to 11", instanceName);
            return 11;
        }
    }

    /// <summary>
    /// Construye el connection string usando SystemCredentialService en un scope aislado.
    /// Cada llamada crea su propio scope con su propio DbContext, haciéndolo thread-safe
    /// para uso en paralelo desde los collectors.
    /// Resuelve credenciales por prioridad: Server -> HostingSite -> Environment -> Pattern.
    /// Fallback a Windows Authentication si no hay credencial asignada.
    /// </summary>
    private async Task<string> BuildConnectionStringAsync(string instanceName, int timeoutSeconds, string? hostingSite = null, string? ambiente = null)
    {
        try
        {
            using var scope = _scopeFactory.CreateScope();
            var credentialService = scope.ServiceProvider.GetRequiredService<ISystemCredentialService>();
            
            return await credentialService.BuildConnectionStringAsync(
                instanceName,
                hostingSite,
                ambiente,
                "master",
                timeoutSeconds,
                "SQLGuardObservatory.Collectors");
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error resolving credentials for {InstanceName}, falling back to Windows Auth", instanceName);
            return BuildWindowsAuthConnectionString(instanceName, timeoutSeconds);
        }
    }

    /// <summary>
    /// Fallback: Windows Authentication connection string
    /// </summary>
    private static string BuildWindowsAuthConnectionString(string instanceName, int timeoutSeconds)
    {
        var builder = new SqlConnectionStringBuilder
        {
            DataSource = instanceName,
            IntegratedSecurity = true,
            TrustServerCertificate = true,
            ConnectTimeout = timeoutSeconds,
            ApplicationName = "SQLGuardObservatory.Collectors",
            MultipleActiveResultSets = true,
            Pooling = true,
            MaxPoolSize = 50,
            MinPoolSize = 1
        };

        return builder.ConnectionString;
    }
}
