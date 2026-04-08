IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DbaAbsences' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[DbaAbsences] (
        [Id]              INT            IDENTITY(1,1) NOT NULL,
        [UserId]          NVARCHAR(450)  NOT NULL,
        [Date]            DATETIME2      NOT NULL,
        [Reason]          NVARCHAR(200)  NOT NULL,
        [Notes]           NVARCHAR(500)  NULL,
        [CreatedByUserId] NVARCHAR(450)  NOT NULL,
        [CreatedAt]       DATETIME2      NOT NULL DEFAULT GETUTCDATE(),
        CONSTRAINT [PK_DbaAbsences] PRIMARY KEY CLUSTERED ([Id]),
        CONSTRAINT [FK_DbaAbsences_User] FOREIGN KEY ([UserId]) REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_DbaAbsences_CreatedBy] FOREIGN KEY ([CreatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    CREATE INDEX [IX_DbaAbsences_UserId] ON [dbo].[DbaAbsences] ([UserId]);
    CREATE INDEX [IX_DbaAbsences_Date] ON [dbo].[DbaAbsences] ([Date]);
    CREATE INDEX [IX_DbaAbsences_UserId_Date] ON [dbo].[DbaAbsences] ([UserId], [Date]);
END
GO
