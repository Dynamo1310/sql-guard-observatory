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
          variant: 'outline' as const,
          dotColor: 'bg-success',
        };
      case signalR.HubConnectionState.Connecting:
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'Conectando...',
          variant: 'outline' as const,
          dotColor: 'bg-muted-foreground',
        };
      case signalR.HubConnectionState.Reconnecting:
        return {
          icon: <Activity className="h-3 w-3 animate-pulse" />,
          text: 'Reconectando...',
          variant: 'outline' as const,
          dotColor: 'bg-warning',
        };
      case signalR.HubConnectionState.Disconnected:
      default:
        return {
          icon: <WifiOff className="h-3 w-3" />,
          text: 'Desconectado',
          variant: 'outline' as const,
          dotColor: 'bg-destructive',
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
            className="flex items-center gap-1.5"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${config.dotColor}`} />
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

