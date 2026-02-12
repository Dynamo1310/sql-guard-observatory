using System.Data.SqlClient;
using Dapper;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de gestión de Bases sin Uso
/// </summary>
public interface IBasesSinUsoService
{
    /// <summary>
    /// Obtiene la grilla combinada de inventario (SqlServerDatabasesCache) + gestión (GestionBasesSinUso)
    /// </summary>
    Task<BasesSinUsoGridResponse> GetAllAsync(string? serverName = null, string? ambiente = null);

    /// <summary>
    /// Actualiza los campos de gestión de un registro existente
    /// </summary>
    Task<BasesSinUsoGridDto?> UpdateAsync(long id, UpdateBasesSinUsoRequest request);

    /// <summary>
    /// Crea o actualiza (upsert) el registro de gestión por ServerName + DbName
    /// </summary>
    Task<BasesSinUsoGridDto?> UpsertAsync(UpdateBasesSinUsoRequest request);

    /// <summary>
    /// Obtiene los DBAs disponibles del grupo IDD (General)
    /// </summary>
    Task<List<BasesSinUsoDbaDto>> GetAvailableDbas();

    /// <summary>
    /// Obtiene estadísticas para gráficos
    /// </summary>
    Task<BasesSinUsoStatsDto> GetStatsAsync();
}

