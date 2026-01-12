using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Authorization;

/// <summary>
/// Atributo para verificar que el usuario tenga una capacidad administrativa específica.
/// Las capacidades se definen en AdminRoleCapabilities.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public class RequireCapabilityAttribute : TypeFilterAttribute
{
    public RequireCapabilityAttribute(string capability) : base(typeof(RequireCapabilityFilter))
    {
        Arguments = new object[] { capability };
    }
}

public class RequireCapabilityFilter : IAsyncAuthorizationFilter
{
    private readonly string _capability;
    private readonly IAdminAuthorizationService _adminAuthService;
    private readonly ILogger<RequireCapabilityFilter> _logger;

    public RequireCapabilityFilter(
        string capability,
        IAdminAuthorizationService adminAuthService,
        ILogger<RequireCapabilityFilter> logger)
    {
        _capability = capability;
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

        // Verificar si tiene la capacidad
        var hasCapability = await _adminAuthService.HasCapabilityAsync(userId, _capability);
        
        if (!hasCapability)
        {
            _logger.LogWarning("Usuario {UserId} no tiene la capacidad {Capability}", userId, _capability);
            context.Result = new ForbidResult();
            return;
        }

        _logger.LogDebug("Usuario {UserId} tiene la capacidad {Capability}", userId, _capability);
    }
}




