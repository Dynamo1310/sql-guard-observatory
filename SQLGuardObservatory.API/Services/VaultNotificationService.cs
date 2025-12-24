using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interface del servicio de notificaciones del Vault
/// </summary>
public interface IVaultNotificationService
{
    /// <summary>
    /// Notifica cuando se crea una credencial
    /// </summary>
    Task NotifyCredentialCreatedAsync(Credential credential, string creatorName);

    /// <summary>
    /// Notifica cuando se actualiza una credencial
    /// </summary>
    Task NotifyCredentialUpdatedAsync(Credential credential, string updaterName, bool passwordChanged);

    /// <summary>
    /// Notifica cuando se elimina una credencial
    /// </summary>
    Task NotifyCredentialDeletedAsync(Credential credential, string deleterName);

    /// <summary>
    /// Notifica cuando se comparte una credencial con un usuario
    /// </summary>
    Task NotifyCredentialSharedAsync(Credential credential, string sharerName, string targetUserId);

    /// <summary>
    /// Notifica cuando se revoca el acceso a una credencial compartida
    /// </summary>
    Task NotifyShareRevokedAsync(Credential credential, string revokerName, string targetUserId);

    /// <summary>
    /// Notifica cuando se agrega un usuario a un grupo
    /// </summary>
    Task NotifyAddedToGroupAsync(CredentialGroup group, string adderName, string targetUserId);

    /// <summary>
    /// Notifica cuando se elimina un usuario de un grupo
    /// </summary>
    Task NotifyRemovedFromGroupAsync(CredentialGroup group, string removerName, string targetUserId);

    /// <summary>
    /// Notifica a todos los miembros del grupo sobre un cambio
    /// </summary>
    Task NotifyGroupMembersAsync(int groupId, string subject, string message, string excludeUserId);

    /// <summary>
    /// Notifica sobre credenciales próximas a expirar
    /// </summary>
    Task NotifyExpiringCredentialsAsync();

    /// <summary>
    /// Notifica cuando alguien revela una contraseña
    /// </summary>
    Task NotifyPasswordRevealedAsync(Credential credential, string revealerName, string revealerId);

    /// <summary>
    /// Verifica si un usuario tiene habilitada una notificación específica
    /// </summary>
    Task<bool> ShouldNotifyUserAsync(string userId, string notificationType);

    /// <summary>
    /// Obtiene las preferencias de notificación de un usuario
    /// </summary>
    Task<List<VaultNotificationPreferenceDto>> GetUserPreferencesAsync(string userId);

    /// <summary>
    /// Actualiza las preferencias de notificación de un usuario
    /// </summary>
    Task UpdateUserPreferencesAsync(string userId, List<NotificationPreferenceUpdateDto> preferences);

    /// <summary>
    /// Obtiene todos los tipos de notificación disponibles
    /// </summary>
    Task<List<VaultNotificationTypeDto>> GetNotificationTypesAsync();
}

/// <summary>
/// DTO para preferencia de notificación
/// </summary>
public class VaultNotificationPreferenceDto
{
    public int Id { get; set; }
    public string NotificationType { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
}

/// <summary>
/// DTO para tipo de notificación
/// </summary>
public class VaultNotificationTypeDto
{
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool DefaultEnabled { get; set; }
    public string Category { get; set; } = string.Empty;
    public int DisplayOrder { get; set; }
}

/// <summary>
/// DTO para actualizar preferencia de notificación
/// </summary>
public class NotificationPreferenceUpdateDto
{
    public string NotificationType { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
}

/// <summary>
/// Servicio de notificaciones por email para el Vault de Credenciales
/// </summary>
public class VaultNotificationService : IVaultNotificationService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<VaultNotificationService> _logger;
    private readonly string _appUrl;

