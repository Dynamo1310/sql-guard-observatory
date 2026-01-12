namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de sincronización de un grupo de seguridad con un grupo de Active Directory.
/// Permite mantener los miembros del grupo sincronizados automáticamente con AD.
/// </summary>
public class ADGroupSync
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID del grupo de seguridad local
    /// </summary>
    public int GroupId { get; set; }
    public SecurityGroup? Group { get; set; }
    
    /// <summary>
    /// Nombre del grupo de Active Directory (ej: "GSCORP\SQL_admins" o "SQL_admins")
    /// </summary>
    public string ADGroupName { get; set; } = string.Empty;
    
    /// <summary>
    /// Indica si la sincronización automática está habilitada
    /// </summary>
    public bool AutoSync { get; set; } = false;
    
    /// <summary>
    /// Intervalo de sincronización automática en horas (por defecto 24 horas)
    /// </summary>
    public int SyncIntervalHours { get; set; } = 24;
    
    /// <summary>
    /// Fecha de la última sincronización exitosa
    /// </summary>
    public DateTime? LastSyncAt { get; set; }
    
    /// <summary>
    /// Resultado de la última sincronización
    /// </summary>
    public string? LastSyncResult { get; set; }
    
    /// <summary>
    /// Número de usuarios agregados en la última sincronización
    /// </summary>
    public int? LastSyncAddedCount { get; set; }
    
    /// <summary>
    /// Número de usuarios removidos en la última sincronización
    /// </summary>
    public int? LastSyncRemovedCount { get; set; }
    
    /// <summary>
    /// Fecha de creación de la configuración
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Usuario que creó la configuración
    /// </summary>
    public string? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
    
    /// <summary>
    /// Usuario que realizó la última actualización
    /// </summary>
    public string? UpdatedByUserId { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }
}




