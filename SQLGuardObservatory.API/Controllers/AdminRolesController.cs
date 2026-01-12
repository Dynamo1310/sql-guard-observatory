using Microsoft.AspNetCore.Authorization;
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
/// Controlador para gestionar roles administrativos personalizables.
/// Permite crear, editar y eliminar roles con capacidades granulares.
/// </summary>
[ApiController]
[Route("api/admin/roles")]
[Authorize]
[ViewPermission("AdminRoles")]
public class AdminRolesController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IAdminAuthorizationService _authService;
    private readonly ILogger<AdminRolesController> _logger;

    public AdminRolesController(
        ApplicationDbContext context,
        IAdminAuthorizationService authService,
        ILogger<AdminRolesController> logger)
    {
        _context = context;
        _authService = authService;
        _logger = logger;
    }

    private string GetCurrentUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
    }

    /// <summary>
    /// Obtiene todos los roles administrativos
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<AdminRoleDto>>> GetRoles()
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanViewRolesAsync(userId))
        {
            return Forbid();
        }

        var roles = await _context.AdminRoles
            .Include(r => r.Capabilities)
            .Include(r => r.AssignableRoles)
            .Where(r => r.IsActive)
            .OrderByDescending(r => r.Priority)
            .ToListAsync();

        var roleDtos = roles.Select(r => new AdminRoleDto
        {
            Id = r.Id,
            Name = r.Name,
            Description = r.Description,
            Color = r.Color,
            Icon = r.Icon,
            Priority = r.Priority,
            IsSystem = r.IsSystem,
            IsActive = r.IsActive,
            UsersCount = _context.Users.Count(u => u.AdminRoleId == r.Id),
            EnabledCapabilities = r.Capabilities.Where(c => c.IsEnabled).Select(c => c.CapabilityKey).ToList(),
            AssignableRoleIds = r.AssignableRoles.Select(ar => ar.AssignableRoleId).ToList(),
            CreatedAt = r.CreatedAt.ToString("o"),
            UpdatedAt = r.UpdatedAt?.ToString("o")
        }).ToList();

        return Ok(roleDtos);
    }

    /// <summary>
    /// Obtiene un rol por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<AdminRoleDto>> GetRole(int id)
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanViewRolesAsync(userId))
        {
            return Forbid();
        }

        var role = await _context.AdminRoles
            .Include(r => r.Capabilities)
            .Include(r => r.AssignableRoles)
            .Include(r => r.CreatedByUser)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (role == null)
        {
            return NotFound(new { message = "Rol no encontrado" });
        }

        return Ok(new AdminRoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description,
            Color = role.Color,
            Icon = role.Icon,
            Priority = role.Priority,
            IsSystem = role.IsSystem,
            IsActive = role.IsActive,
            UsersCount = await _context.Users.CountAsync(u => u.AdminRoleId == role.Id),
            EnabledCapabilities = role.Capabilities.Where(c => c.IsEnabled).Select(c => c.CapabilityKey).ToList(),
            AssignableRoleIds = role.AssignableRoles.Select(ar => ar.AssignableRoleId).ToList(),
            CreatedAt = role.CreatedAt.ToString("o"),
            UpdatedAt = role.UpdatedAt?.ToString("o"),
            CreatedByUserName = role.CreatedByUser?.DisplayName
        });
    }

    /// <summary>
    /// Obtiene los roles que el usuario actual puede asignar
    /// </summary>
    [HttpGet("assignable")]
    public async Task<ActionResult<List<AdminRoleSimpleDto>>> GetAssignableRoles()
    {
        var userId = GetCurrentUserId();
        var assignableRoles = await _authService.GetAssignableRolesAsync(userId);

        var result = assignableRoles.Select(r => new AdminRoleSimpleDto
        {
            Id = r.Id,
            Name = r.Name,
            Color = r.Color,
            Icon = r.Icon,
            Priority = r.Priority
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Obtiene todas las capacidades disponibles en el sistema
    /// </summary>
    [HttpGet("capabilities")]
    public async Task<ActionResult<List<CapabilityCategoryDto>>> GetCapabilities()
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanViewRolesAsync(userId))
        {
            return Forbid();
        }

        var capabilities = CapabilityDefinitions.GetAllCapabilities();

        var result = capabilities.Select(kv => new CapabilityCategoryDto
        {
            Category = kv.Key,
            Capabilities = kv.Value.Select(c => new CapabilityDto
            {
                Key = c.Key,
                Name = c.Name,
                Description = c.Description,
                Category = kv.Key,
                IsEnabled = false
            }).ToList()
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Crea un nuevo rol administrativo
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<AdminRoleDto>> CreateRole([FromBody] CreateAdminRoleRequest request)
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanCreateRolesAsync(userId))
        {
            return Forbid();
        }

        // Verificar si puede asignar capacidades (si está intentando asignar alguna)
        if (request.EnabledCapabilities.Any() && !await _authService.CanAssignCapabilitiesAsync(userId))
        {
            return StatusCode(403, new { message = "No tiene permisos para asignar capacidades a roles" });
        }

        // Validar que no exista un rol con el mismo nombre
        if (await _context.AdminRoles.AnyAsync(r => r.Name == request.Name && r.IsActive))
        {
            return BadRequest(new { message = $"Ya existe un rol con el nombre '{request.Name}'" });
        }

        // Crear el rol
        var role = new AdminRole
        {
            Name = request.Name,
            Description = request.Description,
            Color = request.Color,
            Icon = request.Icon,
            Priority = request.Priority,
            IsSystem = false,
            IsActive = true,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow
        };

        _context.AdminRoles.Add(role);
        await _context.SaveChangesAsync();

        // Agregar capacidades (solo si tiene permiso, ya verificado arriba)
        foreach (var capKey in request.EnabledCapabilities)
        {
            _context.AdminRoleCapabilities.Add(new AdminRoleCapability
            {
                RoleId = role.Id,
                CapabilityKey = capKey,
                IsEnabled = true
            });
        }

        // Agregar roles asignables
        foreach (var assignableRoleId in request.AssignableRoleIds)
        {
            _context.AdminRoleAssignableRoles.Add(new AdminRoleAssignableRole
            {
                RoleId = role.Id,
                AssignableRoleId = assignableRoleId
            });
        }

        // IMPORTANTE: Agregar el nuevo rol como asignable para todos los SuperAdmins
        // para que puedan asignar este rol a usuarios
        var superAdminRole = await _context.AdminRoles.FirstOrDefaultAsync(r => r.Name == "SuperAdmin" && r.IsActive);
        if (superAdminRole != null)
        {
            // Agregar a SuperAdmin la capacidad de asignar este nuevo rol
            _context.AdminRoleAssignableRoles.Add(new AdminRoleAssignableRole
            {
                RoleId = superAdminRole.Id,
                AssignableRoleId = role.Id
            });
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Rol '{RoleName}' creado por usuario {UserId}", role.Name, userId);

        return CreatedAtAction(nameof(GetRole), new { id = role.Id }, new AdminRoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description,
            Color = role.Color,
            Icon = role.Icon,
            Priority = role.Priority,
            IsSystem = role.IsSystem,
            IsActive = role.IsActive,
            UsersCount = 0,
            EnabledCapabilities = request.EnabledCapabilities,
            AssignableRoleIds = request.AssignableRoleIds,
            CreatedAt = role.CreatedAt.ToString("o")
        });
    }

    /// <summary>
    /// Actualiza un rol existente
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<AdminRoleDto>> UpdateRole(int id, [FromBody] UpdateAdminRoleRequest request)
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanEditRolesAsync(userId))
        {
            return Forbid();
        }

        var role = await _context.AdminRoles
            .Include(r => r.Capabilities)
            .Include(r => r.AssignableRoles)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (role == null)
        {
            return NotFound(new { message = "Rol no encontrado" });
        }

        // Verificar si puede asignar capacidades (si está intentando modificarlas)
        if (request.EnabledCapabilities != null)
        {
            // Verificar si las capacidades están cambiando
            var currentCapabilities = role.Capabilities.Where(c => c.IsEnabled).Select(c => c.CapabilityKey).ToHashSet();
            var newCapabilities = request.EnabledCapabilities.ToHashSet();
            
            if (!currentCapabilities.SetEquals(newCapabilities))
            {
                if (!await _authService.CanAssignCapabilitiesAsync(userId))
                {
                    return StatusCode(403, new { message = "No tiene permisos para modificar las capacidades de roles" });
                }
            }
        }

        // Roles de sistema solo pueden modificar capacidades y roles asignables, no nombre/prioridad
        if (role.IsSystem)
        {
            if (request.Name != null && request.Name != role.Name)
            {
                return BadRequest(new { message = "No se puede cambiar el nombre de un rol de sistema" });
            }
            if (request.Priority != null && request.Priority != role.Priority)
            {
                return BadRequest(new { message = "No se puede cambiar la prioridad de un rol de sistema" });
            }
        }

        // Validar nombre único
        if (request.Name != null && request.Name != role.Name)
        {
            if (await _context.AdminRoles.AnyAsync(r => r.Name == request.Name && r.IsActive && r.Id != id))
            {
                return BadRequest(new { message = $"Ya existe un rol con el nombre '{request.Name}'" });
            }
            role.Name = request.Name;
        }

        // Actualizar campos básicos
        if (request.Description != null) role.Description = request.Description;
        if (request.Color != null) role.Color = request.Color;
        if (request.Icon != null) role.Icon = request.Icon;
        if (request.Priority != null) role.Priority = request.Priority.Value;
        if (request.IsActive != null) role.IsActive = request.IsActive.Value;

        role.UpdatedAt = DateTime.UtcNow;
        role.UpdatedByUserId = userId;

        // Actualizar capacidades si se proporcionaron (permiso ya verificado arriba)
        if (request.EnabledCapabilities != null)
        {
            // Eliminar capacidades existentes
            _context.AdminRoleCapabilities.RemoveRange(role.Capabilities);

            // Agregar todas las capacidades (habilitadas y deshabilitadas)
            var allCapabilityKeys = CapabilityDefinitions.GetAllCapabilityKeys();
            foreach (var capKey in allCapabilityKeys)
            {
                _context.AdminRoleCapabilities.Add(new AdminRoleCapability
                {
                    RoleId = role.Id,
                    CapabilityKey = capKey,
                    IsEnabled = request.EnabledCapabilities.Contains(capKey)
                });
            }
        }

        // Actualizar roles asignables si se proporcionaron
        if (request.AssignableRoleIds != null)
        {
            _context.AdminRoleAssignableRoles.RemoveRange(role.AssignableRoles);

            foreach (var assignableRoleId in request.AssignableRoleIds)
            {
                _context.AdminRoleAssignableRoles.Add(new AdminRoleAssignableRole
                {
                    RoleId = role.Id,
                    AssignableRoleId = assignableRoleId
                });
            }
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Rol '{RoleName}' actualizado por usuario {UserId}", role.Name, userId);

        // Recargar para obtener datos actualizados
        await _context.Entry(role).Collection(r => r.Capabilities).LoadAsync();
        await _context.Entry(role).Collection(r => r.AssignableRoles).LoadAsync();

        return Ok(new AdminRoleDto
        {
            Id = role.Id,
            Name = role.Name,
            Description = role.Description,
            Color = role.Color,
            Icon = role.Icon,
            Priority = role.Priority,
            IsSystem = role.IsSystem,
            IsActive = role.IsActive,
            UsersCount = await _context.Users.CountAsync(u => u.AdminRoleId == role.Id),
            EnabledCapabilities = role.Capabilities.Where(c => c.IsEnabled).Select(c => c.CapabilityKey).ToList(),
            AssignableRoleIds = role.AssignableRoles.Select(ar => ar.AssignableRoleId).ToList(),
            CreatedAt = role.CreatedAt.ToString("o"),
            UpdatedAt = role.UpdatedAt?.ToString("o")
        });
    }

    /// <summary>
    /// Elimina un rol (soft delete)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteRole(int id)
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanDeleteRolesAsync(userId))
        {
            return Forbid();
        }

        var role = await _context.AdminRoles.FindAsync(id);
        if (role == null)
        {
            return NotFound(new { message = "Rol no encontrado" });
        }

        if (role.IsSystem)
        {
            return BadRequest(new { message = "No se puede eliminar un rol de sistema" });
        }

        // Verificar si hay usuarios con este rol
        var usersWithRole = await _context.Users.CountAsync(u => u.AdminRoleId == id);
        if (usersWithRole > 0)
        {
            return BadRequest(new { message = $"No se puede eliminar el rol porque hay {usersWithRole} usuario(s) asignado(s) a él" });
        }

        // Soft delete
        role.IsActive = false;
        role.UpdatedAt = DateTime.UtcNow;
        role.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Rol '{RoleName}' eliminado por usuario {UserId}", role.Name, userId);

        return Ok(new { message = "Rol eliminado exitosamente" });
    }

    /// <summary>
    /// Obtiene la información de autorización del usuario actual.
    /// Disponible para todos los usuarios autenticados.
    /// </summary>
    [HttpGet("my-authorization")]
    [BypassViewPermission]
    public async Task<ActionResult<UserAuthorizationDto>> GetMyAuthorization()
    {
        var userId = GetCurrentUserId();
        var auth = await _authService.GetUserAuthorizationAsync(userId);
        return Ok(auth);
    }

    /// <summary>
    /// Obtiene los usuarios asignados a un rol
    /// </summary>
    [HttpGet("{id}/users")]
    public async Task<ActionResult> GetRoleUsers(int id)
    {
        var userId = GetCurrentUserId();
        if (!await _authService.CanViewRolesAsync(userId))
        {
            return Forbid();
        }

        var users = await _context.Users
            .Where(u => u.AdminRoleId == id)
            .Select(u => new
            {
                u.Id,
                u.UserName,
                u.DisplayName,
                u.Email,
                u.IsActive
            })
            .ToListAsync();

        return Ok(users);
    }
}

