import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bell, 
  Plus, 
  ArrowLeft,
  Trash2,
  Edit,
  Mail,
  X,
  RefreshCw,
  CheckCircle,
  XCircle,
  FileText,
  Paperclip,
  Code,
  Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { 
  alertsApi, 
  emailTemplatesApi,
  OnCallAlertRuleDto, 
  OnCallEmailTemplateDto,
  CreateAlertRuleRequest,
  CreateEmailTemplateRequest,
  EmailTemplatePlaceholderInfo,
  alertTypes
} from '@/services/api';

export default function OnCallAlerts() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('rules');
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

  // Templates de email
  const [templates, setTemplates] = useState<OnCallEmailTemplateDto[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [placeholders, setPlaceholders] = useState<EmailTemplatePlaceholderInfo[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<OnCallEmailTemplateDto | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState<OnCallEmailTemplateDto | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const [templateForm, setTemplateForm] = useState<CreateEmailTemplateRequest>({
    alertType: 'WeeklyNotification',
    name: '',
    subject: '',
    body: '',
    attachExcel: false,
    isEnabled: true,
    isScheduled: true,
    scheduleCron: '0 12 * * 3',
    scheduleDescription: 'Todos los miércoles a las 12:00',
    recipients: '',
  });

  // Test email dialog
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [testingTemplate, setTestingTemplate] = useState<OnCallEmailTemplateDto | null>(null);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  // Schedule editor state
  const [scheduleDay, setScheduleDay] = useState(3); // 0=domingo, 3=miércoles
  const [scheduleHour, setScheduleHour] = useState(12);
  const [scheduleMinute, setScheduleMinute] = useState(0);

  // Tipos de template disponibles (solo 2 - ScheduleGenerated usa formato fijo desde Reglas)
  const templateTypes = [
    { value: 'WeeklyNotification', label: 'Notificación Semanal (Miércoles 12:00)', scheduled: true, cron: '0 12 * * 3', desc: 'Todos los miércoles a las 12:00' },
    { value: 'PreWeekNotification', label: 'Aviso Previo (Martes 16:00)', scheduled: true, cron: '0 16 * * 2', desc: 'Todos los martes a las 16:00' },
  ];
  
  const [sendingNotification, setSendingNotification] = useState(false);

  // Función para convertir texto plano a HTML
  const convertPlainTextToHtml = (text: string): string => {
    if (!text) return '';
    
    // Escapar caracteres HTML especiales
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    // Convertir URLs a enlaces
    html = html.replace(
      /(https?:\/\/[^\s]+)/g, 
      '<a href="$1" style="color: #2563eb;">$1</a>'
    );
    
    // Preservar placeholders (resaltarlos visualmente)
    html = html.replace(
      /\{\{([^}]+)\}\}/g, 
      '<strong style="color: #2563eb;">{{$1}}</strong>'
    );
    
    // Convertir saltos de línea dobles en párrafos
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map(p => `<p style="margin-bottom: 12px;">${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
    
    return html;
  };

  // Formulario de alertas
  const [formData, setFormData] = useState<CreateAlertRuleRequest>({
    name: '',
    description: '',
    alertType: 'ScheduleGenerated',
    conditionDays: undefined,
    attachExcel: false,
    recipients: [],
  });

  useEffect(() => {
    loadData();
    loadTemplates();
    loadPlaceholders();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await alertsApi.getAll();
      setAlerts(data);
    } catch (err: any) {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const data = await emailTemplatesApi.getAll();
      setTemplates(data);
    } catch (err: any) {
      console.error('Error loading templates:', err);
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadPlaceholders = async () => {
    try {
      const data = await emailTemplatesApi.getPlaceholders();
      setPlaceholders(data);
    } catch (err: any) {
      console.error('Error loading placeholders:', err);
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
          attachExcel: formData.attachExcel,
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
      attachExcel: false,
      recipients: [],
    });
  };

  // Template functions
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!templateForm.name || !templateForm.subject || !templateForm.body) {
      toast.error('Nombre, asunto y cuerpo son requeridos');
      return;
    }

    // Construir cron desde los selectores
    const cronExpression = templateForm.isScheduled 
      ? `${scheduleMinute} ${scheduleHour} * * ${scheduleDay}`
      : undefined;

    try {
      setSavingTemplate(true);

      if (editingTemplate) {
        await emailTemplatesApi.update(editingTemplate.id, {
          name: templateForm.name,
          subject: templateForm.subject,
          body: templateForm.body,
          attachExcel: templateForm.attachExcel,
          isEnabled: templateForm.isEnabled ?? true,
          isScheduled: templateForm.isScheduled,
          scheduleCron: cronExpression,
          scheduleDescription: templateForm.scheduleDescription,
          recipients: templateForm.recipients,
        });
        toast.success('Template actualizado');
      } else {
        await emailTemplatesApi.create({
          ...templateForm,
          scheduleCron: cronExpression,
        });
        toast.success('Template creado');
      }

      setShowTemplateDialog(false);
      setEditingTemplate(null);
      resetTemplateForm();
      await loadTemplates();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingTemplate(false);
    }
  };

  // Función para enviar test email
  const handleSendTestEmail = async () => {
    if (!testingTemplate || !testEmailAddress) {
      toast.error('Debe especificar un email de destino');
      return;
    }

    try {
      setSendingTestEmail(true);
      const result = await emailTemplatesApi.sendTestEmail(testingTemplate.id, testEmailAddress);
      toast.success(result.message);
      setShowTestEmailDialog(false);
      setTestEmailAddress('');
      setTestingTemplate(null);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSendingTestEmail(false);
    }
  };

  // Abrir dialog de test email
  const openTestEmailDialog = (template: OnCallEmailTemplateDto) => {
    setTestingTemplate(template);
    setShowTestEmailDialog(true);
  };

  // Parsear cron existente para llenar los selectores
  const parseCronToSelectors = (cron: string | undefined) => {
    if (!cron) return;
    const parts = cron.split(' ');
    if (parts.length >= 5) {
      setScheduleMinute(parseInt(parts[0]) || 0);
      setScheduleHour(parseInt(parts[1]) || 12);
      setScheduleDay(parseInt(parts[4]) || 3);
    }
  };

  const handleDeleteTemplate = async (template: OnCallEmailTemplateDto) => {
    try {
      setDeleting(true);
      await emailTemplatesApi.delete(template.id);
      toast.success('Template eliminado');
      setDeleteTemplateConfirm(null);
      await loadTemplates();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleTemplate = async (template: OnCallEmailTemplateDto) => {
    try {
      await emailTemplatesApi.update(template.id, {
        name: template.name,
        subject: template.subject,
        body: template.body,
        attachExcel: template.attachExcel,
        isEnabled: !template.isEnabled,
        isScheduled: template.isScheduled,
        scheduleCron: template.scheduleCron,
        scheduleDescription: template.scheduleDescription,
        recipients: template.recipients,
      });
      await loadTemplates();
      toast.success(template.isEnabled ? 'Template deshabilitado' : 'Template habilitado');
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const resetTemplateForm = () => {
    setTemplateForm({
      alertType: 'WeeklyNotification',
      name: '',
      subject: '',
      body: '',
      attachExcel: false,
      isEnabled: true,
      isScheduled: false,
      scheduleCron: undefined,
      scheduleDescription: undefined,
      recipients: '',
    });
    setScheduleDay(3);
    setScheduleHour(12);
    setScheduleMinute(0);
  };

  const openEditTemplate = (template: OnCallEmailTemplateDto) => {
    setTemplateForm({
      alertType: template.alertType,
      name: template.name,
      subject: template.subject,
      body: template.body,
      attachExcel: template.attachExcel,
      isEnabled: template.isEnabled,
      isScheduled: template.isScheduled,
      scheduleCron: template.scheduleCron,
      scheduleDescription: template.scheduleDescription,
      recipients: template.recipients || '',
    });
    // Parsear el cron existente para los selectores
    parseCronToSelectors(template.scheduleCron);
    setEditingTemplate(template);
    setShowTemplateDialog(true);
  };

  // Función para enviar notificación manualmente
  const handleSendNotification = async (type: 'weekly' | 'preweek') => {
    setSendingNotification(true);
    try {
      if (type === 'weekly') {
        await emailTemplatesApi.sendWeeklyNotification();
        toast.success('Notificación semanal enviada');
      } else {
        await emailTemplatesApi.sendPreWeekNotification();
        toast.success('Aviso previo enviado');
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSendingNotification(false);
    }
  };

  const getPlaceholdersForType = (alertType: string) => {
    return placeholders.find(p => p.alertType === alertType)?.placeholders || [];
  };

  const insertPlaceholder = (placeholder: string) => {
    setTemplateForm(prev => ({
      ...prev,
      body: prev.body + placeholder,
    }));
  };

  const openEdit = (alert: OnCallAlertRuleDto) => {
    setFormData({
      name: alert.name,
      description: alert.description || '',
      alertType: alert.alertType,
      conditionDays: alert.conditionDays,
      attachExcel: alert.attachExcel,
      recipients: [],
    });
    setEditingAlert(alert);
    setShowCreateDialog(true);
  };

  const getAlertTypeLabel = (type: string) => {
    // Buscar primero en templateTypes, luego en alertTypes
    const templateType = templateTypes.find(t => t.value === type);
    if (templateType) return templateType.label;
    return alertTypes.find(t => t.value === type)?.label || type;
  };

  // Stats
  const totalAlerts = alerts.length;
  const enabledAlerts = alerts.filter(a => a.isEnabled).length;
  const disabledAlerts = alerts.filter(a => !a.isEnabled).length;
  const totalRecipients = alerts.reduce((sum, a) => sum + a.recipients.length, 0);

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-56 mb-2" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
          <Skeleton className="h-10 w-36" />
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

        {/* List Skeleton */}
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-6 w-10" />
                    <div>
                      <Skeleton className="h-5 w-40 mb-1" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-8" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-64 mb-3" />
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24" />
                  <Skeleton className="h-6 w-24" />
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
              <Bell className="h-8 w-8" />
              Notificaciones por Email
            </h1>
            <p className="text-muted-foreground">
              Configura las notificaciones automáticas por correo
            </p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="rules" className="gap-2">
              <Bell className="h-4 w-4" />
              Reglas de Alerta
            </TabsTrigger>
            <TabsTrigger value="templates" className="gap-2">
              <FileText className="h-4 w-4" />
              Templates de Email
            </TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            {activeTab === 'rules' ? (
              <>
                <Button variant="outline" onClick={loadData} disabled={loading}>
                  <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
                  Actualizar
                </Button>
                <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Alerta
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={loadTemplates} disabled={loadingTemplates}>
                  <RefreshCw className={cn('h-4 w-4 mr-2', loadingTemplates && 'animate-spin')} />
                  Actualizar
                </Button>
                <Button onClick={() => { resetTemplateForm(); setShowTemplateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Template
                </Button>
              </>
            )}
          </div>
        </div>

        <TabsContent value="rules" className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Notificaciones</CardTitle>
            <Bell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalAlerts}</div>
            <p className="text-xs text-muted-foreground">configuradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activas</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{enabledAlerts}</div>
            <p className="text-xs text-muted-foreground">habilitadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactivas</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{disabledAlerts}</div>
            <p className="text-xs text-muted-foreground">deshabilitadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Destinatarios</CardTitle>
            <Mail className="h-4 w-4 text-violet-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-500">{totalRecipients}</div>
            <p className="text-xs text-muted-foreground">emails configurados</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de alertas */}
      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-semibold mb-2">Sin alertas</p>
            <p className="text-muted-foreground">No hay alertas configuradas</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <Card key={alert.id} className={cn(!alert.isEnabled && 'opacity-60')}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={alert.isEnabled}
                      onCheckedChange={() => handleToggle(alert)}
                    />
                    <div>
                      <CardTitle className="text-base">{alert.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        {getAlertTypeLabel(alert.alertType)}
                        {alert.conditionDays && ` - ${alert.conditionDays} días`}
                        {alert.alertType === 'ScheduleGenerated' && alert.attachExcel && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Paperclip className="h-3 w-3" />
                            Excel
                          </Badge>
                        )}
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
                      className="text-destructive hover:text-destructive"
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
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          {/* Acciones rápidas de envío */}
          <Card className="border-blue-500/30 bg-blue-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-5 w-5 text-blue-500" />
                Envío Manual de Notificaciones
              </CardTitle>
              <CardDescription>
                Envía las notificaciones programadas de forma manual para testing o situaciones especiales
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4">
              <Button 
                variant="outline"
                onClick={() => handleSendNotification('weekly')}
                disabled={sendingNotification}
              >
                {sendingNotification ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
                Enviar Notificación Semanal
              </Button>
              <Button 
                variant="outline"
                onClick={() => handleSendNotification('preweek')}
                disabled={sendingNotification}
              >
                {sendingNotification ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Bell className="h-4 w-4 mr-2" />}
                Enviar Aviso Previo
              </Button>
            </CardContent>
          </Card>

          {/* Templates List */}
          {loadingTemplates ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-32" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-semibold mb-2">Sin templates</p>
                <p className="text-muted-foreground">No hay templates de email configurados</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {templates.filter(t => t.alertType !== 'ScheduleGenerated').map((template) => (
                <Card key={template.id} className={cn(!template.isEnabled && 'opacity-60')}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={template.isEnabled}
                          onCheckedChange={() => handleToggleTemplate(template)}
                        />
                        <div>
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            {template.name}
                            {template.isDefault && (
                              <Badge variant="secondary" className="text-xs">Por defecto</Badge>
                            )}
                            {template.isScheduled && (
                              <Badge variant="outline" className="text-xs gap-1 bg-amber-50 text-amber-700 border-amber-300">
                                <Bell className="h-3 w-3" />
                                {template.scheduleDescription || 'Programado'}
                              </Badge>
                            )}
                            {template.attachExcel && (
                              <Badge variant="outline" className="text-xs gap-1">
                                <Paperclip className="h-3 w-3" />
                                Excel
                              </Badge>
                            )}
                          </CardTitle>
                          <CardDescription>
                            {getAlertTypeLabel(template.alertType)}
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openTestEmailDialog(template)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Test
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => openEditTemplate(template)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!template.isDefault && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTemplateConfirm(template)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Asunto:</Label>
                        <p className="text-sm font-medium">{template.subject}</p>
                      </div>
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-1 p-0 h-auto">
                            <Code className="h-3 w-3" />
                            Ver cuerpo del email
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="mt-2">
                          <div className="bg-muted rounded-md p-3 text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto">
                            <pre className="whitespace-pre-wrap">{template.body}</pre>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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

            {formData.alertType === 'ScheduleGenerated' && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Switch
                  id="attachExcelRule"
                  checked={formData.attachExcel || false}
                  onCheckedChange={(v) => setFormData({ ...formData, attachExcel: v })}
                />
                <Label htmlFor="attachExcelRule" className="text-sm cursor-pointer">
                  <div className="flex items-center gap-1">
                    <Paperclip className="h-4 w-4" />
                    Adjuntar Excel del calendario
                  </div>
                  <p className="text-xs text-muted-foreground font-normal">
                    El archivo Excel con el calendario completo se adjuntará al email
                  </p>
                </Label>
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
                {saving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
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
              {addingRecipient && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
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
              {deleting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog crear/editar template */}
      <Dialog open={showTemplateDialog} onOpenChange={(open) => {
        if (!open) {
          setEditingTemplate(null);
          resetTemplateForm();
          setShowPreview(false);
        }
        setShowTemplateDialog(open);
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editingTemplate ? 'Editar Template' : 'Nuevo Template de Email'}
            </DialogTitle>
            <DialogDescription>
              Configura el contenido del email. Usa los placeholders disponibles para contenido dinámico.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSaveTemplate} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre del Template *</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  placeholder="Ej: Notificación de Calendario Generado"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de Template</Label>
                <Select 
                  value={templateForm.alertType} 
                  onValueChange={(v) => {
                    const type = templateTypes.find(t => t.value === v);
                    setTemplateForm({ 
                      ...templateForm, 
                      alertType: v,
                      isScheduled: type?.scheduled || false,
                      scheduleCron: type?.cron,
                      scheduleDescription: type?.desc,
                    });
                  }}
                  disabled={!!editingTemplate}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Asunto del Email *</Label>
              <Input
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                placeholder="Ej: [SQLNova] Nuevo calendario de guardias generado"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Cuerpo del Email *</Label>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  {showPreview ? 'Editar' : 'Vista previa'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Escribe el mensaje en texto plano. Los saltos de línea se respetarán automáticamente.
              </p>
              
              {showPreview ? (
                <div 
                  className="border rounded-md p-4 min-h-[200px] bg-white text-black overflow-auto"
                  dangerouslySetInnerHTML={{ __html: convertPlainTextToHtml(templateForm.body) }}
                />
              ) : (
                <Textarea
                  value={templateForm.body}
                  onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                  placeholder="Escriba aquí el contenido del email...&#10;&#10;Puede usar placeholders como {{OperatorName}} que serán reemplazados automáticamente.&#10;&#10;Los saltos de línea se convertirán en párrafos."
                  rows={10}
                />
              )}
            </div>

            {/* Placeholders disponibles */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" type="button" className="w-full justify-start">
                  <Code className="h-4 w-4 mr-2" />
                  Ver placeholders disponibles
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <Card>
                  <CardContent className="pt-4">
                    <div className="grid gap-2">
                      {getPlaceholdersForType(templateForm.alertType).length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No hay placeholders disponibles para este tipo de alerta
                        </p>
                      ) : (
                        getPlaceholdersForType(templateForm.alertType).map((ph) => (
                          <div key={ph.key} className="flex items-center justify-between p-2 rounded bg-muted/50">
                            <div>
                              <code className="text-sm font-mono text-primary">{ph.key}</code>
                              <p className="text-xs text-muted-foreground">{ph.description}</p>
                              {ph.example && (
                                <p className="text-xs text-muted-foreground italic">Ej: {ph.example}</p>
                              )}
                            </div>
                            <Button 
                              type="button" 
                              variant="ghost" 
                              size="sm"
                              onClick={() => insertPlaceholder(ph.key)}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Configuración de Recipients */}
            <div className="space-y-2">
              <Label>Destinatarios (separados por ; o ,)</Label>
              <Textarea
                value={templateForm.recipients || ''}
                onChange={(e) => setTemplateForm({ ...templateForm, recipients: e.target.value })}
                placeholder="email1@ejemplo.com; email2@ejemplo.com"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Si no se especifican, se usarán los destinatarios de las reglas de alerta correspondientes.
              </p>
            </div>

            {/* Configuración de Schedule */}
            {(templateForm.alertType === 'WeeklyNotification' || templateForm.alertType === 'PreWeekNotification') && (
              <Card className="border-amber-500/50 bg-amber-50/30">
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-amber-700">
                      <Bell className="h-4 w-4" />
                      <span className="font-medium">Envío Programado</span>
                    </div>
                    <Switch
                      checked={templateForm.isScheduled}
                      onCheckedChange={(v) => setTemplateForm({ ...templateForm, isScheduled: v })}
                    />
                  </div>
                  
                  {templateForm.isScheduled && (
                    <div className="space-y-4">
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label className="text-amber-700">Día de la semana</Label>
                          <Select 
                            value={scheduleDay.toString()} 
                            onValueChange={(v) => setScheduleDay(parseInt(v))}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">Domingo</SelectItem>
                              <SelectItem value="1">Lunes</SelectItem>
                              <SelectItem value="2">Martes</SelectItem>
                              <SelectItem value="3">Miércoles</SelectItem>
                              <SelectItem value="4">Jueves</SelectItem>
                              <SelectItem value="5">Viernes</SelectItem>
                              <SelectItem value="6">Sábado</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-amber-700">Hora</Label>
                          <Select 
                            value={scheduleHour.toString()} 
                            onValueChange={(v) => setScheduleHour(parseInt(v))}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}:00
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-amber-700">Minuto</Label>
                          <Select 
                            value={scheduleMinute.toString()} 
                            onValueChange={(v) => setScheduleMinute(parseInt(v))}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {[0, 15, 30, 45].map(m => (
                                <SelectItem key={m} value={m.toString()}>
                                  :{m.toString().padStart(2, '0')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-amber-700">Descripción del schedule</Label>
                        <Input
                          value={templateForm.scheduleDescription || ''}
                          onChange={(e) => setTemplateForm({ ...templateForm, scheduleDescription: e.target.value })}
                          placeholder="Ej: Todos los miércoles a las 12:00"
                          className="bg-white"
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="attachExcel"
                  checked={templateForm.attachExcel}
                  onCheckedChange={(v) => setTemplateForm({ ...templateForm, attachExcel: v })}
                  disabled={templateForm.alertType !== 'ScheduleGenerated'}
                />
                <Label htmlFor="attachExcel" className="text-sm cursor-pointer">
                  <div className="flex items-center gap-1">
                    <Paperclip className="h-4 w-4" />
                    Adjuntar Excel del calendario
                  </div>
                  <p className="text-xs text-muted-foreground font-normal">
                    Solo disponible para "Calendario Generado"
                  </p>
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="isEnabled"
                  checked={templateForm.isEnabled}
                  onCheckedChange={(v) => setTemplateForm({ ...templateForm, isEnabled: v })}
                />
                <Label htmlFor="isEnabled" className="text-sm cursor-pointer">
                  Template activo
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowTemplateDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingTemplate}>
                {savingTemplate && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                {editingTemplate ? 'Guardar Cambios' : 'Crear Template'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación de eliminación de template */}
      <AlertDialog open={!!deleteTemplateConfirm} onOpenChange={() => setDeleteTemplateConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar template?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar el template "{deleteTemplateConfirm?.name}"?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateConfirm && handleDeleteTemplate(deleteTemplateConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
            >
              {deleting && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog para enviar test email */}
      <Dialog open={showTestEmailDialog} onOpenChange={(open) => {
        if (!open) {
          setTestingTemplate(null);
          setTestEmailAddress('');
        }
        setShowTestEmailDialog(open);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Enviar Email de Prueba
            </DialogTitle>
            <DialogDescription>
              Envía un email de prueba usando el template "{testingTemplate?.name}" a una dirección específica.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email de destino *</Label>
              <Input
                type="email"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                placeholder="tu@email.com"
              />
              <p className="text-xs text-muted-foreground">
                El email se enviará con los datos de la próxima guardia programada y el prefijo [TEST] en el asunto.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowTestEmailDialog(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSendTestEmail} 
              disabled={sendingTestEmail || !testEmailAddress}
            >
              {sendingTestEmail && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Enviar Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
