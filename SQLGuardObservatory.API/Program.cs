using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Server.HttpSys;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.IdentityModel.Tokens;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Hubs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
using SQLGuardObservatory.API.Services.Collectors;
using SQLGuardObservatory.API.Services.Collectors.Implementations;
using Serilog;
using Serilog.Events;
using System.Diagnostics;
using System.Text;

// ========== CONFIGURACIÓN DE SERILOG ==========
// Crear directorio de logs si no existe
var logsPath = Path.Combine(Directory.GetCurrentDirectory(), "Logs");
if (!Directory.Exists(logsPath))
{
    Directory.CreateDirectory(logsPath);
}

// Configurar Serilog con timestamps en hora local (UTC-3 para Argentina)
// Serilog usa por defecto la hora local del sistema
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
    .MinimumLevel.Override("Microsoft.EntityFrameworkCore", LogEventLevel.Warning)
    .Enrich.FromLogContext()
    .WriteTo.Console(
        outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss}] [{Level:u3}] {SourceContext} - {Message:lj}{NewLine}{Exception}")
    .WriteTo.File(
        Path.Combine(logsPath, "sqlguard-.log"),
        outputTemplate: "[{Timestamp:yyyy-MM-dd HH:mm:ss}] [{Level:u3}] {SourceContext} - {Message:lj}{NewLine}{Exception}",
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 30,
        fileSizeLimitBytes: 10 * 1024 * 1024, // 10 MB por archivo
        rollOnFileSizeLimit: true,
        shared: true) // Permite que múltiples procesos escriban al mismo archivo
    .CreateLogger();

try
{
    var localTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.Local);
    Log.Information("==============================================");
    Log.Information("Iniciando SQLGuard Observatory API");
    Log.Information("Fecha y hora local: {Timestamp}", localTime.ToString("yyyy-MM-dd HH:mm:ss"));
    Log.Information("Zona horaria: {TimeZone}", TimeZoneInfo.Local.DisplayName);
    Log.Information("==============================================");

    var builder = WebApplication.CreateBuilder(args);

    // ========== USAR HTTP.SYS EN LUGAR DE KESTREL ==========
    // HttpSys es el servidor web nativo de Windows y tiene soporte completo
    // para autenticación Windows (NTLM/Kerberos) sin problemas de solicitudes concurrentes
    builder.WebHost.UseHttpSys(options =>
    {
        options.Authentication.Schemes = AuthenticationSchemes.NTLM | AuthenticationSchemes.Negotiate;
        options.Authentication.AllowAnonymous = true; // Permite endpoints anónimos también
        options.UrlPrefixes.Add("http://*:5000"); // Escuchar en el puerto 5000
        
        // ========== OPTIMIZACIÓN PARA ALTA CONCURRENCIA (200-500 usuarios) ==========
        options.MaxConnections = 1000;              // Máximo de conexiones simultáneas
        options.MaxRequestBodySize = 30_000_000;    // 30 MB máximo por request
        options.RequestQueueLimit = 1000;           // Cola de requests pendientes
    });

    // Usar Serilog como proveedor de logging
    builder.Host.UseSerilog();

    // Configurar para ejecutarse como servicio de Windows
    builder.Host.UseWindowsService();
    

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ========== OUTPUT CACHE - Cacheo de respuestas frecuentes ==========
builder.Services.AddOutputCache(options =>
{
    options.AddBasePolicy(builder => builder.Expire(TimeSpan.FromSeconds(30)));
    options.AddPolicy("ShortCache", builder => builder.Expire(TimeSpan.FromSeconds(15)));
    options.AddPolicy("MediumCache", builder => builder.Expire(TimeSpan.FromMinutes(1)));
    options.AddPolicy("LongCache", builder => builder.Expire(TimeSpan.FromMinutes(5)));
});

// ========== MEMORY CACHE con límites ==========
builder.Services.AddMemoryCache(options =>
{
    options.SizeLimit = 1024; // Límite de entradas en caché
});

