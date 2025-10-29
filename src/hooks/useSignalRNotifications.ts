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
  // Notificación de actualización general de HealthScore
  // NOTA: SignalR convierte nombres a minúsculas automáticamente
  useSignalREvent<HealthScoreUpdateNotification>(
    'healthscoreupdated',
    useCallback((data: HealthScoreUpdateNotification) => {
      if (onHealthScoreUpdated) {
        onHealthScoreUpdated(data);
      }
    }, [onHealthScoreUpdated])
  );

  // Notificación de actualización de instancia específica
  useSignalREvent<InstanceHealthUpdateNotification>(
    'instancehealthupdated',
    useCallback((data: InstanceHealthUpdateNotification) => {
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
  useSignalREvent('alertcreated', useCallback((alert: any) => {
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
  useSignalREvent('alertresolved', useCallback((alert: any) => {
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

  useSignalREvent('maintenancestarted', useCallback((data: any) => {
    toast({
      title: 'Mantenimiento Iniciado',
      description: `${data.instanceName}: ${data.taskName}`,
      duration: 3000,
    });

    if (onMaintenanceStarted) {
      onMaintenanceStarted(data);
    }
  }, [onMaintenanceStarted, toast]));

  useSignalREvent('maintenancecompleted', useCallback((data: any) => {
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

  useSignalREvent('systemnotification', useCallback((notification: any) => {
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

