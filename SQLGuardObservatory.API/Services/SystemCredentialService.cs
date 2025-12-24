using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;
using System.Text.RegularExpressions;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de credenciales de sistema
/// </summary>
public class SystemCredentialService : ISystemCredentialService
{
    private readonly ApplicationDbContext _context;
    private readonly IDualReadCryptoService _cryptoService;
    private readonly ILogger<SystemCredentialService> _logger;

    public SystemCredentialService(
        ApplicationDbContext context,
        IDualReadCryptoService cryptoService,
        ILogger<SystemCredentialService> logger)
    {
        _context = context;
        _cryptoService = cryptoService;
        _logger = logger;
    }

    // ==================== CRUD ====================

    public async Task<List<SystemCredentialDto>> GetAllAsync()
    {
        var credentials = await _context.SystemCredentials
            .Include(c => c.Assignments)
            .Include(c => c.CreatedByUser)
            .Include(c => c.UpdatedByUser)
            .OrderBy(c => c.Name)
            .ToListAsync();

        return credentials.Select(MapToDto).ToList();
    }

    public async Task<SystemCredentialDto?> GetByIdAsync(int id)
    {
        var credential = await _context.SystemCredentials
            .Include(c => c.Assignments)
            .Include(c => c.CreatedByUser)
            .Include(c => c.UpdatedByUser)
            .FirstOrDefaultAsync(c => c.Id == id);

        return credential != null ? MapToDto(credential) : null;
    }

    public async Task<SystemCredentialDto?> CreateAsync(CreateSystemCredentialRequest request, string userId, string? userName)
    {
        try
        {
            // Verificar nombre único
            var exists = await _context.SystemCredentials.AnyAsync(c => c.Name == request.Name);
            if (exists)
            {
                _logger.LogWarning("Intento de crear credencial de sistema con nombre duplicado: {Name}", request.Name);
                return null;
            }

            // Cifrar password usando formato enterprise
            var encryptedData = _cryptoService.EncryptWithEnterprise(request.Password, "SystemCredential");

            var credential = new SystemCredential
            {
                Name = request.Name,
                Description = request.Description,
                Username = request.Username,
                Domain = request.Domain,
                EncryptedPassword = encryptedData.CipherText,
                Salt = encryptedData.Salt,
                IV = encryptedData.IV,
                AuthTag = encryptedData.AuthTag,
                KeyId = encryptedData.KeyId,
                KeyVersion = encryptedData.KeyVersion,
                IsActive = true,
                CreatedAt = LocalClockAR.Now,
                CreatedByUserId = userId
            };

            _context.SystemCredentials.Add(credential);
            await _context.SaveChangesAsync();

            // Registrar auditoría
            await LogAuditAsync(credential.Id, "Created", $"Credencial '{request.Name}' creada", null, null, userId, userName);

            _logger.LogInformation("Credencial de sistema '{Name}' creada por {UserName}", request.Name, userName);

            return await GetByIdAsync(credential.Id);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear credencial de sistema: {Name}", request.Name);
            return null;
        }
    }

