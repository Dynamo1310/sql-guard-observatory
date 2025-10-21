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
}

