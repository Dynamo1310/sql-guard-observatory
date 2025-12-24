using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.DTOs;

// =============================================
// DTOs de Credenciales
// =============================================

/// <summary>
/// DTO para mostrar una credencial (sin password)
/// </summary>
public class CredentialDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string CredentialType { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string? Description { get; set; }
    public string? Notes { get; set; }
    public DateTime? ExpiresAt { get; set; }
    public bool IsPrivate { get; set; }
    
    /// <summary>
    /// Indica si la credencial está compartida con todo el equipo
    /// </summary>
    public bool IsTeamShared { get; set; }
    
    /// <summary>
    /// ID del grupo al que pertenece (legacy - usar GroupShares)
    /// </summary>
    public int? GroupId { get; set; }
    
    /// <summary>
    /// Nombre del grupo al que pertenece
    /// </summary>
    public string? GroupName { get; set; }
    
    /// <summary>
    /// Color del grupo para UI
    /// </summary>
    public string? GroupColor { get; set; }
    
    public string OwnerUserId { get; set; } = string.Empty;
    public string? OwnerDisplayName { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CreatedByDisplayName { get; set; }
    public string? UpdatedByDisplayName { get; set; }
    
    /// <summary>
    /// Indica si la credencial está expirada
    /// </summary>
    public bool IsExpired => ExpiresAt.HasValue && ExpiresAt.Value < DateTime.UtcNow;
    
    /// <summary>
    /// Indica si la credencial expira pronto (próximos 30 días)
    /// </summary>
    public bool IsExpiringSoon => ExpiresAt.HasValue && 
        ExpiresAt.Value >= DateTime.UtcNow && 
        ExpiresAt.Value <= DateTime.UtcNow.AddDays(30);
    
    /// <summary>
    /// Servidores asociados a esta credencial
    /// </summary>
    public List<CredentialServerDto> Servers { get; set; } = new();
    
    /// <summary>
    /// Grupos con los que se comparte esta credencial
    /// </summary>
    public List<CredentialGroupShareDto> GroupShares { get; set; } = new();
    
    /// <summary>
    /// Usuarios con los que se comparte esta credencial directamente
    /// </summary>
    public List<CredentialUserShareDto> UserShares { get; set; } = new();
    
    /// <summary>
    /// Permiso del usuario actual sobre esta credencial (legacy)
    /// </summary>
    public string? CurrentUserPermission { get; set; }
    
    // =============================================
    // Campos de Permisos Enterprise v2.1.1
    // =============================================
    
    /// <summary>
    /// Bitmask de permisos del usuario actual
    /// </summary>
    public long PermissionBitMask { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede revelar el secreto (calculado por backend)
    /// </summary>
    public bool CanReveal { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede usar sin revelar (calculado por backend)
    /// </summary>
    public bool CanUse { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede editar metadata (calculado por backend)
    /// </summary>
    public bool CanEdit { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede actualizar el secreto guardado (calculado por backend)
    /// NO "CanRotate" - la app no cambia passwords en sistemas destino
    /// </summary>
    public bool CanUpdateSecret { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede compartir la credencial (calculado por backend)
    /// </summary>
    public bool CanShare { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede eliminar la credencial (calculado por backend)
    /// </summary>
    public bool CanDelete { get; set; }
    
    /// <summary>
    /// Indica si el usuario puede ver audit logs (calculado por backend)
    /// </summary>
    public bool CanViewAudit { get; set; }
}

/// <summary>
/// DTO para mostrar un servidor asociado
/// </summary>
public class CredentialServerDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string? InstanceName { get; set; }
    public string? ConnectionPurpose { get; set; }
    public DateTime CreatedAt { get; set; }
    
    /// <summary>
    /// Nombre completo del servidor (SERVER\INSTANCE o SERVER)
    /// </summary>
    public string FullServerName => string.IsNullOrEmpty(InstanceName) 
        ? ServerName 
        : $"{ServerName}\\{InstanceName}";
}

/// <summary>
/// Request para crear una nueva credencial
/// </summary>
public class CreateCredentialRequest
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string CredentialType { get; set; } = "SqlAuth";

    [Required]
    [MaxLength(256)]
    public string Username { get; set; } = string.Empty;

    [Required]
    [MinLength(1)]
    public string Password { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? Domain { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    public string? Notes { get; set; }

    public DateTime? ExpiresAt { get; set; }

    public bool IsPrivate { get; set; } = false;
    
    /// <summary>
    /// IDs de grupos con los que compartir la credencial
    /// </summary>
    public List<int>? ShareWithGroupIds { get; set; }
    
    /// <summary>
    /// IDs de usuarios con los que compartir la credencial
    /// </summary>
    public List<string>? ShareWithUserIds { get; set; }

    /// <summary>
    /// Servidores a asociar al crear la credencial
    /// </summary>
    public List<CreateCredentialServerRequest>? Servers { get; set; }
}

/// <summary>
/// Request para crear una asociación de servidor
/// </summary>
public class CreateCredentialServerRequest
{
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? InstanceName { get; set; }

    [MaxLength(256)]
    public string? ConnectionPurpose { get; set; }
}

/// <summary>
/// Request para actualizar una credencial existente
/// </summary>
public class UpdateCredentialRequest
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string CredentialType { get; set; } = "SqlAuth";

    [Required]
    [MaxLength(256)]
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Si se proporciona, se actualiza el password
    /// </summary>
    public string? NewPassword { get; set; }

    [MaxLength(256)]
    public string? Domain { get; set; }

    [MaxLength(1000)]
    public string? Description { get; set; }

    public string? Notes { get; set; }

    public DateTime? ExpiresAt { get; set; }

    public bool IsPrivate { get; set; }
}

/// <summary>
/// Respuesta al revelar un password
/// </summary>
public class RevealPasswordResponse
{
    public string Password { get; set; } = string.Empty;
    
    /// <summary>
    /// Tiempo en segundos antes de que el password sea ocultado en el frontend
    /// </summary>
    public int ExpiresInSeconds { get; set; } = 30;
}

/// <summary>
/// DTO para registro de auditoría
/// </summary>
public class CredentialAuditLogDto
{
    public int Id { get; set; }
    public int CredentialId { get; set; }
    public string CredentialName { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string? ChangedFields { get; set; }
    public string PerformedByUserId { get; set; } = string.Empty;
    public string? PerformedByUserName { get; set; }
    public DateTime PerformedAt { get; set; }
    public string? IpAddress { get; set; }
    
    /// <summary>
    /// Descripción amigable de la acción
    /// </summary>
    public string ActionDescription => Action switch
    {
        "Created" => "Credencial creada",
        "Updated" => "Credencial actualizada",
        "Deleted" => "Credencial eliminada",
        "Viewed" => "Credencial visualizada",
        "PasswordRevealed" => "Contraseña revelada",
        "PasswordCopied" => "Contraseña copiada",
        "ServerAdded" => "Servidor asociado",
        "ServerRemoved" => "Servidor desasociado",
        _ => Action
    };
}

/// <summary>
/// Estadísticas del Vault para el Dashboard
/// </summary>
public class VaultStatsDto
{
    public int TotalCredentials { get; set; }
    public int SharedCredentials { get; set; }
    public int PrivateCredentials { get; set; }
    public int ExpiringCredentials { get; set; }
    public int ExpiredCredentials { get; set; }
    public int SqlAuthCredentials { get; set; }
    public int WindowsCredentials { get; set; }
    public int OtherCredentials { get; set; }
    public int TotalServersLinked { get; set; }
    public DateTime? LastActivity { get; set; }
}

/// <summary>
/// Servidor disponible para asociar (desde el inventario)
/// </summary>
public class AvailableServerDto
{
    public string ServerName { get; set; } = string.Empty;
    public string? InstanceName { get; set; }
    public string? Environment { get; set; }
    public string? HostingSite { get; set; }
    
    public string FullServerName => string.IsNullOrEmpty(InstanceName) 
        ? ServerName 
        : $"{ServerName}\\{InstanceName}";

    /// <summary>
    /// Indica si es servidor AWS
    /// </summary>
    public bool IsAws => HostingSite?.Contains("AWS", StringComparison.OrdinalIgnoreCase) == true;

    /// <summary>
    /// Indica si es servidor DMZ
    /// </summary>
    public bool IsDmz => ServerName.Contains("DMZ", StringComparison.OrdinalIgnoreCase) ||
                         (InstanceName?.Contains("DMZ", StringComparison.OrdinalIgnoreCase) == true);
}

/// <summary>
/// Request para agregar un servidor a una credencial
/// </summary>
public class AddServerToCredentialRequest
{
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? InstanceName { get; set; }

    [MaxLength(256)]
    public string? ConnectionPurpose { get; set; }
}

/// <summary>
/// Filtros para listar credenciales
/// </summary>
public class CredentialFilterRequest
{
    public string? SearchTerm { get; set; }
    public string? CredentialType { get; set; }
    public string? ServerName { get; set; }
    public bool? IsExpired { get; set; }
    public bool? IsExpiringSoon { get; set; }
    public bool? IsPrivate { get; set; }
    public int? GroupId { get; set; }
    public bool IncludeDeleted { get; set; } = false;
    /// <summary>
    /// Si es true, solo devuelve credenciales donde el usuario es propietario (OwnerUserId == userId)
    /// </summary>
    public bool OwnerOnly { get; set; } = false;
}

// =============================================
// DTOs de Grupos de Credenciales
// =============================================

/// <summary>
/// DTO de grupo de credenciales
/// </summary>
public class CredentialGroupDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public string OwnerUserId { get; set; } = string.Empty;
    public string OwnerUserName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public int CredentialsCount { get; set; }
    public int MembersCount { get; set; }
    public List<CredentialGroupMemberDto> Members { get; set; } = new();
    public string UserRole { get; set; } = string.Empty; // Rol del usuario actual en el grupo
}

/// <summary>
/// DTO de miembro de grupo
/// </summary>
public class CredentialGroupMemberDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool ReceiveNotifications { get; set; }
    public DateTime AddedAt { get; set; }
    public string? AddedByUserName { get; set; }
}

/// <summary>
/// Request para crear un grupo
/// </summary>
public class CreateCredentialGroupRequest
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(7)]
    public string? Color { get; set; }

    [MaxLength(50)]
    public string? Icon { get; set; }

    /// <summary>
    /// IDs de usuarios a agregar como miembros iniciales
    /// </summary>
    public List<AddGroupMemberRequest> InitialMembers { get; set; } = new();
}

/// <summary>
/// Request para actualizar un grupo
/// </summary>
public class UpdateCredentialGroupRequest
{
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; set; }

    [MaxLength(7)]
    public string? Color { get; set; }

    [MaxLength(50)]
    public string? Icon { get; set; }
}

/// <summary>
/// Request para agregar un miembro a un grupo
/// </summary>
public class AddGroupMemberRequest
{
    [Required]
    public string UserId { get; set; } = string.Empty;

    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = "Viewer"; // Owner, Admin, Member, Viewer

    public bool ReceiveNotifications { get; set; } = true;
}

/// <summary>
/// Request para actualizar el rol de un miembro
/// </summary>
public class UpdateGroupMemberRequest
{
    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = string.Empty;

    public bool? ReceiveNotifications { get; set; }
}

// =============================================
// DTOs de Compartición de Credenciales
// =============================================

/// <summary>
/// DTO para mostrar una compartición con grupo
/// </summary>
public class CredentialGroupShareDto
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? GroupColor { get; set; }
    public long PermissionBitMask { get; set; }
    public string Permission { get; set; } = string.Empty; // Legible para UI
    public string SharedByUserId { get; set; } = string.Empty;
    public string? SharedByUserName { get; set; }
    public DateTime SharedAt { get; set; }
}

/// <summary>
/// DTO para mostrar una compartición con usuario
/// </summary>
public class CredentialUserShareDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
    public long PermissionBitMask { get; set; }
    public string Permission { get; set; } = string.Empty; // Legible para UI
    public string SharedByUserId { get; set; } = string.Empty;
    public string? SharedByUserName { get; set; }
    public DateTime SharedAt { get; set; }
}

