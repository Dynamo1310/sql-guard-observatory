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
}

