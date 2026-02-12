using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de AlwaysOn Availability Groups (v3.1 mejorado)
/// Replica la lógica de RelevamientoHealthScore_AlwaysOn.ps1
/// 
/// Características:
/// - Distingue entre SYNCHRONOUS_COMMIT y ASYNCHRONOUS_COMMIT
/// - SYNC: debe estar SYNCHRONIZED para ser saludable
/// - ASYNC: puede estar SYNCHRONIZING (es normal y esperado)
/// - Detecta bases suspendidas, queues altos, segundos de lag
/// 
/// Métricas v3.1:
/// - Log Send Rate (KB/s) - velocidad de envío de log
/// - Redo Rate (KB/s) - velocidad de aplicación de log
/// - Seconds Since Last Hardened - tiempo desde último log hardened
/// 
/// Peso en scoring: 14%
/// </summary>
public class AlwaysOnCollector : CollectorBase<AlwaysOnCollector.AlwaysOnMetrics>
{
    public override string CollectorName => "AlwaysOn";
    public override string DisplayName => "AlwaysOn";

    public AlwaysOnCollector(
        ILogger<AlwaysOnCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    protected override async Task<AlwaysOnMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new AlwaysOnMetrics();

        // Si la instancia no tiene AlwaysOn habilitado según la API, verificar de todas formas
        try
        {
            var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, timeoutSeconds, ct);

            if (dataTable.Rows.Count == 0)
            {
                result.AlwaysOnEnabled = false;
                result.WorstState = "N/A";
                return result;
            }

            ProcessAlwaysOnResults(dataTable, result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting AlwaysOn metrics from {Instance}", instance.InstanceName);
            result.AlwaysOnEnabled = false;
            result.WorstState = "ERROR";
        }

        return result;
    }

    private void ProcessAlwaysOnResults(DataTable table, AlwaysOnMetrics result)
    {
        result.AlwaysOnEnabled = true;
        result.DatabaseCount = table.Rows.Count;

        long totalSendQueue = 0;
        long totalRedoQueue = 0;
        long totalLogSendRate = 0;
        long totalRedoRate = 0;
        var problemDatabases = new List<string>();
        var hasSuspended = false;
        var hasNotHealthy = false;
        var hasNotSynchronized = false;

        foreach (DataRow row in table.Rows)
        {
            // Capturar AGName del primer row (la query devuelve ag.name AS AGName)
            if (result.AGName == null)
            {
                result.AGName = GetString(row, "AGName");
            }

            var dbName = GetString(row, "DatabaseName") ?? "";
            var syncState = GetString(row, "DBSyncState") ?? "";
            var availabilityMode = GetString(row, "AvailabilityMode") ?? "";
            var syncHealth = GetString(row, "SyncHealth") ?? "";
            var isSuspended = GetBool(row, "IsSuspended");
            var sendQueueKB = GetLong(row, "SendQueueKB");
            var redoQueueKB = GetLong(row, "RedoQueueKB");
            var secondsBehind = GetInt(row, "SecondsBehind");
            
            // v3.1: Nuevas métricas de velocidad
            var logSendRateKBps = GetLong(row, "LogSendRateKBps");
            var redoRateKBps = GetLong(row, "RedoRateKBps");
            var secondsSinceLastHardened = GetInt(row, "SecondsSinceLastHardened");

            // Determinar si la DB es "saludable" según su modo de disponibilidad
            // - SYNCHRONOUS_COMMIT: debe estar SYNCHRONIZED
            // - ASYNCHRONOUS_COMMIT: puede estar SYNCHRONIZING (es normal)
            bool isHealthy;
            if (availabilityMode.Equals("ASYNCHRONOUS_COMMIT", StringComparison.OrdinalIgnoreCase))
            {
                isHealthy = syncState.Equals("SYNCHRONIZED", StringComparison.OrdinalIgnoreCase) ||
                           syncState.Equals("SYNCHRONIZING", StringComparison.OrdinalIgnoreCase);
            }
            else // SYNCHRONOUS_COMMIT
            {
                isHealthy = syncState.Equals("SYNCHRONIZED", StringComparison.OrdinalIgnoreCase);
            }

            if (isHealthy && !isSuspended)
            {
                result.SynchronizedCount++;
            }

            if (isSuspended)
            {
                result.SuspendedCount++;
                hasSuspended = true;
                problemDatabases.Add($"{dbName}:SUSPENDED");
            }
            else if (!isHealthy)
            {
                hasNotSynchronized = true;
                problemDatabases.Add($"{dbName}:{syncState}");
            }

            if (syncHealth.Equals("NOT_HEALTHY", StringComparison.OrdinalIgnoreCase))
            {
                hasNotHealthy = true;
            }

            // Acumular queues
            totalSendQueue += sendQueueKB;
            totalRedoQueue += redoQueueKB;
            result.MaxSendQueueKB = Math.Max(result.MaxSendQueueKB, sendQueueKB);
            result.MaxRedoQueueKB = Math.Max(result.MaxRedoQueueKB, redoQueueKB);
            result.MaxSecondsBehind = Math.Max(result.MaxSecondsBehind, secondsBehind);
            
            // v3.1: Acumular rates
            totalLogSendRate += logSendRateKBps;
            totalRedoRate += redoRateKBps;
            result.MaxLogSendRateKBps = Math.Max(result.MaxLogSendRateKBps, logSendRateKBps);
            result.MaxRedoRateKBps = Math.Max(result.MaxRedoRateKBps, redoRateKBps);
            result.MaxSecondsSinceLastHardened = Math.Max(result.MaxSecondsSinceLastHardened, secondsSinceLastHardened);
        }

        // Calcular promedios
        if (result.DatabaseCount > 0)
        {
            result.AvgSendQueueKB = (int)(totalSendQueue / result.DatabaseCount);
            result.AvgRedoQueueKB = (int)(totalRedoQueue / result.DatabaseCount);
            result.AvgLogSendRateKBps = totalLogSendRate / result.DatabaseCount;
            result.AvgRedoRateKBps = totalRedoRate / result.DatabaseCount;
        }

        // Determinar peor estado
        if (hasSuspended)
        {
            result.WorstState = "SUSPENDED";
        }
        else if (hasNotHealthy)
        {
            result.WorstState = "NOT_HEALTHY";
        }
        else if (hasNotSynchronized)
        {
            result.WorstState = "NOT_SYNCHRONIZED";
        }
        else
        {
            result.WorstState = "HEALTHY";
        }

        // Detalles de problemas
        result.Details = string.Join("|", problemDatabases);
    }

