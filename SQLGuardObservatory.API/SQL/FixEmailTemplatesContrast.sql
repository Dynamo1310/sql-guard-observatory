-- =====================================================
-- Script: FixEmailTemplatesContrast.sql
-- Descripción: Corrige el contraste de los templates de email
--              para que se vean bien en Outlook (fondo blanco)
-- Fecha: 2025-01-01
-- =====================================================

USE [SQLGuardObservatoryDB]
GO

PRINT '=== Actualizando templates de email para mejor contraste en Outlook ==='
PRINT ''

-- =====================================================
-- Template 1: WeeklyNotification - Notificación Semanal
-- =====================================================
PRINT '1. Actualizando template WeeklyNotification...'

UPDATE OnCallEmailTemplates
SET Body = N'<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Segoe UI, Arial, sans-serif; background-color: #f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <tr>
        <td style="background-color: #2563eb; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">GUARDIA PROGRAMADA</h1>
            <p style="margin: 8px 0 0 0; color: #bfdbfe; font-size: 14px;">Sistema de Guardias DBA</p>
        </td>
    </tr>
    
    <!-- Content -->
    <tr>
        <td style="padding: 30px;">
            <p style="color: #1f2937; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
                Estimados, buenas tardes; informamos que a partir de hoy y hasta el próximo Miércoles, 
                se designará a una persona del equipo de Ingeniería de Datos como referente en caso de INCIDENTES.
            </p>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 25px 0;">
                Tengan en cuenta las alertas conocidas que hemos estado gestionando. 
                Por favor, utilicen también la herramienta de HealthCheck para determinar 
                la importancia de cada alerta antes de comunicarse con el DBA.
            </p>
            
            <!-- Info Box -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #eff6ff; border: 2px solid #2563eb; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                    <td style="padding: 20px;">
                        <p style="margin: 0 0 15px 0; color: #1e40af; font-size: 16px; font-weight: bold;">
                            Esta semana comenzando desde este miércoles será:
                        </p>
                        <table width="100%" cellpadding="8" cellspacing="0" border="0">
                            <tr>
                                <td width="100" style="color: #374151; font-weight: bold; font-size: 14px;">Técnico:</td>
                                <td style="color: #111827; font-size: 15px; font-weight: 600;">{{Tecnico}}</td>
                            </tr>
                            <tr>
                                <td style="color: #374151; font-weight: bold; font-size: 14px;">Móvil:</td>
                                <td style="color: #111827; font-size: 15px; font-weight: 600;">{{Movil}}</td>
                            </tr>
                            <tr>
                                <td style="color: #374151; font-weight: bold; font-size: 14px;">Inicio:</td>
                                <td style="color: #111827; font-size: 14px;">{{Inicio}}</td>
                            </tr>
                            <tr>
                                <td style="color: #374151; font-weight: bold; font-size: 14px;">Fin:</td>
                                <td style="color: #111827; font-size: 14px;">{{Fin}}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <!-- Escalation Section -->
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 10px;">
                <p style="color: #374151; font-size: 14px; font-weight: bold; margin: 0 0 15px 0;">
                    Contactos de Escalamiento de Guardia de Base de Datos:
                </p>
                {{TablaEscalamiento}}
                <p style="color: #6b7280; font-size: 13px; line-height: 1.5; margin: 15px 0 0 0; padding: 12px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
                    <strong>Nota:</strong> El escalamiento solo debe realizarse en caso de requerir soporte 
                    de segundo nivel o no poder contactarse con la persona asignada a la guardia. 
                    Siempre la guardia debe ser el primer contacto antes del escalamiento.
                </p>
            </div>
        </td>
    </tr>
    
    <!-- Footer -->
    <tr>
        <td style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; color: #6b7280; font-size: 12px;">
                Correo enviado automáticamente por el sistema de guardias DBA.
            </p>
        </td>
    </tr>
</table>
</td>
</tr>
</table>
</body>
</html>',
    UpdatedAt = GETDATE()
WHERE AlertType = 'WeeklyNotification' AND IsDefault = 1;

IF @@ROWCOUNT > 0
    PRINT '   Template WeeklyNotification actualizado correctamente'
