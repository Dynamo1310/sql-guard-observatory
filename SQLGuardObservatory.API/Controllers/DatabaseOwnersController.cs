using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para el Knowledge Base de owners de bases de datos
/// </summary>
[ApiController]
[Route("api/database-owners")]
[Authorize]
[ViewPermission("DatabaseOwners")]
public class DatabaseOwnersController : ControllerBase
{
    private readonly IDatabaseOwnersService _databaseOwnersService;
    private readonly ILogger<DatabaseOwnersController> _logger;

    public DatabaseOwnersController(
        IDatabaseOwnersService databaseOwnersService,
        ILogger<DatabaseOwnersController> logger)
    {
        _databaseOwnersService = databaseOwnersService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    private string GetUserName() => User.FindFirstValue("displayName") 
        ?? User.FindFirstValue(ClaimTypes.Name) 
        ?? "Unknown";

    /// <summary>
    /// Obtiene todos los owners con paginación y filtros
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<DatabaseOwnerPagedResult>> GetAll(
        [FromQuery] string? serverName,
        [FromQuery] string? databaseName,
        [FromQuery] string? cellTeam,
        [FromQuery] string? ownerName,
        [FromQuery] string? businessCriticality,
        [FromQuery] bool? isActive,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50)
    {
        try
        {
            var filter = new DatabaseOwnerFilterRequest
            {
                ServerName = serverName,
                DatabaseName = databaseName,
                CellTeam = cellTeam,
                OwnerName = ownerName,
                BusinessCriticality = businessCriticality,
                IsActive = isActive,
                Page = page,
                PageSize = pageSize
            };

            var result = await _databaseOwnersService.GetAllAsync(filter);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener owners de BD");
            return StatusCode(500, new { message = "Error al obtener owners de BD" });
        }
    }

    /// <summary>
    /// Obtiene un owner por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<DatabaseOwnerDto>> GetById(int id)
    {
        try
        {
            var owner = await _databaseOwnersService.GetByIdAsync(id);
            if (owner == null)
                return NotFound(new { message = "Owner no encontrado" });

            return Ok(owner);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener owner {Id}", id);
            return StatusCode(500, new { message = "Error al obtener owner" });
        }
    }

    /// <summary>
    /// Busca owner por servidor/instancia/base de datos
    /// </summary>
    [HttpGet("find")]
    public async Task<ActionResult<DatabaseOwnerDto>> Find(
        [FromQuery] string serverName,
        [FromQuery] string? instanceName,
        [FromQuery] string? databaseName)
    {
        try
        {
            var owner = await _databaseOwnersService.FindByDatabaseAsync(serverName, instanceName, databaseName);
            if (owner == null)
                return NotFound(new { message = "Owner no encontrado para esta base de datos" });

            return Ok(owner);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al buscar owner para {Server}", serverName);
            return StatusCode(500, new { message = "Error al buscar owner" });
        }
    }

    /// <summary>
    /// Crea un nuevo owner
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<DatabaseOwnerDto>> Create([FromBody] CreateDatabaseOwnerRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();

            var owner = await _databaseOwnersService.CreateAsync(request, userId, userName);

            _logger.LogInformation(
                "Owner de BD creado: {Server}/{Database} -> {Owner} por {User}",
                request.ServerName, request.DatabaseName, request.OwnerName, userName);

            return CreatedAtAction(nameof(GetById), new { id = owner.Id }, owner);
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear owner de BD");
            return StatusCode(500, new { message = "Error al crear owner de BD" });
        }
    }

    /// <summary>
    /// Actualiza un owner
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<DatabaseOwnerDto>> Update(int id, [FromBody] UpdateDatabaseOwnerRequest request)
    {
        try
        {
            var userId = GetUserId();
            var userName = GetUserName();

            var owner = await _databaseOwnersService.UpdateAsync(id, request, userId, userName);
            if (owner == null)
                return NotFound(new { message = "Owner no encontrado" });

            _logger.LogInformation("Owner de BD {Id} actualizado por {User}", id, userName);

            return Ok(owner);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar owner {Id}", id);
            return StatusCode(500, new { message = "Error al actualizar owner" });
        }
    }

    /// <summary>
    /// Elimina un owner
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(int id)
    {
        try
        {
            var success = await _databaseOwnersService.DeleteAsync(id);
            if (!success)
                return NotFound(new { message = "Owner no encontrado" });

            _logger.LogInformation("Owner de BD {Id} eliminado por {User}", id, GetUserId());

            return Ok(new { message = "Owner eliminado" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar owner {Id}", id);
            return StatusCode(500, new { message = "Error al eliminar owner" });
        }
    }

    /// <summary>
    /// Obtiene lista de servidores disponibles
    /// </summary>
    [HttpGet("servers")]
    public async Task<ActionResult<List<DatabaseOwnerServerDto>>> GetAvailableServers()
    {
        try
        {
            var servers = await _databaseOwnersService.GetAvailableServersAsync();
            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener servidores disponibles");
            return StatusCode(500, new { message = "Error al obtener servidores disponibles" });
        }
    }

    /// <summary>
    /// Obtiene bases de datos de un servidor
    /// </summary>
    [HttpGet("databases/{serverName}")]
    public async Task<ActionResult<List<AvailableDatabaseDto>>> GetDatabasesForServer(
        string serverName,
        [FromQuery] string? instanceName)
    {
        try
        {
            var databases = await _databaseOwnersService.GetDatabasesForServerAsync(serverName, instanceName);
            return Ok(databases);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener bases de datos para {Server}", serverName);
            return StatusCode(500, new { message = "Error al obtener bases de datos" });
        }
    }

    /// <summary>
    /// Obtiene células/equipos únicos
    /// </summary>
    [HttpGet("cells")]
    public async Task<ActionResult<List<CellTeamDto>>> GetCellTeams()
    {
        try
        {
            var cellTeams = await _databaseOwnersService.GetUniqueCellTeamsAsync();
            return Ok(cellTeams);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener células");
            return StatusCode(500, new { message = "Error al obtener células" });
        }
    }
}
