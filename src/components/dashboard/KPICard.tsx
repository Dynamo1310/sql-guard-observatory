import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
  variant?: 'default' | 'success' | 'warning' | 'critical';
  onClick?: () => void;
}

export function KPICard({ title, value, icon: Icon, description, trend, variant = 'default', onClick }: KPICardProps) {
  // Colores del icono según variante
  const iconColorClass = {
    default: 'text-muted-foreground',
    success: 'text-emerald-500',
    warning: 'text-warning',
    critical: 'text-destructive',
  };

  // Colores del valor según variante
  const valueColorClass = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    warning: 'text-warning',
    critical: 'text-destructive',
  };

  return (
    <Card 
      className={cn(
        'transition-all duration-200', 
        onClick && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={cn('h-4 w-4', iconColorClass[variant])} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueColorClass[variant])}>{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
