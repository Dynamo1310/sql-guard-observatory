using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Hubs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public interface IServerRestartService
{
    Task<List<RestartableServerDto>> GetAvailableServersAsync();
    Task<StartRestartResponse> StartRestartAsync(StartRestartRequest request, string userId, string userName);
    Task<List<ServerRestartTaskDto>> GetTaskHistoryAsync(int limit = 50);
    Task<ServerRestartTaskDto?> GetTaskByIdAsync(Guid taskId);
    Task<bool> CancelTaskAsync(Guid taskId);
}

public class ServerRestartService : IServerRestartService
{
    private readonly ApplicationDbContext _context;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly ILogger<ServerRestartService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly IServiceScopeFactory _scopeFactory;
    
    // Ruta del script PowerShell
    private const string SCRIPT_PATH = @"C:\Apps\SQLGuardObservatory\Scripts\SQLRestartNova_WebAPI.ps1";
    private const string INVENTORY_URL = "http://asprbm-nov-01/InventoryDBA/inventario/";
    
    // Diccionario para rastrear procesos activos
    private static readonly Dictionary<Guid, Process> _activeProcesses = new();

    public ServerRestartService(
        ApplicationDbContext context,
        IHubContext<NotificationHub> hubContext,
        ILogger<ServerRestartService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IServiceScopeFactory scopeFactory)
    {
        _context = context;
        _hubContext = hubContext;
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClientFactory.CreateClient();
        _scopeFactory = scopeFactory;
    }

