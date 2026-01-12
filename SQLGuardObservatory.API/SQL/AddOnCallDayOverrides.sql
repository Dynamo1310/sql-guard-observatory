-- ============================================
-- Script: AddOnCallDayOverrides.sql
-- Descripción: Crea la tabla OnCallDayOverrides para permitir
--              coberturas de guardia por días individuales
--              (solo Team Escalamiento puede crear estas coberturas)
-- Fecha: 2025-12-30
-- ============================================

USE [SQLGuardObservatory]
GO

PRINT '=== INICIO DEL SCRIPT ==='

-- ============================================
-- 1. Crear tabla OnCallDayOverrides
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'OnCallDayOverrides') AND type in (N'U'))
BEGIN
    CREATE TABLE OnCallDayOverrides (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Fecha del día que se está cubriendo
        Date DATE NOT NULL,
        
        -- ID del operador original que tenía la guardia ese día
        OriginalUserId NVARCHAR(450) NOT NULL,
        
        -- ID del operador que cubrirá ese día
        CoverUserId NVARCHAR(450) NOT NULL,
        
        -- Motivo de la cobertura
        Reason NVARCHAR(500) NULL,
        
        -- ID del schedule original (opcional)
        OriginalScheduleId INT NULL,
        
        -- Usuario de escalamiento que creó esta cobertura
        CreatedByUserId NVARCHAR(450) NOT NULL,
        
        CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Indica si la cobertura está activa
        IsActive BIT NOT NULL DEFAULT 1,
        
        -- Foreign Keys
        CONSTRAINT FK_OnCallDayOverrides_OriginalUser FOREIGN KEY (OriginalUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallDayOverrides_CoverUser FOREIGN KEY (CoverUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallDayOverrides_OriginalSchedule FOREIGN KEY (OriginalScheduleId) 
            REFERENCES OnCallSchedules(Id) ON DELETE SET NULL,
        CONSTRAINT FK_OnCallDayOverrides_CreatedBy FOREIGN KEY (CreatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    PRINT 'Tabla OnCallDayOverrides creada exitosamente'
END
ELSE
BEGIN
    PRINT 'Tabla OnCallDayOverrides ya existe'
END
GO

-- ============================================
-- 2. Crear índices para mejor performance
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OnCallDayOverrides_Date' AND object_id = OBJECT_ID('OnCallDayOverrides'))
BEGIN
    CREATE INDEX IX_OnCallDayOverrides_Date ON OnCallDayOverrides(Date);
    PRINT 'Índice IX_OnCallDayOverrides_Date creado'
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OnCallDayOverrides_Active' AND object_id = OBJECT_ID('OnCallDayOverrides'))
BEGIN
    CREATE INDEX IX_OnCallDayOverrides_Active ON OnCallDayOverrides(Date, IsActive);
    PRINT 'Índice IX_OnCallDayOverrides_Active creado'
END
GO

-- ============================================
-- 3. Verificar creación
-- ============================================
PRINT ''
PRINT '=== VERIFICACIÓN ==='

SELECT 
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length AS MaxLength,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE object_id = OBJECT_ID('OnCallDayOverrides')
ORDER BY c.column_id;

PRINT ''
PRINT '=== FIN DEL SCRIPT ==='
GO