// ========== SIGNALR CONFIGURATION - Optimizado para alta concurrencia ==========
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = false;                       // Producción: sin detalles de error
    options.MaximumReceiveMessageSize = 64 * 1024;              // 64KB máximo por mensaje
    options.StreamBufferCapacity = 20;                          // Buffer para streams
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);       // Ping cada 15s
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(60);   // Timeout de cliente 60s
    options.MaximumParallelInvocationsPerClient = 2;            // Limitar invocaciones paralelas
});

// ========== DbContext con resiliencia y connection pooling optimizado ==========
// Configurar DbContext para SQL Server
builder.Services.AddDbContext<SQLNovaDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("SQLNova"), sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null);
        sqlOptions.CommandTimeout(60); // 60 segundos timeout
    }));

// Configurar DbContext para Identity (usuarios autorizados)
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("ApplicationDb"), sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 3,
            maxRetryDelay: TimeSpan.FromSeconds(10),
            errorNumbersToAdd: null);
        sqlOptions.CommandTimeout(60);
    }));

// Configurar Identity
builder.Services.AddIdentity<ApplicationUser, IdentityRole>(options =>
{
    options.Password.RequireDigit = false;
    options.Password.RequireLowercase = false;
    options.Password.RequireUppercase = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 6;
    options.User.RequireUniqueEmail = false;
})
.AddEntityFrameworkStores<ApplicationDbContext>()
.AddDefaultTokenProviders();

// Configurar JWT Authentication y Windows Authentication
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = jwtSettings["SecretKey"] ?? throw new InvalidOperationException("SecretKey no configurada");

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtSettings["Issuer"],
        ValidAudience = jwtSettings["Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey)),
        ClockSkew = TimeSpan.Zero // Sin tolerancia - expiración estricta
    };
})
.AddNegotiate();

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin", "SuperAdmin"));
    options.AddPolicy("WhitelistOnly", policy => policy.RequireAuthenticatedUser());
});

// Registrar servicios personalizados
builder.Services.AddScoped<IJobsService, JobsService>();
builder.Services.AddScoped<IDisksService, DisksService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<IPermissionService, PermissionService>();
builder.Services.AddScoped<IActiveDirectoryService, ActiveDirectoryService>();
builder.Services.AddScoped<IHealthScoreService, HealthScoreService>();

// Servicios de Guardias DBA (OnCall)
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IOnCallService, OnCallService>();
builder.Services.AddScoped<IOnCallAlertService, OnCallAlertService>();
builder.Services.AddScoped<ISmtpService, SmtpService>();

// Servicio de background para notificaciones programadas
builder.Services.AddHostedService<ScheduledNotificationService>();

