using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IUserImportSyncService
{
    Task<List<UserImportSyncDto>> GetAllSyncsAsync();
    Task<UserImportSyncDto?> GetSyncByIdAsync(int id);
    Task<UserImportSyncDto?> CreateSyncAsync(
        string sourceType, string sourceIdentifier, string sourceDisplayName,
        string adGroupName, int? defaultRoleId, bool autoSync, int syncIntervalHours,
        List<string> initialSamAccountNames, string createdByUserId);
    Task<UserImportSyncDto?> UpdateSyncAsync(int id, UpdateUserImportSyncRequest request, string updatedByUserId);
    Task<bool> DeleteSyncAsync(int id);
    Task<UserImportSyncExecuteResult> ExecuteSyncAsync(int syncId, string? executedByUserId);
    Task<List<int>> GetPendingSyncIdsAsync();
}
