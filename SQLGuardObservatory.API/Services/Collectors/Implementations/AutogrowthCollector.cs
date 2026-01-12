using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de eventos de autogrowth
/// Metricas: Eventos en 24h, Archivos cerca del limite
/// Peso: 5%
/// </summary>
public class AutogrowthCollector : CollectorBase<AutogrowthCollector.AutogrowthMetrics>
{
    public override string CollectorName => "Autogrowth";
    public override string DisplayName => "Autogrowth";

    public AutogrowthCollector(
        ILogger<AutogrowthCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    protected override async Task<AutogrowthMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new AutogrowthMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Autogrowth events
            if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
            {
                result.AutogrowthEventsLast24h = GetInt(dataSet.Tables[0].Rows[0], "GrowthEvents");
            }

            // ResultSet 2: Files near limit
            if (dataSet.Tables.Count >= 2)
            {
                ProcessFilesNearLimit(dataSet.Tables[1], result);
            }

            // ResultSet 3: Bad growth config (% growth)
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                result.FilesWithBadGrowth = GetInt(dataSet.Tables[2].Rows[0], "BadGrowthCount");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting autogrowth metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessFilesNearLimit(DataTable table, AutogrowthMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var pctOfMax = GetDecimal(row, "PctOfMax");
            result.FilesNearLimit++;

            if (pctOfMax > result.WorstPercentOfMax)
            {
                result.WorstPercentOfMax = pctOfMax;
            }
        }
    }