    // Tipos de notificación con sus valores por defecto (en caso de no existir en BD)
    private static readonly Dictionary<string, bool> DefaultNotificationSettings = new()
    {
        { VaultNotificationTypeCodes.CredentialCreated, true },
        { VaultNotificationTypeCodes.CredentialUpdated, true },
        { VaultNotificationTypeCodes.CredentialDeleted, true },
        { VaultNotificationTypeCodes.CredentialShared, true },
        { VaultNotificationTypeCodes.GroupMemberAdded, true },
        { VaultNotificationTypeCodes.GroupMemberRemoved, true },
        { VaultNotificationTypeCodes.CredentialExpiring, true },
        { VaultNotificationTypeCodes.PasswordRevealed, false },  // Deshabilitado por defecto, el usuario debe habilitarlo
        { VaultNotificationTypeCodes.ShareRevoked, true }
    };

    public VaultNotificationService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        IConfiguration configuration,
        ILogger<VaultNotificationService> logger)
    {
        _context = context;
        _smtpService = smtpService;
        _logger = logger;
        _appUrl = configuration["AppUrl"] ?? "http://asprbm-nov-01:8080";
    }

    // =============================================
    // Métodos de Preferencias de Notificación
    // =============================================

    public async Task<bool> ShouldNotifyUserAsync(string userId, string notificationType)
    {
        // Buscar la preferencia del usuario
        var preference = await _context.VaultNotificationPreferences
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == userId && p.NotificationType == notificationType);

        if (preference != null)
        {
            return preference.IsEnabled;
        }

