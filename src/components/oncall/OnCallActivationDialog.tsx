import { useState, useEffect, useMemo, useRef } from 'react';
import { Activity, Loader2, Database, Zap, Wifi, HardDrive, Shield, AlertTriangle, Search, Server, ExternalLink, Check, Clock, Tag, Plus, ChevronDown, X } from 'lucide-react';
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
  ActivationCategoryDto,
  OnCallActivationDto
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
  editingActivation?: OnCallActivationDto | null;
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

  // Estado para crear nueva categoría
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Ref para el dropdown de servidores
  const serverDropdownRef = useRef<HTMLDivElement>(null);
  const serverInputRef = useRef<HTMLInputElement>(null);

  // Ref para tracking si el componente está montado
  // Evita actualizaciones de estado en componentes desmontados
  const isMountedRef = useRef(true);

  // Efecto para tracking de montaje/desmontaje del componente
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Cerrar dropdown al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (serverDropdownRef.current && !serverDropdownRef.current.contains(event.target as Node)) {
        setServerSearchOpen(false);
      }
    };

    if (serverSearchOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [serverSearchOpen]);

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
  // IMPORTANTE: Usamos editingActivation?.id como dependencia para evitar re-renders infinitos
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingActivation?.id]);

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
      // Verificar si el componente sigue montado antes de actualizar estado
      if (!isMountedRef.current) return;
      setCategories(data);
      // Establecer categoría por defecto si no hay una seleccionada
      if (data.length > 0 && !formData.category) {
        setFormData(prev => ({ ...prev, category: data[0].name }));
      }
    } catch (err) {
      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;
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
      // Verificar si el componente sigue montado
      if (isMountedRef.current) {
        setLoadingCategories(false);
      }
    }
  };

  // Crear nueva categoría desde el modal
  const handleCreateCategory = async () => {
    // Guard contra doble submit
    if (savingCategory) return;

    if (!newCategoryName.trim()) {
      toast.error('El nombre de la categoría es requerido');
      return;
    }

    // Verificar si ya existe
    if (categories.some(c => c.name.toLowerCase() === newCategoryName.trim().toLowerCase())) {
      toast.error('Ya existe una categoría con ese nombre');
      return;
    }

    try {
      setSavingCategory(true);
      await activationCategoriesApi.create({
        name: newCategoryName.trim(),
      });

      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;

      toast.success('Categoría creada exitosamente');

      // Recargar categorías y seleccionar la nueva
      const data = await activationCategoriesApi.getActive();

      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;

      setCategories(data);
      setFormData(prev => ({ ...prev, category: newCategoryName.trim() }));

      // Limpiar estado
      setNewCategoryName('');
      setShowNewCategoryInput(false);
    } catch (err: any) {
      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;
      toast.error('Error al crear categoría: ' + err.message);
    } finally {
      // Verificar si el componente sigue montado
      if (isMountedRef.current) {
        setSavingCategory(false);
      }
    }
  };

  const loadSqlServers = async () => {
    try {
      setLoadingServers(true);
      const response = await inventoryApi.getSqlServerInstances(1, 1000);
      // Verificar si el componente sigue montado antes de actualizar estado
      if (!isMountedRef.current) return;
      setSqlServers(response.data);
    } catch (err) {
      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;
      console.error('Error loading SQL servers:', err);
      // No mostramos error, el campo será manual
    } finally {
      // Verificar si el componente sigue montado
      if (isMountedRef.current) {
        setLoadingServers(false);
      }
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
      setShowNewCategoryInput(false);
      setNewCategoryName('');
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard contra doble submit
    if (saving) return;

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

        // Verificar si el componente sigue montado
        if (!isMountedRef.current) return;

        toast.success('Activación actualizada exitosamente');
        // IMPORTANTE: Cerrar el modal PRIMERO, luego ejecutar callback
        // Esto evita que el modal intente actualizar estado mientras se cierra
        onOpenChange(false);
        // Ejecutar callback después de un pequeño delay para asegurar que el modal se cerró
        setTimeout(() => onActivationUpdated?.(), 50);
      } else {
        // Crear nueva activación
        const schedule = await onCallApi.getScheduleByDate(formData.activatedAt);

        // Verificar si el componente sigue montado
        if (!isMountedRef.current) return;

        if (!schedule) {
          toast.error('No hay guardia asignada para la fecha seleccionada');
          setSaving(false);
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

        // Verificar si el componente sigue montado
        if (!isMountedRef.current) return;

        toast.success('Activación registrada exitosamente');
        // IMPORTANTE: Cerrar el modal PRIMERO, luego ejecutar callback
        onOpenChange(false);
        // Ejecutar callback después de un pequeño delay para asegurar que el modal se cerró
        setTimeout(() => onActivationCreated?.(), 50);
      }
    } catch (err: any) {
      // Verificar si el componente sigue montado
      if (!isMountedRef.current) return;
      toast.error('Error: ' + err.message);
    } finally {
      // Verificar si el componente sigue montado
      if (isMountedRef.current) {
        setSaving(false);
      }
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
    <Dialog
      open={open}
      onOpenChange={(newOpen) => {
        // No permitir cerrar mientras se está guardando
        if (saving && !newOpen) return;
        onOpenChange(newOpen);
      }}
    >
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
              {showNewCategoryInput ? (
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre de nueva categoría"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateCategory();
                      } else if (e.key === 'Escape') {
                        setShowNewCategoryInput(false);
                        setNewCategoryName('');
                      }
                    }}
                    className="flex-1"
                    autoFocus
                    disabled={savingCategory}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateCategory}
                    disabled={savingCategory || !newCategoryName.trim()}
                  >
                    {savingCategory ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowNewCategoryInput(false);
                      setNewCategoryName('');
                    }}
                    disabled={savingCategory}
                  >
                    ✕
                  </Button>
                </div>
              ) : (
                <Select
                  value={formData.category}
                  onValueChange={(v) => {
                    if (v === '__new__') {
                      setShowNewCategoryInput(true);
                    } else {
                      setFormData({ ...formData, category: v });
                    }
                  }}
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
                    <SelectItem value="__new__">
                      <div className="flex items-center gap-2 text-primary">
                        <Plus className="h-4 w-4" />
                        Agregar nueva categoría...
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
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
            <div ref={serverDropdownRef} className="relative">
              {/* Campo de búsqueda/selección */}
              <div
                className={cn(
                  "flex items-center w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
                  serverSearchOpen && "ring-2 ring-ring ring-offset-2"
                )}
              >
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  ref={serverInputRef}
                  type="text"
                  className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
                  placeholder={formData.instanceName || "Buscar servidor SQL..."}
                  value={serverSearchOpen ? serverSearch : (formData.instanceName || '')}
                  onChange={(e) => {
                    setServerSearch(e.target.value);
                    if (!serverSearchOpen) {
                      setServerSearchOpen(true);
                    }
                  }}
                  onFocus={() => {
                    setServerSearchOpen(true);
                    setServerSearch('');
                  }}
                  disabled={loadingServers}
                />
                {formData.instanceName && !serverSearchOpen && (
                  <button
                    type="button"
                    className="ml-2 p-1 hover:bg-accent rounded"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormData(prev => ({ ...prev, instanceName: '' }));
                    }}
                  >
                    <X className="h-3 w-3 text-muted-foreground" />
                  </button>
                )}
                {loadingServers ? (
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown
                    className={cn(
                      "ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform",
                      serverSearchOpen && "rotate-180"
                    )}
                  />
                )}
              </div>

              {/* Lista desplegable */}
              {serverSearchOpen && (
                <div
                  className="absolute z-[9999] mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-lg"
                  style={{ maxHeight: '250px' }}
                >
                  <div
                    className="overflow-y-auto p-1"
                    style={{ maxHeight: '248px' }}
                    onWheel={(e) => e.stopPropagation()}
                  >
                    {filteredServers.length === 0 ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {loadingServers ? 'Cargando...' : 'No se encontraron servidores'}
                      </div>
                    ) : (
                      filteredServers.map((server) => (
                        <div
                          key={server.id}
                          className={cn(
                            "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                            formData.instanceName === server.NombreInstancia && "bg-accent"
                          )}
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFormData(prev => ({ ...prev, instanceName: server.NombreInstancia }));
                            setServerSearchOpen(false);
                            setServerSearch('');
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4 shrink-0",
                              formData.instanceName === server.NombreInstancia ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="font-medium truncate">{server.NombreInstancia}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="truncate">{server.MajorVersion?.split(' ').slice(0, 4).join(' ')}</span>
                              <span>•</span>
                              <Badge variant="outline" className="text-[10px] py-0 shrink-0">
                                {server.ambiente}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            {formData.instanceName && selectedServer && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">{selectedServer.ambiente}</Badge>
                {selectedServer.MajorVersion?.split(' ').slice(0, 4).join(' ')}
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
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