// Servicio de notificaciones de Microsoft Teams
builder.Services.AddHttpClient("TeamsWebhook", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddHttpClient("GraphAPI", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddHttpClient("GraphAuth", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddScoped<ITeamsNotificationService, TeamsNotificationService>();

// Production Alerts - Monitoreo de servidores caídos
builder.Services.AddHttpClient();
builder.Services.AddScoped<IProductionAlertService, ProductionAlertService>();
builder.Services.AddHostedService<ProductionAlertBackgroundService>();

// Overview Summary Alerts - Resumen programado del estado de producción
builder.Services.AddScoped<IOverviewSummaryAlertService, OverviewSummaryAlertService>();
builder.Services.AddHostedService<OverviewSummaryBackgroundService>();

// Overview Data Service - Datos optimizados para la página Overview
// El caché se actualiza automáticamente por los collectors (HealthScoreConsolidator, DiscosCollector, MaintenanceCollector)
builder.Services.AddScoped<IOverviewSummaryCacheService, OverviewSummaryCacheService>();
builder.Services.AddScoped<IOverviewService, OverviewService>();

// Server Restart Service - Reinicio de servidores SQL
builder.Services.AddScoped<IServerRestartService, ServerRestartService>();

// Index Analysis Service - Análisis exhaustivo de índices
builder.Services.AddScoped<IIndexAnalysisService, IndexAnalysisService>();

// Patching Service - Estado de parcheo de servidores SQL Server
builder.Services.AddScoped<IPatchingService, PatchingService>();
builder.Services.AddScoped<IPatchPlanService, PatchPlanService>();

// Patching - Sistema mejorado de gestión de parcheos
builder.Services.AddScoped<IWindowSuggesterService, WindowSuggesterService>();
builder.Services.AddScoped<IDatabaseOwnersService, DatabaseOwnersService>();
builder.Services.AddScoped<IPatchConfigService, PatchConfigService>();
builder.Services.AddHostedService<PatchNotificationBackgroundService>();

// Vault de Credenciales DBA
builder.Services.AddScoped<ICryptoService, CryptoService>();
builder.Services.AddScoped<IVaultNotificationService, VaultNotificationService>();
builder.Services.AddScoped<IVaultService, VaultService>();

// Vault Enterprise v2.1.1 - Servicios de permisos y auditoría
builder.Services.AddScoped<IPermissionBitMaskService, PermissionBitMaskService>();
builder.Services.AddScoped<ICredentialAccessLogService, CredentialAccessLogService>();

// Vault Enterprise v2.1 - Servicios de cifrado
builder.Services.AddScoped<ICryptoServiceV2, CryptoServiceV2>();
builder.Services.AddScoped<IKeyManager, KeyManager>();
builder.Services.AddScoped<IDualReadCryptoService, DualReadCryptoService>();

// System Credentials - Credenciales de sistema para conexión a servidores
builder.Services.AddScoped<ISystemCredentialService, SystemCredentialService>();

// Security Groups - Grupos de seguridad para organizar usuarios
builder.Services.AddScoped<IGroupService, GroupService>();

// Admin Authorization Service - Permisos administrativos basados en roles
builder.Services.AddScoped<IAdminAuthorizationService, AdminAuthorizationService>();

// ========== COLLECTORS HEALTHSCORE ==========
// HttpClient para obtener inventario de instancias
builder.Services.AddHttpClient("InventoryApi", client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});

// Servicios de infraestructura de collectors
builder.Services.AddScoped<ICollectorConfigService, CollectorConfigService>();
builder.Services.AddScoped<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddScoped<IInstanceProvider, InstanceProvider>();

// Registrar los 13 collectors como ICollector
builder.Services.AddScoped<ICollector, CPUCollector>();
builder.Services.AddScoped<ICollector, MemoriaCollector>();
builder.Services.AddScoped<ICollector, IOCollector>();
builder.Services.AddScoped<ICollector, DiscosCollector>();
builder.Services.AddScoped<ICollector, BackupsCollector>();
builder.Services.AddScoped<ICollector, AlwaysOnCollector>();
builder.Services.AddScoped<ICollector, LogChainCollector>();
builder.Services.AddScoped<ICollector, DatabaseStatesCollector>();
builder.Services.AddScoped<ICollector, ErroresCriticosCollector>();
builder.Services.AddScoped<ICollector, MaintenanceCollector>();
builder.Services.AddScoped<ICollector, ConfigTempDBCollector>();
builder.Services.AddScoped<ICollector, AutogrowthCollector>();
builder.Services.AddScoped<ICollector, WaitsCollector>();

// Orquestador de collectors (Background Service)
builder.Services.AddSingleton<CollectorOrchestrator>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<CollectorOrchestrator>());

// Consolidador de HealthScore (Background Service)
builder.Services.AddSingleton<HealthScoreConsolidator>();
builder.Services.AddHostedService(provider => provider.GetRequiredService<HealthScoreConsolidator>());

// ========== HEALTH CHECKS - Monitoreo de salud del servidor ==========
var applicationDbConnection = builder.Configuration.GetConnectionString("ApplicationDb");
builder.Services.AddHealthChecks()
    .AddSqlServer(
        connectionString: applicationDbConnection ?? throw new InvalidOperationException("ApplicationDb connection string not found"),
        name: "sqlguardobservatory-db",
        failureStatus: HealthStatus.Degraded,
        tags: new[] { "db", "sql" })
    .AddCheck("memory", () =>
    {
        var allocatedBytes = GC.GetTotalMemory(forceFullCollection: false);
        var threshold = 1_000_000_000L; // 1 GB
        
        if (allocatedBytes < threshold)
            return HealthCheckResult.Healthy($"Memory usage: {allocatedBytes / 1024 / 1024} MB");
        
        return HealthCheckResult.Degraded($"High memory usage: {allocatedBytes / 1024 / 1024} MB");
    }, tags: new[] { "memory" })
    .AddCheck("cpu", () =>
    {
        // Check básico - el proceso está respondiendo
        return HealthCheckResult.Healthy("CPU check passed");
    }, tags: new[] { "cpu" });

// Configurar CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            // Desarrollo
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:3000",
            "http://localhost:4200",
            "http://localhost:8080",
            // Producción - Frontend en asprbm-nov-01
            "http://asprbm-nov-01",           // Puerto 80 (default)
            "http://asprbm-nov-01:80",        // Puerto 80 explícito
            "http://asprbm-nov-01:8080",      // Puerto 8080 (frontend)
            "https://asprbm-nov-01",          // HTTPS si aplica
            "https://asprbm-nov-01:443"       // HTTPS puerto explícito
        )
        .AllowAnyMethod()
        .AllowAnyHeader()
        .AllowCredentials();
    });
});

