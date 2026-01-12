using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.Security.Claims;
using System.Text.Json;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar servidores habilitados para operaciones controladas.
/// Solo accesible para SuperAdmin o usuarios con IsOnCallEscalation = true.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
[ViewPermission("OperationsConfig")]
public class OperationalServersController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<OperationalServersController> _logger;
    private readonly HttpClient _httpClient;
    
    private const string INVENTORY_URL = "http://asprbm-nov-01/InventoryDBA/inventario/";

    public OperationalServersController(
        ApplicationDbContext context,
        ILogger<OperationalServersController> logger,
        IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _logger = logger;
        _httpClient = httpClientFactory.CreateClient();
    }

    /// <summary>
    /// Verifica si el usuario tiene permiso para acceder a la configuración de operaciones
    /// </summary>
    private async Task<bool> HasOperationsConfigPermission()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId)) return false;

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return false;

        // SuperAdmin siempre tiene acceso
        var roles = User.FindAll(ClaimTypes.Role).Select(c => c.Value).ToList();
        if (roles.Contains("SuperAdmin")) return true;

        // O usuarios con IsOnCallEscalation
        return user.IsOnCallEscalation;
    }

    /// <summary>
    /// Obtiene la lista de servidores operacionales configurados
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<OperationalServerDto>>> GetOperationalServers()
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var servers = await _context.OperationalServers
                .OrderBy(s => s.ServerName)
                .Select(s => new OperationalServerDto
                {
                    Id = s.Id,
                    ServerName = s.ServerName,
                    InstanceName = s.InstanceName,
                    Description = s.Description,
                    Ambiente = s.Ambiente,
                    IsFromInventory = s.IsFromInventory,
                    Enabled = s.Enabled,
                    EnabledForRestart = s.EnabledForRestart,
                    EnabledForFailover = s.EnabledForFailover,
                    EnabledForPatching = s.EnabledForPatching,
                    CreatedAt = s.CreatedAt,
                    CreatedByUserName = s.CreatedByUserName,
                    UpdatedAt = s.UpdatedAt,
                    UpdatedByUserName = s.UpdatedByUserName,
                    Notes = s.Notes
                })
                .ToListAsync();

            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo servidores operacionales");
            return StatusCode(500, new { message = "Error obteniendo servidores operacionales" });
        }
    }

    /// <summary>
    /// Obtiene servidores habilitados para operaciones de reinicio (para usar en ServerRestart)
    /// </summary>
    [HttpGet("enabled/restart")]
    public async Task<ActionResult<List<string>>> GetEnabledForRestart()
    {
        try
        {
            var servers = await _context.OperationalServers
                .Where(s => s.Enabled && s.EnabledForRestart)
                .Select(s => s.ServerName)
                .ToListAsync();

            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo servidores habilitados para reinicio");
            return StatusCode(500, new { message = "Error obteniendo servidores habilitados" });
        }
    }

    /// <summary>
    /// Obtiene los servidores del inventario disponibles para agregar
    /// </summary>
    [HttpGet("inventory")]
    public async Task<ActionResult<List<InventoryServerInfoDto>>> GetInventoryServers()
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var response = await _httpClient.GetAsync(INVENTORY_URL);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var inventory = JsonSerializer.Deserialize<List<InventoryServerData>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (inventory == null)
                return Ok(new List<InventoryServerInfoDto>());

            // Obtener servidores ya agregados
            var existingServers = await _context.OperationalServers
                .Select(s => s.ServerName.ToLower())
                .ToListAsync();

            var result = inventory
                .Where(s => !string.IsNullOrEmpty(s.ServerName))
                // Excluir servidores de AWS
                .Where(s => !s.hostingSite.Equals("AWS", StringComparison.OrdinalIgnoreCase))
                // Excluir servidores con DMZ en el nombre
                .Where(s => !s.ServerName.Contains("DMZ", StringComparison.OrdinalIgnoreCase) &&
                           !s.NombreInstancia.Contains("DMZ", StringComparison.OrdinalIgnoreCase))
                .Select(s => new InventoryServerInfoDto
                {
                    ServerName = s.ServerName,
                    InstanceName = s.NombreInstancia,
                    Ambiente = s.ambiente,
                    MajorVersion = s.MajorVersion,
                    Edition = s.Edition,
                    IsAlwaysOn = !string.IsNullOrEmpty(s.AlwaysOn) &&
                                s.AlwaysOn.Equals("Enabled", StringComparison.OrdinalIgnoreCase),
                    AlreadyAdded = existingServers.Contains(s.ServerName.ToLower())
                })
                .OrderBy(s => s.ServerName)
                .ToList();

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo servidores del inventario");
            return StatusCode(500, new { message = "Error obteniendo servidores del inventario", error = ex.Message });
        }
    }

    /// <summary>
    /// Agrega un nuevo servidor operacional
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<OperationalServerDto>> CreateOperationalServer([FromBody] CreateOperationalServerRequest request)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                          User.FindFirst("name")?.Value ?? 
                          User.Identity?.Name ?? "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            // Verificar si ya existe
            var exists = await _context.OperationalServers
                .AnyAsync(s => s.ServerName.ToLower() == request.ServerName.ToLower());

            if (exists)
            {
                return BadRequest(new { message = $"El servidor '{request.ServerName}' ya está configurado" });
            }

            var server = new OperationalServer
            {
                ServerName = request.ServerName,
                InstanceName = request.InstanceName,
                Description = request.Description,
                Ambiente = request.Ambiente,
                IsFromInventory = request.IsFromInventory,
                Enabled = true,
                EnabledForRestart = request.EnabledForRestart,
                EnabledForFailover = request.EnabledForFailover,
                EnabledForPatching = request.EnabledForPatching,
                CreatedAt = DateTime.Now,
                CreatedByUserId = userId,
                CreatedByUserName = userName,
                Notes = request.Notes
            };

            _context.OperationalServers.Add(server);

            // Registrar auditoría
            var audit = new OperationalServerAudit
            {
                OperationalServerId = 0, // Se actualizará después del save
                ServerName = request.ServerName,
                Action = OperationalServerAuditAction.Created,
                ChangedAt = DateTime.Now,
                ChangedByUserId = userId,
                ChangedByUserName = userName,
                NewValues = JsonSerializer.Serialize(new
                {
                    server.ServerName,
                    server.InstanceName,
                    server.Ambiente,
                    server.IsFromInventory,
                    server.Enabled,
                    server.EnabledForRestart,
                    server.EnabledForFailover,
                    server.EnabledForPatching
                })
            };

            await _context.SaveChangesAsync();

            // Actualizar el ID en la auditoría
            audit.OperationalServerId = server.Id;
            _context.OperationalServerAudits.Add(audit);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Servidor operacional creado: {ServerName} por {User}",
                request.ServerName, userName
            );

            return CreatedAtAction(nameof(GetOperationalServer), new { id = server.Id }, new OperationalServerDto
            {
                Id = server.Id,
                ServerName = server.ServerName,
                InstanceName = server.InstanceName,
                Description = server.Description,
                Ambiente = server.Ambiente,
                IsFromInventory = server.IsFromInventory,
                Enabled = server.Enabled,
                EnabledForRestart = server.EnabledForRestart,
                EnabledForFailover = server.EnabledForFailover,
                EnabledForPatching = server.EnabledForPatching,
                CreatedAt = server.CreatedAt,
                CreatedByUserName = server.CreatedByUserName,
                Notes = server.Notes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creando servidor operacional");
            return StatusCode(500, new { message = "Error creando servidor operacional", error = ex.Message });
        }
    }

    /// <summary>
    /// Importa múltiples servidores desde el inventario
    /// </summary>
    [HttpPost("import")]
    public async Task<ActionResult<ImportServersResponse>> ImportFromInventory([FromBody] ImportServersFromInventoryRequest request)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                          User.FindFirst("name")?.Value ?? 
                          User.Identity?.Name ?? "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            // Obtener datos del inventario
            var response = await _httpClient.GetAsync(INVENTORY_URL);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var inventory = JsonSerializer.Deserialize<List<InventoryServerData>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });

            if (inventory == null)
            {
                return BadRequest(new ImportServersResponse
                {
                    Success = false,
                    Message = "No se pudo obtener datos del inventario"
                });
            }

            // Obtener servidores ya existentes
            var existingServers = await _context.OperationalServers
                .Select(s => s.ServerName.ToLower())
                .ToListAsync();

            var importedCount = 0;
            var skippedCount = 0;
            var errors = new List<string>();

            foreach (var serverName in request.ServerNames)
            {
                try
                {
                    if (existingServers.Contains(serverName.ToLower()))
                    {
                        skippedCount++;
                        continue;
                    }

                    var inventoryData = inventory.FirstOrDefault(
                        i => i.ServerName.Equals(serverName, StringComparison.OrdinalIgnoreCase));

                    var server = new OperationalServer
                    {
                        ServerName = serverName,
                        InstanceName = inventoryData?.NombreInstancia,
                        Ambiente = inventoryData?.ambiente,
                        IsFromInventory = true,
                        Enabled = true,
                        EnabledForRestart = true,
                        EnabledForFailover = false,
                        EnabledForPatching = false,
                        CreatedAt = DateTime.Now,
                        CreatedByUserId = userId,
                        CreatedByUserName = userName
                    };

                    _context.OperationalServers.Add(server);
                    importedCount++;

                    existingServers.Add(serverName.ToLower());
                }
                catch (Exception ex)
                {
                    errors.Add($"{serverName}: {ex.Message}");
                }
            }

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Importación de servidores completada: {Imported} importados, {Skipped} omitidos por {User}",
                importedCount, skippedCount, userName
            );

            return Ok(new ImportServersResponse
            {
                Success = true,
                Message = $"Importación completada: {importedCount} servidor(es) agregado(s)",
                ImportedCount = importedCount,
                SkippedCount = skippedCount,
                Errors = errors
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importando servidores");
            return StatusCode(500, new ImportServersResponse
            {
                Success = false,
                Message = "Error importando servidores",
                Errors = new List<string> { ex.Message }
            });
        }
    }

    /// <summary>
    /// Obtiene un servidor operacional por ID
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<OperationalServerDto>> GetOperationalServer(int id)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var server = await _context.OperationalServers.FindAsync(id);
            if (server == null)
            {
                return NotFound(new { message = $"Servidor no encontrado: {id}" });
            }

            return Ok(new OperationalServerDto
            {
                Id = server.Id,
                ServerName = server.ServerName,
                InstanceName = server.InstanceName,
                Description = server.Description,
                Ambiente = server.Ambiente,
                IsFromInventory = server.IsFromInventory,
                Enabled = server.Enabled,
                EnabledForRestart = server.EnabledForRestart,
                EnabledForFailover = server.EnabledForFailover,
                EnabledForPatching = server.EnabledForPatching,
                CreatedAt = server.CreatedAt,
                CreatedByUserName = server.CreatedByUserName,
                UpdatedAt = server.UpdatedAt,
                UpdatedByUserName = server.UpdatedByUserName,
                Notes = server.Notes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo servidor operacional {Id}", id);
            return StatusCode(500, new { message = "Error obteniendo servidor" });
        }
    }

    /// <summary>
    /// Actualiza un servidor operacional
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<OperationalServerDto>> UpdateOperationalServer(int id, [FromBody] UpdateOperationalServerRequest request)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                          User.FindFirst("name")?.Value ?? 
                          User.Identity?.Name ?? "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            var server = await _context.OperationalServers.FindAsync(id);
            if (server == null)
            {
                return NotFound(new { message = $"Servidor no encontrado: {id}" });
            }

            // Guardar valores anteriores para auditoría
            var oldValues = JsonSerializer.Serialize(new
            {
                server.Description,
                server.Ambiente,
                server.Enabled,
                server.EnabledForRestart,
                server.EnabledForFailover,
                server.EnabledForPatching,
                server.Notes
            });

            // Actualizar campos
            server.Description = request.Description;
            server.Ambiente = request.Ambiente;
            server.Enabled = request.Enabled;
            server.EnabledForRestart = request.EnabledForRestart;
            server.EnabledForFailover = request.EnabledForFailover;
            server.EnabledForPatching = request.EnabledForPatching;
            server.Notes = request.Notes;
            server.UpdatedAt = DateTime.Now;
            server.UpdatedByUserId = userId;
            server.UpdatedByUserName = userName;

            // Registrar auditoría
            var audit = new OperationalServerAudit
            {
                OperationalServerId = server.Id,
                ServerName = server.ServerName,
                Action = OperationalServerAuditAction.Updated,
                ChangedAt = DateTime.Now,
                ChangedByUserId = userId,
                ChangedByUserName = userName,
                OldValues = oldValues,
                NewValues = JsonSerializer.Serialize(new
                {
                    server.Description,
                    server.Ambiente,
                    server.Enabled,
                    server.EnabledForRestart,
                    server.EnabledForFailover,
                    server.EnabledForPatching,
                    server.Notes
                })
            };
            _context.OperationalServerAudits.Add(audit);

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Servidor operacional actualizado: {ServerName} por {User}",
                server.ServerName, userName
            );

            return Ok(new OperationalServerDto
            {
                Id = server.Id,
                ServerName = server.ServerName,
                InstanceName = server.InstanceName,
                Description = server.Description,
                Ambiente = server.Ambiente,
                IsFromInventory = server.IsFromInventory,
                Enabled = server.Enabled,
                EnabledForRestart = server.EnabledForRestart,
                EnabledForFailover = server.EnabledForFailover,
                EnabledForPatching = server.EnabledForPatching,
                CreatedAt = server.CreatedAt,
                CreatedByUserName = server.CreatedByUserName,
                UpdatedAt = server.UpdatedAt,
                UpdatedByUserName = server.UpdatedByUserName,
                Notes = server.Notes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error actualizando servidor operacional {Id}", id);
            return StatusCode(500, new { message = "Error actualizando servidor" });
        }
    }

    /// <summary>
    /// Alterna el estado habilitado/deshabilitado de un servidor
    /// </summary>
    [HttpPost("{id}/toggle")]
    public async Task<ActionResult> ToggleServer(int id)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                          User.FindFirst("name")?.Value ?? 
                          User.Identity?.Name ?? "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            var server = await _context.OperationalServers.FindAsync(id);
            if (server == null)
            {
                return NotFound(new { message = $"Servidor no encontrado: {id}" });
            }

            var wasEnabled = server.Enabled;
            server.Enabled = !server.Enabled;
            server.UpdatedAt = DateTime.Now;
            server.UpdatedByUserId = userId;
            server.UpdatedByUserName = userName;

            // Registrar auditoría
            var audit = new OperationalServerAudit
            {
                OperationalServerId = server.Id,
                ServerName = server.ServerName,
                Action = server.Enabled ? OperationalServerAuditAction.Enabled : OperationalServerAuditAction.Disabled,
                ChangedAt = DateTime.Now,
                ChangedByUserId = userId,
                ChangedByUserName = userName,
                OldValues = JsonSerializer.Serialize(new { Enabled = wasEnabled }),
                NewValues = JsonSerializer.Serialize(new { Enabled = server.Enabled })
            };
            _context.OperationalServerAudits.Add(audit);

            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Servidor {ServerName} {Action} por {User}",
                server.ServerName, server.Enabled ? "habilitado" : "deshabilitado", userName
            );

            return Ok(new { enabled = server.Enabled, message = server.Enabled ? "Servidor habilitado" : "Servidor deshabilitado" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error alternando estado del servidor {Id}", id);
            return StatusCode(500, new { message = "Error alternando estado" });
        }
    }

    /// <summary>
    /// Elimina un servidor operacional
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteOperationalServer(int id)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var userName = User.FindFirst(ClaimTypes.Name)?.Value ?? 
                          User.FindFirst("name")?.Value ?? 
                          User.Identity?.Name ?? "Unknown";

            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no identificado" });
            }

            var server = await _context.OperationalServers.FindAsync(id);
            if (server == null)
            {
                return NotFound(new { message = $"Servidor no encontrado: {id}" });
            }

            var serverName = server.ServerName;

            // Registrar auditoría antes de eliminar
            var audit = new OperationalServerAudit
            {
                OperationalServerId = server.Id,
                ServerName = serverName,
                Action = OperationalServerAuditAction.Deleted,
                ChangedAt = DateTime.Now,
                ChangedByUserId = userId,
                ChangedByUserName = userName,
                OldValues = JsonSerializer.Serialize(new
                {
                    server.ServerName,
                    server.InstanceName,
                    server.Ambiente,
                    server.Enabled,
                    server.EnabledForRestart,
                    server.EnabledForFailover,
                    server.EnabledForPatching
                })
            };
            _context.OperationalServerAudits.Add(audit);

            _context.OperationalServers.Remove(server);
            await _context.SaveChangesAsync();

            _logger.LogInformation(
                "Servidor operacional eliminado: {ServerName} por {User}",
                serverName, userName
            );

            return Ok(new { message = $"Servidor '{serverName}' eliminado correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error eliminando servidor operacional {Id}", id);
            return StatusCode(500, new { message = "Error eliminando servidor" });
        }
    }

    /// <summary>
    /// Obtiene el historial de auditoría
    /// </summary>
    [HttpGet("audit")]
    public async Task<ActionResult<List<OperationalServerAuditDto>>> GetAuditHistory([FromQuery] int limit = 100)
    {
        if (!await HasOperationsConfigPermission())
        {
            return Forbid();
        }

        try
        {
            var audits = await _context.OperationalServerAudits
                .OrderByDescending(a => a.ChangedAt)
                .Take(limit)
                .Select(a => new OperationalServerAuditDto
                {
                    Id = a.Id,
                    OperationalServerId = a.OperationalServerId,
                    ServerName = a.ServerName,
                    Action = a.Action,
                    ChangedAt = a.ChangedAt,
                    ChangedByUserName = a.ChangedByUserName,
                    OldValues = a.OldValues,
                    NewValues = a.NewValues
                })
                .ToListAsync();

            return Ok(audits);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo historial de auditoría");
            return StatusCode(500, new { message = "Error obteniendo historial" });
        }
    }

    /// <summary>
    /// Verifica si el usuario actual tiene permisos de configuración de operaciones
    /// </summary>
    [HttpGet("check-permission")]
    public async Task<ActionResult> CheckPermission()
    {
        var hasPermission = await HasOperationsConfigPermission();
        return Ok(new { hasPermission });
    }
}

/// <summary>
/// DTO interno para deserializar datos del inventario
/// </summary>
internal class InventoryServerData
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string local_net_address { get; set; } = "";
    public string NombreInstancia { get; set; } = "";
    public string MajorVersion { get; set; } = "";
    public string ProductLevel { get; set; } = "";
    public string Edition { get; set; } = "";
    public string ProductUpdateLevel { get; set; } = "";
    public string ProductVersion { get; set; } = "";
    public string ProductUpdateReference { get; set; } = "";
    public string Collation { get; set; } = "";
    public string AlwaysOn { get; set; } = "";
    public string hostingSite { get; set; } = "";
    public string hostingType { get; set; } = "";
    public string ambiente { get; set; } = "";
}




