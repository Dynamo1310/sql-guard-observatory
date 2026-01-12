/**
 * Definiciones de capacidades administrativas.
 * Estas deben coincidir con las definidas en el backend (CapabilityDefinitions.cs)
 */
export const Capabilities = {
  // === Usuarios ===
  /** Ver la lista de usuarios del sistema */
  UsersView: 'Users.View',
  /** Crear nuevos usuarios */
  UsersCreate: 'Users.Create',
  /** Editar usuarios existentes */
  UsersEdit: 'Users.Edit',
  /** Eliminar usuarios */
  UsersDelete: 'Users.Delete',
  /** Importar usuarios desde AD */
  UsersImportFromAD: 'Users.ImportFromAD',
  /** Asignar roles a usuarios */
  UsersAssignRoles: 'Users.AssignRoles',

  // === Grupos de Seguridad ===
  /** Ver grupos de seguridad */
  GroupsView: 'Groups.View',
  /** Crear grupos */
  GroupsCreate: 'Groups.Create',
  /** Editar grupos */
  GroupsEdit: 'Groups.Edit',
  /** Eliminar grupos */
  GroupsDelete: 'Groups.Delete',
  /** Gestionar miembros de grupos */
  GroupsManageMembers: 'Groups.ManageMembers',
  /** Gestionar permisos de grupos */
  GroupsManagePermissions: 'Groups.ManagePermissions',
  /** Sincronizar grupos con AD */
  GroupsSyncWithAD: 'Groups.SyncWithAD',

  // === Roles ===
  /** Ver roles administrativos */
  RolesView: 'Roles.View',
  /** Crear roles */
  RolesCreate: 'Roles.Create',
  /** Editar roles */
  RolesEdit: 'Roles.Edit',
  /** Eliminar roles */
  RolesDelete: 'Roles.Delete',
  /** Asignar capacidades a roles */
  RolesAssignCapabilities: 'Roles.AssignCapabilities',

  // === Parcheos ===
  /** Configurar compliance de parcheos */
  PatchingConfigureCompliance: 'Patching.ConfigureCompliance',

  // === Sistema ===
  /** Configurar SMTP */
  SystemConfigureSMTP: 'System.ConfigureSMTP',
  /** Configurar Collectors */
  SystemConfigureCollectors: 'System.ConfigureCollectors',
  /** Configurar alertas */
  SystemConfigureAlerts: 'System.ConfigureAlerts',
  /** Gestionar credenciales de sistema */
  SystemManageCredentials: 'System.ManageCredentials',
  /** Ver auditoría / logs */
  SystemViewAudit: 'System.ViewAudit',
  /** Gestionar badges de menú */
  SystemManageMenuBadges: 'System.ManageMenuBadges',
  /** Gestionar logs de API */
  SystemManageLogs: 'System.ManageLogs',
} as const;

export type CapabilityKey = typeof Capabilities[keyof typeof Capabilities];

/**
 * Información de capacidades para mostrar en la UI
 */
