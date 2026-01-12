-- =============================================
-- Script: AddActivationImprovements.sql
-- Descripción: Agrega nuevas tablas y columnas para mejoras en activaciones,
--              templates de email, categorías configurables y aprobación de calendarios
-- Fecha: 2025-12-30
-- =============================================

USE [SQLNova]
GO

PRINT '=== INICIO DEL SCRIPT AddActivationImprovements ==='
PRINT ''

-- =============================================
-- 1. Agregar columnas ServiceDeskUrl y Status a OnCallActivations
-- =============================================
PRINT '1. Agregando columnas ServiceDeskUrl y Status a OnCallActivations...'

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallActivations') AND name = 'ServiceDeskUrl')
BEGIN
    ALTER TABLE OnCallActivations ADD ServiceDeskUrl NVARCHAR(500) NULL;
    PRINT '   Columna ServiceDeskUrl agregada'
END
ELSE
BEGIN
    PRINT '   Columna ServiceDeskUrl ya existe'
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallActivations') AND name = 'Status')
BEGIN
    ALTER TABLE OnCallActivations ADD Status NVARCHAR(20) NOT NULL DEFAULT 'Pending';
    PRINT '   Columna Status agregada'
END
ELSE
BEGIN
    PRINT '   Columna Status ya existe'
END
GO

