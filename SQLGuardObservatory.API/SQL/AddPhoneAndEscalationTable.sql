-- =============================================
-- Script: AddPhoneAndEscalationTable.sql
-- Descripción: Agrega campo PhoneNumber a OnCallOperators y crea tabla OnCallEscalations
-- Fecha: 2025-01-XX
-- =============================================

USE [SQLGuardObservatoryDB]
GO

PRINT '=== INICIO DEL SCRIPT ==='
PRINT ''

-- =============================================
-- 1. Agregar PhoneNumber a OnCallOperators
-- =============================================
PRINT '1. Agregando columna PhoneNumber a OnCallOperators...'

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallOperators') AND name = 'PhoneNumber')
BEGIN
    ALTER TABLE OnCallOperators
    ADD PhoneNumber NVARCHAR(20) NULL;
    PRINT '   Columna PhoneNumber agregada a OnCallOperators'
END
ELSE
BEGIN
    PRINT '   Columna PhoneNumber ya existe en OnCallOperators'
END
GO

-- =============================================
-- 2. Crear tabla OnCallEscalations
-- =============================================
PRINT ''
PRINT '2. Creando tabla OnCallEscalations...'

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallEscalations')
BEGIN
    CREATE TABLE [dbo].[OnCallEscalations] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [EscalationOrder] INT NOT NULL DEFAULT 1,
        [ColorCode] NVARCHAR(7) NULL,
        [PhoneNumber] NVARCHAR(20) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2(7) NULL,
        
        CONSTRAINT [PK_OnCallEscalations] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_OnCallEscalations_Users] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers] ([Id]) ON DELETE CASCADE
    );
    
    -- Crear índices
    CREATE UNIQUE INDEX [IX_OnCallEscalations_UserId] ON [dbo].[OnCallEscalations] ([UserId]);
    CREATE INDEX [IX_OnCallEscalations_EscalationOrder] ON [dbo].[OnCallEscalations] ([EscalationOrder]);
    
    PRINT '   Tabla OnCallEscalations creada exitosamente'
END
ELSE
BEGIN
    PRINT '   Tabla OnCallEscalations ya existe'
END
GO

-- =============================================
-- 3. Migrar datos de escalamiento existentes
-- =============================================
PRINT ''
PRINT '3. Migrando usuarios de escalamiento existentes...'

-- Migrar usuarios que tienen IsOnCallEscalation = 1 a la nueva tabla
INSERT INTO [dbo].[OnCallEscalations] ([UserId], [EscalationOrder], [IsActive], [CreatedAt])
SELECT 
    u.[Id],
    ISNULL(u.[EscalationOrder], ROW_NUMBER() OVER (ORDER BY u.[DisplayName])),
    1,
    GETUTCDATE()
FROM [dbo].[AspNetUsers] u
WHERE u.[IsOnCallEscalation] = 1
    AND NOT EXISTS (SELECT 1 FROM [dbo].[OnCallEscalations] e WHERE e.[UserId] = u.[Id]);

DECLARE @MigratedCount INT = @@ROWCOUNT;
PRINT '   ' + CAST(@MigratedCount AS NVARCHAR(10)) + ' usuarios de escalamiento migrados'
GO

-- =============================================
-- 4. Asignar colores por defecto a los escalamientos
-- =============================================
PRINT ''
PRINT '4. Asignando colores por defecto a escalamientos sin color...'

-- Colores por defecto para escalamiento (tonos ámbar/naranjas)
DECLARE @Colors TABLE (Id INT IDENTITY(1,1), Color NVARCHAR(7));
INSERT INTO @Colors (Color) VALUES 
    ('#f59e0b'), -- amber
    ('#f97316'), -- orange
    ('#ef4444'), -- red
    ('#ec4899'), -- pink
    ('#d946ef'), -- fuchsia
    ('#8b5cf6'), -- violet
    ('#6366f1'), -- indigo
    ('#3b82f6'), -- blue
    ('#06b6d4'), -- cyan
    ('#10b981'); -- emerald

UPDATE e
SET e.[ColorCode] = c.Color
FROM [dbo].[OnCallEscalations] e
INNER JOIN (
    SELECT 
        [Id], 
        ROW_NUMBER() OVER (ORDER BY [EscalationOrder]) AS RowNum
    FROM [dbo].[OnCallEscalations]
    WHERE [ColorCode] IS NULL
) AS ranked ON e.[Id] = ranked.[Id]
INNER JOIN @Colors c ON ((ranked.RowNum - 1) % 10) + 1 = c.Id;

DECLARE @ColoredCount INT = @@ROWCOUNT;
PRINT '   ' + CAST(@ColoredCount AS NVARCHAR(10)) + ' escalamientos actualizados con colores'
GO

-- =============================================
-- 5. Verificación final
-- =============================================
PRINT ''
PRINT '=== VERIFICACIÓN FINAL ==='

-- Verificar columna PhoneNumber en OnCallOperators
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallOperators') AND name = 'PhoneNumber')
BEGIN
    PRINT '✓ Columna PhoneNumber existe en OnCallOperators'
END

-- Verificar tabla OnCallEscalations
IF EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallEscalations')
BEGIN
    PRINT '✓ Tabla OnCallEscalations existe'
    
    DECLARE @EscCount INT;
    SELECT @EscCount = COUNT(*) FROM [dbo].[OnCallEscalations];
    PRINT '  - ' + CAST(@EscCount AS NVARCHAR(10)) + ' registros en OnCallEscalations'
END

-- Mostrar operadores con sus teléfonos (si hay)
PRINT ''
PRINT '=== OPERADORES ==='
SELECT 
    o.[Id],
    u.[DisplayName] AS Nombre,
    u.[DomainUser] AS Usuario,
    o.[RotationOrder] AS Orden,
    o.[ColorCode] AS Color,
    ISNULL(o.[PhoneNumber], '(sin teléfono)') AS Telefono
FROM [dbo].[OnCallOperators] o
INNER JOIN [dbo].[AspNetUsers] u ON o.[UserId] = u.[Id]
ORDER BY o.[RotationOrder];

-- Mostrar escalamientos
PRINT ''
PRINT '=== ESCALAMIENTOS ==='
SELECT 
    e.[Id],
    u.[DisplayName] AS Nombre,
    u.[DomainUser] AS Usuario,
    e.[EscalationOrder] AS Orden,
    e.[ColorCode] AS Color,
    ISNULL(e.[PhoneNumber], '(sin teléfono)') AS Telefono
FROM [dbo].[OnCallEscalations] e
INNER JOIN [dbo].[AspNetUsers] u ON e.[UserId] = u.[Id]
ORDER BY e.[EscalationOrder];

PRINT ''
PRINT '=== FIN DEL SCRIPT ==='
GO



