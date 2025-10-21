using System.DirectoryServices.AccountManagement;
using System.Runtime.Versioning;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

[SupportedOSPlatform("windows")]
public class ActiveDirectoryService : IActiveDirectoryService
{
    private readonly ILogger<ActiveDirectoryService> _logger;

    public ActiveDirectoryService(ILogger<ActiveDirectoryService> logger)
    {
        _logger = logger;
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
            using var context = new PrincipalContext(ContextType.Domain, "gscorp.ad");
            
            // Buscar el grupo
            using var group = GroupPrincipal.FindByIdentity(context, IdentityType.SamAccountName, cleanGroupName);
            
            if (group == null)
            {
                _logger.LogWarning($"Grupo AD no encontrado: {cleanGroupName}");
                return users;
            }

            _logger.LogInformation($"Grupo encontrado: {group.Name}");

            // Obtener los miembros del grupo
            var members = group.GetMembers(true); // true = incluye grupos anidados

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
}

