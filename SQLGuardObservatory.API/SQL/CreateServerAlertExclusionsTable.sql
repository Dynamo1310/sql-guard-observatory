-- =====================================================
-- Script: CreateServerAlertExclusionsTable.sql
-- Descripción: Crea la tabla de exclusiones globales de servidores para alertas
-- Cuando un servidor se da de baja (se apaga), se agrega aquí para que
-- no genere alertas de ningún tipo (servidores caídos, backups, discos, overview, etc.)
-- =====================================================

-- Verificar si la tabla ya existe
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ServerAlertExclusions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.ServerAlertExclusions (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Nombre del servidor o instancia excluida
        ServerName NVARCHAR(255) NOT NULL,
        
        -- Motivo de la exclusión (opcional)
        Reason NVARCHAR(500) NULL,
        
        -- Si la exclusión está activa
        IsActive BIT NOT NULL DEFAULT 1,
        
        -- Fecha de creación
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Usuario que creó la exclusión
        CreatedBy NVARCHAR(100) NULL,
        
        -- Fecha de expiración (opcional) - si es null, no expira
        ExpiresAtUtc DATETIME2 NULL,
        
        -- Constraint para evitar duplicados
        CONSTRAINT UQ_ServerAlertExclusion_ServerName UNIQUE (ServerName)
    );

    PRINT 'Tabla ServerAlertExclusions creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla ServerAlertExclusions ya existe';
END
GO

-- Crear índice para búsquedas frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerAlertExclusions_Active' AND object_id = OBJECT_ID('dbo.ServerAlertExclusions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ServerAlertExclusions_Active 
    ON dbo.ServerAlertExclusions (ServerName, IsActive)
    WHERE IsActive = 1;
    
    PRINT 'Índice IX_ServerAlertExclusions_Active creado exitosamente';
END
GO
