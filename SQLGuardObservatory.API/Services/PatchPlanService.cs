using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de planificación de parcheos
/// </summary>
public interface IPatchPlanService
{
    Task<List<PatchPlanDto>> GetAllAsync();
    Task<List<PatchPlanDto>> GetByDateRangeAsync(DateTime? fromDate, DateTime? toDate);
    Task<List<PatchPlanDto>> GetFilteredAsync(PatchPlanFilterRequest filter);
    Task<PatchPlanDto?> GetByIdAsync(int id);
    Task<PatchPlanDto> CreateAsync(CreatePatchPlanRequest request, string userId, string userName);
    Task<PatchPlanDto?> UpdateAsync(int id, UpdatePatchPlanRequest request, string userId);
    Task<bool> DeleteAsync(int id);
    Task<PatchPlanDto?> MarkPatchStatusAsync(int id, MarkPatchStatusRequest request, string userId, string userName);
    Task<List<AvailableDbaDto>> GetAvailableDbas();
    
    // Nuevos métodos para sistema mejorado
    Task<List<NonCompliantServerDto>> GetNonCompliantServersAsync();
    Task<List<PatchCalendarDto>> GetCalendarDataAsync(int year, int month);
    Task<List<PatchPlanDto>> GetByCellAsync(string cellTeam);
    Task<PatchDashboardStatsDto> GetDashboardStatsAsync();
    Task<PatchPlanDto?> RescheduleAsync(int id, ReschedulePatchPlanRequest request, string userId);
    Task<PatchPlanDto?> UpdateStatusAsync(int id, string newStatus, string userId);
    Task<List<string>> GetUniqueCellTeamsAsync();
}

