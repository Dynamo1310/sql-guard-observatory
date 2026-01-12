-- =====================================================
-- Script para arreglar emojis en templates
-- Los emojis se reemplazan por texto/iconos compatibles
-- =====================================================

-- Actualizar template PreWeekNotification (Aviso Previo)
UPDATE OnCallEmailTemplates 
SET 
    Subject = '[ALERTA] GUARDIA MAÑANA - {{Tecnico}}',
    Body = '<html>
<head><meta charset="UTF-8">
<style>
body { font-family: "Segoe UI", Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
.container { max-width: 600px; margin: 20px auto; }
.header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px; text-align: center; border-radius: 15px 15px 0 0; }
.header h1 { margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 2px; }
.header .icon { font-size: 40px; margin-bottom: 10px; }
.content { background: white; padding: 30px; border-left: 4px solid #e74c3c; border-right: 4px solid #e74c3c; }
.alert-box { background: linear-gradient(135deg, #fff3cd 0%, #ffeaa7 100%); border: 2px solid #f39c12; border-radius: 10px; padding: 20px; margin: 20px 0; text-align: center; }
.alert-box .title { color: #d35400; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
.info-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-radius: 10px; padding: 20px; margin: 15px 0; }
.info-card table { width: 100%; color: white; }
.info-card td { padding: 8px 0; font-size: 16px; }
.info-card td:first-child { font-weight: bold; width: 100px; }
.footer { background: #2c3e50; color: #95a5a6; padding: 15px; text-align: center; border-radius: 0 0 15px 15px; font-size: 12px; }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <div class="icon">*</div>
        <h1>Guardia de Esta Semana</h1>
    </div>
    <div class="content">
        <div class="alert-box">
            <div class="title">** RECORDATORIO IMPORTANTE **</div>
            <p style="margin:0;">La guardia comienza <b>MAÑANA MIERCOLES a las 19:00</b></p>
        </div>
        <div class="info-card">
            <table border="0" cellspacing="0" cellpadding="4">
                <tr><td>Tecnico:</td><td>{{Tecnico}}</td></tr>
                <tr><td>Movil:</td><td>{{Movil}}</td></tr>
                <tr><td>Desde:</td><td>{{Inicio}}</td></tr>
                <tr><td>Hasta:</td><td>{{Fin}}</td></tr>
            </table>
        </div>
        <p style="text-align:center; color:#7f8c8d; font-size:13px;">
            Por favor, asegurese de estar disponible para atender cualquier incidente durante el periodo de guardia.
        </p>
    </div>
    <div class="footer">
        Correo enviado automaticamente por el sistema de guardias DBA.<br/>
        SQLNova App - Gestion de Guardias
    </div>
</div>
</body>
</html>'
WHERE AlertType = 'PreWeekNotification';

PRINT 'Template PreWeekNotification actualizado (emojis removidos)';
GO

-- Actualizar template WeeklyNotification si tiene emojis
UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'👤', 'Tecnico:')
WHERE AlertType = 'WeeklyNotification' AND Body LIKE N'%👤%';

UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'📱', 'Movil:')
WHERE AlertType = 'WeeklyNotification' AND Body LIKE N'%📱%';

UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'📅', 'Desde:')
WHERE AlertType = 'WeeklyNotification' AND Body LIKE N'%📅%';

UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'🏁', 'Hasta:')
WHERE AlertType = 'WeeklyNotification' AND Body LIKE N'%🏁%';

UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'🔔', '*')
WHERE AlertType IN ('WeeklyNotification', 'PreWeekNotification') AND Body LIKE N'%🔔%';

UPDATE OnCallEmailTemplates 
SET Body = REPLACE(Body, N'⚠️', '**')
WHERE AlertType IN ('WeeklyNotification', 'PreWeekNotification') AND Body LIKE N'%⚠️%';

UPDATE OnCallEmailTemplates 
SET Subject = REPLACE(Subject, N'⚠️', '[ALERTA]')
WHERE Subject LIKE N'%⚠️%';

PRINT 'Emojis reemplazados en todos los templates';
GO

PRINT '=== Script completado ===';



