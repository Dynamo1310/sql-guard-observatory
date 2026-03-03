using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IActiveDirectoryService
{
    /// <summary>
    /// Obtiene los miembros de un grupo de Active Directory
    /// </summary>
    /// <param name="groupName">Nombre del grupo (ej: GSCORP\SQL_admins o SQL_admins)</param>
    /// <returns>Lista de usuarios encontrados en el grupo</returns>
    Task<List<ActiveDirectoryUserDto>> GetGroupMembersAsync(string groupName);

    /// <summary>
    /// Busca usuarios en Active Directory por su dirección de correo electrónico.
    /// Intenta primero por el atributo mail, luego por UserPrincipalName como fallback.
    /// </summary>
    /// <param name="emails">Lista de correos electrónicos a buscar</param>
    /// <returns>Diccionario email -> ActiveDirectoryUserDto (null si no se encontró)</returns>
    Task<Dictionary<string, ActiveDirectoryUserDto?>> FindUsersByEmailAsync(List<string> emails);

    /// <summary>
    /// Busca una lista de distribución (grupo mail-enabled) en AD por su correo electrónico
    /// y retorna su información junto con los miembros.
    /// </summary>
    /// <param name="email">Correo electrónico de la lista de distribución</param>
    /// <returns>Información del grupo y sus miembros, o null si no se encontró</returns>
    Task<DistributionListSearchResult?> FindDistributionListByEmailAsync(string email);

    /// <summary>
    /// Busca usuarios en Active Directory por su sAMAccountName (ej: TB03260).
    /// </summary>
    /// <param name="samAccountNames">Lista de usernames a buscar</param>
    /// <returns>Diccionario username -> ActiveDirectoryUserDto (null si no se encontró)</returns>
    Task<Dictionary<string, ActiveDirectoryUserDto?>> FindUsersBySamAccountNameAsync(List<string> samAccountNames);

    /// <summary>
    /// Busca usuarios en AD con coincidencia parcial en sAMAccountName o DisplayName.
    /// Útil cuando el usuario escribe un fragmento como "TB" o "03260".
    /// </summary>
    /// <param name="query">Texto parcial a buscar</param>
    /// <param name="maxResults">Máximo de resultados a retornar (default 10)</param>
    /// <returns>Lista de usuarios que coinciden parcialmente</returns>
    Task<List<ActiveDirectoryUserDto>> SearchUsersByPartialMatchAsync(string query, int maxResults = 10);
}

