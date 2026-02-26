using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una capacidad/permiso asignado a un rol administrativo.
/// Las capacidades son granulares y definen exactamente qué puede hacer un rol.
/// </summary>
public class AdminRoleCapability
{
    public int Id { get; set; }

    /// <summary>
    /// ID del rol al que pertenece esta capacidad
    /// </summary>
    public int RoleId { get; set; }
    public AdminRole Role { get; set; } = null!;

    /// <summary>
    /// Clave única de la capacidad (ej: "Users.Create", "Groups.ManageMembers")
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string CapabilityKey { get; set; } = string.Empty;

    /// <summary>
    /// Indica si la capacidad está habilitada para este rol
    /// </summary>
    public bool IsEnabled { get; set; } = true;
}

/// <summary>
/// Definiciones estáticas de todas las capacidades disponibles en el sistema
/// </summary>
public static class CapabilityDefinitions
{
    // ==================== USUARIOS ====================
    public const string UsersView = "Users.View";
    public const string UsersCreate = "Users.Create";
    public const string UsersEdit = "Users.Edit";
    public const string UsersDelete = "Users.Delete";
    public const string UsersImportFromAD = "Users.ImportFromAD";
    public const string UsersAssignRoles = "Users.AssignRoles";

    // ==================== GRUPOS DE SEGURIDAD ====================
    public const string GroupsView = "Groups.View";
    public const string GroupsCreate = "Groups.Create";
    public const string GroupsEdit = "Groups.Edit";
    public const string GroupsDelete = "Groups.Delete";
    public const string GroupsManageMembers = "Groups.ManageMembers";
    public const string GroupsManagePermissions = "Groups.ManagePermissions";
    public const string GroupsSyncWithAD = "Groups.SyncWithAD";

    // ==================== ROLES ====================
    public const string RolesView = "Roles.View";
    public const string RolesCreate = "Roles.Create";
    public const string RolesEdit = "Roles.Edit";
    public const string RolesDelete = "Roles.Delete";
    public const string RolesAssignCapabilities = "Roles.AssignCapabilities";

    // ==================== PARCHEOS ====================
    public const string PatchingConfigureCompliance = "Patching.ConfigureCompliance";

    // ==================== GUARDIAS DBA ====================
    public const string OnCallManageOperators = "OnCall.ManageOperators";
    public const string OnCallGenerateCalendar = "OnCall.GenerateCalendar";
    public const string OnCallCreateActivations = "OnCall.CreateActivations";

    // ==================== SISTEMA ====================
    public const string SystemConfigureSMTP = "System.ConfigureSMTP";
    public const string SystemConfigureCollectors = "System.ConfigureCollectors";
    public const string SystemConfigureAlerts = "System.ConfigureAlerts";
    public const string SystemManageCredentials = "System.ManageCredentials";
    public const string SystemViewAudit = "System.ViewAudit";
    public const string SystemManageMenuBadges = "System.ManageMenuBadges";
    public const string SystemManageLogs = "System.ManageLogs";

    /// <summary>
    /// Obtiene todas las capacidades disponibles agrupadas por categoría
    /// </summary>
    public static Dictionary<string, List<CapabilityInfo>> GetAllCapabilities()
    {
        return new Dictionary<string, List<CapabilityInfo>>
        {
            ["Usuarios"] = new List<CapabilityInfo>
            {
                new(UsersView, "Ver usuarios", "Ver la lista de usuarios del sistema"),
                new(UsersCreate, "Crear usuarios", "Agregar nuevos usuarios al sistema"),
                new(UsersEdit, "Editar usuarios", "Modificar datos de usuarios existentes"),
                new(UsersDelete, "Eliminar usuarios", "Eliminar usuarios del sistema"),
                new(UsersImportFromAD, "Importar desde AD", "Importar usuarios desde grupos de Active Directory"),
                new(UsersAssignRoles, "Asignar roles", "Cambiar el rol de los usuarios")
            },
            ["Grupos de Seguridad"] = new List<CapabilityInfo>
            {
                new(GroupsView, "Ver grupos", "Ver la lista de grupos de seguridad"),
                new(GroupsCreate, "Crear grupos", "Crear nuevos grupos de seguridad"),
                new(GroupsEdit, "Editar grupos", "Modificar nombre, descripción y configuración de grupos"),
                new(GroupsDelete, "Eliminar grupos", "Eliminar grupos de seguridad"),
                new(GroupsManageMembers, "Gestionar miembros", "Agregar y quitar usuarios de grupos"),
                new(GroupsManagePermissions, "Gestionar permisos", "Modificar permisos de vistas de los grupos"),
                new(GroupsSyncWithAD, "Sincronizar con AD", "Configurar y ejecutar sincronización con Active Directory")
            },
            ["Roles"] = new List<CapabilityInfo>
            {
                new(RolesView, "Ver roles", "Ver la lista de roles administrativos"),
                new(RolesCreate, "Crear roles", "Crear nuevos roles personalizados"),
                new(RolesEdit, "Editar roles", "Modificar roles existentes"),
                new(RolesDelete, "Eliminar roles", "Eliminar roles personalizados"),
                new(RolesAssignCapabilities, "Asignar capacidades", "Modificar las capacidades de los roles")
            },
            ["Parcheos"] = new List<CapabilityInfo>
            {
                new(PatchingConfigureCompliance, "Configurar Compliance", "Crear, editar y eliminar configuraciones de compliance de parcheos")
            },
            ["Guardias DBA"] = new List<CapabilityInfo>
            {
                new(OnCallManageOperators, "Gestionar Operadores", "Ver y gestionar operadores de guardia en el planificador"),
                new(OnCallGenerateCalendar, "Generar Calendario", "Generar el calendario de guardias automáticamente"),
                new(OnCallCreateActivations, "Crear Activaciones", "Crear activaciones clickeando en el calendario de guardias")
            },
            ["Sistema"] = new List<CapabilityInfo>
            {
                new(SystemConfigureSMTP, "Configurar SMTP", "Configurar el servidor de correo electrónico"),
                new(SystemConfigureCollectors, "Configurar Collectors", "Configurar los colectores de HealthScore"),
                new(SystemConfigureAlerts, "Configurar alertas", "Configurar las alertas del sistema"),
                new(SystemManageCredentials, "Gestionar credenciales", "Gestionar credenciales de sistema"),
                new(SystemViewAudit, "Ver auditoría", "Ver logs de auditoría del sistema"),
                new(SystemManageMenuBadges, "Gestionar indicadores", "Gestionar indicadores de menú (badges)"),
                new(SystemManageLogs, "Gestionar Logs API", "Ver y gestionar los logs del backend")
            }
        };
    }

    /// <summary>
    /// Obtiene una lista plana de todas las claves de capacidades
    /// </summary>
    public static List<string> GetAllCapabilityKeys()
    {
        return GetAllCapabilities()
            .SelectMany(g => g.Value.Select(c => c.Key))
            .ToList();
    }
}

/// <summary>
/// Información descriptiva de una capacidad
/// </summary>
public record CapabilityInfo(string Key, string Name, string Description);

