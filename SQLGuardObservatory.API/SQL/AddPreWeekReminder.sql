-- =====================================================
-- Script: AddPreWeekReminder.sql
-- Descripción: Agrega recordatorio al email GUARDIA MAÑANA (PreWeekNotification)
--              sobre actualizar la planilla de guardias y registrar activaciones.
--              El link a la planilla se configura desde el frontend en el template.
-- Fecha: 2025-02-10
-- =====================================================

USE [SQLGuardObservatoryDB]
GO

PRINT '=== Agregando recordatorio al template PreWeekNotification (GUARDIA MAÑANA) ==='
PRINT ''

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
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; text-align: center; margin: 0 0 15px 0;">
                Por favor, asegúrese de estar disponible para atender cualquier incidente durante el período de guardia.
            </p>
            
            <!-- Recordatorio Planilla y Activaciones -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #fffbeb; border: 2px solid #f59e0b; border-radius: 8px; margin-bottom: 25px;">
                <tr>
                    <td style="padding: 18px;">
                        <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                            📋 <strong>Recordatorio:</strong> Acordate de actualizar la planilla de guardias de fin de semana: <a href="{{LinkPlanillaGuardias}}" style="color: #1d4ed8; font-weight: 600;">Planilla de Guardias</a> y de registrar tus activaciones en <a href="{{LinkActivaciones}}" style="color: #1d4ed8; font-weight: 600;">Registro de Activaciones</a>.
                        </p>
                    </td>
                </tr>
            </table>
            
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
    UpdatedAt = GETDATE()
WHERE AlertType = 'PreWeekNotification' AND IsDefault = 1;

IF @@ROWCOUNT > 0
    PRINT '   Template PreWeekNotification actualizado correctamente con recordatorio de planilla y activaciones'
ELSE
    PRINT '   No se encontró template PreWeekNotification para actualizar'

GO

PRINT ''
PRINT '=== Script completado ==='
PRINT 'El link a la planilla se configura desde el frontend en la configuración del template.'
PRINT ''
GO
