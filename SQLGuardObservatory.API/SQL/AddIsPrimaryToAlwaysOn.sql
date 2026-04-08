-- Agregar columna IsPrimary a InstanceHealth_AlwaysOn
-- Indica si la instancia es la réplica primaria del Availability Group
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'IsPrimary')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD IsPrimary BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsPrimary agregada a InstanceHealth_AlwaysOn';
END
