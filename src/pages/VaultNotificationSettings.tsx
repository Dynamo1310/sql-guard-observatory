/**
 * Página de configuración de notificaciones del Vault
 */
import { useState, useEffect, useMemo } from 'react';
import { 
  Bell, Mail, RefreshCw, CheckCircle2, XCircle, 
  ToggleLeft, ToggleRight, RotateCcw, Shield,
  Users, Key, Clock, Share2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  vaultApi, 
  VaultNotificationPreferenceDto
} from '@/services/vaultApi';
import { toast } from 'sonner';

// Mapa de iconos por categoría
const categoryIcons: Record<string, React.ElementType> = {
  'Credenciales': Key,
  'Grupos': Users,
  'Compartir': Share2,
  'Alertas': Clock,
  'Seguridad': Shield,
  'General': Bell
};

// Colores por categoría
const categoryColors: Record<string, string> = {
  'Credenciales': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  'Grupos': 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  'Compartir': 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  'Alertas': 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  'Seguridad': 'bg-red-500/10 text-red-500 border-red-500/20',
  'General': 'bg-slate-500/10 text-slate-500 border-slate-500/20'
};

export default function VaultNotificationSettings() {
  const [preferences, setPreferences] = useState<VaultNotificationPreferenceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'enable-all' | 'disable-all' | 'reset' | null>(null);

  // Cargar preferencias
  const loadPreferences = async () => {
    setIsLoading(true);
    try {
      const data = await vaultApi.getNotificationPreferences();
      setPreferences(data);
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudieron cargar las preferencias de notificación'
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadPreferences();
  }, []);

  // Agrupar preferencias por categoría
  const groupedPreferences = useMemo(() => {
    const groups: Record<string, VaultNotificationPreferenceDto[]> = {};
    
    preferences.forEach(pref => {
      const category = pref.category || 'General';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(pref);
    });

    // Ordenar dentro de cada grupo
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => a.displayOrder - b.displayOrder);
    });

    return groups;
  }, [preferences]);

  // Orden de categorías
  const categoryOrder = ['Credenciales', 'Grupos', 'Compartir', 'Alertas', 'Seguridad', 'General'];
  const sortedCategories = Object.keys(groupedPreferences).sort((a, b) => {
    const indexA = categoryOrder.indexOf(a);
    const indexB = categoryOrder.indexOf(b);
    return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
  });

  // Estadísticas
  const enabledCount = preferences.filter(p => p.isEnabled).length;
  const totalCount = preferences.length;

  // Manejar cambio individual
  const handleToggle = async (notificationType: string, isEnabled: boolean) => {
    setIsSaving(notificationType);
    try {
      await vaultApi.updateSingleNotificationPreference(notificationType, isEnabled);
      
      // Actualizar estado local
      setPreferences(prev => 
        prev.map(p => 
          p.notificationType === notificationType 
            ? { ...p, isEnabled } 
            : p
        )
      );

      toast.success('Preferencia actualizada', {
        description: isEnabled 
          ? 'Recibirás notificaciones de este tipo' 
          : 'Ya no recibirás notificaciones de este tipo'
      });
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo actualizar la preferencia'
      });
    } finally {
      setIsSaving(null);
    }
  };

  // Manejar acciones masivas
  const handleBulkAction = async () => {
    if (!confirmAction) return;

    setConfirmDialogOpen(false);
    setIsLoading(true);

    try {
      switch (confirmAction) {
        case 'enable-all':
          await vaultApi.enableAllNotifications();
          toast.success('Todas las notificaciones habilitadas');
          break;
        case 'disable-all':
          await vaultApi.disableAllNotifications();
          toast.success('Todas las notificaciones deshabilitadas');
          break;
        case 'reset':
          await vaultApi.resetNotificationPreferences();
          toast.success('Preferencias restablecidas a los valores por defecto');
          break;
      }

      await loadPreferences();
    } catch (error) {
      toast.error('Error', {
        description: 'No se pudo completar la acción'
      });
      setIsLoading(false);
    }

    setConfirmAction(null);
  };

  // Renderizar skeleton de carga
  const renderSkeleton = () => (
    <div className="space-y-6">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            {[1, 2, 3].map(j => (
              <div key={j} className="flex items-center justify-between p-4 rounded-lg border">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-6 w-12" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/20">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mis Notificaciones</h1>
            <p className="text-muted-foreground">
              Configura qué notificaciones del Vault deseas recibir por email
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadPreferences}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmAction('enable-all');
              setConfirmDialogOpen(true);
            }}
            disabled={isLoading}
          >
            <ToggleRight className="h-4 w-4 mr-2" />
            Habilitar todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmAction('disable-all');
              setConfirmDialogOpen(true);
            }}
            disabled={isLoading}
          >
            <ToggleLeft className="h-4 w-4 mr-2" />
            Deshabilitar todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setConfirmAction('reset');
              setConfirmDialogOpen(true);
            }}
            disabled={isLoading}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Restablecer
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-200 dark:border-slate-700">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-white dark:bg-slate-800 shadow-sm">
                <Mail className="h-6 w-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Notificaciones activas</p>
                <p className="text-2xl font-bold">
                  {enabledCount} <span className="text-sm font-normal text-muted-foreground">de {totalCount}</span>
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>{enabledCount} habilitadas</span>
              <Separator orientation="vertical" className="h-4 mx-2" />
              <XCircle className="h-4 w-4 text-slate-400" />
              <span>{totalCount - enabledCount} deshabilitadas</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contenido principal */}
      {isLoading ? (
        renderSkeleton()
      ) : preferences.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No hay preferencias disponibles</h3>
            <p className="text-sm text-muted-foreground mt-1">
              No se encontraron tipos de notificación configurados en el sistema.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={loadPreferences}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map(category => {
            const CategoryIcon = categoryIcons[category] || Bell;
            const categoryColor = categoryColors[category] || categoryColors['General'];
            const categoryPrefs = groupedPreferences[category];
            const enabledInCategory = categoryPrefs.filter(p => p.isEnabled).length;

            return (
              <Card key={category}>
                <CardHeader className="pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg border ${categoryColor}`}>
                        <CategoryIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{category}</CardTitle>
                        <CardDescription>
                          {enabledInCategory} de {categoryPrefs.length} habilitadas
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className={categoryColor}>
                      {categoryPrefs.length} {categoryPrefs.length === 1 ? 'tipo' : 'tipos'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {categoryPrefs.map((pref, index) => (
                    <div 
                      key={pref.notificationType}
                      className={`
                        flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border
                        transition-all duration-200
                        ${pref.isEnabled 
                          ? 'bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' 
                          : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800'
                        }
                        ${isSaving === pref.notificationType ? 'opacity-70' : ''}
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium truncate">{pref.displayName}</h4>
                          {pref.isEnabled ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {pref.description}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className="text-xs text-muted-foreground">
                          {pref.isEnabled ? 'Habilitada' : 'Deshabilitada'}
                        </span>
                        <Switch
                          checked={pref.isEnabled}
                          onCheckedChange={(checked) => handleToggle(pref.notificationType, checked)}
                          disabled={isSaving !== null}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Info adicional */}
      <Card className="bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 h-fit">
              <Mail className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                Sobre las notificaciones
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Las notificaciones se envían a tu email registrado cuando ocurren eventos 
                relacionados con credenciales a las que tienes acceso. No recibirás 
                notificaciones de credenciales privadas de otros usuarios.
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-2">
                Los cambios en las preferencias se aplican inmediatamente.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de confirmación */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'enable-all' && 'Habilitar todas las notificaciones'}
              {confirmAction === 'disable-all' && 'Deshabilitar todas las notificaciones'}
              {confirmAction === 'reset' && 'Restablecer preferencias'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'enable-all' && 
                'Se habilitarán todas las notificaciones del Vault. Recibirás emails de todos los eventos relacionados con credenciales a las que tienes acceso.'}
              {confirmAction === 'disable-all' && 
                'Se deshabilitarán todas las notificaciones del Vault. No recibirás ningún email de eventos del Vault.'}
              {confirmAction === 'reset' && 
                'Se restablecerán todas las preferencias a sus valores por defecto. Algunas notificaciones importantes se habilitarán automáticamente.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkAction}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