-- =============================================
-- 2. Crear tabla OnCallScheduleBatches (para aprobación de calendarios)
-- =============================================
PRINT ''
PRINT '2. Creando tabla OnCallScheduleBatches...'

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallScheduleBatches')
BEGIN
    CREATE TABLE OnCallScheduleBatches (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        StartDate DATETIME2 NOT NULL,
        EndDate DATETIME2 NOT NULL,
        WeeksGenerated INT NOT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Approved',
        GeneratedByUserId NVARCHAR(450) NOT NULL,
        GeneratedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        ApproverUserId NVARCHAR(450) NULL,
        ApprovedAt DATETIME2 NULL,
        ApprovedByUserId NVARCHAR(450) NULL,
        RejectionReason NVARCHAR(500) NULL,
        CONSTRAINT FK_OnCallScheduleBatches_GeneratedBy FOREIGN KEY (GeneratedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallScheduleBatches_Approver FOREIGN KEY (ApproverUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallScheduleBatches_ApprovedBy FOREIGN KEY (ApprovedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    CREATE INDEX IX_OnCallScheduleBatches_Status ON OnCallScheduleBatches(Status);
    CREATE INDEX IX_OnCallScheduleBatches_GeneratedAt ON OnCallScheduleBatches(GeneratedAt);
    
    PRINT '   Tabla OnCallScheduleBatches creada'
END
ELSE
BEGIN
    PRINT '   Tabla OnCallScheduleBatches ya existe'
END
GO

-- =============================================
-- 3. Agregar columna BatchId a OnCallSchedules
-- =============================================
PRINT ''
PRINT '3. Agregando columna BatchId a OnCallSchedules...'

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallSchedules') AND name = 'BatchId')
BEGIN
    ALTER TABLE OnCallSchedules ADD BatchId INT NULL;
    
    ALTER TABLE OnCallSchedules ADD CONSTRAINT FK_OnCallSchedules_Batch 
        FOREIGN KEY (BatchId) REFERENCES OnCallScheduleBatches(Id) ON DELETE SET NULL;
    
    CREATE INDEX IX_OnCallSchedules_BatchId ON OnCallSchedules(BatchId);
    
    PRINT '   Columna BatchId agregada a OnCallSchedules'
END
ELSE
BEGIN
    PRINT '   Columna BatchId ya existe en OnCallSchedules'
END
GO

-- =============================================
-- 4. Crear tabla OnCallEmailTemplates
-- =============================================
PRINT ''
PRINT '4. Creando tabla OnCallEmailTemplates...'

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallEmailTemplates')
BEGIN
    CREATE TABLE OnCallEmailTemplates (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        AlertType NVARCHAR(50) NOT NULL,
        Name NVARCHAR(200) NOT NULL,
        Subject NVARCHAR(500) NOT NULL,
        Body NVARCHAR(MAX) NOT NULL,
        AttachExcel BIT NOT NULL DEFAULT 0,
        IsEnabled BIT NOT NULL DEFAULT 1,
        IsDefault BIT NOT NULL DEFAULT 0,
        CreatedByUserId NVARCHAR(450) NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        UpdatedByUserId NVARCHAR(450) NULL,
        UpdatedAt DATETIME2 NULL,
        CONSTRAINT FK_OnCallEmailTemplates_CreatedBy FOREIGN KEY (CreatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallEmailTemplates_UpdatedBy FOREIGN KEY (UpdatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    CREATE INDEX IX_OnCallEmailTemplates_AlertType ON OnCallEmailTemplates(AlertType);
    
    PRINT '   Tabla OnCallEmailTemplates creada'
END
ELSE
BEGIN
    PRINT '   Tabla OnCallEmailTemplates ya existe'
END
GO

-- =============================================
-- 5. Crear tabla OnCallActivationCategories
-- =============================================
PRINT ''
PRINT '5. Creando tabla OnCallActivationCategories...'

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallActivationCategories')
BEGIN
    CREATE TABLE OnCallActivationCategories (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Name NVARCHAR(100) NOT NULL,
        Icon NVARCHAR(50) NULL,
        IsDefault BIT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        [Order] INT NOT NULL DEFAULT 0,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        CreatedByUserId NVARCHAR(450) NULL,
        CONSTRAINT FK_OnCallActivationCategories_CreatedBy FOREIGN KEY (CreatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    CREATE INDEX IX_OnCallActivationCategories_Order ON OnCallActivationCategories([Order]);
    
    PRINT '   Tabla OnCallActivationCategories creada'
END
ELSE
BEGIN
    PRINT '   Tabla OnCallActivationCategories ya existe'
END
GO

-- =============================================
-- 6. Insertar categorías por defecto
-- =============================================
PRINT ''
PRINT '6. Insertando categorías por defecto...'

IF NOT EXISTS (SELECT 1 FROM OnCallActivationCategories WHERE Name = 'Database')
BEGIN
    INSERT INTO OnCallActivationCategories (Name, Icon, IsDefault, IsActive, [Order])
    VALUES 
        ('Database', 'Database', 1, 1, 1),
        ('Performance', 'Zap', 1, 1, 2),
        ('Connectivity', 'Wifi', 1, 1, 3),
        ('Backup', 'HardDrive', 1, 1, 4),
        ('Security', 'Shield', 1, 1, 5),
        ('Other', 'AlertTriangle', 1, 1, 6);
    
    PRINT '   Categorías por defecto insertadas'
END
ELSE
BEGIN
    PRINT '   Categorías por defecto ya existen'
END
GO

-- =============================================
-- 7. Insertar templates de email por defecto
-- =============================================
PRINT ''
PRINT '7. Insertando templates de email por defecto...'

IF NOT EXISTS (SELECT 1 FROM OnCallEmailTemplates WHERE AlertType = 'ScheduleGenerated' AND IsDefault = 1)
BEGIN
    INSERT INTO OnCallEmailTemplates (AlertType, Name, Subject, Body, AttachExcel, IsEnabled, IsDefault)
    VALUES (
        'ScheduleGenerated',
        'Notificación de Calendario Generado',
        '[SQLNova] Calendario de Guardias DBA Generado',
        '<p>Se ha generado un nuevo calendario de guardias DBA.</p>
<p><strong>Período:</strong></p>
<ul>
<li>Desde: {{FechaInicio}}</li>
<li>Hasta: {{FechaFin}}</li>
<li>Total: {{Semanas}} semanas</li>
</ul>
<p>Todos los operadores pueden consultar el calendario actualizado en la aplicación.</p>
<p><a href="{{LinkApp}}">Ver Calendario de Guardias</a></p>',
        1, -- AttachExcel
        1, -- IsEnabled
        1  -- IsDefault
    );
    
    PRINT '   Template ScheduleGenerated insertado'
END
ELSE
BEGIN
    PRINT '   Template ScheduleGenerated ya existe'
END
GO

-- =============================================
-- 8. Actualizar activaciones existentes sin Status
-- =============================================
PRINT ''
PRINT '8. Actualizando activaciones existentes...'

UPDATE OnCallActivations 
SET Status = CASE 
    WHEN ResolvedAt IS NOT NULL THEN 'Resolved'
    ELSE 'Pending'
END
WHERE Status IS NULL OR Status = '';

PRINT '   Activaciones actualizadas'
GO

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================
PRINT ''
PRINT '=== VERIFICACIÓN DE CAMBIOS ==='

-- Verificar columnas en OnCallActivations
SELECT 'OnCallActivations Columns' AS [Table],
       COUNT(*) AS [NewColumns]
FROM sys.columns 
WHERE object_id = OBJECT_ID('OnCallActivations') 
AND name IN ('ServiceDeskUrl', 'Status');

-- Verificar tabla OnCallScheduleBatches
SELECT 'OnCallScheduleBatches' AS [Table],
       COUNT(*) AS [Records]
FROM OnCallScheduleBatches;

-- Verificar columna BatchId en OnCallSchedules
SELECT 'OnCallSchedules.BatchId' AS [Column],
       CASE WHEN EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallSchedules') AND name = 'BatchId')
            THEN 'Exists' ELSE 'Not Found' END AS [Status];

-- Verificar tabla OnCallEmailTemplates
SELECT 'OnCallEmailTemplates' AS [Table],
       COUNT(*) AS [Records]
FROM OnCallEmailTemplates;

-- Verificar tabla OnCallActivationCategories
SELECT 'OnCallActivationCategories' AS [Table],
       COUNT(*) AS [Records]
FROM OnCallActivationCategories;

PRINT ''
PRINT '=== FIN DEL SCRIPT ==='
GO

