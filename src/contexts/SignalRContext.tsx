import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as signalR from '@microsoft/signalr';

interface SignalRContextType {
  connection: signalR.HubConnection | null;
  isConnected: boolean;
  connectionState: signalR.HubConnectionState;
  subscribe: (event: string, callback: (...args: any[]) => void) => void;
  unsubscribe: (event: string, callback: (...args: any[]) => void) => void;
  invoke: (method: string, ...args: any[]) => Promise<any>;
}

const SignalRContext = createContext<SignalRContextType | undefined>(undefined);

interface SignalRProviderProps {
  children: React.ReactNode;
  hubUrl?: string;
  autoReconnect?: boolean;
}

/**
 * Provider global de SignalR para toda la aplicación
 * Maneja conexión, reconexión automática y suscripciones a eventos
 */
export const SignalRProvider: React.FC<SignalRProviderProps> = ({ 
  children, 
  hubUrl = `${import.meta.env.VITE_API_BASE_URL || 'http://asprbm-nov-01:5000'}/hubs/notifications`,
  autoReconnect = true 
}) => {
  const [connection, setConnection] = useState<signalR.HubConnection | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  useEffect(() => {
    // Configurar conexión SignalR
    const newConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents,
      })
      .withAutomaticReconnect(autoReconnect ? {
        nextRetryDelayInMilliseconds: (retryContext) => {
          // Estrategia de reconexión: 0s, 2s, 10s, 30s, 60s, luego cada 60s
          if (retryContext.previousRetryCount === 0) return 0;
          if (retryContext.previousRetryCount === 1) return 2000;
          if (retryContext.previousRetryCount === 2) return 10000;
          if (retryContext.previousRetryCount === 3) return 30000;
          return 60000;
        }
      } : undefined)
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Eventos de conexión
    newConnection.onclose((error) => {
      setIsConnected(false);
      setConnectionState(signalR.HubConnectionState.Disconnected);
    });

    newConnection.onreconnecting((error) => {
      setIsConnected(false);
      setConnectionState(signalR.HubConnectionState.Reconnecting);
    });

    newConnection.onreconnected((connectionId) => {
      setIsConnected(true);
      setConnectionState(signalR.HubConnectionState.Connected);
    });

    // Iniciar conexión
    const startConnection = async () => {
      try {
        await newConnection.start();
        setIsConnected(true);
        setConnectionState(signalR.HubConnectionState.Connected);
      } catch (error) {
        console.error('[SignalR] Error al conectar:', error);
        setIsConnected(false);
        setConnectionState(signalR.HubConnectionState.Disconnected);
        
        // Reintentar conexión después de 5 segundos
        setTimeout(startConnection, 5000);
      }
    };

    startConnection();
    setConnection(newConnection);

    // Cleanup
    return () => {
      newConnection.stop();
    };
  }, [hubUrl, autoReconnect]);

  /**
   * Suscribirse a un evento de SignalR
   */
  const subscribe = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (connection) {
      connection.on(event, callback);
    }
  }, [connection]);

  /**
   * Desuscribirse de un evento de SignalR
   */
  const unsubscribe = useCallback((event: string, callback: (...args: any[]) => void) => {
    if (connection) {
      connection.off(event, callback);
    }
  }, [connection]);

  /**
   * Invocar un método del servidor
   */
  const invoke = useCallback(async (method: string, ...args: any[]) => {
    if (connection && isConnected) {
      try {
        return await connection.invoke(method, ...args);
      } catch (error) {
        console.error(`[SignalR] Error al invocar método ${method}:`, error);
        throw error;
      }
    } else {
      throw new Error('SignalR no está conectado');
    }
  }, [connection, isConnected]);

  const value: SignalRContextType = {
    connection,
    isConnected,
    connectionState,
    subscribe,
    unsubscribe,
    invoke,
  };

  return (
    <SignalRContext.Provider value={value}>
      {children}
    </SignalRContext.Provider>
  );
};

/**
 * Hook para usar SignalR en cualquier componente
 */
export const useSignalR = () => {
  const context = useContext(SignalRContext);
  if (context === undefined) {
    throw new Error('useSignalR debe usarse dentro de un SignalRProvider');
  }
  return context;
};

/**
 * Hook especializado para eventos específicos de SignalR
 * Maneja automáticamente la suscripción y desuscripción
 */
export const useSignalREvent = <T = any>(
  event: string,
  callback: (data: T) => void,
  dependencies: React.DependencyList = []
) => {
  const { subscribe, unsubscribe, isConnected, connection } = useSignalR();
  const callbackRef = useRef(callback);
  
  // Mantener el callback actualizado sin re-suscribir
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Crear el handler una sola vez y mantenerlo estable
  const handlerRef = useRef<(data: T) => void>();
  if (!handlerRef.current) {
    handlerRef.current = (data: T) => {
      callbackRef.current(data);
    };
  }

  useEffect(() => {
    if (isConnected && connection && handlerRef.current) {
      subscribe(event, handlerRef.current);

      return () => {
        if (handlerRef.current) {
          unsubscribe(event, handlerRef.current);
        }
      };
    }
  }, [event, isConnected, connection, subscribe, unsubscribe, ...dependencies]);
};

