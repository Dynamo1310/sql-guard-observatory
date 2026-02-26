using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services.Collectors;
using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace SQLGuardObservatory.API.Services;

public interface IMigrationSimulatorService
{
    Task<List<ComparisonInstanceDto>> GetAvailableInstancesAsync(CancellationToken ct = default);
    Task<MigrationSourceResponse> GetSourceDatabasesAsync(List<string> instanceNames, CancellationToken ct = default);
    Task<NamingSuggestionResponse> GetNamingSuggestionAsync(string targetVersion, string environment, CancellationToken ct = default);
}

public class MigrationSimulatorService : IMigrationSimulatorService
{
    private readonly ILogger<MigrationSimulatorService> _logger;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IServiceScopeFactory _scopeFactory;

    private static readonly HashSet<string> SystemDatabases = new(StringComparer.OrdinalIgnoreCase)
    {
        "master", "model", "msdb", "tempdb", "ReportServer", "ReportServerTempDB", "SSISDB", "distribution"
    };

    public MigrationSimulatorService(
        ILogger<MigrationSimulatorService> logger,
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

        return await context.SqlServerInstancesCache
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
    }

    public async Task<MigrationSourceResponse> GetSourceDatabasesAsync(List<string> instanceNames, CancellationToken ct = default)
    {
        _logger.LogInformation("Recolectando databases de {Count} servidores origen: {Servers}",
            instanceNames.Count, string.Join(", ", instanceNames));

        var serverResults = new ConcurrentBag<MigrationServerDto>();

        await Parallel.ForEachAsync(instanceNames,
            new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
            async (instanceName, token) =>
            {
                var result = await CollectDatabasesFromInstanceAsync(instanceName, token);
                serverResults.Add(result);
            });

        return new MigrationSourceResponse
        {
            Servers = serverResults.OrderBy(s => s.InstanceName).ToList(),
            GeneratedAt = DateTime.UtcNow
        };
    }