export const CapabilityInfo: Record<string, { label: string; description: string; category: string }> = {
  // Usuarios
  [Capabilities.UsersView]: {
    label: 'Ver usuarios',
    description: 'Ver la lista de usuarios del sistema',
    category: 'Usuarios',
  },
  [Capabilities.UsersCreate]: {
    label: 'Crear usuarios',
    description: 'Agregar nuevos usuarios al sistema',
    category: 'Usuarios',
  },
  [Capabilities.UsersEdit]: {
    label: 'Editar usuarios',
    description: 'Modificar datos de usuarios existentes',
    category: 'Usuarios',
  },
  [Capabilities.UsersDelete]: {
    label: 'Eliminar usuarios',
    description: 'Eliminar usuarios del sistema',
    category: 'Usuarios',
  },
  [Capabilities.UsersImportFromAD]: {
    label: 'Importar desde AD',
    description: 'Importar usuarios desde grupos de Active Directory',
    category: 'Usuarios',
  },
  [Capabilities.UsersAssignRoles]: {
    label: 'Asignar roles',
    description: 'Cambiar el rol de los usuarios',
    category: 'Usuarios',
  },

  // Grupos
  [Capabilities.GroupsView]: {
    label: 'Ver grupos',
    description: 'Ver la lista de grupos de seguridad',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsCreate]: {
    label: 'Crear grupos',
    description: 'Crear nuevos grupos de seguridad',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsEdit]: {
    label: 'Editar grupos',
    description: 'Modificar nombre, descripción y configuración de grupos',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsDelete]: {
    label: 'Eliminar grupos',
    description: 'Eliminar grupos de seguridad',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsManageMembers]: {
    label: 'Gestionar miembros',
    description: 'Agregar y quitar usuarios de grupos',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsManagePermissions]: {
    label: 'Gestionar permisos',
    description: 'Modificar permisos de vistas de los grupos',
    category: 'Grupos de Seguridad',
  },
  [Capabilities.GroupsSyncWithAD]: {
    label: 'Sincronizar con AD',
    description: 'Configurar y ejecutar sincronización con Active Directory',
    category: 'Grupos de Seguridad',
  },

  // Roles
  [Capabilities.RolesView]: {
    label: 'Ver roles',
    description: 'Ver la lista de roles administrativos',
    category: 'Roles',
  },
  [Capabilities.RolesCreate]: {
    label: 'Crear roles',
    description: 'Crear nuevos roles personalizados',
    category: 'Roles',
  },
  [Capabilities.RolesEdit]: {
    label: 'Editar roles',
    description: 'Modificar roles existentes',
    category: 'Roles',
  },
  [Capabilities.RolesDelete]: {
    label: 'Eliminar roles',
    description: 'Eliminar roles personalizados',
    category: 'Roles',
  },
  [Capabilities.RolesAssignCapabilities]: {
    label: 'Asignar capacidades',
    description: 'Modificar las capacidades de los roles',
    category: 'Roles',
  },

  // Parcheos
  [Capabilities.PatchingConfigureCompliance]: {
    label: 'Configurar Compliance',
    description: 'Crear, editar y eliminar configuraciones de compliance de parcheos',
    category: 'Parcheos',
  },

  // Sistema
  [Capabilities.SystemConfigureSMTP]: {
    label: 'Configurar SMTP',
    description: 'Configurar el servidor de correo electrónico',
    category: 'Sistema',
  },
  [Capabilities.SystemConfigureCollectors]: {
    label: 'Configurar Collectors',
    description: 'Configurar los colectores de HealthScore',
    category: 'Sistema',
  },
  [Capabilities.SystemConfigureAlerts]: {
    label: 'Configurar alertas',
    description: 'Configurar las alertas del sistema',
    category: 'Sistema',
  },
  [Capabilities.SystemManageCredentials]: {
    label: 'Gestionar credenciales',
    description: 'Gestionar credenciales de sistema',
    category: 'Sistema',
  },
  [Capabilities.SystemViewAudit]: {
    label: 'Ver auditoría',
    description: 'Ver logs de auditoría del sistema',
    category: 'Sistema',
  },
  [Capabilities.SystemManageMenuBadges]: {
    label: 'Gestionar indicadores',
    description: 'Gestionar indicadores de menú (badges)',
    category: 'Sistema',
  },
  [Capabilities.SystemManageLogs]: {
    label: 'Gestionar Logs API',
    description: 'Ver y gestionar los logs del backend',
    category: 'Sistema',
  },
};

/**
 * Obtiene las capacidades agrupadas por categoría
 */
export function getCapabilitiesByCategory(): Record<string, Array<{ key: string; label: string; description: string }>> {
  const grouped: Record<string, Array<{ key: string; label: string; description: string }>> = {};
  
  for (const [key, info] of Object.entries(CapabilityInfo)) {
    if (!grouped[info.category]) {
      grouped[info.category] = [];
    }
    grouped[info.category].push({
      key,
      label: info.label,
      description: info.description,
    });
  }
  
  return grouped;
}

