-- =============================================
-- Script: CreateOnCallTables.sql
-- Descripción: Crea las tablas para el sistema de guardias DBA
-- Base de datos: AppSQLNova
-- =============================================

USE AppSQLNova;
GO

-- =============================================
-- 1. Agregar columna IsOnCallEscalation a AspNetUsers
-- =============================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('AspNetUsers') 
    AND name = 'IsOnCallEscalation'
)
BEGIN
    ALTER TABLE AspNetUsers ADD IsOnCallEscalation BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsOnCallEscalation agregada a AspNetUsers';
END
ELSE
BEGIN
    PRINT 'Columna IsOnCallEscalation ya existe en AspNetUsers';
END
GO

-- =============================================
-- 2. Crear tabla OnCallOperators
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallOperators')
BEGIN
    CREATE TABLE OnCallOperators (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UserId NVARCHAR(450) NOT NULL,
        RotationOrder INT NOT NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_OnCallOperators_AspNetUsers 
            FOREIGN KEY (UserId) REFERENCES AspNetUsers(Id) ON DELETE CASCADE,
        
        CONSTRAINT UQ_OnCallOperators_UserId UNIQUE (UserId)
    );
    
    CREATE INDEX IX_OnCallOperators_RotationOrder ON OnCallOperators(RotationOrder);
    
    PRINT 'Tabla OnCallOperators creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallOperators ya existe';
END
GO

-- =============================================
-- 3. Crear tabla OnCallSchedules
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallSchedules')
BEGIN
    CREATE TABLE OnCallSchedules (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        UserId NVARCHAR(450) NOT NULL,
        WeekStartDate DATETIME2 NOT NULL,
        WeekEndDate DATETIME2 NOT NULL,
        WeekNumber INT NOT NULL,
        Year INT NOT NULL,
        IsOverride BIT NOT NULL DEFAULT 0,
        ModifiedByUserId NVARCHAR(450) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_OnCallSchedules_AspNetUsers 
            FOREIGN KEY (UserId) REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        
        CONSTRAINT FK_OnCallSchedules_ModifiedBy 
            FOREIGN KEY (ModifiedByUserId) REFERENCES AspNetUsers(Id) ON DELETE SET NULL
    );
    
    CREATE INDEX IX_OnCallSchedules_YearWeek ON OnCallSchedules(Year, WeekNumber);
    CREATE INDEX IX_OnCallSchedules_WeekStartDate ON OnCallSchedules(WeekStartDate);
    CREATE INDEX IX_OnCallSchedules_UserId ON OnCallSchedules(UserId);
    
    PRINT 'Tabla OnCallSchedules creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallSchedules ya existe';
END
GO

-- =============================================
-- 4. Crear tabla OnCallSwapRequests
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallSwapRequests')
BEGIN
    CREATE TABLE OnCallSwapRequests (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        RequesterId NVARCHAR(450) NOT NULL,
        TargetUserId NVARCHAR(450) NOT NULL,
        OriginalScheduleId INT NOT NULL,
        SwapScheduleId INT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        RejectionReason NVARCHAR(500) NULL,
        RequestReason NVARCHAR(500) NULL,
        RequestedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        RespondedAt DATETIME2 NULL,
        IsEscalationOverride BIT NOT NULL DEFAULT 0,
        
        CONSTRAINT FK_OnCallSwapRequests_Requester 
            FOREIGN KEY (RequesterId) REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        
        CONSTRAINT FK_OnCallSwapRequests_Target 
            FOREIGN KEY (TargetUserId) REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        
        CONSTRAINT FK_OnCallSwapRequests_OriginalSchedule 
            FOREIGN KEY (OriginalScheduleId) REFERENCES OnCallSchedules(Id) ON DELETE NO ACTION,
        
        CONSTRAINT FK_OnCallSwapRequests_SwapSchedule 
            FOREIGN KEY (SwapScheduleId) REFERENCES OnCallSchedules(Id) ON DELETE SET NULL,
        
        CONSTRAINT CK_OnCallSwapRequests_Status 
            CHECK (Status IN ('Pending', 'Approved', 'Rejected', 'Cancelled'))
    );
    
    CREATE INDEX IX_OnCallSwapRequests_Status ON OnCallSwapRequests(Status);
    CREATE INDEX IX_OnCallSwapRequests_RequesterId ON OnCallSwapRequests(RequesterId);
    CREATE INDEX IX_OnCallSwapRequests_TargetUserId ON OnCallSwapRequests(TargetUserId);
    
    PRINT 'Tabla OnCallSwapRequests creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallSwapRequests ya existe';
END
GO

-- =============================================
-- 5. Marcar usuarios de escalamiento iniciales
-- =============================================
UPDATE AspNetUsers 
SET IsOnCallEscalation = 1 
WHERE DomainUser IN ('PR67231', 'PM43314', 'RT33863');

PRINT 'Usuarios de escalamiento configurados: PR67231, PM43314, RT33863';
GO

-- =============================================
-- 6. Agregar permisos de OnCall a los roles
-- =============================================
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE ViewName = 'OnCall' AND Role = 'SuperAdmin')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt)
    VALUES ('SuperAdmin', 'OnCall', 1, GETDATE());
END

IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE ViewName = 'OnCall' AND Role = 'Admin')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt)
    VALUES ('Admin', 'OnCall', 1, GETDATE());
END

IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE ViewName = 'OnCall' AND Role = 'Reader')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt)
    VALUES ('Reader', 'OnCall', 1, GETDATE());
END

PRINT 'Permisos de OnCall agregados a todos los roles';
GO

-- =============================================
-- 7. Verificar la estructura creada
-- =============================================
PRINT '';
PRINT '=== RESUMEN DE TABLAS CREADAS ===';

SELECT 'OnCallOperators' AS Tabla, COUNT(*) AS Registros FROM OnCallOperators
UNION ALL
SELECT 'OnCallSchedules', COUNT(*) FROM OnCallSchedules
UNION ALL
SELECT 'OnCallSwapRequests', COUNT(*) FROM OnCallSwapRequests;

PRINT '';
PRINT 'Usuarios de escalamiento:';
SELECT DomainUser, DisplayName, IsOnCallEscalation 
FROM AspNetUsers 
WHERE IsOnCallEscalation = 1;

PRINT '';
PRINT '=== FIN DEL SCRIPT ===';
GO

