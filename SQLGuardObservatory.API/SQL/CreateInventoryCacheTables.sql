-- =====================================================================
-- Script: CreateInventoryCacheTables.sql
-- Descripción: Crea las tablas de caché para el inventario SQL Server
-- Base de datos: AppSQLNova
-- Fecha: 2025-12-28
-- =====================================================================

USE AppSQLNova;
GO

-- =====================================================================
-- Tabla: SqlServerInstancesCache
-- Almacena el caché de instancias SQL Server
-- =====================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SqlServerInstancesCache')
BEGIN
    CREATE TABLE SqlServerInstancesCache (
        Id INT PRIMARY KEY,
        ServerName NVARCHAR(255) NOT NULL,
        LocalNetAddress NVARCHAR(50),
        NombreInstancia NVARCHAR(255) NOT NULL,
        MajorVersion NVARCHAR(100),
        ProductLevel NVARCHAR(50),
        Edition NVARCHAR(255),
        ProductUpdateLevel NVARCHAR(50),
        ProductVersion NVARCHAR(50),
        ProductUpdateReference NVARCHAR(50),
        Collation NVARCHAR(100),
        AlwaysOn NVARCHAR(20),
        HostingSite NVARCHAR(100),
        HostingType NVARCHAR(100),
        Ambiente NVARCHAR(100),
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    PRINT 'Tabla SqlServerInstancesCache creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla SqlServerInstancesCache ya existe';
END
GO

-- Índices para búsquedas frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SqlServerInstancesCache_Ambiente')
BEGIN
    CREATE INDEX IX_SqlServerInstancesCache_Ambiente ON SqlServerInstancesCache(Ambiente);
    PRINT 'Índice IX_SqlServerInstancesCache_Ambiente creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SqlServerInstancesCache_MajorVersion')
BEGIN
    CREATE INDEX IX_SqlServerInstancesCache_MajorVersion ON SqlServerInstancesCache(MajorVersion);
    PRINT 'Índice IX_SqlServerInstancesCache_MajorVersion creado';
END
GO

-- =====================================================================
-- Tabla: SqlServerDatabasesCache
-- Almacena el caché de bases de datos SQL Server
-- =====================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SqlServerDatabasesCache')
BEGIN
    CREATE TABLE SqlServerDatabasesCache (
        Id INT PRIMARY KEY,
        -- Referencia a la instancia (almacenamos el ID y nombre para evitar JOINs)
        ServerInstanceId INT NOT NULL,
        ServerName NVARCHAR(255) NOT NULL,
        ServerAmbiente NVARCHAR(100),
        -- Datos de la base de datos
        DatabaseId INT NOT NULL,
        DbName NVARCHAR(255) NOT NULL,
        Status NVARCHAR(50),
        StateDesc NVARCHAR(50),
        DataFiles INT,
        DataMB INT,
        UserAccess NVARCHAR(50),
        RecoveryModel NVARCHAR(50),
        CompatibilityLevel NVARCHAR(100),
        CreationDate DATETIME2,
        Collation NVARCHAR(100),
        Fulltext BIT,
        AutoClose BIT,
        ReadOnly BIT,
        AutoShrink BIT,
        AutoCreateStatistics BIT,
        AutoUpdateStatistics BIT,
        SourceTimestamp DATETIME2,
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    PRINT 'Tabla SqlServerDatabasesCache creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla SqlServerDatabasesCache ya existe';
END
GO

-- Índices para búsquedas frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SqlServerDatabasesCache_ServerName')
BEGIN
    CREATE INDEX IX_SqlServerDatabasesCache_ServerName ON SqlServerDatabasesCache(ServerName);
    PRINT 'Índice IX_SqlServerDatabasesCache_ServerName creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SqlServerDatabasesCache_Status')
BEGIN
    CREATE INDEX IX_SqlServerDatabasesCache_Status ON SqlServerDatabasesCache(Status);
    PRINT 'Índice IX_SqlServerDatabasesCache_Status creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SqlServerDatabasesCache_RecoveryModel')
BEGIN
    CREATE INDEX IX_SqlServerDatabasesCache_RecoveryModel ON SqlServerDatabasesCache(RecoveryModel);
    PRINT 'Índice IX_SqlServerDatabasesCache_RecoveryModel creado';
END
GO

-- =====================================================================
-- Tabla: InventoryCacheMetadata
-- Almacena metadatos del caché (última actualización, etc.)
-- =====================================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InventoryCacheMetadata')
BEGIN
    CREATE TABLE InventoryCacheMetadata (
        CacheKey NVARCHAR(100) PRIMARY KEY,
        LastUpdatedAt DATETIME2 NOT NULL,
        UpdatedByUserId NVARCHAR(450),
        UpdatedByUserName NVARCHAR(255),
        RecordCount INT,
        ErrorMessage NVARCHAR(MAX)
    );
    
    PRINT 'Tabla InventoryCacheMetadata creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla InventoryCacheMetadata ya existe';
END
GO

PRINT '';
PRINT '=========================================='
PRINT 'Script completado exitosamente'
PRINT '=========================================='
GO



