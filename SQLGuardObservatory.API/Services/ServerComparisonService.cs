using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services.Collectors;
using System.Collections.Concurrent;

namespace SQLGuardObservatory.API.Services;

public interface IServerComparisonService
{
    Task<ServerComparisonResponse> CompareServersAsync(List<string> instanceNames, CancellationToken ct = default);
    Task<List<ComparisonInstanceDto>> GetAvailableInstancesAsync(CancellationToken ct = default);
}

public class ServerComparisonService : IServerComparisonService
{
    private readonly ILogger<ServerComparisonService> _logger;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IServiceScopeFactory _scopeFactory;

    private static readonly HashSet<string> SystemDatabases = new(StringComparer.OrdinalIgnoreCase)
    {
        "master", "model", "msdb", "tempdb", "ReportServer", "ReportServerTempDB", "SSISDB", "distribution"
    };

    private static readonly HashSet<string> SystemLogins = new(StringComparer.OrdinalIgnoreCase)
    {
        "sa", "##MS_PolicyEventProcessingLogin##", "##MS_PolicyTsqlExecutionLogin##",
        "##MS_AgentSigningCertificate##", "##MS_SQLResourceSigningCertificate##",
        "##MS_SQLReplicationSigningCertificate##", "##MS_SQLAuthenticatorCertificate##"
    };

    public ServerComparisonService(
        ILogger<ServerComparisonService> logger,
        ISqlConnectionFactory connectionFactory,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _connectionFactory = connectionFactory;
        _scopeFactory = scopeFactory;
    }

    public async Task<List<ComparisonInstanceDto>> GetAvailableInstancesAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var instances = await context.SqlServerInstancesCache
            .OrderBy(i => i.Ambiente)
            .ThenBy(i => i.ServerName)
            .Select(i => new ComparisonInstanceDto
            {
                Id = i.Id,
                ServerName = i.ServerName,
                NombreInstancia = i.NombreInstancia,
                Ambiente = i.Ambiente,
                HostingSite = i.HostingSite,
                MajorVersion = i.MajorVersion,
                Edition = i.Edition
            })
            .ToListAsync(ct);

