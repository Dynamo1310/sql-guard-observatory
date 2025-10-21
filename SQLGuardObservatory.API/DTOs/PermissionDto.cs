namespace SQLGuardObservatory.API.DTOs;

public class RolePermissionDto
{
    public string Role { get; set; } = string.Empty;
    public Dictionary<string, bool> Permissions { get; set; } = new();
}

public class UpdateRolePermissionsRequest
{
    public string Role { get; set; } = string.Empty;
    public Dictionary<string, bool> Permissions { get; set; } = new();
}

public class AvailableViewsDto
{
    public List<ViewInfo> Views { get; set; } = new();
    public List<string> Roles { get; set; } = new();
}

public class ViewInfo
{
    public string ViewName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
}

