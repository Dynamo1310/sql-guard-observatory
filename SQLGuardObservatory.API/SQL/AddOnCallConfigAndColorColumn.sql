-- =============================================
-- Script: AddOnCallConfigAndColorColumn.sql
-- Descripción: Agrega columna ColorCode a OnCallOperators, 
--              crea tablas de configuración y feriados,
--              y agrega permiso OnCallConfig
-- Base de datos: SQLGuardObservatoryAuth
-- Fecha: 2025-01-XX
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- =============================================
-- 1. Agregar columna ColorCode a OnCallOperators
-- =============================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('OnCallOperators') 
    AND name = 'ColorCode'
)
BEGIN
    ALTER TABLE OnCallOperators ADD ColorCode NVARCHAR(7) NULL;
    PRINT 'Columna ColorCode agregada a OnCallOperators';
END
ELSE
BEGIN
    PRINT 'Columna ColorCode ya existe en OnCallOperators';
END
GO

-- =============================================
-- 1b. Asignar colores por defecto a operadores existentes
-- (Debe estar en un batch separado para que SQL Server reconozca la columna)
-- =============================================
;WITH OperatorColors AS (
    SELECT 
        Id,
        ROW_NUMBER() OVER (ORDER BY RotationOrder) AS RowNum
    FROM OnCallOperators
    WHERE ColorCode IS NULL
)
UPDATE o
SET ColorCode = CASE (oc.RowNum - 1) % 10
    WHEN 0 THEN '#3B82F6'  -- Azul
    WHEN 1 THEN '#10B981'  -- Verde
    WHEN 2 THEN '#F59E0B'  -- Ámbar
    WHEN 3 THEN '#EF4444'  -- Rojo
    WHEN 4 THEN '#8B5CF6'  -- Violeta
    WHEN 5 THEN '#EC4899'  -- Rosa
    WHEN 6 THEN '#06B6D4'  -- Cian
    WHEN 7 THEN '#84CC16'  -- Lima
    WHEN 8 THEN '#F97316'  -- Naranja
    WHEN 9 THEN '#6366F1'  -- Índigo
END
FROM OnCallOperators o
INNER JOIN OperatorColors oc ON o.Id = oc.Id;

IF @@ROWCOUNT > 0
    PRINT 'Colores por defecto asignados a operadores existentes';
ELSE
    PRINT 'No hay operadores sin color asignado';
GO

-- =============================================
-- 2. Crear tabla OnCallConfig (Configuración)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallConfig')
BEGIN
    CREATE TABLE OnCallConfig (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Configuración de aprobación
        RequiresApproval BIT NOT NULL DEFAULT 0,
        ApproverId NVARCHAR(450) NULL,
        ApproverGroupId INT NULL,
        
        -- Metadata
        UpdatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedByUserId NVARCHAR(450) NULL,
        
        CONSTRAINT FK_OnCallConfig_Approver 
            FOREIGN KEY (ApproverId) REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallConfig_ApproverGroup 
            FOREIGN KEY (ApproverGroupId) REFERENCES SecurityGroups(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallConfig_UpdatedBy 
            FOREIGN KEY (UpdatedByUserId) REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    -- Insertar configuración por defecto
    INSERT INTO OnCallConfig (RequiresApproval, UpdatedAt)
    VALUES (0, GETDATE());
    
    PRINT 'Tabla OnCallConfig creada con configuración inicial';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallConfig ya existe';
END
GO

-- =============================================
-- 3. Crear tabla OnCallHolidays (Feriados)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallHolidays')
BEGIN
    CREATE TABLE OnCallHolidays (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Información del feriado
        Date DATE NOT NULL,
        Name NVARCHAR(200) NOT NULL,
        IsRecurring BIT NOT NULL DEFAULT 0,
        
        -- Metadata
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CreatedByUserId NVARCHAR(450) NULL,
        
        CONSTRAINT FK_OnCallHolidays_CreatedBy 
            FOREIGN KEY (CreatedByUserId) REFERENCES AspNetUsers(Id) ON DELETE SET NULL
    );
    
    CREATE INDEX IX_OnCallHolidays_Date ON OnCallHolidays(Date);
    CREATE INDEX IX_OnCallHolidays_IsRecurring ON OnCallHolidays(IsRecurring);
    
    -- Insertar feriados argentinos comunes como ejemplo
    DECLARE @CreatorUserId NVARCHAR(450);
    SELECT TOP 1 @CreatorUserId = Id FROM AspNetUsers WHERE IsOnCallEscalation = 1;
    
    IF @CreatorUserId IS NOT NULL
    BEGIN
        INSERT INTO OnCallHolidays (Date, Name, IsRecurring, CreatedByUserId)
        VALUES 
            ('2025-01-01', 'Año Nuevo', 1, @CreatorUserId),
            ('2025-02-24', 'Carnaval', 0, @CreatorUserId),
            ('2025-02-25', 'Carnaval', 0, @CreatorUserId),
            ('2025-03-24', 'Día de la Memoria', 1, @CreatorUserId),
            ('2025-04-02', 'Día del Veterano', 1, @CreatorUserId),
            ('2025-05-01', 'Día del Trabajador', 1, @CreatorUserId),
            ('2025-05-25', 'Revolución de Mayo', 1, @CreatorUserId),
            ('2025-06-17', 'Paso a la Inmortalidad del Gral. Güemes', 1, @CreatorUserId),
            ('2025-06-20', 'Día de la Bandera', 1, @CreatorUserId),
            ('2025-07-09', 'Día de la Independencia', 1, @CreatorUserId),
            ('2025-08-17', 'Paso a la Inmortalidad del Gral. San Martín', 0, @CreatorUserId),
            ('2025-10-12', 'Día del Respeto a la Diversidad Cultural', 0, @CreatorUserId),
            ('2025-11-20', 'Día de la Soberanía Nacional', 0, @CreatorUserId),
            ('2025-12-08', 'Inmaculada Concepción', 1, @CreatorUserId),
            ('2025-12-25', 'Navidad', 1, @CreatorUserId);
        
        PRINT 'Feriados argentinos 2025 insertados como ejemplo';
    END
    
    PRINT 'Tabla OnCallHolidays creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallHolidays ya existe';
END
GO

-- =============================================
-- 4. Agregar permiso OnCallConfig a RolePermissions
-- =============================================
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE ViewName = 'OnCallConfig' AND Role = 'SuperAdmin')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt)
    VALUES ('SuperAdmin', 'OnCallConfig', 1, GETDATE());
    PRINT 'Permiso OnCallConfig agregado para SuperAdmin';