        return instances;
    }

    public async Task<ServerComparisonResponse> CompareServersAsync(List<string> instanceNames, CancellationToken ct = default)
    {
        _logger.LogInformation("Iniciando comparación de {Count} servidores: {Servers}",
            instanceNames.Count, string.Join(", ", instanceNames));

        var serverResults = new ConcurrentBag<ServerObjectsDto>();

        await Parallel.ForEachAsync(instanceNames,
            new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
            async (instanceName, token) =>
            {
                var result = await CollectServerObjectsAsync(instanceName, token);
                serverResults.Add(result);
            });

        var servers = serverResults.OrderBy(s => s.InstanceName).ToList();
        var duplicates = DetectDuplicates(servers);
        var summary = BuildSummary(servers, duplicates);

        return new ServerComparisonResponse
        {
            Servers = servers,
            Summary = summary,
            Duplicates = duplicates,
            GeneratedAt = DateTime.UtcNow
        };
    }

    private async Task<ServerObjectsDto> CollectServerObjectsAsync(string instanceName, CancellationToken ct)
    {
        var result = new ServerObjectsDto { InstanceName = instanceName };

        try
        {
            await using var connection = await _connectionFactory.CreateConnectionAsync(instanceName, 15, ct);
            result.ConnectionSuccess = true;

            using var versionCmd = connection.CreateCommand();
            versionCmd.CommandText = "SELECT @@VERSION";
            versionCmd.CommandTimeout = 10;
            var versionObj = await versionCmd.ExecuteScalarAsync(ct);
            result.SqlVersion = versionObj?.ToString()?.Split('\n').FirstOrDefault()?.Trim();

            await CollectDatabasesAsync(connection, result, ct);
            await CollectLoginsAsync(connection, result, ct);
            await CollectLinkedServersAsync(connection, result, ct);
            await CollectJobsAsync(connection, result, ct);

            _logger.LogInformation(
                "Servidor {Instance}: {Dbs} DBs, {Logins} logins, {LS} linked servers, {Jobs} jobs",
                instanceName, result.Databases.Count, result.Logins.Count,
                result.LinkedServers.Count, result.Jobs.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al conectar con {Instance}", instanceName);
            result.ConnectionSuccess = false;
            result.ErrorMessage = ex.Message;
        }

        return result;
    }

    private async Task CollectDatabasesAsync(SqlConnection connection, ServerObjectsDto result, CancellationToken ct)
    {
        const string query = @"
            SELECT 
                d.name,
                d.state_desc,
                d.recovery_model_desc,
                d.compatibility_level,
                d.collation_name,
                CAST(ISNULL((SELECT SUM(size * 8.0 / 1024) FROM sys.master_files WHERE database_id = d.database_id), 0) AS DECIMAL(18,2)),
                d.create_date
            FROM sys.databases d
            WHERE d.database_id > 4
            ORDER BY d.name";

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = query;
            cmd.CommandTimeout = 30;

            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var name = reader.GetString(0);
                if (SystemDatabases.Contains(name)) continue;

                result.Databases.Add(new CompDatabaseInfoDto
                {
                    Name = name,
                    State = reader.IsDBNull(1) ? null : reader.GetString(1),
                    RecoveryModel = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CompatibilityLevel = reader.IsDBNull(3) ? null : Convert.ToInt32(reader.GetValue(3)).ToString(),
                    Collation = reader.IsDBNull(4) ? null : reader.GetString(4),
                    SizeMB = reader.IsDBNull(5) ? 0 : Convert.ToDecimal(reader.GetValue(5)),
                    CreateDate = reader.IsDBNull(6) ? null : reader.GetDateTime(6)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error recolectando databases de {Instance}", result.InstanceName);
        }
    }

    private async Task CollectLoginsAsync(SqlConnection connection, ServerObjectsDto result, CancellationToken ct)
    {
        const string query = @"
            SELECT 
                sp.name,
                sp.type_desc,
                sp.is_disabled,
                sp.default_database_name,
                sp.create_date
            FROM sys.server_principals sp
            WHERE sp.type IN ('S', 'U', 'G')
              AND sp.name NOT LIKE '##%'
              AND sp.name NOT LIKE 'NT SERVICE\%'
              AND sp.name NOT LIKE 'NT AUTHORITY\%'
            ORDER BY sp.name";

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = query;
            cmd.CommandTimeout = 30;

            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var name = reader.GetString(0);
                if (SystemLogins.Contains(name)) continue;

                result.Logins.Add(new LoginInfoDto
                {
                    Name = name,
                    Type = reader.IsDBNull(1) ? null : reader.GetString(1),
                    IsDisabled = reader.GetBoolean(2),
                    DefaultDatabase = reader.IsDBNull(3) ? null : reader.GetString(3),
                    CreateDate = reader.IsDBNull(4) ? null : reader.GetDateTime(4)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error recolectando logins de {Instance}", result.InstanceName);
        }
    }

    private async Task CollectLinkedServersAsync(SqlConnection connection, ServerObjectsDto result, CancellationToken ct)
    {
        const string query = @"
            SELECT 
                s.name,
                s.provider,
                s.data_source,
                s.product
            FROM sys.servers s
            WHERE s.is_linked = 1
            ORDER BY s.name";

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = query;
            cmd.CommandTimeout = 30;

            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                result.LinkedServers.Add(new LinkedServerInfoDto
                {
                    Name = reader.GetString(0),
                    Provider = reader.IsDBNull(1) ? null : reader.GetString(1),
                    DataSource = reader.IsDBNull(2) ? null : reader.GetString(2),
                    Product = reader.IsDBNull(3) ? null : reader.GetString(3)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error recolectando linked servers de {Instance}", result.InstanceName);
        }
    }

    private async Task CollectJobsAsync(SqlConnection connection, ServerObjectsDto result, CancellationToken ct)
    {
        const string query = @"
            SELECT 
                j.name,
                j.enabled,
                j.description,
                j.date_created,
                SUSER_SNAME(j.owner_sid) AS owner_login_name
            FROM msdb.dbo.sysjobs j
            ORDER BY j.name";

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = query;
            cmd.CommandTimeout = 30;

            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                result.Jobs.Add(new AgentJobInfoDto
                {
                    Name = reader.GetString(0),
                    Enabled = Convert.ToInt32(reader.GetValue(1)) == 1,
                    Description = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CreateDate = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                    OwnerLoginName = reader.IsDBNull(4) ? null : reader.GetString(4)
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error recolectando jobs de {Instance}", result.InstanceName);
        }
    }

    private static List<DuplicateGroupDto> DetectDuplicates(List<ServerObjectsDto> servers)
    {
        var duplicates = new List<DuplicateGroupDto>();
        var connectedServers = servers.Where(s => s.ConnectionSuccess).ToList();

        AddDuplicatesForType(duplicates, connectedServers, "Database",
            s => s.Databases.Select(d => d.Name));

        AddDuplicatesForType(duplicates, connectedServers, "Login",
            s => s.Logins.Select(l => l.Name));

        AddDuplicatesForType(duplicates, connectedServers, "LinkedServer",
            s => s.LinkedServers.Select(ls => ls.Name));

        AddDuplicatesForType(duplicates, connectedServers, "Job",
            s => s.Jobs.Select(j => j.Name));

        return duplicates.OrderBy(d => d.ObjectType).ThenBy(d => d.ObjectName).ToList();
    }

    private static void AddDuplicatesForType(
        List<DuplicateGroupDto> duplicates,
        List<ServerObjectsDto> servers,
        string objectType,
        Func<ServerObjectsDto, IEnumerable<string>> nameSelector)
    {
        var nameToServers = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var server in servers)
        {
            foreach (var name in nameSelector(server))
            {
                if (!nameToServers.ContainsKey(name))
                    nameToServers[name] = new List<string>();
                nameToServers[name].Add(server.InstanceName);
            }
        }

        foreach (var kvp in nameToServers.Where(kv => kv.Value.Count > 1))
        {
            duplicates.Add(new DuplicateGroupDto
            {
                ObjectName = kvp.Key,
                ObjectType = objectType,
                FoundInServers = kvp.Value,
                Count = kvp.Value.Count
            });
        }
    }

    private static ComparisonSummaryDto BuildSummary(List<ServerObjectsDto> servers, List<DuplicateGroupDto> duplicates)
    {
        return new ComparisonSummaryDto
        {
            TotalServers = servers.Count,
            ServersConnected = servers.Count(s => s.ConnectionSuccess),
            ServersFailed = servers.Count(s => !s.ConnectionSuccess),
            TotalDatabases = servers.Where(s => s.ConnectionSuccess).Sum(s => s.Databases.Count),
            DuplicateDatabases = duplicates.Count(d => d.ObjectType == "Database"),
            TotalLogins = servers.Where(s => s.ConnectionSuccess).Sum(s => s.Logins.Count),
            DuplicateLogins = duplicates.Count(d => d.ObjectType == "Login"),
            TotalLinkedServers = servers.Where(s => s.ConnectionSuccess).Sum(s => s.LinkedServers.Count),
            DuplicateLinkedServers = duplicates.Count(d => d.ObjectType == "LinkedServer"),
            TotalJobs = servers.Where(s => s.ConnectionSuccess).Sum(s => s.Jobs.Count),
            DuplicateJobs = duplicates.Count(d => d.ObjectType == "Job")
        };
    }
}