/// <summary>
/// Request para compartir una credencial
/// </summary>
public class ShareCredentialRequest
{
    /// <summary>
    /// IDs de grupos con los que compartir
    /// </summary>
    public List<int>? GroupIds { get; set; }
    
    /// <summary>
    /// IDs de usuarios con los que compartir
    /// </summary>
    public List<string>? UserIds { get; set; }
    
    /// <summary>
    /// Permiso a otorgar: View, Edit, Admin
    /// </summary>
    [MaxLength(20)]
    public string Permission { get; set; } = "View";
}

/// <summary>
/// Request para dejar de compartir con un grupo
/// </summary>
public class UnshareFromGroupRequest
{
    [Required]
    public int GroupId { get; set; }
}

/// <summary>
/// Request para dejar de compartir con un usuario
/// </summary>
public class UnshareFromUserRequest
{
    [Required]
    public string UserId { get; set; } = string.Empty;
}

/// <summary>
/// Request para agregar una credencial a un grupo
/// </summary>
public class AddCredentialToGroupRequest
{
    /// <summary>
    /// Permiso a otorgar: View, Edit, Admin
    /// </summary>
    [MaxLength(20)]
    public string Permission { get; set; } = "View";
}

/// <summary>
/// DTO de credencial para la vista "Compartidas Conmigo"
/// Incluye información sobre quién compartió
/// </summary>
public class SharedWithMeCredentialDto : CredentialDto
{
    /// <summary>
    /// Usuario que compartió la credencial conmigo
    /// </summary>
    public string? SharedByUserId { get; set; }
    public string? SharedByUserName { get; set; }
    
