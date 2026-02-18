-- =====================================================
-- Script: CreateAnalyticsTables.sql
-- Descripción: Crea las tablas para el sistema de telemetría de uso (product analytics).
--   - AnalyticsEvents: eventos individuales (append-only)
--   - AnalyticsSessions: sesiones de usuario
--   - AnalyticsDaily: agregaciones diarias para dashboards
-- =====================================================

-- =====================================================
-- 1. Tabla AnalyticsEvents (append-only, alto volumen)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AnalyticsEvents' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AnalyticsEvents (
        Id              BIGINT IDENTITY(1,1) PRIMARY KEY,
        EventId         UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
        OccurredAt      DATETIME2(3)     NOT NULL,
        UserId          NVARCHAR(128)    NOT NULL,
        SessionId       NVARCHAR(64)     NOT NULL,
        EventName       NVARCHAR(64)     NOT NULL,
        Route           NVARCHAR(256)    NULL,
        ReferrerRoute   NVARCHAR(256)    NULL,
        Source          NVARCHAR(16)     NOT NULL DEFAULT 'web',
        PropertiesJson  NVARCHAR(MAX)    NULL,
        DurationMs      INT              NULL,
        Success         BIT              NULL,
        CreatedAt       DATETIME2(3)     NOT NULL DEFAULT SYSUTCDATETIME()
    );

    PRINT 'Tabla AnalyticsEvents creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla AnalyticsEvents ya existe';
END
GO

-- Índices para AnalyticsEvents
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsEvents_OccurredAt' AND object_id = OBJECT_ID('dbo.AnalyticsEvents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsEvents_OccurredAt
    ON dbo.AnalyticsEvents (OccurredAt);
    PRINT 'Índice IX_AnalyticsEvents_OccurredAt creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsEvents_EventName_OccurredAt' AND object_id = OBJECT_ID('dbo.AnalyticsEvents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsEvents_EventName_OccurredAt
    ON dbo.AnalyticsEvents (EventName, OccurredAt)
    INCLUDE (UserId, Route, DurationMs, Success);
    PRINT 'Índice IX_AnalyticsEvents_EventName_OccurredAt creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsEvents_UserId_OccurredAt' AND object_id = OBJECT_ID('dbo.AnalyticsEvents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsEvents_UserId_OccurredAt
    ON dbo.AnalyticsEvents (UserId, OccurredAt)
    INCLUDE (EventName, Route, SessionId);
    PRINT 'Índice IX_AnalyticsEvents_UserId_OccurredAt creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsEvents_SessionId' AND object_id = OBJECT_ID('dbo.AnalyticsEvents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsEvents_SessionId
    ON dbo.AnalyticsEvents (SessionId)
    INCLUDE (EventName, OccurredAt);
    PRINT 'Índice IX_AnalyticsEvents_SessionId creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsEvents_Route_OccurredAt' AND object_id = OBJECT_ID('dbo.AnalyticsEvents'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsEvents_Route_OccurredAt
    ON dbo.AnalyticsEvents (Route, OccurredAt)
    INCLUDE (EventName, UserId, DurationMs);
    PRINT 'Índice IX_AnalyticsEvents_Route_OccurredAt creado';
END
GO

-- =====================================================
-- 2. Tabla AnalyticsSessions
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AnalyticsSessions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AnalyticsSessions (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        SessionId       NVARCHAR(64)     NOT NULL,
        UserId          NVARCHAR(128)    NOT NULL,
        StartedAt       DATETIME2(3)     NOT NULL,
        EndedAt         DATETIME2(3)     NULL,
        EventCount      INT              NOT NULL DEFAULT 0,
        PageViewCount   INT              NOT NULL DEFAULT 0,
        CONSTRAINT UQ_AnalyticsSessions_SessionId UNIQUE (SessionId)
    );

    PRINT 'Tabla AnalyticsSessions creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla AnalyticsSessions ya existe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsSessions_UserId_StartedAt' AND object_id = OBJECT_ID('dbo.AnalyticsSessions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsSessions_UserId_StartedAt
    ON dbo.AnalyticsSessions (UserId, StartedAt);
    PRINT 'Índice IX_AnalyticsSessions_UserId_StartedAt creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsSessions_StartedAt' AND object_id = OBJECT_ID('dbo.AnalyticsSessions'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsSessions_StartedAt
    ON dbo.AnalyticsSessions (StartedAt)
    INCLUDE (UserId, EventCount, PageViewCount);
    PRINT 'Índice IX_AnalyticsSessions_StartedAt creado';
END
GO

-- =====================================================
-- 3. Tabla AnalyticsDaily (agregaciones para dashboards)
-- =====================================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AnalyticsDaily' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.AnalyticsDaily (
        Id              INT IDENTITY(1,1) PRIMARY KEY,
        [Date]          DATE             NOT NULL,
        EventName       NVARCHAR(64)     NOT NULL,
        Route           NVARCHAR(256)    NULL,
        EventCount      INT              NOT NULL DEFAULT 0,
        UniqueUsers     INT              NOT NULL DEFAULT 0,
        P95DurationMs   INT              NULL,
        AvgDurationMs   INT              NULL,
        CONSTRAINT UQ_AnalyticsDaily_Date_Event_Route UNIQUE ([Date], EventName, Route)
    );

    PRINT 'Tabla AnalyticsDaily creada exitosamente';
END
ELSE
BEGIN
    PRINT 'La tabla AnalyticsDaily ya existe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsDaily_Date' AND object_id = OBJECT_ID('dbo.AnalyticsDaily'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsDaily_Date
    ON dbo.AnalyticsDaily ([Date])
    INCLUDE (EventName, Route, EventCount, UniqueUsers);
    PRINT 'Índice IX_AnalyticsDaily_Date creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AnalyticsDaily_EventName_Date' AND object_id = OBJECT_ID('dbo.AnalyticsDaily'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_AnalyticsDaily_EventName_Date
    ON dbo.AnalyticsDaily (EventName, [Date])
    INCLUDE (EventCount, UniqueUsers, P95DurationMs);
    PRINT 'Índice IX_AnalyticsDaily_EventName_Date creado';
END
GO