    public async Task<bool> UpdateAsync(int id, UpdateSystemCredentialRequest request, string userId, string? userName)
    {
        try
        {
            var credential = await _context.SystemCredentials.FindAsync(id);
            if (credential == null)
                return false;

            var changes = new List<string>();

            if (!string.IsNullOrEmpty(request.Name) && request.Name != credential.Name)
            {
                // Verificar nombre único
                var exists = await _context.SystemCredentials.AnyAsync(c => c.Name == request.Name && c.Id != id);
                if (exists)
                {
                    _logger.LogWarning("Intento de actualizar credencial con nombre duplicado: {Name}", request.Name);
                    return false;
                }
                changes.Add($"Nombre: {credential.Name} → {request.Name}");
                credential.Name = request.Name;
            }

            if (request.Description != null && request.Description != credential.Description)
            {
                changes.Add("Descripción actualizada");
                credential.Description = request.Description;
            }

            if (!string.IsNullOrEmpty(request.Username) && request.Username != credential.Username)
            {
                changes.Add($"Usuario: {credential.Username} → {request.Username}");
                credential.Username = request.Username;
            }

            if (request.Domain != credential.Domain)
            {
                changes.Add($"Dominio: {credential.Domain ?? "(vacío)"} → {request.Domain ?? "(vacío)"}");
                credential.Domain = request.Domain;
            }

            if (!string.IsNullOrEmpty(request.Password))
            {
                var encryptedData = _cryptoService.EncryptWithEnterprise(request.Password, "SystemCredential");
                credential.EncryptedPassword = encryptedData.CipherText;
                credential.Salt = encryptedData.Salt;
                credential.IV = encryptedData.IV;
                credential.AuthTag = encryptedData.AuthTag;
                credential.KeyId = encryptedData.KeyId;
                credential.KeyVersion = encryptedData.KeyVersion;
                changes.Add("Password actualizado");
            }

            if (request.IsActive.HasValue && request.IsActive.Value != credential.IsActive)
            {
                changes.Add($"Estado: {(credential.IsActive ? "Activa" : "Inactiva")} → {(request.IsActive.Value ? "Activa" : "Inactiva")}");
                credential.IsActive = request.IsActive.Value;
            }

            if (changes.Any())
            {
                credential.UpdatedAt = LocalClockAR.Now;
                credential.UpdatedByUserId = userId;
                await _context.SaveChangesAsync();

                await LogAuditAsync(id, "Updated", string.Join("; ", changes), null, null, userId, userName);
                _logger.LogInformation("Credencial de sistema '{Name}' actualizada por {UserName}: {Changes}", 
                    credential.Name, userName, string.Join("; ", changes));
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar credencial de sistema: {Id}", id);
            return false;
        }
    }

    public async Task<bool> DeleteAsync(int id, string userId, string? userName)
    {
        try
        {
            var credential = await _context.SystemCredentials
                .Include(c => c.Assignments)
                .FirstOrDefaultAsync(c => c.Id == id);

            if (credential == null)
                return false;

            var credentialName = credential.Name;

            // Eliminar asignaciones primero (por si cascade no funciona)
            _context.SystemCredentialAssignments.RemoveRange(credential.Assignments);
            _context.SystemCredentials.Remove(credential);
            await _context.SaveChangesAsync();

            await LogAuditAsync(id, "Deleted", $"Credencial '{credentialName}' eliminada", null, null, userId, userName);
            _logger.LogInformation("Credencial de sistema '{Name}' eliminada por {UserName}", credentialName, userName);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar credencial de sistema: {Id}", id);
            return false;
        }
    }

    // ==================== Asignaciones ====================

    public async Task<SystemCredentialAssignmentDto?> AddAssignmentAsync(
        int credentialId, 
        AddSystemCredentialAssignmentRequest request, 
        string userId, 
        string? userName)
    {
        try
        {
            var credential = await _context.SystemCredentials.FindAsync(credentialId);
            if (credential == null)
                return null;

            // Validar tipo de asignación
            var validTypes = new[] { 
                SystemCredentialAssignmentTypes.Server, 
                SystemCredentialAssignmentTypes.HostingSite,
                SystemCredentialAssignmentTypes.Environment,
                SystemCredentialAssignmentTypes.Pattern 
            };
            if (!validTypes.Contains(request.AssignmentType))
            {
                _logger.LogWarning("Tipo de asignación inválido: {Type}", request.AssignmentType);
                return null;
            }

            // Verificar que no exista una asignación duplicada
            var exists = await _context.SystemCredentialAssignments
                .AnyAsync(a => a.SystemCredentialId == credentialId && 
                              a.AssignmentType == request.AssignmentType && 
                              a.AssignmentValue == request.AssignmentValue);
            if (exists)
            {
                _logger.LogWarning("Asignación duplicada: {Type}={Value}", request.AssignmentType, request.AssignmentValue);
                return null;
            }

            var assignment = new SystemCredentialAssignment
            {
                SystemCredentialId = credentialId,
                AssignmentType = request.AssignmentType,
                AssignmentValue = request.AssignmentValue,
                Priority = request.Priority,
                CreatedAt = LocalClockAR.Now,
                CreatedByUserId = userId
            };

            _context.SystemCredentialAssignments.Add(assignment);
            await _context.SaveChangesAsync();

            await LogAuditAsync(credentialId, "AssignmentAdded", 
                $"Asignación agregada: {request.AssignmentType}={request.AssignmentValue} (prioridad {request.Priority})", 
                null, null, userId, userName);

            _logger.LogInformation("Asignación agregada a credencial {CredentialId}: {Type}={Value}", 
                credentialId, request.AssignmentType, request.AssignmentValue);

            // Cargar el usuario para el DTO
            await _context.Entry(assignment).Reference(a => a.CreatedByUser).LoadAsync();

            return MapAssignmentToDto(assignment);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar asignación a credencial {CredentialId}", credentialId);
            return null;
        }
    }

    public async Task<bool> RemoveAssignmentAsync(int credentialId, int assignmentId, string userId, string? userName)
    {
        try
        {
            var assignment = await _context.SystemCredentialAssignments
                .FirstOrDefaultAsync(a => a.Id == assignmentId && a.SystemCredentialId == credentialId);

            if (assignment == null)
                return false;

            var details = $"{assignment.AssignmentType}={assignment.AssignmentValue}";
            _context.SystemCredentialAssignments.Remove(assignment);
            await _context.SaveChangesAsync();

            await LogAuditAsync(credentialId, "AssignmentRemoved", $"Asignación eliminada: {details}", null, null, userId, userName);
            _logger.LogInformation("Asignación {AssignmentId} eliminada de credencial {CredentialId}", assignmentId, credentialId);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar asignación {AssignmentId}", assignmentId);
            return false;
        }
    }

    // ==================== Uso por servicios ====================

    public async Task<SystemCredentialForConnection?> GetCredentialForServerAsync(
        string serverName,
        string? instanceName = null,
        string? hostingSite = null,
        string? environment = null)
    {
        // Construir el nombre completo del servidor
        var fullServerName = string.IsNullOrEmpty(instanceName) 
            ? serverName 
            : $"{serverName}\\{instanceName}";

        // Obtener todas las asignaciones activas ordenadas por prioridad
        var assignments = await _context.SystemCredentialAssignments
            .Include(a => a.SystemCredential)
            .Where(a => a.SystemCredential != null && a.SystemCredential.IsActive)
            .OrderBy(a => a.Priority)
            .ToListAsync();

        // 1. Buscar por servidor exacto
        var serverMatch = assignments
            .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.Server &&
                                a.AssignmentValue.Equals(fullServerName, StringComparison.OrdinalIgnoreCase));
        
        if (serverMatch != null)
        {
            return await BuildCredentialForConnection(serverMatch.SystemCredential!, serverMatch);
        }

        // 2. Buscar por HostingSite
        if (!string.IsNullOrEmpty(hostingSite))
        {
            var hostingSiteMatch = assignments
                .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.HostingSite &&
                                    a.AssignmentValue.Equals(hostingSite, StringComparison.OrdinalIgnoreCase));
            
            if (hostingSiteMatch != null)
            {
                return await BuildCredentialForConnection(hostingSiteMatch.SystemCredential!, hostingSiteMatch);
            }
        }

