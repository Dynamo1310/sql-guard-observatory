using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(IAuthService authService, ILogger<AuthController> logger)
    {
        _authService = authService;
        _logger = logger;
    }

    /// <summary>
    /// Login de usuario
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var result = await _authService.AuthenticateAsync(request.Username, request.Password);
            
            if (result == null)
            {
                return Unauthorized(new { message = "Usuario o contraseña incorrectos, o usuario no autorizado" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en login");
            return StatusCode(500, new { message = "Error al procesar el login" });
        }
    }

    /// <summary>
    /// Login con Active Directory
    /// </summary>
    [HttpPost("login/ad")]
    [AllowAnonymous]
    public async Task<IActionResult> LoginWithAD([FromBody] ADLoginRequest request)
    {
        try
        {
            var result = await _authService.AuthenticateWithADAsync(request.Domain, request.Username, request.Password);
            
            if (result == null)
            {
                return Unauthorized(new { message = "Credenciales inválidas o usuario no autorizado en el sistema" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en login AD");
            return StatusCode(500, new { message = "Error al procesar el login con Active Directory" });
        }
    }

    /// <summary>
    /// Login con autenticación de Windows (usa credenciales del usuario logueado en Windows)
    /// </summary>
    [HttpPost("login/windows")]
    [AllowAnonymous]
    public async Task<IActionResult> LoginWithWindows()
    {
        try
        {
            // Obtener el usuario de Windows del contexto
            var windowsIdentity = User?.Identity?.Name;
            
            if (string.IsNullOrEmpty(windowsIdentity))
            {
                return Unauthorized(new { message = "No se pudo obtener la identidad de Windows. Asegúrate de estar logueado con una cuenta de dominio GSCORP." });
            }

            _logger.LogInformation("Intento de login con Windows: {Identity}", windowsIdentity);

            var result = await _authService.AuthenticateWithWindowsAsync(windowsIdentity);
            
            if (result == null)
            {
                return Unauthorized(new { message = "Usuario no autorizado. Verifica que tu usuario esté en la lista blanca del sistema." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en login Windows");
            return StatusCode(500, new { message = "Error al procesar el login con Windows Authentication" });
        }
    }

    /// <summary>
    /// Obtiene la lista de usuarios (solo admin)
    /// </summary>
    [HttpGet("users")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUsers()
    {
        try
        {
            var users = await _authService.GetUsersAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios");
            return StatusCode(500, new { message = "Error al obtener los usuarios" });
        }
    }

    /// <summary>
    /// Obtiene un usuario por ID (solo admin)
    /// </summary>
    [HttpGet("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUser(string userId)
    {
        try
        {
            var user = await _authService.GetUserByIdAsync(userId);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuario");
            return StatusCode(500, new { message = "Error al obtener el usuario" });
        }
    }

    /// <summary>
    /// Crea un nuevo usuario (solo admin)
    /// </summary>
    [HttpPost("users")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        try
        {
            var user = await _authService.CreateUserAsync(request);
            
            if (user == null)
            {
                return BadRequest(new { message = "No se pudo crear el usuario. Puede que ya exista." });
            }

            return CreatedAtAction(nameof(GetUser), new { userId = user.Id }, user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear usuario");
            return StatusCode(500, new { message = "Error al crear el usuario" });
        }
    }

    /// <summary>
    /// Actualiza un usuario (solo admin)
    /// </summary>
    [HttpPut("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateUser(string userId, [FromBody] UpdateUserRequest request)
    {
        try
        {
            var user = await _authService.UpdateUserAsync(userId, request);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar usuario");
            return StatusCode(500, new { message = "Error al actualizar el usuario" });
        }
    }

    /// <summary>
    /// Elimina un usuario (solo admin)
    /// </summary>
    [HttpDelete("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteUser(string userId)
    {
        try
        {
            var result = await _authService.DeleteUserAsync(userId);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo eliminar el usuario. Puede ser el admin principal." });
            }

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar usuario");
            return StatusCode(500, new { message = "Error al eliminar el usuario" });
        }
    }
}

