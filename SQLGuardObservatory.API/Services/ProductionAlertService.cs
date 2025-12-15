using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public class ProductionAlertService : IProductionAlertService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<ProductionAlertService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    
    private const string INVENTORY_URL = "http://asprbm-nov-01/InventoryDBA/inventario/";

    public ProductionAlertService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        ILogger<ProductionAlertService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _smtpService = smtpService;
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
    }

    public async Task<ProductionAlertConfig?> GetConfigAsync()
    {
        return await _context.Set<ProductionAlertConfig>().FirstOrDefaultAsync();
    }

    public async Task<ProductionAlertConfig> CreateConfigAsync(CreateProductionAlertRequest request, string userId, string userDisplayName)
    {
        var config = new ProductionAlertConfig
        {
            Name = request.Name,
            Description = request.Description,
            CheckIntervalMinutes = request.CheckIntervalMinutes,
            AlertIntervalMinutes = request.AlertIntervalMinutes,
            Recipients = string.Join(",", request.Recipients),
            Ambientes = string.Join(",", request.Ambientes),
            CreatedAt = DateTime.Now,
            UpdatedBy = userId,
            UpdatedByDisplayName = userDisplayName
        };

        _context.Set<ProductionAlertConfig>().Add(config);
        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<ProductionAlertConfig> UpdateConfigAsync(UpdateProductionAlertRequest request, string userId, string userDisplayName)
    {
        var config = await _context.Set<ProductionAlertConfig>().FirstOrDefaultAsync();
        
        if (config == null)
        {
            config = new ProductionAlertConfig();
            _context.Set<ProductionAlertConfig>().Add(config);
        }

        if (request.Name != null) config.Name = request.Name;
        if (request.Description != null) config.Description = request.Description;
        if (request.IsEnabled.HasValue) config.IsEnabled = request.IsEnabled.Value;
        if (request.CheckIntervalMinutes.HasValue) config.CheckIntervalMinutes = request.CheckIntervalMinutes.Value;
        if (request.AlertIntervalMinutes.HasValue) config.AlertIntervalMinutes = request.AlertIntervalMinutes.Value;
        if (request.Recipients != null) config.Recipients = string.Join(",", request.Recipients);
        if (request.Ambientes != null) config.Ambientes = string.Join(",", request.Ambientes);
        
        config.UpdatedAt = DateTime.Now;
        config.UpdatedBy = userId;
        config.UpdatedByDisplayName = userDisplayName;

        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<List<ProductionAlertHistory>> GetHistoryAsync(int limit = 20)
    {
        return await _context.Set<ProductionAlertHistory>()
            .OrderByDescending(h => h.SentAt)
            .Take(limit)
            .ToListAsync();
    }

    public async Task<List<ProductionInstanceStatus>> GetConnectionStatusAsync()
    {
        return await _context.Set<ProductionInstanceStatus>()
            .OrderBy(s => s.InstanceName)
            .ToListAsync();
    }

    public async Task<bool> TestConnectionAsync(string instanceName)
    {
        try
        {
            // Extraer servidor y puerto de la instancia
            var serverName = instanceName;
            var port = 1433;
            
            // Si es una instancia nombrada (SERVER\INSTANCE), usar el nombre del servidor
            if (instanceName.Contains('\\'))
            {
                serverName = instanceName.Split('\\')[0];
            }
            
            // Si tiene puerto explícito (SERVER,PORT)
            if (instanceName.Contains(','))
            {
                var parts = instanceName.Split(',');
                serverName = parts[0];
                if (int.TryParse(parts[1], out var p)) port = p;
            }

            // Test TCP connection al puerto SQL Server
            using var tcpClient = new System.Net.Sockets.TcpClient();
            var connectTask = tcpClient.ConnectAsync(serverName, port);
            
            // Timeout de 5 segundos
            if (await Task.WhenAny(connectTask, Task.Delay(5000)) == connectTask)
            {
                await connectTask; // Propagar excepción si falló
                return tcpClient.Connected;
            }
            
            _logger.LogWarning("TCP connection timeout for {Instance} ({Server}:{Port})", instanceName, serverName, port);
            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning("TCP connection test failed for {Instance}: {Error}", instanceName, ex.Message);
            return false;
        }
    }

    public async Task RunCheckAsync()
    {
        var config = await GetConfigAsync();
        if (config == null || !config.IsEnabled)
        {
            return;
        }

        _logger.LogInformation("Starting production server check...");

        try
        {
            // 1. Obtener instancias del inventario
            var instances = await GetInventoryInstancesAsync();
            
            // 2. Filtrar: excluir AWS y DMZ, y solo ambientes configurados
            var ambientesPermitidos = config.Ambientes.Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(a => a.Trim())
                .ToList();
            
            var filteredInstances = instances
                .Where(i => !string.Equals(i.hostingSite, "AWS", StringComparison.OrdinalIgnoreCase))
                .Where(i => !i.NombreInstancia.Contains("DMZ", StringComparison.OrdinalIgnoreCase))
                .Where(i => ambientesPermitidos.Any(a => string.Equals(i.ambiente, a, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            _logger.LogInformation("Checking {Count} instances (filtered from {Total})", 
                filteredInstances.Count, instances.Count);

            var downInstances = new List<string>();

            // 3. Verificar conexión a cada instancia
            foreach (var instance in filteredInstances)
            {
                var isConnected = await TestConnectionAsync(instance.NombreInstancia);
                await UpdateInstanceStatusAsync(instance, isConnected);

                if (!isConnected)
                {
                    downInstances.Add(instance.NombreInstancia);
                }
            }

            // 4. Actualizar última ejecución
            config.LastRunAt = DateTime.Now;
            await _context.SaveChangesAsync();

            // 5. Enviar alerta si hay instancias caídas
            if (downInstances.Any())
            {
                await SendAlertIfNeededAsync(config, downInstances);
            }

            _logger.LogInformation("Production check completed. Down instances: {Count}", downInstances.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during production server check");
        }
    }

    public async Task<(bool success, string message, List<string>? instancesDown)> TestAlertAsync()
    {
        var config = await GetConfigAsync();
        if (config == null)
        {
            return (false, "No hay configuración de alertas", null);
        }

        var recipients = config.Recipients.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (!recipients.Any())
        {
            return (false, "No hay destinatarios configurados", null);
        }

        try
        {
            var subject = "[PRUEBA] Alerta de Servidores SQL - SQLNova";
            var body = $@"
<html>
<body style='font-family: Arial, sans-serif;'>
<h2 style='color: #2563eb;'>🔔 Email de Prueba - SQLNova</h2>
<p>Este es un email de prueba del sistema de alertas de servidores caídos.</p>
<p><strong>Configuración actual:</strong></p>
<ul>
<li>Intervalo de verificación: {config.CheckIntervalMinutes} minuto(s)</li>
<li>Intervalo de alertas: {config.AlertIntervalMinutes} minuto(s)</li>
<li>Estado: {(config.IsEnabled ? "Activa" : "Inactiva")}</li>
</ul>
<p style='color: #666; font-size: 12px;'>Enviado desde SQLNova - {DateTime.Now:dd/MM/yyyy HH:mm:ss}</p>
</body>
</html>";

            // Enviar a cada destinatario
            foreach (var recipient in recipients)
            {
                await _smtpService.SendEmailAsync(recipient, null, subject, body, "ProductionAlertTest");
            }
            return (true, $"Email de prueba enviado a {recipients.Count} destinatario(s)", null);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test alert");
            return (false, $"Error al enviar email: {ex.Message}", null);
        }
    }

    private async Task<List<InventoryInstanceDto>> GetInventoryInstancesAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync(INVENTORY_URL);
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync();
            var instances = JsonSerializer.Deserialize<List<InventoryInstanceDto>>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            
            return instances ?? new List<InventoryInstanceDto>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching inventory from {Url}", INVENTORY_URL);
            return new List<InventoryInstanceDto>();
        }
    }

    private async Task UpdateInstanceStatusAsync(InventoryInstanceDto instance, bool isConnected)
    {
        var status = await _context.Set<ProductionInstanceStatus>()
            .FirstOrDefaultAsync(s => s.InstanceName == instance.NombreInstancia);

        if (status == null)
        {
            status = new ProductionInstanceStatus
            {
                InstanceName = instance.NombreInstancia,
                ServerName = instance.ServerName,
                Ambiente = instance.ambiente,
                HostingSite = instance.hostingSite
            };
            _context.Set<ProductionInstanceStatus>().Add(status);
        }

        var wasConnected = status.IsConnected;
        status.IsConnected = isConnected;
        status.LastCheckedAt = DateTime.Now;
        status.ServerName = instance.ServerName;
        status.Ambiente = instance.ambiente;
        status.HostingSite = instance.hostingSite;

        if (!isConnected && wasConnected)
        {
            // Acaba de caer
            status.DownSince = DateTime.Now;
            status.LastError = "Connection failed";
        }
        else if (isConnected)
        {
            // Se recuperó
            status.DownSince = null;
            status.LastError = null;
        }

        await _context.SaveChangesAsync();
    }

    private async Task SendAlertIfNeededAsync(ProductionAlertConfig config, List<string> downInstances)
    {
        var recipients = config.Recipients.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (!recipients.Any())
        {
            _logger.LogWarning("No recipients configured for production alerts");
            return;
        }

        // Verificar si debemos enviar alerta (según intervalo configurado)
        var now = DateTime.Now;
        var shouldSend = config.LastAlertSentAt == null || 
            (now - config.LastAlertSentAt.Value).TotalMinutes >= config.AlertIntervalMinutes;

        if (!shouldSend)
        {
            _logger.LogInformation("Skipping alert - last sent {MinutesAgo} minutes ago (interval: {Interval})",
                (now - config.LastAlertSentAt!.Value).TotalMinutes, config.AlertIntervalMinutes);
            return;
        }

        try
        {
            var subject = $"🚨 ALERTA: {downInstances.Count} servidor(es) SQL sin respuesta - SQLNova";
            var instanceList = string.Join("", downInstances.Select(i => $"<li><strong>{i}</strong></li>"));
            
            var body = $@"
<html>
<body style='font-family: Arial, sans-serif;'>
<div style='background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0;'>
<h2 style='color: #dc2626; margin: 0 0 10px 0;'>🚨 Servidores SQL Sin Respuesta</h2>
<p style='margin: 0;'>Se detectaron <strong>{downInstances.Count}</strong> servidor(es) que no responden a la conexión.</p>
</div>

<h3>Instancias afectadas:</h3>
<ul style='background-color: #f8f8f8; padding: 15px 15px 15px 35px; border-radius: 5px;'>
{instanceList}
</ul>

<p><strong>Acción requerida:</strong> Verificar el estado de los servidores listados.</p>

<hr style='border: none; border-top: 1px solid #ddd; margin: 20px 0;'>
<p style='color: #666; font-size: 12px;'>
Esta alerta se envía cada {config.AlertIntervalMinutes} minutos mientras los servidores permanezcan sin respuesta.<br>
Enviado desde SQLNova - {DateTime.Now:dd/MM/yyyy HH:mm:ss}
</p>
</body>
</html>";

            // Enviar a cada destinatario
            foreach (var recipient in recipients)
            {
                await _smtpService.SendEmailAsync(recipient, null, subject, body, "ProductionAlert");
            }

            // Registrar en historial
            var history = new ProductionAlertHistory
            {
                ConfigId = config.Id,
                SentAt = now,
                RecipientCount = recipients.Count,
                InstancesDown = string.Join(",", downInstances),
                Success = true
            };
            _context.Set<ProductionAlertHistory>().Add(history);

            // Actualizar última alerta enviada
            config.LastAlertSentAt = now;
            await _context.SaveChangesAsync();

            _logger.LogInformation("Alert sent to {Count} recipients for {Instances} down instances",
                recipients.Count, downInstances.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending production alert");

            // Registrar error en historial
            var history = new ProductionAlertHistory
            {
                ConfigId = config.Id,
                SentAt = now,
                RecipientCount = recipients.Count,
                InstancesDown = string.Join(",", downInstances),
                Success = false,
                ErrorMessage = ex.Message
            };
            _context.Set<ProductionAlertHistory>().Add(history);
            await _context.SaveChangesAsync();
        }
    }
}

