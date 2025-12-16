import { useCallback, useEffect, useState, useRef } from 'react';
import { useSignalR, useSignalREvent } from '@/contexts/SignalRContext';
import {
  RestartOutputMessage,
  RestartProgressMessage,
  RestartCompletedMessage,
} from '@/services/api';

/**
 * Estado del streaming de reinicio
 */
export interface RestartStreamState {
  taskId: string | null;
  isStreaming: boolean;
  outputLines: RestartOutputMessage[];
  progress: RestartProgressMessage | null;
  completed: RestartCompletedMessage | null;
  error: string | null;
}

/**
 * Hook para manejar el streaming de output de reinicio de servidores via SignalR
 */
export const useServerRestartStream = () => {
  const { invoke, isConnected, connection } = useSignalR();
  const [state, setState] = useState<RestartStreamState>({
    taskId: null,
    isStreaming: false,
    outputLines: [],
    progress: null,
    completed: null,
    error: null,
  });

  // Refs para mantener handlers estables
  const outputHandlerRef = useRef<(data: RestartOutputMessage) => void>();
  const progressHandlerRef = useRef<(data: RestartProgressMessage) => void>();
  const completedHandlerRef = useRef<(data: RestartCompletedMessage) => void>();
  const errorHandlerRef = useRef<(data: { taskId: string; errorMessage: string }) => void>();
  const serverStatusHandlerRef = useRef<(data: any) => void>();

  // Handler para líneas de output
  outputHandlerRef.current = useCallback((data: RestartOutputMessage) => {
    setState(prev => ({
      ...prev,
      outputLines: [...prev.outputLines, data],
    }));
  }, []);

  // Handler para progreso
  progressHandlerRef.current = useCallback((data: RestartProgressMessage) => {
    setState(prev => ({
      ...prev,
      progress: data,
    }));
  }, []);

  // Handler para completado
  completedHandlerRef.current = useCallback((data: RestartCompletedMessage) => {
    setState(prev => ({
      ...prev,
      isStreaming: false,
      completed: data,
    }));
  }, []);

  // Handler para errores
  errorHandlerRef.current = useCallback((data: { taskId: string; errorMessage: string }) => {
    setState(prev => ({
      ...prev,
      error: data.errorMessage,
    }));
  }, []);

  // Handler para actualizaciones de estado de servidor
  serverStatusHandlerRef.current = useCallback((data: any) => {
    // Se puede usar para actualizar el estado visual de cada servidor
    console.log('[ServerRestart] Server status update:', data);
  }, []);

  /**
   * Suscribirse al streaming de una tarea
   */
  const subscribeToTask = useCallback(async (taskId: string) => {
    if (!isConnected) {
      console.warn('[ServerRestart] SignalR no está conectado');
      return;
    }

    try {
      // Unirse al grupo de la tarea
      await invoke('JoinRestartTaskGroup', taskId);
      
      setState({
        taskId,
        isStreaming: true,
        outputLines: [],
        progress: null,
        completed: null,
        error: null,
      });

      console.log('[ServerRestart] Suscrito al grupo:', taskId);
    } catch (error) {
      console.error('[ServerRestart] Error al suscribirse:', error);
      setState(prev => ({
        ...prev,
        error: 'Error al suscribirse al streaming',
      }));
    }
  }, [invoke, isConnected]);

  /**
   * Desuscribirse del streaming
   */
  const unsubscribeFromTask = useCallback(async () => {
    if (state.taskId && isConnected) {
      try {
        await invoke('LeaveRestartTaskGroup', state.taskId);
        console.log('[ServerRestart] Desuscrito del grupo:', state.taskId);
      } catch (error) {
        console.error('[ServerRestart] Error al desuscribirse:', error);
      }
    }

    setState(prev => ({
      ...prev,
      taskId: null,
      isStreaming: false,
    }));
  }, [state.taskId, invoke, isConnected]);

  /**
   * Limpiar el estado
   */
  const clearState = useCallback(() => {
    setState({
      taskId: null,
      isStreaming: false,
      outputLines: [],
      progress: null,
      completed: null,
      error: null,
    });
  }, []);

  // Configurar event listeners
  useEffect(() => {
    if (!connection || !isConnected) return;

    // Crear handlers estables
    const handleOutput = (data: RestartOutputMessage) => {
      outputHandlerRef.current?.(data);
    };

    const handleProgress = (data: RestartProgressMessage) => {
      progressHandlerRef.current?.(data);
    };

    const handleCompleted = (data: RestartCompletedMessage) => {
      completedHandlerRef.current?.(data);
    };

    const handleError = (data: { taskId: string; errorMessage: string }) => {
      errorHandlerRef.current?.(data);
    };

    const handleServerStatus = (data: any) => {
      serverStatusHandlerRef.current?.(data);
    };

    // Suscribirse a eventos (nombres en minúsculas por convención SignalR)
    connection.on('restartoutput', handleOutput);
    connection.on('restartprogress', handleProgress);
    connection.on('restartcompleted', handleCompleted);
    connection.on('restarterror', handleError);
    connection.on('serverstatusupdate', handleServerStatus);

    // Cleanup
    return () => {
      connection.off('restartoutput', handleOutput);
      connection.off('restartprogress', handleProgress);
      connection.off('restartcompleted', handleCompleted);
      connection.off('restarterror', handleError);
      connection.off('serverstatusupdate', handleServerStatus);
    };
  }, [connection, isConnected]);

  // Limpiar suscripción al desmontar
  useEffect(() => {
    return () => {
      if (state.taskId && isConnected) {
        invoke('LeaveRestartTaskGroup', state.taskId).catch(() => {});
      }
    };
  }, []);

  return {
    ...state,
    isConnected,
    subscribeToTask,
    unsubscribeFromTask,
    clearState,
  };
};

/**
 * Hook para recibir notificaciones globales de tareas completadas
 */
export const useServerRestartNotifications = (
  onTaskCompleted?: (data: { taskId: string; status: string; successCount: number; failureCount: number }) => void
) => {
  // Notificación global cuando cualquier tarea de reinicio completa
  useSignalREvent<{ taskId: string; status: string; successCount: number; failureCount: number }>(
    'serverrestarttaskcompleted',
    useCallback((data) => {
      if (onTaskCompleted) {
        onTaskCompleted(data);
      }
    }, [onTaskCompleted])
  );
};

