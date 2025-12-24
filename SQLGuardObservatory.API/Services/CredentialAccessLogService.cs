using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de registro de accesos (Vault Enterprise v2.1.1)
/// </summary>
public class CredentialAccessLogService : ICredentialAccessLogService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CredentialAccessLogService> _logger;
    private HttpContext? _httpContext;

    // Tipos de acceso extendidos para v2.1.1
    private static class AccessTypes
    {
        public const string Reveal = "Reveal";
        public const string RevealDenied = "RevealDenied";
        public const string Use = "Use";
        public const string UseDenied = "UseDenied";
        public const string Copy = "Copy";
        public const string AttemptDenied = "AttemptDenied";
    }

    public CredentialAccessLogService(ApplicationDbContext context, ILogger<CredentialAccessLogService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public void SetHttpContext(HttpContext? httpContext)
    {
        _httpContext = httpContext;
    }

    public async Task LogRevealAsync(int credentialId, string userId, bool success, string? denialReason = null)
    {
        var log = CreateLogEntry(credentialId, userId);
        log.AccessType = success ? AccessTypes.Reveal : AccessTypes.RevealDenied;
        log.AccessResult = success ? AccessResults.Success : AccessResults.Denied;
        log.DenialReason = denialReason;

        await SaveLogAsync(log);
        
        if (!success)
        {
            _logger.LogWarning("Reveal denied for credential {CredentialId} by user {UserId}: {Reason}", 
                credentialId, userId, denialReason);
        }
    }

    public async Task LogUseAsync(int credentialId, string userId, string? targetServer, string? targetInstance, bool success, string? denialReason = null)
    {
        var log = CreateLogEntry(credentialId, userId);
        log.AccessType = success ? AccessTypes.Use : AccessTypes.UseDenied;
        log.AccessResult = success ? AccessResults.Success : AccessResults.Denied;
        log.TargetServerName = targetServer;
        log.TargetInstanceName = targetInstance;
        log.DenialReason = denialReason;

        await SaveLogAsync(log);

        if (!success)
        {
            _logger.LogWarning("Use denied for credential {CredentialId} by user {UserId}: {Reason}", 
                credentialId, userId, denialReason);
        }
    }

    public async Task LogCopyAsync(int credentialId, string userId)
    {
        var log = CreateLogEntry(credentialId, userId);
        log.AccessType = AccessTypes.Copy;
        log.AccessResult = AccessResults.Success;

        await SaveLogAsync(log);
    }

    public async Task LogDeniedAsync(int credentialId, string userId, string attemptedAction, string reason)
    {
        var log = CreateLogEntry(credentialId, userId);
        log.AccessType = AccessTypes.AttemptDenied;
        log.AccessResult = AccessResults.Denied;
        log.DenialReason = $"{attemptedAction}: {reason}";

        await SaveLogAsync(log);

        _logger.LogWarning("Access denied: {Action} for credential {CredentialId} by user {UserId}: {Reason}", 
            attemptedAction, credentialId, userId, reason);
    }

    public async Task<List<CredentialAccessLogDto>> GetAccessLogAsync(int credentialId, int limit = 100)
    {
        var logs = await _context.CredentialAccessLogs
            .AsNoTracking()
            .Where(l => l.CredentialId == credentialId)
            .OrderByDescending(l => l.AccessedAt)
            .Take(limit)
            .ToListAsync();
        
        // Obtener nombre de la credencial
        var credential = await _context.Credentials.FindAsync(credentialId);
        var credentialName = credential?.Name;
        
        return logs.Select(l => new CredentialAccessLogDto
        {
            Id = l.Id,
            CredentialId = l.CredentialId,
            SystemCredentialId = l.SystemCredentialId,
            CredentialName = credentialName,
            CredentialSource = "Vault",
            AccessType = l.AccessType,
            AccessResult = l.AccessResult,
            DenialReason = l.DenialReason,
            TargetServerName = l.TargetServerName,
            UserId = l.UserId,
            UserName = l.UserName,
            AccessedAt = l.AccessedAt.DateTime,
            IpAddress = l.IpAddress
        }).ToList();
    }

    // ==================== System Credentials ====================

    public async Task LogSystemCredentialRevealAsync(int systemCredentialId, string userId, bool success, string? denialReason = null)
    {
        var log = CreateSystemLogEntry(systemCredentialId, userId);
        log.AccessType = success ? AccessTypes.Reveal : AccessTypes.RevealDenied;
        log.AccessResult = success ? AccessResults.Success : AccessResults.Denied;
        log.DenialReason = denialReason;

        await SaveLogAsync(log);
        
        if (!success)
        {
            _logger.LogWarning("SystemCredential reveal denied for {SystemCredentialId} by user {UserId}: {Reason}", 
                systemCredentialId, userId, denialReason);
        }
    }

    public async Task LogSystemCredentialCopyAsync(int systemCredentialId, string userId)
    {
        var log = CreateSystemLogEntry(systemCredentialId, userId);
        log.AccessType = AccessTypes.Copy;
        log.AccessResult = AccessResults.Success;

        await SaveLogAsync(log);
    }

    public async Task LogSystemCredentialUseAsync(int systemCredentialId, string userId, string? targetServer, bool success, string? serviceName = null)
    {
        var log = CreateSystemLogEntry(systemCredentialId, userId);
        log.AccessType = success ? AccessTypes.Use : AccessTypes.UseDenied;
        log.AccessResult = success ? AccessResults.Success : AccessResults.Failed;
        log.TargetServerName = targetServer;
        log.DenialReason = serviceName; // Usamos este campo para guardar el servicio que usó la credencial

        await SaveLogAsync(log);
    }

    public async Task<List<CredentialAccessLogDto>> GetSystemCredentialAccessLogAsync(int systemCredentialId, int limit = 100)
    {
        var logs = await _context.CredentialAccessLogs
            .AsNoTracking()
            .Where(l => l.SystemCredentialId == systemCredentialId)
            .OrderByDescending(l => l.AccessedAt)
            .Take(limit)
            .ToListAsync();
        
        // Obtener nombre de la credencial de sistema
        var credential = await _context.SystemCredentials.FindAsync(systemCredentialId);
        var credentialName = credential?.Name;
        
        return logs.Select(l => new CredentialAccessLogDto
        {
            Id = l.Id,
            CredentialId = l.CredentialId,
            SystemCredentialId = l.SystemCredentialId,
            CredentialName = credentialName,
            CredentialSource = "System",
            AccessType = l.AccessType,
            AccessResult = l.AccessResult,
            DenialReason = l.DenialReason,
            TargetServerName = l.TargetServerName,
            UserId = l.UserId,
            UserName = l.UserName,
            AccessedAt = l.AccessedAt.DateTime,
            IpAddress = l.IpAddress
        }).ToList();
    }

    public async Task<List<CredentialAccessLogDto>> GetAllAccessLogsAsync(int limit = 100)
    {
        var logs = await _context.CredentialAccessLogs
            .AsNoTracking()
            .OrderByDescending(l => l.AccessedAt)
            .Take(limit)
            .ToListAsync();
        
        // Obtener IDs únicos de credenciales
        var vaultIds = logs.Where(l => l.CredentialId.HasValue).Select(l => l.CredentialId!.Value).Distinct().ToList();
        var systemIds = logs.Where(l => l.SystemCredentialId.HasValue).Select(l => l.SystemCredentialId!.Value).Distinct().ToList();
        
        // Obtener nombres de credenciales
        var vaultNames = await _context.Credentials
            .Where(c => vaultIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name);
        
        var systemNames = await _context.SystemCredentials
            .Where(c => systemIds.Contains(c.Id))
            .ToDictionaryAsync(c => c.Id, c => c.Name);
        
        return logs.Select(l => new CredentialAccessLogDto
        {
            Id = l.Id,
            CredentialId = l.CredentialId,
            SystemCredentialId = l.SystemCredentialId,
            CredentialName = l.CredentialId.HasValue 
                ? (vaultNames.TryGetValue(l.CredentialId.Value, out var vn) ? vn : null)
                : (l.SystemCredentialId.HasValue && systemNames.TryGetValue(l.SystemCredentialId.Value, out var sn) ? sn : null),
            CredentialSource = l.SystemCredentialId.HasValue ? "System" : "Vault",
            AccessType = l.AccessType,
            AccessResult = l.AccessResult,
            DenialReason = l.DenialReason,
            TargetServerName = l.TargetServerName,
            UserId = l.UserId,
            UserName = l.UserName,
            AccessedAt = l.AccessedAt.DateTime,
            IpAddress = l.IpAddress
        }).ToList();
    }

    private CredentialAccessLog CreateLogEntry(int credentialId, string userId)
    {
        var log = CreateBaseLogEntry(userId);
        log.CredentialId = credentialId;
        return log;
    }

    private CredentialAccessLog CreateSystemLogEntry(int systemCredentialId, string userId)
    {
        var log = CreateBaseLogEntry(userId);
        log.SystemCredentialId = systemCredentialId;
        return log;
    }

    private CredentialAccessLog CreateBaseLogEntry(string userId)
    {
        var log = new CredentialAccessLog
        {
            UserId = userId,
            AccessedAt = new DateTimeOffset(LocalClockAR.Now, TimeSpan.FromHours(-3))
        };

        // Capturar información del contexto HTTP si está disponible
        if (_httpContext != null)
        {
            log.IpAddress = GetClientIpAddress();
            log.UserAgent = GetUserAgent();
            
            // Obtener nombre de usuario del contexto
            var userName = _httpContext.User?.Identity?.Name;
            if (!string.IsNullOrEmpty(userName))
            {
                log.UserName = userName;
            }
        }

        return log;
    }

    private async Task SaveLogAsync(CredentialAccessLog log)
    {
        try
        {
            _context.CredentialAccessLogs.Add(log);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            // Log de acceso nunca debe fallar silenciosamente, pero tampoco debe romper la operación
            _logger.LogError(ex, "Failed to save access log for credential {CredentialId}", log.CredentialId);
        }
    }

    private string? GetClientIpAddress()
    {
        if (_httpContext == null) return null;

        // Verificar headers de proxy primero
        var forwardedFor = _httpContext.Request.Headers["X-Forwarded-For"].FirstOrDefault();
        if (!string.IsNullOrEmpty(forwardedFor))
        {
            return forwardedFor.Split(',').FirstOrDefault()?.Trim();
        }

        var realIp = _httpContext.Request.Headers["X-Real-IP"].FirstOrDefault();
        if (!string.IsNullOrEmpty(realIp))
        {
            return realIp;
        }

        return _httpContext.Connection.RemoteIpAddress?.ToString();
    }

    private string? GetUserAgent()
    {
        var userAgent = _httpContext?.Request.Headers["User-Agent"].FirstOrDefault();
        // Limitar longitud para evitar problemas de storage
        if (!string.IsNullOrEmpty(userAgent) && userAgent.Length > 500)
        {
            return userAgent.Substring(0, 500);
        }
        return userAgent;
    }
}

