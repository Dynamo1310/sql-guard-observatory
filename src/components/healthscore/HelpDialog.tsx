import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CATEGORIES } from './types';
import { 
  HelpCircle, CheckCircle2, AlertTriangle, AlertCircle, XCircle,
  Database, Shield, Link, Cpu, MemoryStick, Zap, HardDrive,
  Wrench, Settings, TrendingUp
} from 'lucide-react';

interface HelpDialogProps {
  trigger?: React.ReactNode;
}

const iconMap: Record<string, any> = {
  Database, Shield, Link, AlertTriangle, Cpu, MemoryStick, Zap, HardDrive,
  XCircle, Wrench, Settings, TrendingUp
};

export function HelpDialog({ trigger }: HelpDialogProps) {
  const availabilityCategories = CATEGORIES.filter(c => c.group === 'availability');
  const performanceCategories = CATEGORIES.filter(c => c.group === 'performance');
  const maintenanceCategories = CATEGORIES.filter(c => c.group === 'maintenance');

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2">
            <HelpCircle className="h-4 w-4" />
            <span className="hidden sm:inline">¿Cómo funciona?</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-info/10">
              <HelpCircle className="h-5 w-5 text-info" />
            </div>
            ¿Cómo se calcula el HealthScore?
          </DialogTitle>
          <DialogDescription>
            Metodología de evaluación de salud para instancias SQL Server
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="max-h-[calc(85vh-100px)]">
          <div className="p-6 pt-4 space-y-6">
            {/* Overview */}
            <div className="bg-info/5 border border-info/20 rounded-xl p-4">
              <p className="text-sm">
                El <span className="font-bold">Health Score v3.0</span> es una métrica de{' '}
                <span className="font-mono font-bold">0 a 100 puntos</span> que evalúa la salud 
                de instancias SQL Server mediante el análisis de{' '}
                <span className="font-bold">12 categorías ponderadas</span> de disponibilidad, 
                rendimiento y configuración.
              </p>
            </div>

            {/* Status Levels */}
            <div>
              <h3 className="font-semibold text-sm mb-3">Niveles de Estado</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatusCard icon={CheckCircle2} label="HEALTHY" range="90-100" colorClass="text-success" bgClass="bg-success/10 border-success/20" />
                <StatusCard icon={AlertTriangle} label="WARNING" range="75-89" colorClass="text-warning" bgClass="bg-warning/10 border-warning/20" />
                <StatusCard icon={AlertCircle} label="RISK" range="60-74" colorClass="text-warning" bgClass="bg-warning/10 border-warning/20" />
                <StatusCard icon={XCircle} label="CRITICAL" range="<60" colorClass="text-destructive" bgClass="bg-destructive/10 border-destructive/20" />
              </div>
            </div>

            {/* Categories */}
            <div>
              <h3 className="font-semibold text-sm mb-3">12 Categorías Ponderadas</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Cada categoría se evalúa de 0-100 y contribuye al score total según su peso.
              </p>

              {/* Availability & DR (40%) */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Database className="h-3.5 w-3.5" />
                  AVAILABILITY & DR (40%)
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {availabilityCategories.map(cat => <CategoryRow key={cat.key} category={cat} />)}
                </div>
              </div>

              {/* Performance (35%) */}
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5" />
                  PERFORMANCE (35%)
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {performanceCategories.map(cat => <CategoryRow key={cat.key} category={cat} />)}
                </div>
              </div>

              {/* Maintenance & Config (25%) */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5" />
                  MAINTENANCE & CONFIG (25%)
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {maintenanceCategories.map(cat => <CategoryRow key={cat.key} category={cat} />)}
                </div>
              </div>
            </div>

            {/* Calculation Summary */}
            <div className="bg-muted/20 rounded-xl border border-border/30 p-4">
              <h3 className="font-semibold text-sm mb-2">Cálculo del Score Final</h3>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>1. Cada categoría se evalúa de 0-100 según métricas específicas</p>
                <p>2. Se multiplica por su peso (ej: Backups × 18%)</p>
                <p>3. Se suman todas las contribuciones ponderadas</p>
                <p className="font-medium text-foreground pt-2 font-mono text-sm">
                  Score Final = Σ (Score_Categoría × Peso_Categoría)
                </p>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

interface StatusCardProps {
  icon: React.ElementType;
  label: string;
  range: string;
  colorClass: string;
  bgClass: string;
}

function StatusCard({ icon: Icon, label, range, colorClass, bgClass }: StatusCardProps) {
  return (
    <div className={cn('rounded-xl border p-3 text-center transition-all duration-200 hover:shadow-sm', bgClass)}>
      <Icon className={cn('h-6 w-6 mx-auto mb-1', colorClass)} />
      <p className={cn('text-xs font-bold', colorClass)}>{label}</p>
      <p className={cn('text-sm font-mono font-bold', colorClass)}>{range}</p>
    </div>
  );
}

interface CategoryRowProps {
  category: typeof CATEGORIES[0];
}

function CategoryRow({ category }: CategoryRowProps) {
  const Icon = iconMap[category.icon] || Database;
  
  return (
    <div className={cn(
      'flex items-center gap-2 p-2.5 rounded-lg border transition-all duration-200',
      'bg-muted/10 border-border/30 hover:border-border/50 hover:bg-muted/20'
    )}>
      <div className={cn('p-1.5 rounded-md', category.bgColor)}>
        <Icon className={cn('h-3.5 w-3.5', category.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{category.shortName}</p>
      </div>
      <Badge variant="outline" className="text-[10px] px-1.5 font-mono font-medium">
        {category.weight}%
      </Badge>
    </div>
  );
}
