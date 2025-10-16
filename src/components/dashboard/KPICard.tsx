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
}

export function KPICard({ title, value, icon: Icon, description, trend, variant = 'default' }: KPICardProps) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-success/30 shadow-glow',
    warning: 'border-warning/30',
    critical: 'border-destructive/30',
  };

  return (
    <Card className={cn('gradient-card shadow-card transition-smooth hover:shadow-glow', variantStyles[variant])}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-5 w-5', {
          'text-foreground': variant === 'default',
          'text-success': variant === 'success',
          'text-warning': variant === 'warning',
          'text-destructive': variant === 'critical',
        })} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold font-mono">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-2">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
