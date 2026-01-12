import { useState, useEffect, useMemo } from 'react';
import { Activity, Loader2, Database, Zap, Wifi, HardDrive, Shield, AlertTriangle, Search, Server, ExternalLink, Check, Clock, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  activationsApi, 
  activationCategoriesApi,
  defaultActivationCategories,
  activationSeverities,
  onCallApi,
  inventoryApi,
  SqlServerInstanceDto,
  ActivationCategoryDto
} from '@/services/api';

// Iconos por nombre de categoría (para categorías configurables)
const categoryIconMap: Record<string, any> = {
  'Backups': HardDrive,
  'Backup': HardDrive,
  'Conectividad': Wifi,
  'Connectivity': Wifi,
  'Rendimiento': Zap,
  'Performance': Zap,
  'Espacio en Disco': Database,
  'Disk': Database,
  'Seguridad': Shield,
  'Security': Shield,
  'Base de Datos': Database,
  'Database': Database,
  'Otro': AlertTriangle,
  'Other': AlertTriangle,
};

// Función para obtener icono de categoría
const getCategoryIcon = (categoryName: string, iconName?: string) => {
  if (iconName && categoryIconMap[iconName]) {
    return categoryIconMap[iconName];
  }
  return categoryIconMap[categoryName] || Tag;
};

// Etiquetas en español para severidades
const severityLabels: Record<string, string> = {
  Low: 'Baja',
  Medium: 'Media',
  High: 'Alta',
  Critical: 'Crítica',
};

interface OnCallActivationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate?: Date | null;
  editingActivation?: {
    id: number;
    scheduleId: number;
    activatedAt: string;
    resolvedAt?: string;
    category: string;
    severity: string;
    title: string;
    description?: string;
    resolution?: string;
    instanceName?: string;
    durationMinutes?: number;
    serviceDeskUrl?: string;
    status?: 'Pending' | 'Resolved';
  } | null;
  onActivationCreated?: () => void;
  onActivationUpdated?: () => void;
}

