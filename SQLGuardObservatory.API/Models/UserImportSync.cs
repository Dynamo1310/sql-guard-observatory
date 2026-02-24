namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de sincronización de usuarios desde una lista de distribución de AD.
/// Permite importar y mantener sincronizados los miembros de una DL con los usuarios de la app.
/// </summary>
public class UserImportSync
{
    public int Id { get; set; }

    /// <summary>
    /// Tipo de fuente: "DistributionList"
    /// </summary>
    public string SourceType { get; set; } = "DistributionList";

    /// <summary>
    /// Identificador de la fuente (email de la lista de distribución)
    /// </summary>
    public string SourceIdentifier { get; set; } = string.Empty;

    /// <summary>
    /// Nombre visible del grupo en AD
    /// </summary>
    public string? SourceDisplayName { get; set; }

    /// <summary>
    /// sAMAccountName del grupo en AD (usado internamente para enumerar miembros)
    /// </summary>
    public string ADGroupName { get; set; } = string.Empty;

    public int? DefaultRoleId { get; set; }
    public AdminRole? DefaultRole { get; set; }

    public bool AutoSync { get; set; } = false;
    public int SyncIntervalHours { get; set; } = 24;

    public DateTime? LastSyncAt { get; set; }
    public string? LastSyncResult { get; set; }
    public int? LastSyncAddedCount { get; set; }
    public int? LastSyncRemovedCount { get; set; }
    public int? LastSyncSkippedCount { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }

    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByUserId { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }

    public ICollection<UserImportSyncMember> Members { get; set; } = new List<UserImportSyncMember>();
}

/// <summary>
/// Registro de un usuario gestionado por un sync de importación.
/// Permite rastrear qué usuarios fueron importados por cada sync y decidir
/// si desactivarlos cuando son removidos de la lista de distribución.
/// </summary>
public class UserImportSyncMember
{
    public int Id { get; set; }

    public int SyncId { get; set; }
    public UserImportSync? Sync { get; set; }

    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }

    public string SamAccountName { get; set; } = string.Empty;

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// NULL = miembro activo. Fecha = momento en que fue removido de la DL.
    /// </summary>
    public DateTime? RemovedAt { get; set; }

    public bool IsActive { get; set; } = true;
}
