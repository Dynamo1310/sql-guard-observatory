using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para el Vault de Credenciales DBA
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class VaultController : ControllerBase
{
    private readonly IVaultService _vaultService;
    private readonly IPermissionService _permissionService;
    private readonly IPermissionBitMaskService _permissionBitMaskService;
    private readonly ICredentialAccessLogService _accessLogService;
    private readonly ILogger<VaultController> _logger;

    public VaultController(
        IVaultService vaultService,
        IPermissionService permissionService,
        IPermissionBitMaskService permissionBitMaskService,
        ICredentialAccessLogService accessLogService,
        ILogger<VaultController> logger)
    {
        _vaultService = vaultService;
        _permissionService = permissionService;
        _permissionBitMaskService = permissionBitMaskService;
        _accessLogService = accessLogService;
        _logger = logger;
    }

    // =============================================
    // Helpers
    // =============================================

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) ?? string.Empty;
    private string? GetUserName() => User.FindFirstValue("displayName") ?? User.Identity?.Name;
    private string? GetIpAddress() => HttpContext.Connection.RemoteIpAddress?.ToString();
    private string? GetUserAgent() => Request.Headers.UserAgent.ToString();

    private bool IsSuperAdmin() => User.IsInRole("SuperAdmin");
    private bool IsAdmin() => User.IsInRole("Admin") || User.IsInRole("SuperAdmin");

    /// <summary>
    /// Verifica si el usuario actual tiene un permiso específico
    /// </summary>
    private async Task<bool> HasPermissionAsync(string permission)
    {
        if (IsSuperAdmin()) return true;
        
        var userId = GetUserId();
        var permissions = await _permissionService.GetUserPermissionsAsync(userId);
        return permissions.Contains(permission);
    }

    // =============================================
    // Endpoints de Credenciales
    // =============================================

    /// <summary>
    /// Obtiene todas las credenciales visibles para el usuario
    /// </summary>
    [HttpGet("credentials")]
    public async Task<ActionResult<List<CredentialDto>>> GetCredentials([FromQuery] CredentialFilterRequest? filter)
    {
        var userId = GetUserId();
        
        // Verificar permiso: VaultCredentials para compartidas, VaultMyCredentials para privadas
        var hasVaultCredentials = await HasPermissionAsync("VaultCredentials");
        var hasVaultMyCredentials = await HasPermissionAsync("VaultMyCredentials");

        if (!hasVaultCredentials && !hasVaultMyCredentials)
        {
            return Forbid();
        }

        // Si solo tiene permiso para sus credenciales, forzar filtro de propietario
        if (!hasVaultCredentials && hasVaultMyCredentials)
        {
            filter ??= new CredentialFilterRequest();
            filter.OwnerOnly = true;
        }

        var credentials = await _vaultService.GetCredentialsAsync(userId, filter);
        return Ok(credentials);
    }

    /// <summary>
    /// Obtiene una credencial por ID (sin password)
    /// </summary>
    [HttpGet("credentials/{id}")]
    public async Task<ActionResult<CredentialDto>> GetCredential(int id)
    {
        var userId = GetUserId();
        var credential = await _vaultService.GetCredentialByIdAsync(id, userId);

        if (credential == null)
            return NotFound();

        return Ok(credential);
    }

    /// <summary>
    /// Crea una nueva credencial
    /// </summary>
    [HttpPost("credentials")]
    public async Task<ActionResult<CredentialDto>> CreateCredential([FromBody] CreateCredentialRequest request)
    {
        var userId = GetUserId();
        
        // Verificar permiso
        var hasVaultCredentials = await HasPermissionAsync("VaultCredentials");
        var hasVaultMyCredentials = await HasPermissionAsync("VaultMyCredentials");

        if (!hasVaultCredentials && !hasVaultMyCredentials)
            return Forbid();

        // Si solo tiene VaultMyCredentials, forzar que sea privada
        if (!hasVaultCredentials)
        {
            request.IsPrivate = true;
        }

        var credential = await _vaultService.CreateCredentialAsync(
            request, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (credential == null)
            return BadRequest("Error al crear la credencial");

        return CreatedAtAction(nameof(GetCredential), new { id = credential.Id }, credential);
    }

    /// <summary>
    /// Actualiza una credencial existente
    /// </summary>
    [HttpPut("credentials/{id}")]
    public async Task<ActionResult<CredentialDto>> UpdateCredential(int id, [FromBody] UpdateCredentialRequest request)
    {
        var userId = GetUserId();

        var credential = await _vaultService.UpdateCredentialAsync(
            id, request, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (credential == null)
            return NotFound();

        return Ok(credential);
    }

    /// <summary>
    /// Elimina una credencial (soft delete)
    /// </summary>
    [HttpDelete("credentials/{id}")]
    public async Task<ActionResult> DeleteCredential(int id)
    {
        var userId = GetUserId();
        var isVaultAdmin = await HasPermissionAsync("VaultAdmin");

        var result = await _vaultService.DeleteCredentialAsync(
            id, userId, GetUserName(), GetIpAddress(), GetUserAgent(), isVaultAdmin);

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Revela el password de una credencial (Enterprise v2.1.1)
    /// Valida permisos bitmask y registra acceso obligatoriamente
    /// </summary>
    [HttpPost("credentials/{id}/reveal")]
    [ProducesResponseType(typeof(RevealPasswordResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<RevealPasswordResponse>> RevealPassword(int id)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        // Validar permiso bitmask
        if (!await _permissionBitMaskService.CanRevealAsync(userId, id))
        {
            await _accessLogService.LogDeniedAsync(id, userId, "Reveal", "NoRevealPermission");
            return StatusCode(StatusCodes.Status403Forbidden, new { reason = "NoRevealPermission", message = "No tienes permiso para revelar esta credencial" });
        }

        var result = await _vaultService.RevealPasswordAsync(
            id, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (result == null)
        {
            await _accessLogService.LogRevealAsync(id, userId, false, "CredentialNotFound");
            return NotFound();
        }

        // Registrar acceso exitoso
        await _accessLogService.LogRevealAsync(id, userId, true);

        // Headers de seguridad - no cachear respuestas con passwords
        Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
        Response.Headers.Pragma = "no-cache";
        Response.Headers["X-Content-Type-Options"] = "nosniff";

        return Ok(result);
    }

    /// <summary>
    /// Registra que el usuario copió el password al portapapeles
    /// </summary>
    [HttpPost("credentials/{id}/copied")]
    public async Task<ActionResult> RegisterPasswordCopy(int id)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        // Registrar copia en AccessLog
        await _accessLogService.LogCopyAsync(id, userId);

        await _vaultService.RegisterPasswordCopyAsync(
            id, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        return NoContent();
    }

    /// <summary>
    /// Usa una credencial sin revelar el password (Enterprise v2.1.1)
    /// El secreto nunca sale del backend
    /// </summary>
    [HttpPost("credentials/{id}/use")]
    [ProducesResponseType(typeof(UseCredentialResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UseCredentialResponse>> UseCredential(int id, [FromBody] UseCredentialRequest request)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        // Validar permiso UseWithoutReveal
        if (!await _permissionBitMaskService.CanUseAsync(userId, id))
        {
            await _accessLogService.LogDeniedAsync(id, userId, "Use", "NoUsePermission");
            return StatusCode(StatusCodes.Status403Forbidden, new { reason = "NoUsePermission", message = "No tienes permiso para usar esta credencial" });
        }

        // Registrar uso exitoso
        await _accessLogService.LogUseAsync(id, userId, request.TargetServer, request.TargetInstance, true);

        // TODO: Implementar lógica de uso real de credencial (conexión a servidor, etc.)
        // Por ahora, solo registramos el uso y devolvemos éxito

        return Ok(new UseCredentialResponse
        {
            Success = true,
            UsageId = Guid.NewGuid(),
            Message = "Credencial usada exitosamente"
        });
    }

    /// <summary>
    /// Actualiza el secreto guardado (MANUAL) - Enterprise v2.1.1
    /// IMPORTANTE: NO cambia la password en el servidor destino
    /// </summary>
    [HttpPost("credentials/{id}/update-secret")]
    [ProducesResponseType(typeof(UpdateSecretResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<UpdateSecretResponse>> UpdateSecret(int id, [FromBody] UpdateSecretRequest request)
    {
        var userId = GetUserId();
        _accessLogService.SetHttpContext(HttpContext);

        // Validar permiso UpdateSecret (bit 16)
        if (!await _permissionBitMaskService.CanUpdateSecretAsync(userId, id))
        {
            await _accessLogService.LogDeniedAsync(id, userId, "UpdateSecret", "NoUpdateSecretPermission");
            return StatusCode(StatusCodes.Status403Forbidden, new UpdateSecretResponse
            {
                Success = false,
                Reason = "NoUpdateSecretPermission",
                Message = "No tienes permiso para actualizar el secreto de esta credencial"
            });
        }

        // Actualizar el secreto usando el servicio existente de vault
        var success = await _vaultService.UpdateCredentialPasswordAsync(
            id, request.NewPassword, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!success)
        {
            return NotFound(new UpdateSecretResponse
            {
                Success = false,
                Reason = "CredentialNotFound",
                Message = "Credencial no encontrada"
            });
        }

        return Ok(new UpdateSecretResponse
        {
            Success = true,
            Message = "Contraseña actualizada en el Vault",
            UpdatedAt = LocalClockAR.Now
        });
    }

    // =============================================
    // Endpoints de Servidores
    // =============================================

    /// <summary>
    /// Agrega un servidor a una credencial
    /// </summary>
    [HttpPost("credentials/{credentialId}/servers")]
    public async Task<ActionResult<CredentialServerDto>> AddServer(int credentialId, [FromBody] AddServerToCredentialRequest request)
    {
        var userId = GetUserId();

        var server = await _vaultService.AddServerToCredentialAsync(
            credentialId, request, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (server == null)
            return BadRequest("Error al agregar el servidor");

        return Ok(server);
    }

    /// <summary>
    /// Elimina un servidor de una credencial
    /// </summary>
    [HttpDelete("credentials/{credentialId}/servers/{serverId}")]
    public async Task<ActionResult> RemoveServer(int credentialId, int serverId)
    {
        var userId = GetUserId();

        var result = await _vaultService.RemoveServerFromCredentialAsync(
            credentialId, serverId, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Obtiene la lista de servidores disponibles para asociar
    /// </summary>
    [HttpGet("servers")]
    public async Task<ActionResult<List<AvailableServerDto>>> GetAvailableServers()
    {
        var servers = await _vaultService.GetAvailableServersAsync();
        return Ok(servers);
    }

    // =============================================
    // Estadísticas y Dashboard
    // =============================================

    /// <summary>
    /// Obtiene estadísticas del Vault para el dashboard
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<VaultStatsDto>> GetStats()
    {
        var userId = GetUserId();
        var stats = await _vaultService.GetVaultStatsAsync(userId, IsAdmin());
        return Ok(stats);
    }

    /// <summary>
    /// Obtiene credenciales próximas a expirar
    /// </summary>
    [HttpGet("credentials/expiring")]
    public async Task<ActionResult<List<CredentialDto>>> GetExpiringCredentials([FromQuery] int daysAhead = 30)
    {
        var userId = GetUserId();
        var credentials = await _vaultService.GetExpiringCredentialsAsync(userId, daysAhead);
        return Ok(credentials);
    }

    // =============================================
    // Auditoría
    // =============================================

    /// <summary>
    /// Obtiene el historial de auditoría de una credencial
    /// </summary>
    [HttpGet("credentials/{id}/audit")]
    public async Task<ActionResult<List<CredentialAuditLogDto>>> GetCredentialAudit(int id)
    {
        var userId = GetUserId();
        var logs = await _vaultService.GetCredentialAuditLogAsync(id, userId);
        return Ok(logs);
    }

    /// <summary>
    /// Obtiene el historial de auditoría completo (solo admin)
    /// </summary>
    [HttpGet("audit")]
    public async Task<ActionResult<List<CredentialAuditLogDto>>> GetFullAudit([FromQuery] int? limit = 100)
    {
        // Verificar permiso de auditoría
        var hasPermission = await HasPermissionAsync("VaultAudit");
        if (!hasPermission)
            return Forbid();

        var logs = await _vaultService.GetFullAuditLogAsync(limit);
        return Ok(logs);
    }

    /// <summary>
    /// Obtiene el historial de accesos completo (Vault + Sistema) - solo admin
    /// Incluye: Reveal, Copy, Use para todas las credenciales
    /// </summary>
    [HttpGet("access-logs")]
    public async Task<ActionResult<List<CredentialAccessLogDto>>> GetAllAccessLogs([FromQuery] int? limit = 100)
    {
        // Verificar permiso de auditoría
        var hasPermission = await HasPermissionAsync("VaultAudit");
        if (!hasPermission)
            return Forbid();

        _accessLogService.SetHttpContext(HttpContext);
        var logs = await _accessLogService.GetAllAccessLogsAsync(limit ?? 100);
        return Ok(logs);
    }

    // =============================================
    // Endpoints de Grupos
    // =============================================

    /// <summary>
    /// Obtiene todos los grupos visibles para el usuario
    /// </summary>
    [HttpGet("groups")]
    public async Task<ActionResult<List<CredentialGroupDto>>> GetGroups()
    {
        var userId = GetUserId();
        var groups = await _vaultService.GetGroupsAsync(userId);
        return Ok(groups);
    }

    /// <summary>
    /// Obtiene un grupo por ID
    /// </summary>
    [HttpGet("groups/{id}")]
    public async Task<ActionResult<CredentialGroupDto>> GetGroup(int id)
    {
        var userId = GetUserId();
        var group = await _vaultService.GetGroupByIdAsync(id, userId);

        if (group == null)
            return NotFound();

        return Ok(group);
    }

    /// <summary>
    /// Crea un nuevo grupo
    /// </summary>
    [HttpPost("groups")]
    public async Task<ActionResult<CredentialGroupDto>> CreateGroup([FromBody] CreateCredentialGroupRequest request)
    {
        var hasPermission = await HasPermissionAsync("VaultGroups") || await HasPermissionAsync("VaultCredentials");
        if (!hasPermission)
            return Forbid();

        var userId = GetUserId();
        var group = await _vaultService.CreateGroupAsync(request, userId, GetUserName());

        if (group == null)
            return BadRequest("Error al crear el grupo");

        return CreatedAtAction(nameof(GetGroup), new { id = group.Id }, group);
    }

    /// <summary>
    /// Actualiza un grupo existente
    /// </summary>
    [HttpPut("groups/{id}")]
    public async Task<ActionResult<CredentialGroupDto>> UpdateGroup(int id, [FromBody] UpdateCredentialGroupRequest request)
    {
        var userId = GetUserId();
        var group = await _vaultService.UpdateGroupAsync(id, request, userId, GetUserName());

        if (group == null)
            return NotFound();

        return Ok(group);
    }

    /// <summary>
    /// Elimina un grupo (soft delete)
    /// </summary>
    [HttpDelete("groups/{id}")]
    public async Task<ActionResult> DeleteGroup(int id)
    {
        var userId = GetUserId();
        var result = await _vaultService.DeleteGroupAsync(id, userId, GetUserName());

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Obtiene los miembros de un grupo
    /// </summary>
    [HttpGet("groups/{groupId}/members")]
    public async Task<ActionResult<List<CredentialGroupMemberDto>>> GetGroupMembers(int groupId)
    {
        var userId = GetUserId();
        var group = await _vaultService.GetGroupByIdAsync(groupId, userId);

        if (group == null)
            return NotFound();

        return Ok(group.Members);
    }

    /// <summary>
    /// Agrega un miembro a un grupo
    /// </summary>
    [HttpPost("groups/{groupId}/members")]
    public async Task<ActionResult<CredentialGroupMemberDto>> AddGroupMember(int groupId, [FromBody] AddGroupMemberRequest request)
    {
        var userId = GetUserId();
        var member = await _vaultService.AddGroupMemberAsync(groupId, request, userId, GetUserName());

        if (member == null)
            return BadRequest("Error al agregar miembro");

        return Ok(member);
    }

    /// <summary>
    /// Actualiza el rol de un miembro
    /// </summary>
    [HttpPut("groups/{groupId}/members/{memberId}")]
    public async Task<ActionResult<CredentialGroupMemberDto>> UpdateGroupMember(int groupId, int memberId, [FromBody] UpdateGroupMemberRequest request)
    {
        var userId = GetUserId();
        var member = await _vaultService.UpdateGroupMemberAsync(groupId, memberId, request, userId);

        if (member == null)
            return NotFound();

        return Ok(member);
    }

    /// <summary>
    /// Elimina un miembro de un grupo
    /// </summary>
    [HttpDelete("groups/{groupId}/members/{memberId}")]
    public async Task<ActionResult> RemoveGroupMember(int groupId, int memberId)
    {
        var userId = GetUserId();
        var result = await _vaultService.RemoveGroupMemberAsync(groupId, memberId, userId, GetUserName());

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Obtiene los usuarios disponibles para agregar a grupos
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<VaultUserDto>>> GetAvailableUsers()
    {
        var users = await _vaultService.GetAvailableUsersAsync();
        return Ok(users);
    }

    // =============================================
    // Endpoints de Credenciales de Grupo
    // =============================================

    /// <summary>
    /// Obtiene las credenciales compartidas con un grupo
    /// </summary>
    [HttpGet("groups/{groupId}/credentials")]
    public async Task<ActionResult<List<CredentialDto>>> GetGroupCredentials(int groupId)
    {
        var userId = GetUserId();
        var credentials = await _vaultService.GetGroupCredentialsAsync(groupId, userId);
        
        if (credentials == null)
            return NotFound();

        return Ok(credentials);
    }

    /// <summary>
    /// Agrega una credencial a un grupo (la comparte con el grupo)
    /// </summary>
    [HttpPost("groups/{groupId}/credentials/{credentialId}")]
    public async Task<ActionResult> AddCredentialToGroup(int groupId, int credentialId, [FromBody] AddCredentialToGroupRequest? request = null)
    {
        var userId = GetUserId();
        var permission = request?.Permission ?? "View";
        
        var result = await _vaultService.AddCredentialToGroupAsync(
            groupId, credentialId, permission, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return BadRequest("Error al agregar la credencial al grupo");

        return Ok(new { message = "Credencial agregada al grupo exitosamente" });
    }

    /// <summary>
    /// Remueve una credencial de un grupo
    /// </summary>
    [HttpDelete("groups/{groupId}/credentials/{credentialId}")]
    public async Task<ActionResult> RemoveCredentialFromGroup(int groupId, int credentialId)
    {
        var userId = GetUserId();
        var result = await _vaultService.RemoveCredentialFromGroupAsync(
            groupId, credentialId, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return BadRequest("Error al remover la credencial del grupo");

        return NoContent();
    }

    /// <summary>
    /// Obtiene las credenciales propias del usuario que se pueden compartir (no privadas)
    /// </summary>
    [HttpGet("credentials/my-shareable")]
    public async Task<ActionResult<List<CredentialDto>>> GetMyShareableCredentials()
    {
        var userId = GetUserId();
        var credentials = await _vaultService.GetMyShareableCredentialsAsync(userId);
        return Ok(credentials);
    }

    // =============================================
    // Endpoints de Compartición
    // =============================================

    /// <summary>
    /// Comparte una credencial con grupos y/o usuarios
    /// </summary>
    [HttpPost("credentials/{id}/share")]
    public async Task<ActionResult> ShareCredential(int id, [FromBody] ShareCredentialRequest request)
    {
        var userId = GetUserId();
        var result = await _vaultService.ShareCredentialAsync(
            id, request, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return BadRequest("Error al compartir la credencial");

        return Ok(new { message = "Credencial compartida exitosamente" });
    }

    /// <summary>
    /// Deja de compartir una credencial con un grupo
    /// </summary>
    [HttpDelete("credentials/{id}/share/group/{groupId}")]
    public async Task<ActionResult> UnshareFromGroup(int id, int groupId)
    {
        var userId = GetUserId();
        var result = await _vaultService.UnshareFromGroupAsync(
            id, groupId, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Deja de compartir una credencial con un usuario
    /// </summary>
    [HttpDelete("credentials/{id}/share/user/{targetUserId}")]
    public async Task<ActionResult> UnshareFromUser(int id, string targetUserId)
    {
        var userId = GetUserId();
        var result = await _vaultService.UnshareFromUserAsync(
            id, targetUserId, userId, GetUserName(), GetIpAddress(), GetUserAgent());

        if (!result)
            return NotFound();

        return NoContent();
    }

    /// <summary>
    /// Obtiene las credenciales compartidas directamente con el usuario actual
    /// </summary>
    [HttpGet("credentials/shared-with-me")]
    public async Task<ActionResult<List<SharedWithMeCredentialDto>>> GetSharedWithMe()
    {
        var userId = GetUserId();
        var credentials = await _vaultService.GetCredentialsSharedWithMeAsync(userId);
        return Ok(credentials);
    }

}
