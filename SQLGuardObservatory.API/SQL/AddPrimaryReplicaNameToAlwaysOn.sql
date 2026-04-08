-- Agregar columna PrimaryReplicaName a InstanceHealth_AlwaysOn
-- Cada registro (primario o secundario) almacena el nombre de la réplica primaria del AG
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'PrimaryReplicaName')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD PrimaryReplicaName NVARCHAR(255) NULL;
    PRINT 'Columna PrimaryReplicaName agregada a InstanceHealth_AlwaysOn';
END
