-- =============================================
-- Tabla para gestionar indicadores de menús nuevos
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MenuBadges')
BEGIN
    CREATE TABLE MenuBadges (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        MenuKey NVARCHAR(100) NOT NULL,
        DisplayName NVARCHAR(100) NOT NULL,
        IsNew BIT NOT NULL DEFAULT 0,
        BadgeText NVARCHAR(50) DEFAULT 'Nuevo',
        BadgeColor NVARCHAR(50) DEFAULT 'green',
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedBy NVARCHAR(100) NULL
    );

    CREATE UNIQUE INDEX IX_MenuBadges_MenuKey ON MenuBadges(MenuKey);

    PRINT 'Tabla MenuBadges creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla MenuBadges ya existe';
END
GO

-- =============================================
-- Insertar todos los menús disponibles
-- Los menús principales (📁) tienen badge activo por defecto
-- =============================================

-- Observabilidad
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Overview')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Overview', 'Overview', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'HealthScore')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('HealthScore', 'HealthScore', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Jobs')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Jobs', 'Mantenimiento', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Disks')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Disks', 'Discos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Databases')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Databases', 'Bases de Datos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Backups')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Backups', 'Backups', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Indexes')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Indexes', 'Índices', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

-- Parcheos (menú principal activo por defecto)
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'PatchingMenu')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('PatchingMenu', '📁 Parcheos (Menú)', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'Patching')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('Patching', 'Parcheos - Dashboard', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'PatchingConfig')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('PatchingConfig', 'Parcheos - Config', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

-- Guardias DBA (menú principal activo por defecto)
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCall')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCall', '📁 Guardias DBA (Menú)', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallDashboard')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallDashboard', 'Guardias - Dashboard', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallPlanner')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallPlanner', 'Guardias - Planificador', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallSwaps')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallSwaps', 'Guardias - Intercambios', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallOperators')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallOperators', 'Guardias - Operadores', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallEscalation')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallEscalation', 'Guardias - Escalamiento', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallActivations')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallActivations', 'Guardias - Activaciones', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallAlerts')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallAlerts', 'Guardias - Alertas', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OnCallReports')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OnCallReports', 'Guardias - Reportes', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

-- Operaciones (menú principal activo por defecto)
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OperationsMenu')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OperationsMenu', '📁 Operaciones (Menú)', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'ServerRestart')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('ServerRestart', 'Operaciones - Reinicio', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'OperationsConfig')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('OperationsConfig', 'Operaciones - Config', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

-- Seguridad / Vault (menú principal activo por defecto)
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultMenu')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultMenu', '📁 Vault DBA (Menú)', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultDashboard')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultDashboard', 'Vault - Dashboard', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultCredentials')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultCredentials', 'Vault - Grupos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultMyCredentials')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultMyCredentials', 'Vault - Mis Credenciales', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultNotifications')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultNotifications', 'Vault - Notificaciones', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'VaultAudit')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('VaultAudit', 'Vault - Auditoría', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

-- Administración
IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'AdminUsers')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('AdminUsers', 'Admin - Usuarios', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'AdminGroups')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('AdminGroups', 'Admin - Grupos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'AdminPermissions')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('AdminPermissions', 'Admin - Permisos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'ConfigSMTP')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('ConfigSMTP', 'Admin - Config. SMTP', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'SystemCredentials')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('SystemCredentials', 'Admin - Cred. Sistema', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'AlertsMenu')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('AlertsMenu', '📁 Alertas (Menú)', 1, 'Nuevo', 'green', GETUTCDATE(), 'System');

IF NOT EXISTS (SELECT 1 FROM MenuBadges WHERE MenuKey = 'AlertaServidoresCaidos')
    INSERT INTO MenuBadges (MenuKey, DisplayName, IsNew, BadgeText, BadgeColor, UpdatedAt, UpdatedBy)
    VALUES ('AlertaServidoresCaidos', 'Alertas - Servidores Caídos', 0, 'Nuevo', 'green', GETUTCDATE(), 'System');

GO

PRINT 'Todos los menús configurados exitosamente';
