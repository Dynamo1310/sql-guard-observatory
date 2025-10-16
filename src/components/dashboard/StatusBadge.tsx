import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type Status = 'success' | 'warning' | 'critical' | 'info' | 'running';

interface StatusBadgeProps {
  status: Status;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ status, children, className }: StatusBadgeProps) {
  const statusStyles = {
    success: 'bg-success/10 text-success border-success/30',
    warning: 'bg-warning/10 text-warning border-warning/30',
    critical: 'bg-destructive/10 text-destructive border-destructive/30',
    info: 'bg-info/10 text-info border-info/30',
    running: 'bg-primary/10 text-primary border-primary/30',
  };

  return (
    <Badge variant="outline" className={cn(statusStyles[status], 'font-medium', className)}>
      {children}
    </Badge>
  );
}
