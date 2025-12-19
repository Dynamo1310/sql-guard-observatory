import { useSignalR } from '@/contexts/SignalRContext';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface LiveIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export function LiveIndicator({ className, showLabel = true }: LiveIndicatorProps) {
  const { isConnected, connectionState } = useSignalR();
  
  const getStatusInfo = () => {
    if (!isConnected) {
      if (connectionState === 1) { // Reconnecting
        return {
          label: 'Reconectando',
          icon: RefreshCw,
          dotColor: 'bg-yellow-500',
          textColor: 'text-yellow-600',
          animate: 'animate-spin',
        };
      }
      return {
        label: 'Desconectado',
        icon: WifiOff,
        dotColor: 'bg-red-500',
        textColor: 'text-red-600',
        animate: '',
      };
    }
    return {
      label: 'EN VIVO',
      icon: Wifi,
      dotColor: 'bg-green-500',
      textColor: 'text-green-600',
      animate: '',
    };
  };

  const status = getStatusInfo();
  const Icon = status.icon;

  return (
    <div className={cn(
      'flex items-center gap-1.5 px-2 py-1 rounded-full',
      'bg-muted/50 border text-xs',
      className
    )}>
      <div className="relative">
        {isConnected && (
          <span className={cn('absolute h-2 w-2 rounded-full opacity-75 animate-ping', status.dotColor)} />
        )}
        <span className={cn('relative block h-2 w-2 rounded-full', status.dotColor)} />
      </div>
      {showLabel && (
        <span className={cn('font-semibold', status.textColor)}>
          {status.label}
        </span>
      )}
    </div>
  );
}
