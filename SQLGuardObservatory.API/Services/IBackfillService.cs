namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para migrar credenciales del formato legacy (Base64) al nuevo formato enterprise (VARBINARY).
/// </summary>
public interface IBackfillService
{
    /// <summary>
    /// Ejecuta el backfill completo de todas las credenciales pendientes.
    /// </summary>
    /// <param name="batchSize">Cantidad de credenciales a procesar por lote</param>
    /// <param name="cancellationToken">Token de cancelación</param>
    /// <returns>Resultado del backfill</returns>
    Task<BackfillResult> ExecuteBackfillAsync(int batchSize = 100, CancellationToken cancellationToken = default);

    /// <summary>
    /// Obtiene el estado actual de la migración.
    /// </summary>
    Task<BackfillStatus> GetStatusAsync();

    /// <summary>
    /// Valida que todas las credenciales migradas pueden ser descifradas.
    /// </summary>
    Task<ValidationResult> ValidateMigratedCredentialsAsync();

    /// <summary>
    /// Revierte una credencial específica al formato legacy (para rollback).
    /// </summary>
    Task<bool> RevertCredentialAsync(int credentialId);
}

public class BackfillResult
{
    public int TotalProcessed { get; set; }
    public int Successful { get; set; }
    public int Failed { get; set; }
    public List<BackfillError> Errors { get; set; } = new();
    public TimeSpan Duration { get; set; }
    public bool IsComplete { get; set; }
}

public class BackfillError
{
    public int CredentialId { get; set; }
    public string CredentialName { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public DateTime OccurredAt { get; set; }
}

public class BackfillStatus
{
    public int TotalCredentials { get; set; }
    public int MigratedCredentials { get; set; }
    public int PendingCredentials { get; set; }
    public double PercentComplete => TotalCredentials > 0 
        ? Math.Round((double)MigratedCredentials / TotalCredentials * 100, 2) 
        : 0;
    public DateTime? LastBackfillAt { get; set; }
}

public class ValidationResult
{
    public int TotalValidated { get; set; }
    public int ValidCount { get; set; }
    public int InvalidCount { get; set; }
    public List<ValidationError> Errors { get; set; } = new();
    public bool AllValid => InvalidCount == 0;
}

public class ValidationError
{
    public int CredentialId { get; set; }
    public string CredentialName { get; set; } = string.Empty;
    public string ValidationError_ { get; set; } = string.Empty;
    public bool CanDecryptLegacy { get; set; }
    public bool CanDecryptEnterprise { get; set; }
}