    protected override int CalculateScore(AutogrowthMetrics data, List<CollectorThreshold> thresholds)
    {
        // Scoring ajustado para ser mas realista:
        // Los autogrowths ocasionales son NORMALES en bases de datos activas
        // Solo penalizar cuando hay un problema real de configuracion
        //
        // - 100 pts: menos de 50 autogrowths/dia, ningun archivo cerca del limite
        // - 90 pts: 50-100 autogrowths/dia
        // - 80 pts: 100-200 autogrowths/dia
        // - 70 pts: 200-500 autogrowths/dia
        // - 50 pts: mas de 500 autogrowths/dia (excesivo, revisar configuracion)
        // - 40 pts: archivos mayor al 90% del maxsize
        // - 0 pts: Archivos en maxsize o crecimiento bloqueado

        var score = 100;

        // Penalizacion por cantidad de eventos de autogrowth
        // Umbrales mas realistas: algunos autogrowths son normales
        if (data.AutogrowthEventsLast24h >= 1000)
        {
            // Excesivo: mas de 1000 autogrowths en 24h indica problema serio
            score = 40;
        }
        else if (data.AutogrowthEventsLast24h >= 500)
        {
            // Muy alto: revisar configuracion de archivos
            score = 50;
        }
        else if (data.AutogrowthEventsLast24h >= 200)
        {
            // Alto: considerar aumentar tamano inicial
            score = 70;
        }
        else if (data.AutogrowthEventsLast24h >= 100)
        {
            // Moderado: aceptable pero mejorable
            score = 80;
        }
        else if (data.AutogrowthEventsLast24h >= 50)
        {
            // Bajo: normal en bases activas
            score = 90;
        }
        // menos de 50 autogrowths = score 100 (optimo)

        // Archivos cerca del limite: penalizacion moderada
        // Solo si mayor al 90% del maxsize (riesgo real de quedarse sin espacio)
        if (data.WorstPercentOfMax > 95)
        {
            // Critico: muy cerca del limite
            score = Math.Min(score, 30);
        }
        else if (data.WorstPercentOfMax > 90)
        {
            // Alto riesgo
            score = Math.Min(score, 50);
        }
        else if (data.WorstPercentOfMax > 80)
        {
            // Riesgo moderado
            score = Math.Min(score, 70);
        }

        // Archivos al 100% del maxsize = critico
        if (data.WorstPercentOfMax >= 100)
        {
            score = 0;
        }

        // Bad growth config: penalizacion menor (solo informativo)
        // Growth en % funciona bien en muchos casos
        if (data.FilesWithBadGrowth > 5) // Solo si hay MUCHOS archivos con config suboptima
        {
            score = Math.Min(score, 80);
        }

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, AutogrowthMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthAutogrowth
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            AutogrowthEventsLast24h = data.AutogrowthEventsLast24h,
            FilesNearLimit = data.FilesNearLimit,
            FilesWithBadGrowth = data.FilesWithBadGrowth,
            WorstPercentOfMax = data.WorstPercentOfMax
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthAutogrowth.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // Replicando logica PowerShell exacta: Default Trace + sys.trace_events para nombres
        return @"
-- Autogrowth Events (last 24h) using Default Trace
DECLARE @AutogrowthEvents INT = 0;

BEGIN TRY
    DECLARE @tracefile VARCHAR(500);
    
    SELECT @tracefile = CAST(value AS VARCHAR(500))
    FROM sys.fn_trace_getinfo(NULL)
    WHERE traceid = 1 AND property = 2;
    
    IF @tracefile IS NOT NULL
    BEGIN
        SELECT @AutogrowthEvents = COUNT(*)
        FROM sys.fn_trace_gettable(@tracefile, DEFAULT) t
        INNER JOIN sys.trace_events e ON t.EventClass = e.trace_event_id
        WHERE e.name IN ('Data File Auto Grow', 'Log File Auto Grow')
          AND t.StartTime > DATEADD(HOUR, -24, GETDATE());
    END
    ELSE
    BEGIN
        -- Default Trace disabled
        SET @AutogrowthEvents = 0;
    END
END TRY
BEGIN CATCH
    SET @AutogrowthEvents = 0;
END CATCH

SELECT @AutogrowthEvents AS GrowthEvents;

-- File Size vs MaxSize (includes HasIssue flag)
SELECT 
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.name AS FileName,
    mf.type_desc AS FileType,
    mf.size * 8.0 / 1024 AS SizeMB,
    CASE 
        WHEN mf.max_size = -1 THEN NULL
        WHEN mf.max_size = 268435456 THEN NULL  -- 2TB default
        ELSE mf.max_size * 8.0 / 1024
    END AS MaxSizeMB,
    CASE 
        WHEN mf.max_size = -1 OR mf.max_size = 268435456 THEN 0
        ELSE (CAST(mf.size AS FLOAT) / mf.max_size) * 100
    END AS PctOfMax,
    mf.is_percent_growth AS IsPercentGrowth,
    CASE 
        WHEN mf.is_percent_growth = 1 THEN CAST(mf.growth AS VARCHAR) + '%'
        ELSE CAST(mf.growth * 8 / 1024 AS VARCHAR) + ' MB'
    END AS GrowthSetting,
    CASE 
        WHEN mf.max_size != -1 AND mf.max_size != 268435456 
             AND (CAST(mf.size AS FLOAT) / mf.max_size) > 0.9 THEN 1
        WHEN mf.is_percent_growth = 1 AND mf.size * 8 / 1024 > 1000 THEN 1
        ELSE 0
    END AS HasIssue
FROM sys.master_files mf
WHERE mf.database_id > 4
ORDER BY 
    CASE 
        WHEN mf.max_size = -1 OR mf.max_size = 268435456 THEN 0
        ELSE (CAST(mf.size AS FLOAT) / mf.max_size) * 100
    END DESC;

-- Count files with bad growth config (flexible criteria)
-- Only considers bad if:
-- 1. File at more than 90% of configured maxsize (real risk)
-- 2. Very small percent growth (less than 1%) on large files (more than 10GB)
SELECT COUNT(*) AS BadGrowthCount
FROM sys.master_files mf
WHERE mf.growth > 0
  AND (
      -- Files at more than 90% of configured maxsize
      (mf.max_size != -1 AND mf.max_size != 268435456 AND (CAST(mf.size AS FLOAT) / mf.max_size) > 0.9)
      -- Very small percent growth on large files (more than 10GB with less than 10% growth)
      OR (mf.is_percent_growth = 1 AND mf.growth < 10 AND mf.size * 8 / 1024 > 10240)
  )
  AND mf.database_id > 4;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(AutogrowthMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Events24h"] = data.AutogrowthEventsLast24h,
            ["FilesNearLimit"] = data.FilesNearLimit,
            ["WorstPctOfMax"] = data.WorstPercentOfMax,
            ["BadGrowthFiles"] = data.FilesWithBadGrowth
        };
    }

    public class AutogrowthMetrics
    {
        public int AutogrowthEventsLast24h { get; set; }
        public int FilesNearLimit { get; set; }
        public int FilesWithBadGrowth { get; set; }
        public decimal WorstPercentOfMax { get; set; }
    }
}
