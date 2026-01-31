/**
 * Configuración de Semanas de Freezing
 * Permite configurar qué semanas del mes están en período de freezing
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Snowflake, Save, RefreshCw, Calendar, AlertCircle, CheckCircle2 } from 'lucide-react';
import { patchConfigApi, PatchingFreezingConfigDto, FreezingMonthInfoDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function PatchFreezingConfig() {
  const queryClient = useQueryClient();
  const today = new Date();
  const [previewMonth] = useState(today.getMonth());
  const [previewYear] = useState(today.getFullYear());
  const [localConfig, setLocalConfig] = useState<PatchingFreezingConfigDto[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Query para configuración
  const { data: config, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['freezingConfig'],
    queryFn: () => patchConfigApi.getFreezingConfig(),
    staleTime: 5 * 60 * 1000,
  });

  // Query para preview del mes
  const { data: monthInfo } = useQuery({
    queryKey: ['freezingMonth', previewYear, previewMonth + 1],
    queryFn: () => patchConfigApi.getFreezingMonthInfo(previewYear, previewMonth + 1),
    staleTime: 5 * 60 * 1000,
  });

  // Inicializar estado local
  useEffect(() => {
    if (config) {
      setLocalConfig(config);
      setHasChanges(false);
    }
  }, [config]);

  // Mutation para guardar
  const saveMutation = useMutation({
    mutationFn: () => patchConfigApi.updateFreezingConfig({
      weeks: localConfig.map(c => ({
        weekOfMonth: c.weekOfMonth,
        isFreezingWeek: c.isFreezingWeek,
        description: c.description || undefined,
      }))
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['freezingConfig'] });
      queryClient.invalidateQueries({ queryKey: ['freezingMonth'] });
      toast.success('Configuración de freezing guardada');
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al guardar configuración');
    },
  });

  // Handlers
  const handleToggleFreezing = (weekOfMonth: number) => {
    setLocalConfig(prev => prev.map(c => 
      c.weekOfMonth === weekOfMonth 
        ? { ...c, isFreezingWeek: !c.isFreezingWeek }
        : c
    ));
    setHasChanges(true);
  };

  const handleDescriptionChange = (weekOfMonth: number, description: string) => {
    setLocalConfig(prev => prev.map(c => 
      c.weekOfMonth === weekOfMonth 
        ? { ...c, description }
        : c
    ));
    setHasChanges(true);
  };

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleReset = () => {
    if (config) {
      setLocalConfig(config);
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px]" />
          <Skeleton className="h-[400px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Snowflake className="h-8 w-8 text-blue-500" />
            Configuración de Freezing
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura las semanas del mes que están en período de freezing
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleReset}>
                Descartar
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Configuración de semanas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Semanas de Freezing
            </CardTitle>
            <CardDescription>
              Activa las semanas en las que no se permiten parcheos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {localConfig.map(weekConfig => (
              <div 
                key={weekConfig.weekOfMonth} 
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  weekConfig.isFreezingWeek 
                    ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800" 
                    : "bg-muted/30"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Semana {weekConfig.weekOfMonth}</span>
                    {weekConfig.isFreezingWeek && (
                      <Snowflake className="h-4 w-4 text-blue-500" />
                    )}
                  </div>
                  <Switch
                    checked={weekConfig.isFreezingWeek}
                    onCheckedChange={() => handleToggleFreezing(weekConfig.weekOfMonth)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`desc-${weekConfig.weekOfMonth}`} className="text-xs text-muted-foreground">
                    Descripción
                  </Label>
                  <Input
                    id={`desc-${weekConfig.weekOfMonth}`}
                    value={weekConfig.description || ''}
                    onChange={(e) => handleDescriptionChange(weekConfig.weekOfMonth, e.target.value)}
                    placeholder="Ej: Cierre contable..."
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Preview del mes actual */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Vista previa: {MONTHS[previewMonth]} {previewYear}
            </CardTitle>
            <CardDescription>
              Así se verán los días de freezing en el mes actual
            </CardDescription>
          </CardHeader>
          <CardContent>
            {monthInfo && (
              <div className="space-y-3">
                {monthInfo.weeks.map(week => (
                  <div 
                    key={week.weekOfMonth}
                    className={cn(
                      "p-3 rounded-lg border flex items-center justify-between",
                      week.isFreezingWeek 
                        ? "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800" 
                        : "bg-muted/30"
                    )}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Semana {week.weekOfMonth}</span>
                        {week.isFreezingWeek ? (
                          <AlertCircle className="h-4 w-4 text-blue-500" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(week.startDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' - '}
                        {new Date(week.endDate).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        {' '}({week.daysInWeek} días)
                      </div>
                      {week.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {week.description}
                        </div>
                      )}
                    </div>
                    <div className={cn(
                      "px-2 py-1 rounded text-xs font-medium",
                      week.isFreezingWeek 
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100"
                        : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100"
                    )}>
                      {week.isFreezingWeek ? 'FREEZING' : 'Disponible'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Información adicional */}
      <Card>
        <CardHeader>
          <CardTitle>Información</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground space-y-2">
            <p>
              <strong>Freezing:</strong> Durante las semanas de freezing, el sistema no sugerirá fechas 
              de parcheo y mostrará alertas visuales en el calendario.
            </p>
            <p>
              <strong>Semanas del mes:</strong> Las semanas se calculan desde el día 1 al 7 (semana 1), 
              del 8 al 14 (semana 2), etc. La semana 5 solo aplica en meses con más de 28 días.
            </p>
            <p>
              <strong>Banco Supervielle:</strong> Por defecto, las primeras dos semanas del mes están 
              configuradas como freezing por cierre contable.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
