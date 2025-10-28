import { Activity, Wifi, WifiOff } from 'lucide-react';
import { useSignalR } from '@/contexts/SignalRContext';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import * as signalR from '@microsoft/signalr';

/**
 * Componente para mostrar el estado de la conexión SignalR
 * Puede usarse en el header o en cualquier parte de la aplicación
 */
export default function SignalRStatus() {
  const { isConnected, connectionState } = useSignalR();

  const getStatusConfig = () => {
    switch (connectionState) {
      case signalR.HubConnectionState.Connected:
        return {
          icon: <Wifi className="h-3 w-3" />,
          text: 'Conectado',
          variant: 'default' as const,
          className: 'bg-green-500/20 text-green-700 border-green-500/40',
        };
      case signalR.HubConnectionState.Connecting:
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'Conectando...',
          variant: 'secondary' as const,
          className: 'bg-blue-500/20 text-blue-700 border-blue-500/40',
        };
      case signalR.HubConnectionState.Reconnecting:
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'Reconectando...',
          variant: 'secondary' as const,
          className: 'bg-yellow-500/20 text-yellow-700 border-yellow-500/40',
        };
      case signalR.HubConnectionState.Disconnected:
      default:
        return {
          icon: <WifiOff className="h-3 w-3" />,
          text: 'Desconectado',
          variant: 'destructive' as const,
          className: 'bg-red-500/20 text-red-700 border-red-500/40',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={config.variant}
            className={`flex items-center gap-1.5 ${config.className}`}
          >
            {config.icon}
            <span className="text-xs font-medium">{config.text}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            {isConnected 
              ? 'Actualizaciones en tiempo real activas' 
              : 'Las actualizaciones en tiempo real están deshabilitadas'
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

