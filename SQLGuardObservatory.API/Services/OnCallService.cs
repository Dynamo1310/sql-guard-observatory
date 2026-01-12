using System.Globalization;
using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class OnCallService : IOnCallService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IEmailService _emailService;
    private readonly ITeamsNotificationService _teamsService;
    private readonly IOnCallAlertService _alertService;
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
        IOnCallAlertService alertService,
        ILogger<OnCallService> logger)
    {
        _context = context;
        _userManager = userManager;
        _emailService = emailService;
        _teamsService = teamsService;
        _alertService = alertService;
        _logger = logger;
    }

    // ==================== OPERATORS ====================

    public async Task<List<OnCallOperatorDto>> GetOperatorsAsync()
    {
        var operators = await _context.OnCallOperators
            .Include(o => o.User)
            .OrderBy(o => o.RotationOrder)
            .ToListAsync();
        
        return operators.Select(o => new OnCallOperatorDto
        {
            Id = o.Id,
            UserId = o.UserId,
            DomainUser = o.User?.DomainUser ?? "",
            DisplayName = o.User?.DisplayName ?? "",
            Email = o.User?.Email,
            RotationOrder = o.RotationOrder,
            IsActive = o.IsActive,
            CreatedAt = o.CreatedAt,
            ProfilePhotoUrl = GetProfilePhotoUrl(o.User?.ProfilePhoto),
            ColorCode = o.ColorCode,
            PhoneNumber = o.PhoneNumber
        }).ToList();
    }

    // Colores por defecto para asignar automáticamente a nuevos operadores
    private static readonly string[] DefaultColors = new[]
    {
        "#3B82F6", // Azul
        "#10B981", // Verde
        "#F59E0B", // Ámbar
        "#EF4444", // Rojo
        "#8B5CF6", // Violeta
        "#EC4899", // Rosa
        "#06B6D4", // Cian
        "#84CC16", // Lima
        "#F97316", // Naranja
        "#6366F1", // Índigo
    };

    public async Task<OnCallOperatorDto> AddOperatorAsync(string userId, string requestingUserId, string? colorCode = null, string? phoneNumber = null)
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

        // Asignar color: usar el proporcionado o seleccionar uno automáticamente
        var finalColor = colorCode;
        if (string.IsNullOrEmpty(finalColor))
        {
            var operatorCount = await _context.OnCallOperators.CountAsync();
            finalColor = DefaultColors[operatorCount % DefaultColors.Length];
        }

        var operador = new OnCallOperator
        {
            UserId = userId,
            RotationOrder = maxOrder + 1,
            IsActive = true,
            ColorCode = finalColor,
            PhoneNumber = phoneNumber,
            CreatedAt = DateTime.Now
        };

        _context.OnCallOperators.Add(operador);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Operador {UserId} agregado por {RequestingUserId} con color {Color}", userId, requestingUserId, finalColor);

        return new OnCallOperatorDto
        {
            Id = operador.Id,
            UserId = operador.UserId,
            DomainUser = user.DomainUser ?? "",
            DisplayName = user.DisplayName ?? "",
            Email = user.Email,
            RotationOrder = operador.RotationOrder,
            IsActive = operador.IsActive,
            CreatedAt = operador.CreatedAt,
            ProfilePhotoUrl = GetProfilePhotoUrl(user.ProfilePhoto),
            ColorCode = operador.ColorCode,
            PhoneNumber = operador.PhoneNumber
        };
    }

    public async Task UpdateOperatorColorAsync(int operatorId, string colorCode, string requestingUserId)
    {
        var operador = await _context.OnCallOperators.FindAsync(operatorId);
        if (operador == null)
        {
            throw new ArgumentException("Operador no encontrado");
        }

        operador.ColorCode = colorCode;
        operador.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Color del operador {OperatorId} actualizado a {Color} por {RequestingUserId}", 
            operatorId, colorCode, requestingUserId);
    }

    public async Task UpdateOperatorPhoneAsync(int operatorId, string? phoneNumber, string requestingUserId)
    {
        var operador = await _context.OnCallOperators.FindAsync(operatorId);
        if (operador == null)
        {
            throw new ArgumentException("Operador no encontrado");
        }

        operador.PhoneNumber = phoneNumber;
        operador.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Teléfono del operador {OperatorId} actualizado por {RequestingUserId}", 
            operatorId, requestingUserId);
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

        // Obtener operadores con sus colores asignados
        var operators = await _context.OnCallOperators
            .OrderBy(o => o.RotationOrder)
            .Select(o => new { o.UserId, o.ColorCode })
            .ToListAsync();

        // Usar el color asignado de cada operador, o un color por defecto si no tiene
        var userColorMap = operators
            .Select((op, index) => new { 
                op.UserId, 
                Color = !string.IsNullOrEmpty(op.ColorCode) 
                    ? op.ColorCode 
                    : OperatorColors[index % OperatorColors.Length] 
            })
            .ToDictionary(x => x.UserId, x => x.Color);

        // Obtener los overrides de días individuales para el rango
        var dayOverrides = await _context.OnCallDayOverrides
            .Include(o => o.CoverUser)
            .Where(o => o.IsActive && o.Date >= calendarStart && o.Date <= calendarEnd)
            .ToListAsync();

        var today = DateTime.Today;
        var days = new List<CalendarDayDto>();

        for (var date = calendarStart; date <= calendarEnd; date = date.AddDays(1))
        {
            // Verificar si hay un override para este día específico
            var dayOverride = dayOverrides.FirstOrDefault(o => o.Date.Date == date.Date);
            
            var schedule = schedules.FirstOrDefault(s => 
                date >= s.WeekStartDate.Date && date < s.WeekEndDate.Date);

            var isStart = schedule != null && date.Date == schedule.WeekStartDate.Date;
            var isEnd = schedule != null && date.Date == schedule.WeekEndDate.Date;

            // Si hay override, usar el usuario de cobertura
            string? effectiveUserId;
            string? effectiveDisplayName;
            string effectiveColor;

            if (dayOverride != null)
            {
                effectiveUserId = dayOverride.CoverUserId;
                effectiveDisplayName = dayOverride.CoverUser?.DisplayName ?? "Cobertura";
                effectiveColor = userColorMap.TryGetValue(dayOverride.CoverUserId, out var overrideColor) 
                    ? overrideColor 
                    : "#f59e0b"; // Color ámbar para coberturas sin color asignado
            }
            else
            {
                effectiveUserId = schedule?.UserId;
                effectiveDisplayName = schedule?.User?.DisplayName;
                effectiveColor = schedule != null && userColorMap.TryGetValue(schedule.UserId, out var dayColor) 
                    ? dayColor 
                    : "#6b7280";
            }

            days.Add(new CalendarDayDto
            {
                Date = date,
                DayOfMonth = date.Day,
                IsCurrentMonth = date.Month == month,
                IsToday = date.Date == today,
                IsOnCallStart = isStart && dayOverride == null, // No marcar como inicio si hay override
                IsOnCallEnd = isEnd && dayOverride == null,     // No marcar como fin si hay override
                OnCallUserId = effectiveUserId,
                OnCallDisplayName = effectiveDisplayName,
                ColorCode = effectiveColor
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
            ColorCode = userColorMap.TryGetValue(s.UserId, out var color) ? color : "#6b7280",
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

        // Obtener configuración para verificar si requiere aprobación
        var config = await _context.OnCallConfig.FirstOrDefaultAsync();
        var requiresApproval = config?.RequiresApproval ?? false;
        var approverId = config?.ApproverId;
        var isPendingApproval = requiresApproval && !string.IsNullOrEmpty(approverId);

        // Crear el plan de generación (lista de operadores en orden)
        var schedulePlan = new SchedulePlanData
        {
            OperatorUserIds = operators.Select(o => o.UserId).ToList(),
            StartingOperatorIndex = 0
        };

        // Crear lote de generación
        var endDate = startDate.AddDays(7 * weeksToGenerate);
        var batch = new OnCallScheduleBatch
        {
            StartDate = startDate,
            EndDate = endDate,
            WeeksGenerated = weeksToGenerate,
            Status = isPendingApproval 
                ? ScheduleBatchStatus.PendingApproval 
                : ScheduleBatchStatus.Approved,
            GeneratedByUserId = requestingUserId,
            GeneratedAt = LocalClockAR.Now,
            ApproverUserId = isPendingApproval ? approverId : null,
            ApprovedAt = isPendingApproval ? null : LocalClockAR.Now,
            ApprovedByUserId = isPendingApproval ? null : requestingUserId,
            // Guardar el plan de generación para recrear las guardias al aprobar
            SchedulePlan = isPendingApproval ? JsonSerializer.Serialize(schedulePlan) : null
        };

        _context.OnCallScheduleBatches.Add(batch);
        await _context.SaveChangesAsync(); // Guardar para obtener el ID del batch

        // Solo crear las guardias si NO requiere aprobación
        // Si requiere aprobación, las guardias se crearán cuando se apruebe el calendario
        if (!isPendingApproval)
        {
            // Eliminar guardias futuras existentes desde la fecha de inicio
            var existingSchedules = await _context.OnCallSchedules
                .Where(s => s.WeekStartDate >= startDate)
                .ToListAsync();
            
            _context.OnCallSchedules.RemoveRange(existingSchedules);

            // Generar nuevas guardias
            await CreateSchedulesFromPlanAsync(batch, schedulePlan);

            // Disparar alertas configuradas por los usuarios
            await _alertService.TriggerScheduleGeneratedAlertsAsync(startDate, endDate, weeksToGenerate);
            
            _logger.LogInformation("Calendario generado y aprobado: {Weeks} semanas desde {StartDate} por {UserId}", 
                weeksToGenerate, startDate, requestingUserId);
        }
        else
        {
            // Enviar email al aprobador
            var approver = await _context.Users.FindAsync(approverId);
            var generator = await _context.Users.FindAsync(requestingUserId);
            
            if (approver != null && !string.IsNullOrEmpty(approver.Email))
            {
                await _alertService.SendSchedulePendingApprovalEmailAsync(
                    approver.Email,
                    approver.DisplayName ?? approver.DomainUser ?? "Aprobador",
                    generator?.DisplayName ?? generator?.DomainUser ?? "Usuario",
                    startDate,
                    endDate,
                    weeksToGenerate,
                    batch.Id);
            }
            
            _logger.LogInformation(
                "Calendario pendiente de aprobación: {Weeks} semanas desde {StartDate} por {UserId}, aprobador: {ApproverId}", 
                weeksToGenerate, startDate, requestingUserId, approverId);
        }
    }

    /// <summary>
    /// Crea las guardias en la base de datos a partir del plan de generación
    /// </summary>
    private async Task CreateSchedulesFromPlanAsync(OnCallScheduleBatch batch, SchedulePlanData plan)
    {
        var currentDate = batch.StartDate;
        var operatorIndex = plan.StartingOperatorIndex;
        var calendar = CultureInfo.CurrentCulture.Calendar;

        for (int week = 0; week < batch.WeeksGenerated; week++)
        {
            var weekEnd = currentDate.AddDays(7).Date.AddHours(7); // Miércoles siguiente 07:00
            var weekNumber = calendar.GetWeekOfYear(currentDate, CalendarWeekRule.FirstDay, DayOfWeek.Monday);

            var schedule = new OnCallSchedule
            {
                UserId = plan.OperatorUserIds[operatorIndex],
                WeekStartDate = currentDate,
                WeekEndDate = weekEnd,
                WeekNumber = weekNumber,
                Year = currentDate.Year,
                IsOverride = false,
                CreatedAt = LocalClockAR.Now,
                BatchId = batch.Id
            };

            _context.OnCallSchedules.Add(schedule);

            operatorIndex = (operatorIndex + 1) % plan.OperatorUserIds.Count;
            currentDate = currentDate.AddDays(7);
        }

        await _context.SaveChangesAsync();
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

        // Disparar alertas configuradas por los usuarios
        if (oldUserId != newUserId)
        {
            var modifiedByUser = await _context.Users.FindAsync(requestingUserId);
            await _alertService.TriggerScheduleModifiedAlertsAsync(
                oldUser?.DisplayName ?? oldUser?.DomainUser ?? "Usuario",
                modifiedByUser?.DisplayName ?? modifiedByUser?.DomainUser ?? "Usuario",
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

        // Obtener el operador actual para su teléfono y color
        OnCallOperator? currentOperator = null;
        if (currentSchedule != null)
        {
            currentOperator = await _context.OnCallOperators
                .FirstOrDefaultAsync(o => o.UserId == currentSchedule.UserId);
        }

        // Obtener usuarios de escalamiento desde la nueva tabla
        var escalationUsers = await _context.OnCallEscalations
            .Include(e => e.User)
            .Where(e => e.IsActive)
            .OrderBy(e => e.EscalationOrder)
            .ThenBy(e => e.User.DisplayName)
            .Select(e => new EscalationUserDto
            {
                Id = e.Id,
                UserId = e.UserId,
                DomainUser = e.User.DomainUser ?? "",
                DisplayName = e.User.DisplayName ?? "",
                Email = e.User.Email,
                Order = e.EscalationOrder,
                ColorCode = e.ColorCode,
                PhoneNumber = e.PhoneNumber
            })
            .ToListAsync();

        // Si no hay escalamientos en la nueva tabla, intentar migrar desde Users (compatibilidad)
        if (!escalationUsers.Any())
        {
            escalationUsers = await _context.Users
                .Where(u => u.IsOnCallEscalation && u.IsActive)
                .OrderBy(u => u.EscalationOrder ?? 999)
                .ThenBy(u => u.DisplayName)
                .Select(u => new EscalationUserDto
                {
                    Id = 0,
                    UserId = u.Id,
                    DomainUser = u.DomainUser ?? "",
                    DisplayName = u.DisplayName ?? "",
                    Email = u.Email,
                    Order = u.EscalationOrder ?? 999,
                    ColorCode = null,
                    PhoneNumber = null
                })
                .ToListAsync();
        }

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
            PhoneNumber = currentOperator?.PhoneNumber,
            ColorCode = currentOperator?.ColorCode,
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

    public async Task<List<OnCallScheduleDto>> GetUserSchedulesAsync(string userId)
    {
        var now = DateTime.Now;
        
        // Obtener guardias futuras del usuario (con al menos 7 días de anticipación para intercambios)
        var schedules = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.UserId == userId && s.WeekStartDate > now.AddDays(7))
            .OrderBy(s => s.WeekStartDate)
            .Select(s => new OnCallScheduleDto
            {
                Id = s.Id,
                UserId = s.UserId,
                DomainUser = s.User != null ? s.User.DomainUser ?? "" : "",
                DisplayName = s.User != null ? s.User.DisplayName ?? "" : "",
                WeekStartDate = s.WeekStartDate,
                WeekEndDate = s.WeekEndDate,
                WeekNumber = s.WeekNumber,
                Year = s.WeekStartDate.Year,
                IsOverride = s.IsOverride,
                CreatedAt = s.CreatedAt
            })
            .ToListAsync();

        return schedules;
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

        // Disparar alertas configuradas por los usuarios
        await _alertService.TriggerSwapRequestedAlertsAsync(
            requester?.DisplayName ?? requester?.DomainUser ?? "Usuario",
            targetUser.DisplayName ?? targetUser.DomainUser ?? "Usuario",
            schedule.WeekStartDate,
            schedule.WeekEndDate,
            request.Reason,
            swapRequest.Id);

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

        // Disparar alertas configuradas por los usuarios
        await _alertService.TriggerSwapApprovedAlertsAsync(
            request.Requester?.DisplayName ?? request.Requester?.DomainUser ?? "Usuario",
            request.TargetUser?.DisplayName ?? request.TargetUser?.DomainUser ?? "Usuario",
            originalSchedule.WeekStartDate,
            originalSchedule.WeekEndDate);

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

        // Disparar alertas configuradas por los usuarios
        await _alertService.TriggerSwapRejectedAlertsAsync(
            request.Requester?.DisplayName ?? request.Requester?.DomainUser ?? "Usuario",
            request.TargetUser?.DisplayName ?? request.TargetUser?.DomainUser ?? "Usuario",
            request.OriginalSchedule.WeekStartDate,
            request.OriginalSchedule.WeekEndDate,
            reason);

        _logger.LogInformation("Solicitud {RequestId} rechazada por {RejecterId}: {Reason}", requestId, rejecterId, reason);
    }

    // ==================== UTILITIES ====================

    public async Task<List<WhitelistUserDto>> GetWhitelistUsersAsync()
    {
        var operatorUserIds = await _context.OnCallOperators
            .Select(o => o.UserId)
            .ToListAsync();

        var users = await _context.Users
            .Where(u => u.IsActive)
            .OrderBy(u => u.DisplayName)
            .ToListAsync();
        
        return users.Select(u => new WhitelistUserDto
        {
            Id = u.Id,
            DomainUser = u.DomainUser ?? "",
            DisplayName = u.DisplayName ?? "",
            Email = u.Email,
            IsOperator = operatorUserIds.Contains(u.Id),
            IsEscalation = u.IsOnCallEscalation,
            ProfilePhotoUrl = GetProfilePhotoUrl(u.ProfilePhoto)
        }).ToList();
    }

    public async Task<bool> IsEscalationUserAsync(string userId)
    {
        // Primero verificar en la nueva tabla
        var existsInNew = await _context.OnCallEscalations.AnyAsync(e => e.UserId == userId && e.IsActive);
        if (existsInNew) return true;

        // Fallback a la tabla Users (compatibilidad)
        var user = await _context.Users.FindAsync(userId);
        return user?.IsOnCallEscalation ?? false;
    }

    public async Task<bool> CanManageEscalationAsync(string userId)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
            .FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null) return false;
        
        // Verificar si es escalamiento (nueva tabla primero)
        var isEscalation = await _context.OnCallEscalations.AnyAsync(e => e.UserId == userId && e.IsActive);
        if (isEscalation) return true;

        // Fallback: verificar en Users
        if (user.IsOnCallEscalation) return true;
        
        // SuperAdmin puede gestionar escalamiento
        return user.AdminRole?.Name == "SuperAdmin";
    }

    public async Task<List<EscalationUserDto>> GetEscalationUsersAsync()
    {
        // Primero intentar desde la nueva tabla
        var escalations = await _context.OnCallEscalations
            .Include(e => e.User)
            .Where(e => e.IsActive)
            .OrderBy(e => e.EscalationOrder)
            .ThenBy(e => e.User.DisplayName)
            .Select(e => new EscalationUserDto
            {
                Id = e.Id,
                UserId = e.UserId,
                DomainUser = e.User.DomainUser ?? "",
                DisplayName = e.User.DisplayName ?? "",
                Email = e.User.Email,
                Order = e.EscalationOrder,
                ColorCode = e.ColorCode,
                PhoneNumber = e.PhoneNumber
            })
            .ToListAsync();

        // Si no hay datos en la nueva tabla, usar la forma antigua (compatibilidad)
        if (!escalations.Any())
        {
            escalations = await _context.Users
                .Where(u => u.IsOnCallEscalation && u.IsActive)
                .OrderBy(u => u.EscalationOrder ?? 999)
                .ThenBy(u => u.DisplayName)
                .Select(u => new EscalationUserDto
                {
                    Id = 0,
                    UserId = u.Id,
                    DomainUser = u.DomainUser ?? "",
                    DisplayName = u.DisplayName ?? "",
                    Email = u.Email,
                    Order = u.EscalationOrder ?? 999,
                    ColorCode = null,
                    PhoneNumber = null
                })
                .ToListAsync();
        }

        return escalations;
    }

    public async Task<EscalationUserDto> AddEscalationUserAsync(string userId, string requestingUserId, string? colorCode = null, string? phoneNumber = null)
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

        // Verificar si ya existe en la nueva tabla
        var existsInNew = await _context.OnCallEscalations.AnyAsync(e => e.UserId == userId);
        if (existsInNew)
        {
            throw new InvalidOperationException("El usuario ya es guardia de escalamiento");
        }

        // Asignar el siguiente orden disponible
        var maxOrder = await _context.OnCallEscalations.MaxAsync(e => (int?)e.EscalationOrder) ?? 0;

        // Asignar color automático si no se proporciona
        var finalColor = colorCode;
        if (string.IsNullOrEmpty(finalColor))
        {
            var count = await _context.OnCallEscalations.CountAsync();
            finalColor = DefaultColors[count % DefaultColors.Length];
        }

        var escalation = new OnCallEscalation
        {
            UserId = userId,
            EscalationOrder = maxOrder + 1,
            IsActive = true,
            ColorCode = finalColor,
            PhoneNumber = phoneNumber,
            CreatedAt = DateTime.Now
        };

        _context.OnCallEscalations.Add(escalation);
        
        // Mantener sincronizado con la tabla Users (compatibilidad)
        user.IsOnCallEscalation = true;
        user.EscalationOrder = maxOrder + 1;
        
        await _context.SaveChangesAsync();

        _logger.LogInformation("Usuario {UserId} agregado como escalamiento (orden {Order}) por {RequestingUserId}", userId, escalation.EscalationOrder, requestingUserId);

        return new EscalationUserDto
        {
            Id = escalation.Id,
            UserId = escalation.UserId,
            DomainUser = user.DomainUser ?? "",
            DisplayName = user.DisplayName ?? "",
            Email = user.Email,
            Order = escalation.EscalationOrder,
            ColorCode = escalation.ColorCode,
            PhoneNumber = escalation.PhoneNumber
        };
    }

    public async Task UpdateEscalationUserAsync(int escalationId, UpdateEscalationUserRequest request, string requestingUserId)
    {
        if (!await CanManageEscalationAsync(requestingUserId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento o SuperAdmin pueden gestionar usuarios de escalamiento");
        }

        var escalation = await _context.OnCallEscalations.FindAsync(escalationId);
        if (escalation == null)
        {
            throw new ArgumentException("Usuario de escalamiento no encontrado");
        }

        if (request.ColorCode != null)
        {
            escalation.ColorCode = request.ColorCode;
        }
        
        if (request.PhoneNumber != null)
        {
            escalation.PhoneNumber = request.PhoneNumber;
        }

        escalation.UpdatedAt = DateTime.Now;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Usuario de escalamiento {EscalationId} actualizado por {RequestingUserId}", escalationId, requestingUserId);
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
            // Actualizar en la nueva tabla
            var escalation = await _context.OnCallEscalations.FirstOrDefaultAsync(e => e.UserId == userIds[i]);
            if (escalation != null)
            {
                escalation.EscalationOrder = i + 1;
                escalation.UpdatedAt = DateTime.Now;
            }

            // Mantener sincronizado con Users (compatibilidad)
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
        var escalationCount = await _context.OnCallEscalations.CountAsync(e => e.IsActive);
        if (escalationCount <= 1 && userId == requestingUserId)
        {
            throw new InvalidOperationException("No puedes quitarte como escalamiento si eres el único");
        }

        // Eliminar de la nueva tabla
        var escalation = await _context.OnCallEscalations.FirstOrDefaultAsync(e => e.UserId == userId);
        if (escalation != null)
        {
            _context.OnCallEscalations.Remove(escalation);
        }

        // Mantener sincronizado con Users (compatibilidad)
        var user = await _context.Users.FindAsync(userId);
        if (user != null)
        {
            user.IsOnCallEscalation = false;
        }

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

    /// <summary>
    /// Convierte bytes de imagen a URL data:image/...;base64,...
    /// </summary>
    private static string? GetProfilePhotoUrl(byte[]? photoBytes)
    {
        if (photoBytes == null || photoBytes.Length == 0)
            return null;
        
        var mimeType = DetectImageMimeType(photoBytes);
        return $"data:{mimeType};base64,{Convert.ToBase64String(photoBytes)}";
    }

    /// <summary>
    /// Detecta el tipo MIME de una imagen basándose en sus bytes mágicos
    /// </summary>
    private static string DetectImageMimeType(byte[] imageBytes)
    {
        if (imageBytes.Length < 4)
            return "image/jpeg";

        // PNG: 89 50 4E 47
        if (imageBytes[0] == 0x89 && imageBytes[1] == 0x50 && imageBytes[2] == 0x4E && imageBytes[3] == 0x47)
            return "image/png";

        // JPEG: FF D8 FF
        if (imageBytes[0] == 0xFF && imageBytes[1] == 0xD8 && imageBytes[2] == 0xFF)
            return "image/jpeg";

        // GIF: 47 49 46 38
        if (imageBytes[0] == 0x47 && imageBytes[1] == 0x49 && imageBytes[2] == 0x46 && imageBytes[3] == 0x38)
            return "image/gif";

        // WebP: 52 49 46 46 ... 57 45 42 50
        if (imageBytes.Length >= 12 && 
            imageBytes[0] == 0x52 && imageBytes[1] == 0x49 && imageBytes[2] == 0x46 && imageBytes[3] == 0x46 &&
            imageBytes[8] == 0x57 && imageBytes[9] == 0x45 && imageBytes[10] == 0x42 && imageBytes[11] == 0x50)
            return "image/webp";

        // Default to JPEG
        return "image/jpeg";
    }

    // ==================== CONFIGURATION ====================

    public async Task<OnCallConfigDto> GetConfigAsync()
    {
        var config = await _context.OnCallConfig
            .Include(c => c.Approver)
            .Include(c => c.ApproverGroup)
            .Include(c => c.UpdatedByUser)
            .FirstOrDefaultAsync();

        if (config == null)
        {
            // Crear configuración por defecto si no existe
            config = new OnCallConfig
            {
                RequiresApproval = false,
                MinDaysForSwapRequest = 7,
                MinDaysForEscalationModify = 0,
                UpdatedAt = DateTime.Now
            };
            _context.OnCallConfig.Add(config);
            await _context.SaveChangesAsync();
        }

        return new OnCallConfigDto
        {
            RequiresApproval = config.RequiresApproval,
            ApproverId = config.ApproverId,
            ApproverDisplayName = config.Approver?.DisplayName,
            ApproverGroupId = config.ApproverGroupId,
            ApproverGroupName = config.ApproverGroup?.Name,
            MinDaysForSwapRequest = config.MinDaysForSwapRequest,
            MinDaysForEscalationModify = config.MinDaysForEscalationModify,
            UpdatedAt = config.UpdatedAt,
            UpdatedByDisplayName = config.UpdatedByUser?.DisplayName
        };
    }

    public async Task UpdateConfigAsync(UpdateOnCallConfigRequest request, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento pueden modificar la configuración");
        }

        var config = await _context.OnCallConfig.FirstOrDefaultAsync();
        
        if (config == null)
        {
            config = new OnCallConfig();
            _context.OnCallConfig.Add(config);
        }

        config.RequiresApproval = request.RequiresApproval;
        config.ApproverId = request.ApproverId;
        config.ApproverGroupId = request.ApproverGroupId;
        config.MinDaysForSwapRequest = request.MinDaysForSwapRequest;
        config.MinDaysForEscalationModify = request.MinDaysForEscalationModify;
        config.UpdatedAt = DateTime.Now;
        config.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();
        _logger.LogInformation("Configuración de guardias actualizada por {UserId}", userId);
    }

    // ==================== HOLIDAYS ====================

    public async Task<List<OnCallHolidayDto>> GetHolidaysAsync()
    {
        var holidays = await _context.OnCallHolidays
            .Include(h => h.CreatedByUser)
            .OrderBy(h => h.Date)
            .ToListAsync();

        return holidays.Select(h => new OnCallHolidayDto
        {
            Id = h.Id,
            Date = h.Date,
            Name = h.Name,
            IsRecurring = h.IsRecurring,
            CreatedAt = h.CreatedAt,
            CreatedByDisplayName = h.CreatedByUser?.DisplayName
        }).ToList();
    }

    public async Task<OnCallHolidayDto> CreateHolidayAsync(CreateHolidayRequest request, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento pueden gestionar feriados");
        }

        var holiday = new OnCallHoliday
        {
            Date = request.Date.Date,
            Name = request.Name,
            IsRecurring = request.IsRecurring,
            CreatedAt = DateTime.Now,
            CreatedByUserId = userId
        };

        _context.OnCallHolidays.Add(holiday);
        await _context.SaveChangesAsync();

        var user = await _context.Users.FindAsync(userId);

        _logger.LogInformation("Feriado {Name} creado por {UserId}", request.Name, userId);

        return new OnCallHolidayDto
        {
            Id = holiday.Id,
            Date = holiday.Date,
            Name = holiday.Name,
            IsRecurring = holiday.IsRecurring,
            CreatedAt = holiday.CreatedAt,
            CreatedByDisplayName = user?.DisplayName
        };
    }

    public async Task UpdateHolidayAsync(int id, UpdateHolidayRequest request, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento pueden gestionar feriados");
        }

        var holiday = await _context.OnCallHolidays.FindAsync(id);
        if (holiday == null)
        {
            throw new ArgumentException("Feriado no encontrado");
        }

        holiday.Date = request.Date.Date;
        holiday.Name = request.Name;
        holiday.IsRecurring = request.IsRecurring;

        await _context.SaveChangesAsync();
        _logger.LogInformation("Feriado {Id} actualizado por {UserId}", id, userId);
    }

    public async Task DeleteHolidayAsync(int id, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo los usuarios de escalamiento pueden gestionar feriados");
        }

        var holiday = await _context.OnCallHolidays.FindAsync(id);
        if (holiday == null)
        {
            throw new ArgumentException("Feriado no encontrado");
        }

        _context.OnCallHolidays.Remove(holiday);
        await _context.SaveChangesAsync();
        _logger.LogInformation("Feriado {Id} eliminado por {UserId}", id, userId);
    }

    // ==================== DAY OVERRIDES ====================

    public async Task<List<OnCallDayOverrideDto>> GetDayOverridesAsync(DateTime startDate, DateTime endDate)
    {
        var overrides = await _context.OnCallDayOverrides
            .Include(o => o.OriginalUser)
            .Include(o => o.CoverUser)
            .Include(o => o.CreatedByUser)
            .Where(o => o.IsActive && o.Date >= startDate && o.Date <= endDate)
            .OrderBy(o => o.Date)
            .ToListAsync();

        // Obtener colores y teléfonos de los operadores
        var operatorIds = overrides.Select(o => o.CoverUserId).Distinct().ToList();
        var operators = await _context.OnCallOperators
            .Where(op => operatorIds.Contains(op.UserId))
            .ToListAsync();

        return overrides.Select(o => {
            var op = operators.FirstOrDefault(x => x.UserId == o.CoverUserId);
            return new OnCallDayOverrideDto
            {
                Id = o.Id,
                Date = o.Date,
                OriginalUserId = o.OriginalUserId,
                OriginalDisplayName = o.OriginalUser?.DisplayName ?? "Desconocido",
                CoverUserId = o.CoverUserId,
                CoverDisplayName = o.CoverUser?.DisplayName ?? "Desconocido",
                CoverPhoneNumber = op?.PhoneNumber,
                CoverColorCode = op?.ColorCode,
                Reason = o.Reason,
                CreatedAt = o.CreatedAt,
                CreatedByDisplayName = o.CreatedByUser?.DisplayName ?? "Sistema",
                IsActive = o.IsActive
            };
        }).ToList();
    }

    public async Task<OnCallDayOverrideDto> CreateDayOverrideAsync(CreateDayOverrideRequest request, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo Team Escalamiento puede crear coberturas de días");
        }

        // Verificar que el operador de cobertura existe
        var coverOperator = await _context.OnCallOperators
            .FirstOrDefaultAsync(op => op.UserId == request.CoverUserId && op.IsActive);
        
        if (coverOperator == null)
        {
            throw new ArgumentException("El operador de cobertura no es válido");
        }

        // Buscar quién tiene la guardia ese día originalmente
        var dateOnly = request.Date.Date;
        var originalSchedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .FirstOrDefaultAsync(s => s.WeekStartDate <= dateOnly && s.WeekEndDate > dateOnly);

        string originalUserId;
        if (originalSchedule != null)
        {
            originalUserId = originalSchedule.UserId;
        }
        else
        {
            throw new ArgumentException("No hay guardia programada para esa fecha");
        }

        // Verificar si ya existe una cobertura activa para ese día
        var existingOverride = await _context.OnCallDayOverrides
            .FirstOrDefaultAsync(o => o.Date.Date == dateOnly && o.IsActive);

        if (existingOverride != null)
        {
            // Desactivar la cobertura existente
            existingOverride.IsActive = false;
        }

        // Crear la nueva cobertura
        var dayOverride = new OnCallDayOverride
        {
            Date = dateOnly,
            OriginalUserId = originalUserId,
            CoverUserId = request.CoverUserId,
            Reason = request.Reason,
            OriginalScheduleId = originalSchedule?.Id,
            CreatedByUserId = userId,
            CreatedAt = DateTime.UtcNow,
            IsActive = true
        };

        _context.OnCallDayOverrides.Add(dayOverride);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Cobertura de día creada: {Date} - {OriginalUser} cubierto por {CoverUser}, creado por {UserId}",
            dateOnly.ToShortDateString(), originalUserId, request.CoverUserId, userId);

        // Retornar el DTO
        var coverUser = await _context.Users.FindAsync(request.CoverUserId);
        var originalUser = await _context.Users.FindAsync(originalUserId);
        var createdByUser = await _context.Users.FindAsync(userId);

        return new OnCallDayOverrideDto
        {
            Id = dayOverride.Id,
            Date = dayOverride.Date,
            OriginalUserId = originalUserId,
            OriginalDisplayName = originalUser?.DisplayName ?? "Desconocido",
            CoverUserId = request.CoverUserId,
            CoverDisplayName = coverUser?.DisplayName ?? "Desconocido",
            CoverPhoneNumber = coverOperator.PhoneNumber,
            CoverColorCode = coverOperator.ColorCode,
            Reason = dayOverride.Reason,
            CreatedAt = dayOverride.CreatedAt,
            CreatedByDisplayName = createdByUser?.DisplayName ?? "Sistema",
            IsActive = true
        };
    }

    public async Task DeleteDayOverrideAsync(int id, string userId)
    {
        if (!await CanManageEscalationAsync(userId))
        {
            throw new UnauthorizedAccessException("Solo Team Escalamiento puede eliminar coberturas de días");
        }

        var dayOverride = await _context.OnCallDayOverrides.FindAsync(id);
        if (dayOverride == null)
        {
            throw new ArgumentException("Cobertura no encontrada");
        }

        dayOverride.IsActive = false;
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Cobertura de día {Id} desactivada por {UserId}", id, userId);
    }

    public async Task<string?> GetOnCallUserIdForDateAsync(DateTime date)
    {
        var dateOnly = date.Date;

        // Primero verificar si hay una cobertura activa para ese día
        var dayOverride = await _context.OnCallDayOverrides
            .FirstOrDefaultAsync(o => o.Date.Date == dateOnly && o.IsActive);

        if (dayOverride != null)
        {
            return dayOverride.CoverUserId;
        }

        // Si no hay cobertura, buscar la guardia normal
        var schedule = await _context.OnCallSchedules
            .FirstOrDefaultAsync(s => s.WeekStartDate <= dateOnly && s.WeekEndDate > dateOnly);

        return schedule?.UserId;
    }

    // ==================== EMAIL TEMPLATES ====================

    public async Task<List<OnCallEmailTemplateDto>> GetEmailTemplatesAsync()
    {
        var templates = await _context.OnCallEmailTemplates
            .Include(t => t.CreatedByUser)
            .Include(t => t.UpdatedByUser)
            .OrderBy(t => t.AlertType)
            .ThenByDescending(t => t.IsDefault)
            .ThenBy(t => t.Name)
            .ToListAsync();

        return templates.Select(t => new OnCallEmailTemplateDto
        {
            Id = t.Id,
            AlertType = t.AlertType,
            Name = t.Name,
            Subject = t.Subject,
            Body = t.Body,
            AttachExcel = t.AttachExcel,
            IsEnabled = t.IsEnabled,
            IsDefault = t.IsDefault,
            IsScheduled = t.IsScheduled,
            ScheduleCron = t.ScheduleCron,
            ScheduleDescription = t.ScheduleDescription,
            Recipients = t.Recipients,
            CreatedAt = t.CreatedAt,
            CreatedByDisplayName = t.CreatedByUser?.DisplayName,
            UpdatedAt = t.UpdatedAt,
            UpdatedByDisplayName = t.UpdatedByUser?.DisplayName
        }).ToList();
    }

    public async Task<OnCallEmailTemplateDto?> GetEmailTemplateAsync(int id)
    {
        var template = await _context.OnCallEmailTemplates
            .Include(t => t.CreatedByUser)
            .Include(t => t.UpdatedByUser)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template == null) return null;

        return new OnCallEmailTemplateDto
        {
            Id = template.Id,
            AlertType = template.AlertType,
            Name = template.Name,
            Subject = template.Subject,
            Body = template.Body,
            AttachExcel = template.AttachExcel,
            IsEnabled = template.IsEnabled,
            IsDefault = template.IsDefault,
            IsScheduled = template.IsScheduled,
            ScheduleCron = template.ScheduleCron,
            ScheduleDescription = template.ScheduleDescription,
            Recipients = template.Recipients,
            CreatedAt = template.CreatedAt,
            CreatedByDisplayName = template.CreatedByUser?.DisplayName,
            UpdatedAt = template.UpdatedAt,
            UpdatedByDisplayName = template.UpdatedByUser?.DisplayName
        };
    }

    public async Task<OnCallEmailTemplateDto> CreateEmailTemplateAsync(CreateEmailTemplateRequest request, string userId)
    {
        var template = new Models.OnCallEmailTemplate
        {
            AlertType = request.AlertType,
            Name = request.Name,
            Subject = request.Subject,
            Body = request.Body,
            AttachExcel = request.AttachExcel,
            IsEnabled = request.IsEnabled,
            IsDefault = false,
            IsScheduled = request.IsScheduled,
            ScheduleCron = request.ScheduleCron,
            ScheduleDescription = request.ScheduleDescription,
            Recipients = request.Recipients,
            CreatedByUserId = userId,
            CreatedAt = Helpers.LocalClockAR.Now
        };

        _context.OnCallEmailTemplates.Add(template);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Template de email {Id} creado por {UserId}", template.Id, userId);

        return (await GetEmailTemplateAsync(template.Id))!;
    }

    public async Task<OnCallEmailTemplateDto> UpdateEmailTemplateAsync(int id, UpdateEmailTemplateRequest request, string userId)
    {
        var template = await _context.OnCallEmailTemplates.FindAsync(id);
        if (template == null)
            throw new ArgumentException("Template no encontrado");

        template.Name = request.Name;
        template.Subject = request.Subject;
        template.Body = request.Body;
        template.AttachExcel = request.AttachExcel;
        template.IsEnabled = request.IsEnabled;
        template.IsScheduled = request.IsScheduled;
        template.ScheduleCron = request.ScheduleCron;
        template.ScheduleDescription = request.ScheduleDescription;
        template.Recipients = request.Recipients;
        template.UpdatedByUserId = userId;
        template.UpdatedAt = Helpers.LocalClockAR.Now;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Template de email {Id} actualizado por {UserId}", id, userId);

        return (await GetEmailTemplateAsync(id))!;
    }

    public async Task DeleteEmailTemplateAsync(int id)
    {
        var template = await _context.OnCallEmailTemplates.FindAsync(id);
        if (template == null)
            throw new ArgumentException("Template no encontrado");

        if (template.IsDefault)
            throw new InvalidOperationException("No se puede eliminar un template por defecto del sistema");

        _context.OnCallEmailTemplates.Remove(template);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Template de email {Id} eliminado", id);
    }

    // ==================== SCHEDULE BATCHES ====================

    public async Task<List<OnCallScheduleBatchDto>> GetScheduleBatchesAsync()
    {
        var batches = await _context.OnCallScheduleBatches
            .Include(b => b.GeneratedByUser)
            .Include(b => b.ApproverUser)
            .Include(b => b.ApprovedByUser)
            .OrderByDescending(b => b.GeneratedAt)
            .ToListAsync();

        return batches.Select(b => new OnCallScheduleBatchDto
        {
            Id = b.Id,
            StartDate = b.StartDate,
            EndDate = b.EndDate,
            WeeksGenerated = b.WeeksGenerated,
            Status = b.Status,
            GeneratedByDisplayName = b.GeneratedByUser?.DisplayName ?? b.GeneratedByUser?.DomainUser ?? "",
            GeneratedAt = b.GeneratedAt,
            ApproverDisplayName = b.ApproverUser?.DisplayName,
            ApprovedAt = b.ApprovedAt,
            ApprovedByDisplayName = b.ApprovedByUser?.DisplayName,
            RejectionReason = b.RejectionReason
        }).ToList();
    }

    public async Task<List<OnCallScheduleBatchDto>> GetPendingBatchesAsync()
    {
        var batches = await _context.OnCallScheduleBatches
            .Include(b => b.GeneratedByUser)
            .Include(b => b.ApproverUser)
            .Where(b => b.Status == ScheduleBatchStatus.PendingApproval)
            .OrderByDescending(b => b.GeneratedAt)
            .ToListAsync();

        return batches.Select(b => new OnCallScheduleBatchDto
        {
            Id = b.Id,
            StartDate = b.StartDate,
            EndDate = b.EndDate,
            WeeksGenerated = b.WeeksGenerated,
            Status = b.Status,
            GeneratedByDisplayName = b.GeneratedByUser?.DisplayName ?? b.GeneratedByUser?.DomainUser ?? "",
            GeneratedAt = b.GeneratedAt,
            ApproverDisplayName = b.ApproverUser?.DisplayName
        }).ToList();
    }

    public async Task ApproveScheduleBatchAsync(int batchId, string userId)
    {
        var batch = await _context.OnCallScheduleBatches
            .Include(b => b.GeneratedByUser)
            .FirstOrDefaultAsync(b => b.Id == batchId);

        if (batch == null)
            throw new ArgumentException("Lote de calendario no encontrado");

        if (batch.Status != ScheduleBatchStatus.PendingApproval)
            throw new InvalidOperationException("El lote no está pendiente de aprobación");

        // Verificar que el usuario sea el aprobador asignado o tenga permisos de escalamiento
        var isEscalation = await IsEscalationUserAsync(userId);
        if (!isEscalation && batch.ApproverUserId != userId)
        {
            throw new UnauthorizedAccessException("No tienes permiso para aprobar este calendario");
        }

        // Deserializar el plan de generación
        if (string.IsNullOrEmpty(batch.SchedulePlan))
        {
            throw new InvalidOperationException("El lote no tiene un plan de generación válido");
        }

        var plan = JsonSerializer.Deserialize<SchedulePlanData>(batch.SchedulePlan);
        if (plan == null || plan.OperatorUserIds.Count == 0)
        {
            throw new InvalidOperationException("El plan de generación está vacío o es inválido");
        }

        // Eliminar guardias futuras existentes desde la fecha de inicio del batch
        var existingSchedules = await _context.OnCallSchedules
            .Where(s => s.WeekStartDate >= batch.StartDate)
            .ToListAsync();
        
        _context.OnCallSchedules.RemoveRange(existingSchedules);

        // Crear las guardias a partir del plan
        await CreateSchedulesFromPlanAsync(batch, plan);

        // Actualizar estado del batch
        batch.Status = ScheduleBatchStatus.Approved;
        batch.ApprovedAt = LocalClockAR.Now;
        batch.ApprovedByUserId = userId;

        await _context.SaveChangesAsync();

        // Disparar alertas configuradas por los usuarios
        await _alertService.TriggerScheduleGeneratedAlertsAsync(batch.StartDate, batch.EndDate, batch.WeeksGenerated);

        _logger.LogInformation("Lote de calendario {BatchId} aprobado por {UserId} - {WeeksGenerated} semanas creadas", 
            batchId, userId, batch.WeeksGenerated);
    }

    public async Task RejectScheduleBatchAsync(int batchId, string userId, string reason)
    {
        var batch = await _context.OnCallScheduleBatches
            .FirstOrDefaultAsync(b => b.Id == batchId);

        if (batch == null)
            throw new ArgumentException("Lote de calendario no encontrado");

        if (batch.Status != ScheduleBatchStatus.PendingApproval)
            throw new InvalidOperationException("El lote no está pendiente de aprobación");

        // Verificar que el usuario sea el aprobador asignado o tenga permisos de escalamiento
        var isEscalation = await IsEscalationUserAsync(userId);
        if (!isEscalation && batch.ApproverUserId != userId)
        {
            throw new UnauthorizedAccessException("No tienes permiso para rechazar este calendario");
        }

        batch.Status = ScheduleBatchStatus.Rejected;
        batch.ApprovedAt = LocalClockAR.Now;
        batch.ApprovedByUserId = userId;
        batch.RejectionReason = reason;

        // Las guardias no existen porque se crean al aprobar, así que solo actualizamos el estado
        await _context.SaveChangesAsync();

        _logger.LogInformation("Lote de calendario {BatchId} rechazado por {UserId}: {Reason}", batchId, userId, reason);
    }
}