    /// <summary>
    /// Obtiene la lista de servidores disponibles para reinicio.
    /// Solo devuelve servidores que estén configurados en OperationalServers con EnabledForRestart = true.
    /// Si no hay servidores configurados, devuelve todos los del inventario (comportamiento legacy).
    /// Incluye tanto servidores del inventario como servidores agregados manualmente.
    /// </summary>
    public async Task<List<RestartableServerDto>> GetAvailableServersAsync()
    {
        try
        {
            // Obtener servidores configurados en OperationalServers habilitados para reinicio
            var operationalServers = await _context.OperationalServers
                .Where(s => s.Enabled && s.EnabledForRestart)
                .ToListAsync();

            var hasOperationalServersConfigured = operationalServers.Any();
            var enabledServerNames = operationalServers.Select(s => s.ServerName.ToLower()).ToHashSet();

            // Obtener inventario
            var response = await _httpClient.GetAsync(INVENTORY_URL);
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync();
            var inventory = JsonSerializer.Deserialize<List<InventoryServerDto>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? new List<InventoryServerDto>();

            // Obtener estados de conexión de ProductionInstanceStatus
            var connectionStatuses = await _context.ProductionInstanceStatuses
                .ToDictionaryAsync(s => s.InstanceName, s => s);

            var result = new List<RestartableServerDto>();

            if (hasOperationalServersConfigured)
            {
                _logger.LogDebug("Filtrando servidores por OperationalServers: {Count} habilitados", operationalServers.Count);

                // Crear un diccionario del inventario para búsqueda rápida
                var inventoryDict = inventory
                    .Where(s => !string.IsNullOrEmpty(s.ServerName))
                    .GroupBy(s => s.ServerName.ToLower())
                    .ToDictionary(g => g.Key, g => g.First());

                foreach (var opServer in operationalServers)
                {
                    var serverNameLower = opServer.ServerName.ToLower();
                    
                    // Buscar en el inventario
                    if (inventoryDict.TryGetValue(serverNameLower, out var invServer))
                    {
                        // Servidor existe en el inventario - usar datos del inventario
                        result.Add(new RestartableServerDto
                        {
                            ServerName = invServer.ServerName,
                            InstanceName = invServer.NombreInstancia,
                            Ambiente = invServer.ambiente,
                            HostingSite = invServer.hostingSite,
                            HostingType = invServer.hostingType,
                            MajorVersion = invServer.MajorVersion,
                            Edition = invServer.Edition,
                            IsAlwaysOn = !string.IsNullOrEmpty(invServer.AlwaysOn) && 
                                         invServer.AlwaysOn.Equals("Enabled", StringComparison.OrdinalIgnoreCase),
                            IsStandalone = string.IsNullOrEmpty(invServer.AlwaysOn) || 
                                           invServer.AlwaysOn.Equals("Disabled", StringComparison.OrdinalIgnoreCase),
                            IsConnected = !connectionStatuses.TryGetValue(invServer.NombreInstancia, out var status) || status.IsConnected,
                            LastCheckedAt = connectionStatuses.TryGetValue(invServer.NombreInstancia, out var st) ? st.LastCheckedAt : null
                        });
                    }
                    else
                    {
                        // Servidor manual (no está en inventario) - usar datos de OperationalServers
                        result.Add(new RestartableServerDto
                        {
                            ServerName = opServer.ServerName,
                            InstanceName = opServer.InstanceName ?? opServer.ServerName,
                            Ambiente = opServer.Ambiente,
                            HostingSite = "Manual",
                            HostingType = "Manual",
                            MajorVersion = null,
                            Edition = null,
                            IsAlwaysOn = false,
                            IsStandalone = true,
                            // Para servidores manuales, verificar si hay estado de conexión, si no asumir conectado
                            IsConnected = !connectionStatuses.TryGetValue(opServer.InstanceName ?? opServer.ServerName, out var status) || status.IsConnected,
                            LastCheckedAt = connectionStatuses.TryGetValue(opServer.InstanceName ?? opServer.ServerName, out var st) ? st.LastCheckedAt : null
                        });
                    }
                }
            }
            else
            {
                // Comportamiento legacy: mostrar todos los del inventario
                result = inventory
                    .Where(s => !string.IsNullOrEmpty(s.ServerName))
                    .Where(s => !s.hostingSite.Equals("AWS", StringComparison.OrdinalIgnoreCase))
                    .Where(s => !s.ServerName.Contains("DMZ", StringComparison.OrdinalIgnoreCase) &&
                               !s.NombreInstancia.Contains("DMZ", StringComparison.OrdinalIgnoreCase))
                    .Select(s => new RestartableServerDto
                    {
                        ServerName = s.ServerName,
                        InstanceName = s.NombreInstancia,
                        Ambiente = s.ambiente,
                        HostingSite = s.hostingSite,
                        HostingType = s.hostingType,
                        MajorVersion = s.MajorVersion,
                        Edition = s.Edition,
                        IsAlwaysOn = !string.IsNullOrEmpty(s.AlwaysOn) && 
                                     s.AlwaysOn.Equals("Enabled", StringComparison.OrdinalIgnoreCase),
                        IsStandalone = string.IsNullOrEmpty(s.AlwaysOn) || 
                                       s.AlwaysOn.Equals("Disabled", StringComparison.OrdinalIgnoreCase),
                        IsConnected = !connectionStatuses.TryGetValue(s.NombreInstancia, out var status) || status.IsConnected,
                        LastCheckedAt = connectionStatuses.TryGetValue(s.NombreInstancia, out var st) ? st.LastCheckedAt : null
                    })
                    .ToList();
            }

            return result.OrderBy(s => s.ServerName).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo lista de servidores del inventario");
            return new List<RestartableServerDto>();
        }
    }

