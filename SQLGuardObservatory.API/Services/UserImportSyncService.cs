using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class UserImportSyncService : IUserImportSyncService
{
    private readonly ApplicationDbContext _context;
    private readonly IActiveDirectoryService _adService;
    private readonly IAuthService _authService;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ILogger<UserImportSyncService> _logger;

    public UserImportSyncService(
        ApplicationDbContext context,
        IActiveDirectoryService adService,
        IAuthService authService,
        UserManager<ApplicationUser> userManager,
        ILogger<UserImportSyncService> logger)
    {
        _context = context;
        _adService = adService;
        _authService = authService;
        _userManager = userManager;
        _logger = logger;
    }

    public async Task<List<UserImportSyncDto>> GetAllSyncsAsync()
    {
        var syncs = await _context.UserImportSyncs
            .Include(s => s.DefaultRole)
            .Where(s => s.IsActive)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();

        var result = new List<UserImportSyncDto>();
        foreach (var sync in syncs)
        {
            var managedCount = await _context.UserImportSyncMembers
                .CountAsync(m => m.SyncId == sync.Id && m.IsActive);

            result.Add(MapToDto(sync, managedCount));
        }

        return result;
    }

    public async Task<UserImportSyncDto?> GetSyncByIdAsync(int id)
    {
        var sync = await _context.UserImportSyncs
            .Include(s => s.DefaultRole)
            .FirstOrDefaultAsync(s => s.Id == id && s.IsActive);

        if (sync == null) return null;

        var managedCount = await _context.UserImportSyncMembers
            .CountAsync(m => m.SyncId == sync.Id && m.IsActive);

        return MapToDto(sync, managedCount);
    }

    public async Task<UserImportSyncDto?> CreateSyncAsync(
        string sourceType, string sourceIdentifier, string sourceDisplayName,
        string adGroupName, int? defaultRoleId, bool autoSync, int syncIntervalHours,
        List<string> initialSamAccountNames, string createdByUserId)
    {
        var existing = await _context.UserImportSyncs
            .FirstOrDefaultAsync(s => s.SourceIdentifier == sourceIdentifier && s.IsActive);

        if (existing != null)
        {
            _logger.LogWarning("Ya existe un sync activo para {Source}", sourceIdentifier);
            return null;
        }

        var sync = new UserImportSync
        {
            SourceType = sourceType,
            SourceIdentifier = sourceIdentifier,
            SourceDisplayName = sourceDisplayName,
            ADGroupName = adGroupName,
            DefaultRoleId = defaultRoleId,
            AutoSync = autoSync,
            SyncIntervalHours = syncIntervalHours,
            CreatedAt = DateTime.UtcNow,
            CreatedByUserId = createdByUserId
        };

        _context.UserImportSyncs.Add(sync);
        await _context.SaveChangesAsync();

        // Registrar los usuarios iniciales como miembros del sync
        foreach (var sam in initialSamAccountNames)
        {
            var user = await _userManager.Users
                .FirstOrDefaultAsync(u => u.DomainUser != null && u.DomainUser.ToUpper() == sam.ToUpper());

            if (user != null)
            {
                _context.UserImportSyncMembers.Add(new UserImportSyncMember
                {
                    SyncId = sync.Id,
                    UserId = user.Id,
                    SamAccountName = sam,
                    AddedAt = DateTime.UtcNow,
                    IsActive = true
                });
            }
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Sync creado: {Id} para {Source} con {Count} miembros iniciales",
            sync.Id, sourceIdentifier, initialSamAccountNames.Count);

        return await GetSyncByIdAsync(sync.Id);
    }

    public async Task<UserImportSyncDto?> UpdateSyncAsync(int id, UpdateUserImportSyncRequest request, string updatedByUserId)
    {
        var sync = await _context.UserImportSyncs.FirstOrDefaultAsync(s => s.Id == id && s.IsActive);
        if (sync == null) return null;

        sync.AutoSync = request.AutoSync;
        sync.SyncIntervalHours = request.SyncIntervalHours;
        if (request.DefaultRoleId.HasValue)
            sync.DefaultRoleId = request.DefaultRoleId;
        sync.UpdatedAt = DateTime.UtcNow;
        sync.UpdatedByUserId = updatedByUserId;

        await _context.SaveChangesAsync();

        _logger.LogInformation("Sync {Id} actualizado: AutoSync={Auto}, Interval={Hours}h",
            id, request.AutoSync, request.SyncIntervalHours);

        return await GetSyncByIdAsync(id);
    }

    public async Task<bool> DeleteSyncAsync(int id)
    {
        var sync = await _context.UserImportSyncs.FirstOrDefaultAsync(s => s.Id == id);
        if (sync == null) return false;

        sync.IsActive = false;
        sync.AutoSync = false;
        sync.UpdatedAt = DateTime.UtcNow;

        // Desactivar todos los miembros del sync
        var members = await _context.UserImportSyncMembers
            .Where(m => m.SyncId == id && m.IsActive)
            .ToListAsync();

        foreach (var member in members)
        {
            member.IsActive = false;
            member.RemovedAt = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Sync {Id} eliminado (soft delete)", id);
        return true;
    }

    public async Task<List<int>> GetPendingSyncIdsAsync()
    {
        var now = DateTime.UtcNow;

        return await _context.UserImportSyncs
            .Where(s => s.IsActive && s.AutoSync)
            .Where(s => s.LastSyncAt == null ||
                        s.LastSyncAt.Value.AddHours(s.SyncIntervalHours) <= now)
            .Select(s => s.Id)
            .ToListAsync();
    }

    public async Task<UserImportSyncExecuteResult> ExecuteSyncAsync(int syncId, string? executedByUserId)
    {
        var result = new UserImportSyncExecuteResult();

        try
        {
            var sync = await _context.UserImportSyncs
                .Include(s => s.DefaultRole)
                .FirstOrDefaultAsync(s => s.Id == syncId && s.IsActive);

            if (sync == null)
            {
                result.Success = false;
                result.Message = "Configuración de sincronización no encontrada";
                return result;
            }

            _logger.LogInformation("Ejecutando sync {Id} para DL {Source} (grupo AD: {Group})",
                syncId, sync.SourceIdentifier, sync.ADGroupName);

            // 1. Obtener miembros actuales de la DL desde AD
            var adMembers = await _adService.GetGroupMembersAsync(sync.ADGroupName);

            if (!adMembers.Any())
            {
                _logger.LogWarning("Sync {Id}: No se encontraron miembros en el grupo AD {Group}", syncId, sync.ADGroupName);
            }

            var adMembersBySam = adMembers.ToDictionary(m => m.SamAccountName.ToUpper(), m => m);

            // 2. Obtener miembros actuales del sync en la DB
            var currentSyncMembers = await _context.UserImportSyncMembers
                .Where(m => m.SyncId == syncId && m.IsActive)
                .ToListAsync();

            var currentSamSet = currentSyncMembers
                .Select(m => m.SamAccountName.ToUpper())
                .ToHashSet();

            // 3. Usuarios en AD que no están en el sync -> agregar
            foreach (var adMember in adMembers)
            {
                var samUpper = adMember.SamAccountName.ToUpper();
                if (currentSamSet.Contains(samUpper))
                    continue;

                try
                {
                    // Verificar si el usuario ya existe en la app
                    var existingUser = await _userManager.Users
                        .FirstOrDefaultAsync(u => u.DomainUser != null && u.DomainUser.ToUpper() == samUpper);

                    if (existingUser == null)
                    {
                        // Crear el usuario
                        var roleName = sync.DefaultRole?.Name ?? "Reader";
                        var createRequest = new CreateUserRequest
                        {
                            DomainUser = adMember.SamAccountName,
                            DisplayName = adMember.DisplayName,
                            Email = adMember.Email,
                            RoleId = sync.DefaultRoleId,
                            Role = roleName
                        };

                        var created = await _authService.CreateUserAsync(createRequest);
                        if (created == null)
                        {
                            result.Errors.Add($"{adMember.SamAccountName}: Error al crear usuario");
                            result.SkippedCount++;
                            continue;
                        }

                        existingUser = await _userManager.Users
                            .FirstOrDefaultAsync(u => u.DomainUser != null && u.DomainUser.ToUpper() == samUpper);

                        if (existingUser == null)
                        {
                            result.Errors.Add($"{adMember.SamAccountName}: Usuario creado pero no encontrado");
                            result.SkippedCount++;
                            continue;
                        }

                        result.AddedUsers.Add(adMember.DisplayName);
                        result.AddedCount++;
                    }
                    else
                    {
                        // Usuario existe pero no estaba en el sync tracking
                        // Si estaba desactivado, reactivarlo
                        if (!existingUser.IsActive)
                        {
                            existingUser.IsActive = true;
                            await _context.SaveChangesAsync();
                            result.AddedUsers.Add($"{adMember.DisplayName} (reactivado)");
                            result.AddedCount++;
                        }
                        else
                        {
                            result.SkippedCount++;
                        }
                    }

                    // Agregar al tracking
                    _context.UserImportSyncMembers.Add(new UserImportSyncMember
                    {
                        SyncId = syncId,
                        UserId = existingUser.Id,
                        SamAccountName = adMember.SamAccountName,
                        AddedAt = DateTime.UtcNow,
                        IsActive = true
                    });
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error procesando miembro {Sam} en sync {Id}", adMember.SamAccountName, syncId);
                    result.Errors.Add($"{adMember.SamAccountName}: {ex.Message}");
                    result.SkippedCount++;
                }
            }

            // 4. Miembros en el sync que ya no están en AD -> evaluar desactivación
            foreach (var syncMember in currentSyncMembers)
            {
                var samUpper = syncMember.SamAccountName.ToUpper();
                if (adMembersBySam.ContainsKey(samUpper))
                    continue;

                // Este miembro fue removido de la DL
                syncMember.IsActive = false;
                syncMember.RemovedAt = DateTime.UtcNow;

                // Verificar si es exclusivo de este sync
                var hasOtherActiveSyncs = await _context.UserImportSyncMembers
                    .AnyAsync(m => m.UserId == syncMember.UserId
                                   && m.SyncId != syncId
                                   && m.IsActive);

                if (!hasOtherActiveSyncs)
                {
                    // Verificar que no fue creado manualmente (tiene al menos un registro de sync)
                    var totalSyncRecords = await _context.UserImportSyncMembers
                        .CountAsync(m => m.UserId == syncMember.UserId);

                    // Solo desactivar si el usuario fue gestionado exclusivamente por syncs
                    if (totalSyncRecords > 0)
                    {
                        var user = await _userManager.FindByIdAsync(syncMember.UserId);
                        if (user != null && user.IsActive)
                        {
                            user.IsActive = false;
                            result.RemovedUsers.Add(user.DisplayName ?? syncMember.SamAccountName);
                            result.RemovedCount++;
                            _logger.LogInformation("Sync {Id}: Usuario {Sam} desactivado (exclusivo de este sync)",
                                syncId, syncMember.SamAccountName);
                        }
                    }
                }
                else
                {
                    _logger.LogInformation("Sync {Id}: Usuario {Sam} removido del tracking pero no desactivado (tiene otros syncs activos)",
                        syncId, syncMember.SamAccountName);
                }
            }

            await _context.SaveChangesAsync();

            // 5. Actualizar registro de sync
            sync.LastSyncAt = DateTime.UtcNow;
            sync.LastSyncResult = "Success";
            sync.LastSyncAddedCount = result.AddedCount;
            sync.LastSyncRemovedCount = result.RemovedCount;
            sync.LastSyncSkippedCount = result.SkippedCount;
            sync.UpdatedAt = DateTime.UtcNow;
            if (executedByUserId != null)
                sync.UpdatedByUserId = executedByUserId;

            await _context.SaveChangesAsync();

            result.Success = true;
            result.Message = $"Sincronización completada: {result.AddedCount} agregados, {result.RemovedCount} desactivados, {result.SkippedCount} omitidos";

            _logger.LogInformation("Sync {Id} completado: {Message}", syncId, result.Message);
        }
        catch (Exception ex)
        {
            result.Success = false;
            result.Message = $"Error durante la sincronización: {ex.Message}";
            result.Errors.Add(ex.Message);

            _logger.LogError(ex, "Error en sync {Id}", syncId);

            try
            {
                var sync = await _context.UserImportSyncs.FirstOrDefaultAsync(s => s.Id == syncId);
                if (sync != null)
                {
                    sync.LastSyncAt = DateTime.UtcNow;
                    sync.LastSyncResult = $"Error: {ex.Message}";
                    await _context.SaveChangesAsync();
                }
            }
            catch { /* best effort */ }
        }

        return result;
    }

    private static UserImportSyncDto MapToDto(UserImportSync sync, int managedUsersCount)
    {
        return new UserImportSyncDto
        {
            Id = sync.Id,
            SourceType = sync.SourceType,
            SourceIdentifier = sync.SourceIdentifier,
            SourceDisplayName = sync.SourceDisplayName,
            ADGroupName = sync.ADGroupName,
            DefaultRoleId = sync.DefaultRoleId,
            DefaultRoleName = sync.DefaultRole?.Name,
            AutoSync = sync.AutoSync,
            SyncIntervalHours = sync.SyncIntervalHours,
            LastSyncAt = sync.LastSyncAt?.ToString("yyyy-MM-ddTHH:mm:ssZ"),
            LastSyncResult = sync.LastSyncResult,
            LastSyncAddedCount = sync.LastSyncAddedCount,
            LastSyncRemovedCount = sync.LastSyncRemovedCount,
            LastSyncSkippedCount = sync.LastSyncSkippedCount,
            ManagedUsersCount = managedUsersCount,
            IsActive = sync.IsActive,
            CreatedAt = sync.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ssZ")
        };
    }
}
