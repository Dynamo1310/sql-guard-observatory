using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class GroupsController : ControllerBase
{
    private readonly IGroupService _groupService;
    private readonly IAdminAuthorizationService _authService;
    private readonly ILogger<GroupsController> _logger;

    public GroupsController(
        IGroupService groupService, 
        IAdminAuthorizationService authService,
        ILogger<GroupsController> logger)
    {
        _groupService = groupService;
        _authService = authService;
        _logger = logger;
    }

    private string GetCurrentUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
    }

    #region CRUD de Grupos

    /// <summary>
    /// Obtiene grupos de seguridad.
    /// SuperAdmin: ve todos los grupos.
    /// Admin: ve solo los grupos asignados.
    /// Reader: ve todos (si tiene permiso de vista) pero sin opciones de modificación.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetGroups()
    {
        try
        {
            var userId = GetCurrentUserId();
            var role = await _authService.GetUserRoleAsync(userId);
            
            var allGroups = await _groupService.GetAllGroupsAsync();
            
            // Si es Admin, filtrar solo los grupos asignados
            if (role == "Admin")
            {
                var manageableGroupIds = await _authService.GetManageableGroupIdsAsync(userId);
                allGroups = allGroups.Where(g => manageableGroupIds.Contains(g.Id)).ToList();
            }
            
            return Ok(allGroups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener grupos");
            return StatusCode(500, new { message = "Error al obtener los grupos" });
        }
    }

    /// <summary>
    /// Obtiene un grupo por ID con todos sus detalles (miembros, permisos, config AD)
    /// </summary>
    [HttpGet("{id}")]
    public async Task<IActionResult> GetGroup(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var role = await _authService.GetUserRoleAsync(userId);
            
            // Si es Admin, verificar que tenga acceso al grupo
            if (role == "Admin")
            {
                var canManage = await _authService.CanManageGroupAsync(userId, id);
                if (!canManage)
                {
                    return Forbid();
                }
            }
            
            var group = await _groupService.GetGroupByIdAsync(id);
            
            if (group == null)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            return Ok(group);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al obtener el grupo" });
        }
    }

    /// <summary>
    /// Crea un nuevo grupo de seguridad.
    /// Requiere capacidad Groups.Create.
    /// </summary>
    [HttpPost]
    [RequireCapability("Groups.Create")]
    public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            // Verificar que es SuperAdmin
            if (!await _authService.CanCreateGroupsAsync(userId))
            {
                return Forbid();
            }
            
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { message = "El nombre del grupo es requerido" });
            }

            var group = await _groupService.CreateGroupAsync(request, userId);
            
            if (group == null)
            {
                return BadRequest(new { message = "No se pudo crear el grupo. El nombre puede estar duplicado." });
            }

            _logger.LogInformation("Grupo '{Name}' creado por {User}", request.Name, User.Identity?.Name);
            return CreatedAtAction(nameof(GetGroup), new { id = group.Id }, group);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear grupo");
            return StatusCode(500, new { message = "Error al crear el grupo" });
        }
    }

    /// <summary>
    /// Actualiza un grupo existente.
    /// SuperAdmin: puede editar cualquier grupo.
    /// Admin: solo puede editar grupos asignados con permiso CanEdit.
    /// Reader: no puede editar.
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateGroup(int id, [FromBody] UpdateGroupRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            // Verificar permisos de edición
            if (!await _authService.CanEditGroupAsync(userId, id))
            {
                return Forbid();
            }
            
            if (string.IsNullOrWhiteSpace(request.Name))
            {
                return BadRequest(new { message = "El nombre del grupo es requerido" });
            }

            var group = await _groupService.UpdateGroupAsync(id, request, userId);
            
            if (group == null)
            {
                return NotFound(new { message = "Grupo no encontrado o nombre duplicado" });
            }

            _logger.LogInformation("Grupo {GroupId} actualizado por {User}", id, User.Identity?.Name);
            return Ok(group);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al actualizar el grupo" });
        }
    }

    /// <summary>
    /// Elimina un grupo (soft delete).
    /// SuperAdmin: puede eliminar cualquier grupo.
    /// Admin: solo puede eliminar grupos asignados con permiso CanDelete.
    /// Reader: no puede eliminar.
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteGroup(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            // Verificar permisos de eliminación
            if (!await _authService.CanDeleteGroupAsync(userId, id))
            {
                return Forbid();
            }
            
            var result = await _groupService.DeleteGroupAsync(id);
            
            if (!result)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            _logger.LogInformation("Grupo {GroupId} eliminado por {User}", id, User.Identity?.Name);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al eliminar el grupo" });
        }
    }

    #endregion

    #region Miembros del Grupo

    /// <summary>
    /// Obtiene los miembros de un grupo
    /// </summary>
    [HttpGet("{id}/members")]
    public async Task<IActionResult> GetMembers(int id)
    {
        try
        {
            var members = await _groupService.GetGroupMembersAsync(id);
            return Ok(members);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener miembros del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al obtener los miembros" });
        }
    }

    /// <summary>
    /// Agrega miembros a un grupo.
    /// Requiere permiso CanManageMembers.
    /// </summary>
    [HttpPost("{id}/members")]
    public async Task<IActionResult> AddMembers(int id, [FromBody] AddMembersRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            // Verificar permisos de gestión de miembros
            if (!await _authService.CanManageGroupMembersAsync(userId, id))
            {
                return Forbid();
            }
            
            if (request.UserIds == null || !request.UserIds.Any())
            {
                return BadRequest(new { message = "Debe especificar al menos un usuario" });
            }

            var result = await _groupService.AddMembersAsync(id, request.UserIds, userId);
            
            if (!result)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            _logger.LogInformation("{Count} miembros agregados al grupo {GroupId} por {User}", 
                request.UserIds.Count, id, User.Identity?.Name);
            return Ok(new { message = "Miembros agregados exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar miembros al grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al agregar miembros" });
        }
    }

    /// <summary>
    /// Remueve un miembro del grupo.
    /// Requiere permiso CanManageMembers.
    /// </summary>
    [HttpDelete("{id}/members/{userId}")]
    public async Task<IActionResult> RemoveMember(int id, string userId)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar permisos de gestión de miembros
            if (!await _authService.CanManageGroupMembersAsync(currentUserId, id))
            {
                return Forbid();
            }
            
            var result = await _groupService.RemoveMemberAsync(id, userId);
            
            if (!result)
            {
                return NotFound(new { message = "Membresía no encontrada" });
            }

            _logger.LogInformation("Usuario {UserId} removido del grupo {GroupId} por {User}", 
                userId, id, User.Identity?.Name);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al remover miembro {UserId} del grupo {GroupId}", userId, id);
            return StatusCode(500, new { message = "Error al remover miembro" });
        }
    }

    /// <summary>
    /// Obtiene usuarios disponibles para agregar al grupo
    /// </summary>
    [HttpGet("{id}/available-users")]
    public async Task<IActionResult> GetAvailableUsers(int id)
    {
        try
        {
            var users = await _groupService.GetAvailableUsersForGroupAsync(id);
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios disponibles para grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al obtener usuarios disponibles" });
        }
    }

    #endregion

    #region Permisos del Grupo

    /// <summary>
    /// Obtiene los permisos de un grupo
    /// </summary>
    [HttpGet("{id}/permissions")]
    public async Task<IActionResult> GetPermissions(int id)
    {
        try
        {
            var permissions = await _groupService.GetGroupPermissionsAsync(id);
            
            if (permissions == null)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            return Ok(permissions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener permisos del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al obtener permisos" });
        }
    }

    /// <summary>
    /// Actualiza los permisos de un grupo.
    /// Requiere permiso CanManagePermissions.
    /// </summary>
    [HttpPut("{id}/permissions")]
    public async Task<IActionResult> UpdatePermissions(int id, [FromBody] UpdateGroupPermissionsRequest request)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            // Verificar permisos de gestión de permisos
            if (!await _authService.CanManageGroupPermissionsAsync(userId, id))
            {
                return Forbid();
            }
            
            var result = await _groupService.UpdateGroupPermissionsAsync(id, request.Permissions);
            
            if (!result)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            _logger.LogInformation("Permisos del grupo {GroupId} actualizados por {User}", id, User.Identity?.Name);
            return Ok(new { message = "Permisos actualizados exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar permisos del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al actualizar permisos" });
        }
    }

    #endregion

    #region Sincronización con Active Directory

    /// <summary>
    /// Obtiene la configuración de sincronización con AD
    /// </summary>
    [HttpGet("{id}/ad-sync")]
    public async Task<IActionResult> GetADSyncConfig(int id)
    {
        try
        {
            var config = await _groupService.GetADSyncConfigAsync(id);
            
            if (config == null)
            {
                return Ok(new { configured = false });
            }

            return Ok(new { configured = true, config });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener config AD sync del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al obtener configuración de sincronización" });
        }
    }

    /// <summary>
    /// Configura la sincronización con AD
    /// </summary>
    [HttpPut("{id}/ad-sync")]
    public async Task<IActionResult> UpdateADSyncConfig(int id, [FromBody] UpdateADSyncConfigRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.ADGroupName))
            {
                return BadRequest(new { message = "El nombre del grupo AD es requerido" });
            }

            var userId = GetCurrentUserId();
            var result = await _groupService.UpdateADSyncConfigAsync(id, request, userId);
            
            if (!result)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            _logger.LogInformation("Config AD sync del grupo {GroupId} actualizada por {User}", id, User.Identity?.Name);
            return Ok(new { message = "Configuración actualizada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar config AD sync del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al actualizar configuración" });
        }
    }

    /// <summary>
    /// Ejecuta la sincronización con AD manualmente
    /// </summary>
    [HttpPost("{id}/ad-sync/execute")]
    public async Task<IActionResult> ExecuteADSync(int id)
    {
        try
        {
            var userId = GetCurrentUserId();
            var result = await _groupService.ExecuteADSyncAsync(id, userId);
            
            _logger.LogInformation("Sincronización AD ejecutada para grupo {GroupId} por {User}: {Message}", 
                id, User.Identity?.Name, result.Message);

            if (result.Success)
            {
                return Ok(result);
            }
            else
            {
                return BadRequest(result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al ejecutar sync AD del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al ejecutar sincronización" });
        }
    }

    /// <summary>
    /// Elimina la configuración de sincronización con AD
    /// </summary>
    [HttpDelete("{id}/ad-sync")]
    public async Task<IActionResult> RemoveADSyncConfig(int id)
    {
        try
        {
            var result = await _groupService.RemoveADSyncConfigAsync(id);
            
            if (!result)
            {
                return NotFound(new { message = "Configuración no encontrada" });
            }

            _logger.LogInformation("Config AD sync removida del grupo {GroupId} por {User}", id, User.Identity?.Name);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al remover config AD sync del grupo {GroupId}", id);
            return StatusCode(500, new { message = "Error al remover configuración" });
        }
    }

    #endregion

    #region Utilidades

    /// <summary>
    /// Obtiene todos los usuarios con sus grupos (para la página de usuarios)
    /// </summary>
    [HttpGet("users-with-groups")]
    [ViewPermission("AdminUsers")]
    public async Task<IActionResult> GetUsersWithGroups()
    {
        try
        {
            var users = await _groupService.GetUsersWithGroupsAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios con grupos");
            return StatusCode(500, new { message = "Error al obtener usuarios con grupos" });
        }
    }

    /// <summary>
    /// Obtiene los grupos del usuario actual
    /// </summary>
    [HttpGet("my-groups")]
    [Authorize] // Disponible para todos los usuarios autenticados
    public async Task<IActionResult> GetMyGroups()
    {
        try
        {
            var userId = GetCurrentUserId();
            var groups = await _groupService.GetUserGroupsAsync(userId);
            return Ok(groups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener grupos del usuario actual");
            return StatusCode(500, new { message = "Error al obtener grupos" });
        }
    }

    #endregion
}