END
ELSE
BEGIN
    PRINT 'Permiso OnCallConfig ya existe para SuperAdmin';
END

IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE ViewName = 'OnCallConfig' AND Role = 'Admin')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt)
    VALUES ('Admin', 'OnCallConfig', 1, GETDATE());
    PRINT 'Permiso OnCallConfig agregado para Admin';
END
ELSE
BEGIN
    PRINT 'Permiso OnCallConfig ya existe para Admin';
END
GO

-- =============================================
-- 5. Agregar permiso OnCallConfig a GroupPermissions para grupos existentes
-- =============================================
INSERT INTO GroupPermissions (GroupId, ViewName, Enabled, CreatedAt)
SELECT DISTINCT gp.GroupId, 'OnCallConfig', 1, GETDATE()
FROM GroupPermissions gp
WHERE gp.ViewName = 'OnCall' 
AND gp.Enabled = 1
AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId 
    AND gp2.ViewName = 'OnCallConfig'
);

IF @@ROWCOUNT > 0
    PRINT 'Permiso OnCallConfig agregado a grupos que tienen permiso OnCall';
ELSE
    PRINT 'No hay grupos nuevos para agregar permiso OnCallConfig';
GO

-- =============================================
-- 6. Verificación final
-- =============================================
PRINT '';
PRINT '=== VERIFICACIÓN DE CAMBIOS ===';
PRINT '';

-- Verificar columna ColorCode
SELECT 'OnCallOperators - ColorCode' AS Verificacion, 
       CASE WHEN EXISTS (
           SELECT 1 FROM sys.columns 
           WHERE object_id = OBJECT_ID('OnCallOperators') 
           AND name = 'ColorCode'
       ) THEN 'OK' ELSE 'FALTA' END AS Estado;

-- Verificar tabla OnCallConfig
SELECT 'Tabla OnCallConfig' AS Verificacion,
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallConfig')
       THEN 'OK' ELSE 'FALTA' END AS Estado;

-- Verificar tabla OnCallHolidays
SELECT 'Tabla OnCallHolidays' AS Verificacion,
       CASE WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallHolidays')
       THEN 'OK' ELSE 'FALTA' END AS Estado;

-- Verificar permisos
SELECT 'Permiso OnCallConfig' AS Verificacion, Role, Enabled
FROM RolePermissions 
WHERE ViewName = 'OnCallConfig'
ORDER BY Role;

-- Mostrar operadores con sus colores
PRINT '';
PRINT '=== OPERADORES CON COLORES ===';
SELECT o.Id, u.DomainUser, u.DisplayName, o.RotationOrder, o.ColorCode
FROM OnCallOperators o
INNER JOIN AspNetUsers u ON o.UserId = u.Id
ORDER BY o.RotationOrder;

-- Mostrar feriados
PRINT '';
PRINT '=== FERIADOS CONFIGURADOS ===';
SELECT Id, Date, Name, IsRecurring
FROM OnCallHolidays
ORDER BY Date;

PRINT '';
PRINT '=== FIN DEL SCRIPT ===';
GO
