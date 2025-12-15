-- =============================================
-- Script: FixEscalationOrder.sql
-- Descripción: Corrige la columna EscalationOrder
-- Base de datos: SQLGuardObservatoryAuth
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- Verificar si la columna existe
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('AspNetUsers') 
    AND name = 'EscalationOrder'
)
BEGIN
    ALTER TABLE AspNetUsers ADD EscalationOrder INT NULL;
    PRINT 'Columna EscalationOrder agregada';
END
ELSE
BEGIN
    PRINT 'Columna EscalationOrder ya existe';
END
GO

-- Ahora actualizar los valores (en un batch separado)
UPDATE AspNetUsers SET EscalationOrder = 1 WHERE DomainUser = 'PM43314';
UPDATE AspNetUsers SET EscalationOrder = 2 WHERE DomainUser = 'PR67231';
UPDATE AspNetUsers SET EscalationOrder = 3 WHERE DomainUser = 'RT33863';

PRINT 'Orden de escalamiento actualizado';
GO

-- Verificar
SELECT DomainUser, DisplayName, IsOnCallEscalation, EscalationOrder 
FROM AspNetUsers 
WHERE IsOnCallEscalation = 1 OR EscalationOrder IS NOT NULL
ORDER BY EscalationOrder;
GO


