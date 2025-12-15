-- =============================================
-- Script: CreateOnCallTablesV2.sql
-- Descripción: Crea las tablas adicionales para el sistema completo de guardias DBA
-- Base de datos: SQLGuardObservatoryAuth
-- Versión: 2.0
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- =============================================
-- 1. Configuración SMTP Global
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'SmtpSettings')
BEGIN
    CREATE TABLE SmtpSettings (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Host NVARCHAR(255) NOT NULL,
        Port INT NOT NULL DEFAULT 25,
        FromEmail NVARCHAR(255) NOT NULL,
        FromName NVARCHAR(100) NOT NULL DEFAULT 'SQL Guard Observatory',
        EnableSsl BIT NOT NULL DEFAULT 0,
        Username NVARCHAR(100) NULL,
        Password NVARCHAR(255) NULL, -- Encrypted
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        UpdatedByUserId NVARCHAR(450) NULL
    );
    
    -- Insertar configuración por defecto
    INSERT INTO SmtpSettings (Host, Port, FromEmail, FromName, EnableSsl)
    VALUES ('NLB-PROD-POSTFIX-06902113c7afb95c.elb.us-east-1.amazonaws.com', 25, 'base.datos@supervielle.com.ar', 'SQL Guard Observatory', 0);
    
    PRINT 'Tabla SmtpSettings creada con configuración inicial';
END
ELSE
BEGIN
    PRINT 'Tabla SmtpSettings ya existe';
END
GO

