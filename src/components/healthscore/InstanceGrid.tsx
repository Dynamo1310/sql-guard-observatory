import { cn } from '@/lib/utils';
import { HealthScoreV3Dto } from '@/services/api';
import { InstanceCard } from './InstanceCard';
import { getAmbientePriority } from './types';

interface InstanceGridProps {
  instances: HealthScoreV3Dto[];
  onInstanceClick: (instanceName: string) => void;
  updatingInstances?: Set<string>;
  className?: string;
}

export function InstanceGrid({ 
  instances, 
  onInstanceClick, 
  updatingInstances = new Set(),
  className 
}: InstanceGridProps) {
  if (instances.length === 0) {
    return null;
  }

  // Sort instances: 
  // 1. By ambiente (Prod > Test > Dev)
  // 2. By status (Critical > Risk > Warning > Healthy)
  // 3. By score (lower first within same status)
  const sortedInstances = [...instances].sort((a, b) => {
    // First by ambiente priority
    const ambienteDiff = getAmbientePriority(a.ambiente) - getAmbientePriority(b.ambiente);
    if (ambienteDiff !== 0) return ambienteDiff;
    
    // Then by status
    const statusOrder = { Critical: 0, Risk: 1, Warning: 2, Healthy: 3 };
    const statusDiff = (statusOrder[a.healthStatus] ?? 4) - (statusOrder[b.healthStatus] ?? 4);
    if (statusDiff !== 0) return statusDiff;
    
    // Finally by score
    return a.healthScore - b.healthScore;
  });

  return (
    <div className={cn(
      'grid gap-4',
      'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      className
    )}>
      {sortedInstances.map((score) => (
        <InstanceCard
          key={score.instanceName}
          score={score}
          onClick={() => onInstanceClick(score.instanceName)}
          isUpdating={updatingInstances.has(score.instanceName)}
        />
      ))}
    </div>
  );
}