    /// <summary>
    /// Inicia una tarea de reinicio de servidores
    /// </summary>
    public async Task<StartRestartResponse> StartRestartAsync(StartRestartRequest request, string userId, string userName)
    {
        if (request.Servers == null || !request.Servers.Any())
        {
            return new StartRestartResponse
            {
                Success = false,
                Message = "No se especificaron servidores para reiniciar"
            };
        }

        // Verificar que no haya otra tarea en ejecución
        var runningTask = await _context.ServerRestartTasks
            .FirstOrDefaultAsync(t => t.Status == RestartTaskStatus.Running);

        if (runningTask != null)
        {
            return new StartRestartResponse
            {
                Success = false,
                Message = $"Ya hay una tarea de reinicio en ejecución (TaskId: {runningTask.TaskId})"
            };
        }

        // Crear la tarea en la base de datos
        var task = new ServerRestartTask
        {
            TaskId = Guid.NewGuid(),
            Servers = JsonSerializer.Serialize(request.Servers),
            ServerCount = request.Servers.Count,
            Status = RestartTaskStatus.Pending,
            StartedAt = DateTime.Now,
            InitiatedByUserId = userId,
            InitiatedByUserName = userName
        };

        _context.ServerRestartTasks.Add(task);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Tarea de reinicio creada: TaskId={TaskId}, Servers={ServerCount}, User={User}",
            task.TaskId, request.Servers.Count, userName
        );

        // Iniciar el proceso en background
        _ = Task.Run(() => ExecuteRestartTaskAsync(task.TaskId, request.Servers));

