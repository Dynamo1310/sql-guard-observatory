IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'Datacenter')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD Datacenter NVARCHAR(50) NULL;
    PRINT 'Columna Datacenter agregada a InstanceHealth_AlwaysOn';
END
