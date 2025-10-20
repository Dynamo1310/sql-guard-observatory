using System.DirectoryServices.Protocols;
using System.Net;

namespace SQLGuardObservatory.API.Services;

public class ActiveDirectoryService : IActiveDirectoryService
{
    private readonly ILogger<ActiveDirectoryService> _logger;
    private readonly IConfiguration _configuration;

    public ActiveDirectoryService(ILogger<ActiveDirectoryService> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;
    }

    public async Task<(bool IsValid, string DisplayName)> ValidateCredentialsAsync(string domain, string username, string password)
    {
        return await Task.Run(() =>
        {
            try
            {
                // Configuración del dominio
                var ldapPath = _configuration["ActiveDirectory:LdapPath"] ?? "LDAP://gscorp.ad";
                var domainController = _configuration["ActiveDirectory:DomainController"] ?? "gscorp.ad";

                // Crear la conexión LDAP
                using (var connection = new LdapConnection(domainController))
                {
                    connection.SessionOptions.ProtocolVersion = 3;
                    connection.AuthType = AuthType.Basic;

                    // Intentar autenticar con las credenciales proporcionadas
                    var credential = new NetworkCredential($"{username}@{domainController}", password, domain);
                    connection.Bind(credential);

                    // Si llegamos aquí, las credenciales son válidas
                    // Ahora buscar el DisplayName del usuario
                    var displayName = GetUserDisplayName(connection, username, domainController);

                    _logger.LogInformation("Usuario {Username} autenticado exitosamente en AD", username);
                    
                    return (true, displayName ?? username);
                }
            }
            catch (LdapException ex)
            {
                _logger.LogWarning("Fallo de autenticación AD para usuario {Username}: {Error}", username, ex.Message);
                return (false, string.Empty);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al validar credenciales AD para usuario {Username}", username);
                return (false, string.Empty);
            }
        });
    }

    private string? GetUserDisplayName(LdapConnection connection, string username, string domainController)
    {
        try
        {
            var searchRequest = new SearchRequest(
                GetDomainDistinguishedName(domainController),
                $"(sAMAccountName={username})",
                SearchScope.Subtree,
                "displayName", "cn"
            );

            var searchResponse = (SearchResponse)connection.SendRequest(searchRequest);

            if (searchResponse?.Entries.Count > 0)
            {
                var entry = searchResponse.Entries[0];
                
                // Intentar obtener displayName
                if (entry.Attributes.Contains("displayName"))
                {
                    return entry.Attributes["displayName"][0]?.ToString();
                }
                
                // Si no hay displayName, intentar con cn
                if (entry.Attributes.Contains("cn"))
                {
                    return entry.Attributes["cn"][0]?.ToString();
                }
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo obtener el DisplayName para {Username}", username);
            return null;
        }
    }

    private string GetDomainDistinguishedName(string domain)
    {
        // Convertir "gscorp.ad" a "DC=gscorp,DC=ad"
        var parts = domain.Split('.');
        return string.Join(",", parts.Select(p => $"DC={p}"));
    }
}

