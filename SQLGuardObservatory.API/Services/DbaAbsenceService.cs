using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class DbaAbsenceService : IDbaAbsenceService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<DbaAbsenceService> _logger;
    private const string DBA_GROUP_NAME = "IDD (General)";

    public DbaAbsenceService(ApplicationDbContext context, ILogger<DbaAbsenceService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<DbaAbsenceDto>> GetAllAsync(DateTime? dateFrom, DateTime? dateTo, string? userId)
    {
        var query = _context.DbaAbsences
            .Include(a => a.User)
            .Include(a => a.CreatedByUser)
            .AsQueryable();

        if (dateFrom.HasValue)
            query = query.Where(a => a.Date >= dateFrom.Value.Date);

        if (dateTo.HasValue)
            query = query.Where(a => a.Date <= dateTo.Value.Date);

        if (!string.IsNullOrEmpty(userId))
            query = query.Where(a => a.UserId == userId);

        return await query
            .OrderByDescending(a => a.Date)
            .ThenBy(a => a.User!.DisplayName)
            .Select(a => new DbaAbsenceDto
            {
                Id = a.Id,
                UserId = a.UserId,
                UserDisplayName = a.User!.DisplayName ?? a.User.UserName ?? a.UserId,
                Date = a.Date,
                Reason = a.Reason,
                Notes = a.Notes,
                CreatedByDisplayName = a.CreatedByUser!.DisplayName ?? a.CreatedByUser.UserName ?? a.CreatedByUserId,
                CreatedAt = a.CreatedAt
            })
            .ToListAsync();
    }

    public async Task<DbaAbsenceDto> CreateAsync(CreateDbaAbsenceRequest request, string createdByUserId)
    {
        var absence = new DbaAbsence
        {
            UserId = request.UserId,
            Date = request.Date.Date,
            Reason = request.Reason,
            Notes = request.Notes,
            CreatedByUserId = createdByUserId,
            CreatedAt = DateTime.UtcNow
        };

        _context.DbaAbsences.Add(absence);
        await _context.SaveChangesAsync();

        await _context.Entry(absence).Reference(a => a.User).LoadAsync();
        await _context.Entry(absence).Reference(a => a.CreatedByUser).LoadAsync();

        _logger.LogInformation("Ausencia registrada: DBA={UserId}, Fecha={Date}, Motivo={Reason}",
            request.UserId, request.Date.ToString("yyyy-MM-dd"), request.Reason);

        return new DbaAbsenceDto
        {
            Id = absence.Id,
            UserId = absence.UserId,
            UserDisplayName = absence.User?.DisplayName ?? absence.UserId,
            Date = absence.Date,
            Reason = absence.Reason,
            Notes = absence.Notes,
            CreatedByDisplayName = absence.CreatedByUser?.DisplayName ?? absence.CreatedByUserId,
            CreatedAt = absence.CreatedAt
        };
    }

    public async Task<bool> DeleteAsync(int id)
    {
        var absence = await _context.DbaAbsences.FindAsync(id);
        if (absence == null) return false;

        _context.DbaAbsences.Remove(absence);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Ausencia eliminada: Id={Id}", id);
        return true;
    }

    public async Task<List<DbaAbsenceDbaDto>> GetAvailableDbas()
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Members)
                .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Name == DBA_GROUP_NAME && !g.IsDeleted && g.IsActive);

        if (group == null)
        {
            _logger.LogWarning("Grupo '{GroupName}' no encontrado o inactivo", DBA_GROUP_NAME);
            return new List<DbaAbsenceDbaDto>();
        }

        return group.Members
            .Where(m => m.User != null && m.User.IsActive)
            .Select(m => new DbaAbsenceDbaDto
            {
                UserId = m.UserId,
                DisplayName = m.User!.DisplayName ?? m.User.UserName ?? m.UserId
            })
            .OrderBy(d => d.DisplayName)
            .ToList();
    }

    public async Task<DbaAbsenceStatsDto> GetStatsAsync(DateTime? dateFrom, DateTime? dateTo)
    {
        var query = _context.DbaAbsences
            .Include(a => a.User)
            .AsQueryable();

        if (dateFrom.HasValue)
            query = query.Where(a => a.Date >= dateFrom.Value.Date);
        else
            query = query.Where(a => a.Date >= DateTime.UtcNow.AddMonths(-6));

        if (dateTo.HasValue)
            query = query.Where(a => a.Date <= dateTo.Value.Date);

        var absences = await query.ToListAsync();

        var monthlyStats = absences
            .GroupBy(a => a.Date.ToString("yyyy-MM"))
            .OrderBy(g => g.Key)
            .Select(g => new MonthlyStatItem { Month = g.Key, Count = g.Count() })
            .ToList();

        var byDbaStats = absences
            .GroupBy(a => a.User?.DisplayName ?? a.UserId)
            .OrderByDescending(g => g.Count())
            .Select(g => new ByDbaStatItem { DisplayName = g.Key, Count = g.Count() })
            .ToList();

        return new DbaAbsenceStatsDto
        {
            MonthlyStats = monthlyStats,
            ByDbaStats = byDbaStats
        };
    }
}