-- =============================================
-- 2. Activaciones de Guardia (llamados e incidentes)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallActivations')
BEGIN
    CREATE TABLE OnCallActivations (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Relación con la guardia
        ScheduleId INT NOT NULL,
        OperatorUserId NVARCHAR(450) NOT NULL,
        
        -- Información del llamado
        ActivatedAt DATETIME2 NOT NULL,
        ResolvedAt DATETIME2 NULL,
        DurationMinutes INT NULL,
        
        -- Categoría del incidente
        Category NVARCHAR(50) NOT NULL, -- 'Database', 'Performance', 'Connectivity', 'Backup', 'Security', 'Other'
        Severity NVARCHAR(20) NOT NULL, -- 'Low', 'Medium', 'High', 'Critical'
        
        -- Detalle
        Title NVARCHAR(200) NOT NULL,
        Description NVARCHAR(2000) NULL,
        Resolution NVARCHAR(2000) NULL,
        
        -- Instancia afectada (opcional)
        InstanceName NVARCHAR(200) NULL,
        
        -- Metadata
        CreatedByUserId NVARCHAR(450) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_OnCallActivations_Schedule FOREIGN KEY (ScheduleId) 
            REFERENCES OnCallSchedules(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallActivations_Operator FOREIGN KEY (OperatorUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION,
        CONSTRAINT FK_OnCallActivations_CreatedBy FOREIGN KEY (CreatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    CREATE INDEX IX_OnCallActivations_ScheduleId ON OnCallActivations(ScheduleId);
    CREATE INDEX IX_OnCallActivations_OperatorUserId ON OnCallActivations(OperatorUserId);
    CREATE INDEX IX_OnCallActivations_ActivatedAt ON OnCallActivations(ActivatedAt);
    CREATE INDEX IX_OnCallActivations_Category ON OnCallActivations(Category);
    
    PRINT 'Tabla OnCallActivations creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallActivations ya existe';
END
GO

-- =============================================
-- 3. Reglas de Alertas
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallAlertRules')
BEGIN
    CREATE TABLE OnCallAlertRules (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Información de la regla
        Name NVARCHAR(100) NOT NULL,
        Description NVARCHAR(500) NULL,
        
        -- Tipo de alerta
        AlertType NVARCHAR(50) NOT NULL, 
        -- 'ScheduleGenerated', 'DaysRemaining', 'SwapRequested', 'SwapApproved', 
        -- 'SwapRejected', 'ScheduleModified', 'ActivationCreated', 'Custom'
        
        -- Condición (para alertas tipo DaysRemaining)
        ConditionDays INT NULL, -- Ej: alertar cuando falten X días
        
        -- Estado
        IsEnabled BIT NOT NULL DEFAULT 1,
        
        -- Metadata
        CreatedByUserId NVARCHAR(450) NOT NULL,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAt DATETIME2 NULL,
        
        CONSTRAINT FK_OnCallAlertRules_CreatedBy FOREIGN KEY (CreatedByUserId) 
            REFERENCES AspNetUsers(Id) ON DELETE NO ACTION
    );
    
    PRINT 'Tabla OnCallAlertRules creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallAlertRules ya existe';
END
GO

-- =============================================
-- 4. Destinatarios de Alertas
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'OnCallAlertRecipients')
BEGIN
    CREATE TABLE OnCallAlertRecipients (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        AlertRuleId INT NOT NULL,
        Email NVARCHAR(255) NOT NULL,
        Name NVARCHAR(100) NULL,
        
        IsEnabled BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        
        CONSTRAINT FK_OnCallAlertRecipients_Rule FOREIGN KEY (AlertRuleId) 
            REFERENCES OnCallAlertRules(Id) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_OnCallAlertRecipients_AlertRuleId ON OnCallAlertRecipients(AlertRuleId);
    
    PRINT 'Tabla OnCallAlertRecipients creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OnCallAlertRecipients ya existe';
END
GO

-- =============================================
-- 5. Log de Notificaciones Enviadas
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'NotificationLog')
BEGIN
    CREATE TABLE NotificationLog (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Tipo de notificación
        NotificationType NVARCHAR(50) NOT NULL,
        
        -- Destinatario
        ToEmail NVARCHAR(255) NOT NULL,
        ToName NVARCHAR(100) NULL,
        
        -- Contenido
        Subject NVARCHAR(500) NOT NULL,
        Body NVARCHAR(MAX) NULL,
        
        -- Estado
        Status NVARCHAR(20) NOT NULL, -- 'Sent', 'Failed', 'Pending'
        ErrorMessage NVARCHAR(1000) NULL,
        
        -- Referencia opcional
        ReferenceType NVARCHAR(50) NULL, -- 'Schedule', 'SwapRequest', 'Activation', etc.
        ReferenceId INT NULL,
        
        -- Metadata
        SentAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        RetryCount INT NOT NULL DEFAULT 0
    );
    
    CREATE INDEX IX_NotificationLog_SentAt ON NotificationLog(SentAt);
    CREATE INDEX IX_NotificationLog_Status ON NotificationLog(Status);
    CREATE INDEX IX_NotificationLog_NotificationType ON NotificationLog(NotificationType);
    
    PRINT 'Tabla NotificationLog creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla NotificationLog ya existe';
END
GO

-- =============================================
-- 6. Orden de Escalamiento (Paso 1: Crear columna)
-- =============================================
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('AspNetUsers') 
    AND name = 'EscalationOrder'
)
BEGIN
    ALTER TABLE AspNetUsers ADD EscalationOrder INT NULL;
    PRINT 'Columna EscalationOrder agregada a AspNetUsers';
END
ELSE
BEGIN
    PRINT 'Columna EscalationOrder ya existe en AspNetUsers';
END
GO

-- =============================================
-- 6b. Orden de Escalamiento (Paso 2: Actualizar valores)
-- Debe estar en un batch separado para que SQL Server reconozca la columna
-- =============================================
UPDATE AspNetUsers SET EscalationOrder = 1 WHERE DomainUser = 'PM43314' AND EscalationOrder IS NULL;
UPDATE AspNetUsers SET EscalationOrder = 2 WHERE DomainUser = 'PR67231' AND EscalationOrder IS NULL;
UPDATE AspNetUsers SET EscalationOrder = 3 WHERE DomainUser = 'RT33863' AND EscalationOrder IS NULL;
PRINT 'Orden de escalamiento actualizado';
GO

-- =============================================
-- 7. Insertar reglas de alerta predefinidas
-- =============================================
IF NOT EXISTS (SELECT 1 FROM OnCallAlertRules)
BEGIN
    -- Obtener un userId de escalamiento para crear las reglas
    DECLARE @CreatorUserId NVARCHAR(450);
    SELECT TOP 1 @CreatorUserId = Id FROM AspNetUsers WHERE IsOnCallEscalation = 1;
    
    IF @CreatorUserId IS NOT NULL
    BEGIN
        INSERT INTO OnCallAlertRules (Name, Description, AlertType, ConditionDays, IsEnabled, CreatedByUserId)
        VALUES 
            ('Calendario Generado', 'Notifica cuando se genera un nuevo calendario de guardias', 'ScheduleGenerated', NULL, 1, @CreatorUserId),
            ('Días Restantes (7)', 'Alerta cuando quedan 7 días de planificación', 'DaysRemaining', 7, 1, @CreatorUserId),
            ('Días Restantes (14)', 'Alerta cuando quedan 14 días de planificación', 'DaysRemaining', 14, 1, @CreatorUserId),
            ('Solicitud de Intercambio', 'Notifica cuando se solicita un intercambio de guardia', 'SwapRequested', NULL, 1, @CreatorUserId),
            ('Intercambio Aprobado', 'Notifica cuando se aprueba un intercambio', 'SwapApproved', NULL, 1, @CreatorUserId),
            ('Intercambio Rechazado', 'Notifica cuando se rechaza un intercambio', 'SwapRejected', NULL, 1, @CreatorUserId),
            ('Guardia Modificada', 'Notifica cuando se modifica una guardia', 'ScheduleModified', NULL, 1, @CreatorUserId),
            ('Activación Registrada', 'Notifica cuando se registra una activación de guardia', 'ActivationCreated', NULL, 1, @CreatorUserId);
        
        PRINT 'Reglas de alerta predefinidas creadas';
    END
    ELSE
    BEGIN
        PRINT 'No se encontró usuario de escalamiento para crear reglas predefinidas';
    END
END
GO

-- =============================================
-- 8. Verificar la estructura creada
-- =============================================
PRINT '';
PRINT '=== RESUMEN DE TABLAS V2 ===';

SELECT 'SmtpSettings' AS Tabla, COUNT(*) AS Registros FROM SmtpSettings
UNION ALL
SELECT 'OnCallActivations', COUNT(*) FROM OnCallActivations
UNION ALL
SELECT 'OnCallAlertRules', COUNT(*) FROM OnCallAlertRules
UNION ALL
SELECT 'OnCallAlertRecipients', COUNT(*) FROM OnCallAlertRecipients
UNION ALL
SELECT 'NotificationLog', COUNT(*) FROM NotificationLog;

PRINT '';
PRINT '=== FIN DEL SCRIPT V2 ===';
GO

