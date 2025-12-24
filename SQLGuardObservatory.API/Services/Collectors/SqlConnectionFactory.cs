using Microsoft.Data.SqlClient;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Implementación del factory de conexiones SQL usando Windows Authentication
/// </summary>
public class SqlConnectionFactory : ISqlConnectionFactory
{
    private readonly ILogger<SqlConnectionFactory> _logger;
    private readonly IConfiguration _configuration;

    public SqlConnectionFactory(ILogger<SqlConnectionFactory> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }

    public async Task<SqlConnection> CreateConnectionAsync(string instanceName, int timeoutSeconds = 15, CancellationToken ct = default)
    {
        var connectionString = BuildConnectionString(instanceName, timeoutSeconds);
        var connection = new SqlConnection(connectionString);
        
        try
        {
            await connection.OpenAsync(ct);
            return connection;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to connect to {InstanceName}", instanceName);
            await connection.DisposeAsync();
            throw;
        }
    }

    public async Task<bool> TestConnectionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default)
    {
        try
        {
            await using var connection = await CreateConnectionAsync(instanceName, timeoutSeconds, ct);
            return connection.State == System.Data.ConnectionState.Open;
        }
        catch
        {
            return false;
        }
    }

    public async Task<int> GetSqlMajorVersionAsync(string instanceName, int timeoutSeconds = 10, CancellationToken ct = default)
    {
        try
        {
            await using var connection = await CreateConnectionAsync(instanceName, timeoutSeconds, ct);
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

    private string BuildConnectionString(string instanceName, int timeoutSeconds)
    {
        var builder = new SqlConnectionStringBuilder
        {
            DataSource = instanceName,
            IntegratedSecurity = true, // Windows Authentication
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

