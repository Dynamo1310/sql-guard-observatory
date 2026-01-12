using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controlador para gestionar asignaciones de grupos a usuarios Admin.
/// Solo SuperAdmin puede crear/modificar/eliminar asignaciones.
/// </summary>
[ApiController]
[Route("api/admin-assignments")]
[Authorize]
public class AdminAssignmentsController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IAdminAuthorizationService _authService;
    private readonly ILogger<AdminAssignmentsController> _logger;

    public AdminAssignmentsController(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        IAdminAuthorizationService authService,
        ILogger<AdminAssignmentsController> logger)
    {
        _context = context;
        _userManager = userManager;
        _authService = authService;
        _logger = logger;
    }

    private string GetCurrentUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
    }

    #region Información de Autorización

    /// <summary>
    /// Obtiene la información de autorización del usuario actual
    /// </summary>
    [HttpGet("my-authorization")]
    public async Task<IActionResult> GetMyAuthorization()
    {
        try
        {
            var userId = GetCurrentUserId();
            var authInfo = await _authService.GetUserAuthorizationInfoAsync(userId);
            return Ok(authInfo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener información de autorización");
            return StatusCode(500, new { message = "Error al obtener información de autorización" });
        }
    }

    #endregion

    #region Asignaciones por Usuario

    /// <summary>
    /// Obtiene los grupos asignados a un usuario Admin específico
    /// </summary>
    [HttpGet("user/{userId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetUserAssignments(string userId)
    {
        try
        {
            var assignments = await _authService.GetUserAssignmentsAsync(userId);
            
            if (assignments == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            return Ok(assignments);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener asignaciones del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al obtener asignaciones" });
        }
    }

    /// <summary>
    /// Actualiza los grupos asignados a un usuario Admin.
    /// Reemplaza todas las asignaciones existentes.
    /// Solo SuperAdmin puede hacer esto.
    /// </summary>
    [HttpPut("user/{userId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> UpdateUserAssignments(string userId, [FromBody] AssignGroupsToUserRequest request)
    {
        try
        {
            // Verificar que el usuario existe y es Admin
            var targetUser = await _context.Users
                .Include(u => u.AdminRole)
                .FirstOrDefaultAsync(u => u.Id == userId);
            if (targetUser == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            var targetRole = targetUser.AdminRole?.Name ?? "Reader";
            if (targetRole != "Admin")
            {
                return BadRequest(new { message = "Solo se pueden asignar grupos a usuarios con rol Admin" });
            }

            var currentUserId = GetCurrentUserId();

            // Eliminar asignaciones existentes
            var existingAssignments = await _context.AdminGroupAssignments
                .Where(a => a.UserId == userId)
                .ToListAsync();
            
            _context.AdminGroupAssignments.RemoveRange(existingAssignments);

            // Crear nuevas asignaciones
            foreach (var assignment in request.Assignments)
            {
                // Verificar que el grupo existe
                var groupExists = await _context.SecurityGroups
                    .AnyAsync(g => g.Id == assignment.GroupId && !g.IsDeleted);
                
                if (!groupExists) continue;

                var newAssignment = new AdminGroupAssignment
                {
                    UserId = userId,
                    GroupId = assignment.GroupId,
                    CanEdit = assignment.CanEdit,
                    CanDelete = assignment.CanDelete,
                    CanManageMembers = assignment.CanManageMembers,
                    CanManagePermissions = assignment.CanManagePermissions,
                    AssignedByUserId = currentUserId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.AdminGroupAssignments.Add(newAssignment);
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation("Asignaciones actualizadas para usuario {UserId} por {CurrentUser}. {Count} grupos asignados.", 
                userId, User.Identity?.Name, request.Assignments.Count);

            return Ok(new { message = "Asignaciones actualizadas exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar asignaciones del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al actualizar asignaciones" });
        }
    }

    /// <summary>
    /// Agrega una asignación de grupo a un usuario Admin
    /// </summary>
    [HttpPost("user/{userId}/group/{groupId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> AddGroupAssignment(string userId, int groupId, [FromBody] GroupAssignmentRequest? request = null)
    {
        try
        {
            // Verificar que el usuario existe y es Admin
            var targetUser = await _context.Users
                .Include(u => u.AdminRole)
                .FirstOrDefaultAsync(u => u.Id == userId);
            if (targetUser == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            var targetRole = targetUser.AdminRole?.Name ?? "Reader";
            if (targetRole != "Admin")
            {
                return BadRequest(new { message = "Solo se pueden asignar grupos a usuarios con rol Admin" });
            }

            // Verificar que el grupo existe
            var groupExists = await _context.SecurityGroups
                .AnyAsync(g => g.Id == groupId && !g.IsDeleted);
            
            if (!groupExists)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            // Verificar si ya existe la asignación
            var existingAssignment = await _context.AdminGroupAssignments
                .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);
            
            if (existingAssignment != null)
            {
                return BadRequest(new { message = "El usuario ya tiene asignado este grupo" });
            }

            var currentUserId = GetCurrentUserId();

            var newAssignment = new AdminGroupAssignment
            {
                UserId = userId,
                GroupId = groupId,
                CanEdit = request?.CanEdit ?? true,
                CanDelete = request?.CanDelete ?? false,
                CanManageMembers = request?.CanManageMembers ?? true,
                CanManagePermissions = request?.CanManagePermissions ?? true,
                AssignedByUserId = currentUserId,
                CreatedAt = DateTime.UtcNow
            };

            _context.AdminGroupAssignments.Add(newAssignment);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Grupo {GroupId} asignado a usuario {UserId} por {CurrentUser}", 
                groupId, userId, User.Identity?.Name);

            return Ok(new { message = "Grupo asignado exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar asignación del grupo {GroupId} al usuario {UserId}", groupId, userId);
            return StatusCode(500, new { message = "Error al agregar asignación" });
        }
    }

    /// <summary>
    /// Elimina una asignación de grupo de un usuario Admin
    /// </summary>
    [HttpDelete("user/{userId}/group/{groupId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> RemoveGroupAssignment(string userId, int groupId)
    {
        try
        {
            var assignment = await _context.AdminGroupAssignments
                .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);
            
            if (assignment == null)
            {
                return NotFound(new { message = "Asignación no encontrada" });
            }

            _context.AdminGroupAssignments.Remove(assignment);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Asignación del grupo {GroupId} removida del usuario {UserId} por {CurrentUser}", 
                groupId, userId, User.Identity?.Name);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al remover asignación del grupo {GroupId} del usuario {UserId}", groupId, userId);
            return StatusCode(500, new { message = "Error al remover asignación" });
        }
    }

    #endregion

    #region Asignaciones por Grupo

    /// <summary>
    /// Obtiene los administradores de un grupo específico
    /// </summary>
    [HttpGet("group/{groupId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetGroupAdmins(int groupId)
    {
        try
        {
            var admins = await _authService.GetGroupAdminsAsync(groupId);
            
            if (admins == null)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            return Ok(admins);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener administradores del grupo {GroupId}", groupId);
            return StatusCode(500, new { message = "Error al obtener administradores" });
        }
    }

    /// <summary>
    /// Actualiza los administradores de un grupo.
    /// Reemplaza todas las asignaciones existentes.
    /// Solo SuperAdmin puede hacer esto.
    /// </summary>
    [HttpPut("group/{groupId}")]
    [RequireSuperAdmin]
    public async Task<IActionResult> UpdateGroupAdmins(int groupId, [FromBody] AssignAdminsToGroupRequest request)
    {
        try
        {
            // Verificar que el grupo existe
            var groupExists = await _context.SecurityGroups
                .AnyAsync(g => g.Id == groupId && !g.IsDeleted);
            
            if (!groupExists)
            {
                return NotFound(new { message = "Grupo no encontrado" });
            }

            var currentUserId = GetCurrentUserId();

            // Eliminar asignaciones existentes para este grupo
            var existingAssignments = await _context.AdminGroupAssignments
                .Where(a => a.GroupId == groupId)
                .ToListAsync();
            
            _context.AdminGroupAssignments.RemoveRange(existingAssignments);

            // Crear nuevas asignaciones
            foreach (var admin in request.Admins)
            {
                // Verificar que el usuario existe y es Admin
                var targetUser = await _context.Users
                    .Include(u => u.AdminRole)
                    .FirstOrDefaultAsync(u => u.Id == admin.UserId);
                if (targetUser == null) continue;

                var targetRole = targetUser.AdminRole?.Name ?? "Reader";
                if (targetRole != "Admin") continue;

                var newAssignment = new AdminGroupAssignment
                {
                    UserId = admin.UserId,
                    GroupId = groupId,
                    CanEdit = admin.CanEdit,
                    CanDelete = admin.CanDelete,
                    CanManageMembers = admin.CanManageMembers,
                    CanManagePermissions = admin.CanManagePermissions,
                    AssignedByUserId = currentUserId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.AdminGroupAssignments.Add(newAssignment);
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation("Administradores actualizados para grupo {GroupId} por {CurrentUser}. {Count} admins asignados.", 
                groupId, User.Identity?.Name, request.Admins.Count);

            return Ok(new { message = "Administradores actualizados exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar administradores del grupo {GroupId}", groupId);
            return StatusCode(500, new { message = "Error al actualizar administradores" });
        }
    }

    #endregion

    #region Usuarios Disponibles

    /// <summary>
    /// Obtiene usuarios con rol Admin disponibles para asignar a un grupo
    /// </summary>
    [HttpGet("group/{groupId}/available-admins")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetAvailableAdmins(int groupId)
    {
        try
        {
            // Obtener usuarios con rol Admin
            var adminsRole = await _userManager.GetUsersInRoleAsync("Admin");
            var adminUserIds = adminsRole.Select(u => u.Id).ToList();

            // Obtener asignaciones existentes para este grupo
            var existingAssignmentUserIds = await _context.AdminGroupAssignments
                .Where(a => a.GroupId == groupId)
                .Select(a => a.UserId)
                .ToListAsync();

            // Construir lista de admins disponibles
            var availableAdmins = adminsRole
                .Where(u => u.IsActive)
                .Select(u => new AvailableAdminDto
                {
                    UserId = u.Id,
                    DisplayName = u.DisplayName ?? u.UserName ?? string.Empty,
                    Email = u.Email,
                    Role = "Admin",
                    IsAlreadyAssigned = existingAssignmentUserIds.Contains(u.Id)
                })
                .OrderBy(a => a.DisplayName)
                .ToList();

            return Ok(availableAdmins);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener admins disponibles para grupo {GroupId}", groupId);
            return StatusCode(500, new { message = "Error al obtener admins disponibles" });
        }
    }

    /// <summary>
    /// Obtiene grupos disponibles para asignar a un usuario Admin
    /// </summary>
    [HttpGet("user/{userId}/available-groups")]
    [RequireSuperAdmin]
    public async Task<IActionResult> GetAvailableGroups(string userId)
    {
        try
        {
            // Obtener grupos activos
            var allGroups = await _context.SecurityGroups
                .Where(g => !g.IsDeleted)
                .Select(g => new { g.Id, g.Name, g.Color, g.Icon })
                .ToListAsync();

            // Obtener asignaciones existentes para este usuario
            var existingAssignmentGroupIds = await _context.AdminGroupAssignments
                .Where(a => a.UserId == userId)
                .Select(a => a.GroupId)
                .ToListAsync();

            // Construir lista de grupos con estado de asignación
            var availableGroups = allGroups
                .Select(g => new
                {
                    GroupId = g.Id,
                    GroupName = g.Name,
                    GroupColor = g.Color,
                    GroupIcon = g.Icon,
                    IsAlreadyAssigned = existingAssignmentGroupIds.Contains(g.Id)
                })
                .OrderBy(g => g.GroupName)
                .ToList();

            return Ok(availableGroups);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener grupos disponibles para usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al obtener grupos disponibles" });
        }
    }

    #endregion

    #region Verificaciones de Permisos

    /// <summary>
    /// Verifica si el usuario actual puede gestionar un grupo específico
    /// </summary>
    [HttpGet("can-manage-group/{groupId}")]
    public async Task<IActionResult> CanManageGroup(int groupId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var canManage = await _authService.CanManageGroupAsync(userId, groupId);
            var canEdit = await _authService.CanEditGroupAsync(userId, groupId);
            var canDelete = await _authService.CanDeleteGroupAsync(userId, groupId);
            var canManageMembers = await _authService.CanManageGroupMembersAsync(userId, groupId);
            var canManagePermissions = await _authService.CanManageGroupPermissionsAsync(userId, groupId);

            return Ok(new
            {
                CanManage = canManage,
                CanEdit = canEdit,
                CanDelete = canDelete,
                CanManageMembers = canManageMembers,
                CanManagePermissions = canManagePermissions
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al verificar permisos para grupo {GroupId}", groupId);
            return StatusCode(500, new { message = "Error al verificar permisos" });
        }
    }

    /// <summary>
    /// Verifica si el usuario actual puede gestionar a otro usuario
    /// </summary>
    [HttpGet("can-modify-user/{targetUserId}")]
    public async Task<IActionResult> CanModifyUser(string targetUserId)
    {
        try
        {
            var userId = GetCurrentUserId();
            var canModify = await _authService.CanModifyUserAsync(userId, targetUserId);

            return Ok(new { CanModify = canModify });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al verificar permisos para usuario {TargetUserId}", targetUserId);
            return StatusCode(500, new { message = "Error al verificar permisos" });
        }
    }

    #endregion
}

