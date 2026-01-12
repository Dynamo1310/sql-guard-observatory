import { useState } from 'react';
import { cn } from '@/lib/utils';
import { HealthScoreInstance } from './types';
import { ExpandableInstanceCard } from './ExpandableInstanceCard';

interface InstanceMasonryGridProps {
  instances: HealthScoreInstance[];
  className?: string;
}

export function InstanceMasonryGrid({ instances, className }: InstanceMasonryGridProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = (instanceName: string) => {
    setExpandedId(prev => prev === instanceName ? null : instanceName);
  };

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No se encontraron instancias</p>
        <p className="text-sm text-muted-foreground/60">Intenta ajustar los filtros</p>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3', className)}>
      {instances.map((instance) => (
        <ExpandableInstanceCard
          key={instance.nombreInstancia}
          instance={instance}
          isExpanded={expandedId === instance.nombreInstancia}
          onToggle={() => handleToggle(instance.nombreInstancia)}
        />
      ))}
    </div>
  );
}
