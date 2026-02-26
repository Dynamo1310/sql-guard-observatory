using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services.Collectors;

namespace SQLGuardObservatory.API.Services;

public interface ITempDbAnalyzerService
{
    Task<TempDbAnalysisResponse> GetCachedResultsAsync(CancellationToken ct = default);
    Task<TempDbAnalysisResponse> AnalyzeAllInstancesAsync(CancellationToken ct = default);
    Task<TempDbCheckResultDto> AnalyzeInstanceAsync(string instanceName, CancellationToken ct = default);
}

public class TempDbAnalyzerService : ITempDbAnalyzerService
{
    private readonly ILogger<TempDbAnalyzerService> _logger;
    private readonly ISqlConnectionFactory _connectionFactory;
    private readonly IServiceScopeFactory _scopeFactory;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public TempDbAnalyzerService(
        ILogger<TempDbAnalyzerService> logger,
        ISqlConnectionFactory connectionFactory,
        IServiceScopeFactory scopeFactory)
    {
        _logger = logger;
        _connectionFactory = connectionFactory;
        _scopeFactory = scopeFactory;
    }

    public async Task<TempDbAnalysisResponse> GetCachedResultsAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var cached = await context.TempDbAnalysisCache
            .OrderBy(c => c.InstanceName)
            .ToListAsync(ct);