export function OnCallActivationDialog({
  open,
  onOpenChange,
  selectedDate,
  editingActivation,
  onActivationCreated,
  onActivationUpdated,
}: OnCallActivationDialogProps) {
  const [saving, setSaving] = useState(false);
  const [sqlServers, setSqlServers] = useState<SqlServerInstanceDto[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);
  const [serverSearchOpen, setServerSearchOpen] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [categories, setCategories] = useState<ActivationCategoryDto[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);

  // Helper para obtener fecha/hora local en formato datetime-local
  const getLocalDateTimeString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  const getInitialFormData = () => ({
    scheduleId: 0,
    activatedAt: getLocalDateTimeString(),
    resolvedAt: '',
    category: '',
    severity: 'Medium',
    title: '',
    description: '',
    resolution: '',
    instanceName: '',
    durationMinutes: undefined as number | undefined,
    serviceDeskUrl: '',
    status: 'Pending' as 'Pending' | 'Resolved',
  });

  const [formData, setFormData] = useState(getInitialFormData());

  // Rellenar formulario cuando se edita una activación existente
  useEffect(() => {
    if (open && editingActivation) {
      setFormData({
        scheduleId: editingActivation.scheduleId,
        activatedAt: editingActivation.activatedAt.slice(0, 16),
        resolvedAt: editingActivation.resolvedAt?.slice(0, 16) || '',
        category: editingActivation.category,
        severity: editingActivation.severity,
        title: editingActivation.title,
        description: editingActivation.description || '',
        resolution: editingActivation.resolution || '',
        instanceName: editingActivation.instanceName || '',
        durationMinutes: editingActivation.durationMinutes,
        serviceDeskUrl: editingActivation.serviceDeskUrl || '',
        status: editingActivation.status || (editingActivation.resolvedAt ? 'Resolved' : 'Pending'),
      });
    } else if (open && !editingActivation) {
      // Reset form for new activation
      setFormData(getInitialFormData());
    }
  }, [open, editingActivation]);

  // Cargar categorías y servidores SQL al abrir el diálogo
  useEffect(() => {
    if (open) {
      if (sqlServers.length === 0) {
        loadSqlServers();
      }
      if (categories.length === 0) {
        loadCategories();
      }
    }
  }, [open]);

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await activationCategoriesApi.getActive();
      setCategories(data);
      // Establecer categoría por defecto si no hay una seleccionada
      if (data.length > 0 && !formData.category) {
        setFormData(prev => ({ ...prev, category: data[0].name }));
      }
    } catch (err) {
      console.error('Error loading categories:', err);
      // Usar categorías por defecto si falla la carga
      const defaultCats: ActivationCategoryDto[] = defaultActivationCategories.map((name, i) => ({
        id: i,
        name,
        isDefault: true,
        isActive: true,
        order: i,
        createdAt: new Date().toISOString(),
      }));
      setCategories(defaultCats);
      if (!formData.category) {
        setFormData(prev => ({ ...prev, category: defaultCats[0].name }));
      }
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadSqlServers = async () => {
    try {
      setLoadingServers(true);
      const response = await inventoryApi.getSqlServerInstances(1, 1000);
      setSqlServers(response.data);
    } catch (err) {
      console.error('Error loading SQL servers:', err);
      // No mostramos error, el campo será manual
    } finally {
      setLoadingServers(false);
    }
  };

  // Filtrar servidores según búsqueda
  const filteredServers = useMemo(() => {
    if (!serverSearch) return sqlServers.slice(0, 50); // Limitar a 50 si no hay búsqueda
    const search = serverSearch.toLowerCase();
    return sqlServers
      .filter(s => 
        s.NombreInstancia.toLowerCase().includes(search) ||
        s.ServerName.toLowerCase().includes(search) ||
        s.ambiente?.toLowerCase().includes(search)
      )
      .slice(0, 50);
  }, [sqlServers, serverSearch]);

  // Actualizar fecha cuando cambia selectedDate (solo si no estamos editando)
  useEffect(() => {
    if (open && selectedDate && !editingActivation) {
      // Establecer hora a las 10:00 del día seleccionado por defecto
      const dateWithTime = new Date(selectedDate);
      dateWithTime.setHours(10, 0, 0, 0);
      setFormData(prev => ({
        ...prev,
        activatedAt: getLocalDateTimeString(dateWithTime),
      }));
    }
  }, [open, selectedDate, editingActivation]);

  // Reset form cuando se cierra
  useEffect(() => {
    if (!open) {
      setServerSearch('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title) {
      toast.error('El título es requerido');
      return;
    }

    // Validar URL de Service Desk si se proporciona
    if (formData.serviceDeskUrl && !isValidUrl(formData.serviceDeskUrl)) {
      toast.error('La URL de Service Desk no es válida');
      return;
    }

    try {
      setSaving(true);

      if (editingActivation) {
        // Actualizar activación existente
        await activationsApi.update(editingActivation.id, {
          activatedAt: formData.activatedAt,
          resolvedAt: formData.status === 'Resolved' ? (formData.resolvedAt || formData.activatedAt) : undefined,
          category: formData.category,
          severity: formData.severity,
          title: formData.title,
          description: formData.description || undefined,
          resolution: formData.resolution || undefined,
          instanceName: formData.instanceName || undefined,
          durationMinutes: formData.durationMinutes,
          serviceDeskUrl: formData.serviceDeskUrl || undefined,
          status: formData.status,
        });
        toast.success('Activación actualizada exitosamente');
        onOpenChange(false);
        onActivationUpdated?.();
      } else {
        // Crear nueva activación
        const schedule = await onCallApi.getScheduleByDate(formData.activatedAt);
        if (!schedule) {
          toast.error('No hay guardia asignada para la fecha seleccionada');
          return;
        }

        await activationsApi.create({
          scheduleId: schedule.id,
          activatedAt: formData.activatedAt,
          resolvedAt: formData.status === 'Resolved' ? (formData.resolvedAt || formData.activatedAt) : undefined,
          category: formData.category,
          severity: formData.severity,
          title: formData.title,
          description: formData.description || undefined,
          resolution: formData.resolution || undefined,
          instanceName: formData.instanceName || undefined,
          durationMinutes: formData.durationMinutes,
          serviceDeskUrl: formData.serviceDeskUrl || undefined,
          status: formData.status,
        });
        toast.success('Activación registrada exitosamente');
        onOpenChange(false);
        onActivationCreated?.();
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const isValidUrl = (url: string): boolean => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const formatDateForDisplay = () => {
    if (!selectedDate) return null;
    return selectedDate.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  // Obtener el servidor seleccionado
  const selectedServer = sqlServers.find(s => s.NombreInstancia === formData.instanceName);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            {editingActivation ? 'Editar Activación' : 'Nueva Activación de Guardia'}
          </DialogTitle>
          <DialogDescription>
            {editingActivation ? (
              'Modifica los detalles de la activación'
            ) : selectedDate ? (
              <>Registrar activación para el <strong className="capitalize">{formatDateForDisplay()}</strong></>
            ) : (
              'Registrar una nueva activación de guardia'
            )}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Fechas */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="activatedAt">Fecha/Hora Desde *</Label>
              <Input
                id="activatedAt"
                type="datetime-local"
                value={formData.activatedAt}
                onChange={(e) =>
                  setFormData({ ...formData, activatedAt: e.target.value })
                }
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resolvedAt">Fecha/Hora Hasta</Label>
              <Input
                id="resolvedAt"
                type="datetime-local"
                value={formData.resolvedAt}
                onChange={(e) =>
                  setFormData({ ...formData, resolvedAt: e.target.value })
                }
              />
            </div>
          </div>

          {/* Categoría y Severidad */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Categoría</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v })}
                disabled={loadingCategories}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder={loadingCategories ? "Cargando..." : "Seleccionar categoría"} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => {
                    const Icon = getCategoryIcon(cat.name, cat.icon);
                    return (
                      <SelectItem key={cat.id} value={cat.name}>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {cat.name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="severity">Severidad</Label>
              <Select
                value={formData.severity}
                onValueChange={(v) => setFormData({ ...formData, severity: v })}
              >
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {activationSeverities.map((sev) => (
                    <SelectItem key={sev} value={sev}>
                      {severityLabels[sev] || sev}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Título */}
          <div className="space-y-2">
            <Label htmlFor="title">Título *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Breve descripción del incidente..."
              required
            />
          </div>

          {/* Selector de Servidor SQL */}
          <div className="space-y-2">
            <Label>Instancia SQL</Label>
            <Popover open={serverSearchOpen} onOpenChange={setServerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serverSearchOpen}
                  className="w-full justify-between"
                  disabled={loadingServers}
                >
                  {loadingServers ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cargando servidores...
                    </span>
                  ) : formData.instanceName ? (
                    <span className="flex items-center gap-2 truncate">
                      <Server className="h-4 w-4" />
                      {formData.instanceName}
                      {selectedServer && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {selectedServer.ambiente}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Buscar servidor SQL...
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput 
                    placeholder="Buscar por nombre, instancia o ambiente..." 
                    value={serverSearch}
                    onValueChange={setServerSearch}
                  />
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandEmpty>
                      {loadingServers ? 'Cargando...' : 'No se encontraron servidores'}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredServers.map((server) => (
                        <CommandItem
                          key={server.id}
                          value={server.NombreInstancia}
                          onSelect={() => {
                            setFormData({ ...formData, instanceName: server.NombreInstancia });
                            setServerSearchOpen(false);
                            setServerSearch('');
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              formData.instanceName === server.NombreInstancia ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{server.NombreInstancia}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{server.MajorVersion?.split(' ').slice(0, 4).join(' ')}</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-[10px] py-0">
                                {server.ambiente}
                              </Badge>
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {formData.instanceName && !selectedServer && (
              <p className="text-xs text-muted-foreground">
                Servidor ingresado manualmente
              </p>
            )}
          </div>

          {/* Campo Service Desk (SD) */}
          <div className="space-y-2">
            <Label htmlFor="serviceDeskUrl">
              SD - Service Desk
              <span className="text-muted-foreground text-xs ml-2">(opcional)</span>
            </Label>
            <div className="flex gap-2">
              <Input
                id="serviceDeskUrl"
                value={formData.serviceDeskUrl}
                onChange={(e) => setFormData({ ...formData, serviceDeskUrl: e.target.value })}
                placeholder="https://servicedesk.supervielle.com.ar/requests/show/index/id/..."
                className="flex-1"
              />
              {formData.serviceDeskUrl && isValidUrl(formData.serviceDeskUrl) && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => window.open(formData.serviceDeskUrl, '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Descripción */}
          <div className="space-y-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              placeholder="Detalle del problema..."
              rows={3}
            />
          </div>

          {/* Estado: Pendiente/Resuelto */}
          <div className="space-y-2">
            <Label>Estado</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={formData.status === 'Pending' ? 'default' : 'outline'}
                className={cn(
                  "flex-1",
                  formData.status === 'Pending' && "bg-amber-500 hover:bg-amber-600"
                )}
                onClick={() => setFormData({ ...formData, status: 'Pending' })}
              >
                <Clock className="mr-2 h-4 w-4" />
                Pendiente
              </Button>
              <Button
                type="button"
                variant={formData.status === 'Resolved' ? 'default' : 'outline'}
                className={cn(
                  "flex-1",
                  formData.status === 'Resolved' && "bg-green-500 hover:bg-green-600"
                )}
                onClick={() => setFormData({ ...formData, status: 'Resolved' })}
              >
                <Check className="mr-2 h-4 w-4" />
                Resuelto
              </Button>
            </div>
          </div>

          {/* Resolución (solo si está resuelto) */}
          {formData.status === 'Resolved' && (
            <div className="space-y-2">
              <Label htmlFor="resolution">Resolución</Label>
              <Textarea
                id="resolution"
                value={formData.resolution}
                onChange={(e) =>
                  setFormData({ ...formData, resolution: e.target.value })
                }
                placeholder="Cómo se resolvió el incidente..."
                rows={3}
              />
            </div>
          )}

          {/* Duración */}
          <div className="space-y-2">
            <Label htmlFor="durationMinutes">Duración (minutos)</Label>
            <Input
              id="durationMinutes"
              type="number"
              value={formData.durationMinutes || ''}
              onChange={(e) =>
                setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || undefined })
              }
              placeholder="Tiempo total invertido"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Activity className="mr-2 h-4 w-4" />
                  {editingActivation ? 'Guardar Cambios' : 'Registrar Activación'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
