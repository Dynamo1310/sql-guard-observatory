using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controlador para gestión de credenciales de sistema
/// </summary>
[ApiController]
[Route("api/system-credentials")]
[Authorize]
[ViewPermission("SystemCredentials")]
public class SystemCredentialsController : ControllerBase
{
    private readonly ISystemCredentialService _systemCredentialService;
    private readonly IPermissionService _permissionService;
    private readonly ICredentialAccessLogService _accessLogService;
    private readonly ILogger<SystemCredentialsController> _logger;

    public SystemCredentialsController(
        ISystemCredentialService systemCredentialService,
        IPermissionService permissionService,
        ICredentialAccessLogService accessLogService,
        ILogger<SystemCredentialsController> logger)
    {
        _systemCredentialService = systemCredentialService;
        _permissionService = permissionService;
        _accessLogService = accessLogService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
    private string? GetUserName() => User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("DisplayName");

    private async Task<bool> HasPermissionAsync()
    {
        var userId = GetUserId();
        return await _permissionService.HasPermissionAsync(userId, "SystemCredentials");
    }

    /// <summary>
    /// Obtiene todas las credenciales de sistema
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<SystemCredentialDto>>> GetAll()
    {
        if (!await HasPermissionAsync())
            return Forbid();

        var credentials = await _systemCredentialService.GetAllAsync();
        return Ok(credentials);
    }

    /// <summary>
    /// Obtiene una credencial de sistema por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<SystemCredentialDto>> GetById(int id)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        var credential = await _systemCredentialService.GetByIdAsync(id);
        if (credential == null)
            return NotFound();

        return Ok(credential);
    }

