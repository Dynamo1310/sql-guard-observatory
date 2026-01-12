using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IAuthService
{
    Task<LoginResponse?> AuthenticateAsync(string username, string password);
    Task<LoginResponse?> AuthenticateWindowsUserAsync(string windowsIdentity);
    Task<List<UserDto>> GetUsersAsync();
    Task<UserDto?> GetUserByIdAsync(string userId);
    Task<UserDto?> GetUserByDomainUserAsync(string domainUser);
    Task<UserDto?> CreateUserAsync(CreateUserRequest request);
    Task<UserDto?> UpdateUserAsync(string userId, UpdateUserRequest request);
    Task<bool> DeleteUserAsync(string userId);
    Task<bool> ChangePasswordAsync(string userId, string currentPassword, string newPassword);

    // =============================================
    // Métodos de Foto de Perfil
    // =============================================

    /// <summary>
    /// Sube una foto de perfil para un usuario
    /// </summary>
    /// <param name="userId">ID del usuario</param>
    /// <param name="photoBytes">Bytes de la imagen</param>
    /// <returns>Resultado de la operación</returns>
    Task<ProfilePhotoSyncResponse> UploadUserPhotoAsync(string userId, byte[] photoBytes);

    /// <summary>
    /// Elimina la foto de perfil de un usuario
    /// </summary>
    Task<bool> DeleteUserPhotoAsync(string userId);
}

