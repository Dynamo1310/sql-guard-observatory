import { useState, useEffect } from 'react';
import { Activity, Database, Shield, Cpu, HardDrive, AlertCircle, Check } from 'lucide-react';
import { useSignalREvent } from '@/contexts/SignalRContext';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface CollectorActivity {
  name: string;
  lastUpdate: Date;
  instanceCount: number;
  isRecent: boolean;
}

/**
 * Componente que muestra la actividad reciente de los collectors
 * Útil para ver qué collectors están actualizando datos en tiempo real
 */
export default function CollectorActivity() {
  const [activities, setActivities] = useState<Map<string, CollectorActivity>>(new Map());

  // Escuchar notificaciones de collectors
  // NOTA: SignalR convierte nombres a minúsculas automáticamente
  useSignalREvent<{ CollectorName: string; Timestamp: string; InstanceCount: number }>(
    'healthscoreupdated',
    (data) => {
      const newActivities = new Map(activities);
      newActivities.set(data.CollectorName, {
        name: data.CollectorName,
        lastUpdate: new Date(data.Timestamp),
        instanceCount: data.InstanceCount,
        isRecent: true,
      });
      setActivities(newActivities);

      // Marcar como no reciente después de 5 segundos
      setTimeout(() => {
        setActivities(prev => {
          const updated = new Map(prev);
          const activity = updated.get(data.CollectorName);
          if (activity) {
            activity.isRecent = false;
            updated.set(data.CollectorName, activity);
          }
          return updated;
        });
      }, 5000);
    }
  );

  const getCollectorIcon = (name: string) => {
    switch (name) {
      case 'CPU': return <Cpu className="h-3 w-3" />;
      case 'Memoria': return <Activity className="h-3 w-3" />;
      case 'Discos': return <HardDrive className="h-3 w-3" />;
      case 'AlwaysOn': return <Shield className="h-3 w-3" />;
      case 'Backups': return <Database className="h-3 w-3" />;
      case 'Consolidate': return <Check className="h-3 w-3" />;
      default: return <AlertCircle className="h-3 w-3" />;
    }
  };

  const sortedActivities = Array.from(activities.values())
    .sort((a, b) => b.lastUpdate.getTime() - a.lastUpdate.getTime())
    .slice(0, 5); // Mostrar solo los últimos 5

  if (sortedActivities.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Actividad de Collectors
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sortedActivities.map((activity) => (
          <div
            key={activity.name}
            className={`flex items-center justify-between p-2 rounded-md transition-colors ${
              activity.isRecent ? 'bg-foreground/5 border border-foreground/10' : 'bg-muted/50'
            }`}
          >
            <div className="flex items-center gap-2">
              {getCollectorIcon(activity.name)}
              <span className="text-xs font-medium">{activity.name}</span>
              {activity.isRecent && (
                <Badge variant="outline" className="text-xs bg-foreground/5 text-foreground border-foreground/20">
                  <Activity className="h-2 w-2 mr-1 animate-pulse" />
                  Actualizando
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{activity.instanceCount} inst</span>
              <span>•</span>
              <span>{activity.lastUpdate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