var app = builder.Build();

// Inicializar base de datos y usuario admin por defecto
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<ApplicationDbContext>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var roleManager = services.GetRequiredService<RoleManager<IdentityRole>>();
        var configuration = services.GetRequiredService<IConfiguration>();
        
        await DbInitializer.Initialize(context, userManager, roleManager);
        await PermissionInitializer.InitializePermissions(context, roleManager, configuration);
    }
    catch (Exception ex)
    {
        var logger = services.GetRequiredService<ILogger<Program>>();
        logger.LogError(ex, "Error al inicializar la base de datos");
    }
}

// Configure the HTTP request pipeline.
app.UseSwagger();
app.UseSwaggerUI();

// app.UseHttpsRedirection(); // Deshabilitado - solo usamos HTTP

// CORS primero
app.UseCors("AllowFrontend");

// ========== REQUEST TIMING MIDDLEWARE - Detectar endpoints lentos ==========
app.Use(async (context, next) =>
{
    var sw = Stopwatch.StartNew();
    
    // Registrar callback para agregar header ANTES de que la respuesta comience
    context.Response.OnStarting(() =>
    {
        sw.Stop();
        context.Response.Headers["X-Response-Time-Ms"] = sw.ElapsedMilliseconds.ToString();
        return Task.CompletedTask;
    });
    
    await next();
    sw.Stop();
    
    // Log si la request tarda más de 2 segundos (excluir SignalR WebSockets)
    if (sw.ElapsedMilliseconds > 2000 && !context.Request.Path.StartsWithSegments("/hubs"))
    {
        Log.Warning("Slow request: {Method} {Path} took {Duration}ms",
            context.Request.Method, context.Request.Path, sw.ElapsedMilliseconds);
    }
});

// ========== OUTPUT CACHE ==========
app.UseOutputCache();

// Middleware para OPTIONS - manejar preflight requests
app.Use(async (context, next) =>
{
    if (context.Request.Method == "OPTIONS")
    {
        context.Response.StatusCode = 204;
        return;
    }
    
    await next();
});

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ========== HEALTH CHECK ENDPOINTS ==========
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var result = new
        {
            status = report.Status.ToString(),
            totalDuration = report.TotalDuration.TotalMilliseconds,
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                duration = e.Value.Duration.TotalMilliseconds,
                description = e.Value.Description,
                exception = e.Value.Exception?.Message
            })
        };
        await context.Response.WriteAsJsonAsync(result);
    }
}).AllowAnonymous();

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("db")
}).AllowAnonymous();

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false // Solo verifica que la app responda
}).AllowAnonymous();

// Mapear Hub de SignalR para notificaciones en tiempo real
app.MapHub<NotificationHub>("/hubs/notifications").AllowAnonymous();

Log.Information("SQLGuard Observatory API iniciada correctamente");
app.Run();

}
catch (Exception ex)
{
    Log.Fatal(ex, "La aplicación falló al iniciar");
    throw;
}
finally
{
    Log.Information("==============================================");
    Log.Information("Deteniendo SQLGuard Observatory API");
    Log.Information("==============================================");
    Log.CloseAndFlush();
}

