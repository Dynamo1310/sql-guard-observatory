-- Script para crear las tablas de Patching
-- Ejecutar en la base de datos SQLGuardObservatoryAuth

-- Tabla de configuración de compliance por versión SQL Server
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PatchComplianceConfig]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PatchComplianceConfig](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [SqlVersion] [nvarchar](20) NOT NULL,
        [RequiredBuild] [nvarchar](50) NOT NULL,
        [RequiredCU] [nvarchar](20) NULL,
        [RequiredKB] [nvarchar](20) NULL,
        [Description] [nvarchar](500) NULL,
        [IsActive] [bit] NOT NULL DEFAULT(1),
        [UpdatedAt] [datetime2](7) NOT NULL DEFAULT(GETDATE()),
        [UpdatedBy] [nvarchar](100) NULL,
        CONSTRAINT [PK_PatchComplianceConfig] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE UNIQUE INDEX [IX_PatchComplianceConfig_SqlVersion] ON [dbo].[PatchComplianceConfig]([SqlVersion]);
    CREATE INDEX [IX_PatchComplianceConfig_IsActive] ON [dbo].[PatchComplianceConfig]([IsActive]);

    PRINT 'Tabla PatchComplianceConfig creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla PatchComplianceConfig ya existe';
END
GO

-- Tabla de cache de estado de parcheo
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ServerPatchStatusCache]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ServerPatchStatusCache](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [ServerName] [nvarchar](200) NOT NULL,
        [InstanceName] [nvarchar](200) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [MajorVersion] [nvarchar](20) NULL,
        [CurrentBuild] [nvarchar](50) NULL,
        [CurrentCU] [nvarchar](50) NULL,
        [CurrentSP] [nvarchar](50) NULL,
        [KBReference] [nvarchar](50) NULL,
        [RequiredBuild] [nvarchar](50) NULL,
        [RequiredCU] [nvarchar](50) NULL,
        [LatestBuild] [nvarchar](50) NULL,
        [LatestCU] [nvarchar](50) NULL,
        [LatestKBReference] [nvarchar](50) NULL,
        [PendingCUsForCompliance] [int] NOT NULL DEFAULT(0),
        [PendingCUsForLatest] [int] NOT NULL DEFAULT(0),
        [PatchStatus] [nvarchar](20) NOT NULL DEFAULT('Unknown'),
        [ConnectionSuccess] [bit] NOT NULL DEFAULT(0),
        [IsDmzServer] [bit] NOT NULL DEFAULT(0),
        [ErrorMessage] [nvarchar](500) NULL,
        [LastChecked] [datetime2](7) NOT NULL DEFAULT(GETDATE()),
        [CreatedAt] [datetime2](7) NOT NULL DEFAULT(GETDATE()),
        CONSTRAINT [PK_ServerPatchStatusCache] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE UNIQUE INDEX [IX_ServerPatchStatusCache_InstanceName] ON [dbo].[ServerPatchStatusCache]([InstanceName]);
    CREATE INDEX [IX_ServerPatchStatusCache_PatchStatus] ON [dbo].[ServerPatchStatusCache]([PatchStatus]);
    CREATE INDEX [IX_ServerPatchStatusCache_LastChecked] ON [dbo].[ServerPatchStatusCache]([LastChecked]);

    PRINT 'Tabla ServerPatchStatusCache creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla ServerPatchStatusCache ya existe';
END
GO

-- Agregar permiso de Patching si no existe
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'Patching')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'Patching', 1);
    PRINT 'Permiso Patching agregado para SuperAdmin';
END

IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'Admin' AND ViewName = 'Patching')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('Admin', 'Patching', 1);
    PRINT 'Permiso Patching agregado para Admin';
END

-- Agregar permiso de PatchingConfig (configuración de compliance) - Solo SuperAdmin
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'PatchingConfig')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'PatchingConfig', 1);
    PRINT 'Permiso PatchingConfig agregado para SuperAdmin';
END

-- Verificar permisos creados
SELECT 'Permisos de Parcheo:' AS Info;
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName IN ('Patching', 'PatchingConfig')
ORDER BY ViewName, Role;
GO

-- Insertar configuración inicial de compliance para Banco Supervielle (ejemplo)
-- Ajustar según los requisitos reales del banco
IF NOT EXISTS (SELECT 1 FROM PatchComplianceConfig WHERE SqlVersion = '2016')
BEGIN
    INSERT INTO PatchComplianceConfig (SqlVersion, RequiredBuild, RequiredCU, RequiredKB, Description, IsActive)
    VALUES ('2016', '13.0.6435.1', 'SP3-CU0', 'KB5029186', 'SQL Server 2016 SP3 - Compliance Banco Supervielle', 1);
END

IF NOT EXISTS (SELECT 1 FROM PatchComplianceConfig WHERE SqlVersion = '2017')
BEGIN
    INSERT INTO PatchComplianceConfig (SqlVersion, RequiredBuild, RequiredCU, RequiredKB, Description, IsActive)
    VALUES ('2017', '14.0.3465.1', 'CU31', 'KB5029376', 'SQL Server 2017 CU31 - Compliance Banco Supervielle', 1);
END

IF NOT EXISTS (SELECT 1 FROM PatchComplianceConfig WHERE SqlVersion = '2019')
BEGIN
    INSERT INTO PatchComplianceConfig (SqlVersion, RequiredBuild, RequiredCU, RequiredKB, Description, IsActive)
    VALUES ('2019', '15.0.4375.4', 'CU28', 'KB5039747', 'SQL Server 2019 CU28 - Compliance Banco Supervielle', 1);
END

IF NOT EXISTS (SELECT 1 FROM PatchComplianceConfig WHERE SqlVersion = '2022')
BEGIN
    INSERT INTO PatchComplianceConfig (SqlVersion, RequiredBuild, RequiredCU, RequiredKB, Description, IsActive)
    VALUES ('2022', '16.0.4145.4', 'CU15', 'KB5041321', 'SQL Server 2022 CU15 - Compliance Banco Supervielle', 1);
END
GO

PRINT 'Script de tablas de Patching ejecutado correctamente';

