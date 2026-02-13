using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de exclusiones globales de servidores.
/// Filtra servidores dados de baja de todas las alertas.
/// </summary>
public class ServerExclusionService : IServerExclusionService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<ServerExclusionService> _logger;

    public ServerExclusionService(
        ApplicationDbContext context,
        ILogger<ServerExclusionService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<ServerAlertExclusion>> GetAllExclusionsAsync(CancellationToken ct = default)
    {
        return await _context.ServerAlertExclusions
            .AsNoTracking()
            .OrderByDescending(e => e.CreatedAtUtc)
            .ToListAsync(ct);
    }

    public async Task<List<ServerAlertExclusion>> GetActiveExclusionsAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        return await _context.ServerAlertExclusions
            .AsNoTracking()
            .Where(e => e.IsActive && (e.ExpiresAtUtc == null || e.ExpiresAtUtc > now))
            .OrderByDescending(e => e.CreatedAtUtc)
            .ToListAsync(ct);
    }

    public async Task<HashSet<string>> GetExcludedServerNamesAsync(CancellationToken ct = default)
    {
        var activeExclusions = await GetActiveExclusionsAsync(ct);
        var excludedNames = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var exclusion in activeExclusions)
        {
            // Agregar el nombre tal cual
            excludedNames.Add(exclusion.ServerName);
            
            // Agregar variantes para matching flexible
            // Si es instancia (SERVER\INSTANCE), agregar también solo el hostname
            if (exclusion.ServerName.Contains('\\'))
            {
                var hostname = exclusion.ServerName.Split('\\')[0];
                excludedNames.Add(hostname);
                
                // Si el hostname es FQDN, agregar también el nombre corto
                if (hostname.Contains('.'))
                {
                    excludedNames.Add(hostname.Split('.')[0]);
                }
            }
            
            // Si es FQDN (server.domain.com), agregar nombre corto
            if (exclusion.ServerName.Contains('.') && !exclusion.ServerName.Contains('\\'))
            {
                excludedNames.Add(exclusion.ServerName.Split('.')[0]);
            }
        }

        return excludedNames;
    }

    public async Task<bool> IsServerExcludedAsync(string serverName, CancellationToken ct = default)
    {
        var excludedNames = await GetExcludedServerNamesAsync(ct);
        
        // Verificar el nombre directo
        if (excludedNames.Contains(serverName))
            return true;
        
        // Verificar hostname (sin instancia)
        if (serverName.Contains('\\'))
        {
            var hostname = serverName.Split('\\')[0];
            if (excludedNames.Contains(hostname))
                return true;
            
            // Nombre corto del hostname
            if (hostname.Contains('.'))
            {
                if (excludedNames.Contains(hostname.Split('.')[0]))
                    return true;
            }
        }
        
        // Verificar nombre corto (sin dominio)
        if (serverName.Contains('.'))
        {
            if (excludedNames.Contains(serverName.Split('.')[0]))
                return true;
        }

        return false;
    }

    public async Task<ServerAlertExclusion> AddExclusionAsync(ServerAlertExclusion exclusion, CancellationToken ct = default)
    {
        _context.ServerAlertExclusions.Add(exclusion);
        await _context.SaveChangesAsync(ct);
        
        _logger.LogInformation(
            "Server exclusion added: {ServerName} by {CreatedBy}. Reason: {Reason}",
            exclusion.ServerName, exclusion.CreatedBy, exclusion.Reason);
        
        return exclusion;
    }

    public async Task<bool> RemoveExclusionAsync(int id, CancellationToken ct = default)
    {
        var exclusion = await _context.ServerAlertExclusions.FindAsync(new object[] { id }, ct);
        if (exclusion == null)
            return false;

        _context.ServerAlertExclusions.Remove(exclusion);
        await _context.SaveChangesAsync(ct);
        
        _logger.LogInformation(
            "Server exclusion removed: {ServerName} (Id={Id})",
            exclusion.ServerName, id);
        
        return true;
    }
}
