-- =====================================================
-- Script: CreateCollectorExceptionsTable.sql
-- Descripción: Crea la tabla de excepciones de collectors
-- Permite excluir validaciones específicas para ciertos servidores
-- Ejemplo: Exceptuar CHECKDB para SERVER01
-- =====================================================

-- Verificar si la tabla ya existe
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorExceptions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.CollectorExceptions (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Nombre del collector (ej: "Maintenance")
        CollectorName NVARCHAR(50) NOT NULL,
        
        -- Tipo de excepción (ej: "CHECKDB", "IndexOptimize")
        ExceptionType NVARCHAR(50) NOT NULL,
        
        -- Nombre del servidor o instancia exceptuada
        ServerName NVARCHAR(255) NOT NULL,
        
        -- Motivo de la excepción (opcional)
        Reason NVARCHAR(500) NULL,
        
        -- Si la excepción está activa
        IsActive BIT NOT NULL DEFAULT 1,
        
        -- Fecha de creación
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        
        -- Usuario que creó la excepción
        CreatedBy NVARCHAR(100) NULL,
        
        -- Fecha de expiración (opcional) - si es null, no expira
        ExpiresAtUtc DATETIME2 NULL,
        
        -- Constraint para evitar duplicados
        CONSTRAINT UQ_CollectorException UNIQUE (CollectorName, ExceptionType, ServerName)
    );

    PRINT 'Tabla CollectorExceptions creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla CollectorExceptions ya existe';
END
GO

-- Crear índice para búsquedas frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CollectorExceptions_Lookup' AND object_id = OBJECT_ID('dbo.CollectorExceptions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_CollectorExceptions_Lookup 
    ON dbo.CollectorExceptions (CollectorName, ExceptionType, ServerName, IsActive)
    WHERE IsActive = 1;
    
    PRINT 'Índice IX_CollectorExceptions_Lookup creado exitosamente';
END
GO

-- Agregar permiso de lectura/escritura al rol CollectorExceptions (si existe la lógica de permisos)
-- Esto se puede ajustar según el esquema de permisos de la aplicación



