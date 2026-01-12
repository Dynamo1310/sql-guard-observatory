import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Status = 'success' | 'warning' | 'critical' | 'info' | 'running';

interface StatusBadgeProps {
  status: Status;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const statusVariants: Record<Status, "soft-success" | "soft-warning" | "soft-destructive" | "soft-info" | "soft-primary"> = {
    success: 'soft-success',
    warning: 'soft-warning',
    critical: 'soft-destructive',
    info: 'soft-info',
    running: 'soft-primary',
  };

  return (
    <Badge variant={statusVariants[status]} className={cn('font-medium', className)}>
      {children}
    </Badge>
  );
}