ELSE
    PRINT '   No se encontró template WeeklyNotification para actualizar'

GO

-- =====================================================
-- Template 2: PreWeekNotification - Aviso Previo
-- =====================================================
PRINT ''
PRINT '2. Actualizando template PreWeekNotification...'

UPDATE OnCallEmailTemplates
SET Body = N'<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Segoe UI, Arial, sans-serif; background-color: #f5f5f5;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f5f5f5; padding: 20px;">
<tr>
<td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header - Rojo para llamar la atención -->
    <tr>
        <td style="background-color: #dc2626; padding: 25px; text-align: center; border-radius: 8px 8px 0 0;">
            <p style="margin: 0 0 8px 0; font-size: 32px;">⚠️</p>
            <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
                ¡GUARDIA MAÑANA!
            </h1>
        </td>
    </tr>
    
    <!-- Alert Banner -->
    <tr>
        <td style="background-color: #fef2f2; padding: 15px; text-align: center; border-bottom: 3px solid #dc2626;">
            <p style="margin: 0; color: #991b1b; font-size: 16px; font-weight: bold;">
                RECORDATORIO: La guardia comienza MAÑANA MIÉRCOLES a las 19:00
            </p>
        </td>
    </tr>
    
    <!-- Content -->
    <tr>
        <td style="padding: 30px;">
            <!-- Info Card -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #1e40af; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                    <td style="padding: 25px;">
                        <table width="100%" cellpadding="10" cellspacing="0" border="0">
                            <tr>
                                <td width="90" style="color: #bfdbfe; font-weight: bold; font-size: 14px; vertical-align: top;">Técnico:</td>
                                <td style="color: #ffffff; font-size: 18px; font-weight: 600;">{{Tecnico}}</td>
                            </tr>
                            <tr>
                                <td style="color: #bfdbfe; font-weight: bold; font-size: 14px; vertical-align: top;">Móvil:</td>
                                <td style="color: #ffffff; font-size: 18px; font-weight: 600;">{{Movil}}</td>
                            </tr>
                            <tr>
                                <td style="color: #bfdbfe; font-weight: bold; font-size: 14px; vertical-align: top;">Desde:</td>
                                <td style="color: #ffffff; font-size: 15px;">{{Inicio}}</td>
                            </tr>
                            <tr>
                                <td style="color: #bfdbfe; font-weight: bold; font-size: 14px; vertical-align: top;">Hasta:</td>
                                <td style="color: #ffffff; font-size: 15px;">{{Fin}}</td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; text-align: center; margin: 0 0 20px 0;">
                Por favor, asegúrese de estar disponible para atender cualquier incidente durante el período de guardia.
            </p>
            
            <!-- Escalation Section -->
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 10px;">
                <p style="color: #374151; font-size: 14px; font-weight: bold; margin: 0 0 15px 0;">
                    Contactos de Escalamiento:
                </p>
                {{TablaEscalamiento}}
            </div>
        </td>
    </tr>
    
    <!-- Footer -->
    <tr>
        <td style="background-color: #1f2937; padding: 15px; text-align: center; border-radius: 0 0 8px 8px;">
            <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Correo enviado automáticamente por el sistema de guardias DBA.
            </p>
            <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 11px;">
                SQLNova App - Gestión de Guardias
            </p>
        </td>
    </tr>
</table>
</td>
</tr>
</table>
</body>
</html>',
    Subject = N'⚠️ GUARDIA MAÑANA - {{Tecnico}}',
    UpdatedAt = GETDATE()
WHERE AlertType = 'PreWeekNotification' AND IsDefault = 1;

IF @@ROWCOUNT > 0
    PRINT '   Template PreWeekNotification actualizado correctamente'
ELSE
    PRINT '   No se encontró template PreWeekNotification para actualizar'

GO

PRINT ''
PRINT '=== Script completado ==='
PRINT 'Los templates ahora usan:'
PRINT '  - Estilos inline compatibles con Outlook'
PRINT '  - Colores con buen contraste en fondo blanco'
PRINT '  - Tablas para layout (mejor soporte en clientes de email)'
GO


