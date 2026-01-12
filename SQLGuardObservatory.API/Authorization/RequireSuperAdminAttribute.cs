using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Authorization;

/// <summary>
/// Atributo para verificar que el usuario sea SuperAdmin.
/// Verifica el AdminRole del usuario, no el rol de Identity.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
public class RequireSuperAdminAttribute : TypeFilterAttribute
{
    public RequireSuperAdminAttribute() : base(typeof(RequireSuperAdminFilter))
    {
    }
}

public class RequireSuperAdminFilter : IAsyncAuthorizationFilter
{
    private readonly IAdminAuthorizationService _adminAuthService;
    private readonly ILogger<RequireSuperAdminFilter> _logger;

    public RequireSuperAdminFilter(
        IAdminAuthorizationService adminAuthService,
        ILogger<RequireSuperAdminFilter> logger)
    {
        _adminAuthService = adminAuthService;
        _logger = logger;
    }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
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

        // Verificar si es SuperAdmin usando AdminRole
        var userAuth = await _adminAuthService.GetUserAuthorizationAsync(userId);
        
        if (!userAuth.IsSuperAdmin)
        {
            _logger.LogWarning("Usuario {UserId} no es SuperAdmin. Rol: {Role}", userId, userAuth.RoleName);
            context.Result = new ForbidResult();
            return;
        }

        _logger.LogDebug("Usuario {UserId} es SuperAdmin, acceso permitido", userId);
    }
}




