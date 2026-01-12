-- =====================================================
-- Script para agregar campos de schedule a templates
-- y crear templates por defecto para notificaciones
-- =====================================================

-- Agregar columnas de schedule a OnCallEmailTemplates
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'OnCallEmailTemplates') AND name = 'IsScheduled')
BEGIN
    ALTER TABLE OnCallEmailTemplates ADD IsScheduled BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsScheduled agregada a OnCallEmailTemplates';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'OnCallEmailTemplates') AND name = 'ScheduleCron')
BEGIN
    ALTER TABLE OnCallEmailTemplates ADD ScheduleCron NVARCHAR(50) NULL;
    PRINT 'Columna ScheduleCron agregada a OnCallEmailTemplates';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'OnCallEmailTemplates') AND name = 'ScheduleDescription')
BEGIN
    ALTER TABLE OnCallEmailTemplates ADD ScheduleDescription NVARCHAR(200) NULL;
    PRINT 'Columna ScheduleDescription agregada a OnCallEmailTemplates';
END
GO

-- =====================================================
-- Insertar templates por defecto
-- =====================================================

-- Template 1: Notificación Semanal (Miércoles 12:00)
IF NOT EXISTS (SELECT 1 FROM OnCallEmailTemplates WHERE AlertType = 'WeeklyNotification' AND IsDefault = 1)
BEGIN
    INSERT INTO OnCallEmailTemplates (
        AlertType, Name, Subject, Body, AttachExcel, IsEnabled, IsDefault, 
        IsScheduled, ScheduleCron, ScheduleDescription, CreatedAt
    )
    VALUES (
        'WeeklyNotification',
        'Notificación Semanal de Guardias',
        'Guardia Programada - {{Tecnico}}',
        '<html><head><meta charset="UTF-8"><style>
body {font-family: Arial; color: #333;}
h2 {color: #FF6F61; font-weight: bold;}
p {font-size: 14px; margin-bottom: 10px;}
table {border-collapse: collapse; width: 60%; margin: 20px auto; text-align: center; font-family: Arial; font-size: 14px;}
th, td {border: 1px solid #ddd; padding: 8px;}
th {background-color: #FF6F61; color: white;}
tr:nth-child(even) {background-color: #f9f9f9;}
.firma {margin-top: 30px; text-align: center;}
</style></head><body>
<h2>Guardia Programada</h2>
<p>Estimados, buenas tardes; informamos que a partir de hoy y hasta el próximo Miércoles, se designará a una persona del equipo de Ingeniería de Datos como referente en caso de INCIDENTES.</p>
<p>Tengan en cuenta las alertas conocidas que hemos estado gestionando (por ejemplo: tiempos de respuesta durante horarios de batch, mantenimientos de base de datos en horarios nocturnos, espacio en discos donde los Datafiles no tienen crecimiento, etc.). Por favor, utilicen también la herramienta de HealthCheck para determinar la importancia de cada alerta antes de comunicarse con el DBA.</p>
<p><b>Esta semana, comenzando desde este miércoles, será:</b></p>
<p><b>Técnico:</b> {{Tecnico}}</p>
<p><b>Móvil:</b> {{Movil}}</p>
<p><b>Inicio:</b> {{Inicio}}</p>
<p><b>Fin:</b> {{Fin}}</p>
<hr>
<p><b>Adicionalmente por temas de escalamiento de Guardia de Base de Datos podrán tener en cuenta los siguientes contactos:</b></p>
{{TablaEscalamiento}}
<p><b>Aclaración:</b> Es importante tener en cuenta que el escalamiento de Guardia de Base de Datos solo debe realizarse en caso de requerir soporte de segundo nivel o no poder contactarse con la persona asignada a la guardia. Siempre la guardia debe ser el primer contacto antes del escalamiento.</p>
<div class="firma">
<p style="font-size:10pt;color:#555;">Correo enviado automáticamente por el sistema de guardias DBA.</p>
</div>
</body></html>',
        0, -- AttachExcel
        1, -- IsEnabled
        1, -- IsDefault
        1, -- IsScheduled
        '0 12 * * 3', -- ScheduleCron (Miércoles 12:00)
        'Todos los miércoles a las 12:00',
        GETDATE()
    );
    PRINT 'Template WeeklyNotification creado';
END
GO

-- Template 2: Aviso Previo (Martes 16:00) - MÁS LLAMATIVO
IF NOT EXISTS (SELECT 1 FROM OnCallEmailTemplates WHERE AlertType = 'PreWeekNotification' AND IsDefault = 1)
BEGIN
    INSERT INTO OnCallEmailTemplates (
        AlertType, Name, Subject, Body, AttachExcel, IsEnabled, IsDefault,
        IsScheduled, ScheduleCron, ScheduleDescription, CreatedAt
    )
    VALUES (
        'PreWeekNotification',
        'Aviso Previo de Guardia',
        '⚠️ GUARDIA MAÑANA - {{Tecnico}}',
        '<html>
<head>
<meta charset="UTF-8">
<style>
body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 0; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); }
.container { max-width: 600px; margin: 20px auto; }
.header { 
    background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); 
    color: white; 
    padding: 30px; 
    text-align: center; 
    border-radius: 15px 15px 0 0;
    box-shadow: 0 4px 15px rgba(231, 76, 60, 0.4);
}
.header h1 { 
    margin: 0; 
    font-size: 28px; 
    text-transform: uppercase; 
    letter-spacing: 2px;
    text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}
.header .icon { font-size: 50px; margin-bottom: 10px; }
.content { 
    background: white; 
    padding: 30px; 
    border-left: 4px solid #e74c3c;
    border-right: 4px solid #e74c3c;
}
.alert-box {
    background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%);
    border: 2px solid #f39c12;
    border-radius: 10px;
    padding: 20px;
    margin: 20px 0;
    text-align: center;
}
.alert-box .title { 
    color: #d35400; 
    font-size: 18px; 
    font-weight: bold; 
    margin-bottom: 10px;
}
.info-card {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border-radius: 10px;
    padding: 20px;
    margin: 15px 0;
}
.info-card table { width: 100%; color: white; }
.info-card td { padding: 8px 0; font-size: 16px; }
.info-card td:first-child { font-weight: bold; width: 80px; }
.footer { 
    background: #2c3e50; 
    color: #95a5a6; 
    padding: 15px; 
    text-align: center; 
    border-radius: 0 0 15px 15px;
    font-size: 12px;
}
.pulse { animation: pulse 2s infinite; }
@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
}
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="icon">🔔</div>
        <h1>¡Guardia de Esta Semana!</h1>
    </div>
    <div class="content">
        <div class="alert-box pulse">
            <div class="title">⚠️ RECORDATORIO IMPORTANTE</div>
            <p style="margin:0;">La guardia comienza <b>MAÑANA MIÉRCOLES a las 19:00</b></p>
        </div>
        
        <div class="info-card">
            <table border="0" cellspacing="0" cellpadding="4">
                <tr><td>👤 Técnico:</td><td>{{Tecnico}}</td></tr>
                <tr><td>📱 Móvil:</td><td>{{Movil}}</td></tr>
                <tr><td>📅 Desde:</td><td>{{Inicio}}</td></tr>
                <tr><td>🏁 Hasta:</td><td>{{Fin}}</td></tr>
            </table>
        </div>
        
        <p style="text-align:center; color:#7f8c8d; font-size:13px;">
            Por favor, asegúrese de estar disponible para atender cualquier incidente durante el período de guardia.
        </p>
    </div>
    <div class="footer">
        Correo enviado automáticamente por el sistema de guardias DBA.<br/>
        SQLNova App - Gestión de Guardias
    </div>
</div>
</body>
</html>',
        0, -- AttachExcel
        1, -- IsEnabled
        1, -- IsDefault
        1, -- IsScheduled
        '0 16 * * 2', -- ScheduleCron (Martes 16:00)
        'Todos los martes a las 16:00',
        GETDATE()
    );
    PRINT 'Template PreWeekNotification creado';
