-- =============================================
-- Create AdminGroupAssignments Table
-- Tabla para asignar qué grupos puede administrar cada Admin
-- =============================================

-- Verificar si la tabla ya existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AdminGroupAssignments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AdminGroupAssignments] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Usuario Admin que recibe la asignación
        [UserId] NVARCHAR(450) NOT NULL,
        
        -- Grupo que puede administrar
        [GroupId] INT NOT NULL,
        
        -- Permisos granulares sobre el grupo
        [CanEdit] BIT NOT NULL DEFAULT 1,           -- Puede editar el grupo (nombre, descripción, etc.)
        [CanDelete] BIT NOT NULL DEFAULT 0,         -- Puede eliminar el grupo
        [CanManageMembers] BIT NOT NULL DEFAULT 1,  -- Puede agregar/quitar miembros
        [CanManagePermissions] BIT NOT NULL DEFAULT 1, -- Puede modificar permisos del grupo
        
        -- Auditoría
        [AssignedByUserId] NVARCHAR(450) NULL,      -- SuperAdmin que hizo la asignación
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        -- Foreign Keys
        CONSTRAINT [FK_AdminGroupAssignments_User] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AdminGroupAssignments_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[SecurityGroups]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_AdminGroupAssignments_AssignedBy] FOREIGN KEY ([AssignedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AdminGroupAssignments_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        -- Un Admin solo puede tener una asignación por grupo
        CONSTRAINT [UK_AdminGroupAssignment] UNIQUE ([UserId], [GroupId])
    );

    PRINT 'Table AdminGroupAssignments created successfully';
END
ELSE
BEGIN
    PRINT 'Table AdminGroupAssignments already exists';
END
GO

-- =============================================
-- Crear índices para optimizar consultas
-- =============================================

-- Índice para buscar asignaciones por usuario (qué grupos puede administrar)
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminGroupAssignments_UserId' AND object_id = OBJECT_ID('AdminGroupAssignments'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_AdminGroupAssignments_UserId]
    ON [dbo].[AdminGroupAssignments] ([UserId])
    INCLUDE ([GroupId], [CanEdit], [CanDelete], [CanManageMembers], [CanManagePermissions]);
    
    PRINT 'Index IX_AdminGroupAssignments_UserId created';
END
GO

-- Índice para buscar administradores de un grupo
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminGroupAssignments_GroupId' AND object_id = OBJECT_ID('AdminGroupAssignments'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_AdminGroupAssignments_GroupId]
    ON [dbo].[AdminGroupAssignments] ([GroupId])
    INCLUDE ([UserId], [CanEdit], [CanDelete], [CanManageMembers], [CanManagePermissions]);
    
    PRINT 'Index IX_AdminGroupAssignments_GroupId created';
END
GO

-- =============================================
-- Vista para consultar asignaciones con detalles
-- =============================================

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_AdminGroupAssignmentsDetails')
BEGIN
    DROP VIEW [dbo].[vw_AdminGroupAssignmentsDetails];
END
GO

CREATE VIEW [dbo].[vw_AdminGroupAssignmentsDetails]
AS
SELECT 
    aga.Id,
    aga.UserId,
    u.UserName AS AdminUserName,
    u.DisplayName AS AdminDisplayName,
    u.Email AS AdminEmail,
    aga.GroupId,
    sg.Name AS GroupName,
    sg.Description AS GroupDescription,
    sg.Color AS GroupColor,
    aga.CanEdit,
    aga.CanDelete,
    aga.CanManageMembers,
    aga.CanManagePermissions,
    aga.AssignedByUserId,
    ab.DisplayName AS AssignedByDisplayName,
    aga.CreatedAt,
    aga.UpdatedAt
FROM AdminGroupAssignments aga
INNER JOIN AspNetUsers u ON aga.UserId = u.Id
INNER JOIN SecurityGroups sg ON aga.GroupId = sg.Id
LEFT JOIN AspNetUsers ab ON aga.AssignedByUserId = ab.Id
WHERE sg.IsDeleted = 0;
GO

PRINT 'View vw_AdminGroupAssignmentsDetails created';
GO

-- =============================================
-- Comentarios de documentación
-- =============================================
/*
Uso de la tabla AdminGroupAssignments:

1. SuperAdmin asigna grupos a un Admin:
   INSERT INTO AdminGroupAssignments (UserId, GroupId, CanEdit, CanDelete, CanManageMembers, CanManagePermissions, AssignedByUserId)
   VALUES (@AdminUserId, @GroupId, 1, 0, 1, 1, @SuperAdminUserId);

2. Verificar si un Admin puede gestionar un grupo:
   SELECT * FROM AdminGroupAssignments 
   WHERE UserId = @AdminUserId AND GroupId = @GroupId;

3. Obtener todos los grupos que puede administrar un usuario:
   SELECT GroupId, CanEdit, CanDelete, CanManageMembers, CanManagePermissions 
   FROM AdminGroupAssignments 
   WHERE UserId = @UserId;

4. Obtener todos los administradores de un grupo:
   SELECT * FROM vw_AdminGroupAssignmentsDetails
   WHERE GroupId = @GroupId;

Reglas de negocio:
- Solo SuperAdmin puede crear/modificar asignaciones
- Un Admin solo puede gestionar grupos que le fueron asignados
- Los permisos granulares permiten control fino:
  * CanEdit: puede modificar nombre, descripción, color del grupo
  * CanDelete: puede eliminar el grupo (normalmente solo SuperAdmin)
  * CanManageMembers: puede agregar/quitar usuarios del grupo
  * CanManagePermissions: puede modificar los permisos de vistas del grupo
*/