    protected override int CalculateScore(AlwaysOnMetrics data, List<CollectorThreshold> thresholds)
    {
        // Si no tiene AlwaysOn, score perfecto
        if (!data.AlwaysOnEnabled)
            return 100;

        var score = 100;
        var cap = 100;

        // DB Suspended => score 0, cap 60
        if (data.SuspendedCount > 0)
        {
            score = 0;
            cap = 60;
        }
        // No todas sincronizadas (considerando ASYNC puede ser SYNCHRONIZING)
        else if (data.SynchronizedCount < data.DatabaseCount)
        {
            score = 50;
            cap = 60;
        }
        else
        {
            // Penalizaciones por queues
            if (data.MaxSendQueueKB > 100000) // >100 MB
                score = 70;
            else if (data.MaxRedoQueueKB > 100000) // >100 MB
                score = 80;
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, AlwaysOnMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthAlwaysOn
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            AlwaysOnEnabled = data.AlwaysOnEnabled,
            DatabaseCount = data.DatabaseCount,
            SynchronizedCount = data.SynchronizedCount,
            SuspendedCount = data.SuspendedCount,
            MaxSendQueueKB = (int)Math.Min(data.MaxSendQueueKB, int.MaxValue),
            MaxRedoQueueKB = (int)Math.Min(data.MaxRedoQueueKB, int.MaxValue),
            AlwaysOnWorstState = data.WorstState,
            AGName = data.AGName,
            // v3.1: Métricas de velocidad
            MaxLogSendRateKBps = data.MaxLogSendRateKBps,
            AvgLogSendRateKBps = data.AvgLogSendRateKBps,
            MaxRedoRateKBps = data.MaxRedoRateKBps,
            AvgRedoRateKBps = data.AvgRedoRateKBps,
            MaxSecondsSinceLastHardened = data.MaxSecondsSinceLastHardened
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthAlwaysOn.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // AlwaysOn solo disponible en SQL 2012+
        if (sqlMajorVersion < 11)
        {
            return "SELECT NULL WHERE 1=0;"; // Query vacía para versiones antiguas
        }

        return @"
-- Verificar si AlwaysOn está habilitado y obtener estado de las DBs
-- INCLUYE: log_send_rate, redo_rate, seconds_since_last_hardened (v3.1)
DECLARE @hadrEnabled INT = CAST(SERVERPROPERTY('IsHadrEnabled') AS INT);

IF @hadrEnabled = 1
BEGIN
    SELECT 
        ag.name AS AGName,
        ar.replica_server_name AS ReplicaName,
        ar.availability_mode_desc AS AvailabilityMode,
        ars.role_desc AS Role,
        ars.synchronization_health_desc AS SyncHealth,
        drs.synchronization_state_desc AS DBSyncState,
        DB_NAME(drs.database_id) AS DatabaseName,
        drs.is_suspended AS IsSuspended,
        drs.suspend_reason_desc AS SuspendReason,
        ISNULL(drs.log_send_queue_size, 0) AS SendQueueKB,
        ISNULL(drs.redo_queue_size, 0) AS RedoQueueKB,
        ISNULL(DATEDIFF(SECOND, drs.last_commit_time, GETDATE()), 0) AS SecondsBehind,
        -- v3.1: Métricas de velocidad de replicación
        ISNULL(drs.log_send_rate, 0) AS LogSendRateKBps,    -- KB/sec de envío de log
        ISNULL(drs.redo_rate, 0) AS RedoRateKBps,            -- KB/sec de redo
        drs.last_sent_time AS LastSentTime,
        drs.last_received_time AS LastReceivedTime,
        drs.last_hardened_time AS LastHardenedTime,
        drs.last_redone_time AS LastRedoneTime,
        -- Tiempo desde último log hardened (indica lag de sincronización)
        ISNULL(DATEDIFF(SECOND, drs.last_hardened_time, GETDATE()), 0) AS SecondsSinceLastHardened
    FROM sys.availability_replicas ar
    INNER JOIN sys.dm_hadr_availability_replica_states ars 
        ON ar.replica_id = ars.replica_id
    INNER JOIN sys.availability_groups ag 
        ON ar.group_id = ag.group_id
    LEFT JOIN sys.dm_hadr_database_replica_states drs 
        ON ar.replica_id = drs.replica_id
    WHERE ars.is_local = 1
      AND drs.database_id IS NOT NULL;
END
ELSE
BEGIN
    SELECT NULL WHERE 1=0;
END";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(AlwaysOnMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Enabled"] = data.AlwaysOnEnabled,
            ["Databases"] = data.DatabaseCount,
            ["Synchronized"] = data.SynchronizedCount,
            ["Suspended"] = data.SuspendedCount,
            ["WorstState"] = data.WorstState,
            ["LogSendRateKBps"] = data.MaxLogSendRateKBps,
            ["RedoRateKBps"] = data.MaxRedoRateKBps,
            ["SecsSinceLastHardened"] = data.MaxSecondsSinceLastHardened,
            ["AGName"] = data.AGName
        };
    }

    public class AlwaysOnMetrics
    {
        public bool AlwaysOnEnabled { get; set; }
        public int DatabaseCount { get; set; }
        public int SynchronizedCount { get; set; }
        public int SuspendedCount { get; set; }
        public string WorstState { get; set; } = "N/A";
        public int AvgSendQueueKB { get; set; }
        public long MaxSendQueueKB { get; set; }
        public int AvgRedoQueueKB { get; set; }
        public long MaxRedoQueueKB { get; set; }
        public int MaxSecondsBehind { get; set; }
        public string Details { get; set; } = "";
        
        /// <summary>
        /// Nombre del Availability Group (capturado de sys.availability_groups)
        /// </summary>
        public string? AGName { get; set; }
        
        // Métricas v3.1 - Log Send y Redo Rate
        public long MaxLogSendRateKBps { get; set; }     // KB/s de envío de log
        public long AvgLogSendRateKBps { get; set; }     // Promedio KB/s
        public long MaxRedoRateKBps { get; set; }        // KB/s de redo
        public long AvgRedoRateKBps { get; set; }        // Promedio KB/s
        public int MaxSecondsSinceLastHardened { get; set; } // Tiempo desde último log hardened
    }
}
