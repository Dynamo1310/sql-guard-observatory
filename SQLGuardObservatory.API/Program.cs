using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Hubs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
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
builder.Services.AddScoped<ISmtpService, SmtpService>();

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

// Server Restart Service - Reinicio de servidores SQL
builder.Services.AddScoped<IServerRestartService, ServerRestartService>();

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

// Middleware para OPTIONS y manejo de errores NTLM
app.Use(async (context, next) =>
{
    if (context.Request.Method == "OPTIONS")
    {
        context.Response.StatusCode = 204;
        return;
    }
    
    try
    {
        await next();
    }
    catch (InvalidOperationException ex) when (ex.Message.Contains("anonymous request"))
    {
        // Error de NTLM - devolver 503 para que el frontend reintente
        // NO usar 401 porque muestra diálogo de credenciales
        if (!context.Response.HasStarted)
        {
            context.Response.StatusCode = 503;
        }
    }
});

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Mapear Hub de SignalR para notificaciones en tiempo real
app.MapHub<NotificationHub>("/hubs/notifications");

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

