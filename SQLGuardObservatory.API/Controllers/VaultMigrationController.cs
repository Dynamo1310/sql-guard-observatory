using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar la migración del Vault a formato enterprise.
/// Solo accesible por administradores.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Roles = "Admin")]
public class VaultMigrationController : ControllerBase
{
    private readonly IBackfillService _backfillService;
    private readonly ILogger<VaultMigrationController> _logger;

    public VaultMigrationController(
        IBackfillService backfillService,
        ILogger<VaultMigrationController> logger)
    {
        _backfillService = backfillService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene el estado actual de la migración del vault
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<BackfillStatus>> GetStatus()
    {
        try
        {
            var status = await _backfillService.GetStatusAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo estado de migración");
            return StatusCode(500, new { error = "Error obteniendo estado de migración" });
        }
    }

    /// <summary>
    /// Ejecuta el backfill de credenciales pendientes
    /// </summary>
    /// <param name="batchSize">Cantidad de credenciales por lote (default: 100)</param>
    [HttpPost("backfill")]
    public async Task<ActionResult<BackfillResult>> ExecuteBackfill([FromQuery] int batchSize = 100)
    {
        try
        {
            _logger.LogInformation("Usuario {User} iniciando backfill con batchSize={BatchSize}", 
                User.Identity?.Name, batchSize);

            var result = await _backfillService.ExecuteBackfillAsync(batchSize);

            if (result.Failed > 0)
            {
                _logger.LogWarning("Backfill completado con {Failed} errores", result.Failed);
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ejecutando backfill");
            return StatusCode(500, new { error = "Error ejecutando backfill", details = ex.Message });
        }
    }

    /// <summary>
    /// Valida que todas las credenciales migradas pueden ser descifradas
    /// </summary>
    [HttpGet("validate")]
    public async Task<ActionResult<ValidationResult>> ValidateMigration()
    {
        try
        {
            _logger.LogInformation("Usuario {User} validando migración", User.Identity?.Name);
            
            var result = await _backfillService.ValidateMigratedCredentialsAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error validando migración");
            return StatusCode(500, new { error = "Error validando migración" });
        }
    }

    /// <summary>
    /// Revierte una credencial específica al formato legacy (rollback)
    /// </summary>
    [HttpPost("revert/{credentialId}")]
    public async Task<ActionResult> RevertCredential(int credentialId)
    {
        try
        {
            _logger.LogWarning("Usuario {User} revirtiendo credencial {CredentialId} a formato legacy", 
                User.Identity?.Name, credentialId);

            var success = await _backfillService.RevertCredentialAsync(credentialId);
            
            if (!success)
            {
                return NotFound(new { error = "Credencial no encontrada o no se puede revertir" });
            }

            return Ok(new { message = "Credencial revertida exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error revirtiendo credencial {CredentialId}", credentialId);
            return StatusCode(500, new { error = "Error revirtiendo credencial" });
        }
    }

    /// <summary>
    /// Verifica si se puede proceder con Phase 8 (cleanup)
    /// </summary>
    [HttpGet("can-cleanup")]
    public async Task<ActionResult<CleanupReadinessResult>> CanProceedWithCleanup()
    {
        try
        {
            var status = await _backfillService.GetStatusAsync();
            var validation = await _backfillService.ValidateMigratedCredentialsAsync();

            var canProceed = status.PendingCredentials == 0 && validation.AllValid;

            return Ok(new CleanupReadinessResult
            {
                CanProceed = canProceed,
                MigrationStatus = status,
                ValidationResult = validation,
                Blockers = GetBlockers(status, validation)
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verificando readiness para cleanup");
            return StatusCode(500, new { error = "Error verificando readiness" });
        }
    }

    private List<string> GetBlockers(BackfillStatus status, ValidationResult validation)
    {
        var blockers = new List<string>();

        if (status.PendingCredentials > 0)
        {
            blockers.Add($"Hay {status.PendingCredentials} credenciales pendientes de migrar");
        }

        if (!validation.AllValid)
        {
            blockers.Add($"Hay {validation.InvalidCount} credenciales que no se pueden descifrar");
        }

        return blockers;
    }
}

public class CleanupReadinessResult
{
    public bool CanProceed { get; set; }
    public BackfillStatus MigrationStatus { get; set; } = new();
    public ValidationResult ValidationResult { get; set; } = new();
    public List<string> Blockers { get; set; } = new();
}

