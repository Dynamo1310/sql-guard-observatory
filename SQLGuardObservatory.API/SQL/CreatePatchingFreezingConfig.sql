-- ============================================
-- Script: CreatePatchingFreezingConfig.sql
-- Descripción: Tabla para configurar las semanas de freezing mensual
-- Fecha: 2026
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Crear tabla PatchingFreezingConfig
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PatchingFreezingConfig]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PatchingFreezingConfig] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [WeekOfMonth] INT NOT NULL,                           -- Semana del mes (1-5)
        [IsFreezingWeek] BIT NOT NULL DEFAULT 0,              -- Si está en freezing
        [Description] NVARCHAR(200) NULL,                     -- Descripción opcional
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        CONSTRAINT [UQ_PatchingFreezingConfig_WeekOfMonth] UNIQUE ([WeekOfMonth]),
        CONSTRAINT [CK_PatchingFreezingConfig_WeekOfMonth] CHECK ([WeekOfMonth] >= 1 AND [WeekOfMonth] <= 5)
    );
    
    PRINT 'Tabla PatchingFreezingConfig creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla PatchingFreezingConfig ya existe';
END
GO

-- ============================================
-- 2. Insertar datos iniciales (semanas 1-5)
-- ============================================
IF NOT EXISTS (SELECT * FROM [dbo].[PatchingFreezingConfig])
BEGIN
    INSERT INTO [dbo].[PatchingFreezingConfig] ([WeekOfMonth], [IsFreezingWeek], [Description])
    VALUES 
        (1, 1, 'Primera semana - Freezing por cierre contable'),
        (2, 1, 'Segunda semana - Freezing'),
        (3, 0, 'Tercera semana - Disponible para parcheos'),
        (4, 0, 'Cuarta semana - Disponible para parcheos'),
        (5, 0, 'Quinta semana - Disponible para parcheos (si aplica)');
    
    PRINT 'Datos iniciales insertados en PatchingFreezingConfig';
END
GO

-- ============================================
-- 3. Función para obtener semana del mes
-- ============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[fn_GetWeekOfMonth]') AND type in (N'FN', N'IF', N'TF', N'FS', N'FT'))
BEGIN
    DROP FUNCTION [dbo].[fn_GetWeekOfMonth];
END
GO

CREATE FUNCTION [dbo].[fn_GetWeekOfMonth](@Date DATE)
RETURNS INT
AS
BEGIN
    DECLARE @FirstDayOfMonth DATE = DATEFROMPARTS(YEAR(@Date), MONTH(@Date), 1);
    DECLARE @WeekOfMonth INT;
    
    -- Calcular la semana del mes basada en el día
    SET @WeekOfMonth = (DAY(@Date) - 1) / 7 + 1;
    
    RETURN @WeekOfMonth;
END
GO

PRINT 'Función fn_GetWeekOfMonth creada';
GO

-- ============================================
-- 4. Función para verificar si una fecha está en freezing
-- ============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[fn_IsDateInFreezing]') AND type in (N'FN', N'IF', N'TF', N'FS', N'FT'))
BEGIN
    DROP FUNCTION [dbo].[fn_IsDateInFreezing];
END
GO

CREATE FUNCTION [dbo].[fn_IsDateInFreezing](@Date DATE)
RETURNS BIT
AS
BEGIN
    DECLARE @WeekOfMonth INT = [dbo].[fn_GetWeekOfMonth](@Date);
    DECLARE @IsFreezing BIT = 0;
    
    SELECT @IsFreezing = [IsFreezingWeek]
    FROM [dbo].[PatchingFreezingConfig]
    WHERE [WeekOfMonth] = @WeekOfMonth;
    
    RETURN ISNULL(@IsFreezing, 0);
END
GO

PRINT 'Función fn_IsDateInFreezing creada';
GO

-- ============================================
-- 5. Verificar estructura creada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script CreatePatchingFreezingConfig.sql completado';
PRINT '============================================';
PRINT '';

SELECT * FROM [dbo].[PatchingFreezingConfig];
GO