/// <summary>
/// Servicio para la gestión de Bases sin Uso.
/// Usa Dapper para lectura (performance) y EF Core para escritura (tracking).
/// Ambas tablas están en SQLGuardObservatoryAuth (ApplicationDb).
/// </summary>
public class BasesSinUsoService : IBasesSinUsoService
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<BasesSinUsoService> _logger;

    private const string DBA_GROUP_NAME = "IDD (General)";

    public BasesSinUsoService(
        ApplicationDbContext context,
        IConfiguration configuration,
        ILogger<BasesSinUsoService> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// GET - Usa Dapper para obtener la unión de SqlServerDatabasesCache + GestionBasesSinUso.
    /// Incluye bases que ya no están en el cache (solo en gestión) mediante FULL OUTER JOIN simulado.
    /// Cruza con ReporteBasesSinActividad (SQLNova) para obtener ultima_actividad,
    /// y con SqlServerInstancesCache para obtener la versión del motor.
    /// </summary>
    public async Task<BasesSinUsoGridResponse> GetAllAsync(string? serverName = null, string? ambiente = null)
    {
        // Usamos un UNION para combinar:
        // 1) Bases en cache (LEFT JOIN con gestión, reporte de actividad e instancias)
        // 2) Bases solo en gestión (que ya no están en cache)
        const string sql = @"
            -- Bases presentes en el inventario actual (cache), con gestión si existe
            SELECT
                g.Id AS GestionId,
                c.Id AS CacheId,
                COALESCE(c.ServerInstanceId, g.ServerInstanceId) AS ServerInstanceId,
                COALESCE(c.ServerName, g.ServerName) AS ServerName,
                COALESCE(c.ServerAmbiente, g.ServerAmbiente) AS ServerAmbiente,
                COALESCE(c.DatabaseId, g.DatabaseId) AS DatabaseId,
                COALESCE(c.DbName, g.DbName) AS DbName,
                COALESCE(c.[Status], g.[Status]) AS [Status],
                COALESCE(c.StateDesc, g.StateDesc) AS StateDesc,
                COALESCE(c.DataFiles, g.DataFiles) AS DataFiles,
                COALESCE(c.DataMB, g.DataMB) AS DataMB,
                COALESCE(c.UserAccess, g.UserAccess) AS UserAccess,
                COALESCE(c.RecoveryModel, g.RecoveryModel) AS RecoveryModel,
                COALESCE(c.CompatibilityLevel, g.CompatibilityLevel) AS CompatibilityLevel,
                COALESCE(c.CreationDate, g.CreationDate) AS CreationDate,
                COALESCE(c.[Collation], g.[Collation]) AS [Collation],
                COALESCE(c.[Fulltext], g.[Fulltext]) AS [Fulltext],
                COALESCE(c.AutoClose, g.AutoClose) AS AutoClose,
                COALESCE(c.[ReadOnly], g.[ReadOnly]) AS [ReadOnly],
                COALESCE(c.AutoShrink, g.AutoShrink) AS AutoShrink,
                COALESCE(c.AutoCreateStatistics, g.AutoCreateStatistics) AS AutoCreateStatistics,
                COALESCE(c.AutoUpdateStatistics, g.AutoUpdateStatistics) AS AutoUpdateStatistics,
                COALESCE(c.SourceTimestamp, g.SourceTimestamp) AS SourceTimestamp,
                COALESCE(c.CachedAt, g.CachedAt) AS CachedAt,
                -- Campos de gestión
                -- CompatibilidadMotor: auto-derivado de la versión del motor (instancia)
                CASE
                    WHEN PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
                        THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
                    ELSE g.CompatibilidadMotor
                END AS CompatibilidadMotor,
                -- Fecha Última Actividad: priorizar dato del reporte, luego gestión
                COALESCE(
                    TRY_CAST(r.ultima_actividad AS DATETIME2),
                    g.FechaUltimaActividad
                ) AS FechaUltimaActividad,
                ISNULL(g.Offline, 0) AS Offline,
                g.FechaBajaMigracion,
                ISNULL(g.MotivoBasesSinActividad, 0) AS MotivoBasesSinActividad,
                ISNULL(g.MotivoObsolescencia, 0) AS MotivoObsolescencia,
                ISNULL(g.MotivoEficiencia, 0) AS MotivoEficiencia,
                ISNULL(g.MotivoCambioVersionAmbBajos, 0) AS MotivoCambioVersionAmbBajos,
                g.FechaUltimoBkp,
                g.UbicacionUltimoBkp,
                g.DbaAsignado,
                g.[Owner],
                g.Comentarios,
                g.FechaCreacion,
                g.FechaModificacion,
                CAST(CASE WHEN c.Id IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS EnInventarioActual,
                -- Versión del motor: extraer año de MajorVersion (ej: ''2019'' de ''Microsoft SQL Server 2019'')
                CASE
                    WHEN PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
                        THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
                    ELSE inst.MajorVersion
                END AS EngineVersion,
                -- EngineCompatLevel ya no se usa para comparación numérica
                NULL AS EngineCompatLevel
            FROM SqlServerDatabasesCache c
            LEFT JOIN GestionBasesSinUso g ON c.ServerName = g.ServerName AND c.DbName = g.DbName
            LEFT JOIN SqlServerInstancesCache inst ON c.ServerInstanceId = inst.Id
            OUTER APPLY (
                SELECT TOP 1 r.ultima_actividad
                FROM [SQLNova].[dbo].[ReporteBasesSinActividad] r
                WHERE r.ServerName = c.ServerName AND r.DB = c.DbName
                ORDER BY r.fecha_carga DESC
            ) r
            WHERE (@ServerName IS NULL OR c.ServerName LIKE '%' + @ServerName + '%')
              AND (@Ambiente IS NULL OR c.ServerAmbiente LIKE '%' + @Ambiente + '%')

            UNION ALL

            -- Bases que solo están en gestión (ya no existen en cache)
            SELECT
                g.Id AS GestionId,
                NULL AS CacheId,
                g.ServerInstanceId,
                g.ServerName,
                g.ServerAmbiente,
                g.DatabaseId,
                g.DbName,
                g.[Status],
                g.StateDesc,
                g.DataFiles,
                g.DataMB,
                g.UserAccess,
                g.RecoveryModel,
                g.CompatibilityLevel,
                g.CreationDate,
                g.[Collation],
                g.[Fulltext],
                g.AutoClose,
                g.[ReadOnly],
                g.AutoShrink,
                g.AutoCreateStatistics,
                g.AutoUpdateStatistics,
                g.SourceTimestamp,
                g.CachedAt,
                g.CompatibilidadMotor,
                g.FechaUltimaActividad,
                g.Offline,
                g.FechaBajaMigracion,
                g.MotivoBasesSinActividad,
                g.MotivoObsolescencia,
                g.MotivoEficiencia,
                g.MotivoCambioVersionAmbBajos,
                g.FechaUltimoBkp,
                g.UbicacionUltimoBkp,
                g.DbaAsignado,
                g.[Owner],
                g.Comentarios,
                g.FechaCreacion,
                g.FechaModificacion,
                CAST(0 AS BIT) AS EnInventarioActual,
                g.CompatibilidadMotor AS EngineVersion,
                NULL AS EngineCompatLevel
            FROM GestionBasesSinUso g
            WHERE NOT EXISTS (
                SELECT 1 FROM SqlServerDatabasesCache c 
                WHERE c.ServerName = g.ServerName AND c.DbName = g.DbName
            )
            AND (@ServerName IS NULL OR g.ServerName LIKE '%' + @ServerName + '%')
            AND (@Ambiente IS NULL OR g.ServerAmbiente LIKE '%' + @Ambiente + '%')

            ORDER BY ServerName, DbName";

        var connectionString = _configuration.GetConnectionString("ApplicationDb");

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        var items = (await connection.QueryAsync<BasesSinUsoGridDto>(sql, new
        {
            ServerName = serverName,
            Ambiente = ambiente
        })).ToList();

        // Calcular resumen para las KPI cards
        var resumen = new BasesSinUsoResumenDto
        {
            TotalBases = items.Count,
            BasesOffline = items.Count(i => i.Offline),
            BasesConGestion = items.Count(i => i.GestionId.HasValue),
            PendientesGestion = items.Count(i => !i.GestionId.HasValue),
            EspacioTotalMB = items.Sum(i => (long)(i.DataMB ?? 0)),
            EspacioEnGestionMB = items.Where(i => i.GestionId.HasValue).Sum(i => (long)(i.DataMB ?? 0))
        };

        return new BasesSinUsoGridResponse
        {
            Items = items,
            Resumen = resumen
        };
    }

    /// <summary>
    /// PUT - Usa EF Core para actualizar un registro de gestión existente
    /// </summary>
    public async Task<BasesSinUsoGridDto?> UpdateAsync(long id, UpdateBasesSinUsoRequest request)
    {
        var gestion = await _context.GestionBasesSinUso.FindAsync(id);
        if (gestion == null)
        {
            _logger.LogWarning("GestionBasesSinUso con Id {Id} no encontrado", id);
            return null;
        }

        // Actualizar campos de gestión
        MapRequestToEntity(request, gestion);
        gestion.FechaModificacion = DateTime.Now;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "GestionBasesSinUso actualizado: Id={Id}, Server={Server}, DB={DB}, Offline={Offline}",
            id, gestion.ServerName, gestion.DbName, gestion.Offline);

        return MapEntityToDto(gestion);
    }

    /// <summary>
    /// UPSERT - Crea o actualiza un registro de gestión por ServerName + DbName.
    /// Al crear, copia los campos del inventario actual del cache para persistencia.
    /// </summary>
    public async Task<BasesSinUsoGridDto?> UpsertAsync(UpdateBasesSinUsoRequest request)
    {
        var gestion = await _context.GestionBasesSinUso
            .FirstOrDefaultAsync(g => g.ServerName == request.ServerName && g.DbName == request.DbName);

        if (gestion == null)
        {
            // Crear nuevo registro de gestión
            gestion = new GestionBasesSinUso
            {
                ServerName = request.ServerName,
                DbName = request.DbName,
                FechaCreacion = DateTime.Now,
                FechaModificacion = DateTime.Now
            };

            // Copiar campos del inventario (del cache actual si se proveen, o del request)
            var cacheEntry = await _context.SqlServerDatabasesCache
                .FirstOrDefaultAsync(c => c.ServerName == request.ServerName && c.DbName == request.DbName);

            if (cacheEntry != null)
            {
                gestion.ServerInstanceId = cacheEntry.ServerInstanceId;
                gestion.ServerAmbiente = cacheEntry.ServerAmbiente;
                gestion.DatabaseId = cacheEntry.DatabaseId;
                gestion.Status = cacheEntry.Status;
                gestion.StateDesc = cacheEntry.StateDesc;
                gestion.DataFiles = cacheEntry.DataFiles;
                gestion.DataMB = cacheEntry.DataMB;
                gestion.UserAccess = cacheEntry.UserAccess;
                gestion.RecoveryModel = cacheEntry.RecoveryModel;
                gestion.CompatibilityLevel = cacheEntry.CompatibilityLevel;
                gestion.CreationDate = cacheEntry.CreationDate;
                gestion.Collation = cacheEntry.Collation;
                gestion.Fulltext = cacheEntry.Fulltext;
                gestion.AutoClose = cacheEntry.AutoClose;
                gestion.ReadOnly = cacheEntry.ReadOnly;
                gestion.AutoShrink = cacheEntry.AutoShrink;
                gestion.AutoCreateStatistics = cacheEntry.AutoCreateStatistics;
                gestion.AutoUpdateStatistics = cacheEntry.AutoUpdateStatistics;
                gestion.SourceTimestamp = cacheEntry.SourceTimestamp;
                gestion.CachedAt = cacheEntry.CachedAt;
            }
            else
            {
                // Si no hay cache, usar datos del request
                gestion.ServerInstanceId = request.ServerInstanceId ?? 0;
                gestion.ServerAmbiente = request.ServerAmbiente;
                gestion.DatabaseId = request.DatabaseId ?? 0;
                gestion.Status = request.Status;
                gestion.StateDesc = request.StateDesc;
                gestion.DataFiles = request.DataFiles;
                gestion.DataMB = request.DataMB;
                gestion.UserAccess = request.UserAccess;
                gestion.RecoveryModel = request.RecoveryModel;
                gestion.CompatibilityLevel = request.CompatibilityLevel;
                gestion.CreationDate = request.CreationDate;
                gestion.Collation = request.Collation;
                gestion.Fulltext = request.Fulltext;
                gestion.AutoClose = request.AutoClose;
                gestion.ReadOnly = request.ReadOnly;
                gestion.AutoShrink = request.AutoShrink;
                gestion.AutoCreateStatistics = request.AutoCreateStatistics;
                gestion.AutoUpdateStatistics = request.AutoUpdateStatistics;
                gestion.SourceTimestamp = request.SourceTimestamp;
                gestion.CachedAt = request.CachedAt;
            }

            // Aplicar campos de gestión
            MapRequestToEntity(request, gestion);

            _context.GestionBasesSinUso.Add(gestion);
            _logger.LogInformation(
                "GestionBasesSinUso creado: Server={Server}, DB={DB}",
                gestion.ServerName, gestion.DbName);
        }
        else
        {
            // Actualizar existente
            MapRequestToEntity(request, gestion);
            gestion.FechaModificacion = DateTime.Now;

            _logger.LogInformation(
                "GestionBasesSinUso actualizado: Id={Id}, Server={Server}, DB={DB}",
                gestion.Id, gestion.ServerName, gestion.DbName);
        }

        await _context.SaveChangesAsync();

        return MapEntityToDto(gestion);
    }

    /// <summary>
    /// Obtiene los DBAs disponibles del grupo IDD (General)
    /// </summary>
    public async Task<List<BasesSinUsoDbaDto>> GetAvailableDbas()
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Members)
                .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Name == DBA_GROUP_NAME && !g.IsDeleted && g.IsActive);

        if (group == null)
        {
            _logger.LogWarning("Grupo '{GroupName}' no encontrado o inactivo", DBA_GROUP_NAME);
            return new List<BasesSinUsoDbaDto>();
        }

        return group.Members
            .Where(m => m.User != null && m.User.IsActive)
            .Select(m => new BasesSinUsoDbaDto
            {
                UserId = m.UserId,
                DisplayName = m.User!.DisplayName ?? m.User.UserName ?? m.UserId,
                Email = m.User.Email
            })
            .OrderBy(d => d.DisplayName)
            .ToList();
    }

    /// <summary>
    /// Obtiene estadísticas para gráficos
    /// </summary>
    public async Task<BasesSinUsoStatsDto> GetStatsAsync()
    {
        var gestiones = await _context.GestionBasesSinUso.ToListAsync();

        var stats = new BasesSinUsoStatsDto();

        // Distribución por motivo de baja
        var motivos = new List<ChartDataItem>
        {
            new() { Name = "Sin Actividad", Value = gestiones.Count(g => g.MotivoBasesSinActividad) },
            new() { Name = "Obsolescencia", Value = gestiones.Count(g => g.MotivoObsolescencia) },
            new() { Name = "Eficiencia (ARQ)", Value = gestiones.Count(g => g.MotivoEficiencia) },
            new() { Name = "Cambio Versión Amb. Bajos", Value = gestiones.Count(g => g.MotivoCambioVersionAmbBajos) }
        };
        stats.PorMotivo = motivos.Where(m => m.Value > 0).ToList();

        // Distribución por ambiente
        stats.PorAmbiente = gestiones
            .Where(g => !string.IsNullOrEmpty(g.ServerAmbiente))
            .GroupBy(g => g.ServerAmbiente!)
            .Select(grp => new ChartDataItem { Name = grp.Key, Value = grp.Count() })
            .OrderByDescending(x => x.Value)
            .ToList();

        // Evolución temporal de bajas (por mes, usando FechaBajaMigracion)
        stats.EvolucionTemporal = gestiones
            .Where(g => g.FechaBajaMigracion.HasValue)
            .GroupBy(g => g.FechaBajaMigracion!.Value.ToString("yyyy-MM"))
            .Select(grp => new ChartDataItem { Name = grp.Key, Value = grp.Count() })
            .OrderBy(x => x.Name)
            .ToList();

        // Distribución por compatibilidad de motor
        stats.PorCompatibilidad = gestiones
            .Where(g => !string.IsNullOrEmpty(g.CompatibilidadMotor))
            .GroupBy(g => g.CompatibilidadMotor!)
            .Select(grp => new ChartDataItem { Name = grp.Key, Value = grp.Count() })
            .OrderBy(x => x.Name)
            .ToList();

        return stats;
    }

    /// <summary>
    /// Mapea los campos de gestión del request a la entidad
    /// </summary>
    private static void MapRequestToEntity(UpdateBasesSinUsoRequest request, GestionBasesSinUso entity)
    {
        entity.CompatibilidadMotor = request.CompatibilidadMotor;
        entity.FechaUltimaActividad = request.FechaUltimaActividad;
        entity.Offline = request.Offline;
        entity.FechaBajaMigracion = request.FechaBajaMigracion;
        entity.MotivoBasesSinActividad = request.MotivoBasesSinActividad;
        entity.MotivoObsolescencia = request.MotivoObsolescencia;
        entity.MotivoEficiencia = request.MotivoEficiencia;
        entity.MotivoCambioVersionAmbBajos = request.MotivoCambioVersionAmbBajos;
        entity.FechaUltimoBkp = request.FechaUltimoBkp;
        entity.UbicacionUltimoBkp = request.UbicacionUltimoBkp;
        entity.DbaAsignado = request.DbaAsignado;
        entity.Owner = request.Owner;
        entity.Comentarios = request.Comentarios;
        entity.FechaModificacion = DateTime.Now;
    }

    /// <summary>
    /// Mapea una entidad de gestión a un DTO de grilla
    /// </summary>
    private static BasesSinUsoGridDto MapEntityToDto(GestionBasesSinUso entity)
    {
        return new BasesSinUsoGridDto
        {
            GestionId = entity.Id,
            ServerInstanceId = entity.ServerInstanceId,
            ServerName = entity.ServerName,
            ServerAmbiente = entity.ServerAmbiente,
            DatabaseId = entity.DatabaseId,
            DbName = entity.DbName,
            Status = entity.Status,
            StateDesc = entity.StateDesc,
            DataFiles = entity.DataFiles,
            DataMB = entity.DataMB,
            UserAccess = entity.UserAccess,
            RecoveryModel = entity.RecoveryModel,
            CompatibilityLevel = entity.CompatibilityLevel,
            CreationDate = entity.CreationDate,
            Collation = entity.Collation,
            Fulltext = entity.Fulltext,
            AutoClose = entity.AutoClose,
            ReadOnly = entity.ReadOnly,
            AutoShrink = entity.AutoShrink,
            AutoCreateStatistics = entity.AutoCreateStatistics,
            AutoUpdateStatistics = entity.AutoUpdateStatistics,
            SourceTimestamp = entity.SourceTimestamp,
            CachedAt = entity.CachedAt,
            CompatibilidadMotor = entity.CompatibilidadMotor,
            FechaUltimaActividad = entity.FechaUltimaActividad,
            Offline = entity.Offline,
            FechaBajaMigracion = entity.FechaBajaMigracion,
            MotivoBasesSinActividad = entity.MotivoBasesSinActividad,
            MotivoObsolescencia = entity.MotivoObsolescencia,
            MotivoEficiencia = entity.MotivoEficiencia,
            MotivoCambioVersionAmbBajos = entity.MotivoCambioVersionAmbBajos,
            FechaUltimoBkp = entity.FechaUltimoBkp,
            UbicacionUltimoBkp = entity.UbicacionUltimoBkp,
            DbaAsignado = entity.DbaAsignado,
            Owner = entity.Owner,
            Comentarios = entity.Comentarios,
            FechaCreacion = entity.FechaCreacion,
            FechaModificacion = entity.FechaModificacion
        };
    }
}
