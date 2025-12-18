using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para análisis exhaustivo de índices en SQL Server
/// </summary>
[ApiController]
[Route("api/index-analysis")]
[Authorize]
public class IndexAnalysisController : ControllerBase
{
    private readonly IIndexAnalysisService _indexService;
    private readonly ILogger<IndexAnalysisController> _logger;

    public IndexAnalysisController(
        IIndexAnalysisService indexService,
        ILogger<IndexAnalysisController> logger)
    {
        _indexService = indexService;
        _logger = logger;
    }

    #region Instances & Databases

    /// <summary>
    /// Obtiene las instancias del inventario filtradas (sin AWS, sin DMZ)
    /// </summary>
    [HttpGet("instances")]
    public async Task<ActionResult<List<IndexAnalysisInstanceDto>>> GetInstances()
    {
        try
        {
            var instances = await _indexService.GetFilteredInstancesAsync();
            return Ok(instances);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo instancias para análisis de índices");
            return StatusCode(500, new { message = "Error obteniendo instancias: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene las bases de datos de una instancia
    /// </summary>
    [HttpGet("{instanceName}/databases")]
    public async Task<ActionResult<List<DatabaseInfoDto>>> GetDatabases(string instanceName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var databases = await _indexService.GetDatabasesAsync(decodedInstance);
            return Ok(databases);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo bases de datos de {Instance}", instanceName);
            return StatusCode(500, new { message = $"Error obteniendo bases de datos: {ex.Message}" });
        }
    }

    /// <summary>
    /// Prueba la conexión a una instancia
    /// </summary>
    [HttpGet("{instanceName}/test-connection")]
    public async Task<ActionResult> TestConnection(string instanceName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var isConnected = await _indexService.TestConnectionAsync(decodedInstance);
            return Ok(new { instanceName = decodedInstance, isConnected });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error probando conexión a {Instance}", instanceName);
            return Ok(new { instanceName, isConnected = false, error = ex.Message });
        }
    }

    #endregion

    #region Individual Analysis Endpoints

    /// <summary>
    /// Obtiene índices fragmentados
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/fragmented")]
    public async Task<ActionResult<List<FragmentedIndexDto>>> GetFragmentedIndexes(
        string instanceName, 
        string databaseName,
        [FromQuery] int minPageCount = 100,
        [FromQuery] double minFragmentationPct = 10.0)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices fragmentados en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetFragmentedIndexesAsync(decodedInstance, decodedDatabase, minPageCount, minFragmentationPct);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices fragmentados en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando fragmentación: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene índices sin uso
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/unused")]
    public async Task<ActionResult<List<UnusedIndexDto>>> GetUnusedIndexes(
        string instanceName, 
        string databaseName,
        [FromQuery] int minPageCount = 100)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices sin uso en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetUnusedIndexesAsync(decodedInstance, decodedDatabase, minPageCount);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices sin uso en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando índices sin uso: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene índices duplicados
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/duplicate")]
    public async Task<ActionResult<List<DuplicateIndexDto>>> GetDuplicateIndexes(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices duplicados en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetDuplicateIndexesAsync(decodedInstance, decodedDatabase);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices duplicados en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando duplicados: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene missing indexes sugeridos por SQL Server
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/missing")]
    public async Task<ActionResult<List<MissingIndexDto>>> GetMissingIndexes(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando missing indexes en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetMissingIndexesAsync(decodedInstance, decodedDatabase);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando missing indexes en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando missing indexes: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene índices deshabilitados
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/disabled")]
    public async Task<ActionResult<List<DisabledIndexDto>>> GetDisabledIndexes(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices deshabilitados en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetDisabledIndexesAsync(decodedInstance, decodedDatabase);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices deshabilitados en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando deshabilitados: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene índices solapados/redundantes
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/overlapping")]
    public async Task<ActionResult<List<OverlappingIndexDto>>> GetOverlappingIndexes(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices solapados en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetOverlappingIndexesAsync(decodedInstance, decodedDatabase);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices solapados en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando solapados: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene índices con problemas de diseño
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/bad")]
    public async Task<ActionResult<List<BadIndexDto>>> GetBadIndexes(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Analizando índices problemáticos en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var indexes = await _indexService.GetBadIndexesAsync(decodedInstance, decodedDatabase);
            return Ok(indexes);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error analizando índices problemáticos en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error analizando índices problemáticos: {ex.Message}" });
        }
    }

    #endregion

    #region Full Analysis

    /// <summary>
    /// Ejecuta análisis completo de índices
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/full")]
    public async Task<ActionResult<FullIndexAnalysisDto>> GetFullAnalysis(
        string instanceName, 
        string databaseName,
        [FromQuery] int minPageCount = 100,
        [FromQuery] double minFragmentationPct = 10.0,
        [FromQuery] bool generateScripts = true)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            _logger.LogInformation("Ejecutando análisis completo de índices en {Instance}/{Database}", decodedInstance, decodedDatabase);
            
            var request = new IndexAnalysisRequest
            {
                InstanceName = decodedInstance,
                DatabaseName = decodedDatabase,
                MinPageCount = minPageCount,
                MinFragmentationPct = minFragmentationPct,
                GenerateScripts = generateScripts
            };
            
            var analysis = await _indexService.GetFullAnalysisAsync(request);
            
            _logger.LogInformation("Análisis completo finalizado. Health Score: {Score}", analysis.Summary.HealthScore);
            
            return Ok(analysis);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ejecutando análisis completo en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error en análisis completo: {ex.Message}" });
        }
    }

    /// <summary>
    /// Ejecuta análisis completo via POST con opciones avanzadas
    /// </summary>
    [HttpPost("analyze")]
    public async Task<ActionResult<FullIndexAnalysisDto>> AnalyzeIndexes([FromBody] IndexAnalysisRequest request)
    {
        try
        {
            _logger.LogInformation("Ejecutando análisis de índices en {Instance}/{Database} con opciones personalizadas", 
                request.InstanceName, request.DatabaseName);
            
            var analysis = await _indexService.GetFullAnalysisAsync(request);
            
            _logger.LogInformation("Análisis finalizado. Health Score: {Score}, Problemas: {Problems}", 
                analysis.Summary.HealthScore,
                analysis.Summary.FragmentedCount + analysis.Summary.UnusedCount + analysis.Summary.DuplicateCount);
            
            return Ok(analysis);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ejecutando análisis de índices");
            return StatusCode(500, new { message = $"Error en análisis: {ex.Message}" });
        }
    }

    /// <summary>
    /// Obtiene solo el resumen del análisis
    /// </summary>
    [HttpGet("{instanceName}/{databaseName}/summary")]
    public async Task<ActionResult<IndexAnalysisSummaryDto>> GetSummary(
        string instanceName, 
        string databaseName)
    {
        try
        {
            var decodedInstance = Uri.UnescapeDataString(instanceName);
            var decodedDatabase = Uri.UnescapeDataString(databaseName);
            
            var summary = await _indexService.GetAnalysisSummaryAsync(decodedInstance, decodedDatabase);
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo resumen en {Instance}/{Database}", instanceName, databaseName);
            return StatusCode(500, new { message = $"Error obteniendo resumen: {ex.Message}" });
        }
    }

    #endregion
}

