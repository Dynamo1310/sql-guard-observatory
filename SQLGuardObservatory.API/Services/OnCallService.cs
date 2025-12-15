using System.Globalization;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class OnCallService : IOnCallService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IEmailService _emailService;
    private readonly ITeamsNotificationService _teamsService;
    private readonly ILogger<OnCallService> _logger;
    
    // Colores para distinguir operadores en el calendario
    private static readonly string[] OperatorColors = new[]
    {
        "#3b82f6", // blue
        "#10b981", // emerald
        "#f59e0b", // amber
        "#ef4444", // red
        "#8b5cf6", // violet
        "#ec4899", // pink
        "#06b6d4", // cyan
        "#84cc16", // lime
        "#f97316", // orange
        "#6366f1"  // indigo
    };

    public OnCallService(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        IEmailService emailService,
        ITeamsNotificationService teamsService,
        ILogger<OnCallService> logger)
    {
        _context = context;
        _userManager = userManager;
        _emailService = emailService;
        _teamsService = teamsService;
        _logger = logger;
    }

    // ==================== OPERATORS ====================

    public async Task<List<OnCallOperatorDto>> GetOperatorsAsync()
    {
        return await _context.OnCallOperators
            .Include(o => o.User)
            .OrderBy(o => o.RotationOrder)
            .Select(o => new OnCallOperatorDto
            {
                Id = o.Id,
                UserId = o.UserId,
                DomainUser = o.User.DomainUser ?? "",
                DisplayName = o.User.DisplayName ?? "",
                Email = o.User.Email,
                RotationOrder = o.RotationOrder,
                IsActive = o.IsActive,
                CreatedAt = o.CreatedAt
            })
            .ToListAsync();
    }

    public async Task<OnCallOperatorDto> AddOperatorAsync(string userId, string requestingUserId)
    {
        // Cualquier usuario autenticado puede agregar operadores
        // Verificar que el usuario existe
        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            throw new ArgumentException("Usuario no encontrado");
        }

        // Verificar que no existe ya como operador
        var exists = await _context.OnCallOperators.AnyAsync(o => o.UserId == userId);
        if (exists)
        {
            throw new InvalidOperationException("El usuario ya es operador de guardia");
        }

        // Obtener el siguiente orden de rotación
        var maxOrder = await _context.OnCallOperators.MaxAsync(o => (int?)o.RotationOrder) ?? 0;

        var operador = new OnCallOperator
        {
            UserId = userId,
            RotationOrder = maxOrder + 1,
            IsActive = true,
            CreatedAt = DateTime.Now
        };

        _context.OnCallOperators.Add(operador);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Operador {UserId} agregado por {RequestingUserId}", userId, requestingUserId);

        return new OnCallOperatorDto
        {
            Id = operador.Id,
            UserId = operador.UserId,
            DomainUser = user.DomainUser ?? "",
            DisplayName = user.DisplayName ?? "",
            Email = user.Email,
            RotationOrder = operador.RotationOrder,
            IsActive = operador.IsActive,
            CreatedAt = operador.CreatedAt
        };
    }

    public async Task RemoveOperatorAsync(int operatorId, string requestingUserId)
    {
        // Cualquier usuario autenticado puede eliminar operadores
        var operador = await _context.OnCallOperators.FindAsync(operatorId);
        if (operador == null)
        {
            throw new ArgumentException("Operador no encontrado");
        }

        _context.OnCallOperators.Remove(operador);
        await _context.SaveChangesAsync();

        // Reordenar los operadores restantes
        var operators = await _context.OnCallOperators.OrderBy(o => o.RotationOrder).ToListAsync();
        for (int i = 0; i < operators.Count; i++)
        {
            operators[i].RotationOrder = i + 1;
        }
        await _context.SaveChangesAsync();

        _logger.LogInformation("Operador {OperatorId} eliminado por {RequestingUserId}", operatorId, requestingUserId);
    }

    public async Task ReorderOperatorsAsync(List<OperatorOrderItem> orders, string requestingUserId)
    {
        // Cualquier usuario autenticado puede reordenar operadores
        foreach (var item in orders)
        {
            var operador = await _context.OnCallOperators.FindAsync(item.Id);
            if (operador != null)
            {
                operador.RotationOrder = item.Order;
                operador.UpdatedAt = DateTime.Now;
            }
        }

        await _context.SaveChangesAsync();
        _logger.LogInformation("Operadores reordenados por {RequestingUserId}", requestingUserId);
    }

    // ==================== SCHEDULE ====================

    public async Task<MonthCalendarDto> GetMonthCalendarAsync(int year, int month)
    {
        var firstDayOfMonth = new DateTime(year, month, 1);
        var lastDayOfMonth = firstDayOfMonth.AddMonths(1).AddDays(-1);
        
        // Obtener el primer día de la semana del calendario (puede ser del mes anterior)
        var calendarStart = firstDayOfMonth.AddDays(-(int)firstDayOfMonth.DayOfWeek + 1);
        if (firstDayOfMonth.DayOfWeek == DayOfWeek.Sunday)
            calendarStart = firstDayOfMonth.AddDays(-6);
        
        // Obtener el último día del calendario (puede ser del mes siguiente)
        var calendarEnd = lastDayOfMonth.AddDays(7 - (int)lastDayOfMonth.DayOfWeek);
        if (lastDayOfMonth.DayOfWeek == DayOfWeek.Sunday)
            calendarEnd = lastDayOfMonth;

        // Obtener las guardias del rango
        var schedules = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate <= calendarEnd && s.WeekEndDate >= calendarStart)
            .OrderBy(s => s.WeekStartDate)
            .ToListAsync();

        // Obtener operadores para asignar colores
        var operators = await _context.OnCallOperators
            .OrderBy(o => o.RotationOrder)
            .Select(o => o.UserId)
            .ToListAsync();

        var userColorMap = operators
            .Select((userId, index) => new { userId, color = OperatorColors[index % OperatorColors.Length] })
            .ToDictionary(x => x.userId, x => x.color);

        var today = DateTime.Today;
        var days = new List<CalendarDayDto>();

        for (var date = calendarStart; date <= calendarEnd; date = date.AddDays(1))
        {
            var schedule = schedules.FirstOrDefault(s => 
                date >= s.WeekStartDate.Date && date < s.WeekEndDate.Date);

            var isStart = schedule != null && date.Date == schedule.WeekStartDate.Date;
            var isEnd = schedule != null && date.Date == schedule.WeekEndDate.Date;

            days.Add(new CalendarDayDto
            {
                Date = date,
                DayOfMonth = date.Day,
                IsCurrentMonth = date.Month == month,
                IsToday = date.Date == today,
                IsOnCallStart = isStart,
                IsOnCallEnd = isEnd,
                OnCallUserId = schedule?.UserId,
                OnCallDisplayName = schedule?.User?.DisplayName,
                ColorCode = schedule != null && userColorMap.ContainsKey(schedule.UserId) 
                    ? userColorMap[schedule.UserId] 
                    : "#6b7280"
            });
        }

        var onCallWeeks = schedules.Select(s => new OnCallWeekDto
        {
            ScheduleId = s.Id,
            WeekStartDate = s.WeekStartDate,
            WeekEndDate = s.WeekEndDate,
            WeekNumber = s.WeekNumber,
            UserId = s.UserId,
            DomainUser = s.User?.DomainUser ?? "",
            DisplayName = s.User?.DisplayName ?? "",
            ColorCode = userColorMap.ContainsKey(s.UserId) ? userColorMap[s.UserId] : "#6b7280",
            IsCurrentWeek = DateTime.Now >= s.WeekStartDate && DateTime.Now < s.WeekEndDate
        }).ToList();

        return new MonthCalendarDto
        {
            Year = year,
            Month = month,
            MonthName = new DateTime(year, month, 1).ToString("MMMM yyyy", new CultureInfo("es-AR")),
            Days = days,
            OnCallWeeks = onCallWeeks
        };
    }

    public async Task<List<OnCallScheduleDto>> GetSchedulesAsync(DateTime startDate, DateTime endDate)
    {
        return await _context.OnCallSchedules
            .Include(s => s.User)
            .Include(s => s.ModifiedByUser)
            .Where(s => s.WeekStartDate >= startDate && s.WeekStartDate <= endDate)
            .OrderBy(s => s.WeekStartDate)
            .Select(s => new OnCallScheduleDto
            {
                Id = s.Id,
                UserId = s.UserId,
                DomainUser = s.User.DomainUser ?? "",
                DisplayName = s.User.DisplayName ?? "",
                WeekStartDate = s.WeekStartDate,
                WeekEndDate = s.WeekEndDate,
                WeekNumber = s.WeekNumber,
                Year = s.Year,
                IsOverride = s.IsOverride,
                ModifiedByDisplayName = s.ModifiedByUser != null ? s.ModifiedByUser.DisplayName : null,
                CreatedAt = s.CreatedAt
            })
            .ToListAsync();
    }

    public async Task GenerateScheduleAsync(DateTime startDate, int weeksToGenerate, string requestingUserId)
    {
        // Cualquier usuario autenticado puede generar el calendario
        // Validar que sea miércoles
        if (startDate.DayOfWeek != DayOfWeek.Wednesday)
        {
            // Encontrar el próximo miércoles
            var daysUntilWednesday = ((int)DayOfWeek.Wednesday - (int)startDate.DayOfWeek + 7) % 7;
            if (daysUntilWednesday == 0) daysUntilWednesday = 7;
            startDate = startDate.AddDays(daysUntilWednesday);
        }

        // Establecer hora de inicio: 19:00
        startDate = startDate.Date.AddHours(19);

        var operators = await _context.OnCallOperators
            .Where(o => o.IsActive)
            .OrderBy(o => o.RotationOrder)
            .ToListAsync();

        if (operators.Count == 0)
        {
            throw new InvalidOperationException("No hay operadores de guardia configurados");
        }

        // Eliminar guardias futuras existentes desde la fecha de inicio
        var existingSchedules = await _context.OnCallSchedules
            .Where(s => s.WeekStartDate >= startDate)
            .ToListAsync();
        
        _context.OnCallSchedules.RemoveRange(existingSchedules);

        // Generar nuevas guardias
        var currentDate = startDate;
        var operatorIndex = 0;
        var calendar = CultureInfo.CurrentCulture.Calendar;

        for (int week = 0; week < weeksToGenerate; week++)
        {
            var weekEnd = currentDate.AddDays(7).Date.AddHours(7); // Miércoles siguiente 07:00
            var weekNumber = calendar.GetWeekOfYear(currentDate, CalendarWeekRule.FirstDay, DayOfWeek.Monday);

            var schedule = new OnCallSchedule
            {
                UserId = operators[operatorIndex].UserId,
                WeekStartDate = currentDate,
                WeekEndDate = weekEnd,
                WeekNumber = weekNumber,
                Year = currentDate.Year,
                IsOverride = false,
                CreatedAt = DateTime.Now
            };

            _context.OnCallSchedules.Add(schedule);

            operatorIndex = (operatorIndex + 1) % operators.Count;
            currentDate = currentDate.AddDays(7);
        }

        await _context.SaveChangesAsync();
        _logger.LogInformation("Calendario generado: {Weeks} semanas desde {StartDate} por {UserId}", 
            weeksToGenerate, startDate, requestingUserId);
    }

    public async Task UpdateScheduleAsync(int scheduleId, string newUserId, string requestingUserId, string? reason)
    {
        var schedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == scheduleId);

        if (schedule == null)
        {
            throw new ArgumentException("Guardia no encontrada");
        }

        var isEscalation = await IsEscalationUserAsync(requestingUserId);
        
        // Validar que no sea en el pasado
        if (schedule.WeekEndDate < DateTime.Now)
        {
            throw new InvalidOperationException("No se pueden modificar guardias pasadas");
        }

        // Si no es escalamiento, validar 7 días de anticipación
        if (!isEscalation)
        {
            var daysUntilStart = (schedule.WeekStartDate - DateTime.Now).TotalDays;
            if (daysUntilStart < 7)
            {
                throw new InvalidOperationException("Debe solicitar el cambio con al menos 7 días de anticipación");
            }
        }

        var oldUserId = schedule.UserId;
        var oldUser = schedule.User;

        // Actualizar la guardia
        schedule.UserId = newUserId;
        schedule.IsOverride = true;
        schedule.ModifiedByUserId = requestingUserId;
        schedule.UpdatedAt = DateTime.Now;

        await _context.SaveChangesAsync();

        // Notificar al usuario afectado si es una modificación de escalamiento
        if (isEscalation && oldUserId != newUserId && oldUser?.Email != null)
        {
            var escalationUser = await _context.Users.FindAsync(requestingUserId);
            await _emailService.SendEscalationOverrideNotificationAsync(
                oldUser.Email,
                oldUser.DisplayName ?? oldUser.DomainUser ?? "Usuario",
                escalationUser?.DisplayName ?? "Guardia de Escalamiento",
                schedule.WeekStartDate,
                schedule.WeekEndDate,
                reason);

            // Enviar también a Teams
            await _teamsService.SendEscalationOverrideNotificationAsync(
                oldUser.Email,
                oldUser.DisplayName ?? oldUser.DomainUser ?? "Usuario",
                escalationUser?.DisplayName ?? "Guardia de Escalamiento",
                schedule.WeekStartDate,
                schedule.WeekEndDate,
                reason);
        }

        _logger.LogInformation("Guardia {ScheduleId} actualizada: {OldUserId} -> {NewUserId} por {RequestingUserId}", 
            scheduleId, oldUserId, newUserId, requestingUserId);
    }

    public async Task<OnCallCurrentDto> GetCurrentOnCallAsync()
    {
        var now = DateTime.Now;
        
        var currentSchedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate <= now && s.WeekEndDate > now)
            .FirstOrDefaultAsync();

        var escalationUsers = await _context.Users
            .Where(u => u.IsOnCallEscalation && u.IsActive)
            .OrderBy(u => u.EscalationOrder ?? 999)
            .ThenBy(u => u.DisplayName)
            .Select(u => new EscalationUserDto
            {
                UserId = u.Id,
                DomainUser = u.DomainUser ?? "",
                DisplayName = u.DisplayName ?? "",
                Email = u.Email,
                Order = u.EscalationOrder ?? 999
            })
            .ToListAsync();

        if (currentSchedule == null)
        {
            return new OnCallCurrentDto
            {
                IsCurrentlyOnCall = false,
                EscalationUsers = escalationUsers
            };
        }

        return new OnCallCurrentDto
        {
            UserId = currentSchedule.UserId,
            DomainUser = currentSchedule.User?.DomainUser ?? "",
            DisplayName = currentSchedule.User?.DisplayName ?? "",
            Email = currentSchedule.User?.Email,
            WeekStartDate = currentSchedule.WeekStartDate,
            WeekEndDate = currentSchedule.WeekEndDate,
            WeekNumber = currentSchedule.WeekNumber,
            IsCurrentlyOnCall = true,
            EscalationUsers = escalationUsers
        };
    }

    public async Task<OnCallScheduleDto?> GetScheduleByDateAsync(DateTime date)
    {
        var schedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate <= date && s.WeekEndDate > date)
            .FirstOrDefaultAsync();

        if (schedule == null)
            return null;

        return new OnCallScheduleDto
        {
            Id = schedule.Id,
            UserId = schedule.UserId,
            DomainUser = schedule.User?.DomainUser ?? "",
            DisplayName = schedule.User?.DisplayName ?? "",
            WeekStartDate = schedule.WeekStartDate,
            WeekEndDate = schedule.WeekEndDate,
            WeekNumber = schedule.WeekNumber,
            Year = schedule.WeekStartDate.Year,
            IsOverride = schedule.IsOverride,
            CreatedAt = schedule.CreatedAt
        };
    }

    // ==================== SWAP REQUESTS ====================

    public async Task<List<OnCallSwapRequestDto>> GetSwapRequestsAsync(string userId)
    {
        var isEscalation = await IsEscalationUserAsync(userId);

        var query = _context.OnCallSwapRequests
            .Include(r => r.Requester)
            .Include(r => r.TargetUser)
            .Include(r => r.OriginalSchedule)
            .Include(r => r.SwapSchedule)
            .AsQueryable();

        // Si no es escalamiento, solo ve sus propias solicitudes
        if (!isEscalation)
        {
            query = query.Where(r => r.RequesterId == userId || r.TargetUserId == userId);
        }

        return await query
            .OrderByDescending(r => r.RequestedAt)
            .Select(r => new OnCallSwapRequestDto
            {
                Id = r.Id,
                RequesterId = r.RequesterId,
                RequesterDomainUser = r.Requester.DomainUser ?? "",
                RequesterDisplayName = r.Requester.DisplayName ?? "",
                TargetUserId = r.TargetUserId,
                TargetDomainUser = r.TargetUser.DomainUser ?? "",
                TargetDisplayName = r.TargetUser.DisplayName ?? "",
                OriginalScheduleId = r.OriginalScheduleId,
                OriginalWeekStartDate = r.OriginalSchedule.WeekStartDate,
                OriginalWeekEndDate = r.OriginalSchedule.WeekEndDate,
                SwapScheduleId = r.SwapScheduleId,
                SwapWeekStartDate = r.SwapSchedule != null ? r.SwapSchedule.WeekStartDate : null,
                SwapWeekEndDate = r.SwapSchedule != null ? r.SwapSchedule.WeekEndDate : null,
                Status = r.Status,
                RejectionReason = r.RejectionReason,
                RequestReason = r.RequestReason,
                RequestedAt = r.RequestedAt,
                RespondedAt = r.RespondedAt,
                IsEscalationOverride = r.IsEscalationOverride
            })
            .ToListAsync();
    }

    public async Task<OnCallSwapRequestDto> CreateSwapRequestAsync(CreateSwapRequestDto request, string requesterId)
    {
        var schedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.Id == request.OriginalScheduleId);

        if (schedule == null)
        {
            throw new ArgumentException("Guardia no encontrada");
        }

        // Verificar que el solicitante es el dueño de la guardia
        if (schedule.UserId != requesterId)
        {
            throw new UnauthorizedAccessException("Solo puedes solicitar intercambio de tus propias guardias");
        }

        // Verificar que la guardia no ha pasado
        if (schedule.WeekEndDate < DateTime.Now)
        {
            throw new InvalidOperationException("No se pueden intercambiar guardias pasadas");
        }

        // Verificar 7 días de anticipación
        var daysUntilStart = (schedule.WeekStartDate - DateTime.Now).TotalDays;
        if (daysUntilStart < 7)
        {
            throw new InvalidOperationException("Debe solicitar el intercambio con al menos 7 días de anticipación");
        }

        // Verificar que el usuario objetivo existe y es operador
        var targetUser = await _context.Users.FindAsync(request.TargetUserId);
        if (targetUser == null)
        {
            throw new ArgumentException("Usuario objetivo no encontrado");
        }

        var isOperator = await _context.OnCallOperators.AnyAsync(o => o.UserId == request.TargetUserId && o.IsActive);
        if (!isOperator)
        {
            throw new InvalidOperationException("El usuario objetivo no es un operador de guardia activo");
        }

        // Verificar que no existe ya una solicitud pendiente para esta guardia
        var existingRequest = await _context.OnCallSwapRequests
            .AnyAsync(r => r.OriginalScheduleId == request.OriginalScheduleId && r.Status == "Pending");
        
        if (existingRequest)
        {
            throw new InvalidOperationException("Ya existe una solicitud pendiente para esta guardia");
        }

        var swapRequest = new OnCallSwapRequest
        {
            RequesterId = requesterId,
            TargetUserId = request.TargetUserId,
            OriginalScheduleId = request.OriginalScheduleId,
            SwapScheduleId = request.SwapScheduleId,
            Status = "Pending",
            RequestReason = request.Reason,
            RequestedAt = DateTime.Now
        };

        _context.OnCallSwapRequests.Add(swapRequest);
        await _context.SaveChangesAsync();

        // Enviar notificación por email al usuario objetivo
        var requester = await _context.Users.FindAsync(requesterId);
        if (targetUser.Email != null)
        {
            await _emailService.SendSwapRequestNotificationAsync(
                targetUser.Email,
                targetUser.DisplayName ?? targetUser.DomainUser ?? "Usuario",
                requester?.DisplayName ?? requester?.DomainUser ?? "Usuario",
                schedule.WeekStartDate,
                schedule.WeekEndDate,
                request.Reason);

            // Enviar también a Teams
            await _teamsService.SendSwapRequestNotificationAsync(
                targetUser.Email,
                targetUser.DisplayName ?? targetUser.DomainUser ?? "Usuario",
                requester?.DisplayName ?? requester?.DomainUser ?? "Usuario",
                schedule.WeekStartDate,
                schedule.WeekEndDate,
                request.Reason,
                swapRequest.Id);
        }

        _logger.LogInformation("Solicitud de intercambio creada: {RequestId} de {RequesterId} a {TargetUserId}", 
            swapRequest.Id, requesterId, request.TargetUserId);

        return await GetSwapRequestByIdAsync(swapRequest.Id);
    }

    public async Task ApproveSwapRequestAsync(int requestId, string approverId)
    {
        var request = await _context.OnCallSwapRequests
            .Include(r => r.Requester)
            .Include(r => r.TargetUser)
            .Include(r => r.OriginalSchedule)
            .Include(r => r.SwapSchedule)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (request == null)
        {
            throw new ArgumentException("Solicitud no encontrada");
        }

        if (request.Status != "Pending")
        {
            throw new InvalidOperationException("La solicitud ya fue procesada");
        }

        // Solo el usuario objetivo o escalamiento pueden aprobar
        var isEscalation = await IsEscalationUserAsync(approverId);
        if (request.TargetUserId != approverId && !isEscalation)
        {
            throw new UnauthorizedAccessException("No tienes permiso para aprobar esta solicitud");
        }

        // Realizar el intercambio
        var originalSchedule = request.OriginalSchedule;
        originalSchedule.UserId = request.TargetUserId;
        originalSchedule.IsOverride = true;
        originalSchedule.ModifiedByUserId = approverId;
        originalSchedule.UpdatedAt = DateTime.Now;

        // Si hay una guardia a intercambiar, actualizar también
        if (request.SwapSchedule != null)
        {
            request.SwapSchedule.UserId = request.RequesterId;
            request.SwapSchedule.IsOverride = true;
            request.SwapSchedule.ModifiedByUserId = approverId;
            request.SwapSchedule.UpdatedAt = DateTime.Now;
        }

        request.Status = "Approved";
        request.RespondedAt = DateTime.Now;

        await _context.SaveChangesAsync();

        // Notificar al solicitante
        if (request.Requester?.Email != null)
        {
            await _emailService.SendSwapApprovedNotificationAsync(
                request.Requester.Email,
                request.Requester.DisplayName ?? request.Requester.DomainUser ?? "Usuario",
                request.TargetUser?.DisplayName ?? "Usuario",
                originalSchedule.WeekStartDate,
                originalSchedule.WeekEndDate);

            // Enviar también a Teams
            await _teamsService.SendSwapApprovedNotificationAsync(
                request.Requester.Email,
                request.Requester.DisplayName ?? request.Requester.DomainUser ?? "Usuario",
                request.TargetUser?.DisplayName ?? "Usuario",
                originalSchedule.WeekStartDate,
                originalSchedule.WeekEndDate);
        }

        _logger.LogInformation("Solicitud {RequestId} aprobada por {ApproverId}", requestId, approverId);
    }

    public async Task RejectSwapRequestAsync(int requestId, string rejecterId, string reason)
    {
        var request = await _context.OnCallSwapRequests
            .Include(r => r.Requester)
            .Include(r => r.TargetUser)
            .Include(r => r.OriginalSchedule)
            .FirstOrDefaultAsync(r => r.Id == requestId);

        if (request == null)
        {
            throw new ArgumentException("Solicitud no encontrada");
        }

        if (request.Status != "Pending")
        {
            throw new InvalidOperationException("La solicitud ya fue procesada");
        }

        // Solo el usuario objetivo o escalamiento pueden rechazar
        var isEscalation = await IsEscalationUserAsync(rejecterId);
        if (request.TargetUserId != rejecterId && !isEscalation)
        {
            throw new UnauthorizedAccessException("No tienes permiso para rechazar esta solicitud");
        }

        request.Status = "Rejected";
        request.RejectionReason = reason;
        request.RespondedAt = DateTime.Now;

        await _context.SaveChangesAsync();

        // Notificar al solicitante
        if (request.Requester?.Email != null)
        {
            await _emailService.SendSwapRejectedNotificationAsync(
                request.Requester.Email,
                request.Requester.DisplayName ?? request.Requester.DomainUser ?? "Usuario",
                request.TargetUser?.DisplayName ?? "Usuario",
                request.OriginalSchedule.WeekStartDate,
                request.OriginalSchedule.WeekEndDate,
                reason);

            // Enviar también a Teams
            await _teamsService.SendSwapRejectedNotificationAsync(
                request.Requester.Email,
                request.Requester.DisplayName ?? request.Requester.DomainUser ?? "Usuario",
                request.TargetUser?.DisplayName ?? "Usuario",
                request.OriginalSchedule.WeekStartDate,
                request.OriginalSchedule.WeekEndDate,
                reason);
        }

        _logger.LogInformation("Solicitud {RequestId} rechazada por {RejecterId}: {Reason}", requestId, rejecterId, reason);
    }

    // ==================== UTILITIES ====================

    public async Task<List<WhitelistUserDto>> GetWhitelistUsersAsync()
    {
        var operators = await _context.OnCallOperators
            .Select(o => o.UserId)
            .ToListAsync();

        return await _context.Users
            .Where(u => u.IsActive)
            .Select(u => new WhitelistUserDto
            {
                Id = u.Id,
                DomainUser = u.DomainUser ?? "",
                DisplayName = u.DisplayName ?? "",
                Email = u.Email,
                IsOperator = operators.Contains(u.Id),
                IsEscalation = u.IsOnCallEscalation
            })
            .OrderBy(u => u.DisplayName)
            .ToListAsync();
    }

    public async Task<bool> IsEscalationUserAsync(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        return user?.IsOnCallEscalation ?? false;
    }

    public async Task<bool> CanManageEscalationAsync(string userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user == null) return false;
        
        // Escalamiento puede gestionar escalamiento
        if (user.IsOnCallEscalation) return true;
        
        // SuperAdmin puede gestionar escalamiento
        var roles = await _userManager.GetRolesAsync(user);
        return roles.Contains("SuperAdmin");
    }

    public async Task<List<EscalationUserDto>> GetEscalationUsersAsync()
    {
        return await _context.Users
            .Where(u => u.IsOnCallEscalation && u.IsActive)
            .OrderBy(u => u.EscalationOrder ?? 999)
            .ThenBy(u => u.DisplayName)
            .Select(u => new EscalationUserDto
            {
                UserId = u.Id,
                DomainUser = u.DomainUser ?? "",
                DisplayName = u.DisplayName ?? "",
                Email = u.Email,
                Order = u.EscalationOrder ?? 999
            })
            .ToListAsync();
    }

    public async Task AddEscalationUserAsync(string userId, string requestingUserId)
    {
        // Solo usuarios de escalamiento o SuperAdmin pueden agregar otros escalamientos
        if (!await CanManageEscalationAsync(requestingUserId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento o SuperAdmin pueden gestionar usuarios de escalamiento");
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            throw new ArgumentException("Usuario no encontrado");
        }

        if (user.IsOnCallEscalation)
        {
            throw new InvalidOperationException("El usuario ya es guardia de escalamiento");
        }

        // Asignar el siguiente orden disponible
        var maxOrder = await _context.Users
            .Where(u => u.IsOnCallEscalation)
            .MaxAsync(u => (int?)u.EscalationOrder) ?? 0;

        user.IsOnCallEscalation = true;
        user.EscalationOrder = maxOrder + 1;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Usuario {UserId} agregado como escalamiento (orden {Order}) por {RequestingUserId}", userId, user.EscalationOrder, requestingUserId);
    }

    public async Task UpdateEscalationOrderAsync(List<string> userIds, string requestingUserId)
    {
        // Solo usuarios de escalamiento o SuperAdmin pueden reordenar
        if (!await CanManageEscalationAsync(requestingUserId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento o SuperAdmin pueden gestionar usuarios de escalamiento");
        }

        for (int i = 0; i < userIds.Count; i++)
        {
            var user = await _context.Users.FindAsync(userIds[i]);
            if (user != null && user.IsOnCallEscalation)
            {
                user.EscalationOrder = i + 1;
            }
        }

        await _context.SaveChangesAsync();
        _logger.LogInformation("Orden de escalamiento actualizado por {RequestingUserId}", requestingUserId);
    }

    public async Task RemoveEscalationUserAsync(string userId, string requestingUserId)
    {
        // Solo usuarios de escalamiento o SuperAdmin pueden quitar otros escalamientos
        if (!await CanManageEscalationAsync(requestingUserId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento o SuperAdmin pueden gestionar usuarios de escalamiento");
        }

        // No permitir quitarse a uno mismo si es el último
        var escalationCount = await _context.Users.CountAsync(u => u.IsOnCallEscalation);
        if (escalationCount <= 1 && userId == requestingUserId)
        {
            throw new InvalidOperationException("No puedes quitarte como escalamiento si eres el único");
        }

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
        {
            throw new ArgumentException("Usuario no encontrado");
        }

        if (!user.IsOnCallEscalation)
        {
            throw new InvalidOperationException("El usuario no es guardia de escalamiento");
        }

        user.IsOnCallEscalation = false;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Usuario {UserId} removido de escalamiento por {RequestingUserId}", userId, requestingUserId);
    }

    private async Task<OnCallSwapRequestDto> GetSwapRequestByIdAsync(int id)
    {
        var r = await _context.OnCallSwapRequests
            .Include(r => r.Requester)
            .Include(r => r.TargetUser)
            .Include(r => r.OriginalSchedule)
            .Include(r => r.SwapSchedule)
            .FirstAsync(r => r.Id == id);

        return new OnCallSwapRequestDto
        {
            Id = r.Id,
            RequesterId = r.RequesterId,
            RequesterDomainUser = r.Requester.DomainUser ?? "",
            RequesterDisplayName = r.Requester.DisplayName ?? "",
            TargetUserId = r.TargetUserId,
            TargetDomainUser = r.TargetUser.DomainUser ?? "",
            TargetDisplayName = r.TargetUser.DisplayName ?? "",
            OriginalScheduleId = r.OriginalScheduleId,
            OriginalWeekStartDate = r.OriginalSchedule.WeekStartDate,
            OriginalWeekEndDate = r.OriginalSchedule.WeekEndDate,
            SwapScheduleId = r.SwapScheduleId,
            SwapWeekStartDate = r.SwapSchedule?.WeekStartDate,
            SwapWeekEndDate = r.SwapSchedule?.WeekEndDate,
            Status = r.Status,
            RejectionReason = r.RejectionReason,
            RequestReason = r.RequestReason,
            RequestedAt = r.RequestedAt,
            RespondedAt = r.RespondedAt,
            IsEscalationOverride = r.IsEscalationOverride
        };
    }
}

