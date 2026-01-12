-- =============================================
-- Script: CreateOnCallConfigTable.sql
-- Descripción: Crea la tabla OnCallConfig (ejecutar si falló antes)
-- Base de datos: SQLGuardObservatoryAuth
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- Eliminar tabla si existe (para limpiar estado inconsistente)
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallConfig')
BEGIN
    DROP TABLE OnCallConfig;
    PRINT 'Tabla OnCallConfig eliminada para recrear';
END
GO

-- Crear tabla OnCallConfig
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

PRINT 'Tabla OnCallConfig creada exitosamente';
GO

-- Verificar
SELECT 'OnCallConfig' AS Tabla, COUNT(*) AS Registros FROM OnCallConfig;
GO



