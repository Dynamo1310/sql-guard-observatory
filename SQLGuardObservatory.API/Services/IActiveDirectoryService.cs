namespace SQLGuardObservatory.API.Services;

public interface IActiveDirectoryService
{
    Task<(bool IsValid, string DisplayName)> ValidateCredentialsAsync(string domain, string username, string password);
}

