import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Plus,
  ArrowLeft,
  Clock,
  AlertTriangle,
  Database,
  Wifi,
  Shield,
  HardDrive,
  Zap,
  MoreHorizontal,
  Edit,
  Trash2,
  X,
  RefreshCw,
  CheckCircle,
  Settings,
  Tag,
  GripVertical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { OnCallActivationDialog } from '@/components/oncall/OnCallActivationDialog';
import {
  activationsApi,
  activationCategoriesApi,
  OnCallActivationDto,
  ActivationCategoryDto,
  defaultActivationCategories,
  activationSeverities
} from '@/services/api';

// Iconos por nombre de categoría
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

const getCategoryIcon = (categoryName: string) => {
  return categoryIconMap[categoryName] || Tag;
};

const severityColors: Record<string, string> = {
  Low: 'bg-muted text-muted-foreground border-border',
  Medium: 'bg-warning/10 text-warning border-warning/30',
  High: 'bg-warning/20 text-warning border-warning/50',
  Critical: 'bg-destructive/10 text-destructive border-destructive/30',
};

export default function OnCallActivations() {
  const navigate = useNavigate();
  const [activations, setActivations] = useState<OnCallActivationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showActivationDialog, setShowActivationDialog] = useState(false);
  const [editingActivation, setEditingActivation] = useState<OnCallActivationDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallActivationDto | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Estado global para bloquear operaciones simultáneas
  const [isProcessing, setIsProcessing] = useState(false);

  // Categorías dinámicas
  const [categories, setCategories] = useState<ActivationCategoryDto[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [showCategoriesDialog, setShowCategoriesDialog] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: '', icon: '' });
  const [editingCategory, setEditingCategory] = useState<ActivationCategoryDto | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<ActivationCategoryDto | null>(null);
  const [reopenCategoriesAfterAlert, setReopenCategoriesAfterAlert] = useState(false);
  const [draggingCategory, setDraggingCategory] = useState<number | null>(null);

  // Filtros
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');

  useEffect(() => {
    loadData();
    loadCategories();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await activationsApi.getAll();
      setActivations(data);
    } catch (err: any) {
      setActivations([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      setLoadingCategories(true);
      const data = await activationCategoriesApi.getAll();
      setCategories(data.sort((a, b) => a.order - b.order));
    } catch (err) {
      console.error('Error loading categories:', err);
      // Usar categorías por defecto si falla
      const defaultCats: ActivationCategoryDto[] = defaultActivationCategories.map((name, i) => ({
        id: i,
        name,
        isDefault: true,
        isActive: true,
        order: i,
        createdAt: new Date().toISOString(),
      }));
      setCategories(defaultCats);
    } finally {
      setLoadingCategories(false);
    }
  };

  // Gestión de categorías
  const handleSaveCategory = async () => {
    if (isProcessing || savingCategory) return; // Guard contra operaciones simultáneas

    if (!categoryForm.name.trim()) {
      toast.error('El nombre de la categoría es requerido');
      return;
    }

    try {
      setIsProcessing(true);
      setSavingCategory(true);
      if (editingCategory) {
        await activationCategoriesApi.update(editingCategory.id, {
          name: categoryForm.name,
          icon: categoryForm.icon || undefined,
          isActive: editingCategory.isActive,
        });
        toast.success('Categoría actualizada');
      } else {
        await activationCategoriesApi.create({
          name: categoryForm.name,
          icon: categoryForm.icon || undefined,
        });
        toast.success('Categoría creada');
      }
      setCategoryForm({ name: '', icon: '' });
      setEditingCategory(null);
      await loadCategories();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingCategory(false);
      setIsProcessing(false);
    }
  };

  const handleDeleteCategory = async (category: ActivationCategoryDto) => {
    if (isProcessing || savingCategory) return;

    try {
      setIsProcessing(true);
      setSavingCategory(true);
      await activationCategoriesApi.delete(category.id);
      toast.success('Categoría eliminada');
      await loadCategories();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingCategory(false);
      setIsProcessing(false);
      setDeletingCategory(null);
      // Reabrir el Dialog de categorías después de la operación
      if (reopenCategoriesAfterAlert) {
        setReopenCategoriesAfterAlert(false);
        setTimeout(() => setShowCategoriesDialog(true), 100);
      }
    }
  };

  const handleToggleCategoryActive = async (category: ActivationCategoryDto) => {
    if (isProcessing) return; // Guard contra operaciones simultáneas

    try {
      setIsProcessing(true);
      await activationCategoriesApi.update(category.id, {
        name: category.name,
        icon: category.icon,
        isActive: !category.isActive,
      });
      await loadCategories();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCategoryDragStart = (categoryId: number) => {
    setDraggingCategory(categoryId);
  };

  const handleCategoryDragOver = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (draggingCategory === null || draggingCategory === targetId) return;

    const dragIndex = categories.findIndex(c => c.id === draggingCategory);
    const targetIndex = categories.findIndex(c => c.id === targetId);

    if (dragIndex === -1 || targetIndex === -1) return;

    const newCategories = [...categories];
    const [removed] = newCategories.splice(dragIndex, 1);
    newCategories.splice(targetIndex, 0, removed);
    setCategories(newCategories);
  };

  const handleCategoryDragEnd = async () => {
    if (draggingCategory === null) return;
    if (isProcessing) return; // Guard contra operaciones simultáneas

    setDraggingCategory(null);

    try {
      setIsProcessing(true);
      const categoryIds = categories.map(c => c.id);
      await activationCategoriesApi.reorder(categoryIds);
    } catch (err: any) {
      toast.error('Error al reordenar: ' + err.message);
      await loadCategories();
    } finally {
      setIsProcessing(false);
    }
  };

  // Lista de categorías activas para los selects
  const activeCategories = categories.filter(c => c.isActive);

  const handleDelete = async (activation: OnCallActivationDto) => {
    if (isProcessing || deleting) return;

    try {
      setIsProcessing(true);
      setDeleting(true);
      await activationsApi.delete(activation.id);
      toast.success('Activación eliminada');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeleting(false);
      setIsProcessing(false);
      setDeleteConfirm(null);
    }
  };

  const openEdit = (activation: OnCallActivationDto) => {
    setEditingActivation(activation);
    setShowActivationDialog(true);
  };

  const openCreate = () => {
    setEditingActivation(null);
    setShowActivationDialog(true);
  };

  const filteredActivations = activations.filter(a => {
    if (filterCategory && a.category !== filterCategory) return false;
    if (filterSeverity && a.severity !== filterSeverity) return false;
    return true;
  });

  const clearFilters = () => {
    setFilterCategory('');
    setFilterSeverity('');
  };

  // Stats
  const totalActivations = activations.length;
  const criticalCount = activations.filter(a => a.severity === 'Critical').length;
  const resolvedCount = activations.filter(a => a.resolvedAt).length;
  const pendingCount = activations.filter(a => !a.resolvedAt).length;

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-80" />
            </div>
          </div>
          <Skeleton className="h-10 w-40" />
        </div>

        {/* KPIs Skeleton */}
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Skeleton */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-40" />
              <Skeleton className="h-10 w-40" />
            </div>
          </CardContent>
        </Card>

        {/* List Skeleton */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-48 mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-8 w-8" />
              Activaciones de Guardia
            </h1>
            <p className="text-muted-foreground">
              Registro de incidentes atendidos durante las guardias
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowCategoriesDialog(true)}>
            <Settings className="h-4 w-4 mr-2" />
            Gestionar Categorías
          </Button>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Activación
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activaciones</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalActivations}</div>
            <p className="text-xs text-muted-foreground">registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Críticas</CardTitle>
            <AlertTriangle className={cn('h-4 w-4', criticalCount > 0 ? 'text-red-500' : 'text-muted-foreground')} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', criticalCount > 0 ? 'text-red-500' : 'text-muted-foreground')}>
              {criticalCount}
            </div>
            <p className="text-xs text-muted-foreground">severidad crítica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resueltas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{resolvedCount}</div>
            <p className="text-xs text-muted-foreground">completadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className={cn('h-4 w-4', pendingCount > 0 ? 'text-warning' : 'text-muted-foreground')} />
          </CardHeader>
          <CardContent>
            <div className={cn('text-2xl font-bold', pendingCount > 0 ? 'text-warning' : 'text-muted-foreground')}>
              {pendingCount}
            </div>
            <p className="text-xs text-muted-foreground">sin resolver</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Filtros
          </CardTitle>
          <CardDescription>Filtra las activaciones por categoría o severidad</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <Select value={filterCategory || '__all__'} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {activeCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Severidad</Label>
              <Select value={filterSeverity || '__all__'} onValueChange={(v) => setFilterSeverity(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {activationSeverities.map(sev => (
                    <SelectItem key={sev} value={sev}>{sev}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(filterCategory || filterSeverity) && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de activaciones */}
      {filteredActivations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">Sin activaciones</p>
            <p className="text-muted-foreground">No hay activaciones registradas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredActivations.map((activation) => {
            const CategoryIcon = getCategoryIcon(activation.category);
            return (
              <Card key={activation.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center border',
                      severityColors[activation.severity]
                    )}>
                      <CategoryIcon className="h-5 w-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{activation.title}</h3>
                        <Badge variant="outline" className={severityColors[activation.severity]}>
                          {activation.severity}
                        </Badge>
                        <Badge variant="secondary">{activation.category}</Badge>
                        {activation.resolvedAt && (
                          <Badge variant="soft-success">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Resuelto
                          </Badge>
                        )}
                      </div>

                      {activation.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {activation.description}
                        </p>
                      )}

                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(activation.activatedAt).toLocaleString()}
                        </span>
                        {activation.durationMinutes && (
                          <span>
                            Duración: {Math.floor(activation.durationMinutes / 60)}h {activation.durationMinutes % 60}m
                          </span>
                        )}
                        <span>Operador: {activation.operatorDisplayName}</span>
                        {activation.instanceName && (
                          <span>Instancia: {activation.instanceName}</span>
                        )}
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          // Delay para permitir que el DropdownMenu se cierre
                          // antes de abrir el Dialog de edición
                          setTimeout(() => openEdit(activation), 100);
                        }}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            // Delay para permitir que el DropdownMenu se cierre
                            // antes de abrir el AlertDialog de confirmación
                            setTimeout(() => setDeleteConfirm(activation), 100);
                          }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog crear/editar - usando componente compartido */}
      <OnCallActivationDialog
        open={showActivationDialog}
        onOpenChange={(open) => {
          if (!open) {
            setEditingActivation(null);
          }
          setShowActivationDialog(open);
        }}
        editingActivation={editingActivation}
        onActivationCreated={loadData}
        onActivationUpdated={loadData}
      />

      {/* Dialog de gestión de categorías */}
      <Dialog
        open={showCategoriesDialog}
        onOpenChange={(open) => {
          // No permitir cerrar mientras hay operaciones en progreso
          if (!open && (isProcessing || savingCategory)) return;

          if (!open) {
            setCategoryForm({ name: '', icon: '' });
            setEditingCategory(null);
          }
          setShowCategoriesDialog(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Gestionar Categorías de Activación
            </DialogTitle>
            <DialogDescription>
              Configura las categorías disponibles para clasificar las activaciones de guardia
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Formulario para agregar/editar categoría */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">
                  {editingCategory ? 'Editar Categoría' : 'Nueva Categoría'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Nombre de la categoría"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSaveCategory();
                      }
                    }}
                    className="flex-1"
                  />
                  <Button type="button" onClick={handleSaveCategory} disabled={savingCategory}>
                    {savingCategory && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                    {editingCategory ? 'Guardar' : 'Agregar'}
                  </Button>
                  {editingCategory && (
                    <Button type="button" variant="ghost" onClick={() => {
                      setEditingCategory(null);
                      setCategoryForm({ name: '', icon: '' });
                    }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Lista de categorías */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Categorías Existentes</CardTitle>
                <CardDescription className="text-xs">
                  Arrastra para reordenar. Las categorías por defecto no se pueden eliminar.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingCategories ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No hay categorías configuradas
                  </p>
                ) : (
                  <div className="space-y-2">
                    {categories.map((category) => {
                      const CategoryIcon = getCategoryIcon(category.name);
                      return (
                        <div
                          key={category.id}
                          draggable
                          onDragStart={(e) => {
                            // Solo permitir drag desde el ícono de grip
                            const target = e.target as HTMLElement;
                            if (!target.closest('[data-drag-handle]')) {
                              e.preventDefault();
                              return;
                            }
                            handleCategoryDragStart(category.id);
                          }}
                          onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                          onDragEnd={handleCategoryDragEnd}
                          className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border bg-card transition-all",
                            draggingCategory === category.id && "opacity-50 ring-2 ring-primary",
                            !category.isActive && "opacity-60"
                          )}
                        >
                          <div data-drag-handle className="cursor-grab">
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
                            <CategoryIcon className="h-4 w-4" />
                          </div>
                          <span className="flex-1 font-medium">{category.name}</span>

                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {category.isDefault && (
                              <Badge variant="secondary" className="text-xs">
                                Por defecto
                              </Badge>
                            )}
                            <Switch
                              checked={category.isActive}
                              onCheckedChange={() => handleToggleCategoryActive(category)}
                              disabled={isProcessing}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={isProcessing}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setEditingCategory(category);
                                setCategoryForm({ name: category.name, icon: category.icon || '' });
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {!category.isDefault && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={isProcessing}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  // IMPORTANTE: Cerrar el Dialog de categorías ANTES de abrir el AlertDialog
                                  // para evitar conflictos de focus trap entre modales anidados
                                  setShowCategoriesDialog(false);
                                  setReopenCategoriesAfterAlert(true);
                                  // Usar setTimeout para asegurar que el Dialog se cierre completamente
                                  // antes de abrir el AlertDialog
                                  setTimeout(() => {
                                    setDeletingCategory(category);
                                  }, 100);
                                }}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCategoriesDialog(false)}
              disabled={isProcessing || savingCategory}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog de confirmación de eliminación de activación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && !deleting && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar activación?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la activación "{deleteConfirm?.title}"?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirm) {
                  handleDelete(deleteConfirm);
                }
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de confirmación de eliminación de categoría */}
      <AlertDialog
        open={!!deletingCategory}
        onOpenChange={(open) => {
          if (!open && !savingCategory) {
            setDeletingCategory(null);
            // Reabrir el Dialog de categorías si el usuario canceló
            if (reopenCategoriesAfterAlert) {
              setReopenCategoriesAfterAlert(false);
              setTimeout(() => setShowCategoriesDialog(true), 100);
            }
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar categoría?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la categoría "{deletingCategory?.name}"?
              Las activaciones existentes mantendrán esta categoría como texto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingCategory}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deletingCategory) {
                  handleDeleteCategory(deletingCategory);
                }
              }}
              disabled={savingCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingCategory && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
