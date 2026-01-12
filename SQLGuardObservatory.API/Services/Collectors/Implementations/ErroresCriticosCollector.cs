using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de errores críticos y blocking (v3.1 mejorado)
/// Métricas básicas: Severity 20+ errors, Blocking sessions
/// Métricas v3.1:
///   - I/O Errors (823, 824, 825) - corrupción o problemas de disco
///   - Deadlocks (1205) - contención de locks
///   - Log Full (9002) - problemas de espacio en log
/// Peso: 7%
/// </summary>
public class ErroresCriticosCollector : CollectorBase<ErroresCriticosCollector.ErroresCriticosMetrics>
{
    public override string CollectorName => "ErroresCriticos";
    public override string DisplayName => "Errores Críticos";

    public ErroresCriticosCollector(
        ILogger<ErroresCriticosCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    protected override async Task<ErroresCriticosMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new ErroresCriticosMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Errors count 24h (Severity 20+)
            if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
            {
                result.Severity20PlusCount = GetInt(dataSet.Tables[0].Rows[0], "ErrorCount");
            }

            // ResultSet 2: Errors count 1h
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.Severity20PlusLast1h = GetInt(dataSet.Tables[1].Rows[0], "ErrorCount1h");
            }

            // ResultSet 3: Blocking info
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                var row = dataSet.Tables[2].Rows[0];
                result.BlockedSessionCount = GetInt(row, "BlockedCount");
                result.MaxBlockTimeSeconds = GetInt(row, "MaxBlockTimeSeconds");
            }
            
            // ResultSet 4: v3.1 - Errores categorizados
            if (dataSet.Tables.Count >= 4 && dataSet.Tables[3].Rows.Count > 0)
            {
                var row = dataSet.Tables[3].Rows[0];
                result.IOErrorCount = GetInt(row, "IOErrorCount");
                result.DeadlockCount = GetInt(row, "DeadlockCount");
                result.LogFullCount = GetInt(row, "LogFullCount");
                result.CorruptionCount = GetInt(row, "CorruptionCount");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting critical errors from {Instance}", instance.InstanceName);
        }

        return result;
    }

    protected override int CalculateScore(ErroresCriticosMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // v3.1: Errores I/O (823, 824, 825) - CRÍTICOS (indica problemas de disco/corrupción)
        if (data.IOErrorCount > 0)
        {
            score = 0;  // Score 0 inmediato
            cap = 30;   // Cap muy bajo
        }
        
        // v3.1: Errores de corrupción - CRÍTICOS
        if (data.CorruptionCount > 0)
        {
            score = 0;
            cap = Math.Min(cap, 20);
        }

        // Penalización por errores severity 20+
        if (data.Severity20PlusCount > 0)
        {
            score = Math.Min(score, 100 - (data.Severity20PlusCount * 10));
            if (score < 60) score = Math.Max(score, 60); // Máximo -40 por severity 20
        }

        // Cap por error reciente (última hora)
        if (data.Severity20PlusLast1h > 0)
        {
            cap = Math.Min(cap, 70);
        }
        
        // v3.1: Deadlocks - penalización moderada
        if (data.DeadlockCount > 0)
        {
            score = Math.Min(score, 100 - (data.DeadlockCount * 5)); // -5 por cada deadlock
            if (score < 50) score = Math.Max(score, 50);
        }
        
        // v3.1: Log Full - penalización alta
        if (data.LogFullCount > 0)
        {
            score = Math.Min(score, 40);
            cap = Math.Min(cap, 50);
        }

        // Penalización por blocking
        if (data.BlockedSessionCount > 0)
        {
            if (data.BlockedSessionCount > 10 || data.MaxBlockTimeSeconds > 30)
            {
                // Blocking severo
                score = Math.Min(score, 40);
                cap = Math.Min(cap, 60);
            }
            else if (data.BlockedSessionCount > 5 || data.MaxBlockTimeSeconds > 10)
            {
                // Blocking moderado
                score = Math.Min(score, 60);
                cap = Math.Min(cap, 80);
            }
            else
            {
                // Blocking leve
                score = Math.Min(score, 80);
            }
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, ErroresCriticosMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthErroresCriticos
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            Severity20PlusCount = data.Severity20PlusCount,
            Severity20PlusLast1h = data.Severity20PlusLast1h,
            // v3.1: Errores categorizados
            IOErrorCount = data.IOErrorCount,
            DeadlockCount = data.DeadlockCount,
            LogFullCount = data.LogFullCount,
            CorruptionCount = data.CorruptionCount
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthErroresCriticos.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // Detección mejorada de errores críticos:
        // - Severity >= 20 (errores fatales del motor)
        // - I/O Errors (823, 824, 825) - problemas de disco/corrupción
        // - Deadlocks (1205)
        // - Log Full (9002)
        // - Corruption detectada
        return @"
-- Query mejorada para detección de errores críticos
-- Cleanup previo
IF OBJECT_ID('tempdb..#ErrorLog') IS NOT NULL DROP TABLE #ErrorLog;
IF OBJECT_ID('tempdb..#CriticalErrors') IS NOT NULL DROP TABLE #CriticalErrors;

CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(128),
    [Text] NVARCHAR(MAX)
);

BEGIN TRY
    -- Leer log de errores actual (log 0)
    INSERT INTO #ErrorLog
    EXEC sp_readerrorlog 0, 1;
END TRY
BEGIN CATCH
    -- Si falla, intentar sin parámetros
    BEGIN TRY
        INSERT INTO #ErrorLog
        EXEC sp_readerrorlog 0;
    END TRY
    BEGIN CATCH
        -- Sin acceso al error log
    END CATCH
END CATCH

-- Categorizar errores críticos de las últimas 24 horas
-- Usamos patrones más específicos para severity >= 20
SELECT 
    LogDate,
    [Text],
    CASE 
        -- I/O Errors (muy críticos - indican problemas de disco)
        WHEN [Text] LIKE '%Error: 823,%' OR [Text] LIKE '%Error: 823 %' THEN 'IO_ERROR'
        WHEN [Text] LIKE '%Error: 824,%' OR [Text] LIKE '%Error: 824 %' THEN 'IO_ERROR'
        WHEN [Text] LIKE '%Error: 825,%' OR [Text] LIKE '%Error: 825 %' THEN 'IO_ERROR'
        -- Deadlocks
        WHEN [Text] LIKE '%Error: 1205,%' OR [Text] LIKE '%Error: 1205 %' THEN 'DEADLOCK'
        WHEN [Text] LIKE '%deadlock victim%' THEN 'DEADLOCK'
        -- Log Full
        WHEN [Text] LIKE '%Error: 9002,%' OR [Text] LIKE '%Error: 9002 %' THEN 'LOG_FULL'
        WHEN [Text] LIKE '%transaction log%is full%' THEN 'LOG_FULL'
        -- Corruption
        WHEN [Text] LIKE '%Error: 605,%' OR [Text] LIKE '%Error: 605 %' THEN 'CORRUPTION'
        WHEN [Text] LIKE '%corruption%' AND [Text] NOT LIKE '%no corruption%' THEN 'CORRUPTION'
        WHEN [Text] LIKE '%DBCC CHECKDB%found%error%' THEN 'CORRUPTION'
        -- Severity 20-25 (errores fatales del motor SQL Server)
        -- Severity 20: Error en proceso de usuario
        -- Severity 21: Error en proceso del motor
        -- Severity 22: Tabla/índice dañado
        -- Severity 23: Integridad de base de datos
        -- Severity 24: Error de hardware
        -- Severity 25: Error interno del sistema
        WHEN [Text] LIKE '%Severity: 20,%' OR [Text] LIKE '%Severity: 20.%' OR [Text] LIKE '%Severity: 20]%' THEN 'SEVERITY_20_PLUS'
        WHEN [Text] LIKE '%Severity: 21,%' OR [Text] LIKE '%Severity: 21.%' OR [Text] LIKE '%Severity: 21]%' THEN 'SEVERITY_20_PLUS'
        WHEN [Text] LIKE '%Severity: 22,%' OR [Text] LIKE '%Severity: 22.%' OR [Text] LIKE '%Severity: 22]%' THEN 'SEVERITY_20_PLUS'
        WHEN [Text] LIKE '%Severity: 23,%' OR [Text] LIKE '%Severity: 23.%' OR [Text] LIKE '%Severity: 23]%' THEN 'SEVERITY_20_PLUS'
        WHEN [Text] LIKE '%Severity: 24,%' OR [Text] LIKE '%Severity: 24.%' OR [Text] LIKE '%Severity: 24]%' THEN 'SEVERITY_20_PLUS'
        WHEN [Text] LIKE '%Severity: 25,%' OR [Text] LIKE '%Severity: 25.%' OR [Text] LIKE '%Severity: 25]%' THEN 'SEVERITY_20_PLUS'
        ELSE 'OTHER'
    END AS ErrorCategory
INTO #CriticalErrors
FROM #ErrorLog
WHERE LogDate >= DATEADD(HOUR, -24, GETDATE())
  AND (
      -- Severity 20-25 con patrones más específicos
      [Text] LIKE '%Severity: 20[,.]%' OR [Text] LIKE '%Severity: 20]%'
      OR [Text] LIKE '%Severity: 21[,.]%' OR [Text] LIKE '%Severity: 21]%'
      OR [Text] LIKE '%Severity: 22[,.]%' OR [Text] LIKE '%Severity: 22]%'
      OR [Text] LIKE '%Severity: 23[,.]%' OR [Text] LIKE '%Severity: 23]%'
      OR [Text] LIKE '%Severity: 24[,.]%' OR [Text] LIKE '%Severity: 24]%'
      OR [Text] LIKE '%Severity: 25[,.]%' OR [Text] LIKE '%Severity: 25]%'
      -- I/O Errors
      OR [Text] LIKE '%Error: 823[, ]%'
      OR [Text] LIKE '%Error: 824[, ]%'
      OR [Text] LIKE '%Error: 825[, ]%'
      -- Deadlocks
      OR [Text] LIKE '%Error: 1205[, ]%'
      OR [Text] LIKE '%deadlock victim%'
      -- Log Full
      OR [Text] LIKE '%Error: 9002[, ]%'
      OR [Text] LIKE '%transaction log%is full%'
      -- Corruption
      OR [Text] LIKE '%Error: 605[, ]%'
      OR ([Text] LIKE '%corruption%' AND [Text] NOT LIKE '%no corruption%')
      OR [Text] LIKE '%DBCC CHECKDB%found%error%'
  );

-- Contar errores Severity 20+ en últimas 24 horas
SELECT COUNT(*) AS ErrorCount 
FROM #CriticalErrors
WHERE ErrorCategory = 'SEVERITY_20_PLUS';

-- Contar errores Severity 20+ en última hora
SELECT COUNT(*) AS ErrorCount1h 
FROM #CriticalErrors
WHERE LogDate >= DATEADD(HOUR, -1, GETDATE())
  AND ErrorCategory = 'SEVERITY_20_PLUS';

-- Blocking actual
SELECT 
    COUNT(*) AS BlockedCount,
    ISNULL(MAX(DATEDIFF(SECOND, r.start_time, GETDATE())), 0) AS MaxBlockTimeSeconds
FROM sys.dm_exec_requests r WITH (NOLOCK)
WHERE r.blocking_session_id > 0;

-- Conteo por categoría
SELECT 
    ISNULL(SUM(CASE WHEN ErrorCategory = 'IO_ERROR' THEN 1 ELSE 0 END), 0) AS IOErrorCount,
    ISNULL(SUM(CASE WHEN ErrorCategory = 'DEADLOCK' THEN 1 ELSE 0 END), 0) AS DeadlockCount,
    ISNULL(SUM(CASE WHEN ErrorCategory = 'LOG_FULL' THEN 1 ELSE 0 END), 0) AS LogFullCount,
    ISNULL(SUM(CASE WHEN ErrorCategory = 'CORRUPTION' THEN 1 ELSE 0 END), 0) AS CorruptionCount
FROM #CriticalErrors;

-- Cleanup
DROP TABLE #CriticalErrors;
DROP TABLE #ErrorLog;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(ErroresCriticosMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Errors24h"] = data.Severity20PlusCount,
            ["Errors1h"] = data.Severity20PlusLast1h,
            ["BlockedSessions"] = data.BlockedSessionCount,
            ["MaxBlockTime"] = data.MaxBlockTimeSeconds,
            ["IOErrors"] = data.IOErrorCount,
            ["Deadlocks"] = data.DeadlockCount,
            ["LogFull"] = data.LogFullCount,
            ["Corruption"] = data.CorruptionCount
        };
    }

    public class ErroresCriticosMetrics
    {
        // Errores generales
        public int Severity20PlusCount { get; set; }
        public int Severity20PlusLast1h { get; set; }
        public int BlockedSessionCount { get; set; }
        public int MaxBlockTimeSeconds { get; set; }
        
        // v3.1: Errores específicos categorizados
        public int IOErrorCount { get; set; }       // Errores 823, 824, 825 (I/O, corrupción)
        public int DeadlockCount { get; set; }      // Errores 1205 (deadlocks)
        public int LogFullCount { get; set; }       // Errores 9002 (log lleno)
        public int CorruptionCount { get; set; }    // Errores de corrupción detectados
    }
}

