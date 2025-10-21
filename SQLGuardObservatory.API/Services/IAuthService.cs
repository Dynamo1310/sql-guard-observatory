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
}