    /// <summary>
    /// Crea una nueva credencial de sistema.
    /// Requiere capacidad System.ManageCredentials.
    /// </summary>
    [HttpPost]
    [RequireCapability("System.ManageCredentials")]
    public async Task<ActionResult<SystemCredentialDto>> Create([FromBody] CreateSystemCredentialRequest request)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.Name))
            return BadRequest("El nombre es requerido");
        if (string.IsNullOrWhiteSpace(request.Username))
            return BadRequest("El usuario es requerido");
        if (string.IsNullOrWhiteSpace(request.Password))
            return BadRequest("El password es requerido");

        var credential = await _systemCredentialService.CreateAsync(request, GetUserId(), GetUserName());
        if (credential == null)
            return BadRequest("Error al crear la credencial. Posiblemente el nombre ya existe.");

        return CreatedAtAction(nameof(GetById), new { id = credential.Id }, credential);
    }

    /// <summary>
    /// Actualiza una credencial de sistema.
    /// Requiere capacidad System.ManageCredentials.
    /// </summary>
    [HttpPut("{id}")]
    [RequireCapability("System.ManageCredentials")]
    public async Task<ActionResult> Update(int id, [FromBody] UpdateSystemCredentialRequest request)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        var success = await _systemCredentialService.UpdateAsync(id, request, GetUserId(), GetUserName());
        if (!success)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Elimina una credencial de sistema.
    /// Requiere capacidad System.ManageCredentials.
    /// </summary>
    [HttpDelete("{id}")]
    [RequireCapability("System.ManageCredentials")]
    public async Task<ActionResult> Delete(int id)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        var success = await _systemCredentialService.DeleteAsync(id, GetUserId(), GetUserName());
        if (!success)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Agrega una asignación a una credencial.
    /// Requiere capacidad System.ManageCredentials.
    /// </summary>
    [HttpPost("{id}/assignments")]
    [RequireCapability("System.ManageCredentials")]
    public async Task<ActionResult<SystemCredentialAssignmentDto>> AddAssignment(
        int id, 
        [FromBody] AddSystemCredentialAssignmentRequest request)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.AssignmentType))
            return BadRequest("El tipo de asignación es requerido");
        if (string.IsNullOrWhiteSpace(request.AssignmentValue))
            return BadRequest("El valor de asignación es requerido");

        var assignment = await _systemCredentialService.AddAssignmentAsync(id, request, GetUserId(), GetUserName());
        if (assignment == null)
            return BadRequest("Error al agregar la asignación. Posiblemente ya existe o la credencial no se encontró.");

        return Ok(assignment);
    }

    /// <summary>
    /// Elimina una asignación de una credencial.
    /// Requiere capacidad System.ManageCredentials.
    /// </summary>
    [HttpDelete("{id}/assignments/{assignmentId}")]
    [RequireCapability("System.ManageCredentials")]
    public async Task<ActionResult> RemoveAssignment(int id, int assignmentId)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        var success = await _systemCredentialService.RemoveAssignmentAsync(id, assignmentId, GetUserId(), GetUserName());
        if (!success)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Prueba la conexión con una credencial
    /// </summary>
    [HttpPost("{id}/test-connection")]
    public async Task<ActionResult<TestSystemCredentialConnectionResponse>> TestConnection(
        int id,
        [FromBody] TestSystemCredentialConnectionRequest request)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        if (string.IsNullOrWhiteSpace(request.ServerName))
            return BadRequest("El nombre del servidor es requerido");

        var result = await _systemCredentialService.TestConnectionAsync(id, request, GetUserId());
        return Ok(result);
    }

    /// <summary>
    /// Obtiene los tipos de asignación disponibles
    /// </summary>
    [HttpGet("assignment-types")]
    public ActionResult<List<AssignmentTypeInfo>> GetAssignmentTypes()
    {
        var types = new List<AssignmentTypeInfo>
        {
            new() { Type = "Server", DisplayName = "Servidor Específico", Description = "Asigna a un servidor/instancia exacto (ej: SQLPROD01\\INST01)" },
            new() { Type = "HostingSite", DisplayName = "Hosting Site", Description = "Asigna a todos los servidores de un hosting site (ej: AWS, OnPremise, DMZ)" },
            new() { Type = "Environment", DisplayName = "Ambiente", Description = "Asigna a todos los servidores de un ambiente (ej: Produccion, Testing, Desarrollo)" },
            new() { Type = "Pattern", DisplayName = "Patrón (Regex)", Description = "Asigna usando un patrón regex para el nombre del servidor (ej: .*AWS.*)" }
        };
        return Ok(types);
    }

    /// <summary>
    /// Revela el password de una credencial de sistema
    /// Requiere permisos de SystemCredentials y registra auditoría centralizada
    /// </summary>
    [HttpPost("{id}/reveal")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RevealSystemCredentialPasswordResponse>> RevealPassword(int id)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        if (!await HasPermissionAsync())
        {
            await _accessLogService.LogSystemCredentialRevealAsync(id, userId, false, "PermissionDenied");
            return Forbid();
        }

        var result = await _systemCredentialService.RevealPasswordAsync(
            id, userId, GetUserName(), 
            HttpContext.Connection.RemoteIpAddress?.ToString(), 
            Request.Headers.UserAgent.ToString());

        if (result == null)
        {
            await _accessLogService.LogSystemCredentialRevealAsync(id, userId, false, "NotFound");
            return NotFound();
        }

        // Registrar acceso exitoso en auditoría centralizada
        await _accessLogService.LogSystemCredentialRevealAsync(id, userId, true);

        // Headers de seguridad para evitar caching
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        return Ok(result);
    }

    /// <summary>
    /// Registra que el password fue copiado al portapapeles
    /// </summary>
    [HttpPost("{id}/copied")]
    public async Task<ActionResult> RegisterPasswordCopy(int id)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        if (!await HasPermissionAsync())
            return Forbid();

        // Registrar copia en auditoría centralizada
        await _accessLogService.LogSystemCredentialCopyAsync(id, userId);

        return NoContent();
    }

    /// <summary>
    /// Obtiene los logs de auditoría de una credencial específica (auditoría centralizada)
    /// </summary>
    [HttpGet("{id}/audit-logs")]
    public async Task<ActionResult<List<CredentialAccessLogDto>>> GetAuditLogs(int id, [FromQuery] int? limit = 50)
    {
        if (!await HasPermissionAsync())
            return Forbid();

        _accessLogService.SetHttpContext(HttpContext);
        var logs = await _accessLogService.GetSystemCredentialAccessLogAsync(id, limit ?? 50);
        return Ok(logs);
    }
}

/// <summary>
/// Información sobre un tipo de asignación
/// </summary>
public class AssignmentTypeInfo
{
    public string Type { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

