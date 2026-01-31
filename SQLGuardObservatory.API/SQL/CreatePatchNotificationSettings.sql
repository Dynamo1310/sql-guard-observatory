-- ============================================
-- Script: CreatePatchNotificationSettings.sql
-- Descripción: Tabla para configurar las notificaciones de parcheo
-- Fecha: 2026
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Crear tabla PatchNotificationSettings
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PatchNotificationSettings]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PatchNotificationSettings] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [NotificationType] NVARCHAR(50) NOT NULL,             -- T48h, T2h, TFin
        [IsEnabled] BIT NOT NULL DEFAULT 1,                   -- Si está habilitada
        [HoursBefore] INT NULL,                               -- Horas antes del parcheo (para T-Xh)
        [RecipientType] NVARCHAR(50) NOT NULL,                -- Operator, Cell, Owner, All
        [EmailSubjectTemplate] NVARCHAR(500) NULL,            -- Template del asunto
        [EmailBodyTemplate] NVARCHAR(MAX) NULL,               -- Template del cuerpo del email
        [Description] NVARCHAR(200) NULL,                     -- Descripción de la notificación
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        CONSTRAINT [UQ_PatchNotificationSettings_Type] UNIQUE ([NotificationType])
    );
    
    PRINT 'Tabla PatchNotificationSettings creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla PatchNotificationSettings ya existe';
END
GO

-- ============================================
-- 2. Insertar datos iniciales
-- ============================================
IF NOT EXISTS (SELECT * FROM [dbo].[PatchNotificationSettings])
BEGIN
    INSERT INTO [dbo].[PatchNotificationSettings] 
    ([NotificationType], [IsEnabled], [HoursBefore], [RecipientType], [EmailSubjectTemplate], [EmailBodyTemplate], [Description])
    VALUES 
    (
        'T48h', 
        1, 
        48, 
        'All',
        '[SQL Nova] Recordatorio: Parcheo programado en 48 horas - {ServerName}',
        '<html>
<body style="font-family: Arial, sans-serif;">
<h2>Recordatorio de Parcheo Programado</h2>
<p>Estimado/a {RecipientName},</p>
<p>Le recordamos que en <strong>48 horas</strong> se realizará un parcheo programado:</p>
<table style="border-collapse: collapse; margin: 20px 0;">
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Servidor:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{ServerName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Instancia:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{InstanceName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Fecha:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{ScheduledDate}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Ventana:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{WindowStart} - {WindowEnd}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Operador:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{OperatorName}</td></tr>
</table>
<p>Por favor asegúrese de:</p>
<ul>
<li>Verificar que no hay procesos batch críticos en la ventana</li>
<li>Confirmar disponibilidad para validación post-parcheo</li>
<li>Notificar a usuarios afectados si es necesario</li>
</ul>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>',
        'Recordatorio 48 horas antes del parcheo'
    ),
    (
        'T2h', 
        1, 
        2, 
        'Operator',
        '[SQL Nova] ALERTA: Parcheo en 2 horas - {ServerName}',
        '<html>
<body style="font-family: Arial, sans-serif;">
<h2 style="color: #e67e22;">Arranca Ventana de Parcheo</h2>
<p>Estimado/a {RecipientName},</p>
<p>La ventana de parcheo comienza en <strong>2 horas</strong>:</p>
<table style="border-collapse: collapse; margin: 20px 0;">
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Servidor:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{ServerName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Instancia:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{InstanceName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Versión actual:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{CurrentVersion}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Versión objetivo:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{TargetVersion}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Hora inicio:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{WindowStart}</td></tr>
</table>
<p><strong>Checklist pre-parcheo:</strong></p>
<ul>
<li>[ ] Verificar conectividad al servidor</li>
<li>[ ] Confirmar disponibilidad del parche</li>
<li>[ ] Verificar backups recientes</li>
<li>[ ] Preparar plan de rollback</li>
</ul>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>',
        'Alerta 2 horas antes del parcheo'
    ),
    (
        'TFin', 
        1, 
        0, 
        'Operator',
        '[SQL Nova] Parcheo finalizado - Validación requerida - {ServerName}',
        '<html>
<body style="font-family: Arial, sans-serif;">
<h2 style="color: #27ae60;">Ventana de Parcheo Finalizada</h2>
<p>Estimado/a {RecipientName},</p>
<p>La ventana de parcheo ha finalizado para:</p>
<table style="border-collapse: collapse; margin: 20px 0;">
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Servidor:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{ServerName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Instancia:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{InstanceName}</td></tr>
<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Ventana:</strong></td><td style="padding: 8px; border: 1px solid #ddd;">{WindowStart} - {WindowEnd}</td></tr>
</table>
<p><strong>Acciones requeridas:</strong></p>
<ul>
<li>[ ] Subir evidencia del parcheo en SQL Nova</li>
<li>[ ] Validar que el servidor está operativo</li>
<li>[ ] Marcar el estado del parcheo (Completado/Fallido)</li>
<li>[ ] Documentar cualquier incidencia</li>
</ul>
<p><a href="{NovaUrl}/patching/planner" style="background-color: #3498db; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Ir a SQL Nova</a></p>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>',
        'Notificación al finalizar la ventana de parcheo'
    );
    
    PRINT 'Datos iniciales insertados en PatchNotificationSettings';
END
GO

-- ============================================
-- 3. Crear tabla para historial de notificaciones enviadas
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PatchNotificationHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PatchNotificationHistory] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [PatchPlanId] INT NOT NULL,                           -- FK a PatchPlans
        [NotificationType] NVARCHAR(50) NOT NULL,             -- T48h, T2h, TFin
        [RecipientEmail] NVARCHAR(256) NOT NULL,
        [RecipientName] NVARCHAR(256) NULL,
        [Subject] NVARCHAR(500) NULL,
        [SentAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [WasSuccessful] BIT NOT NULL DEFAULT 1,
        [ErrorMessage] NVARCHAR(500) NULL,
        
        CONSTRAINT [FK_PatchNotificationHistory_PatchPlan] 
            FOREIGN KEY ([PatchPlanId]) REFERENCES [dbo].[PatchPlans]([Id]) ON DELETE CASCADE
    );
    
    PRINT 'Tabla PatchNotificationHistory creada exitosamente';
END
GO

-- ============================================
-- 4. Crear índices
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchNotificationHistory_PatchPlanId' AND object_id = OBJECT_ID('PatchNotificationHistory'))
BEGIN
    CREATE INDEX [IX_PatchNotificationHistory_PatchPlanId] ON [dbo].[PatchNotificationHistory]([PatchPlanId]);
    PRINT 'Índice IX_PatchNotificationHistory_PatchPlanId creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchNotificationHistory_SentAt' AND object_id = OBJECT_ID('PatchNotificationHistory'))
BEGIN
    CREATE INDEX [IX_PatchNotificationHistory_SentAt] ON [dbo].[PatchNotificationHistory]([SentAt]);
    PRINT 'Índice IX_PatchNotificationHistory_SentAt creado';
END
GO

-- ============================================
-- 5. Verificar estructura creada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script CreatePatchNotificationSettings.sql completado';
PRINT '============================================';
PRINT '';

SELECT * FROM [dbo].[PatchNotificationSettings];
GO
