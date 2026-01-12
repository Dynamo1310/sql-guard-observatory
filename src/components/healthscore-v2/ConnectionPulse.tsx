import { cn } from '@/lib/utils';
import { HubConnectionState } from '@microsoft/signalr';

interface ConnectionPulseProps {
  connectionState: HubConnectionState;
  lastUpdate: Date | null;
  className?: string;
}

export function ConnectionPulse({ connectionState, lastUpdate, className }: ConnectionPulseProps) {
  const isConnected = connectionState === HubConnectionState.Connected;

  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)}>
      <span className={cn(
        'w-2 h-2 rounded-full',
        isConnected ? 'bg-success' : 'bg-muted-foreground'
      )} />
      <span>
        {isConnected ? 'En vivo' : 'Desconectado'}
      </span>
      {lastUpdate && (
        <span className="text-muted-foreground/60">
          · {lastUpdate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
