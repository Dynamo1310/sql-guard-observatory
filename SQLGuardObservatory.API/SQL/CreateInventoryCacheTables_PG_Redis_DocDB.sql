-- ============================================================
-- Script para crear las tablas de caché de inventario
-- PostgreSQL, Redis y DocumentDB
-- Ejecutar en la base de datos AppSQLNova
-- ============================================================

USE AppSQLNova;
GO

-- ============================================================
-- PostgreSQL Instances Cache
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PostgreSqlInstancesCache')
BEGIN
    CREATE TABLE PostgreSqlInstancesCache (
        Id INT NOT NULL PRIMARY KEY,
        ServerName NVARCHAR(255) NOT NULL,
        LocalNetAddress NVARCHAR(50) NULL,
        NombreInstancia NVARCHAR(500) NOT NULL,
        MajorVersion NVARCHAR(100) NULL,
        ProductLevel NVARCHAR(50) NULL,
        Edition NVARCHAR(100) NULL,
        ProductVersion NVARCHAR(50) NULL,
        AlwaysOn NVARCHAR(20) NULL,
        HostingSite NVARCHAR(100) NULL,
        HostingType NVARCHAR(100) NULL,
        Ambiente NVARCHAR(100) NULL,
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    CREATE INDEX IX_PostgreSqlInstancesCache_ServerName ON PostgreSqlInstancesCache(ServerName);
    CREATE INDEX IX_PostgreSqlInstancesCache_Ambiente ON PostgreSqlInstancesCache(Ambiente);
    CREATE INDEX IX_PostgreSqlInstancesCache_MajorVersion ON PostgreSqlInstancesCache(MajorVersion);
    
    PRINT 'Tabla PostgreSqlInstancesCache creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla PostgreSqlInstancesCache ya existe';
END
GO

-- ============================================================
-- PostgreSQL Databases Cache
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'PostgreSqlDatabasesCache')
BEGIN
    CREATE TABLE PostgreSqlDatabasesCache (
        Id INT NOT NULL PRIMARY KEY,
        ServerInstanceId INT NOT NULL,
        ServerName NVARCHAR(255) NOT NULL,
        ServerAmbiente NVARCHAR(100) NULL,
        DatabaseId INT NOT NULL,
        DbName NVARCHAR(255) NOT NULL,
        Status NVARCHAR(50) NULL,
        DataMB INT NULL,
        AllowConnections BIT NULL,
        DatabaseType NVARCHAR(50) NULL,
        Encoding NVARCHAR(50) NULL,
        Collation NVARCHAR(100) NULL,
        SourceTimestamp DATETIME2 NULL,
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    CREATE INDEX IX_PostgreSqlDatabasesCache_ServerName ON PostgreSqlDatabasesCache(ServerName);
    CREATE INDEX IX_PostgreSqlDatabasesCache_DbName ON PostgreSqlDatabasesCache(DbName);
    CREATE INDEX IX_PostgreSqlDatabasesCache_Status ON PostgreSqlDatabasesCache(Status);
    CREATE INDEX IX_PostgreSqlDatabasesCache_ServerInstanceId ON PostgreSqlDatabasesCache(ServerInstanceId);
    
    PRINT 'Tabla PostgreSqlDatabasesCache creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla PostgreSqlDatabasesCache ya existe';
END
GO

-- ============================================================
-- Redis Instances Cache
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RedisInstancesCache')
BEGIN
    CREATE TABLE RedisInstancesCache (
        Id INT NOT NULL PRIMARY KEY,
        ServerName NVARCHAR(255) NOT NULL,
        Description NVARCHAR(500) NULL,
        ClusterModeEnabled BIT NOT NULL DEFAULT 0,
        NombreInstancia NVARCHAR(500) NOT NULL,
        ProductVersion NVARCHAR(50) NULL,
        Engine NVARCHAR(100) NULL,
        HostingSite NVARCHAR(100) NULL,
        HostingType NVARCHAR(100) NULL,
        Ambiente NVARCHAR(100) NULL,
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    CREATE INDEX IX_RedisInstancesCache_ServerName ON RedisInstancesCache(ServerName);
    CREATE INDEX IX_RedisInstancesCache_Ambiente ON RedisInstancesCache(Ambiente);
    CREATE INDEX IX_RedisInstancesCache_Engine ON RedisInstancesCache(Engine);
    
    PRINT 'Tabla RedisInstancesCache creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla RedisInstancesCache ya existe';
END
GO

-- ============================================================
-- DocumentDB Instances Cache
-- ============================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DocumentDbInstancesCache')
BEGIN
    CREATE TABLE DocumentDbInstancesCache (
        Id INT NOT NULL PRIMARY KEY,
        ServerName NVARCHAR(255) NOT NULL,
        ClusterModeEnabled BIT NOT NULL DEFAULT 0,
        NombreInstancia NVARCHAR(500) NOT NULL,
        ProductVersion NVARCHAR(50) NULL,
        Engine NVARCHAR(100) NULL,
        HostingSite NVARCHAR(100) NULL,
        HostingType NVARCHAR(100) NULL,
        Ambiente NVARCHAR(100) NULL,
        CachedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE()
    );
    
    CREATE INDEX IX_DocumentDbInstancesCache_ServerName ON DocumentDbInstancesCache(ServerName);
    CREATE INDEX IX_DocumentDbInstancesCache_Ambiente ON DocumentDbInstancesCache(Ambiente);
    CREATE INDEX IX_DocumentDbInstancesCache_Engine ON DocumentDbInstancesCache(Engine);
    
    PRINT 'Tabla DocumentDbInstancesCache creada correctamente';
END
ELSE
BEGIN
    PRINT 'Tabla DocumentDbInstancesCache ya existe';
END
GO

-- ============================================================
-- Verificación
-- ============================================================
SELECT 
    t.name AS TableName,
    (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS ColumnCount
FROM sys.tables t
WHERE t.name IN (
    'PostgreSqlInstancesCache',
    'PostgreSqlDatabasesCache', 
    'RedisInstancesCache',
    'DocumentDbInstancesCache'
)
ORDER BY t.name;
GO

PRINT 'Script ejecutado correctamente';
GO



