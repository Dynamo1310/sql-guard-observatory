using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Server.HttpSys;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Hubs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
using SQLGuardObservatory.API.Services.Collectors;
using SQLGuardObservatory.API.Services.Collectors.Implementations;
using Serilog;
using Serilog.Events;
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
    });

    // Usar Serilog como proveedor de logging
    builder.Host.UseSerilog();

    // Configurar para ejecutarse como servicio de Windows
    builder.Host.UseWindowsService();
    

// Add services to the container.
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// ========== SIGNALR CONFIGURATION ==========
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true; // Solo en desarrollo
    options.KeepAliveInterval = TimeSpan.FromSeconds(15);
    options.ClientTimeoutInterval = TimeSpan.FromSeconds(30);
});

// Configurar DbContext para SQL Server
builder.Services.AddDbContext<SQLNovaDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("SQLNova")));

// Configurar DbContext para Identity (usuarios autorizados)
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("ApplicationDb")));

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

// Server Restart Service - Reinicio de servidores SQL
builder.Services.AddScoped<IServerRestartService, ServerRestartService>();

// Index Analysis Service - Análisis exhaustivo de índices
builder.Services.AddScoped<IIndexAnalysisService, IndexAnalysisService>();

// Patching Service - Estado de parcheo de servidores SQL Server
builder.Services.AddScoped<IPatchingService, PatchingService>();

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

