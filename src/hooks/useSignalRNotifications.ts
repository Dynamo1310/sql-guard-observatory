import { useCallback } from 'react';
import { useSignalREvent } from '@/contexts/SignalRContext';
import { useToast } from '@/hooks/use-toast';

/**
 * Tipos de notificaciones que puede enviar el backend
 */
export type NotificationType = 
  | 'HealthScoreUpdated'
  | 'InstanceHealthUpdated'
  | 'BackupsUpdated'
  | 'AlertCreated'
  | 'AlertResolved'
  | 'MaintenanceStarted'
  | 'MaintenanceCompleted'
  | 'SystemNotification';

/**
 * Estructura base de una notificación
 */
export interface SignalRNotification {
  type: NotificationType;
  timestamp: string;
  data: any;
}

/**
 * Notificación de actualización de HealthScore
 */
export interface HealthScoreUpdateNotification {
  collectorName: string;
  timestamp: string;
  instanceCount: number;
}

/**
 * Notificación de actualización de instancia específica
 */
export interface InstanceHealthUpdateNotification {
  instanceName: string;
  healthScore: number;
  healthStatus: string;
  timestamp: string;
}

/**
 * Hook para manejar notificaciones de HealthScore
 */
export const useHealthScoreNotifications = (
  onHealthScoreUpdated?: (data: HealthScoreUpdateNotification) => void,
  onInstanceUpdated?: (data: InstanceHealthUpdateNotification) => void
) => {
  const { toast } = useToast();

  // Notificación de actualización general de HealthScore
  useSignalREvent<HealthScoreUpdateNotification>(
    'HealthScoreUpdated',
    useCallback((data: HealthScoreUpdateNotification) => {
      console.log('[SignalR] HealthScore actualizado:', data);
      
      if (onHealthScoreUpdated) {
        onHealthScoreUpdated(data);
      }

      // Opcional: Mostrar toast para ciertos collectors críticos
      if (['Consolidate', 'Backups', 'AlwaysOn'].includes(data.collectorName)) {
        toast({
          title: 'Datos actualizados',
          description: `${data.collectorName}: ${data.instanceCount} instancias procesadas`,
          duration: 2000,
        });
      }
    }, [onHealthScoreUpdated, toast])
  );

  // Notificación de actualización de instancia específica
  useSignalREvent<InstanceHealthUpdateNotification>(
    'InstanceHealthUpdated',
    useCallback((data: InstanceHealthUpdateNotification) => {
      console.log('[SignalR] Instancia actualizada:', data);
      
      if (onInstanceUpdated) {
        onInstanceUpdated(data);
      }
    }, [onInstanceUpdated])
  );
};

/**
 * Hook para manejar notificaciones de alertas
 */
export const useAlertNotifications = (
  onAlertCreated?: (alert: any) => void,
  onAlertResolved?: (alert: any) => void
) => {
  const { toast } = useToast();

  // Notificación de alerta creada
  useSignalREvent('AlertCreated', useCallback((alert: any) => {
    console.log('[SignalR] Nueva alerta:', alert);
    
    toast({
      title: 'Nueva Alerta',
      description: `${alert.instanceName}: ${alert.message}`,
      variant: alert.severity === 'Critical' ? 'destructive' : 'default',
      duration: 5000,
    });

    if (onAlertCreated) {
      onAlertCreated(alert);
    }
  }, [onAlertCreated, toast]));

  // Notificación de alerta resuelta
  useSignalREvent('AlertResolved', useCallback((alert: any) => {
    console.log('[SignalR] Alerta resuelta:', alert);
    
    if (onAlertResolved) {
      onAlertResolved(alert);
    }
  }, [onAlertResolved]));
};

/**
 * Hook para manejar notificaciones de mantenimiento
 */
export const useMaintenanceNotifications = (
  onMaintenanceStarted?: (data: any) => void,
  onMaintenanceCompleted?: (data: any) => void
) => {
  const { toast } = useToast();

  useSignalREvent('MaintenanceStarted', useCallback((data: any) => {
    console.log('[SignalR] Mantenimiento iniciado:', data);
    
    toast({
      title: 'Mantenimiento Iniciado',
      description: `${data.instanceName}: ${data.taskName}`,
      duration: 3000,
    });

    if (onMaintenanceStarted) {
      onMaintenanceStarted(data);
    }
  }, [onMaintenanceStarted, toast]));

  useSignalREvent('MaintenanceCompleted', useCallback((data: any) => {
    console.log('[SignalR] Mantenimiento completado:', data);
    
    if (onMaintenanceCompleted) {
      onMaintenanceCompleted(data);
    }
  }, [onMaintenanceCompleted]));
};

/**
 * Hook para notificaciones generales del sistema
 */
export const useSystemNotifications = (
  onSystemNotification?: (notification: any) => void
) => {
  const { toast } = useToast();

  useSignalREvent('SystemNotification', useCallback((notification: any) => {
    console.log('[SignalR] Notificación del sistema:', notification);
    
    toast({
      title: notification.title || 'Notificación del Sistema',
      description: notification.message,
      variant: notification.type === 'error' ? 'destructive' : 'default',
      duration: notification.duration || 4000,
    });

    if (onSystemNotification) {
      onSystemNotification(notification);
    }
  }, [onSystemNotification, toast]));
};

