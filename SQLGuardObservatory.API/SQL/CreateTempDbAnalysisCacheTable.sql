/*
===============================================================================
Script: Crear tabla TempDbAnalysisCache
Descripción: Tabla de caché para resultados del analizador de mejores prácticas
             de TempDB. Almacena los resultados por instancia para no tener que 
             re-ejecutar el análisis en cada carga de página.
===============================================================================
*/

IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[TempDbAnalysisCache]') AND type = 'U')
BEGIN
    CREATE TABLE [dbo].[TempDbAnalysisCache] (
        [Id]                INT             IDENTITY(1,1) NOT NULL,
        [InstanceName]      NVARCHAR(255)   NOT NULL,
        [Ambiente]          NVARCHAR(100)   NULL,
        [HostingSite]       NVARCHAR(100)   NULL,
        [MajorVersion]      NVARCHAR(100)   NULL,
        [ConnectionSuccess] BIT             NOT NULL DEFAULT 0,
        [ErrorMessage]      NVARCHAR(MAX)   NULL,
        [ResultsJson]       NVARCHAR(MAX)   NOT NULL DEFAULT '[]',
        [OverallScore]      INT             NOT NULL DEFAULT 0,
        [AnalyzedAt]        DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),

        CONSTRAINT [PK_TempDbAnalysisCache] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [UQ_TempDbAnalysisCache_InstanceName] UNIQUE ([InstanceName])
    );

    CREATE NONCLUSTERED INDEX [IX_TempDbAnalysisCache_OverallScore]
        ON [dbo].[TempDbAnalysisCache] ([OverallScore])
        INCLUDE ([InstanceName], [Ambiente], [ConnectionSuccess], [AnalyzedAt]);

    PRINT 'Tabla TempDbAnalysisCache creada correctamente.';
END
ELSE
BEGIN
    PRINT 'La tabla TempDbAnalysisCache ya existe.';
END
GO
