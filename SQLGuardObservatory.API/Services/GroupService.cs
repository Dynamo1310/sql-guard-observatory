using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de grupos de seguridad
/// </summary>
public class GroupService : IGroupService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IActiveDirectoryService _activeDirectoryService;
    private readonly ILogger<GroupService> _logger;

    public GroupService(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        IActiveDirectoryService activeDirectoryService,
        ILogger<GroupService> logger)
    {
        _context = context;
        _userManager = userManager;
        _activeDirectoryService = activeDirectoryService;
        _logger = logger;
    }

    #region CRUD de Grupos

    public async Task<List<SecurityGroupDto>> GetAllGroupsAsync()
    {
        var groups = await _context.SecurityGroups
            .Where(g => !g.IsDeleted)
            .Include(g => g.Members)
            .Include(g => g.Permissions)
            .Include(g => g.ADSync)
            .Include(g => g.CreatedByUser)
            .OrderBy(g => g.Name)
            .ToListAsync();

        return groups.Select(g => new SecurityGroupDto
        {
            Id = g.Id,
            Name = g.Name,
            Description = g.Description,
            Color = g.Color,
            Icon = g.Icon,
            IsActive = g.IsActive,
            MemberCount = g.Members.Count,
            PermissionCount = g.Permissions.Count(p => p.Enabled),
            HasADSync = g.ADSync != null,
            ADGroupName = g.ADSync?.ADGroupName,
            CreatedAt = g.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            CreatedByUserName = g.CreatedByUser?.DisplayName
        }).ToList();
    }

    public async Task<SecurityGroupDetailDto?> GetGroupByIdAsync(int groupId)
    {
        var group = await _context.SecurityGroups
            .Where(g => g.Id == groupId && !g.IsDeleted)
            .Include(g => g.Members)
                .ThenInclude(m => m.User)
            .Include(g => g.Members)
                .ThenInclude(m => m.AddedByUser)
            .Include(g => g.Permissions)
            .Include(g => g.ADSync)
            .Include(g => g.CreatedByUser)
            .FirstOrDefaultAsync();

        if (group == null) return null;

        // Obtener roles de los miembros
        var memberDtos = new List<GroupMemberDto>();
        foreach (var member in group.Members)
        {
            var userRoles = member.User != null 
                ? await _userManager.GetRolesAsync(member.User) 
                : new List<string>();
            
            memberDtos.Add(new GroupMemberDto
            {
                UserId = member.UserId,
                DomainUser = member.User?.DomainUser ?? "",
                DisplayName = member.User?.DisplayName ?? "",
                Email = member.User?.Email,
                Role = userRoles.FirstOrDefault(),
                AddedAt = member.AddedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                AddedByUserName = member.AddedByUser?.DisplayName
            });
        }

        return new SecurityGroupDetailDto
        {
            Id = group.Id,
            Name = group.Name,
            Description = group.Description,
            Color = group.Color,
            Icon = group.Icon,
            IsActive = group.IsActive,
            MemberCount = group.Members.Count,
            PermissionCount = group.Permissions.Count(p => p.Enabled),
            HasADSync = group.ADSync != null,
            ADGroupName = group.ADSync?.ADGroupName,
            CreatedAt = group.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            CreatedByUserName = group.CreatedByUser?.DisplayName,
            UpdatedAt = group.UpdatedAt?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            Members = memberDtos,
            Permissions = group.Permissions.ToDictionary(p => p.ViewName, p => p.Enabled),
            ADSyncConfig = group.ADSync != null ? new ADSyncConfigDto
            {
                Id = group.ADSync.Id,
                GroupId = group.ADSync.GroupId,
                ADGroupName = group.ADSync.ADGroupName,
                AutoSync = group.ADSync.AutoSync,
                SyncIntervalHours = group.ADSync.SyncIntervalHours,
                LastSyncAt = group.ADSync.LastSyncAt?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                LastSyncResult = group.ADSync.LastSyncResult,
                LastSyncAddedCount = group.ADSync.LastSyncAddedCount,
                LastSyncRemovedCount = group.ADSync.LastSyncRemovedCount
            } : null
        };
    }

    public async Task<SecurityGroupDto?> CreateGroupAsync(CreateGroupRequest request, string createdByUserId)
    {
        // Verificar que no exista un grupo con el mismo nombre
        var existingGroup = await _context.SecurityGroups
            .FirstOrDefaultAsync(g => g.Name == request.Name && !g.IsDeleted);

        if (existingGroup != null)
        {
            _logger.LogWarning("Intento de crear grupo con nombre duplicado: {Name}", request.Name);
            return null;
        }

        var group = new SecurityGroup
        {
            Name = request.Name,
            Description = request.Description,
            Color = request.Color ?? "#3b82f6",
            Icon = request.Icon ?? "Users",
            IsActive = request.IsActive,
            CreatedByUserId = createdByUserId,
            CreatedAt = DateTime.UtcNow
        };

        _context.SecurityGroups.Add(group);
        await _context.SaveChangesAsync();

        // Agregar miembros iniciales si se especificaron
        if (request.InitialMemberIds?.Any() == true)
        {
            await AddMembersAsync(group.Id, request.InitialMemberIds, createdByUserId);
        }

        // Agregar permisos iniciales si se especificaron
        if (request.InitialPermissions?.Any() == true)
        {
            await UpdateGroupPermissionsAsync(group.Id, request.InitialPermissions);
        }

        _logger.LogInformation("Grupo '{Name}' creado por usuario {UserId}", request.Name, createdByUserId);

        return new SecurityGroupDto
        {
            Id = group.Id,
            Name = group.Name,
            Description = group.Description,
            Color = group.Color,
            Icon = group.Icon,
            IsActive = group.IsActive,
            MemberCount = request.InitialMemberIds?.Count ?? 0,
            PermissionCount = request.InitialPermissions?.Count(p => p.Value) ?? 0,
            HasADSync = false,
            CreatedAt = group.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")
        };
    }

    public async Task<SecurityGroupDto?> UpdateGroupAsync(int groupId, UpdateGroupRequest request, string updatedByUserId)
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Members)
            .Include(g => g.Permissions)
            .Include(g => g.ADSync)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return null;

        // Verificar que no exista otro grupo con el mismo nombre
        var duplicateName = await _context.SecurityGroups
            .AnyAsync(g => g.Id != groupId && g.Name == request.Name && !g.IsDeleted);

        if (duplicateName)
        {
            _logger.LogWarning("Intento de renombrar grupo a nombre duplicado: {Name}", request.Name);
            return null;
        }

        group.Name = request.Name;
        group.Description = request.Description;
        group.Color = request.Color;
        group.Icon = request.Icon;
        group.IsActive = request.IsActive;
        group.UpdatedAt = DateTime.UtcNow;
        group.UpdatedByUserId = updatedByUserId;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Grupo '{Name}' actualizado por usuario {UserId}", group.Name, updatedByUserId);

        return new SecurityGroupDto
        {
            Id = group.Id,
            Name = group.Name,
            Description = group.Description,
            Color = group.Color,
            Icon = group.Icon,
            IsActive = group.IsActive,
            MemberCount = group.Members.Count,
            PermissionCount = group.Permissions.Count(p => p.Enabled),
            HasADSync = group.ADSync != null,
            ADGroupName = group.ADSync?.ADGroupName,
            CreatedAt = group.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            UpdatedAt = group.UpdatedAt?.ToString("yyyy-MM-ddTHH:mm:ssZ")
        };
    }

    public async Task<bool> DeleteGroupAsync(int groupId)
    {
        var group = await _context.SecurityGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return false;

        // Soft delete
        group.IsDeleted = true;
        group.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Grupo '{Name}' eliminado (soft delete)", group.Name);

        return true;
    }

    #endregion

    #region Gestión de Miembros

    public async Task<List<GroupMemberDto>> GetGroupMembersAsync(int groupId)
    {
        var members = await _context.UserGroups
            .Where(ug => ug.GroupId == groupId)
            .Include(ug => ug.User)
            .Include(ug => ug.AddedByUser)
            .OrderBy(ug => ug.User!.DisplayName)
            .ToListAsync();

        var result = new List<GroupMemberDto>();
        foreach (var member in members)
        {
            if (member.User == null) continue;
            
            var userRoles = await _userManager.GetRolesAsync(member.User);
            result.Add(new GroupMemberDto
            {
                UserId = member.UserId,
                DomainUser = member.User.DomainUser ?? "",
                DisplayName = member.User.DisplayName ?? "",
                Email = member.User.Email,
                Role = userRoles.FirstOrDefault(),
                AddedAt = member.AddedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                AddedByUserName = member.AddedByUser?.DisplayName
            });
        }

        return result;
    }

    public async Task<bool> AddMembersAsync(int groupId, List<string> userIds, string addedByUserId)
    {
        var group = await _context.SecurityGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return false;

        var existingMemberIds = await _context.UserGroups
            .Where(ug => ug.GroupId == groupId)
            .Select(ug => ug.UserId)
            .ToListAsync();

        var newMembers = userIds
            .Where(id => !existingMemberIds.Contains(id))
            .Select(userId => new UserGroup
            {
                GroupId = groupId,
                UserId = userId,
                AddedAt = DateTime.UtcNow,
                AddedByUserId = addedByUserId
            })
            .ToList();

        if (newMembers.Any())
        {
            _context.UserGroups.AddRange(newMembers);
            await _context.SaveChangesAsync();

            _logger.LogInformation("{Count} miembros agregados al grupo {GroupId}", newMembers.Count, groupId);
        }

        return true;
    }

    public async Task<bool> RemoveMemberAsync(int groupId, string userId)
    {
        var membership = await _context.UserGroups
            .FirstOrDefaultAsync(ug => ug.GroupId == groupId && ug.UserId == userId);

        if (membership == null) return false;

        _context.UserGroups.Remove(membership);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Usuario {UserId} removido del grupo {GroupId}", userId, groupId);

        return true;
    }

    public async Task<List<AvailableUserDto>> GetAvailableUsersForGroupAsync(int groupId)
    {
        var memberIds = await _context.UserGroups
            .Where(ug => ug.GroupId == groupId)
            .Select(ug => ug.UserId)
            .ToListAsync();

        var users = await _userManager.Users
            .Where(u => u.IsActive)
            .OrderBy(u => u.DisplayName)
            .ToListAsync();

        var result = new List<AvailableUserDto>();
        foreach (var user in users)
        {
            var userRoles = await _userManager.GetRolesAsync(user);
            result.Add(new AvailableUserDto
            {
                UserId = user.Id,
                DomainUser = user.DomainUser ?? "",
                DisplayName = user.DisplayName ?? "",
                Email = user.Email,
                Role = userRoles.FirstOrDefault(),
                IsAlreadyMember = memberIds.Contains(user.Id)
            });
        }

        return result;
    }

    #endregion

    #region Permisos del Grupo

    public async Task<GroupPermissionDto?> GetGroupPermissionsAsync(int groupId)
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Permissions)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return null;

        return new GroupPermissionDto
        {
            GroupId = group.Id,
            GroupName = group.Name,
            Permissions = group.Permissions.ToDictionary(p => p.ViewName, p => p.Enabled)
        };
    }

    public async Task<bool> UpdateGroupPermissionsAsync(int groupId, Dictionary<string, bool> permissions)
    {
        var group = await _context.SecurityGroups
            .Include(g => g.Permissions)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return false;

        foreach (var (viewName, enabled) in permissions)
        {
            var existingPermission = group.Permissions.FirstOrDefault(p => p.ViewName == viewName);

            if (existingPermission != null)
            {
                existingPermission.Enabled = enabled;
                existingPermission.UpdatedAt = DateTime.UtcNow;
            }
            else
            {
                group.Permissions.Add(new GroupPermission
                {
                    GroupId = groupId,
                    ViewName = viewName,
                    Enabled = enabled,
                    CreatedAt = DateTime.UtcNow
                });
            }
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Permisos del grupo {GroupId} actualizados", groupId);

        return true;
    }

    public async Task<List<string>> GetUserGroupPermissionsAsync(string userId)
    {
        // Obtener todos los grupos activos del usuario
        var userGroupIds = await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Select(ug => ug.GroupId)
            .ToListAsync();

        if (!userGroupIds.Any())
            return new List<string>();

        // Obtener permisos habilitados de todos los grupos del usuario
        var permissions = await _context.GroupPermissions
            .Where(gp => userGroupIds.Contains(gp.GroupId) && gp.Enabled)
            .Join(_context.SecurityGroups.Where(g => g.IsActive && !g.IsDeleted),
                gp => gp.GroupId,
                g => g.Id,
                (gp, g) => gp.ViewName)
            .Distinct()
            .ToListAsync();

        return permissions;
    }

    #endregion

    #region Sincronización con AD

    public async Task<ADSyncConfigDto?> GetADSyncConfigAsync(int groupId)
    {
        var sync = await _context.ADGroupSyncs
            .FirstOrDefaultAsync(s => s.GroupId == groupId);

        if (sync == null) return null;

        return new ADSyncConfigDto
        {
            Id = sync.Id,
            GroupId = sync.GroupId,
            ADGroupName = sync.ADGroupName,
            AutoSync = sync.AutoSync,
            SyncIntervalHours = sync.SyncIntervalHours,
            LastSyncAt = sync.LastSyncAt?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            LastSyncResult = sync.LastSyncResult,
            LastSyncAddedCount = sync.LastSyncAddedCount,
            LastSyncRemovedCount = sync.LastSyncRemovedCount
        };
    }

    public async Task<bool> UpdateADSyncConfigAsync(int groupId, UpdateADSyncConfigRequest request, string updatedByUserId)
    {
        var group = await _context.SecurityGroups
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null) return false;

        var existingSync = await _context.ADGroupSyncs
            .FirstOrDefaultAsync(s => s.GroupId == groupId);

        if (existingSync != null)
        {
            existingSync.ADGroupName = request.ADGroupName;
            existingSync.AutoSync = request.AutoSync;
            existingSync.SyncIntervalHours = request.SyncIntervalHours;
            existingSync.UpdatedAt = DateTime.UtcNow;
            existingSync.UpdatedByUserId = updatedByUserId;
        }
        else
        {
            _context.ADGroupSyncs.Add(new ADGroupSync
            {
                GroupId = groupId,
                ADGroupName = request.ADGroupName,
                AutoSync = request.AutoSync,
                SyncIntervalHours = request.SyncIntervalHours,
                CreatedAt = DateTime.UtcNow,
                CreatedByUserId = updatedByUserId
            });
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Configuración AD sync del grupo {GroupId} actualizada", groupId);

        return true;
    }

    public async Task<ADSyncResultDto> ExecuteADSyncAsync(int groupId, string executedByUserId)
    {
        var result = new ADSyncResultDto
        {
            SyncedAt = DateTime.UtcNow.ToString("yyyy-MM-ddTHH:mm:ssZ")
        };

        try
        {
            var syncConfig = await _context.ADGroupSyncs
                .Include(s => s.Group)
                .FirstOrDefaultAsync(s => s.GroupId == groupId);

            if (syncConfig == null || syncConfig.Group == null)
            {
                result.Success = false;
                result.Message = "No se encontró configuración de sincronización AD para este grupo";
                return result;
            }

            // Obtener miembros del grupo AD
            var adMembers = await _activeDirectoryService.GetGroupMembersAsync(syncConfig.ADGroupName);

            if (!adMembers.Any())
            {
                result.Success = false;
                result.Message = $"No se encontraron miembros en el grupo AD '{syncConfig.ADGroupName}'";
                return result;
            }

            // Obtener miembros actuales del grupo en la app
            var currentMembers = await _context.UserGroups
                .Where(ug => ug.GroupId == groupId)
                .Include(ug => ug.User)
                .ToListAsync();

            var currentMemberDomainUsers = currentMembers
                .Where(m => m.User != null)
                .Select(m => m.User!.DomainUser?.ToUpper())
                .ToHashSet();

            var adMemberUsernames = adMembers
                .Select(m => m.SamAccountName.ToUpper())
                .ToHashSet();

            // Encontrar usuarios a agregar (están en AD pero no en el grupo)
            var usersToAdd = new List<string>();
            foreach (var adMember in adMembers)
            {
                var username = adMember.SamAccountName.ToUpper();
                if (!currentMemberDomainUsers.Contains(username))
                {
                    // Buscar si el usuario existe en la app
                    var appUser = await _userManager.Users
                        .FirstOrDefaultAsync(u => u.DomainUser != null && 
                            u.DomainUser.ToUpper() == username);

                    if (appUser != null)
                    {
                        usersToAdd.Add(appUser.Id);
                        result.AddedUsers.Add(adMember.DisplayName);
                    }
                    else
                    {
                        result.SkippedCount++;
                        _logger.LogDebug("Usuario AD {Username} no existe en la app, se omite", username);
                    }
                }
            }

            // Encontrar usuarios a remover (están en el grupo pero no en AD)
            var usersToRemove = new List<UserGroup>();
            foreach (var member in currentMembers)
            {
                if (member.User?.DomainUser != null)
                {
                    var domainUser = member.User.DomainUser.ToUpper();
                    if (!adMemberUsernames.Contains(domainUser))
                    {
                        usersToRemove.Add(member);
                        result.RemovedUsers.Add(member.User.DisplayName ?? domainUser);
                    }
                }
            }

            // Aplicar cambios
            if (usersToAdd.Any())
            {
                await AddMembersAsync(groupId, usersToAdd, executedByUserId);
                result.AddedCount = usersToAdd.Count;
            }

            if (usersToRemove.Any())
            {
                _context.UserGroups.RemoveRange(usersToRemove);
                await _context.SaveChangesAsync();
                result.RemovedCount = usersToRemove.Count;
            }

            // Actualizar registro de sincronización
            syncConfig.LastSyncAt = DateTime.UtcNow;
            syncConfig.LastSyncResult = "Success";
            syncConfig.LastSyncAddedCount = result.AddedCount;
            syncConfig.LastSyncRemovedCount = result.RemovedCount;
            syncConfig.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            result.Success = true;
            result.Message = $"Sincronización completada: {result.AddedCount} agregados, {result.RemovedCount} removidos, {result.SkippedCount} omitidos";

            _logger.LogInformation("Sincronización AD completada para grupo {GroupId}: {Message}", 
                groupId, result.Message);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Message = $"Error durante la sincronización: {ex.Message}";
            result.Errors.Add(ex.Message);

            _logger.LogError(ex, "Error en sincronización AD para grupo {GroupId}", groupId);

            // Actualizar registro con error
            var syncConfig = await _context.ADGroupSyncs.FirstOrDefaultAsync(s => s.GroupId == groupId);
            if (syncConfig != null)
            {
                syncConfig.LastSyncAt = DateTime.UtcNow;
                syncConfig.LastSyncResult = $"Error: {ex.Message}";
                await _context.SaveChangesAsync();
            }
        }

        return result;
    }

    public async Task<bool> RemoveADSyncConfigAsync(int groupId)
    {
        var sync = await _context.ADGroupSyncs
            .FirstOrDefaultAsync(s => s.GroupId == groupId);

        if (sync == null) return false;

        _context.ADGroupSyncs.Remove(sync);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Configuración AD sync removida del grupo {GroupId}", groupId);

        return true;
    }

    #endregion

    #region Membresías del Usuario

    public async Task<List<UserGroupMembershipDto>> GetUserGroupsAsync(string userId)
    {
        return await _context.UserGroups
            .Where(ug => ug.UserId == userId)
            .Include(ug => ug.Group)
            .Where(ug => ug.Group != null && !ug.Group.IsDeleted && ug.Group.IsActive)
            .Select(ug => new UserGroupMembershipDto
            {
                GroupId = ug.GroupId,
                GroupName = ug.Group!.Name,
                GroupColor = ug.Group.Color,
                GroupIcon = ug.Group.Icon,
                AddedAt = ug.AddedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")
            })
            .ToListAsync();
    }

    public async Task<List<UserWithGroupsDto>> GetUsersWithGroupsAsync()
    {
        var users = await _userManager.Users
            .OrderBy(u => u.DisplayName)
            .ToListAsync();

        var result = new List<UserWithGroupsDto>();

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            var groups = await GetUserGroupsAsync(user.Id);

            result.Add(new UserWithGroupsDto
            {
                Id = user.Id,
                DomainUser = user.DomainUser ?? "",
                DisplayName = user.DisplayName ?? "",
                Email = user.Email,
                Role = roles.FirstOrDefault() ?? "Reader",
                Active = user.IsActive,
                CreatedAt = user.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ"),
                Groups = groups
            });
        }

        return result;
    }

    #endregion
}