        return new StartRestartResponse
        {
            Success = true,
            TaskId = task.TaskId,
            Message = $"Tarea de reinicio iniciada para {request.Servers.Count} servidor(es)",
            ServerCount = request.Servers.Count
        };
    }

    /// <summary>
    /// Ejecuta la tarea de reinicio en background
    /// </summary>
    private async Task ExecuteRestartTaskAsync(Guid taskId, List<string> servers)
    {
        var outputBuilder = new StringBuilder();
        var startTime = DateTime.Now;
        Process? process = null;

        // Crear un nuevo scope para operaciones de BD en background
        using var scope = _scopeFactory.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        try
        {
            // Actualizar estado a Running
            await UpdateTaskStatusAsync(dbContext, taskId, RestartTaskStatus.Running);

            // Enviar notificación de inicio
            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
            {
                TaskId = taskId.ToString(),
                Line = $"═══════════════════════════════════════════════════════════════",
                Type = "info",
                Timestamp = DateTime.Now
            });

            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
            {
                TaskId = taskId.ToString(),
                Line = $"  Iniciando tarea de reinicio - {DateTime.Now:yyyy/MM/dd HH:mm:ss}",
                Type = "info",
                Timestamp = DateTime.Now
            });

            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
            {
                TaskId = taskId.ToString(),
                Line = $"  Servidores a reiniciar: {servers.Count}",
                Type = "info",
                Timestamp = DateTime.Now
            });

            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
            {
                TaskId = taskId.ToString(),
                Line = $"═══════════════════════════════════════════════════════════════",
                Type = "info",
                Timestamp = DateTime.Now
            });

            // Crear archivo temporal con lista de servidores
            var serversFilePath = Path.Combine(Path.GetTempPath(), $"restart_servers_{taskId}.txt");
            await File.WriteAllLinesAsync(serversFilePath, servers);

            // Configurar el proceso de PowerShell
            var psi = new ProcessStartInfo
            {
                FileName = "pwsh.exe", // PowerShell 7
                Arguments = $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"{SCRIPT_PATH}\" -ServersFile \"{serversFilePath}\" -TaskId \"{taskId}\"",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            // Verificar si el script existe
            if (!File.Exists(SCRIPT_PATH))
            {
                var errorMsg = $"ERROR: El script no existe en la ruta: {SCRIPT_PATH}";
                await SendOutputLine(taskId, errorMsg, "error");
                outputBuilder.AppendLine(errorMsg);
                
                await UpdateTaskStatusAsync(dbContext, taskId, RestartTaskStatus.Failed, errorMessage: errorMsg);
                return;
            }

            process = new Process { StartInfo = psi };

            // Registrar el proceso activo
            lock (_activeProcesses)
            {
                _activeProcesses[taskId] = process;
            }

            // Manejadores de output
            process.OutputDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    outputBuilder.AppendLine(e.Data);
                    var (line, type, serverName) = ParseOutputLine(e.Data);
                    await SendOutputLine(taskId, line, type, serverName);
                }
            };

            process.ErrorDataReceived += async (sender, e) =>
            {
                if (!string.IsNullOrEmpty(e.Data))
                {
                    outputBuilder.AppendLine($"[ERROR] {e.Data}");
                    await SendOutputLine(taskId, e.Data, "error");
                }
            };

            process.Start();
            
            // Guardar el PID
            await UpdateTaskProcessIdAsync(dbContext, taskId, process.Id);

            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            await process.WaitForExitAsync();

            var duration = (DateTime.Now - startTime).TotalSeconds;

            // Analizar resultados
            var (successCount, failureCount) = AnalyzeResults(outputBuilder.ToString());

            // Determinar estado final
            var finalStatus = process.ExitCode == 0 
                ? RestartTaskStatus.Completed 
                : RestartTaskStatus.Failed;

            // Actualizar la tarea en BD
            await UpdateTaskCompletedAsync(dbContext, taskId, finalStatus, outputBuilder.ToString(), successCount, failureCount);

            // Notificar completado
            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartCompleted", new
            {
                TaskId = taskId.ToString(),
                Status = finalStatus,
                SuccessCount = successCount,
                FailureCount = failureCount,
                CompletedAt = DateTime.Now,
                DurationSeconds = duration
            });

            // Limpiar archivo temporal
            if (File.Exists(serversFilePath))
            {
                File.Delete(serversFilePath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ejecutando tarea de reinicio {TaskId}", taskId);

            outputBuilder.AppendLine($"[EXCEPTION] {ex.Message}");
            await SendOutputLine(taskId, $"Error crítico: {ex.Message}", "error");

            await UpdateTaskStatusAsync(dbContext, taskId, RestartTaskStatus.Failed, 
                outputBuilder.ToString(), ex.Message);

            var duration = (DateTime.Now - startTime).TotalSeconds;
            await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartCompleted", new
            {
                TaskId = taskId.ToString(),
                Status = RestartTaskStatus.Failed,
                SuccessCount = 0,
                FailureCount = 0,
                CompletedAt = DateTime.Now,
                DurationSeconds = duration,
                ErrorMessage = ex.Message
            });
        }
        finally
        {
            // Remover del diccionario de procesos activos
            lock (_activeProcesses)
            {
                _activeProcesses.Remove(taskId);
            }

            process?.Dispose();
        }
    }

    /// <summary>
    /// Parsea una línea de output para determinar tipo y servidor
    /// </summary>
    private (string line, string type, string? serverName) ParseOutputLine(string rawLine)
    {
        var type = "info";
        string? serverName = null;

        // Detectar tipo por palabras clave
        var upperLine = rawLine.ToUpper();

        if (upperLine.Contains("ERROR") || upperLine.Contains("FAILED") || upperLine.Contains("FAILURE"))
        {
            type = "error";
        }
        else if (upperLine.Contains("WARNING") || upperLine.Contains("WARN"))
        {
            type = "warning";
        }
        else if (upperLine.Contains("SUCCESS") || upperLine.Contains("EXITOSO") || upperLine.Contains("✔") || 
                 upperLine.Contains("RUNNING") || upperLine.Contains("COMPLETADO"))
        {
            type = "success";
        }

        // Intentar extraer nombre del servidor
        var serverMatch = Regex.Match(rawLine, @"(?:servidor|server|en|para)\s+([A-Za-z0-9\-_]+)", RegexOptions.IgnoreCase);
        if (serverMatch.Success)
        {
            serverName = serverMatch.Groups[1].Value;
        }

        return (rawLine, type, serverName);
    }

    /// <summary>
    /// Envía una línea de output via SignalR
    /// </summary>
    private async Task SendOutputLine(Guid taskId, string line, string type, string? serverName = null)
    {
        await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartOutput", new
        {
            TaskId = taskId.ToString(),
            Line = line,
            Type = type,
            ServerName = serverName,
            Timestamp = DateTime.Now
        });
    }

    /// <summary>
    /// Analiza el output para contar éxitos y fallos
    /// </summary>
    private (int successCount, int failureCount) AnalyzeResults(string output)
    {
        var successCount = 0;
        var failureCount = 0;

        // Buscar el resumen final del script que tiene el formato exacto:
        // "Exitosos: X ✓" y "Fallidos: X ✗"
        var successMatch = Regex.Match(output, @"Exitosos:\s*(\d+)", RegexOptions.IgnoreCase);
        var failureMatch = Regex.Match(output, @"Fallidos:\s*(\d+)", RegexOptions.IgnoreCase);

        if (successMatch.Success && int.TryParse(successMatch.Groups[1].Value, out var s))
        {
            successCount = s;
        }

        if (failureMatch.Success && int.TryParse(failureMatch.Groups[1].Value, out var f))
        {
            failureCount = f;
        }

        return (successCount, failureCount);
    }

    /// <summary>
    /// Actualiza el estado de una tarea (usa el context pasado para operaciones en background)
    /// </summary>
    private async Task UpdateTaskStatusAsync(ApplicationDbContext dbContext, Guid taskId, string status, string? outputLog = null, string? errorMessage = null)
    {
        var task = await dbContext.ServerRestartTasks.FirstOrDefaultAsync(t => t.TaskId == taskId);
        if (task != null)
        {
            task.Status = status;
            if (outputLog != null) task.OutputLog = outputLog;
            if (errorMessage != null) task.ErrorMessage = errorMessage;
            if (status == RestartTaskStatus.Failed || status == RestartTaskStatus.Completed || status == RestartTaskStatus.Cancelled)
            {
                task.CompletedAt = DateTime.Now;
            }
            await dbContext.SaveChangesAsync();
        }
    }

    /// <summary>
    /// Actualiza el PID del proceso
    /// </summary>
    private async Task UpdateTaskProcessIdAsync(ApplicationDbContext dbContext, Guid taskId, int processId)
    {
        var task = await dbContext.ServerRestartTasks.FirstOrDefaultAsync(t => t.TaskId == taskId);
        if (task != null)
        {
            task.ProcessId = processId;
            await dbContext.SaveChangesAsync();
        }
    }

    /// <summary>
    /// Actualiza una tarea completada
    /// </summary>
    private async Task UpdateTaskCompletedAsync(ApplicationDbContext dbContext, Guid taskId, string status, string outputLog, int successCount, int failureCount)
    {
        var task = await dbContext.ServerRestartTasks.FirstOrDefaultAsync(t => t.TaskId == taskId);
        if (task != null)
        {
            task.Status = status;
            task.OutputLog = outputLog;
            task.CompletedAt = DateTime.Now;
            task.SuccessCount = successCount;
            task.FailureCount = failureCount;
            await dbContext.SaveChangesAsync();
        }
    }

    /// <summary>
    /// Obtiene el historial de tareas de reinicio
    /// </summary>
    public async Task<List<ServerRestartTaskDto>> GetTaskHistoryAsync(int limit = 50)
    {
        var tasks = await _context.ServerRestartTasks
            .OrderByDescending(t => t.StartedAt)
            .Take(limit)
            .ToListAsync();

        return tasks.Select(t => MapToDto(t)).ToList();
    }

    /// <summary>
    /// Obtiene una tarea por su TaskId
    /// </summary>
    public async Task<ServerRestartTaskDto?> GetTaskByIdAsync(Guid taskId)
    {
        var task = await _context.ServerRestartTasks
            .Include(t => t.Details)
            .FirstOrDefaultAsync(t => t.TaskId == taskId);

        return task != null ? MapToDto(task) : null;
    }

    /// <summary>
    /// Cancela una tarea en ejecución
    /// </summary>
    public async Task<bool> CancelTaskAsync(Guid taskId)
    {
        var task = await _context.ServerRestartTasks.FirstOrDefaultAsync(t => t.TaskId == taskId);
        
        if (task == null || task.Status != RestartTaskStatus.Running)
        {
            return false;
        }

        // Intentar matar el proceso
        lock (_activeProcesses)
        {
            if (_activeProcesses.TryGetValue(taskId, out var process))
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                    _logger.LogInformation("Proceso de reinicio cancelado: TaskId={TaskId}, PID={PID}", taskId, process.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error al cancelar proceso {TaskId}", taskId);
                }
            }
        }

        // Actualizar estado
        task.Status = RestartTaskStatus.Cancelled;
        task.CompletedAt = DateTime.Now;
        task.ErrorMessage = "Tarea cancelada por el usuario";
        await _context.SaveChangesAsync();

        // Notificar cancelación
        await _hubContext.Clients.Group($"restart_{taskId}").SendAsync("RestartCompleted", new
        {
            TaskId = taskId.ToString(),
            Status = RestartTaskStatus.Cancelled,
            SuccessCount = task.SuccessCount,
            FailureCount = task.FailureCount,
            CompletedAt = DateTime.Now,
            ErrorMessage = "Tarea cancelada por el usuario"
        });

        return true;
    }

    /// <summary>
    /// Mapea una entidad a DTO
    /// </summary>
    private ServerRestartTaskDto MapToDto(ServerRestartTask task)
    {
        var dto = new ServerRestartTaskDto
        {
            Id = task.Id,
            TaskId = task.TaskId,
            Servers = string.IsNullOrEmpty(task.Servers) 
                ? new List<string>() 
                : JsonSerializer.Deserialize<List<string>>(task.Servers) ?? new List<string>(),
            ServerCount = task.ServerCount,
            Status = task.Status,
            StartedAt = task.StartedAt,
            CompletedAt = task.CompletedAt,
            InitiatedByUserId = task.InitiatedByUserId,
            InitiatedByUserName = task.InitiatedByUserName,
            SuccessCount = task.SuccessCount,
            FailureCount = task.FailureCount,
            ErrorMessage = task.ErrorMessage
        };

        if (task.CompletedAt.HasValue)
        {
            dto.DurationSeconds = (task.CompletedAt.Value - task.StartedAt).TotalSeconds;
        }

        if (task.Details != null)
        {
            dto.Details = task.Details.Select(d => new ServerRestartDetailDto
            {
                Id = d.Id,
                ServerName = d.ServerName,
                Status = d.Status,
                StartedAt = d.StartedAt,
                CompletedAt = d.CompletedAt,
                ErrorMessage = d.ErrorMessage,
                RestartResult = d.RestartResult,
                PingResult = d.PingResult,
                ServicioOSResult = d.ServicioOSResult,
                DiscosResult = d.DiscosResult,
                ServicioMSSQLSERVERResult = d.ServicioMSSQLSERVERResult,
                ServicioSQLSERVERAGENTResult = d.ServicioSQLSERVERAGENTResult
            }).ToList();
        }

        return dto;
    }
}

/// <summary>
/// DTO interno para deserializar del inventario
/// </summary>
internal class InventoryServerDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string local_net_address { get; set; } = "";
    public string NombreInstancia { get; set; } = "";
    public string MajorVersion { get; set; } = "";
    public string ProductLevel { get; set; } = "";
    public string Edition { get; set; } = "";
    public string ProductUpdateLevel { get; set; } = "";
    public string ProductVersion { get; set; } = "";
    public string ProductUpdateReference { get; set; } = "";
    public string Collation { get; set; } = "";
    public string AlwaysOn { get; set; } = "";
    public string hostingSite { get; set; } = "";
    public string hostingType { get; set; } = "";
    public string ambiente { get; set; } = "";
}

