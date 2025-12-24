using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para gestión de grupos de seguridad
/// </summary>
public interface IGroupService
{
    // CRUD de grupos
    Task<List<SecurityGroupDto>> GetAllGroupsAsync();
    Task<SecurityGroupDetailDto?> GetGroupByIdAsync(int groupId);
    Task<SecurityGroupDto?> CreateGroupAsync(CreateGroupRequest request, string createdByUserId);
    Task<SecurityGroupDto?> UpdateGroupAsync(int groupId, UpdateGroupRequest request, string updatedByUserId);
    Task<bool> DeleteGroupAsync(int groupId);
    
    // Gestión de miembros
    Task<List<GroupMemberDto>> GetGroupMembersAsync(int groupId);
    Task<bool> AddMembersAsync(int groupId, List<string> userIds, string addedByUserId);
    Task<bool> RemoveMemberAsync(int groupId, string userId);
    Task<List<AvailableUserDto>> GetAvailableUsersForGroupAsync(int groupId);
    
    // Permisos del grupo
    Task<GroupPermissionDto?> GetGroupPermissionsAsync(int groupId);
    Task<bool> UpdateGroupPermissionsAsync(int groupId, Dictionary<string, bool> permissions);
    Task<List<string>> GetUserGroupPermissionsAsync(string userId);
    
    // Sincronización con AD
    Task<ADSyncConfigDto?> GetADSyncConfigAsync(int groupId);
    Task<bool> UpdateADSyncConfigAsync(int groupId, UpdateADSyncConfigRequest request, string updatedByUserId);
    Task<ADSyncResultDto> ExecuteADSyncAsync(int groupId, string executedByUserId);
    Task<bool> RemoveADSyncConfigAsync(int groupId);
    
    // Membresías del usuario
    Task<List<UserGroupMembershipDto>> GetUserGroupsAsync(string userId);
    Task<List<UserWithGroupsDto>> GetUsersWithGroupsAsync();
}

