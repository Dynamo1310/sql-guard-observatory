-- =====================================================
-- Cleanup: Eliminar columna obsoleta TempDBAvgLatencyMs
-- =====================================================
-- Este script elimina la columna vieja que quedó en la
-- migración anterior porque tenía un constraint DEFAULT
-- =====================================================

USE SQLNova;
GO

PRINT '🔧 Eliminando columna obsoleta...';
PRINT '';

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBAvgLatencyMs')
BEGIN
    -- Primero eliminar el constraint DEFAULT si existe
    DECLARE @ConstraintName NVARCHAR(200);
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]')
      AND c.name = 'TempDBAvgLatencyMs';
    
    IF @ConstraintName IS NOT NULL
    BEGIN
        DECLARE @SQL NVARCHAR(MAX) = 'ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] DROP CONSTRAINT [' + @ConstraintName + ']';
        EXEC sp_executesql @SQL;
        PRINT '✅ Eliminado constraint: ' + @ConstraintName;
    END
    
    -- Ahora eliminar la columna
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] DROP COLUMN [TempDBAvgLatencyMs];
    PRINT '✅ Eliminada columna obsoleta: TempDBAvgLatencyMs';
END
ELSE
BEGIN
    PRINT '⚠️  La columna TempDBAvgLatencyMs ya no existe';
END

PRINT '';
PRINT '═══════════════════════════════════════════════════';
PRINT '✅ Cleanup completado!';
PRINT '═══════════════════════════════════════════════════';
GO