        // 3. Buscar por Environment
        if (!string.IsNullOrEmpty(environment))
        {
            var envMatch = assignments
                .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.Environment &&
                                    a.AssignmentValue.Equals(environment, StringComparison.OrdinalIgnoreCase));
            
            if (envMatch != null)
            {
                return await BuildCredentialForConnection(envMatch.SystemCredential!, envMatch);
            }
        }

        // 4. Buscar por Pattern (regex)
        foreach (var assignment in assignments.Where(a => a.AssignmentType == SystemCredentialAssignmentTypes.Pattern))
        {
            try
            {
                var regex = new Regex(assignment.AssignmentValue, RegexOptions.IgnoreCase);
                if (regex.IsMatch(fullServerName))
                {
                    return await BuildCredentialForConnection(assignment.SystemCredential!, assignment);
                }
            }
            catch (RegexParseException ex)
            {
                _logger.LogWarning(ex, "Patrón regex inválido: {Pattern}", assignment.AssignmentValue);
            }
        }

        // No se encontró credencial asignada
        _logger.LogDebug("No se encontró credencial de sistema para servidor {ServerName} (HostingSite: {HostingSite}, Environment: {Environment})",
            fullServerName, hostingSite, environment);

        return null;
    }

    public async Task<string> BuildConnectionStringAsync(
        string instanceName,
        string? hostingSite = null,
        string? environment = null,
        string? database = "master",
        int timeoutSeconds = 30,
        string? applicationName = null)
    {
        // Separar servidor e instancia
        var parts = instanceName.Split('\\');
        var serverName = parts[0];
        var instName = parts.Length > 1 ? parts[1] : null;

        // Buscar credencial de sistema
        var credential = await GetCredentialForServerAsync(serverName, instName, hostingSite, environment);

        var appName = applicationName ?? "SQLGuardObservatory";

        if (credential != null)
        {
            // Usar credencial de sistema (SQL Authentication)
            _logger.LogDebug("Usando credencial de sistema '{CredentialName}' para {InstanceName} (match: {MatchType}={MatchValue})",
                credential.Name, instanceName, credential.MatchedAssignmentType, credential.MatchedAssignmentValue);

            var user = string.IsNullOrEmpty(credential.Domain) 
                ? credential.Username 
                : $"{credential.Domain}\\{credential.Username}";

            return $"Server={instanceName};Database={database};User Id={user};Password={credential.Password};TrustServerCertificate=True;Connect Timeout={timeoutSeconds};Application Name={appName}";
        }

        // Fallback: Windows Authentication
        _logger.LogDebug("Usando Windows Authentication para {InstanceName} (sin credencial de sistema asignada)", instanceName);
        return $"Server={instanceName};Database={database};Integrated Security=True;TrustServerCertificate=True;Connect Timeout={timeoutSeconds};Application Name={appName}";
    }

    public async Task<TestSystemCredentialConnectionResponse> TestConnectionAsync(
        int credentialId,
        TestSystemCredentialConnectionRequest request,
        string userId)
    {
        try
        {
            var credential = await _context.SystemCredentials
                .Include(c => c.Assignments)
                .FirstOrDefaultAsync(c => c.Id == credentialId);

            if (credential == null)
            {
                return new TestSystemCredentialConnectionResponse
                {
                    Success = false,
                    ErrorMessage = "Credencial no encontrada"
                };
            }

            // Descifrar password
            var password = _cryptoService.DecryptCredentialPassword(
                true, null, null, null,
                credential.EncryptedPassword,
                credential.Salt,
                credential.IV,
                credential.AuthTag,
                credential.KeyId,
                credential.KeyVersion);

            // Construir nombre de servidor/instancia
            string serverAddress;
            if (request.Port.HasValue)
            {
                // Con puerto explícito (RDS, Azure, etc.) - usar formato tcp:server,port
                serverAddress = $"tcp:{request.ServerName},{request.Port.Value}";
            }
            else if (!string.IsNullOrEmpty(request.InstanceName))
            {
                // Instancia nombrada local
                serverAddress = $"{request.ServerName}\\{request.InstanceName}";
            }
            else
            {
                // Servidor simple
                serverAddress = request.ServerName;
            }

            // Construir connection string
            var user = string.IsNullOrEmpty(credential.Domain)
                ? credential.Username
                : $"{credential.Domain}\\{credential.Username}";

            var connectionString = $"Server={serverAddress};Database=master;User Id={user};Password={password};TrustServerCertificate=True;Connect Timeout=30;Application Name=SQLNova-TestConnection;Encrypt=True";

            _logger.LogInformation("Intentando conexión a {ServerAddress} con credencial {CredentialId} ({CredentialName})", 
                serverAddress, credentialId, credential.Name);

            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            using var command = connection.CreateCommand();
            command.CommandText = "SELECT @@VERSION";
            var version = await command.ExecuteScalarAsync() as string;

            await LogAuditAsync(credentialId, "TestConnection", 
                $"Prueba de conexión exitosa a {serverAddress}", 
                serverAddress, "TestConnection", userId, null);

            return new TestSystemCredentialConnectionResponse
            {
                Success = true,
                SqlVersion = version?.Split('\n').FirstOrDefault()?.Trim(),
                CredentialUsed = credential.Name,
                MatchedAssignment = serverAddress
            };
        }
        catch (SqlException ex)
        {
            _logger.LogWarning(ex, "Error de SQL al probar conexión con credencial {CredentialId} a servidor {ServerAddress}", 
                credentialId, request.ServerName);
            
            var errorDetail = ex.Number == 10060 
                ? $"Timeout de red conectando a '{request.ServerName}'. Verifique que el servidor es accesible desde esta red y que el firewall/Security Group permite la conexión."
                : ex.Message;
            
            return new TestSystemCredentialConnectionResponse
            {
                Success = false,
                ErrorMessage = $"Error SQL ({ex.Number}): {errorDetail}"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al probar conexión con credencial {CredentialId}", credentialId);
            return new TestSystemCredentialConnectionResponse
            {
                Success = false,
                ErrorMessage = $"Error: {ex.Message}"
            };
        }
    }

    public async Task LogCredentialUsageAsync(
        int credentialId,
        string serverName,
        string serviceName,
        string? userId = null)
    {
        await LogAuditAsync(credentialId, "Used", $"Usado por {serviceName}", serverName, serviceName, userId, null);
    }

    // ==================== Reveal/Copy ====================

    public async Task<RevealSystemCredentialPasswordResponse?> RevealPasswordAsync(
        int credentialId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        try
        {
            var credential = await _context.SystemCredentials.FindAsync(credentialId);
            if (credential == null || !credential.IsActive)
            {
                _logger.LogWarning("Intento de revelar password de credencial inexistente o inactiva: {Id}", credentialId);
                return null;
            }

            // Descifrar password
            var password = _cryptoService.DecryptCredentialPassword(
                true, null, null, null,
                credential.EncryptedPassword,
                credential.Salt,
                credential.IV,
                credential.AuthTag,
                credential.KeyId,
                credential.KeyVersion);

            // Registrar auditoría
            await LogAuditWithDetailsAsync(
                credentialId, 
                "PasswordRevealed", 
                $"Password revelado para credencial '{credential.Name}'",
                null,
                "RevealPassword",
                userId, 
                userName,
                ipAddress,
                userAgent);

            _logger.LogInformation("Password revelado para credencial '{Name}' por usuario {UserId}", 
                credential.Name, userId);

            return new RevealSystemCredentialPasswordResponse
            {
                Password = password,
                Username = credential.Username,
                Domain = credential.Domain,
                CredentialName = credential.Name
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al revelar password de credencial {CredentialId}", credentialId);
            return null;
        }
    }

    public async Task<bool> RegisterPasswordCopyAsync(
        int credentialId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        try
        {
            var credential = await _context.SystemCredentials.FindAsync(credentialId);
            if (credential == null)
            {
                _logger.LogWarning("Intento de registrar copia de credencial inexistente: {Id}", credentialId);
                return false;
            }

            // Registrar auditoría
            await LogAuditWithDetailsAsync(
                credentialId, 
                "PasswordCopied", 
                $"Password copiado al portapapeles para credencial '{credential.Name}'",
                null,
                "CopyPassword",
                userId, 
                userName,
                ipAddress,
                userAgent);

            _logger.LogInformation("Password copiado para credencial '{Name}' por usuario {UserId}", 
                credential.Name, userId);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al registrar copia de credencial {CredentialId}", credentialId);
            return false;
        }
    }

    // ==================== Audit Logs ====================

    public async Task<List<SystemCredentialAuditLogDto>> GetAuditLogsAsync(int credentialId, int? limit = 50)
    {
        var query = @"
            SELECT TOP (@limit)
                al.Id,
                al.SystemCredentialId,
                sc.Name as CredentialName,
                al.Action,
                al.Details,
                al.ServerName,
                al.ServiceName,
                al.UserId,
                al.UserName,
                al.IpAddress,
                al.CreatedAt
            FROM SystemCredentialAuditLog al
            LEFT JOIN SystemCredentials sc ON al.SystemCredentialId = sc.Id
            WHERE al.SystemCredentialId = @credentialId
            ORDER BY al.CreatedAt DESC";

        var logs = new List<SystemCredentialAuditLogDto>();
        
        using var connection = new Microsoft.Data.SqlClient.SqlConnection(_context.Database.GetConnectionString());
        await connection.OpenAsync();
        
        using var command = new Microsoft.Data.SqlClient.SqlCommand(query, connection);
        command.Parameters.AddWithValue("@limit", limit ?? 50);
        command.Parameters.AddWithValue("@credentialId", credentialId);
        
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            logs.Add(MapAuditLogFromReader(reader));
        }
        
        return logs;
    }

    public async Task<List<SystemCredentialAuditLogDto>> GetAllAuditLogsAsync(int? limit = 100)
    {
        var query = @"
            SELECT TOP (@limit)
                al.Id,
                al.SystemCredentialId,
                sc.Name as CredentialName,
                al.Action,
                al.Details,
                al.ServerName,
                al.ServiceName,
                al.UserId,
                al.UserName,
                al.IpAddress,
                al.CreatedAt
            FROM SystemCredentialAuditLog al
            LEFT JOIN SystemCredentials sc ON al.SystemCredentialId = sc.Id
            ORDER BY al.CreatedAt DESC";

        var logs = new List<SystemCredentialAuditLogDto>();
        
        using var connection = new Microsoft.Data.SqlClient.SqlConnection(_context.Database.GetConnectionString());
        await connection.OpenAsync();
        
        using var command = new Microsoft.Data.SqlClient.SqlCommand(query, connection);
        command.Parameters.AddWithValue("@limit", limit ?? 100);
        
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            logs.Add(MapAuditLogFromReader(reader));
        }
        
        return logs;
    }

    private static SystemCredentialAuditLogDto MapAuditLogFromReader(Microsoft.Data.SqlClient.SqlDataReader reader)
    {
        return new SystemCredentialAuditLogDto
        {
            Id = reader.GetInt32(reader.GetOrdinal("Id")),
            SystemCredentialId = reader.GetInt32(reader.GetOrdinal("SystemCredentialId")),
            CredentialName = reader.IsDBNull(reader.GetOrdinal("CredentialName")) ? null : reader.GetString(reader.GetOrdinal("CredentialName")),
            Action = reader.GetString(reader.GetOrdinal("Action")),
            Details = reader.IsDBNull(reader.GetOrdinal("Details")) ? null : reader.GetString(reader.GetOrdinal("Details")),
            ServerName = reader.IsDBNull(reader.GetOrdinal("ServerName")) ? null : reader.GetString(reader.GetOrdinal("ServerName")),
            ServiceName = reader.IsDBNull(reader.GetOrdinal("ServiceName")) ? null : reader.GetString(reader.GetOrdinal("ServiceName")),
            UserId = reader.IsDBNull(reader.GetOrdinal("UserId")) ? null : reader.GetString(reader.GetOrdinal("UserId")),
            UserName = reader.IsDBNull(reader.GetOrdinal("UserName")) ? null : reader.GetString(reader.GetOrdinal("UserName")),
            IpAddress = reader.IsDBNull(reader.GetOrdinal("IpAddress")) ? null : reader.GetString(reader.GetOrdinal("IpAddress")),
            CreatedAt = reader.GetDateTime(reader.GetOrdinal("CreatedAt"))
        };
    }

    // ==================== Helpers ====================

    private async Task<SystemCredentialForConnection> BuildCredentialForConnection(
        SystemCredential credential,
        SystemCredentialAssignment assignment)
    {
        // Descifrar password
        var password = _cryptoService.DecryptCredentialPassword(
            true, null, null, null,
            credential.EncryptedPassword,
            credential.Salt,
            credential.IV,
            credential.AuthTag,
            credential.KeyId,
            credential.KeyVersion);

        return new SystemCredentialForConnection
        {
            Id = credential.Id,
            Name = credential.Name,
            Username = credential.Username,
            Domain = credential.Domain,
            Password = password,
            MatchedAssignmentType = assignment.AssignmentType,
            MatchedAssignmentValue = assignment.AssignmentValue
        };
    }

    private SystemCredentialDto MapToDto(SystemCredential credential)
    {
        return new SystemCredentialDto
        {
            Id = credential.Id,
            Name = credential.Name,
            Description = credential.Description,
            Username = credential.Username,
            Domain = credential.Domain,
            IsActive = credential.IsActive,
            CreatedAt = credential.CreatedAt,
            UpdatedAt = credential.UpdatedAt,
            CreatedByUserName = credential.CreatedByUser?.DisplayName ?? credential.CreatedByUser?.UserName,
            UpdatedByUserName = credential.UpdatedByUser?.DisplayName ?? credential.UpdatedByUser?.UserName,
            Assignments = credential.Assignments.Select(MapAssignmentToDto).ToList()
        };
    }

    private SystemCredentialAssignmentDto MapAssignmentToDto(SystemCredentialAssignment assignment)
    {
        return new SystemCredentialAssignmentDto
        {
            Id = assignment.Id,
            SystemCredentialId = assignment.SystemCredentialId,
            AssignmentType = assignment.AssignmentType,
            AssignmentValue = assignment.AssignmentValue,
            Priority = assignment.Priority,
            CreatedAt = assignment.CreatedAt,
            CreatedByUserName = assignment.CreatedByUser?.DisplayName ?? assignment.CreatedByUser?.UserName
        };
    }

    private async Task LogAuditAsync(
        int credentialId,
        string action,
        string? details,
        string? serverName,
        string? serviceName,
        string? userId,
        string? userName)
    {
        await LogAuditWithDetailsAsync(credentialId, action, details, serverName, serviceName, userId, userName, null, null);
    }

    private async Task LogAuditWithDetailsAsync(
        int credentialId,
        string action,
        string? details,
        string? serverName,
        string? serviceName,
        string? userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        try
        {
            // Usar SQL directo para insertar en la tabla de auditoría
            await _context.Database.ExecuteSqlRawAsync(@"
                INSERT INTO SystemCredentialAuditLog 
                (SystemCredentialId, Action, Details, ServerName, ServiceName, UserId, UserName, IpAddress, UserAgent, CreatedAt)
                VALUES (@p0, @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8, @p9)",
                credentialId, action, details, serverName, serviceName, userId, userName, ipAddress, userAgent, LocalClockAR.Now);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al registrar auditoría de credencial de sistema");
        }
    }
    
    // ==================== Batch Operations ====================
    
    /// <summary>
    /// Pre-carga todas las asignaciones de credenciales activas para uso en batch.
    /// Los passwords se descifran una sola vez para evitar accesos repetidos al DbContext.
    /// </summary>
    public async Task<PreloadedCredentialAssignments> PreloadAssignmentsAsync()
    {
        var stopwatch = System.Diagnostics.Stopwatch.StartNew();
        _logger.LogInformation("🔐 [0ms] PreloadAssignmentsAsync iniciado");
        
        var assignments = await _context.SystemCredentialAssignments
            .Include(a => a.SystemCredential)
            .Where(a => a.SystemCredential != null && a.SystemCredential.IsActive)
            .OrderBy(a => a.Priority)
            .ToListAsync();
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] Query completada, {Count} asignaciones encontradas", 
            stopwatch.ElapsedMilliseconds, assignments.Count);
        
        // Agrupar por credencial única para descifrar cada password UNA sola vez
        // Si una credencial tiene 147 asignaciones, solo la desciframos 1 vez
        var uniqueCredentials = assignments
            .GroupBy(a => a.SystemCredentialId)
            .Select(g => g.First().SystemCredential!)
            .ToList();
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] {UniqueCount} credenciales únicas de {TotalCount} asignaciones", 
            stopwatch.ElapsedMilliseconds, uniqueCredentials.Count, assignments.Count);
        
        // Descifrar cada credencial única en paralelo (PBKDF2 es thread-safe)
        var decryptTasks = uniqueCredentials.Select(credential => Task.Run(() =>
        {
            try
            {
                var password = _cryptoService.DecryptCredentialPassword(
                    true, null, null, null,
                    credential.EncryptedPassword,
                    credential.Salt,
                    credential.IV,
                    credential.AuthTag,
                    credential.KeyId,
                    credential.KeyVersion);
                
                return new { CredentialId = credential.Id, Password = password, Credential = credential };
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error descifrado credencial {CredentialId} durante pre-carga", credential.Id);
                return null;
            }
        })).ToList();
        
        var decryptedCredentials = await Task.WhenAll(decryptTasks);
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] Descifrado de {Count} credenciales únicas completado", 
            stopwatch.ElapsedMilliseconds, uniqueCredentials.Count);
        
        // Crear diccionario de passwords descifrados
        var passwordDict = decryptedCredentials
            .Where(d => d != null)
            .ToDictionary(d => d!.CredentialId, d => d!);
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] Diccionario creado con {Count} credenciales descifradas. Keys: {Keys}", 
            stopwatch.ElapsedMilliseconds, passwordDict.Count, string.Join(",", passwordDict.Keys.Take(10)));
        
        // Crear asignaciones usando los passwords ya descifrados
        var result = new PreloadedCredentialAssignments();
        int matched = 0, notMatched = 0;
        
        foreach (var assignment in assignments)
        {
            if (passwordDict.TryGetValue(assignment.SystemCredentialId, out var decrypted))
            {
                matched++;
                result.Assignments.Add(new PreloadedAssignment
                {
                    CredentialId = decrypted.Credential.Id,
                    CredentialName = decrypted.Credential.Name,
                    Username = decrypted.Credential.Username,
                    Domain = decrypted.Credential.Domain,
                    Password = decrypted.Password,
                    AssignmentType = assignment.AssignmentType,
                    AssignmentValue = assignment.AssignmentValue,
                    Priority = assignment.Priority
                });
            }
            else
            {
                notMatched++;
                _logger.LogWarning("🔐 Credencial {CredentialId} no encontrada en diccionario para asignación", 
                    assignment.SystemCredentialId);
            }
        }
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] Asignaciones procesadas: {Matched} OK, {NotMatched} sin match", 
            stopwatch.ElapsedMilliseconds, matched, notMatched);
        
        _logger.LogInformation("🔐 [{ElapsedMs}ms] PreloadAssignmentsAsync completado: {Count} asignaciones desde {UniqueCount} credenciales únicas", 
            stopwatch.ElapsedMilliseconds, result.Assignments.Count, uniqueCredentials.Count);
        return result;
    }
    
    /// <summary>
    /// Construye un connection string usando datos pre-cargados (thread-safe, no accede a DbContext)
    /// </summary>
    public string BuildConnectionStringFromPreloaded(
        PreloadedCredentialAssignments preloaded,
        string instanceName,
        string? hostingSite = null,
        string? environment = null,
        string? database = "master",
        int timeoutSeconds = 30,
        string? applicationName = null)
    {
        // Separar servidor e instancia
        var parts = instanceName.Split('\\');
        var serverName = parts[0];
        var instName = parts.Length > 1 ? parts[1] : null;
        var fullServerName = string.IsNullOrEmpty(instName) ? serverName : $"{serverName}\\{instName}";
        
        var appName = applicationName ?? "SQLGuardObservatory";
        
        // Buscar credencial apropiada (misma lógica que GetCredentialForServerAsync pero sin DbContext)
        PreloadedAssignment? matchedAssignment = null;
        
        // 1. Buscar por servidor exacto
        matchedAssignment = preloaded.Assignments
            .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.Server &&
                                a.AssignmentValue.Equals(fullServerName, StringComparison.OrdinalIgnoreCase));
        
        // 2. Buscar por HostingSite
        if (matchedAssignment == null && !string.IsNullOrEmpty(hostingSite))
        {
            matchedAssignment = preloaded.Assignments
                .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.HostingSite &&
                                    a.AssignmentValue.Equals(hostingSite, StringComparison.OrdinalIgnoreCase));
        }
        
        // 3. Buscar por Environment
        if (matchedAssignment == null && !string.IsNullOrEmpty(environment))
        {
            matchedAssignment = preloaded.Assignments
                .FirstOrDefault(a => a.AssignmentType == SystemCredentialAssignmentTypes.Environment &&
                                    a.AssignmentValue.Equals(environment, StringComparison.OrdinalIgnoreCase));
        }
        
        // 4. Buscar por Pattern (regex)
        if (matchedAssignment == null)
        {
            foreach (var assignment in preloaded.Assignments.Where(a => a.AssignmentType == SystemCredentialAssignmentTypes.Pattern))
            {
                try
                {
                    var regex = new Regex(assignment.AssignmentValue, RegexOptions.IgnoreCase);
                    if (regex.IsMatch(fullServerName))
                    {
                        matchedAssignment = assignment;
                        break;
                    }
                }
                catch (RegexParseException)
                {
                    // Ignorar patrones inválidos
                }
            }
        }
        
        // Construir connection string
        if (matchedAssignment != null)
        {
            var user = string.IsNullOrEmpty(matchedAssignment.Domain) 
                ? matchedAssignment.Username 
                : $"{matchedAssignment.Domain}\\{matchedAssignment.Username}";
            
            _logger.LogDebug("Usando credencial de sistema '{CredentialName}' para {InstanceName} (match: {MatchType}={MatchValue})",
                matchedAssignment.CredentialName, instanceName, matchedAssignment.AssignmentType, matchedAssignment.AssignmentValue);
            
            return $"Server={instanceName};Database={database};User Id={user};Password={matchedAssignment.Password};TrustServerCertificate=True;Connect Timeout={timeoutSeconds};Application Name={appName}";
        }
        
        // Fallback: Windows Authentication
        _logger.LogDebug("Usando Windows Authentication para {InstanceName} (sin credencial de sistema asignada)", instanceName);
        return $"Server={instanceName};Database={database};Integrated Security=True;TrustServerCertificate=True;Connect Timeout={timeoutSeconds};Application Name={appName}";
    }
}