    /// <summary>
    /// Fecha en que se compartió conmigo
    /// </summary>
    public DateTime? SharedAt { get; set; }
    
    /// <summary>
    /// Permiso que tengo sobre la credencial
    /// </summary>
    public string MyPermission { get; set; } = "View";
}

// =============================================
// DTOs Enterprise v2.1.1 - Update Secret
// =============================================

/// <summary>
/// Request para actualizar el secreto guardado (MANUAL)
/// IMPORTANTE: NO cambia la password en el servidor destino
/// </summary>
public class UpdateSecretRequest
{
    [Required]
    [MinLength(1)]
    public string NewPassword { get; set; } = string.Empty;
}

/// <summary>
/// Response de update-secret (NO devuelve CredentialDto)
/// </summary>
public class UpdateSecretResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
    public string? Reason { get; set; }  // Solo en errores
}

// =============================================
// DTOs Enterprise v2.1.1 - Use Without Reveal
// =============================================

/// <summary>
/// Request para usar credencial sin revelar
/// </summary>
public class UseCredentialRequest
{
    [Required]
    [MaxLength(256)]
    public string TargetServer { get; set; } = string.Empty;
    
    [MaxLength(256)]
    public string? TargetInstance { get; set; }
    
    [MaxLength(500)]
    public string? Purpose { get; set; }
}

/// <summary>
/// Response de use-credential
/// </summary>
public class UseCredentialResponse
{
    public bool Success { get; set; }
    public Guid UsageId { get; set; }
    public string? Message { get; set; }
}

