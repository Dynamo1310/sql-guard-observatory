using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de Knowledge Base de owners
/// </summary>
public interface IDatabaseOwnersService
{
    Task<DatabaseOwnerPagedResult> GetAllAsync(DatabaseOwnerFilterRequest filter);
    Task<DatabaseOwnerDto?> GetByIdAsync(int id);
    Task<DatabaseOwnerDto?> FindByDatabaseAsync(string serverName, string? instanceName, string? databaseName);
    Task<DatabaseOwnerDto> CreateAsync(CreateDatabaseOwnerRequest request, string userId, string userName);
    Task<DatabaseOwnerDto?> UpdateAsync(int id, UpdateDatabaseOwnerRequest request, string userId, string userName);
    Task<bool> DeleteAsync(int id);
    Task<List<DatabaseOwnerServerDto>> GetAvailableServersAsync();
    Task<List<AvailableDatabaseDto>> GetDatabasesForServerAsync(string serverName, string? instanceName);
    Task<List<CellTeamDto>> GetUniqueCellTeamsAsync();
}

/// <summary>
/// Servicio para gestionar el Knowledge Base de owners de BD
/// </summary>
public class DatabaseOwnersService : IDatabaseOwnersService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<DatabaseOwnersService> _logger;

    public DatabaseOwnersService(
        ApplicationDbContext context,
        ILogger<DatabaseOwnersService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los owners con paginación y filtros
    /// </summary>
    public async Task<DatabaseOwnerPagedResult> GetAllAsync(DatabaseOwnerFilterRequest filter)
    {
        var query = _context.DatabaseOwners.AsQueryable();

        if (!string.IsNullOrEmpty(filter.ServerName))
        {
            query = query.Where(o => o.ServerName.Contains(filter.ServerName));
        }

        if (!string.IsNullOrEmpty(filter.DatabaseName))
        {
            query = query.Where(o => o.DatabaseName.Contains(filter.DatabaseName));
        }

        if (!string.IsNullOrEmpty(filter.CellTeam))
        {
            query = query.Where(o => o.CellTeam == filter.CellTeam);
        }

        if (!string.IsNullOrEmpty(filter.OwnerName))
        {
            query = query.Where(o => o.OwnerName.Contains(filter.OwnerName));
        }

        if (!string.IsNullOrEmpty(filter.BusinessCriticality))
        {
            query = query.Where(o => o.BusinessCriticality == filter.BusinessCriticality);
        }

        if (filter.IsActive.HasValue)
        {
            query = query.Where(o => o.IsActive == filter.IsActive.Value);
        }

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(o => o.ServerName)
            .ThenBy(o => o.DatabaseName)
            .Skip((filter.Page - 1) * filter.PageSize)
            .Take(filter.PageSize)
            .ToListAsync();

        // Obtener info adicional de servidores
        var serverNames = items.Select(i => i.ServerName).Distinct().ToList();
        var serverInfos = await _context.SqlServerInstancesCache
            .Where(s => serverNames.Contains(s.ServerName))
            .ToListAsync();

        return new DatabaseOwnerPagedResult
        {
            Items = items.Select(o => MapToDto(o, serverInfos)).ToList(),
            TotalCount = totalCount,
            Page = filter.Page,
            PageSize = filter.PageSize,
            TotalPages = (int)Math.Ceiling((double)totalCount / filter.PageSize)
        };
    }

    /// <summary>
    /// Obtiene un owner por ID
    /// </summary>
    public async Task<DatabaseOwnerDto?> GetByIdAsync(int id)
    {
        var owner = await _context.DatabaseOwners.FindAsync(id);
        if (owner == null) return null;

        var serverInfo = await _context.SqlServerInstancesCache
            .FirstOrDefaultAsync(s => s.ServerName == owner.ServerName);

        return MapToDto(owner, serverInfo != null ? new List<SqlServerInstanceCache> { serverInfo } : new List<SqlServerInstanceCache>());
    }

    /// <summary>
    /// Busca owner por servidor/instancia/base de datos
    /// </summary>
    public async Task<DatabaseOwnerDto?> FindByDatabaseAsync(string serverName, string? instanceName, string? databaseName)
    {
        var query = _context.DatabaseOwners
            .Where(o => o.ServerName == serverName && o.IsActive);

        if (!string.IsNullOrEmpty(instanceName))
        {
            query = query.Where(o => o.InstanceName == instanceName);
        }

        if (!string.IsNullOrEmpty(databaseName))
        {
            query = query.Where(o => o.DatabaseName == databaseName);
        }

        var owner = await query.FirstOrDefaultAsync();
        if (owner == null) return null;

        return await GetByIdAsync(owner.Id);
    }

    /// <summary>
    /// Crea un nuevo owner
    /// </summary>
    public async Task<DatabaseOwnerDto> CreateAsync(CreateDatabaseOwnerRequest request, string userId, string userName)
    {
        // Verificar si ya existe
        var existing = await _context.DatabaseOwners
            .FirstOrDefaultAsync(o => 
                o.ServerName == request.ServerName && 
                o.InstanceName == request.InstanceName && 
                o.DatabaseName == request.DatabaseName);

        if (existing != null)
        {
            throw new InvalidOperationException($"Ya existe un owner para {request.ServerName}/{request.InstanceName}/{request.DatabaseName}");
        }

        var owner = new DatabaseOwner
        {
            ServerName = request.ServerName,
            InstanceName = request.InstanceName,
            DatabaseName = request.DatabaseName,
            OwnerName = request.OwnerName,
            OwnerEmail = request.OwnerEmail,
            OwnerPhone = request.OwnerPhone,
            CellTeam = request.CellTeam,
            Department = request.Department,
            ApplicationName = request.ApplicationName,
            BusinessCriticality = request.BusinessCriticality,
            Notes = request.Notes,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = userId,
            CreatedByUserName = userName
        };

        _context.DatabaseOwners.Add(owner);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Owner de BD creado: {Server}/{Instance}/{Database} -> {Owner}",
            owner.ServerName, owner.InstanceName, owner.DatabaseName, owner.OwnerName);

        return (await GetByIdAsync(owner.Id))!;
    }

    /// <summary>
    /// Actualiza un owner
    /// </summary>
    public async Task<DatabaseOwnerDto?> UpdateAsync(int id, UpdateDatabaseOwnerRequest request, string userId, string userName)
    {
        var owner = await _context.DatabaseOwners.FindAsync(id);
        if (owner == null) return null;

        if (request.OwnerName != null) owner.OwnerName = request.OwnerName;
        if (request.OwnerEmail != null) owner.OwnerEmail = request.OwnerEmail;
        if (request.OwnerPhone != null) owner.OwnerPhone = request.OwnerPhone;
        if (request.CellTeam != null) owner.CellTeam = request.CellTeam;
        if (request.Department != null) owner.Department = request.Department;
        if (request.ApplicationName != null) owner.ApplicationName = request.ApplicationName;
        if (request.BusinessCriticality != null) owner.BusinessCriticality = request.BusinessCriticality;
        if (request.Notes != null) owner.Notes = request.Notes;
        if (request.IsActive.HasValue) owner.IsActive = request.IsActive.Value;

        owner.UpdatedAt = DateTime.UtcNow;
        owner.UpdatedByUserId = userId;
        owner.UpdatedByUserName = userName;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Owner de BD actualizado: Id={Id}", id);

        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Elimina un owner
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var owner = await _context.DatabaseOwners.FindAsync(id);
        if (owner == null) return false;

        _context.DatabaseOwners.Remove(owner);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Owner de BD eliminado: {Server}/{Instance}/{Database}",
            owner.ServerName, owner.InstanceName, owner.DatabaseName);

        return true;
    }

    /// <summary>
    /// Obtiene lista de servidores disponibles
    /// </summary>
    public async Task<List<DatabaseOwnerServerDto>> GetAvailableServersAsync()
    {
        var servers = await _context.SqlServerInstancesCache
            .OrderBy(s => s.ServerName)
            .Select(s => new DatabaseOwnerServerDto
            {
                ServerName = s.ServerName,
                InstanceName = s.NombreInstancia,
                Ambiente = s.Ambiente,
                MajorVersion = s.MajorVersion
            })
            .ToListAsync();

        return servers;
    }

    /// <summary>
    /// Obtiene bases de datos de un servidor
    /// </summary>
    public async Task<List<AvailableDatabaseDto>> GetDatabasesForServerAsync(string serverName, string? instanceName)
    {
        var query = _context.SqlServerDatabasesCache
            .Where(d => d.ServerName == serverName);

        var databases = await query
            .OrderBy(d => d.DbName)
            .ToListAsync();

        // Verificar cuáles ya tienen owner asignado
        var existingOwners = await _context.DatabaseOwners
            .Where(o => o.ServerName == serverName && o.IsActive)
            .Select(o => o.DatabaseName)
            .ToListAsync();

        return databases.Select(d => new AvailableDatabaseDto
        {
            DatabaseName = d.DbName,
            Status = d.Status,
            DataMB = d.DataMB,
            RecoveryModel = d.RecoveryModel,
            HasOwnerAssigned = existingOwners.Contains(d.DbName)
        }).ToList();
    }

    /// <summary>
    /// Obtiene células/equipos únicos
    /// </summary>
    public async Task<List<CellTeamDto>> GetUniqueCellTeamsAsync()
    {
        return await _context.DatabaseOwners
            .Where(o => !string.IsNullOrEmpty(o.CellTeam) && o.IsActive)
            .GroupBy(o => o.CellTeam!)
            .Select(g => new CellTeamDto
            {
                CellTeam = g.Key,
                DatabaseCount = g.Count()
            })
            .OrderBy(c => c.CellTeam)
            .ToListAsync();
    }

    /// <summary>
    /// Mapea entidad a DTO
    /// </summary>
    private static DatabaseOwnerDto MapToDto(DatabaseOwner owner, List<SqlServerInstanceCache> serverInfos)
    {
        var serverInfo = serverInfos.FirstOrDefault(s => s.ServerName == owner.ServerName);

        return new DatabaseOwnerDto
        {
            Id = owner.Id,
            ServerName = owner.ServerName,
            InstanceName = owner.InstanceName,
            DatabaseName = owner.DatabaseName,
            OwnerName = owner.OwnerName,
            OwnerEmail = owner.OwnerEmail,
            OwnerPhone = owner.OwnerPhone,
            CellTeam = owner.CellTeam,
            Department = owner.Department,
            ApplicationName = owner.ApplicationName,
            BusinessCriticality = owner.BusinessCriticality,
            Notes = owner.Notes,
            IsActive = owner.IsActive,
            CreatedAt = owner.CreatedAt,
            CreatedByUserName = owner.CreatedByUserName,
            UpdatedAt = owner.UpdatedAt,
            UpdatedByUserName = owner.UpdatedByUserName,
            ServerAmbiente = serverInfo?.Ambiente,
            SqlVersion = serverInfo?.MajorVersion,
            IsAlwaysOn = serverInfo?.AlwaysOn,
            HostingSite = serverInfo?.HostingSite
        };
    }
}
