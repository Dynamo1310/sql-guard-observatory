-- =============================================
-- Script: Crear tabla InventarioDiscosSnapshot
-- Propósito: Almacenar el relevamiento de espacios en disco
-- Base de datos: SQLNova
-- =============================================

USE SQLNova
GO

-- Verificar si la tabla existe antes de crearla
IF NOT EXISTS (
    SELECT 1 
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = 'InventarioDiscosSnapshot' AND s.name = 'dbo'
)
BEGIN
    PRINT 'Creando tabla dbo.InventarioDiscosSnapshot...'
    
    CREATE TABLE [dbo].[InventarioDiscosSnapshot] (
        [Id]                   BIGINT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName]         NVARCHAR(128)  NOT NULL,
        [Ambiente]             NVARCHAR(50)   NULL,
        [Hosting]              NVARCHAR(50)   NULL,
        [Servidor]             NVARCHAR(128)  NOT NULL,
        [Drive]                NVARCHAR(255)  NOT NULL,
        [TotalGB]              DECIMAL(18,2)  NULL,
        [LibreGB]              DECIMAL(18,2)  NULL,
        [PorcentajeLibre]      DECIMAL(5,2)   NULL,
        [Estado]               NVARCHAR(20)   NULL,
        [CaptureDate]          DATETIME2(0)   NOT NULL,
        [InsertedAtUtc]        DATETIME2(0)   NOT NULL DEFAULT SYSUTCDATETIME()
    );
    
    PRINT 'Creando índices...'
    
    -- Índice para consultas por instancia y fecha
    CREATE INDEX IX_InventarioDiscosSnapshot_Instance_Capture 
        ON [dbo].[InventarioDiscosSnapshot] ([InstanceName], [CaptureDate]);
    
    -- Índice para consultas por servidor, drive y fecha
    CREATE INDEX IX_InventarioDiscosSnapshot_Servidor_Drive 
        ON [dbo].[InventarioDiscosSnapshot] ([Servidor], [Drive], [CaptureDate]);
    
    -- Índice para consultas por estado (útil para KPIs)
    CREATE INDEX IX_InventarioDiscosSnapshot_Estado 
        ON [dbo].[InventarioDiscosSnapshot] ([Estado], [CaptureDate]);
    
    PRINT '✓ Tabla e índices creados exitosamente'
END
ELSE
BEGIN
    PRINT 'La tabla dbo.InventarioDiscosSnapshot ya existe'
END
GO

-- Consulta de verificación
SELECT 
    TABLE_SCHEMA,
    TABLE_NAME,
    (SELECT COUNT(*) FROM [dbo].[InventarioDiscosSnapshot]) AS [Total_Registros]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME = 'InventarioDiscosSnapshot'
GO

-- Ejemplo de consulta para ver los últimos datos
PRINT ''
PRINT 'Últimos 10 registros:'
SELECT TOP 10 
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre,
    Estado,
    CaptureDate
FROM [dbo].[InventarioDiscosSnapshot]
ORDER BY CaptureDate DESC, PorcentajeLibre ASC
GO

