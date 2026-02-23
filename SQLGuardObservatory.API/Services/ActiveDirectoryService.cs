using System.DirectoryServices.AccountManagement;
using System.Runtime.Versioning;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

[SupportedOSPlatform("windows")]
public class ActiveDirectoryService : IActiveDirectoryService
{
    private readonly ILogger<ActiveDirectoryService> _logger;
    private readonly IConfiguration _configuration;
    private readonly string _domainName;

    public ActiveDirectoryService(ILogger<ActiveDirectoryService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
        _domainName = _configuration["ActiveDirectory:Domain"] ?? "gscorp.ad";
    }

    public async Task<List<ActiveDirectoryUserDto>> GetGroupMembersAsync(string groupName)
    {
        return await Task.Run(() => GetGroupMembers(groupName));
    }

    private List<ActiveDirectoryUserDto> GetGroupMembers(string groupName)
    {
        var users = new List<ActiveDirectoryUserDto>();

        try
        {
            // Limpiar el nombre del grupo (remover GSCORP\ si existe)
            var cleanGroupName = groupName.Contains("\\") 
                ? groupName.Split('\\')[1] 
                : groupName;

            _logger.LogInformation($"Buscando miembros del grupo AD: {cleanGroupName}");

            // Conectar al dominio actual
            using var context = new PrincipalContext(ContextType.Domain, _domainName);
            
            // Buscar el grupo
            using var group = GroupPrincipal.FindByIdentity(context, IdentityType.SamAccountName, cleanGroupName);
            
            if (group == null)
            {
                _logger.LogWarning($"Grupo AD no encontrado: {cleanGroupName}");
                return users;
            }

            _logger.LogInformation($"Grupo encontrado: {group.Name}");

            // Obtener los miembros directos del grupo (sin recursividad en grupos anidados)
            var members = group.GetMembers(false); // false = solo miembros directos

            foreach (var member in members)
            {
                // Solo procesar usuarios (no grupos)
                if (member is UserPrincipal userPrincipal)
                {
                    try
                    {
                        users.Add(new ActiveDirectoryUserDto
                        {
                            SamAccountName = userPrincipal.SamAccountName ?? string.Empty,
                            DisplayName = userPrincipal.DisplayName ?? userPrincipal.Name ?? string.Empty,
                            Email = userPrincipal.EmailAddress ?? string.Empty,
                            DistinguishedName = userPrincipal.DistinguishedName ?? string.Empty
                        });
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning($"Error al procesar usuario {userPrincipal.SamAccountName}: {ex.Message}");
                    }
                }
                member.Dispose();
            }

            _logger.LogInformation($"Se encontraron {users.Count} usuarios en el grupo {cleanGroupName}");
        }
        catch (PrincipalServerDownException ex)
        {
            _logger.LogError($"No se pudo conectar al servidor de dominio: {ex.Message}");
            throw new Exception("No se pudo conectar al servidor de Active Directory. Verifica la conectividad de red.", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error al obtener miembros del grupo AD: {ex.Message}");
            throw new Exception($"Error al consultar Active Directory: {ex.Message}", ex);
        }

        return users.OrderBy(u => u.DisplayName).ToList();
    }

    public async Task<Dictionary<string, ActiveDirectoryUserDto?>> FindUsersByEmailAsync(List<string> emails)
    {
        return await Task.Run(() => FindUsersByEmail(emails));
    }

    private Dictionary<string, ActiveDirectoryUserDto?> FindUsersByEmail(List<string> emails)
    {
        var results = new Dictionary<string, ActiveDirectoryUserDto?>(StringComparer.OrdinalIgnoreCase);

        try
        {
            _logger.LogInformation("Buscando {Count} usuarios en AD por email", emails.Count);

            using var context = new PrincipalContext(ContextType.Domain, _domainName);

            foreach (var email in emails)
            {
                var trimmed = email.Trim();
                if (string.IsNullOrWhiteSpace(trimmed))
                    continue;

                if (results.ContainsKey(trimmed))
                    continue;

                try
                {
                    var adUser = FindUserByEmail(context, trimmed);
                    results[trimmed] = adUser;

                    if (adUser != null)
                        _logger.LogInformation("Email {Email} -> usuario AD {Sam}", trimmed, adUser.SamAccountName);
                    else
                        _logger.LogWarning("Email {Email} no encontrado en AD", trimmed);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error buscando email {Email} en AD", trimmed);
                    results[trimmed] = null;
                }
            }
        }
        catch (PrincipalServerDownException ex)
        {
            _logger.LogError(ex, "No se pudo conectar al servidor de dominio");
            throw new Exception("No se pudo conectar al servidor de Active Directory. Verifica la conectividad de red.", ex);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al buscar usuarios por email en AD");
            throw new Exception($"Error al consultar Active Directory: {ex.Message}", ex);
        }

        return results;
    }

    private ActiveDirectoryUserDto? FindUserByEmail(PrincipalContext context, string email)
    {
        // Intento 1: buscar por atributo mail (EmailAddress)
        using (var userPrincipal = new UserPrincipal(context) { EmailAddress = email })
        using (var searcher = new PrincipalSearcher(userPrincipal))
        {
            if (searcher.FindOne() is UserPrincipal result)
            {
                var dto = MapUserPrincipalToDto(result);
                result.Dispose();
                return dto;
            }
        }

        // Intento 2: buscar por UserPrincipalName (algunos usuarios tienen el email como UPN)
        using (var byUpn = UserPrincipal.FindByIdentity(context, IdentityType.UserPrincipalName, email))
        {
            if (byUpn != null)
                return MapUserPrincipalToDto(byUpn);
        }

        return null;
    }

    private static ActiveDirectoryUserDto MapUserPrincipalToDto(UserPrincipal user)
    {
        return new ActiveDirectoryUserDto
        {
            SamAccountName = user.SamAccountName ?? string.Empty,
            DisplayName = user.DisplayName ?? user.Name ?? string.Empty,
            Email = user.EmailAddress ?? string.Empty,
            DistinguishedName = user.DistinguishedName ?? string.Empty
        };
    }
}
