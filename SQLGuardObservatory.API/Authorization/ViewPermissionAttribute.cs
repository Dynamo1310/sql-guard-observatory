using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Authorization;

/// <summary>
/// Atributo para excluir un método específico de la verificación de ViewPermission.
/// Usar en métodos que deben estar disponibles para todos los usuarios autenticados.
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public class BypassViewPermissionAttribute : Attribute
{
}

/// <summary>
/// Atributo para verificar permisos de vista basados en grupos.
/// Verifica que el usuario tenga acceso a la vista especificada a través de sus grupos.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class ViewPermissionAttribute : TypeFilterAttribute
{
    public ViewPermissionAttribute(string viewName) : base(typeof(ViewPermissionFilter))
    {
        Arguments = new object[] { viewName };
    }
}

public class ViewPermissionFilter : IAsyncAuthorizationFilter
{
    private readonly string _viewName;
    private readonly IGroupService _groupService;
    private readonly IAdminAuthorizationService _adminAuthService;
    private readonly ILogger<ViewPermissionFilter> _logger;

    public ViewPermissionFilter(
        string viewName,
        IGroupService groupService,
        IAdminAuthorizationService adminAuthService,
        ILogger<ViewPermissionFilter> logger)
    {
        _viewName = viewName;
        _groupService = groupService;
        _adminAuthService = adminAuthService;
        _logger = logger;
    }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        // Verificar si el método tiene [BypassViewPermission]
        var endpoint = context.HttpContext.GetEndpoint();
        var bypassAttribute = endpoint?.Metadata.GetMetadata<BypassViewPermissionAttribute>();
        if (bypassAttribute != null)
        {
            return; // Omitir verificación de permisos
        }

        var user = context.HttpContext.User;
        
        if (!user.Identity?.IsAuthenticated ?? true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var userId = user.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userId))
        {
            _logger.LogWarning("No se pudo obtener el ID del usuario del token");
            context.Result = new UnauthorizedResult();
            return;
        }

        // SuperAdmin tiene acceso a todo
        var userAuth = await _adminAuthService.GetUserAuthorizationAsync(userId);
        if (userAuth.IsSuperAdmin)
        {
            return; // Permitir acceso
        }

        // Verificar permisos de grupo
        var userPermissions = await _groupService.GetUserGroupPermissionsAsync(userId);
        
        if (!userPermissions.Contains(_viewName))
        {
            _logger.LogWarning("Usuario {UserId} no tiene permiso para la vista {ViewName}. Permisos: {Permissions}", 
                userId, _viewName, string.Join(", ", userPermissions));
            context.Result = new ForbidResult();
            return;
        }

        _logger.LogDebug("Usuario {UserId} tiene acceso a la vista {ViewName}", userId, _viewName);
    }
}

