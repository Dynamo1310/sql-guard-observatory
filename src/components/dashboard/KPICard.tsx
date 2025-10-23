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
  const variantStyles = {
    default: 'border-border',
    success: 'border-success/30 shadow-glow',
    warning: 'border-warning/30',
    critical: 'border-destructive/30',
  };

  return (
    <Card 
      className={cn(
        'gradient-card shadow-card transition-smooth hover:shadow-glow', 
        variantStyles[variant],
        onClick && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
      )}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 p-3 lg:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4 sm:h-5 sm:w-5', {
          'text-foreground': variant === 'default',
          'text-success': variant === 'success',
          'text-warning': variant === 'warning',
          'text-destructive': variant === 'critical',
        })} />
      </CardHeader>
      <CardContent className="p-3 pt-0 lg:p-6 lg:pt-0">
        <div className="text-xl sm:text-2xl lg:text-3xl font-bold font-mono">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1 sm:mt-2">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