END
GO

-- Template 3: Calendario Generado (actualizar si no tiene los campos de schedule)
IF NOT EXISTS (SELECT 1 FROM OnCallEmailTemplates WHERE AlertType = 'ScheduleGenerated' AND IsDefault = 1)
BEGIN
    INSERT INTO OnCallEmailTemplates (
        AlertType, Name, Subject, Body, AttachExcel, IsEnabled, IsDefault,
        IsScheduled, ScheduleCron, ScheduleDescription, CreatedAt
    )
    VALUES (
        'ScheduleGenerated',
        'Calendario de Guardias Generado',
        'Nuevo Calendario de Guardias DBA - {{FechaInicio}} a {{FechaFin}}',
        '<html>
<head><meta charset="UTF-8"></head>
<body style="font-family: Segoe UI, Arial, sans-serif; color: #333;">
<h2 style="color: #3498db;">📅 Nuevo Calendario de Guardias</h2>
<p>Se ha generado un nuevo calendario de guardias DBA.</p>
<p><b>Período:</b> {{FechaInicio}} - {{FechaFin}}</p>
<p><b>Total de semanas:</b> {{Semanas}}</p>
<p><b>Primer operador:</b> {{PrimerOperador}} ({{PrimerOperadorTelefono}})</p>
<h3>Resumen de las primeras semanas:</h3>
<pre>{{ResumenCalendario}}</pre>
<p><a href="{{LinkPlanificador}}">Ver calendario completo</a></p>
<hr>
<p style="font-size: 10pt; color: #888;">Correo enviado automáticamente por el sistema de guardias DBA.</p>
</body>
</html>',
        1, -- AttachExcel
        1, -- IsEnabled
        1, -- IsDefault
        0, -- IsScheduled (se dispara por evento, no por schedule)
        NULL,
        NULL,
        GETDATE()
    );
    PRINT 'Template ScheduleGenerated creado';
END
GO

PRINT '=== Script completado ==='



