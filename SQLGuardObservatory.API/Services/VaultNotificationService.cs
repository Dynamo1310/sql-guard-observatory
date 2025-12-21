using System.Net;
using System.Net.Mail;
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
}

/// <summary>
/// Servicio de notificaciones por email para el Vault de Credenciales
/// </summary>
public class VaultNotificationService : IVaultNotificationService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<VaultNotificationService> _logger;
    private readonly string _appUrl;

    public VaultNotificationService(
        ApplicationDbContext context,
        IConfiguration configuration,
        ILogger<VaultNotificationService> logger)
    {
        _context = context;
        _logger = logger;
        _appUrl = configuration["AppUrl"] ?? "http://asprbm-nov-01:8080";
    }

    public async Task NotifyCredentialCreatedAsync(Credential credential, string creatorName)
    {
        if (credential.IsPrivate) return; // No notificar credenciales privadas

        var recipients = await GetCredentialRecipientsAsync(credential);
        if (!recipients.Any()) return;

        var subject = $"[SQLNova Vault] Nueva credencial creada: {credential.Name}";
        var body = BuildCredentialCreatedEmail(credential, creatorName);

        foreach (var recipient in recipients)
        {
            await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, "VaultCredentialCreated");
        }
    }

    public async Task NotifyCredentialUpdatedAsync(Credential credential, string updaterName, bool passwordChanged)
    {
        if (credential.IsPrivate) return;

        var recipients = await GetCredentialRecipientsAsync(credential);
        if (!recipients.Any()) return;

        var subject = passwordChanged 
            ? $"[SQLNova Vault] Contraseña cambiada: {credential.Name}"
            : $"[SQLNova Vault] Credencial actualizada: {credential.Name}";
        var body = BuildCredentialUpdatedEmail(credential, updaterName, passwordChanged);

        foreach (var recipient in recipients)
        {
            await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, "VaultCredentialUpdated");
        }
    }

    public async Task NotifyCredentialDeletedAsync(Credential credential, string deleterName)
    {
        if (credential.IsPrivate) return;

        var recipients = await GetCredentialRecipientsAsync(credential);
        if (!recipients.Any()) return;

        var subject = $"[SQLNova Vault] Credencial eliminada: {credential.Name}";
        var body = BuildCredentialDeletedEmail(credential, deleterName);

        foreach (var recipient in recipients)
        {
            await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, "VaultCredentialDeleted");
        }
    }

    public async Task NotifyCredentialSharedAsync(Credential credential, string sharerName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        var subject = $"[SQLNova Vault] {sharerName} compartió una credencial contigo";
        var body = BuildCredentialSharedEmail(credential, sharerName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, "VaultCredentialShared");
    }

    public async Task NotifyAddedToGroupAsync(CredentialGroup group, string adderName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        var subject = $"[SQLNova Vault] Te agregaron al grupo: {group.Name}";
        var body = BuildAddedToGroupEmail(group, adderName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, "VaultGroupMemberAdded");
    }

    public async Task NotifyRemovedFromGroupAsync(CredentialGroup group, string removerName, string targetUserId)
    {
        var targetUser = await _context.Users.FindAsync(targetUserId);
        if (targetUser?.Email == null) return;

        var subject = $"[SQLNova Vault] Te removieron del grupo: {group.Name}";
        var body = BuildRemovedFromGroupEmail(group, removerName, targetUser.DisplayName ?? targetUser.UserName ?? "Usuario");

        await SendEmailAsync(targetUser.Email, targetUser.DisplayName, subject, body, "VaultGroupMemberRemoved");
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
            var body = BuildGenericNotificationEmail(member.User!.DisplayName ?? "Usuario", message);
            await SendEmailAsync(member.User.Email!, member.User.DisplayName, subject, body, "VaultGroupNotification");
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
            .Where(c => !c.IsDeleted && c.ExpiresAt != null && c.ExpiresAt <= expirationThreshold && c.ExpiresAt > DateTime.UtcNow)
            .ToListAsync();

        foreach (var credential in expiringCredentials)
        {
            var recipients = await GetCredentialRecipientsAsync(credential);
            var daysUntilExpiry = (credential.ExpiresAt!.Value - DateTime.UtcNow).Days;
            
            var subject = $"[SQLNova Vault] ⚠️ Credencial por expirar: {credential.Name}";
            var body = BuildExpiringCredentialEmail(credential, daysUntilExpiry);

            foreach (var recipient in recipients)
            {
                await SendEmailAsync(recipient.Email!, recipient.DisplayName, subject, body, "VaultCredentialExpiring");
            }
        }
    }

    // =============================================
    // Helper Methods
    // =============================================

    private async Task<List<ApplicationUser>> GetCredentialRecipientsAsync(Credential credential)
    {
        var recipients = new List<ApplicationUser>();

        // Siempre incluir al propietario si tiene email
        if (credential.Owner?.Email != null)
        {
            recipients.Add(credential.Owner);
        }
        else if (!string.IsNullOrEmpty(credential.OwnerUserId))
        {
            var owner = await _context.Users.FindAsync(credential.OwnerUserId);
            if (owner?.Email != null)
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
                .Select(m => m.User!)
                .ToListAsync();

            foreach (var member in groupMembers)
            {
                if (!recipients.Any(r => r.Id == member.Id))
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
            Este es un mensaje automático, por favor no responder.
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
            Este es un mensaje automático, por favor no responder.
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
            Este es un mensaje automático, por favor no responder.
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
            
            <a href='{_appUrl}/vault/credentials' class='btn'>Ver en el Vault</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.
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
            
            <a href='{_appUrl}/vault/credentials' class='btn'>Ver Credenciales del Grupo</a>
        </div>
        <div class='footer'>
            SQLNova Vault - Gestión Segura de Credenciales DBA<br/>
            Este es un mensaje automático, por favor no responder.
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
            Este es un mensaje automático, por favor no responder.
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
            Este es un mensaje automático, por favor no responder.
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
            Este es un mensaje automático, por favor no responder.
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
        var settings = await _context.SmtpSettings.FirstOrDefaultAsync(s => s.IsActive);

        if (settings == null)
        {
            _logger.LogWarning("No hay configuración SMTP activa. Email no enviado a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, toName, subject, htmlBody, "Failed", "No hay configuración SMTP activa", notificationType);
            return;
        }

        try
        {
            using var client = new SmtpClient(settings.Host, settings.Port);

            if (!string.IsNullOrEmpty(settings.Username))
            {
                client.Credentials = new NetworkCredential(settings.Username, settings.Password);
            }

            client.EnableSsl = settings.EnableSsl;
            client.DeliveryMethod = SmtpDeliveryMethod.Network;

            var message = new MailMessage
            {
                From = new MailAddress(settings.FromEmail, settings.FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };

            message.To.Add(new MailAddress(toEmail, toName));

            await client.SendMailAsync(message);

            _logger.LogInformation("Email del Vault enviado a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, toName, subject, htmlBody, "Sent", null, notificationType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar email del Vault a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, toName, subject, htmlBody, "Failed", ex.Message, notificationType);
        }
    }

    private async Task LogNotification(string toEmail, string? toName, string subject, string? body,
        string status, string? errorMessage, string notificationType)
    {
        try
        {
            var log = new NotificationLog
            {
                NotificationType = notificationType,
                ToEmail = toEmail,
                ToName = toName,
                Subject = subject,
                Body = body,
                Status = status,
                ErrorMessage = errorMessage,
                ReferenceType = "Vault",
                SentAt = DateTime.Now
            };

            _context.NotificationLogs.Add(log);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al registrar notificación del Vault en el log");
        }
    }
}

