import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  Plus, 
  ArrowLeft,
  Loader2,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Mail,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  alertsApi, 
  OnCallAlertRuleDto, 
  CreateAlertRuleRequest,
  alertTypes
} from '@/services/api';

export default function OnCallAlerts() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<OnCallAlertRuleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingAlert, setEditingAlert] = useState<OnCallAlertRuleDto | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallAlertRuleDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Para agregar destinatarios
  const [showRecipientDialog, setShowRecipientDialog] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<number | null>(null);
  const [newRecipientEmail, setNewRecipientEmail] = useState('');
  const [newRecipientName, setNewRecipientName] = useState('');
  const [addingRecipient, setAddingRecipient] = useState(false);

  // Formulario
  const [formData, setFormData] = useState<CreateAlertRuleRequest>({
    name: '',
    description: '',
    alertType: 'ScheduleGenerated',
    conditionDays: undefined,
    recipients: [],
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await alertsApi.getAll();
      setAlerts(data);
    } catch (err: any) {
      // API no disponible todavía
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.alertType) {
      toast.error('Nombre y tipo son requeridos');
      return;
    }

    try {
      setSaving(true);

      if (editingAlert) {
        await alertsApi.update(editingAlert.id, {
          name: formData.name,
          description: formData.description,
          conditionDays: formData.conditionDays,
        });
        toast.success('Alerta actualizada');
      } else {
        await alertsApi.create(formData);
        toast.success('Alerta creada');
      }

      setShowCreateDialog(false);
      setEditingAlert(null);
      resetForm();
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (alert: OnCallAlertRuleDto) => {
    try {
      await alertsApi.update(alert.id, { isEnabled: !alert.isEnabled });
      await loadData();
      toast.success(alert.isEnabled ? 'Alerta deshabilitada' : 'Alerta habilitada');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const handleDelete = async (alert: OnCallAlertRuleDto) => {
    try {
      setDeleting(true);
      await alertsApi.delete(alert.id);
      toast.success('Alerta eliminada');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddRecipient = async () => {
    if (!selectedAlertId || !newRecipientEmail) {
      toast.error('Email es requerido');
      return;
    }

    try {
      setAddingRecipient(true);
      await alertsApi.addRecipient(selectedAlertId, newRecipientEmail, newRecipientName);
      toast.success('Destinatario agregado');
      setNewRecipientEmail('');
      setNewRecipientName('');
      setShowRecipientDialog(false);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAddingRecipient(false);
    }
  };

  const handleRemoveRecipient = async (alertId: number, recipientId: number) => {
    try {
      await alertsApi.removeRecipient(alertId, recipientId);
      toast.success('Destinatario eliminado');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      alertType: 'ScheduleGenerated',
      conditionDays: undefined,
      recipients: [],
    });
  };

  const openEdit = (alert: OnCallAlertRuleDto) => {
    setFormData({
      name: alert.name,
      description: alert.description || '',
      alertType: alert.alertType,
      conditionDays: alert.conditionDays,
      recipients: [],
    });
    setEditingAlert(alert);
    setShowCreateDialog(true);
  };

  const getAlertTypeLabel = (type: string) => {
    return alertTypes.find(t => t.value === type)?.label || type;
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
              <Bell className="h-6 w-6 text-rose-500" />
              Alertas por Email
            </h1>
            <p className="text-muted-foreground">
              Configura las notificaciones automáticas por correo
            </p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Alerta
        </Button>
      </div>

      {/* Lista de alertas */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No hay alertas configuradas
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className={!alert.isEnabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={alert.isEnabled}
                      onCheckedChange={() => handleToggle(alert)}
                    />
                    <div>
                      <CardTitle className="text-base">{alert.name}</CardTitle>
                      <CardDescription>
                        {getAlertTypeLabel(alert.alertType)}
                        {alert.conditionDays && ` - ${alert.conditionDays} días`}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(alert)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive"
                      onClick={() => setDeleteConfirm(alert)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {alert.description && (
                  <p className="text-sm text-muted-foreground mb-3">{alert.description}</p>
                )}
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Destinatarios</span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => {
                        setSelectedAlertId(alert.id);
                        setShowRecipientDialog(true);
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Agregar
                    </Button>
                  </div>
                  
                  {alert.recipients.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">
                      Sin destinatarios configurados
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {alert.recipients.map((recipient) => (
                        <Badge 
                          key={recipient.id} 
                          variant={recipient.isEnabled ? 'secondary' : 'outline'}
                          className="gap-1"
                        >
                          <Mail className="h-3 w-3" />
                          {recipient.name || recipient.email}
                          <button 
                            onClick={() => handleRemoveRecipient(alert.id, recipient.id)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialog crear/editar alerta */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        if (!open) {
          setEditingAlert(null);
          resetForm();
        }
        setShowCreateDialog(open);
      }}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingAlert ? 'Editar Alerta' : 'Nueva Alerta'}
            </DialogTitle>
            <DialogDescription>
              Configura una regla de notificación automática
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ej: Alerta de días restantes"
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Alerta</Label>
              <Select 
                value={formData.alertType} 
                onValueChange={(v) => setFormData({ ...formData, alertType: v })}
                disabled={!!editingAlert}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {alertTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formData.alertType === 'DaysRemaining' && (
              <div className="space-y-2">
                <Label>Días de anticipación</Label>
                <Input
                  type="number"
                  value={formData.conditionDays || ''}
                  onChange={(e) => setFormData({ ...formData, conditionDays: parseInt(e.target.value) || undefined })}
                  placeholder="Ej: 7"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descripción opcional de la alerta"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingAlert ? 'Guardar Cambios' : 'Crear Alerta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog agregar destinatario */}
      <Dialog open={showRecipientDialog} onOpenChange={setShowRecipientDialog}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agregar Destinatario</DialogTitle>
            <DialogDescription>
              Agrega un email que recibirá esta alerta
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={newRecipientEmail}
                onChange={(e) => setNewRecipientEmail(e.target.value)}
                placeholder="usuario@empresa.com"
              />
            </div>

            <div className="space-y-2">
              <Label>Nombre (opcional)</Label>
              <Input
                value={newRecipientName}
                onChange={(e) => setNewRecipientName(e.target.value)}
                placeholder="Nombre del destinatario"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecipientDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleAddRecipient} disabled={addingRecipient}>
              {addingRecipient && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar alerta?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar la alerta "{deleteConfirm?.name}"?
              También se eliminarán todos los destinatarios configurados.
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

