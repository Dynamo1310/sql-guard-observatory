using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de asignaciones de problemas del Overview
/// </summary>
public interface IOverviewAssignmentService
{
    Task<List<OverviewAssignmentDto>> GetActiveAssignmentsAsync();
    Task<List<OverviewAssignmentDto>> GetAssignmentsByTypeAsync(string issueType);
    Task<OverviewAssignmentDto?> GetAssignmentAsync(string issueType, string instanceName, string? driveOrTipo = null);
    Task<List<AssignableUserDto>> GetAvailableUsersAsync();
    Task<OverviewAssignmentDto> CreateAssignmentAsync(CreateOverviewAssignmentRequest request, string assignedByUserId);
    Task<bool> RemoveAssignmentAsync(int id);
    Task<OverviewAssignmentDto?> ResolveAssignmentAsync(int id, string? notes = null);
    Task<List<string>> GetUnassignedBackupInstancesAsync();
}

/// <summary>
/// Servicio para gestionar asignaciones de problemas del Overview a usuarios del grupo IDD
/// </summary>
public class OverviewAssignmentService : IOverviewAssignmentService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<OverviewAssignmentService> _logger;
    
    // Nombre del grupo de usuarios que pueden ser asignados
    private const string DBA_GROUP_NAME = "IDD (General)";

    public OverviewAssignmentService(
        ApplicationDbContext context,
        ILogger<OverviewAssignmentService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todas las asignaciones activas (no resueltas)
    /// </summary>
    public async Task<List<OverviewAssignmentDto>> GetActiveAssignmentsAsync()
    {
        try
        {
            var assignments = await _context.OverviewIssueAssignments
                .Include(a => a.AssignedToUser)
                .Include(a => a.AssignedByUser)
                .Where(a => a.ResolvedAt == null)
                .OrderByDescending(a => a.AssignedAt)
                .ToListAsync();

            return assignments.Select(MapToDto).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener asignaciones activas. La tabla podría no existir aún.");
            return new List<OverviewAssignmentDto>();
        }
    }

    /// <summary>
    /// Obtiene asignaciones activas por tipo de problema
    /// </summary>
    public async Task<List<OverviewAssignmentDto>> GetAssignmentsByTypeAsync(string issueType)
    {
        var assignments = await _context.OverviewIssueAssignments
            .Include(a => a.AssignedToUser)
            .Include(a => a.AssignedByUser)
            .Where(a => a.IssueType == issueType && a.ResolvedAt == null)
            .OrderByDescending(a => a.AssignedAt)
            .ToListAsync();

        return assignments.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Obtiene una asignación específica por tipo, instancia y drive/tipo
    /// </summary>
    public async Task<OverviewAssignmentDto?> GetAssignmentAsync(string issueType, string instanceName, string? driveOrTipo = null)
    {
        var query = _context.OverviewIssueAssignments
            .Include(a => a.AssignedToUser)
            .Include(a => a.AssignedByUser)
            .Where(a => a.IssueType == issueType 
                && a.InstanceName == instanceName 
                && a.ResolvedAt == null);

        if (driveOrTipo != null)
        {
            query = query.Where(a => a.DriveOrTipo == driveOrTipo);
        }
        else
        {
            query = query.Where(a => a.DriveOrTipo == null);
        }

        var assignment = await query.FirstOrDefaultAsync();
        return assignment != null ? MapToDto(assignment) : null;
    }

    /// <summary>
    /// Obtiene los usuarios disponibles del grupo IDD (General)
    /// </summary>
    public async Task<List<AssignableUserDto>> GetAvailableUsersAsync()
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Members)
                .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Name == DBA_GROUP_NAME && !g.IsDeleted && g.IsActive);

        if (group == null)
        {
            _logger.LogWarning("Grupo '{GroupName}' no encontrado o inactivo", DBA_GROUP_NAME);
            return new List<AssignableUserDto>();
        }

        var users = group.Members
            .Where(m => m.User != null && m.User.IsActive)
            .Select(m => new AssignableUserDto
            {
                Id = m.User!.Id,
                DisplayName = m.User.DisplayName ?? m.User.DomainUser ?? m.User.UserName ?? "",
                Email = m.User.Email,
                DomainUser = m.User.DomainUser
            })
            .OrderBy(u => u.DisplayName)
            .ToList();

        return users;
    }

    /// <summary>
    /// Crea una nueva asignación de problema
    /// </summary>
    public async Task<OverviewAssignmentDto> CreateAssignmentAsync(CreateOverviewAssignmentRequest request, string assignedByUserId)
    {
        // Validar que el tipo sea válido
        var validTypes = new[] { "Backup", "Disk", "Maintenance" };
        if (!validTypes.Contains(request.IssueType))
        {
            throw new ArgumentException($"Tipo de problema inválido: {request.IssueType}. Debe ser uno de: {string.Join(", ", validTypes)}");
        }

        // Verificar si ya existe una asignación activa para este problema
        var existingQuery = _context.OverviewIssueAssignments
            .Where(a => a.IssueType == request.IssueType 
                && a.InstanceName == request.InstanceName 
                && a.ResolvedAt == null);

        if (request.DriveOrTipo != null)
        {
            existingQuery = existingQuery.Where(a => a.DriveOrTipo == request.DriveOrTipo);
        }
        else
        {
            existingQuery = existingQuery.Where(a => a.DriveOrTipo == null);
        }

        var existing = await existingQuery.FirstOrDefaultAsync();
        if (existing != null)
        {
            // Actualizar la asignación existente en lugar de crear una nueva
            existing.AssignedToUserId = request.AssignedToUserId;
            existing.AssignedByUserId = assignedByUserId;
            existing.AssignedAt = LocalClockAR.Now;
            existing.Notes = request.Notes;
            
            await _context.SaveChangesAsync();
            
            // Recargar con includes
            await _context.Entry(existing).Reference(a => a.AssignedToUser).LoadAsync();
            await _context.Entry(existing).Reference(a => a.AssignedByUser).LoadAsync();
            
            _logger.LogInformation(
                "Asignación actualizada: {IssueType} - {InstanceName} asignado a {UserId}", 
                request.IssueType, request.InstanceName, request.AssignedToUserId);
            
            return MapToDto(existing);
        }

        // Crear nueva asignación
        var assignment = new OverviewIssueAssignment
        {
            IssueType = request.IssueType,
            InstanceName = request.InstanceName,
            DriveOrTipo = request.DriveOrTipo,
            AssignedToUserId = request.AssignedToUserId,
            AssignedByUserId = assignedByUserId,
            Notes = request.Notes
        };

        _context.OverviewIssueAssignments.Add(assignment);
        await _context.SaveChangesAsync();

        // Recargar con includes
        await _context.Entry(assignment).Reference(a => a.AssignedToUser).LoadAsync();
        await _context.Entry(assignment).Reference(a => a.AssignedByUser).LoadAsync();

        _logger.LogInformation(
            "Nueva asignación creada: {IssueType} - {InstanceName} asignado a {UserId}", 
            request.IssueType, request.InstanceName, request.AssignedToUserId);

        return MapToDto(assignment);
    }

    /// <summary>
    /// Elimina una asignación (la quita, no la marca como resuelta)
    /// </summary>
    public async Task<bool> RemoveAssignmentAsync(int id)
    {
        var assignment = await _context.OverviewIssueAssignments.FindAsync(id);
        if (assignment == null)
        {
            return false;
        }

        _context.OverviewIssueAssignments.Remove(assignment);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Asignación eliminada: {Id}", id);
        return true;
    }

    /// <summary>
    /// Marca una asignación como resuelta
    /// </summary>
    public async Task<OverviewAssignmentDto?> ResolveAssignmentAsync(int id, string? notes = null)
    {
        var assignment = await _context.OverviewIssueAssignments
            .Include(a => a.AssignedToUser)
            .Include(a => a.AssignedByUser)
            .FirstOrDefaultAsync(a => a.Id == id);

        if (assignment == null)
        {
            return null;
        }

        assignment.ResolvedAt = LocalClockAR.Now;
        if (notes != null)
        {
            assignment.Notes = notes;
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Asignación resuelta: {Id}", id);
        return MapToDto(assignment);
    }

    /// <summary>
    /// Obtiene las instancias con backups atrasados que NO tienen asignación activa
    /// </summary>
    public async Task<List<string>> GetUnassignedBackupInstancesAsync()
    {
        var assignedInstances = await _context.OverviewIssueAssignments
            .Where(a => a.IssueType == "Backup" && a.ResolvedAt == null)
            .Select(a => a.InstanceName)
            .ToListAsync();

        return assignedInstances;
    }

    private static OverviewAssignmentDto MapToDto(OverviewIssueAssignment assignment)
    {
        return new OverviewAssignmentDto
        {
            Id = assignment.Id,
            IssueType = assignment.IssueType,
            InstanceName = assignment.InstanceName,
            DriveOrTipo = assignment.DriveOrTipo,
            AssignedToUserId = assignment.AssignedToUserId,
            AssignedToUserName = assignment.AssignedToUser?.DisplayName ?? assignment.AssignedToUser?.DomainUser ?? "",
            AssignedByUserId = assignment.AssignedByUserId,
            AssignedByUserName = assignment.AssignedByUser?.DisplayName ?? assignment.AssignedByUser?.DomainUser ?? "",
            AssignedAt = assignment.AssignedAt,
            ResolvedAt = assignment.ResolvedAt,
            Notes = assignment.Notes
        };
    }
}