    public async Task<NamingSuggestionResponse> GetNamingSuggestionAsync(
        string targetVersion, string environment, CancellationToken ct = default)
    {
        var baseName = $"SS{environment.ToUpperInvariant()}{targetVersion}";
        var pattern = $"{baseName}-";

        _logger.LogInformation("Buscando instancias existentes con patrón {Pattern}", pattern);

        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var allInstances = await context.SqlServerInstancesCache
            .Select(i => i.NombreInstancia)
            .ToListAsync(ct);

        var matching = allInstances
            .Where(name => name.StartsWith(pattern, StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n)
            .ToList();

        var maxNumber = 0;
        var regex = new Regex($@"^{Regex.Escape(baseName)}-(\d+)", RegexOptions.IgnoreCase);
        foreach (var name in matching)
        {
            var match = regex.Match(name);
            if (match.Success && int.TryParse(match.Groups[1].Value, out var num))
            {
                if (num > maxNumber) maxNumber = num;
            }
        }

        var existingInfo = new ConcurrentBag<ExistingInstanceInfo>();

        if (matching.Count > 0)
        {
            _logger.LogInformation("Consultando uso actual de {Count} instancias existentes: {Names}",
                matching.Count, string.Join(", ", matching));

            await Parallel.ForEachAsync(matching,
                new ParallelOptions { MaxDegreeOfParallelism = 4, CancellationToken = ct },
                async (existingName, token) =>
                {
                    var info = new ExistingInstanceInfo { Name = existingName };
                    try
                    {
                        var serverData = await CollectDatabasesFromInstanceAsync(existingName, token);
                        info.ConnectionSuccess = serverData.ConnectionSuccess;
                        info.ErrorMessage = serverData.ErrorMessage;
                        if (serverData.ConnectionSuccess)
                        {
                            info.CurrentDataSizeMB = serverData.TotalDataSizeMB;
                            info.CurrentLogSizeMB = serverData.TotalLogSizeMB;
                            info.CurrentDatabaseCount = serverData.Databases.Count;
                            info.CurrentDatabaseNames = serverData.Databases.Select(d => d.Name).ToList();

                            try
                            {
                                await using var diskConn = await _connectionFactory.CreateConnectionAsync(existingName, 15, token);
                                using var diskCmd = diskConn.CreateCommand();
                                diskCmd.CommandText = @"
                                    SELECT COUNT(DISTINCT UPPER(SUBSTRING(physical_name, 1, 1))) AS DataDiskCount,
                                           MAX(UPPER(SUBSTRING(physical_name, 1, 1))) AS LastDiskLetter
                                    FROM sys.master_files
                                    WHERE database_id > 4 AND type = 0
                                      AND UPPER(SUBSTRING(physical_name, 1, 1)) >= 'I'";
                                diskCmd.CommandTimeout = 15;
                                using var diskReader = await diskCmd.ExecuteReaderAsync(token);
                                if (await diskReader.ReadAsync(token))
                                {
                                    info.CurrentDataDiskCount = diskReader.IsDBNull(0) ? 0 : Convert.ToInt32(diskReader.GetValue(0));
                                    info.LastDataDiskLetter = diskReader.IsDBNull(1) ? null : diskReader.GetString(1);
                                }
                            }
                            catch (Exception diskEx)
                            {
                                _logger.LogWarning(diskEx, "No se pudo consultar discos físicos de {Name}", existingName);
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error al consultar instancia existente {Name}", existingName);
                        info.ConnectionSuccess = false;
                        info.ErrorMessage = ex.Message;
                    }
                    existingInfo.Add(info);
                });
        }

        return new NamingSuggestionResponse
        {
            BaseName = baseName,
            NextAvailableNumber = maxNumber + 1,
            Environment = environment.ToUpperInvariant(),
            TargetVersion = targetVersion,
            ExistingInstances = matching,
            ExistingInstancesInfo = existingInfo.OrderBy(i => i.Name).ToList()
        };
    }

    private async Task<MigrationServerDto> CollectDatabasesFromInstanceAsync(string instanceName, CancellationToken ct)
    {
        var result = new MigrationServerDto { InstanceName = instanceName };

        try
        {
            await using var connection = await _connectionFactory.CreateConnectionAsync(instanceName, 15, ct);
            result.ConnectionSuccess = true;

            using var versionCmd = connection.CreateCommand();
            versionCmd.CommandText = "SELECT @@VERSION";
            versionCmd.CommandTimeout = 10;
            var versionObj = await versionCmd.ExecuteScalarAsync(ct);
            result.SqlVersion = versionObj?.ToString()?.Split('\n').FirstOrDefault()?.Trim();

            const string query = @"
                SELECT 
                    d.name,
                    d.state_desc,
                    d.recovery_model_desc,
                    d.compatibility_level,
                    d.collation_name,
                    CAST(ISNULL(SUM(CASE WHEN mf.type = 0 THEN mf.size * 8.0 / 1024 END), 0) AS DECIMAL(18,2)) AS DataSizeMB,
                    CAST(ISNULL(SUM(CASE WHEN mf.type = 1 THEN mf.size * 8.0 / 1024 END), 0) AS DECIMAL(18,2)) AS LogSizeMB,
                    COUNT(CASE WHEN mf.type = 0 THEN 1 END) AS DataFileCount,
                    COUNT(CASE WHEN mf.type = 1 THEN 1 END) AS LogFileCount
                FROM sys.databases d
                LEFT JOIN sys.master_files mf ON d.database_id = mf.database_id
                WHERE d.database_id > 4
                GROUP BY d.name, d.state_desc, d.recovery_model_desc, d.compatibility_level, d.collation_name
                ORDER BY d.name";

            using var cmd = connection.CreateCommand();
            cmd.CommandText = query;
            cmd.CommandTimeout = 30;

            using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var name = reader.GetString(0);
                if (SystemDatabases.Contains(name)) continue;

                var dataSizeMB = reader.IsDBNull(5) ? 0 : Convert.ToDecimal(reader.GetValue(5));
                var logSizeMB = reader.IsDBNull(6) ? 0 : Convert.ToDecimal(reader.GetValue(6));

                result.Databases.Add(new MigrationDatabaseDto
                {
                    Name = name,
                    State = reader.IsDBNull(1) ? null : reader.GetString(1),
                    RecoveryModel = reader.IsDBNull(2) ? null : reader.GetString(2),
                    CompatibilityLevel = reader.IsDBNull(3) ? null : Convert.ToInt32(reader.GetValue(3)).ToString(),
                    Collation = reader.IsDBNull(4) ? null : reader.GetString(4),
                    DataSizeMB = dataSizeMB,
                    LogSizeMB = logSizeMB,
                    TotalSizeMB = dataSizeMB + logSizeMB,
                    DataFileCount = reader.IsDBNull(7) ? 0 : Convert.ToInt32(reader.GetValue(7)),
                    LogFileCount = reader.IsDBNull(8) ? 0 : Convert.ToInt32(reader.GetValue(8))
                });
            }

            result.TotalDataSizeMB = result.Databases.Sum(d => d.DataSizeMB);
            result.TotalLogSizeMB = result.Databases.Sum(d => d.LogSizeMB);
            result.TotalSizeMB = result.Databases.Sum(d => d.TotalSizeMB);

            _logger.LogInformation(
                "Servidor {Instance}: {DbCount} DBs, {DataMB:N0} MB data, {LogMB:N0} MB log",
                instanceName, result.Databases.Count, result.TotalDataSizeMB, result.TotalLogSizeMB);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al conectar con {Instance}", instanceName);
            result.ConnectionSuccess = false;
            result.ErrorMessage = ex.Message;
        }

        return result;
    }
}
