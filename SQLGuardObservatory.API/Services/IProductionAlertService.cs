using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public interface IProductionAlertService
{
    Task<ProductionAlertConfig?> GetConfigAsync();
    Task<ProductionAlertConfig> CreateConfigAsync(CreateProductionAlertRequest request, string userId, string userDisplayName);
    Task<ProductionAlertConfig> UpdateConfigAsync(UpdateProductionAlertRequest request, string userId, string userDisplayName);
    Task<List<ProductionAlertHistory>> GetHistoryAsync(int limit = 20);
    Task<List<ProductionInstanceStatus>> GetConnectionStatusAsync();
    Task<bool> TestConnectionAsync(string instanceName);
    Task RunCheckAsync();
    Task<(bool success, string message, List<string>? instancesDown)> TestAlertAsync();
}