/// <summary>
/// Servicio para gestionar la planificación de parcheos de servidores
/// </summary>
public class PatchPlanService : IPatchPlanService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<PatchPlanService> _logger;
    
    // Nombre del grupo de DBAs que pueden ser asignados a parcheos
    private const string DBA_GROUP_NAME = "IDD (General)";

    public PatchPlanService(
        ApplicationDbContext context,
        ILogger<PatchPlanService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los planes de parcheo
    /// </summary>
    public async Task<List<PatchPlanDto>> GetAllAsync()
    {
        var plans = await _context.PatchPlans
            .Include(p => p.AssignedDba)
            .Include(p => p.CreatedByUser)
            .Include(p => p.PatchedByUser)
            .OrderByDescending(p => p.ScheduledDate)
            .ThenBy(p => p.WindowStartTime)
            .ToListAsync();

        return plans.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Obtiene planes por rango de fechas
    /// </summary>
    public async Task<List<PatchPlanDto>> GetByDateRangeAsync(DateTime? fromDate, DateTime? toDate)
    {
        var query = _context.PatchPlans
            .Include(p => p.AssignedDba)
            .Include(p => p.CreatedByUser)
            .Include(p => p.PatchedByUser)
            .AsQueryable();

        if (fromDate.HasValue)
        {
            query = query.Where(p => p.ScheduledDate >= fromDate.Value.Date);
        }

        if (toDate.HasValue)
        {
            query = query.Where(p => p.ScheduledDate <= toDate.Value.Date);
        }

        var plans = await query
            .OrderByDescending(p => p.ScheduledDate)
            .ThenBy(p => p.WindowStartTime)
            .ToListAsync();

        return plans.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Obtiene planes filtrados por múltiples criterios
    /// </summary>
    public async Task<List<PatchPlanDto>> GetFilteredAsync(PatchPlanFilterRequest filter)
    {
        var query = _context.PatchPlans
            .Include(p => p.AssignedDba)
            .Include(p => p.CreatedByUser)
            .Include(p => p.PatchedByUser)
            .AsQueryable();

        if (filter.FromDate.HasValue)
        {
            query = query.Where(p => p.ScheduledDate >= filter.FromDate.Value.Date);
        }

        if (filter.ToDate.HasValue)
        {
            query = query.Where(p => p.ScheduledDate <= filter.ToDate.Value.Date);
        }

        if (!string.IsNullOrEmpty(filter.AssignedDbaId))
        {
            query = query.Where(p => p.AssignedDbaId == filter.AssignedDbaId);
        }

        if (!string.IsNullOrEmpty(filter.ServerName))
        {
            query = query.Where(p => p.ServerName.Contains(filter.ServerName) || 
                                    (p.InstanceName != null && p.InstanceName.Contains(filter.ServerName)));
        }

        if (!string.IsNullOrEmpty(filter.Status))
        {
            // Soporte para estados antiguos y nuevos
            query = filter.Status.ToLower() switch
            {
                "pending" => query.Where(p => p.WasPatched == null || PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
                "patched" => query.Where(p => p.WasPatched == true || p.Status == PatchPlanStatus.Parcheado),
                "failed" => query.Where(p => p.WasPatched == false || p.Status == PatchPlanStatus.Fallido),
                _ => query.Where(p => p.Status == filter.Status)
            };
        }

        if (!string.IsNullOrEmpty(filter.CellTeam))
        {
            query = query.Where(p => p.CellTeam == filter.CellTeam);
        }

        if (!string.IsNullOrEmpty(filter.Ambiente))
        {
            query = query.Where(p => p.Ambiente == filter.Ambiente);
        }

        if (!string.IsNullOrEmpty(filter.Priority))
        {
            query = query.Where(p => p.Priority == filter.Priority);
        }

        if (!string.IsNullOrEmpty(filter.PatchMode))
        {
            query = query.Where(p => p.PatchMode == filter.PatchMode);
        }

        var plans = await query
            .OrderByDescending(p => p.ScheduledDate)
            .ThenBy(p => p.WindowStartTime)
            .ToListAsync();

        return plans.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Obtiene un plan por su ID
    /// </summary>
    public async Task<PatchPlanDto?> GetByIdAsync(int id)
    {
        var plan = await _context.PatchPlans
            .Include(p => p.AssignedDba)
            .Include(p => p.CreatedByUser)
            .Include(p => p.PatchedByUser)
            .FirstOrDefaultAsync(p => p.Id == id);

        return plan != null ? MapToDto(plan) : null;
    }

    /// <summary>
    /// Crea un nuevo plan de parcheo
    /// </summary>
    public async Task<PatchPlanDto> CreateAsync(CreatePatchPlanRequest request, string userId, string userName)
    {
        // Obtener nombre del DBA asignado si se especificó
        string? assignedDbaName = null;
        if (!string.IsNullOrEmpty(request.AssignedDbaId))
        {
            var dba = await _context.Users.FindAsync(request.AssignedDbaId);
            assignedDbaName = dba?.DisplayName ?? dba?.DomainUser;
        }

        var plan = new PatchPlan
        {
            ServerName = request.ServerName,
            InstanceName = request.InstanceName,
            CurrentVersion = request.CurrentVersion,
            TargetVersion = request.TargetVersion,
            IsCoordinated = request.IsCoordinated,
            ProductOwnerNote = request.ProductOwnerNote,
            ScheduledDate = request.ScheduledDate.Date,
            WindowStartTime = TimeSpan.Parse(request.WindowStartTime),
            WindowEndTime = TimeSpan.Parse(request.WindowEndTime),
            AssignedDbaId = request.AssignedDbaId,
            AssignedDbaName = assignedDbaName,
            Notes = request.Notes,
            CreatedByUserId = userId,
            CreatedByUserName = userName,
            CreatedAt = DateTime.UtcNow,
            // Nuevos campos
            Status = request.Status ?? PatchPlanStatus.Planificado,
            PatchMode = request.PatchMode ?? PatchModeType.Manual,
            CoordinationOwnerId = request.CoordinationOwnerId,
            CoordinationOwnerName = request.CoordinationOwnerName,
            CoordinationOwnerEmail = request.CoordinationOwnerEmail,
            CellTeam = request.CellTeam,
            EstimatedDuration = request.EstimatedDuration,
            Priority = request.Priority,
            ClusterName = request.ClusterName,
            IsAlwaysOn = request.IsAlwaysOn,
            Ambiente = request.Ambiente
        };

        _context.PatchPlans.Add(plan);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Plan de parcheo creado: Id={Id}, Server={Server}, ScheduledDate={Date}, CreatedBy={User}",
            plan.Id, plan.ServerName, plan.ScheduledDate.ToShortDateString(), userName);

        // Recargar con includes para el DTO
        return (await GetByIdAsync(plan.Id))!;
    }

    /// <summary>
    /// Actualiza un plan de parcheo existente
    /// </summary>
    public async Task<PatchPlanDto?> UpdateAsync(int id, UpdatePatchPlanRequest request, string userId)
    {
        var plan = await _context.PatchPlans.FindAsync(id);
        if (plan == null)
        {
            return null;
        }

        // Actualizar solo los campos proporcionados
        if (request.ServerName != null)
            plan.ServerName = request.ServerName;

        if (request.InstanceName != null)
            plan.InstanceName = request.InstanceName;

        if (request.CurrentVersion != null)
            plan.CurrentVersion = request.CurrentVersion;

        if (request.TargetVersion != null)
            plan.TargetVersion = request.TargetVersion;

        if (request.IsCoordinated.HasValue)
            plan.IsCoordinated = request.IsCoordinated.Value;

        if (request.ProductOwnerNote != null)
            plan.ProductOwnerNote = request.ProductOwnerNote;

        if (request.ScheduledDate.HasValue)
            plan.ScheduledDate = request.ScheduledDate.Value.Date;

        if (request.WindowStartTime != null)
            plan.WindowStartTime = TimeSpan.Parse(request.WindowStartTime);

        if (request.WindowEndTime != null)
            plan.WindowEndTime = TimeSpan.Parse(request.WindowEndTime);

        if (request.AssignedDbaId != null)
        {
            plan.AssignedDbaId = request.AssignedDbaId;
            if (!string.IsNullOrEmpty(request.AssignedDbaId))
            {
                var dba = await _context.Users.FindAsync(request.AssignedDbaId);
                plan.AssignedDbaName = dba?.DisplayName ?? dba?.DomainUser;
            }
            else
            {
                plan.AssignedDbaName = null;
            }
        }

        if (request.WasPatched.HasValue)
            plan.WasPatched = request.WasPatched;

        if (request.Notes != null)
            plan.Notes = request.Notes;

        // Nuevos campos
        if (request.Status != null)
            plan.Status = request.Status;

        if (request.PatchMode != null)
            plan.PatchMode = request.PatchMode;

        if (request.CoordinationOwnerId != null)
            plan.CoordinationOwnerId = request.CoordinationOwnerId;

        if (request.CoordinationOwnerName != null)
            plan.CoordinationOwnerName = request.CoordinationOwnerName;

        if (request.CoordinationOwnerEmail != null)
            plan.CoordinationOwnerEmail = request.CoordinationOwnerEmail;

        if (request.CellTeam != null)
            plan.CellTeam = request.CellTeam;

        if (request.EstimatedDuration.HasValue)
            plan.EstimatedDuration = request.EstimatedDuration;

        if (request.Priority != null)
            plan.Priority = request.Priority;

        if (request.ClusterName != null)
            plan.ClusterName = request.ClusterName;

        if (request.IsAlwaysOn.HasValue)
            plan.IsAlwaysOn = request.IsAlwaysOn.Value;

        if (request.Ambiente != null)
            plan.Ambiente = request.Ambiente;

        if (request.WaiverReason != null)
            plan.WaiverReason = request.WaiverReason;

        plan.UpdatedAt = DateTime.UtcNow;
        plan.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Plan de parcheo actualizado: Id={Id}, Server={Server}, UpdatedBy={User}",
            plan.Id, plan.ServerName, userId);

        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Elimina un plan de parcheo
    /// </summary>
    public async Task<bool> DeleteAsync(int id)
    {
        var plan = await _context.PatchPlans.FindAsync(id);
        if (plan == null)
        {
            return false;
        }

        _context.PatchPlans.Remove(plan);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Plan de parcheo eliminado: Id={Id}, Server={Server}", id, plan.ServerName);

        return true;
    }

    /// <summary>
    /// Marca un parcheo como completado o fallido
    /// </summary>
    public async Task<PatchPlanDto?> MarkPatchStatusAsync(int id, MarkPatchStatusRequest request, string userId, string userName)
    {
        var plan = await _context.PatchPlans.FindAsync(id);
        if (plan == null)
        {
            return null;
        }

        plan.WasPatched = request.WasPatched;
        plan.PatchedAt = DateTime.UtcNow;
        plan.PatchedByUserId = userId;
        plan.UpdatedAt = DateTime.UtcNow;
        plan.UpdatedByUserId = userId;

        if (!string.IsNullOrEmpty(request.Notes))
        {
            plan.Notes = string.IsNullOrEmpty(plan.Notes) 
                ? request.Notes 
                : $"{plan.Notes}\n[{DateTime.Now:yyyy-MM-dd HH:mm}] {request.Notes}";
        }

        await _context.SaveChangesAsync();

        var status = request.WasPatched ? "parcheado" : "fallido";
        _logger.LogInformation(
            "Plan de parcheo marcado como {Status}: Id={Id}, Server={Server}, MarkedBy={User}",
            status, id, plan.ServerName, userName);

        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Obtiene la lista de DBAs disponibles para asignar (miembros del grupo IDD (General))
    /// </summary>
    public async Task<List<AvailableDbaDto>> GetAvailableDbas()
    {
        // Buscar el grupo "IDD (General)"
        var group = await _context.SecurityGroups
            .Include(g => g.Members)
                .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Name == DBA_GROUP_NAME && !g.IsDeleted && g.IsActive);

        if (group == null)
        {
            _logger.LogWarning("Grupo '{GroupName}' no encontrado o inactivo", DBA_GROUP_NAME);
            return new List<AvailableDbaDto>();
        }

        var dbas = group.Members
            .Where(m => m.User != null && m.User.IsActive)
            .Select(m => new AvailableDbaDto
            {
                Id = m.User!.Id,
                DisplayName = m.User.DisplayName ?? m.User.DomainUser ?? m.User.UserName ?? "",
                Email = m.User.Email,
                DomainUser = m.User.DomainUser
            })
            .OrderBy(d => d.DisplayName)
            .ToList();

        return dbas;
    }

    /// <summary>
    /// Obtiene servidores no compliance para planificación
    /// </summary>
    public async Task<List<NonCompliantServerDto>> GetNonCompliantServersAsync()
    {
        var servers = await _context.ServerPatchStatusCache
            .Where(s => s.PatchStatus != "Compliance" && s.ConnectionSuccess)
            .OrderBy(s => s.ServerName)
            .ToListAsync();

        return servers.Select(s => new NonCompliantServerDto
        {
            ServerName = s.ServerName,
            InstanceName = s.InstanceName,
            Ambiente = s.Ambiente,
            MajorVersion = s.MajorVersion,
            CurrentBuild = s.CurrentBuild,
            CurrentCU = s.CurrentCU,
            RequiredBuild = s.RequiredBuild,
            RequiredCU = s.RequiredCU,
            PendingCUsForCompliance = s.PendingCUsForCompliance,
            PatchStatus = s.PatchStatus,
            IsAlwaysOn = false, // TODO: Obtener de SqlServerInstancesCache
            LastChecked = s.LastChecked
        }).ToList();
    }

    /// <summary>
    /// Obtiene datos para el calendario de parcheos
    /// </summary>
    public async Task<List<PatchCalendarDto>> GetCalendarDataAsync(int year, int month)
    {
        var startDate = new DateTime(year, month, 1);
        var endDate = startDate.AddMonths(1).AddDays(-1);

        var plans = await _context.PatchPlans
            .Where(p => p.ScheduledDate >= startDate && p.ScheduledDate <= endDate)
            .Where(p => p.Status != PatchPlanStatus.Cancelado)
            .OrderBy(p => p.ScheduledDate)
            .ThenBy(p => p.WindowStartTime)
            .ToListAsync();

        return plans.Select(p => new PatchCalendarDto
        {
            Id = p.Id,
            ServerName = p.ServerName,
            InstanceName = p.InstanceName,
            Status = p.Status,
            Priority = p.Priority,
            CellTeam = p.CellTeam,
            Ambiente = p.Ambiente,
            ScheduledDate = p.ScheduledDate,
            WindowStartTime = p.WindowStartTime.ToString(@"hh\:mm"),
            WindowEndTime = p.WindowEndTime.ToString(@"hh\:mm"),
            AssignedDbaName = p.AssignedDbaName,
            EstimatedDuration = p.EstimatedDuration,
            IsAlwaysOn = p.IsAlwaysOn,
            ClusterName = p.ClusterName
        }).ToList();
    }

    /// <summary>
    /// Obtiene planes por célula
    /// </summary>
    public async Task<List<PatchPlanDto>> GetByCellAsync(string cellTeam)
    {
        var plans = await _context.PatchPlans
            .Include(p => p.AssignedDba)
            .Include(p => p.CreatedByUser)
            .Include(p => p.PatchedByUser)
            .Where(p => p.CellTeam == cellTeam)
            .OrderByDescending(p => p.ScheduledDate)
            .ThenBy(p => p.WindowStartTime)
            .ToListAsync();

        return plans.Select(MapToDto).ToList();
    }

    /// <summary>
    /// Obtiene estadísticas del dashboard
    /// </summary>
    public async Task<PatchDashboardStatsDto> GetDashboardStatsAsync()
    {
        var now = DateTime.UtcNow.Date;
        var thirtyDaysAgo = now.AddDays(-30);

        var allPlans = await _context.PatchPlans
            .Where(p => p.ScheduledDate >= thirtyDaysAgo)
            .ToListAsync();

        var stats = new PatchDashboardStatsDto
        {
            TotalPlans = allPlans.Count,
            CompletedPlans = allPlans.Count(p => p.Status == PatchPlanStatus.Parcheado),
            PendingPlans = allPlans.Count(p => PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
            FailedPlans = allPlans.Count(p => p.Status == PatchPlanStatus.Fallido),
            DelayedPlans = allPlans.Count(p => p.ScheduledDate < now && PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
            HighPriorityPending = allPlans.Count(p => p.Priority == PatchPriority.Alta && PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
            MediumPriorityPending = allPlans.Count(p => p.Priority == PatchPriority.Media && PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
            LowPriorityPending = allPlans.Count(p => p.Priority == PatchPriority.Baja && PatchPlanStatus.ActiveStatuses.Contains(p.Status))
        };

        stats.CompletionPercentage = stats.TotalPlans > 0 
            ? Math.Round((double)stats.CompletedPlans / stats.TotalPlans * 100, 1) 
            : 0;

        // Estadísticas por célula
        var cellGroups = allPlans
            .Where(p => !string.IsNullOrEmpty(p.CellTeam))
            .GroupBy(p => p.CellTeam!)
            .Select(g => new CellStatsDto
            {
                CellTeam = g.Key,
                Backlog = g.Count(p => PatchPlanStatus.ActiveStatuses.Contains(p.Status)),
                Completed = g.Count(p => p.Status == PatchPlanStatus.Parcheado),
                Rescheduled = g.Sum(p => p.RescheduledCount),
                Waivers = g.Count(p => !string.IsNullOrEmpty(p.WaiverReason))
            })
            .ToList();

        stats.CellStats = cellGroups;

        // Estadísticas de cumplimiento
        var completedPlans = allPlans.Where(p => p.Status == PatchPlanStatus.Parcheado && p.PatchedAt.HasValue).ToList();
        stats.InWindowExecutions = completedPlans.Count(p => 
            p.PatchedAt!.Value.Date == p.ScheduledDate.Date);
        stats.OutOfWindowExecutions = completedPlans.Count(p => 
            p.PatchedAt!.Value.Date != p.ScheduledDate.Date);

        if (completedPlans.Any())
        {
            stats.AverageLeadTimeDays = Math.Round(completedPlans
                .Average(p => (p.PatchedAt!.Value - p.CreatedAt).TotalDays), 1);
        }

        return stats;
    }

    /// <summary>
    /// Reprograma un plan de parcheo
    /// </summary>
    public async Task<PatchPlanDto?> RescheduleAsync(int id, ReschedulePatchPlanRequest request, string userId)
    {
        var plan = await _context.PatchPlans.FindAsync(id);
        if (plan == null)
        {
            return null;
        }

        plan.ScheduledDate = request.NewScheduledDate.Date;
        
        if (!string.IsNullOrEmpty(request.NewWindowStartTime))
            plan.WindowStartTime = TimeSpan.Parse(request.NewWindowStartTime);
        
        if (!string.IsNullOrEmpty(request.NewWindowEndTime))
            plan.WindowEndTime = TimeSpan.Parse(request.NewWindowEndTime);

        plan.RescheduledCount++;
        plan.Status = PatchPlanStatus.Reprogramado;
        plan.UpdatedAt = DateTime.UtcNow;
        plan.UpdatedByUserId = userId;

        if (!string.IsNullOrEmpty(request.Reason))
        {
            plan.Notes = string.IsNullOrEmpty(plan.Notes)
                ? $"[{DateTime.Now:yyyy-MM-dd HH:mm}] Reprogramado: {request.Reason}"
                : $"{plan.Notes}\n[{DateTime.Now:yyyy-MM-dd HH:mm}] Reprogramado: {request.Reason}";
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Plan de parcheo reprogramado: Id={Id}, Server={Server}, NewDate={NewDate}",
            id, plan.ServerName, request.NewScheduledDate.ToShortDateString());

        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Actualiza el estado de un plan
    /// </summary>
    public async Task<PatchPlanDto?> UpdateStatusAsync(int id, string newStatus, string userId)
    {
        var plan = await _context.PatchPlans.FindAsync(id);
        if (plan == null)
        {
            return null;
        }

        var oldStatus = plan.Status;
        plan.Status = newStatus;
        plan.UpdatedAt = DateTime.UtcNow;
        plan.UpdatedByUserId = userId;

        // Actualizar campos relacionados según el estado
        if (newStatus == PatchPlanStatus.EnCoordinacion && !plan.ContactedAt.HasValue)
        {
            plan.ContactedAt = DateTime.UtcNow;
        }
        else if (newStatus == PatchPlanStatus.Aprobado)
        {
            plan.ResponseReceivedAt = DateTime.UtcNow;
        }
        else if (newStatus == PatchPlanStatus.Parcheado)
        {
            plan.WasPatched = true;
            plan.PatchedAt = DateTime.UtcNow;
            plan.PatchedByUserId = userId;
        }
        else if (newStatus == PatchPlanStatus.Fallido)
        {
            plan.WasPatched = false;
            plan.PatchedAt = DateTime.UtcNow;
            plan.PatchedByUserId = userId;
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Estado de plan actualizado: Id={Id}, Server={Server}, OldStatus={Old}, NewStatus={New}",
            id, plan.ServerName, oldStatus, newStatus);

        return await GetByIdAsync(id);
    }

    /// <summary>
    /// Obtiene células/equipos únicos (combina PatchPlans y DatabaseOwners)
    /// </summary>
    public async Task<List<string>> GetUniqueCellTeamsAsync()
    {
        // Células de los planes de parcheo
        var cellsFromPlans = await _context.PatchPlans
            .Where(p => !string.IsNullOrEmpty(p.CellTeam))
            .Select(p => p.CellTeam!)
            .Distinct()
            .ToListAsync();

        // Células del Knowledge Base (DatabaseOwners)
        var cellsFromOwners = await _context.DatabaseOwners
            .Where(o => !string.IsNullOrEmpty(o.CellTeam) && o.IsActive)
            .Select(o => o.CellTeam!)
            .Distinct()
            .ToListAsync();

        // Combinar y ordenar
        return cellsFromPlans
            .Union(cellsFromOwners)
            .Distinct()
            .OrderBy(c => c)
            .ToList();
    }

    /// <summary>
    /// Mapea una entidad PatchPlan a PatchPlanDto
    /// </summary>
    private static PatchPlanDto MapToDto(PatchPlan plan)
    {
        return new PatchPlanDto
        {
            Id = plan.Id,
            ServerName = plan.ServerName,
            InstanceName = plan.InstanceName,
            CurrentVersion = plan.CurrentVersion,
            TargetVersion = plan.TargetVersion,
            IsCoordinated = plan.IsCoordinated,
            ProductOwnerNote = plan.ProductOwnerNote,
            ScheduledDate = plan.ScheduledDate,
            WindowStartTime = plan.WindowStartTime.ToString(@"hh\:mm"),
            WindowEndTime = plan.WindowEndTime.ToString(@"hh\:mm"),
            AssignedDbaId = plan.AssignedDbaId,
            AssignedDbaName = plan.AssignedDbaName ?? plan.AssignedDba?.DisplayName ?? plan.AssignedDba?.DomainUser,
            WasPatched = plan.WasPatched,
            Status = plan.Status,
            PatchedAt = plan.PatchedAt,
            PatchedByUserName = plan.PatchedByUser?.DisplayName ?? plan.PatchedByUser?.DomainUser,
            Notes = plan.Notes,
            CreatedAt = plan.CreatedAt,
            CreatedByUserName = plan.CreatedByUserName ?? plan.CreatedByUser?.DisplayName ?? plan.CreatedByUser?.DomainUser,
            UpdatedAt = plan.UpdatedAt,
            // Nuevos campos
            PatchMode = plan.PatchMode,
            CoordinationOwnerId = plan.CoordinationOwnerId,
            CoordinationOwnerName = plan.CoordinationOwnerName,
            CoordinationOwnerEmail = plan.CoordinationOwnerEmail,
            CellTeam = plan.CellTeam,
            EstimatedDuration = plan.EstimatedDuration,
            Priority = plan.Priority,
            ClusterName = plan.ClusterName,
            IsAlwaysOn = plan.IsAlwaysOn,
            Ambiente = plan.Ambiente,
            ContactedAt = plan.ContactedAt,
            ResponseReceivedAt = plan.ResponseReceivedAt,
            RescheduledCount = plan.RescheduledCount,
            WaiverReason = plan.WaiverReason
        };
    }
}
