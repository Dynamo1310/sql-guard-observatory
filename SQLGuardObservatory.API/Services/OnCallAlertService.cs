using System.Globalization;
using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public class OnCallAlertService : IOnCallAlertService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<OnCallAlertService> _logger;
    private readonly string _appUrl;
    private static readonly CultureInfo SpanishCulture = new CultureInfo("es-ES");

    public OnCallAlertService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        IConfiguration configuration,
        ILogger<OnCallAlertService> logger)
    {
        _context = context;
        _smtpService = smtpService;
        _logger = logger;
        _appUrl = configuration["AppUrl"] ?? "http://asprbm-nov-01:5173";
    }

    /// <summary>
    /// Formatea una fecha en español con el formato especificado.
    /// </summary>
    private static string FormatDateSpanish(DateTime date, bool includeTime = false)
    {
        var format = includeTime 
            ? "dddd dd 'de' MMMM 'de' yyyy HH:mm" 
            : "dddd dd 'de' MMMM 'de' yyyy";
        var result = date.ToString(format, SpanishCulture);
        // Capitalizar primera letra
        return char.ToUpper(result[0]) + result.Substring(1);
    }

    /// <summary>
    /// Convierte texto plano a HTML, preservando saltos de línea y detectando URLs.
    /// </summary>
    private static string ConvertPlainTextToHtml(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            return string.Empty;

        // Escapar caracteres HTML especiales
        var html = System.Web.HttpUtility.HtmlEncode(plainText);

        // Convertir URLs a enlaces
        html = System.Text.RegularExpressions.Regex.Replace(
            html,
            @"(https?://[^\s]+)",
            "<a href=\"$1\" style=\"color: #2563eb;\">$1</a>");

        // Convertir saltos de línea dobles en párrafos
        var paragraphs = html.Split(new[] { "\r\n\r\n", "\n\n" }, StringSplitOptions.None);
        html = string.Join("", paragraphs.Select(p => 
            $"<p style=\"margin-bottom: 12px;\">{p.Replace("\r\n", "<br>").Replace("\n", "<br>")}</p>"));

        return html;
    }

    /// <summary>
    /// Obtiene el template de email configurado para un tipo de alerta, si existe.
    /// </summary>
    private async Task<Models.OnCallEmailTemplate?> GetTemplateForAlertTypeAsync(string alertType)
    {
        return await _context.OnCallEmailTemplates
            .Where(t => t.AlertType == alertType && t.IsEnabled)
            .OrderByDescending(t => t.UpdatedAt ?? t.CreatedAt)
            .FirstOrDefaultAsync();
    }

    /// <summary>
    /// Reemplaza los placeholders en un template con los valores proporcionados.
    /// </summary>
    private static string ReplacePlaceholders(string template, Dictionary<string, string> values)
    {
        if (string.IsNullOrEmpty(template))
            return template;

        foreach (var kvp in values)
        {
            template = template.Replace($"{{{{{kvp.Key}}}}}", kvp.Value);
        }
        return template;
    }

    /// <summary>
    /// Envuelve el contenido en una estructura HTML básica con estilos.
    /// </summary>
    private string WrapInHtmlTemplate(string content)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }}
        .content {{ background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background: #f1f5f9; padding: 15px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px; }}
        a {{ color: #2563eb; }}
    </style>
</head>
<body>
    <div class=""container"">
        <div class=""header"">
            <h2 style=""margin: 0;"">🛡️ SQLNova - Guardias DBA</h2>
        </div>
        <div class=""content"">
            {content}
        </div>
        <div class=""footer"">
            <p>Este es un mensaje automático del sistema SQLNova</p>
            <p><a href=""{_appUrl}/oncall"">Acceder al Portal de Guardias</a></p>
        </div>
    </div>
</body>
</html>";
    }

    /// <summary>
    /// Obtiene los placeholders comunes disponibles en todos los emails.
    /// </summary>
    private async Task<Dictionary<string, string>> GetCommonPlaceholdersAsync()
    {
        var placeholders = new Dictionary<string, string>();
        var now = Helpers.LocalClockAR.Now;

        // Fechas actuales
        placeholders["FechaHoraActual"] = FormatDateSpanish(now, includeTime: true);
        placeholders["FechaActual"] = FormatDateSpanish(now);

        // Links de la aplicación
        placeholders["LinkApp"] = _appUrl;
        placeholders["LinkPlanificador"] = $"{_appUrl}/oncall/schedule";
        placeholders["LinkIntercambios"] = $"{_appUrl}/oncall/swaps";
        placeholders["LinkActivaciones"] = $"{_appUrl}/oncall/activations";

        // Operador actualmente de guardia
        var currentSchedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate <= now && s.WeekEndDate > now)
            .FirstOrDefaultAsync();

        if (currentSchedule?.User != null)
        {
            placeholders["OperadorActual"] = currentSchedule.User.DisplayName ?? currentSchedule.User.UserName ?? "N/A";
            placeholders["OperadorActualEmail"] = currentSchedule.User.Email ?? "N/A";
            
            // Buscar teléfono en OnCallOperators
            var operatorRecord = await _context.OnCallOperators
                .Where(o => o.UserId == currentSchedule.UserId)
                .FirstOrDefaultAsync();
            placeholders["OperadorActualTelefono"] = operatorRecord?.PhoneNumber ?? currentSchedule.User.PhoneNumber ?? "N/A";
        }
        else
        {
            placeholders["OperadorActual"] = "Sin operador asignado";
            placeholders["OperadorActualEmail"] = "N/A";
            placeholders["OperadorActualTelefono"] = "N/A";
        }

        // Team Escalamiento
        var escalationUsers = await _context.Users
            .Where(u => u.IsOnCallEscalation)
            .OrderBy(u => u.EscalationOrder)
            .ToListAsync();

        if (escalationUsers.Any())
        {
            var escalationList = escalationUsers.Select(u => 
                $"• {u.DisplayName ?? u.UserName} - {u.Email ?? "N/A"} - {u.PhoneNumber ?? "N/A"}");
            placeholders["TeamEscalamiento"] = string.Join("\n", escalationList);
            placeholders["TeamEscalamientoNombres"] = string.Join(", ", escalationUsers.Select(u => u.DisplayName ?? u.UserName));
        }
        else
        {
            placeholders["TeamEscalamiento"] = "No hay equipo de escalamiento configurado";
            placeholders["TeamEscalamientoNombres"] = "N/A";
        }

        // Team Operadores
        var operators = await _context.OnCallOperators
            .Include(o => o.User)
            .Where(o => o.IsActive)
            .OrderBy(o => o.RotationOrder)
            .ToListAsync();

        if (operators.Any())
        {
            var operatorList = operators.Select(o => 
                $"• {o.User?.DisplayName ?? o.User?.UserName ?? "N/A"} - {o.User?.Email ?? "N/A"} - {o.PhoneNumber ?? o.User?.PhoneNumber ?? "N/A"}");
            placeholders["TeamOperadores"] = string.Join("\n", operatorList);
            placeholders["TeamOperadoresNombres"] = string.Join(", ", operators.Select(o => o.User?.DisplayName ?? o.User?.UserName ?? "N/A"));
        }
        else
        {
            placeholders["TeamOperadores"] = "No hay operadores configurados";
            placeholders["TeamOperadoresNombres"] = "N/A";
        }

        return placeholders;
    }

    /// <summary>
    /// Obtiene información de un operador por su ID.
    /// </summary>
    private async Task<(string Name, string Email, string Phone)> GetOperatorInfoAsync(string? userId)
    {
        if (string.IsNullOrEmpty(userId))
            return ("N/A", "N/A", "N/A");

        var user = await _context.Users.FindAsync(userId);
        if (user == null)
            return ("N/A", "N/A", "N/A");

        var operatorRecord = await _context.OnCallOperators
            .Where(o => o.UserId == userId)
            .FirstOrDefaultAsync();

        return (
            user.DisplayName ?? user.UserName ?? "N/A",
            user.Email ?? "N/A",
            operatorRecord?.PhoneNumber ?? user.PhoneNumber ?? "N/A"
        );
    }

    /// <summary>
    /// Obtiene un resumen de las primeras semanas del calendario.
    /// </summary>
    private async Task<string> GetCalendarSummaryAsync(DateTime startDate, int maxWeeks = 5)
    {
        var schedules = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate >= startDate)
            .OrderBy(s => s.WeekStartDate)
            .Take(maxWeeks)
            .ToListAsync();

        if (!schedules.Any())
            return "No hay guardias programadas";

        var lines = schedules.Select(s => 
            $"• {s.WeekStartDate:dd/MM} - {s.WeekEndDate:dd/MM}: {s.User?.DisplayName ?? s.User?.UserName ?? "N/A"}");
        
        return string.Join("\n", lines);
    }

    public async Task TriggerScheduleGeneratedAlertsAsync(DateTime startDate, DateTime endDate, int weeksGenerated)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.ScheduleGenerated);
        
        if (!rules.Any())
        {
            _logger.LogWarning("No hay reglas activas para ScheduleGenerated - El email de calendario generado no se enviará");
            return;
        }

        _logger.LogInformation("Enviando notificación de calendario generado a {Count} regla(s)", rules.Count());

        // ScheduleGenerated SIEMPRE usa el formato por defecto (no es editable desde templates)
        var subject = $"[SQLNova] Calendario de Guardias DBA Generado - {FormatDateSpanish(startDate)} a {FormatDateSpanish(endDate)}";
        var body = GenerateScheduleGeneratedEmail(startDate, endDate, weeksGenerated);

        // Verificar si alguna regla requiere adjuntar Excel
        var needsExcel = rules.Any(r => r.AttachExcel);
        byte[]? excelData = null;
        string? excelFileName = null;

        if (needsExcel)
        {
            try
            {
                excelData = await GenerateCalendarExcelAsync(startDate, endDate);
                excelFileName = $"Calendario_Guardias_{startDate:yyyyMMdd}_{endDate:yyyyMMdd}.xlsx";
                _logger.LogInformation("Excel del calendario generado: {FileName} ({Size} bytes)", excelFileName, excelData.Length);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al generar Excel del calendario - El email se enviará sin adjunto");
            }
        }

        // Enviar a cada regla con o sin adjunto según su configuración
        await SendScheduleGeneratedToRecipientsAsync(rules, subject, body, excelData, excelFileName);
        
        _logger.LogInformation("Notificación de calendario generado enviada exitosamente");
    }

    /// <summary>
    /// Genera un archivo Excel con el calendario de guardias (formato visual idéntico al exportador del frontend)
    /// </summary>
    private async Task<byte[]> GenerateCalendarExcelAsync(DateTime startDate, DateTime endDate)
    {
        // Cargar datos
        var schedules = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate >= startDate && s.WeekEndDate <= endDate.AddMonths(12))
            .OrderBy(s => s.WeekStartDate)
            .ToListAsync();

        var operators = await _context.OnCallOperators
            .Include(o => o.User)
            .Where(o => o.IsActive)
            .OrderBy(o => o.RotationOrder)
            .ToListAsync();

        var escalations = await _context.OnCallEscalations
            .Include(e => e.User)
            .Where(e => e.IsActive)
            .OrderBy(e => e.EscalationOrder)
            .ToListAsync();

        using var workbook = new XLWorkbook();
        
        // Nombres de meses y días en español
        var monthNames = new[] { "", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", 
                                  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE" };
        var dayNames = new[] { "Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa" };

        // Función helper para obtener el operador de una fecha específica
        (string? userId, string colorCode, string displayName)? GetOperatorForDate(DateTime date)
        {
            var checkDate = date.Date;
            
            foreach (var schedule in schedules)
            {
                var startDay = schedule.WeekStartDate.Date;
                var endDay = schedule.WeekEndDate.Date;
                
                // La fecha está dentro del rango si: startDay <= checkDate < endDay
                if (checkDate >= startDay && checkDate < endDay)
                {
                    var op = operators.FirstOrDefault(o => o.UserId == schedule.UserId);
                    return (
                        schedule.UserId,
                        op?.ColorCode ?? "#CCCCCC",
                        schedule.User?.DisplayName ?? schedule.User?.UserName ?? "N/A"
                    );
                }
            }
            return null;
        }

        // Función para obtener color de contraste
        XLColor GetContrastColor(string bgColor)
        {
            var hex = bgColor.Replace("#", "");
            if (hex.Length < 6) return XLColor.Black;
            
            var r = Convert.ToInt32(hex.Substring(0, 2), 16);
            var g = Convert.ToInt32(hex.Substring(2, 2), 16);
            var b = Convert.ToInt32(hex.Substring(4, 2), 16);
            var brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return brightness > 128 ? XLColor.Black : XLColor.White;
        }

        // Agrupar guardias por año
        var schedulesByYear = schedules
            .GroupBy(s => s.WeekStartDate.Year)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Crear una hoja por año
        foreach (var (year, yearSchedules) in schedulesByYear)
        {
            var worksheet = workbook.Worksheets.Add(year.ToString());
            
            // Configurar anchos de columna
            // Col A=número, B=nombre, C=teléfono, D=espacio, E-K=calendario1, etc.
            var colWidths = new double[] { 4, 20, 16, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3, 4, 4, 4, 4, 4, 4, 4, 3 };
            for (var i = 0; i < colWidths.Length; i++)
            {
                worksheet.Column(i + 1).Width = colWidths[i];
            }
            
            // Fila 1: Año (título grande naranja)
            var currentRow = 1;
            worksheet.Range(currentRow, 1, currentRow, 38).Merge();
            var yearCell = worksheet.Cell(currentRow, 1);
            yearCell.Value = year;
            yearCell.Style.Font.Bold = true;
            yearCell.Style.Font.FontSize = 18;
            yearCell.Style.Fill.BackgroundColor = XLColor.FromHtml("#FFA500");
            yearCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
            yearCell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            worksheet.Row(currentRow).Height = 25;
            currentRow += 2;
            
            // Team Guardia
            var teamGuardiaRow = currentRow;
            worksheet.Cell(currentRow, 2).Value = "Team Guardia";
            worksheet.Cell(currentRow, 2).Style.Font.Bold = true;
            worksheet.Cell(currentRow, 2).Style.Font.Italic = true;
            worksheet.Cell(currentRow, 2).Style.Font.FontColor = XLColor.FromHtml("#FF6600");
            currentRow++;
            
            // Lista de operadores con colores
            var opIndex = 1;
            foreach (var op in operators)
            {
                var colorCode = op.ColorCode ?? "#CCCCCC";
                
                // Número con color de fondo
                var numCell = worksheet.Cell(currentRow, 1);
                numCell.Value = opIndex;
                numCell.Style.Fill.BackgroundColor = XLColor.FromHtml(colorCode);
                numCell.Style.Font.FontColor = GetContrastColor(colorCode);
                numCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                numCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                // Nombre
                var nameCell = worksheet.Cell(currentRow, 2);
                nameCell.Value = op.User?.DisplayName ?? op.User?.UserName ?? "N/A";
                nameCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                // Teléfono
                var phoneCell = worksheet.Cell(currentRow, 3);
                phoneCell.Value = op.PhoneNumber ?? "";
                phoneCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                currentRow++;
                opIndex++;
            }
            
            currentRow++;
            
            // Team Escalamiento
            worksheet.Cell(currentRow, 2).Value = "Team Escalamiento";
            worksheet.Cell(currentRow, 2).Style.Font.Bold = true;
            worksheet.Cell(currentRow, 2).Style.Font.Italic = true;
            worksheet.Cell(currentRow, 2).Style.Font.FontColor = XLColor.FromHtml("#FF6600");
            currentRow++;
            
            // Lista de escalamientos
            foreach (var esc in escalations)
            {
                var colorCode = esc.ColorCode ?? "#FFFF99";
                
                var numCell = worksheet.Cell(currentRow, 1);
                numCell.Value = "";
                numCell.Style.Fill.BackgroundColor = XLColor.FromHtml(colorCode);
                numCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                var nameCell = worksheet.Cell(currentRow, 2);
                nameCell.Value = esc.User?.DisplayName ?? esc.User?.UserName ?? "N/A";
                nameCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                var phoneCell = worksheet.Cell(currentRow, 3);
                phoneCell.Value = esc.PhoneNumber ?? "";
                phoneCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                
                currentRow++;
            }
            
            // Determinar qué meses mostrar basado en las guardias del año
            var monthsWithData = new HashSet<int>();
            foreach (var s in yearSchedules)
            {
                if (s.WeekStartDate.Year == year) monthsWithData.Add(s.WeekStartDate.Month);
                if (s.WeekEndDate.Year == year) monthsWithData.Add(s.WeekEndDate.Month);
            }
            
            var monthsArray = monthsWithData.OrderBy(m => m).ToList();
            
            // Generar calendarios mensuales (4 por fila)
            const int calendarsPerRow = 4;
            const int calendarWidth = 8; // 7 días + 1 columna de espacio
            const int calendarHeight = 10; // título + días semana + 6 semanas max + espacio
            
            var calIdx = 0;
            foreach (var month in monthsArray)
            {
                // Columna 5 (E) es donde empieza el primer calendario (después del espacio en D)
                var colOffset = 5 + (calIdx % calendarsPerRow) * calendarWidth;
                var rowOffset = teamGuardiaRow + (calIdx / calendarsPerRow) * calendarHeight;
                
                // Nombre del mes
                worksheet.Range(rowOffset, colOffset, rowOffset, colOffset + 6).Merge();
                var monthTitleCell = worksheet.Cell(rowOffset, colOffset);
                monthTitleCell.Value = monthNames[month];
                monthTitleCell.Style.Font.Bold = true;
                monthTitleCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                
                // Días de la semana
                for (var d = 0; d < 7; d++)
                {
                    var dayCell = worksheet.Cell(rowOffset + 1, colOffset + d);
                    dayCell.Value = dayNames[d];
                    dayCell.Style.Font.Bold = true;
                    dayCell.Style.Font.FontSize = 9;
                    dayCell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                    dayCell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                }
                
                // Días del mes
                var firstDay = new DateTime(year, month, 1);
                var lastDay = new DateTime(year, month, DateTime.DaysInMonth(year, month));
                var startDayOfWeek = (int)firstDay.DayOfWeek; // 0 = domingo
                var daysInMonth = lastDay.Day;
                
                var dayNum = 1;
                for (var week = 0; week < 6 && dayNum <= daysInMonth; week++)
                {
                    for (var dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++)
                    {
                        var cellRow = rowOffset + 2 + week;
                        var cellCol = colOffset + dayOfWeek;
                        var cell = worksheet.Cell(cellRow, cellCol);
                        
                        if (week == 0 && dayOfWeek < startDayOfWeek)
                        {
                            // Día vacío antes del primer día
                            cell.Value = "";
                        }
                        else if (dayNum <= daysInMonth)
                        {
                            cell.Value = dayNum;
                            cell.Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                            cell.Style.Font.FontSize = 9;
                            
                            // Obtener operador para este día
                            var dateToCheck = new DateTime(year, month, dayNum);
                            var opForDay = GetOperatorForDate(dateToCheck);
                            
                            if (opForDay.HasValue)
                            {
                                cell.Style.Fill.BackgroundColor = XLColor.FromHtml(opForDay.Value.colorCode);
                                cell.Style.Font.FontColor = GetContrastColor(opForDay.Value.colorCode);
                            }
                            
                            dayNum++;
                        }
                        
                        cell.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                    }
                }
                
                calIdx++;
            }
        }
        
        // Guardar a memoria
        using var stream = new MemoryStream();
        workbook.SaveAs(stream);
        return stream.ToArray();
    }

    /// <summary>
    /// Envía la notificación de calendario generado con o sin Excel adjunto según la configuración de cada regla
    /// </summary>
    private async Task SendScheduleGeneratedToRecipientsAsync(
        IEnumerable<Models.OnCallAlertRule> rules,
        string subject,
        string htmlBody,
        byte[]? excelData,
        string? excelFileName)
    {
        foreach (var rule in rules)
        {
            var activeRecipients = rule.Recipients.Where(r => r.IsEnabled).ToList();
            
            if (!activeRecipients.Any())
            {
                _logger.LogWarning("Regla {RuleName} no tiene destinatarios activos", rule.Name);
                continue;
            }

            // Determinar si esta regla específica requiere adjunto
            var attachmentData = rule.AttachExcel ? excelData : null;
            var attachmentName = rule.AttachExcel ? excelFileName : null;

            foreach (var recipient in activeRecipients)
            {
                try
                {
                    var success = await _smtpService.SendEmailAsync(
                        recipient.Email,
                        recipient.Name,
                        subject,
                        htmlBody,
                        "ScheduleGenerated",
                        referenceType: "ScheduleGenerated",
                        referenceId: null,
                        attachmentData: attachmentData,
                        attachmentName: attachmentName);

                    if (success)
                    {
                        _logger.LogInformation(
                            "Alerta {RuleName} enviada a {Email}{WithAttachment}",
                            rule.Name,
                            recipient.Email,
                            rule.AttachExcel ? " (con Excel adjunto)" : "");
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Error enviando alerta {RuleName} a {Email}",
                        rule.Name,
                        recipient.Email);
                }
            }
        }
    }

    public async Task TriggerSwapRequestedAlertsAsync(
        string requesterName,
        string targetUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason,
        int swapRequestId)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.SwapRequested);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para SwapRequested");
            return;
        }

        var subject = $"[SQLNova] Solicitud de Intercambio de Guardia - {requesterName}";
        var body = GenerateSwapRequestedEmail(requesterName, targetUserName, weekStart, weekEnd, reason, swapRequestId);

        await SendToRecipientsAsync(rules, subject, body, "SwapRequested", swapRequestId);
    }

    public async Task TriggerSwapApprovedAlertsAsync(
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.SwapApproved);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para SwapApproved");
            return;
        }

        var subject = $"[SQLNova] Intercambio de Guardia APROBADO - {requesterName}";
        var body = GenerateSwapApprovedEmail(requesterName, approverName, weekStart, weekEnd);

        await SendToRecipientsAsync(rules, subject, body, "SwapApproved");
    }

    public async Task TriggerSwapRejectedAlertsAsync(
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.SwapRejected);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para SwapRejected");
            return;
        }

        var subject = $"[SQLNova] Intercambio de Guardia RECHAZADO - {requesterName}";
        var body = GenerateSwapRejectedEmail(requesterName, rejecterName, weekStart, weekEnd, reason);

        await SendToRecipientsAsync(rules, subject, body, "SwapRejected");
    }

    public async Task TriggerScheduleModifiedAlertsAsync(
        string operatorName,
        string modifiedByName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.ScheduleModified);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para ScheduleModified");
            return;
        }

        var subject = $"[SQLNova] Guardia Modificada - {operatorName}";
        var body = GenerateScheduleModifiedEmail(operatorName, modifiedByName, weekStart, weekEnd, reason);

        await SendToRecipientsAsync(rules, subject, body, "ScheduleModified");
    }

    public async Task TriggerActivationCreatedAlertsAsync(
        string operatorName,
        DateTime activatedAt,
        string category,
        string severity,
        string title,
        string? instanceName)
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.ActivationCreated);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para ActivationCreated");
            return;
        }

        var subject = $"[SQLNova] Nueva Activación de Guardia - {severity}";
        var body = GenerateActivationCreatedEmail(operatorName, activatedAt, category, severity, title, instanceName);

        await SendToRecipientsAsync(rules, subject, body, "ActivationCreated");
    }

    public async Task CheckAndTriggerDaysRemainingAlertsAsync()
    {
        var rules = await GetActiveRulesByTypeAsync(AlertTypes.DaysRemaining);
        
        if (!rules.Any())
        {
            _logger.LogDebug("No hay reglas activas para DaysRemaining");
            return;
        }

        foreach (var rule in rules)
        {
            if (!rule.ConditionDays.HasValue)
            {
                _logger.LogWarning("Regla {RuleName} de tipo DaysRemaining no tiene ConditionDays configurado", rule.Name);
                continue;
            }

            // Buscar guardias que comiencen en X días
            var targetDate = DateTime.Now.AddDays(rule.ConditionDays.Value).Date;
            var schedules = await _context.OnCallSchedules
                .Include(s => s.User)
                .Where(s => s.WeekStartDate.Date == targetDate)
                .ToListAsync();

            if (!schedules.Any())
            {
                continue;
            }

            foreach (var schedule in schedules)
            {
                var subject = $"[SQLNova] Tu guardia comienza en {rule.ConditionDays} días";
                var body = GenerateDaysRemainingEmail(
                    schedule.User.DisplayName,
                    schedule.WeekStartDate,
                    schedule.WeekEndDate,
                    rule.ConditionDays.Value);

                await SendToRecipientsAsync(
                    new[] { rule },
                    subject,
                    body,
                    "DaysRemaining",
                    schedule.Id);
            }
        }
    }

    // ==================== HELPER METHODS ====================

    private async Task<IEnumerable<Models.OnCallAlertRule>> GetActiveRulesByTypeAsync(string alertType)
    {
        return await _context.OnCallAlertRules
            .Include(r => r.Recipients)
            .Where(r => r.AlertType == alertType && r.IsEnabled)
            .ToListAsync();
    }

    private async Task SendToRecipientsAsync(
        IEnumerable<Models.OnCallAlertRule> rules,
        string subject,
        string htmlBody,
        string notificationType,
        int? referenceId = null)
    {
        foreach (var rule in rules)
        {
            var activeRecipients = rule.Recipients.Where(r => r.IsEnabled).ToList();
            
            if (!activeRecipients.Any())
            {
                _logger.LogWarning("Regla {RuleName} no tiene destinatarios activos", rule.Name);
                continue;
            }

            foreach (var recipient in activeRecipients)
            {
                try
                {
                    var success = await _smtpService.SendEmailAsync(
                        recipient.Email,
                        recipient.Name,
                        subject,
                        htmlBody,
                        notificationType,
                        referenceType: notificationType,
                        referenceId: referenceId);

                    if (success)
                    {
                        _logger.LogInformation(
                            "Alerta {RuleName} enviada a {Email}",
                            rule.Name,
                            recipient.Email);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex,
                        "Error enviando alerta {RuleName} a {Email}",
                        rule.Name,
                        recipient.Email);
                }
            }
        }
    }

    // ==================== EMAIL GENERATORS ====================

    private string GenerateScheduleGeneratedEmail(DateTime startDate, DateTime endDate, int weeksGenerated)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2563eb; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>📅 Calendario de Guardias Generado</h1>
        </div>
        <div class='content'>
            <p>Se ha generado un nuevo calendario de guardias DBA.</p>
            
            <div class='info-box'>
                <strong>Período:</strong><br/>
                Desde: {FormatDateSpanish(startDate)}<br/>
                Hasta: {FormatDateSpanish(endDate)}<br/>
                <strong>Total:</strong> {weeksGenerated} semanas
            </div>
            
            <p>Todos los operadores pueden consultar el calendario actualizado en la aplicación.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateSwapRequestedEmail(
        string requesterName,
        string targetUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason,
        int swapRequestId)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2563eb; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🔄 Solicitud de Intercambio de Guardia</h1>
        </div>
        <div class='content'>
            <p><strong>{requesterName}</strong> ha solicitado intercambiar su guardia con <strong>{targetUserName}</strong>.</p>
            
            <div class='info-box'>
                <strong>Guardia solicitada:</strong><br/>
                Desde: {FormatDateSpanish(weekStart, true)}<br/>
                Hasta: {FormatDateSpanish(weekEnd, true)}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo:</strong> {reason}</p>")}
            
            <a href='{_appUrl}/oncall/swaps' class='btn'>Ver Solicitudes de Intercambio</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateSwapApprovedEmail(
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #16a34a; }}
        .success {{ color: #16a34a; font-weight: bold; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>✅ Intercambio Aprobado</h1>
        </div>
        <div class='content'>
            <p class='success'>El intercambio de guardia solicitado por <strong>{requesterName}</strong> ha sido aprobado por <strong>{approverName}</strong>.</p>
            
            <div class='info-box'>
                <strong>Guardia intercambiada:</strong><br/>
                Desde: {FormatDateSpanish(weekStart, true)}<br/>
                Hasta: {FormatDateSpanish(weekEnd, true)}
            </div>
            
            <p>El calendario de guardias ha sido actualizado automáticamente.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateSwapRejectedEmail(
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>❌ Intercambio Rechazado</h1>
        </div>
        <div class='content'>
            <p>El intercambio de guardia solicitado por <strong>{requesterName}</strong> ha sido rechazado por <strong>{rejecterName}</strong>.</p>
            
            <div class='info-box'>
                <strong>Guardia solicitada:</strong><br/>
                Desde: {FormatDateSpanish(weekStart, true)}<br/>
                Hasta: {FormatDateSpanish(weekEnd, true)}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo del rechazo:</strong> {reason}</p>")}
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateScheduleModifiedEmail(
        string operatorName,
        string modifiedByName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>⚠️ Guardia Modificada</h1>
        </div>
        <div class='content'>
            <p><strong>{modifiedByName}</strong> ha modificado la guardia asignada a <strong>{operatorName}</strong>.</p>
            
            <div class='info-box'>
                <strong>Guardia afectada:</strong><br/>
                Desde: {FormatDateSpanish(weekStart, true)}<br/>
                Hasta: {FormatDateSpanish(weekEnd, true)}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo:</strong> {reason}</p>")}
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario Actualizado</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateActivationCreatedEmail(
        string operatorName,
        DateTime activatedAt,
        string category,
        string severity,
        string title,
        string? instanceName)
    {
        var severityColor = severity switch
        {
            "Critical" => "#dc2626",
            "High" => "#f59e0b",
            "Medium" => "#eab308",
            _ => "#2563eb"
        };

        // Traducir severidad al español
        var severityEs = severity switch
        {
            "Critical" => "Crítica",
            "High" => "Alta",
            "Medium" => "Media",
            "Low" => "Baja",
            _ => severity
        };

        // Traducir categoría al español
        var categoryEs = category switch
        {
            "Database" => "Base de Datos",
            "Performance" => "Rendimiento",
            "Connectivity" => "Conectividad",
            "Backup" => "Backup",
            "Security" => "Seguridad",
            "Other" => "Otro",
            _ => category
        };

        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: {severityColor}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid {severityColor}; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🚨 Nueva Activación de Guardia</h1>
        </div>
        <div class='content'>
            <p><strong>{operatorName}</strong> ha registrado una nueva activación durante su guardia.</p>
            
            <div class='info-box'>
                <strong>Título:</strong> {title}<br/>
                <strong>Severidad:</strong> {severityEs}<br/>
                <strong>Categoría:</strong> {categoryEs}<br/>
                <strong>Fecha:</strong> {FormatDateSpanish(activatedAt, true)}<br/>
                {(string.IsNullOrEmpty(instanceName) ? "" : $"<strong>Instancia:</strong> {instanceName}<br/>")}
            </div>
            
            <a href='{_appUrl}/oncall/activations' class='btn'>Ver Detalles de la Activación</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    private string GenerateDaysRemainingEmail(
        string operatorName,
        DateTime weekStart,
        DateTime weekEnd,
        int daysRemaining)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #8b5cf6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #8b5cf6; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #8b5cf6; }}
        .reminder {{ color: #8b5cf6; font-weight: bold; font-size: 18px; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>🔔 Recordatorio de Guardia</h1>
        </div>
        <div class='content'>
            <p class='reminder'>Tu guardia DBA comienza en {daysRemaining} día{(daysRemaining != 1 ? "s" : "")}</p>
            
            <p>Hola <strong>{operatorName}</strong>,</p>
            
            <p>Este es un recordatorio de que tu próxima guardia está por comenzar.</p>
            
            <div class='info-box'>
                <strong>Período de guardia:</strong><br/>
                Desde: {FormatDateSpanish(weekStart, true)}<br/>
                Hasta: {FormatDateSpanish(weekEnd, true)}
            </div>
            
            <p>Por favor, asegúrate de estar disponible y preparado para atender cualquier incidente.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    public async Task SendSchedulePendingApprovalEmailAsync(
        string approverEmail,
        string approverName,
        string generatedByName,
        DateTime startDate,
        DateTime endDate,
        int weeksGenerated,
        int batchId)
    {
        var subject = "[SQLNova] Calendario de Guardias Pendiente de Aprobación";
        var body = GenerateSchedulePendingApprovalEmail(approverName, generatedByName, startDate, endDate, weeksGenerated);

        try
        {
            var success = await _smtpService.SendEmailAsync(
                approverEmail,
                approverName,
                subject,
                body,
                "SchedulePendingApproval",
                referenceType: "ScheduleBatch",
                referenceId: batchId);

            if (success)
            {
                _logger.LogInformation(
                    "Email de aprobación pendiente enviado a {Email} para lote {BatchId}",
                    approverEmail,
                    batchId);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Error enviando email de aprobación pendiente a {Email} para lote {BatchId}",
                approverEmail,
                batchId);
        }
    }

    private string GenerateSchedulePendingApprovalEmail(
        string approverName,
        string generatedByName,
        DateTime startDate,
        DateTime endDate,
        int weeksGenerated)
    {
        return $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #f59e0b; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }}
        .warning {{ color: #f59e0b; font-weight: bold; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>⏳ Calendario Pendiente de Aprobación</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{approverName}</strong>,</p>
            
            <p class='warning'>Tienes un nuevo calendario de guardias DBA que requiere tu aprobación.</p>
            
            <p><strong>{generatedByName}</strong> ha generado un nuevo calendario de guardias.</p>
            
            <div class='info-box'>
                <strong>Detalles del calendario:</strong><br/>
                Desde: {FormatDateSpanish(startDate)}<br/>
                Hasta: {FormatDateSpanish(endDate)}<br/>
                <strong>Total:</strong> {weeksGenerated} semanas
            </div>
            
            <p>Por favor, revisa el calendario y apruébalo o recházalo según corresponda.</p>
            
            <p><strong>Importante:</strong> Mientras el calendario no sea aprobado, las guardias no estarán confirmadas.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Revisar y Aprobar Calendario</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";
    }

    // ==================== NOTIFICACIONES PROGRAMADAS ====================

    /// <summary>
    /// Envía la notificación semanal de guardia (miércoles 12:00)
    /// </summary>
    public async Task SendWeeklyNotificationAsync()
    {
        try
        {
            _logger.LogInformation("Iniciando envío de notificación semanal de guardias");

            // Buscar el template de WeeklyNotification activo
            var template = await _context.OnCallEmailTemplates
                .Where(t => t.AlertType == "WeeklyNotification" && t.IsEnabled)
                .FirstOrDefaultAsync();

            if (template == null)
            {
                _logger.LogWarning("No hay template WeeklyNotification habilitado");
                return;
            }

            // Obtener la guardia que ENTRA hoy (el operador que inicia guardia hoy a las 19:00)
            var today = Helpers.LocalClockAR.Now.Date;
            var nextSchedule = await _context.OnCallSchedules
                .Include(s => s.User)
                .Where(s => s.WeekStartDate.Date == today)
                .FirstOrDefaultAsync();

            if (nextSchedule == null)
            {
                _logger.LogWarning("No hay guardia programada para hoy {Date}", today);
                return;
            }

            var operatorName = nextSchedule.User?.DisplayName ?? "No definido";
            
            // Buscar teléfono en OnCallOperators (donde realmente se guarda)
            var operatorRecord = await _context.OnCallOperators
                .Where(o => o.UserId == nextSchedule.UserId && o.IsActive)
                .FirstOrDefaultAsync();
            var operatorPhone = operatorRecord?.PhoneNumber ?? "(no definido)";
            
            _logger.LogInformation("Operador de guardia: {Name}, UserId: {UserId}, Teléfono encontrado: {Phone}, OperatorRecord: {Found}", 
                operatorName, nextSchedule.UserId, operatorPhone, operatorRecord != null);

            // Generar tabla de escalamiento
            var escalationTable = await GenerateEscalationTableHtmlAsync();

            // Reemplazar placeholders
            var subject = template.Subject
                .Replace("{{Tecnico}}", operatorName)
                .Replace("{{Movil}}", operatorPhone);

            var body = template.Body
                .Replace("{{Tecnico}}", operatorName)
                .Replace("{{Movil}}", operatorPhone)
                .Replace("{{Inicio}}", $"{nextSchedule.WeekStartDate:dd/MM/yyyy} 19:00")
                .Replace("{{Fin}}", $"{nextSchedule.WeekEndDate:dd/MM/yyyy} 07:00")
                .Replace("{{TablaEscalamiento}}", escalationTable)
                .Replace("{{TeamEscalamiento}}", await GetEscalationNamesAsync());

            // Obtener destinatarios: primero del template, si no hay, de las reglas de alerta
            var recipients = GetRecipientsFromTemplate(template);
            if (recipients.Count == 0)
            {
                recipients = await GetAlertRecipientsAsync("WeeklyNotification");
            }

            if (recipients.Count == 0)
            {
                _logger.LogWarning("No hay destinatarios configurados para WeeklyNotification");
                return;
            }

            // Enviar el email
            foreach (var recipient in recipients)
            {
                await _smtpService.SendEmailAsync(
                    toEmail: recipient,
                    toName: null,
                    subject: subject,
                    htmlBody: body,
                    notificationType: "WeeklyNotification",
                    referenceType: "OnCallSchedule",
                    referenceId: nextSchedule.Id);
            }

            _logger.LogInformation("Notificación semanal enviada a {Count} destinatarios", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar notificación semanal de guardias");
            throw;
        }
    }

    /// <summary>
    /// Envía el aviso previo de guardia (martes 16:00)
    /// </summary>
    public async Task SendPreWeekNotificationAsync()
    {
        try
        {
            _logger.LogInformation("Iniciando envío de aviso previo de guardias");

            // Buscar el template de PreWeekNotification activo
            var template = await _context.OnCallEmailTemplates
                .Where(t => t.AlertType == "PreWeekNotification" && t.IsEnabled)
                .FirstOrDefaultAsync();

            if (template == null)
            {
                _logger.LogWarning("No hay template PreWeekNotification habilitado");
                return;
            }

            // Obtener la guardia que ENTRARÁ mañana (miércoles)
            var tomorrow = Helpers.LocalClockAR.Now.Date.AddDays(1);
            var nextSchedule = await _context.OnCallSchedules
                .Include(s => s.User)
                .Where(s => s.WeekStartDate.Date == tomorrow)
                .FirstOrDefaultAsync();

            if (nextSchedule == null)
            {
                _logger.LogWarning("No hay guardia programada para mañana {Date}", tomorrow);
                return;
            }

            var operatorName = nextSchedule.User?.DisplayName ?? "(no definido)";
            
            // Buscar teléfono en OnCallOperators (donde realmente se guarda)
            var operatorRecord = await _context.OnCallOperators
                .Where(o => o.UserId == nextSchedule.UserId && o.IsActive)
                .FirstOrDefaultAsync();
            var operatorPhone = operatorRecord?.PhoneNumber ?? "(no definido)";
            
            _logger.LogInformation("Operador de guardia (PreWeek): {Name}, UserId: {UserId}, Teléfono encontrado: {Phone}, OperatorRecord: {Found}", 
                operatorName, nextSchedule.UserId, operatorPhone, operatorRecord != null);

            // Reemplazar placeholders
            var subject = template.Subject
                .Replace("{{Tecnico}}", operatorName)
                .Replace("{{Movil}}", operatorPhone);

            var body = template.Body
                .Replace("{{Tecnico}}", operatorName)
                .Replace("{{Movil}}", operatorPhone)
                .Replace("{{Inicio}}", $"{nextSchedule.WeekStartDate:yyyy-MM-dd HH:mm}")
                .Replace("{{Fin}}", $"{nextSchedule.WeekEndDate:yyyy-MM-dd HH:mm}")
                .Replace("{{TablaEscalamiento}}", await GenerateEscalationTableHtmlAsync())
                .Replace("{{TeamEscalamiento}}", await GetEscalationNamesAsync());

            // Obtener destinatarios: primero del template, si no hay, de las reglas de alerta
            var recipients = GetRecipientsFromTemplate(template);
            if (recipients.Count == 0)
            {
                recipients = await GetAlertRecipientsAsync("PreWeekNotification");
            }

            if (recipients.Count == 0)
            {
                _logger.LogWarning("No hay destinatarios configurados para PreWeekNotification");
                return;
            }

            // Enviar el email
            foreach (var recipient in recipients)
            {
                await _smtpService.SendEmailAsync(
                    toEmail: recipient,
                    toName: null,
                    subject: subject,
                    htmlBody: body,
                    notificationType: "PreWeekNotification",
                    referenceType: "OnCallSchedule",
                    referenceId: nextSchedule.Id);
            }

            _logger.LogInformation("Aviso previo enviado a {Count} destinatarios", recipients.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar aviso previo de guardias");
            throw;
        }
    }

    /// <summary>
    /// Genera la tabla HTML de contactos de escalamiento con estilos inline para Outlook
    /// </summary>
    private async Task<string> GenerateEscalationTableHtmlAsync()
    {
        // Buscar en OnCallEscalations (tabla correcta donde está el PhoneNumber)
        var escalationUsers = await _context.OnCallEscalations
            .Include(e => e.User)
            .Where(e => e.IsActive)
            .OrderBy(e => e.EscalationOrder)
            .Select(e => new { 
                DisplayName = e.User.DisplayName ?? e.User.UserName ?? "N/A", 
                PhoneNumber = e.PhoneNumber // PhoneNumber de OnCallEscalations
            })
            .ToListAsync();

        if (escalationUsers.Count == 0)
            return "<p style=\"color: #6b7280; font-size: 14px;\">No hay contactos de escalamiento configurados.</p>";

        var sb = new System.Text.StringBuilder();
        sb.AppendLine("<table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse: collapse; margin: 10px 0;\">");
        sb.AppendLine("<thead>");
        sb.AppendLine("<tr>");
        sb.AppendLine("<th style=\"background-color: #374151; color: #ffffff; padding: 12px 15px; text-align: left; font-size: 14px; font-weight: 600; border-bottom: 2px solid #1f2937;\">Contacto</th>");
        sb.AppendLine("<th style=\"background-color: #374151; color: #ffffff; padding: 12px 15px; text-align: left; font-size: 14px; font-weight: 600; border-bottom: 2px solid #1f2937;\">Móvil</th>");
        sb.AppendLine("</tr>");
        sb.AppendLine("</thead>");
        sb.AppendLine("<tbody>");
        
        var isEven = false;
        foreach (var user in escalationUsers)
        {
            var bgColor = isEven ? "#f9fafb" : "#ffffff";
            sb.AppendLine($"<tr style=\"background-color: {bgColor};\">");
            sb.AppendLine($"<td style=\"padding: 10px 15px; border-bottom: 1px solid #e5e7eb; color: #1f2937; font-size: 14px;\">{user.DisplayName}</td>");
            sb.AppendLine($"<td style=\"padding: 10px 15px; border-bottom: 1px solid #e5e7eb; color: #374151; font-size: 14px; font-weight: 500;\">{user.PhoneNumber ?? "(no definido)"}</td>");
            sb.AppendLine("</tr>");
            isEven = !isEven;
        }
        
        sb.AppendLine("</tbody>");
        sb.AppendLine("</table>");

        return sb.ToString();
    }

    /// <summary>
    /// Obtiene los nombres del team de escalamiento separados por coma
    /// </summary>
    private async Task<string> GetEscalationNamesAsync()
    {
        // Buscar en OnCallEscalations (tabla correcta)
        var names = await _context.OnCallEscalations
            .Include(e => e.User)
            .Where(e => e.IsActive)
            .OrderBy(e => e.EscalationOrder)
            .Select(e => e.User.DisplayName ?? e.User.UserName ?? "N/A")
            .ToListAsync();

        return names.Count > 0 ? string.Join(", ", names) : "No hay contactos de escalamiento";
    }

    /// <summary>
    /// Obtiene los destinatarios configurados para un tipo de alerta
    /// </summary>
    private async Task<List<string>> GetAlertRecipientsAsync(string alertType)
    {
        var recipients = new List<string>();

        // Buscar reglas activas del tipo
        var rules = await _context.OnCallAlertRules
            .Include(r => r.Recipients)
            .Where(r => r.AlertType == alertType && r.IsEnabled)
            .ToListAsync();

        foreach (var rule in rules)
        {
            foreach (var recipient in rule.Recipients)
            {
                if (!string.IsNullOrEmpty(recipient.Email) && !recipients.Contains(recipient.Email))
                {
                    recipients.Add(recipient.Email);
                }
            }
        }

        return recipients;
    }

    /// <summary>
    /// Obtiene los destinatarios del campo Recipients del template (separados por punto y coma)
    /// </summary>
    private List<string> GetRecipientsFromTemplate(Models.OnCallEmailTemplate template)
    {
        var recipients = new List<string>();
        
        if (string.IsNullOrWhiteSpace(template.Recipients))
            return recipients;

        var emails = template.Recipients.Split(new[] { ';', ',' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (var email in emails)
        {
            var trimmed = email.Trim();
            if (!string.IsNullOrEmpty(trimmed) && trimmed.Contains('@'))
            {
                recipients.Add(trimmed);
            }
        }

        return recipients;
    }

    /// <summary>
    /// Envía un email de prueba a una dirección específica usando un template
    /// </summary>
    public async Task SendTestEmailAsync(int templateId, string testEmail)
    {
        var template = await _context.OnCallEmailTemplates.FindAsync(templateId);
        if (template == null)
            throw new ArgumentException($"Template con ID {templateId} no encontrado");

        _logger.LogInformation("Enviando email de prueba del template {TemplateId} ({AlertType}) a {Email}", 
            templateId, template.AlertType, testEmail);

        // Obtener datos de la próxima guardia para los placeholders
        var today = Helpers.LocalClockAR.Now.Date;
        
        // Buscar la guardia que empieza hoy o la próxima
        var nextSchedule = await _context.OnCallSchedules
            .Include(s => s.User)
            .Where(s => s.WeekStartDate.Date >= today)
            .OrderBy(s => s.WeekStartDate)
            .FirstOrDefaultAsync();

        string operatorName = "(Operador de prueba)";
        string operatorPhone = "(Teléfono de prueba)";
        DateTime guardiaInicio = today.AddDays(1).AddHours(19);
        DateTime guardiaFin = today.AddDays(8).AddHours(7);

        if (nextSchedule != null)
        {
            operatorName = nextSchedule.User?.DisplayName ?? nextSchedule.User?.UserName ?? "(No definido)";
            
            // Buscar teléfono en OnCallOperators (donde realmente se guarda)
            var operatorRecord = await _context.OnCallOperators
                .Where(o => o.UserId == nextSchedule.UserId && o.IsActive)
                .FirstOrDefaultAsync();
            operatorPhone = operatorRecord?.PhoneNumber ?? "(No definido)";
            
            _logger.LogInformation("Test Email - Operador: {Name}, UserId: {UserId}, Teléfono: {Phone}, OperatorRecord encontrado: {Found}", 
                operatorName, nextSchedule.UserId, operatorPhone, operatorRecord != null);
            
            guardiaInicio = nextSchedule.WeekStartDate;
            guardiaFin = nextSchedule.WeekEndDate;
        }

        // Reemplazar placeholders comunes de guardia
        var subject = template.Subject
            .Replace("{{Tecnico}}", operatorName)
            .Replace("{{Movil}}", operatorPhone);

        var body = template.Body
            .Replace("{{Tecnico}}", operatorName)
            .Replace("{{Movil}}", operatorPhone)
            .Replace("{{Inicio}}", $"{guardiaInicio:dd/MM/yyyy HH:mm}")
            .Replace("{{Fin}}", $"{guardiaFin:dd/MM/yyyy HH:mm}")
            .Replace("{{TablaEscalamiento}}", await GenerateEscalationTableHtmlAsync())
            .Replace("{{TeamEscalamiento}}", await GetEscalationNamesAsync());

        // Reemplazar placeholders específicos de ScheduleGenerated
        if (template.AlertType == "ScheduleGenerated")
        {
            // Calcular fechas de ejemplo para el calendario
            var calendarStart = guardiaInicio;
            var calendarEnd = guardiaInicio.AddDays(7 * 4); // 4 semanas de ejemplo
            
            body = body
                .Replace("{{FechaInicio}}", $"{calendarStart:dd/MM/yyyy}")
                .Replace("{{FechaFin}}", $"{calendarEnd:dd/MM/yyyy}")
                .Replace("{{Semanas}}", "4")
                .Replace("{{LinkApp}}", _appUrl)
                .Replace("{{LinkPlanificador}}", $"{_appUrl}/oncall/planner")
                .Replace("{{PrimerOperador}}", operatorName)
                .Replace("{{PrimerOperadorTelefono}}", operatorPhone)
                .Replace("{{ResumenCalendario}}", await GetCalendarSummaryAsync(calendarStart));
            
            subject = subject
                .Replace("{{FechaInicio}}", $"{calendarStart:dd/MM/yyyy}")
                .Replace("{{FechaFin}}", $"{calendarEnd:dd/MM/yyyy}");
        }

        // Enviar el email de prueba
        await _smtpService.SendEmailAsync(
            toEmail: testEmail,
            toName: null,
            subject: $"[TEST] {subject}",
            htmlBody: body,
            notificationType: "TestEmail",
            referenceType: "OnCallEmailTemplate",
            referenceId: templateId);

        _logger.LogInformation("Email de prueba enviado exitosamente a {Email}", testEmail);
    }
}

