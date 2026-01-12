using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de estados de bases de datos
/// Métricas: Suspect, Emergency, RecoveryPending, Suspect Pages
/// NOTA: Las bases OFFLINE no se penalizan (son intencionales)
/// Peso: 3%
/// </summary>
public class DatabaseStatesCollector : CollectorBase<DatabaseStatesCollector.DatabaseStatesMetrics>
{
    public override string CollectorName => "DatabaseStates";
    public override string DisplayName => "Database States";

    public DatabaseStatesCollector(
        ILogger<DatabaseStatesCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    protected override async Task<DatabaseStatesMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new DatabaseStatesMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Database states
            if (dataSet.Tables.Count >= 1)
            {
                ProcessDatabaseStates(dataSet.Tables[0], result);
            }

            // ResultSet 2: Suspect pages
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.SuspectPageCount = GetInt(dataSet.Tables[1].Rows[0], "SuspectPageCount");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting database states from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessDatabaseStates(DataTable table, DatabaseStatesMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var stateDesc = GetString(row, "StateDesc") ?? "";
            var userAccess = GetString(row, "UserAccess") ?? "";

            switch (stateDesc.ToUpperInvariant())
            {
                case "OFFLINE":
                    result.OfflineCount++;
                    break;
                case "SUSPECT":
                    result.SuspectCount++;
                    break;
                case "EMERGENCY":
                    result.EmergencyCount++;
                    break;
                case "RECOVERY_PENDING":
                case "RECOVERY PENDING":
                    result.RecoveryPendingCount++;
                    break;
                case "RESTORING":
                    result.RestoringCount++;
                    break;
            }

            if (userAccess.Equals("SINGLE_USER", StringComparison.OrdinalIgnoreCase))
            {
                result.SingleUserCount++;
            }
        }
    }

    protected override int CalculateScore(DatabaseStatesMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // Suspect o Emergency => score 0, cap 0 (crítico)
        if (data.SuspectCount > 0 || data.EmergencyCount > 0)
        {
            score = 0;
            cap = 0;
        }
        // NOTA: OFFLINE NO penaliza - las bases offline son intencionales
        // Suspect pages => score 40, cap 50
        else if (data.SuspectPageCount > 0)
        {
            score = 40;
            cap = 50;
        }
        // Recovery pending => crítico, requiere atención
        else if (data.RecoveryPendingCount > 0)
        {
            score = 40;
        }
        // Single user o restoring => menor prioridad (pueden ser mantenimientos)
        else if (data.SingleUserCount > 0 || data.RestoringCount > 0)
        {
            score = 80; // Menos penalización, puede ser mantenimiento
        }

        return Math.Min(score, cap);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, DatabaseStatesMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthDatabaseStates
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            OfflineCount = data.OfflineCount,
            SuspectCount = data.SuspectCount,
            EmergencyCount = data.EmergencyCount,
            RecoveryPendingCount = data.RecoveryPendingCount,
            SingleUserCount = data.SingleUserCount,
            RestoringCount = data.RestoringCount,
            SuspectPageCount = data.SuspectPageCount
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthDatabaseStates.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- Database states problemáticos (OFFLINE excluido - es intencional)
-- Solo reportamos: SUSPECT, EMERGENCY, RECOVERY_PENDING, RESTORING
SELECT 
    d.name AS DatabaseName,
    d.state_desc AS StateDesc,
    d.user_access_desc AS UserAccess
FROM sys.databases d
WHERE d.database_id > 4
  AND d.name NOT IN ('tempdb')
  AND d.state_desc NOT IN ('ONLINE', 'OFFLINE'); -- OFFLINE es intencional, no es problema

-- Suspect pages (indica corrupción de datos)
SELECT COUNT(*) AS SuspectPageCount
FROM msdb.dbo.suspect_pages WITH (NOLOCK)
WHERE event_type IN (1, 2, 3);"; // 1=823 I/O error, 2=bad checksum, 3=torn page
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(DatabaseStatesMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Offline"] = data.OfflineCount,
            ["Suspect"] = data.SuspectCount,
            ["Emergency"] = data.EmergencyCount,
            ["SuspectPages"] = data.SuspectPageCount
        };
    }

    public class DatabaseStatesMetrics
    {
        public int OfflineCount { get; set; }
        public int SuspectCount { get; set; }
        public int EmergencyCount { get; set; }
        public int RecoveryPendingCount { get; set; }
        public int SingleUserCount { get; set; }
        public int RestoringCount { get; set; }
        public int SuspectPageCount { get; set; }
    }
}