        return BuildResponse(cached);
    }

    public async Task<TempDbAnalysisResponse> AnalyzeAllInstancesAsync(CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var instances = await context.SqlServerInstancesCache
            .Where(i => !i.NombreInstancia.Contains("DMZ"))
            .OrderBy(i => i.NombreInstancia)
            .ToListAsync(ct);

        _logger.LogInformation("Iniciando análisis TempDB en {Count} instancias", instances.Count);

        var results = new ConcurrentBag<TempDbAnalysisCache>();

        await Parallel.ForEachAsync(instances,
            new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
            async (instance, token) =>
            {
                var result = await RunAnalysisOnInstanceAsync(
                    instance.NombreInstancia, instance.Ambiente, instance.HostingSite, instance.MajorVersion, token);
                results.Add(result);
            });

        // Reemplazar toda la caché
        var existingCache = await context.TempDbAnalysisCache.ToListAsync(ct);
        context.TempDbAnalysisCache.RemoveRange(existingCache);
        context.TempDbAnalysisCache.AddRange(results);
        await context.SaveChangesAsync(ct);

        _logger.LogInformation("Análisis TempDB completado. {Success}/{Total} instancias exitosas",
            results.Count(r => r.ConnectionSuccess), results.Count);

        return BuildResponse(results.OrderBy(r => r.InstanceName).ToList());
    }

    public async Task<TempDbCheckResultDto> AnalyzeInstanceAsync(string instanceName, CancellationToken ct = default)
    {
        using var scope = _scopeFactory.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        var instance = await context.SqlServerInstancesCache
            .FirstOrDefaultAsync(i => i.NombreInstancia == instanceName, ct);

        var result = await RunAnalysisOnInstanceAsync(
            instanceName,
            instance?.Ambiente,
            instance?.HostingSite,
            instance?.MajorVersion,
            ct);

        var existing = await context.TempDbAnalysisCache
            .FirstOrDefaultAsync(c => c.InstanceName == instanceName, ct);

        if (existing != null)
        {
            existing.Ambiente = result.Ambiente;
            existing.HostingSite = result.HostingSite;
            existing.MajorVersion = result.MajorVersion;
            existing.ConnectionSuccess = result.ConnectionSuccess;
            existing.ErrorMessage = result.ErrorMessage;
            existing.ResultsJson = result.ResultsJson;
            existing.OverallScore = result.OverallScore;
            existing.AnalyzedAt = result.AnalyzedAt;
        }
        else
        {
            context.TempDbAnalysisCache.Add(result);
        }

        await context.SaveChangesAsync(ct);

        return MapToDto(result);
    }

    private async Task<TempDbAnalysisCache> RunAnalysisOnInstanceAsync(
        string instanceName, string? ambiente, string? hostingSite, string? majorVersion, CancellationToken ct)
    {
        var cacheEntry = new TempDbAnalysisCache
        {
            InstanceName = instanceName,
            Ambiente = ambiente,
            HostingSite = hostingSite,
            MajorVersion = majorVersion,
            AnalyzedAt = DateTime.UtcNow
        };

        try
        {
            await using var connection = await _connectionFactory.CreateConnectionAsync(instanceName, 30, ct);
            cacheEntry.ConnectionSuccess = true;

            var recommendations = new List<TempDbRecommendationDto>();

            int cpuCount = 0, tempDataFiles = 0, sqlVersion = 0;

            // Obtener variables de entorno
            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = "SELECT cpu_count FROM sys.dm_os_sys_info";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                cpuCount = result != null && result != DBNull.Value ? Convert.ToInt32(result) : 0;
            }

            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = "SELECT COUNT(*) FROM tempdb.sys.database_files WHERE type = 0";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                tempDataFiles = result != null && result != DBNull.Value ? Convert.ToInt32(result) : 0;
            }

            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = "SELECT CAST(SERVERPROPERTY('ProductMajorVersion') AS INT)";
                cmd.CommandTimeout = 15;
                try
                {
                    var result = await cmd.ExecuteScalarAsync(ct);
                    sqlVersion = result != null && result != DBNull.Value ? Convert.ToInt32(result) : 0;
                }
                catch
                {
                    sqlVersion = 11;
                }
            }

            // 1. Cantidad de archivos de datos
            recommendations.Add(CheckDataFileCount(cpuCount, tempDataFiles));

            // 2. Crecimiento Uniforme
            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"SELECT CASE WHEN COUNT(DISTINCT growth) > 1 THEN 0 ELSE 1 END
                                    FROM tempdb.sys.database_files WHERE type = 0";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                bool uniform = result != null && Convert.ToInt32(result) == 1;
                recommendations.Add(CheckUniformGrowth(uniform));
            }

            // 3. Tamaño Inicial Uniforme
            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"SELECT CASE WHEN COUNT(DISTINCT size) > 1 THEN 0 ELSE 1 END
                                    FROM tempdb.sys.database_files WHERE type = 0";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                bool uniform = result != null && Convert.ToInt32(result) == 1;
                recommendations.Add(CheckUniformSize(uniform));
            }

            // 4. Crecimiento en MB (No %)
            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"SELECT CASE WHEN EXISTS(SELECT 1 FROM tempdb.sys.database_files WHERE is_percent_growth = 1) THEN 0 ELSE 1 END";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                bool fixedGrowth = result != null && Convert.ToInt32(result) == 1;
                recommendations.Add(CheckGrowthType(fixedGrowth));
            }

            // 5. Trace Flags 1117/1118
            recommendations.Add(await CheckTraceFlagsAsync(connection, sqlVersion, ct));

            // 6. Instant File Initialization
            recommendations.Add(await CheckIFIAsync(connection, sqlVersion, ct));

            // 7. Aislamiento de Disco
            recommendations.Add(await CheckDiskIsolationAsync(connection, ct));

            // 8. Metadata en Memoria (SQL 2019+)
            recommendations.Add(await CheckMemoryOptimizedMetadataAsync(connection, sqlVersion, ct));

            // 9. Log de TempDB
            using (var cmd = connection.CreateCommand())
            {
                cmd.CommandText = @"SELECT CASE WHEN EXISTS(
                    SELECT 1 FROM tempdb.sys.database_files WHERE type = 1 AND (is_percent_growth = 1 OR growth < 12800)
                ) THEN 0 ELSE 1 END";
                cmd.CommandTimeout = 15;
                var result = await cmd.ExecuteScalarAsync(ct);
                bool logOk = result != null && Convert.ToInt32(result) == 1;
                recommendations.Add(CheckTempDbLog(logOk));
            }

            cacheEntry.ResultsJson = JsonSerializer.Serialize(recommendations, JsonOptions);
            cacheEntry.OverallScore = CalculateOverallScore(recommendations);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al analizar TempDB en {Instance}", instanceName);
            cacheEntry.ConnectionSuccess = false;
            cacheEntry.ErrorMessage = ex.Message;
            cacheEntry.ResultsJson = "[]";
            cacheEntry.OverallScore = 0;
        }

        return cacheEntry;
    }

    #region Checks

    private static TempDbRecommendationDto CheckDataFileCount(int cpuCount, int tempDataFiles)
    {
        int recommended = cpuCount <= 8 ? cpuCount : 8;
        bool complies = tempDataFiles >= recommended;

        var rec = new TempDbRecommendationDto
        {
            Name = "Cantidad de Archivos de Datos",
            Status = complies ? "CUMPLE" : "REVISAR",
            Details = $"CPUs: {cpuCount}. Archivos: {tempDataFiles}. Mínimo recomendado: {recommended}"
        };

        if (!complies)
        {
            int filesToAdd = recommended - tempDataFiles;
            rec.Suggestion = $"Agregar {filesToAdd} archivo(s) de datos a TempDB para alcanzar la cantidad recomendada de {recommended} (1 por CPU hasta 8).";
            rec.SqlScript = GenerateAddFilesScript(tempDataFiles, filesToAdd);
        }

        return rec;
    }

    private static string GenerateAddFilesScript(int currentFiles, int filesToAdd)
    {
        var lines = new List<string>();
        lines.Add("-- Agregar archivos de datos a TempDB");
        lines.Add("-- Ajustar la ruta y tamaño según el entorno");
        for (int i = 0; i < filesToAdd; i++)
        {
            int fileNum = currentFiles + i + 1;
            lines.Add($@"ALTER DATABASE tempdb ADD FILE (
    NAME = N'tempdev{fileNum}',
    FILENAME = N'T:\TempDB\tempdev{fileNum}.ndf',
    SIZE = 1024MB,
    FILEGROWTH = 256MB
);");
        }
        return string.Join("\n", lines);
    }

    private static TempDbRecommendationDto CheckUniformGrowth(bool isUniform)
    {
        var rec = new TempDbRecommendationDto
        {
            Name = "Crecimiento Uniforme",
            Status = isUniform ? "CUMPLE" : "NO CUMPLE",
            Details = isUniform
                ? "Todos los archivos de datos tienen el mismo Autogrowth."
                : "Los archivos de datos crecen a ritmos diferentes."
        };

        if (!isUniform)
        {
            rec.Suggestion = "Igualar el crecimiento automático de todos los archivos de datos de TempDB para evitar que uno crezca más que los demás y se convierta en hotspot.";
            rec.SqlScript = @"-- Igualar autogrowth de todos los archivos de datos de TempDB a 256MB
-- Obtener los nombres de archivos primero:
-- SELECT name, growth, is_percent_growth FROM tempdb.sys.database_files WHERE type = 0;

ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev', FILEGROWTH = 256MB);
ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev2', FILEGROWTH = 256MB);
-- Repetir para cada archivo de datos...";
        }

        return rec;
    }

    private static TempDbRecommendationDto CheckUniformSize(bool isUniform)
    {
        var rec = new TempDbRecommendationDto
        {
            Name = "Tamaño Uniforme",
            Status = isUniform ? "CUMPLE" : "NO CUMPLE",
            Details = isUniform
                ? "Todos los archivos de datos tienen el mismo tamaño."
                : "Los archivos de datos tienen tamaños iniciales distintos."
        };

        if (!isUniform)
        {
            rec.Suggestion = "Igualar el tamaño de todos los archivos de datos de TempDB. SQL Server usa un algoritmo de round-robin proporcional al espacio libre: si los archivos tienen distinto tamaño, uno absorberá más I/O.";
            rec.SqlScript = @"-- Igualar tamaño de todos los archivos de datos de TempDB
-- Verificar tamaños actuales:
-- SELECT name, size/128 AS SizeMB FROM tempdb.sys.database_files WHERE type = 0;

ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev', SIZE = 1024MB);
ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev2', SIZE = 1024MB);
-- Repetir para cada archivo de datos...";
        }

        return rec;
    }

    private static TempDbRecommendationDto CheckGrowthType(bool isFixed)
    {
        var rec = new TempDbRecommendationDto
        {
            Name = "Tipo de Crecimiento",
            Status = isFixed ? "CUMPLE" : "NO CUMPLE",
            Details = isFixed
                ? "Los archivos usan crecimiento por valor fijo."
                : "Se detectó crecimiento en %. Cambiar a crecimiento fijo en MB."
        };

        if (!isFixed)
        {
            rec.Suggestion = "Cambiar el crecimiento automático de porcentaje a un valor fijo en MB. El crecimiento porcentual causa archivos de tamaño desigual con el tiempo.";
            rec.SqlScript = @"-- Cambiar crecimiento de % a MB fijo
-- Verificar configuración actual:
-- SELECT name, growth, is_percent_growth FROM tempdb.sys.database_files;

ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev', FILEGROWTH = 256MB);
ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev2', FILEGROWTH = 256MB);
ALTER DATABASE tempdb MODIFY FILE (NAME = N'templog', FILEGROWTH = 256MB);
-- Repetir para cada archivo...";
        }

        return rec;
    }

    private static async Task<TempDbRecommendationDto> CheckTraceFlagsAsync(
        System.Data.Common.DbConnection connection, int sqlVersion, CancellationToken ct)
    {
        if (sqlVersion >= 13)
        {
            return new TempDbRecommendationDto
            {
                Name = "Trace Flags 1117/1118",
                Status = "CUMPLE",
                Details = $"Integrados por defecto en SQL Server {sqlVersion}."
            };
        }

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                CREATE TABLE #tf (TraceFlag INT, Status INT, Global INT, Session INT);
                INSERT INTO #tf EXEC('DBCC TRACESTATUS(1117, 1118)');
                SELECT COUNT(*) FROM #tf WHERE Status = 1;
                DROP TABLE #tf;";
            cmd.CommandTimeout = 15;
            var result = await cmd.ExecuteScalarAsync(ct);
            int activeFlags = result != null && result != DBNull.Value ? Convert.ToInt32(result) : 0;

            bool complies = activeFlags >= 2;

            var rec = new TempDbRecommendationDto
            {
                Name = "Trace Flags 1117/1118",
                Status = complies ? "CUMPLE" : "NO CUMPLE",
                Details = complies
                    ? "Flags configurados correctamente."
                    : "Faltan flags 1117/1118 necesarios en versiones < 2016."
            };

            if (!complies)
            {
                rec.Suggestion = "Habilitar Trace Flags 1117 (crecimiento uniforme de todos los archivos de un filegroup) y 1118 (eliminar mixed extents) como flags de inicio.";
                rec.SqlScript = @"-- Habilitar flags globalmente (se pierden al reiniciar)
DBCC TRACEON(1117, -1);
DBCC TRACEON(1118, -1);

-- Para que persistan, agregar como parámetro de inicio:
-- SQL Server Configuration Manager > SQL Server Services > Propiedades > Startup Parameters
-- Agregar: -T1117 y -T1118";
            }

            return rec;
        }
        catch (Exception ex)
        {
            return new TempDbRecommendationDto
            {
                Name = "Trace Flags 1117/1118",
                Status = "ADVERTENCIA",
                Details = $"No se pudo verificar: {ex.Message}"
            };
        }
    }

    private static async Task<TempDbRecommendationDto> CheckIFIAsync(
        System.Data.Common.DbConnection connection, int sqlVersion, CancellationToken ct)
    {
        if (sqlVersion < 13)
        {
            return new TempDbRecommendationDto
            {
                Name = "IFI (Instant File Init)",
                Status = "N/A",
                Details = "La verificación de IFI vía DMV no está disponible en versiones < 2016. Verificar manualmente."
            };
        }

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"SELECT CASE WHEN EXISTS(
                SELECT 1 FROM sys.dm_server_services
                WHERE servicename LIKE 'SQL Server (%)'
                  AND instant_file_initialization_enabled = 'Y'
            ) THEN 1 ELSE 0 END";
            cmd.CommandTimeout = 15;
            var result = await cmd.ExecuteScalarAsync(ct);
            bool enabled = result != null && Convert.ToInt32(result) == 1;

            var rec = new TempDbRecommendationDto
            {
                Name = "IFI (Instant File Init)",
                Status = enabled ? "CUMPLE" : "ADVERTENCIA",
                Details = enabled
                    ? "Habilitado."
                    : "IFI deshabilitado. Impacta el tiempo de crecimiento de TempDB."
            };

            if (!enabled)
            {
                rec.Suggestion = "Habilitar Instant File Initialization para acelerar la creación y crecimiento de archivos de datos. Requiere asignar el privilegio 'Perform volume maintenance tasks' (SE_MANAGE_VOLUME_NAME) a la cuenta de servicio de SQL Server.";
                rec.SqlScript = @"-- Verificación actual:
SELECT servicename, instant_file_initialization_enabled
FROM sys.dm_server_services
WHERE servicename LIKE 'SQL Server (%)';

-- Para habilitar IFI:
-- 1. Abrir 'Local Security Policy' (secpol.msc)
-- 2. Ir a Local Policies > User Rights Assignment
-- 3. Buscar 'Perform volume maintenance tasks'
-- 4. Agregar la cuenta de servicio de SQL Server
-- 5. Reiniciar el servicio de SQL Server";
            }

            return rec;
        }
        catch (Exception ex)
        {
            return new TempDbRecommendationDto
            {
                Name = "IFI (Instant File Init)",
                Status = "ADVERTENCIA",
                Details = $"No se pudo verificar: {ex.Message}"
            };
        }
    }

    private static async Task<TempDbRecommendationDto> CheckDiskIsolationAsync(
        System.Data.Common.DbConnection connection, CancellationToken ct)
    {
        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"
                SELECT CASE WHEN EXISTS(
                    SELECT 1 FROM sys.master_files AS m1
                    JOIN sys.master_files AS m2 ON m1.database_id = 2 AND m2.database_id > 4
                    CROSS APPLY sys.dm_os_volume_stats(m1.database_id, m1.file_id) v1
                    CROSS APPLY sys.dm_os_volume_stats(m2.database_id, m2.file_id) v2
                    WHERE v1.volume_mount_point = v2.volume_mount_point
                ) THEN 1 ELSE 0 END";
            cmd.CommandTimeout = 30;
            var result = await cmd.ExecuteScalarAsync(ct);
            bool shared = result != null && Convert.ToInt32(result) == 1;

            var rec = new TempDbRecommendationDto
            {
                Name = "Aislamiento de Disco",
                Status = shared ? "REVISAR" : "CUMPLE",
                Details = shared
                    ? "TempDB comparte volumen con DBs de usuario."
                    : "TempDB en volumen dedicado."
            };

            if (shared)
            {
                rec.Suggestion = "Mover TempDB a un volumen dedicado (idealmente SSD/NVMe) para evitar contención de I/O con bases de datos de usuario.";
                rec.SqlScript = @"-- Mover TempDB a un disco dedicado
-- 1. Cambiar la ruta de los archivos:
ALTER DATABASE tempdb MODIFY FILE (NAME = N'tempdev', FILENAME = N'T:\TempDB\tempdev.mdf');
ALTER DATABASE tempdb MODIFY FILE (NAME = N'templog', FILENAME = N'T:\TempDBLog\templog.ldf');
-- Repetir para cada archivo adicional...

-- 2. Reiniciar el servicio de SQL Server para que tome efecto.

-- Verificar después del reinicio:
SELECT name, physical_name FROM tempdb.sys.database_files;";
            }

            return rec;
        }
        catch (Exception ex)
        {
            return new TempDbRecommendationDto
            {
                Name = "Aislamiento de Disco",
                Status = "ADVERTENCIA",
                Details = $"No se pudo verificar (puede requerir permisos sobre sys.dm_os_volume_stats): {ex.Message}"
            };
        }
    }

    private static async Task<TempDbRecommendationDto> CheckMemoryOptimizedMetadataAsync(
        System.Data.Common.DbConnection connection, int sqlVersion, CancellationToken ct)
    {
        if (sqlVersion < 15)
        {
            return new TempDbRecommendationDto
            {
                Name = "Metadata en Memoria",
                Status = "N/A",
                Details = "Disponible a partir de SQL Server 2019."
            };
        }

        try
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = @"SELECT CASE WHEN EXISTS(
                SELECT 1 FROM sys.configurations
                WHERE name = 'tempdb metadata memory-optimized' AND value_in_use = 1
            ) THEN 1 ELSE 0 END";
            cmd.CommandTimeout = 15;
            var result = await cmd.ExecuteScalarAsync(ct);
            bool enabled = result != null && Convert.ToInt32(result) == 1;

            var rec = new TempDbRecommendationDto
            {
                Name = "Metadata en Memoria",
                Status = enabled ? "CUMPLE" : "ADVERTENCIA",
                Details = enabled
                    ? "Memory-optimized tempdb metadata está habilitado."
                    : "Deshabilitado. Considere habilitarlo si nota contención PAGELATCH en tablas de sistema."
            };

            if (!enabled)
            {
                rec.Suggestion = "Habilitar memory-optimized tempdb metadata para reducir contención de PAGELATCH en tablas de sistema de TempDB. Requiere reinicio del servicio SQL Server.";
                rec.SqlScript = @"-- Opción recomendada (T-SQL moderno):
ALTER SERVER CONFIGURATION
SET MEMORY_OPTIMIZED TEMPDB_METADATA = ON;
GO

-- Luego reiniciar el servicio de SQL Server.

-- Verificación:
SELECT SERVERPROPERTY('IsTempdbMetadataMemoryOptimized') AS IsEnabled;
-- 1 = habilitado (y ya reiniciaste)
-- 0 = no habilitado / falta reinicio

-- Opción alternativa (sp_configure):
EXEC sys.sp_configure N'show advanced options', 1;
RECONFIGURE;
EXEC sys.sp_configure N'tempdb metadata memory-optimized', 1;
RECONFIGURE;
-- Luego reiniciar el servicio igualmente.";
            }

            return rec;
        }
        catch (Exception ex)
        {
            return new TempDbRecommendationDto
            {
                Name = "Metadata en Memoria",
                Status = "ADVERTENCIA",
                Details = $"No se pudo verificar: {ex.Message}"
            };
        }
    }

    private static TempDbRecommendationDto CheckTempDbLog(bool logOk)
    {
        var rec = new TempDbRecommendationDto
        {
            Name = "Log de TempDB",
            Status = logOk ? "CUMPLE" : "REVISAR",
            Details = logOk
                ? "Configuración de crecimiento de log saludable."
                : "El log tiene crecimiento en % o el salto es muy pequeño (se recomiendan saltos grandes fijos)."
        };

        if (!logOk)
        {
            rec.Suggestion = "Configurar el log de TempDB con crecimiento fijo de al menos 256MB para evitar fragmentación y crecimientos frecuentes.";
            rec.SqlScript = @"-- Configurar crecimiento fijo del log de TempDB
-- Verificar configuración actual:
-- SELECT name, size/128 AS SizeMB, growth/128 AS GrowthMB, is_percent_growth
-- FROM tempdb.sys.database_files WHERE type = 1;

ALTER DATABASE tempdb MODIFY FILE (
    NAME = N'templog',
    SIZE = 1024MB,
    FILEGROWTH = 256MB
);";
        }

        return rec;
    }

    #endregion

    #region Helpers

    private static int CalculateOverallScore(List<TempDbRecommendationDto> recommendations)
    {
        if (recommendations.Count == 0) return 0;

        int scorableChecks = 0;
        int passedScore = 0;

        foreach (var rec in recommendations)
        {
            if (rec.Status == "N/A") continue;
            scorableChecks++;

            passedScore += rec.Status switch
            {
                "CUMPLE" => 100,
                "ADVERTENCIA" => 60,
                "REVISAR" => 30,
                _ => 0
            };
        }

        return scorableChecks > 0 ? passedScore / scorableChecks : 100;
    }

    private static TempDbAnalysisResponse BuildResponse(IList<TempDbAnalysisCache> cached)
    {
        var results = cached.Select(MapToDto).ToList();

        return new TempDbAnalysisResponse
        {
            Results = results,
            LastFullScanAt = cached.Any() ? cached.Max(c => c.AnalyzedAt) : null,
            TotalInstances = results.Count,
            ComplianceCount = results.Count(r => r.ConnectionSuccess && r.OverallScore >= 80),
            WarningCount = results.Count(r => r.ConnectionSuccess && r.OverallScore >= 50 && r.OverallScore < 80),
            FailCount = results.Count(r => !r.ConnectionSuccess || r.OverallScore < 50)
        };
    }

    private static TempDbCheckResultDto MapToDto(TempDbAnalysisCache cache)
    {
        List<TempDbRecommendationDto> recommendations;
        try
        {
            recommendations = JsonSerializer.Deserialize<List<TempDbRecommendationDto>>(
                cache.ResultsJson, JsonOptions) ?? new();
        }
        catch
        {
            recommendations = new();
        }

        return new TempDbCheckResultDto
        {
            InstanceName = cache.InstanceName,
            Ambiente = cache.Ambiente,
            MajorVersion = cache.MajorVersion,
            ConnectionSuccess = cache.ConnectionSuccess,
            ErrorMessage = cache.ErrorMessage,
            Recommendations = recommendations,
            OverallScore = cache.OverallScore,
            AnalyzedAt = cache.AnalyzedAt
        };
    }

    #endregion
}
