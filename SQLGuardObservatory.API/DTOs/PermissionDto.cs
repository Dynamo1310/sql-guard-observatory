namespace SQLGuardObservatory.API.DTOs;

// Los permisos ahora se manejan solo mediante grupos de seguridad

public class AvailableViewsDto
{
    public List<ViewInfo> Views { get; set; } = new();
    public List<string> Roles { get; set; } = new(); // Deprecado - ya no se usan roles para permisos
}

public class ViewInfo
{
    public string ViewName { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
}
