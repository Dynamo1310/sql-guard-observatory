import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Activity, 
  Plus, 
  ArrowLeft,
  Loader2,
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
  Filter,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { 
  activationsApi, 
  OnCallActivationDto, 
  CreateActivationRequest,
  activationCategories,
  activationSeverities,
  onCallApi
} from '@/services/api';

const categoryIcons: Record<string, any> = {
  Database: Database,
  Performance: Zap,
  Connectivity: Wifi,
  Backup: HardDrive,
  Security: Shield,
  Other: AlertTriangle,
};

const severityColors: Record<string, string> = {
  Low: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  Medium: 'bg-amber-500/20 text-amber-500 border-amber-500/30',
  High: 'bg-orange-500/20 text-orange-500 border-orange-500/30',
  Critical: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export default function OnCallActivations() {
  const navigate = useNavigate();
  const [activations, setActivations] = useState<OnCallActivationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingActivation, setEditingActivation] = useState<OnCallActivationDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallActivationDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filtros
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');

  // Helper para obtener fecha/hora local en formato datetime-local
  const getLocalDateTimeString = (date: Date = new Date()) => {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    return localDate.toISOString().slice(0, 16);
  };

  // Formulario
  const [formData, setFormData] = useState<CreateActivationRequest>({
    scheduleId: 0,
    activatedAt: getLocalDateTimeString(),
    category: 'Other',
    severity: 'Medium',
    title: '',
    description: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await activationsApi.getAll();
      setActivations(data);
    } catch (err: any) {
      // API no disponible todavía, mostrar lista vacía
      setActivations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title) {
      toast.error('El título es requerido');
      return;
    }

    try {
      setSaving(true);

      if (editingActivation) {
        // Al editar, mantener el scheduleId existente
        await activationsApi.update(editingActivation.id, {
          ...formData,
          resolvedAt: formData.resolvedAt || undefined,
        });
        toast.success('Activación actualizada');
      } else {
        // Buscar la guardia correspondiente a la fecha de activación
        const schedule = await onCallApi.getScheduleByDate(formData.activatedAt);
        if (!schedule) {
          toast.error('No hay guardia asignada para la fecha seleccionada');
          return;
        }

        await activationsApi.create({
          ...formData,
          scheduleId: schedule.id,
        });
        toast.success('Activación registrada');
      }

      setShowCreateDialog(false);
      setEditingActivation(null);
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (activation: OnCallActivationDto) => {
    try {
      setDeleting(true);
      await activationsApi.delete(activation.id);
      toast.success('Activación eliminada');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      scheduleId: 0,
      activatedAt: getLocalDateTimeString(),
      category: 'Other',
      severity: 'Medium',
      title: '',
      description: '',
    });
  };

  const openEdit = (activation: OnCallActivationDto) => {
    setFormData({
      scheduleId: activation.scheduleId,
      activatedAt: activation.activatedAt.slice(0, 16),
      resolvedAt: activation.resolvedAt?.slice(0, 16),
      durationMinutes: activation.durationMinutes,
      category: activation.category,
      severity: activation.severity,
      title: activation.title,
      description: activation.description,
      resolution: activation.resolution,
      instanceName: activation.instanceName,
    });
    setEditingActivation(activation);
    setShowCreateDialog(true);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-purple-500" />
              Activaciones de Guardia
            </h1>
            <p className="text-muted-foreground">
              Registro de incidentes atendidos durante las guardias
            </p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Activación
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <Select value={filterCategory || '__all__'} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {activationCategories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay activaciones registradas
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredActivations.map((activation) => {
            const CategoryIcon = categoryIcons[activation.category] || AlertTriangle;
            return (
              <Card key={activation.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      severityColors[activation.severity]
                    }`}>
                      <CategoryIcon className="h-5 w-5" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{activation.title}</h3>
                        <Badge variant="outline" className={severityColors[activation.severity]}>
                          {activation.severity}
                        </Badge>
                        <Badge variant="secondary">{activation.category}</Badge>
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
                        <DropdownMenuItem onClick={() => openEdit(activation)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => setDeleteConfirm(activation)}
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

      {/* Dialog crear/editar */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setEditingActivation(null);
          resetForm();
        }
        setShowCreateDialog(open);
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingActivation ? 'Editar Activación' : 'Nueva Activación'}
            </DialogTitle>
            <DialogDescription>
              Registra un incidente atendido durante la guardia
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Fecha y Hora de Activación</Label>
                <Input
                  type="datetime-local"
                  value={formData.activatedAt}
                  onChange={(e) => setFormData({ ...formData, activatedAt: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fecha y Hora de Resolución (opcional)</Label>
                <Input
                  type="datetime-local"
                  value={formData.resolvedAt || ''}
                  onChange={(e) => setFormData({ ...formData, resolvedAt: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select 
                  value={formData.category} 
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activationCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Severidad</Label>
                <Select 
                  value={formData.severity} 
                  onValueChange={(v) => setFormData({ ...formData, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activationSeverities.map(sev => (
                      <SelectItem key={sev} value={sev}>{sev}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Título *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Breve descripción del incidente"
              />
            </div>

            <div className="space-y-2">
              <Label>Instancia SQL (opcional)</Label>
              <Input
                value={formData.instanceName || ''}
                onChange={(e) => setFormData({ ...formData, instanceName: e.target.value })}
                placeholder="Nombre de la instancia afectada"
              />
            </div>

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Detalle del problema..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Resolución</Label>
              <Textarea
                value={formData.resolution || ''}
                onChange={(e) => setFormData({ ...formData, resolution: e.target.value })}
                placeholder="Cómo se resolvió el incidente..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Duración (minutos)</Label>
              <Input
                type="number"
                value={formData.durationMinutes || ''}
                onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) || undefined })}
                placeholder="Tiempo total invertido"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingActivation ? 'Guardar Cambios' : 'Registrar Activación'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar activación?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la activación "{deleteConfirm?.title}"?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