        // Si no existe preferencia, buscar el valor por defecto del tipo
        var notificationType2 = await _context.VaultNotificationTypes
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Code == notificationType && t.IsActive);

        if (notificationType2 != null)
        {
            return notificationType2.DefaultEnabled;
        }

        // Si no existe en BD, usar el valor por defecto en código
        return DefaultNotificationSettings.GetValueOrDefault(notificationType, true);
    }

    public async Task<List<VaultNotificationPreferenceDto>> GetUserPreferencesAsync(string userId)
    {
        // Inicializar preferencias si no existen
        await InitializeUserPreferencesAsync(userId);

        var preferences = await _context.VaultNotificationPreferences
            .AsNoTracking()
            .Where(p => p.UserId == userId)
            .Join(
                _context.VaultNotificationTypes.Where(t => t.IsActive),
                p => p.NotificationType,
                t => t.Code,
                (p, t) => new VaultNotificationPreferenceDto
                {
                    Id = p.Id,
                    NotificationType = p.NotificationType,
                    IsEnabled = p.IsEnabled,
                    DisplayName = t.DisplayName,
                    Description = t.Description,
                    Category = t.Category,
                    DisplayOrder = t.DisplayOrder
                })
            .OrderBy(p => p.DisplayOrder)
            .ToListAsync();

        return preferences;
    }

    public async Task UpdateUserPreferencesAsync(string userId, List<NotificationPreferenceUpdateDto> preferences)
    {
        foreach (var pref in preferences)
        {
            var existing = await _context.VaultNotificationPreferences
                .FirstOrDefaultAsync(p => p.UserId == userId && p.NotificationType == pref.NotificationType);

            if (existing != null)
            {
                existing.IsEnabled = pref.IsEnabled;
                existing.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                // Crear nueva preferencia
                _context.VaultNotificationPreferences.Add(new VaultNotificationPreference
                {
                    UserId = userId,
                    NotificationType = pref.NotificationType,
                    IsEnabled = pref.IsEnabled,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        await _context.SaveChangesAsync();
    }

    public async Task<List<VaultNotificationTypeDto>> GetNotificationTypesAsync()
    {
        var types = await _context.VaultNotificationTypes
            .AsNoTracking()
            .Where(t => t.IsActive)
            .OrderBy(t => t.DisplayOrder)
            .Select(t => new VaultNotificationTypeDto
            {
                Code = t.Code,
                DisplayName = t.DisplayName,
                Description = t.Description,
                DefaultEnabled = t.DefaultEnabled,
                Category = t.Category,
                DisplayOrder = t.DisplayOrder
            })
            .ToListAsync();

        return types;
    }

    private async Task InitializeUserPreferencesAsync(string userId)
    {
        // Obtener tipos activos que el usuario no tiene
        var existingTypes = await _context.VaultNotificationPreferences
            .Where(p => p.UserId == userId)
            .Select(p => p.NotificationType)
            .ToListAsync();

        var missingTypes = await _context.VaultNotificationTypes
            .Where(t => t.IsActive && !existingTypes.Contains(t.Code))
            .ToListAsync();

        if (missingTypes.Any())
        {
            foreach (var type in missingTypes)
            {
                _context.VaultNotificationPreferences.Add(new VaultNotificationPreference
                {
                    UserId = userId,
                    NotificationType = type.Code,
                    IsEnabled = type.DefaultEnabled,
                    CreatedAt = DateTime.UtcNow
                });
            }

            await _context.SaveChangesAsync();
        }
    }

    // =============================================
    // Métodos de Notificación
    // =============================================

    public async Task NotifyCredentialCreatedAsync(Credential credential, string creatorName)
    {
        // Solo notificar si la credencial tiene acceso compartido (no privadas sin compartir)
        var recipients = await GetCredentialRecipientsAsync(credential, credential.OwnerUserId);
        if (!recipients.Any()) return;

        var subject = $"[SQLNova Vault] Nueva credencial creada: {credential.Name}";
        var body = BuildCredentialCreatedEmail(credential, creatorName);

        foreach (var recipient in recipients)
        {
            // Verificar preferencias del usuario
            if (await ShouldNotifyUserAsync(recipient.Id, VaultNotificationTypeCodes.CredentialCreated))
            {
                await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, VaultNotificationTypeCodes.CredentialCreated);
            }
        }
    }

    public async Task NotifyCredentialUpdatedAsync(Credential credential, string updaterName, bool passwordChanged)
    {
        var recipients = await GetCredentialRecipientsAsync(credential, null);
        if (!recipients.Any()) return;

        var subject = passwordChanged 
            ? $"[SQLNova Vault] Contraseña cambiada: {credential.Name}"
            : $"[SQLNova Vault] Credencial actualizada: {credential.Name}";
        var body = BuildCredentialUpdatedEmail(credential, updaterName, passwordChanged);

        foreach (var recipient in recipients)
        {
            if (await ShouldNotifyUserAsync(recipient.Id, VaultNotificationTypeCodes.CredentialUpdated))
            {
                await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, VaultNotificationTypeCodes.CredentialUpdated);
            }
        }
    }

    public async Task NotifyCredentialDeletedAsync(Credential credential, string deleterName)
    {
        var recipients = await GetCredentialRecipientsAsync(credential, null);
        if (!recipients.Any()) return;

        var subject = $"[SQLNova Vault] Credencial eliminada: {credential.Name}";
        var body = BuildCredentialDeletedEmail(credential, deleterName);

        foreach (var recipient in recipients)
        {
            if (await ShouldNotifyUserAsync(recipient.Id, VaultNotificationTypeCodes.CredentialDeleted))
            {
                await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, VaultNotificationTypeCodes.CredentialDeleted);
            }
        }
    }

    public async Task NotifyCredentialSharedAsync(Credential credential, string sharerName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        // Verificar preferencias del usuario destino
        if (!await ShouldNotifyUserAsync(targetUserId, VaultNotificationTypeCodes.CredentialShared))
            return;

        var subject = $"[SQLNova Vault] {sharerName} compartió una credencial contigo";
        var body = BuildCredentialSharedEmail(credential, sharerName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, VaultNotificationTypeCodes.CredentialShared);
    }

    public async Task NotifyShareRevokedAsync(Credential credential, string revokerName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        if (!await ShouldNotifyUserAsync(targetUserId, VaultNotificationTypeCodes.ShareRevoked))
            return;

        var subject = $"[SQLNova Vault] Acceso revocado a credencial: {credential.Name}";
        var body = BuildShareRevokedEmail(credential, revokerName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, VaultNotificationTypeCodes.ShareRevoked);
    }

    public async Task NotifyAddedToGroupAsync(CredentialGroup group, string adderName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        if (!await ShouldNotifyUserAsync(targetUserId, VaultNotificationTypeCodes.GroupMemberAdded))
            return;

        var subject = $"[SQLNova Vault] Te agregaron al grupo: {group.Name}";
        var body = BuildAddedToGroupEmail(group, adderName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, VaultNotificationTypeCodes.GroupMemberAdded);
    }

    public async Task NotifyRemovedFromGroupAsync(CredentialGroup group, string removerName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        if (!await ShouldNotifyUserAsync(targetUserId, VaultNotificationTypeCodes.GroupMemberRemoved))
            return;

        var subject = $"[SQLNova Vault] Te removieron del grupo: {group.Name}";
        var body = BuildRemovedFromGroupEmail(group, removerName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, VaultNotificationTypeCodes.GroupMemberRemoved);
    }

    public async Task NotifyGroupMembersAsync(int groupId, string subject, string message, string excludeUserId)
    {
        var members = await _context.Set<CredentialGroupMember>()
            .Include(m => m.User)
            .Where(m => m.GroupId == groupId && m.ReceiveNotifications && m.UserId != excludeUserId)
            .Where(m => m.User != null && m.User.Email != null)
            .ToListAsync();

        foreach (var member in members)
        {
            // Verificar preferencias (usamos CredentialUpdated como tipo genérico para notificaciones de grupo)
            if (await ShouldNotifyUserAsync(member.UserId, VaultNotificationTypeCodes.CredentialUpdated))
            {
                var body = BuildGenericNotificationEmail(member.User!.DisplayName ?? "Usuario", message);
                await SendEmailAsync(member.User.Email!, member.User.DisplayName, subject, body, "VaultGroupNotification");
            }
        }
    }

    public async Task NotifyExpiringCredentialsAsync()
    {
        var expirationThreshold = DateTime.UtcNow.AddDays(7);
        
        var expiringCredentials = await _context.Credentials
            .Include(c => c.Owner)
            .Include(c => c.Group)
            .ThenInclude(g => g!.Members)
            .ThenInclude(m => m.User)
            .Include(c => c.UserShares)
            .ThenInclude(us => us.User)
            .Where(c => !c.IsDeleted && c.ExpiresAt != null && c.ExpiresAt <= expirationThreshold && c.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();

        foreach (var credential in expiringCredentials)
        {
            var recipients = await GetCredentialRecipientsAsync(credential, null);
            var daysUntilExpiry = (credential.ExpiresAt!.Value - DateTime.UtcNow).Days;
            
            var subject = $"[SQLNova Vault] ⚠️ Credencial por expirar: {credential.Name}";
            var body = BuildExpiringCredentialEmail(credential, daysUntilExpiry);

            foreach (var recipient in recipients)
            {
                if (await ShouldNotifyUserAsync(recipient.Id, VaultNotificationTypeCodes.CredentialExpiring))
                {
                    await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, VaultNotificationTypeCodes.CredentialExpiring);
                }
            }
        }
    }

    public async Task NotifyPasswordRevealedAsync(Credential credential, string revealerName, string revealerId)
    {
        // Notificar al propietario y a quien compartió la credencial
        var recipientIds = new HashSet<string>();

        // Propietario
        if (!string.IsNullOrEmpty(credential.OwnerUserId) && credential.OwnerUserId != revealerId)
        {
            recipientIds.Add(credential.OwnerUserId);
        }

        // Quien compartió directamente (si fue compartida con el revelador)
        var userShare = await _context.CredentialUserShares
            .FirstOrDefaultAsync(us => us.CredentialId == credential.Id && us.UserId == revealerId);

        if (userShare != null && !string.IsNullOrEmpty(userShare.SharedByUserId) && userShare.SharedByUserId != revealerId)
        {
            recipientIds.Add(userShare.SharedByUserId);
        }

        foreach (var recipientId in recipientIds)
        {
            if (!await ShouldNotifyUserAsync(recipientId, VaultNotificationTypeCodes.PasswordRevealed))
                continue;

            var recipient = await _context.Users.FindAsync(recipientId);
            if (recipient?.Email == null) continue;

            var subject = $"[SQLNova Vault] 🔓 Contraseña revelada: {credential.Name}";
            var body = BuildPasswordRevealedEmail(credential, revealerName, recipient.DisplayName ?? "Usuario");

            await SendEmailAsync(recipient.Email, recipient.DisplayName, subject, body, VaultNotificationTypeCodes.PasswordRevealed);
        }
    }

    // =============================================
    // Helper Methods
    // =============================================

    private async Task<List<ApplicationUser>> GetCredentialRecipientsAsync(Credential credential, string? excludeUserId)
    {
        var recipients = new List<ApplicationUser>();
        var addedUserIds = new HashSet<string>();

        // Si es privada y no compartida, no notificar a nadie excepto al propietario
        if (credential.IsPrivate && !credential.IsTeamShared)
        {
            // Solo incluir propietario si tiene acceso compartido con usuarios o grupos
            var hasShares = await _context.CredentialUserShares.AnyAsync(us => us.CredentialId == credential.Id)
                || await _context.CredentialGroupShares.AnyAsync(gs => gs.CredentialId == credential.Id);

            if (!hasShares)
            {
                return recipients; // No notificar credenciales completamente privadas
            }
        }

        // Incluir al propietario si tiene email (excepto si es el excluido)
        if (!string.IsNullOrEmpty(credential.OwnerUserId) && credential.OwnerUserId != excludeUserId)
        {
            var owner = credential.Owner ?? await _context.Users.FindAsync(credential.OwnerUserId);
            if (owner?.Email != null && addedUserIds.Add(owner.Id))
            {
                recipients.Add(owner);
            }
        }

        // Si pertenece a un grupo, incluir miembros con notificaciones habilitadas
        if (credential.GroupId.HasValue)
        {
            var groupMembers = await _context.Set<CredentialGroupMember>()
                .Include(m => m.User)
                .Where(m => m.GroupId == credential.GroupId && m.ReceiveNotifications)
                .Where(m => m.User != null && m.User.Email != null)
                .Where(m => excludeUserId == null || m.UserId != excludeUserId)
                .Select(m => m.User!)
                .ToListAsync();

            foreach (var member in groupMembers)
            {
                if (addedUserIds.Add(member.Id))
                {
                    recipients.Add(member);
                }
            }
        }

        // Incluir usuarios con quienes se compartió directamente
        var userShares = await _context.CredentialUserShares
            .Include(us => us.User)
            .Where(us => us.CredentialId == credential.Id)
            .Where(us => us.User != null && us.User.Email != null)
            .Where(us => excludeUserId == null || us.UserId != excludeUserId)
            .Select(us => us.User!)
            .ToListAsync();

        foreach (var user in userShares)
        {
            if (addedUserIds.Add(user.Id))
            {
                recipients.Add(user);
            }
        }

        // Incluir usuarios de grupos con quienes se compartió
        var groupShares = await _context.CredentialGroupShares
            .Where(gs => gs.CredentialId == credential.Id)
            .Select(gs => gs.GroupId)
            .ToListAsync();

        if (groupShares.Any())
        {
            var groupShareMembers = await _context.Set<CredentialGroupMember>()
                .Include(m => m.User)
                .Where(m => groupShares.Contains(m.GroupId) && m.ReceiveNotifications)
                .Where(m => m.User != null && m.User.Email != null)
                .Where(m => excludeUserId == null || m.UserId != excludeUserId)
                .Select(m => m.User!)
                .ToListAsync();

            foreach (var member in groupShareMembers)
            {
                if (addedUserIds.Add(member.Id))
                {
                    recipients.Add(member);
                }
            }
        }

        return recipients;
    }

    private string BuildCredentialCreatedEmail(Credential credential, string creatorName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #059669 0%, #10b981 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #059669; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>🔑</div>
            <h1>Nueva Credencial Creada</h1>
        </div>
        <div class='content'>
            <p><strong>{creatorName}</strong> ha creado una nueva credencial en el Vault.</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}<br/>
                {(credential.GroupId.HasValue && credential.Group != null ? $"<strong>Grupo:</strong> {credential.Group.Name}<br/>" : "")}
                {(credential.ExpiresAt.HasValue ? $"<strong>Expira:</strong> {credential.ExpiresAt:dd/MM/yyyy}<br/>" : "")}
            </div>
            
            {(string.IsNullOrEmpty(credential.Description) ? "" : $"<p><strong>Descripción:</strong> {credential.Description}</p>")}
            
            <a href='{_appUrl}/vault/credentials' class='btn'>Ver en el Vault</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildCredentialUpdatedEmail(Credential credential, string updaterName, bool passwordChanged)
    {
        var changeType = passwordChanged ? "ha cambiado la contraseña de" : "ha actualizado";
        var headerColor = passwordChanged ? "#dc2626" : "#f59e0b";
        var icon = passwordChanged ? "🔐" : "✏️";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, {headerColor} 0%, {headerColor}cc 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: {headerColor}; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid {headerColor}; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .warning {{ background-color: #fef3c7; border: 1px solid #fcd34d; padding: 10px; border-radius: 4px; margin: 10px 0; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>{icon}</div>
            <h1>{(passwordChanged ? "Contraseña Cambiada" : "Credencial Actualizada")}</h1>
        </div>
        <div class='content'>
            <p><strong>{updaterName}</strong> {changeType} la credencial:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}
            </div>
            
            {(passwordChanged ? "<div class='warning'><strong>⚠️ Importante:</strong> La contraseña de esta credencial ha sido modificada. Si la usabas, deberás obtener la nueva contraseña desde el Vault.</div>" : "")}
            
            <a href='{_appUrl}/vault/credentials' class='btn'>Ver en el Vault</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildCredentialDeletedEmail(Credential credential, string deleterName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>🗑️</div>
            <h1>Credencial Eliminada</h1>
        </div>
        <div class='content'>
            <p><strong>{deleterName}</strong> ha eliminado la siguiente credencial del Vault:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}
            </div>
            
            <p>Esta credencial ya no está disponible en el Vault.</p>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildCredentialSharedEmail(Credential credential, string sharerName, string targetName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #7c3aed; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>🤝</div>
            <h1>Credencial Compartida</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{targetName}</strong>,</p>
            
            <p><strong>{sharerName}</strong> ha compartido una credencial contigo:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}
            </div>
            
            <p>Ahora puedes ver y usar esta credencial desde el Vault.</p>
            
            <a href='{_appUrl}/vault/shared-with-me' class='btn'>Ver Credenciales Compartidas</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildShareRevokedEmail(Credential credential, string revokerName, string targetName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>🚫</div>
            <h1>Acceso Revocado</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{targetName}</strong>,</p>
            
            <p><strong>{revokerName}</strong> ha revocado tu acceso a la credencial:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}
            </div>
            
            <p>Ya no tienes acceso a esta credencial. Si crees que esto es un error, contacta al administrador.</p>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildAddedToGroupEmail(CredentialGroup group, string adderName, string targetName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2563eb; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>👥</div>
            <h1>Agregado a un Grupo</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{targetName}</strong>,</p>
            
            <p><strong>{adderName}</strong> te ha agregado al grupo de credenciales:</p>
            
            <div class='info-box'>
                <strong>Grupo:</strong> {group.Name}<br/>
                {(string.IsNullOrEmpty(group.Description) ? "" : $"<strong>Descripción:</strong> {group.Description}")}
            </div>
            
            <p>Ahora tienes acceso a todas las credenciales de este grupo.</p>
            
            <a href='{_appUrl}/vault/groups' class='btn'>Ver Mis Grupos</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildRemovedFromGroupEmail(CredentialGroup group, string removerName, string targetName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>👤</div>
            <h1>Removido de un Grupo</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{targetName}</strong>,</p>
            
            <p>Has sido removido del grupo de credenciales:</p>
            
            <div class='info-box'>
                <strong>Grupo:</strong> {group.Name}
            </div>
            
            <p>Ya no tienes acceso a las credenciales de este grupo.</p>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildExpiringCredentialEmail(Credential credential, int daysUntilExpiry)
    {
        var urgency = daysUntilExpiry <= 1 ? "🚨" : daysUntilExpiry <= 3 ? "⚠️" : "⏰";
        var headerColor = daysUntilExpiry <= 1 ? "#dc2626" : daysUntilExpiry <= 3 ? "#f59e0b" : "#eab308";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, {headerColor} 0%, {headerColor}cc 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: {headerColor}; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid {headerColor}; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .days-badge {{ font-size: 24px; font-weight: bold; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>{urgency}</div>
            <h1>Credencial por Expirar</h1>
            <p class='days-badge'>{(daysUntilExpiry == 0 ? "¡Expira hoy!" : daysUntilExpiry == 1 ? "Expira mañana" : $"Expira en {daysUntilExpiry} días")}</p>
        </div>
        <div class='content'>
            <p>La siguiente credencial está próxima a expirar:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}<br/>
                <strong>Fecha de expiración:</strong> {credential.ExpiresAt:dd/MM/yyyy}
            </div>
            
            <p>Por favor, actualiza la contraseña antes de la fecha de expiración para evitar interrupciones.</p>
            
            <a href='{_appUrl}/vault/credentials' class='btn'>Actualizar Credencial</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildPasswordRevealedEmail(Credential credential, string revealerName, string ownerName)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }}
        .icon {{ font-size: 48px; margin-bottom: 10px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <div class='icon'>🔓</div>
            <h1>Contraseña Revelada</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{ownerName}</strong>,</p>
            
            <p><strong>{revealerName}</strong> ha revelado la contraseña de tu credencial:</p>
            
            <div class='info-box'>
                <strong>Nombre:</strong> {credential.Name}<br/>
                <strong>Tipo:</strong> {GetCredentialTypeLabel(credential.CredentialType)}<br/>
                <strong>Usuario:</strong> {(string.IsNullOrEmpty(credential.Domain) ? credential.Username : $"{credential.Domain}\\{credential.Username}")}<br/>
                <strong>Fecha:</strong> {DateTime.Now:dd/MM/yyyy HH:mm}
            </div>
            
            <p>Este es un aviso informativo. Puedes ver más detalles en el registro de auditoría.</p>
            
            <a href='{_appUrl}/vault/audit' class='btn'>Ver Auditoría</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private string BuildGenericNotificationEmail(string recipientName, string message)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #475569 0%, #64748b 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #475569; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .settings-link {{ color: #94a3b8; font-size: 11px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Notificación del Vault</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{recipientName}</strong>,</p>
            
            <p>{message}</p>
            
            <a href='{_appUrl}/vault' class='btn'>Ir al Vault</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.<br/>
            <a href='{_appUrl}/vault/notifications' class='settings-link'>Configurar notificaciones</a>
        </div>
    </div>
</body>
</html>";
    }

    private static string GetCredentialTypeLabel(string type) => type switch
    {
        "SqlAuth" => "SQL Server Authentication",
        "WindowsAD" => "Windows / Active Directory",
        _ => type
    };

    private async Task SendEmailAsync(string toEmail, string? toName, string subject, string htmlBody, string notificationType)
    {
        try
        {
            // Usar el servicio SMTP centralizado que usa la configuración global
            var success = await _smtpService.SendEmailAsync(
                toEmail, 
                toName, 
                subject, 
                htmlBody, 
                notificationType, 
                "Vault", 
                null);

            if (success)
            {
                _logger.LogInformation("Email del Vault enviado a {Email}: {Subject}", toEmail, subject);
            }
            else
            {
                _logger.LogWarning("No se pudo enviar email del Vault a {Email}: {Subject}", toEmail, subject);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar email del Vault a {Email}: {Subject}", toEmail, subject);
        }
    }
}
