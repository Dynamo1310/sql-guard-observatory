/**
 * Configuración de Notificaciones de Parcheo
 * Configura las notificaciones por email T-48h, T-2h, T+fin
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell, Save, RefreshCw, Mail, Clock, Users, History, Send, CheckCircle2, XCircle
} from 'lucide-react';
import { patchConfigApi, PatchNotificationSettingDto, PatchNotificationHistoryDto } from '@/services/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const NOTIFICATION_TYPES = {
  'T48h': { label: 'T-48h', description: 'Recordatorio 48 horas antes', icon: Clock, color: 'text-blue-500' },
  'T2h': { label: 'T-2h', description: 'Alerta 2 horas antes', icon: Bell, color: 'text-yellow-500' },
  'TFin': { label: 'T+Fin', description: 'Notificación al finalizar ventana', icon: CheckCircle2, color: 'text-green-500' },
};

const RECIPIENT_TYPES = {
  'Operator': 'Solo operador',
  'Cell': 'Solo célula',
  'Owner': 'Solo owner',
  'All': 'Todos',
};

export default function PatchNotificationsConfig() {
  const queryClient = useQueryClient();
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<PatchNotificationSettingDto>>({});

  // Query para configuración
  const { data: settings, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['notificationSettings'],
    queryFn: () => patchConfigApi.getNotificationSettings(),
    staleTime: 5 * 60 * 1000,
  });

  // Query para historial
  const { data: history } = useQuery({
    queryKey: ['notificationHistory'],
    queryFn: () => patchConfigApi.getNotificationHistory(undefined, 20),
    staleTime: 2 * 60 * 1000,
  });

  // Mutation para guardar
  const saveMutation = useMutation({
    mutationFn: (data: Partial<PatchNotificationSettingDto>) => 
      patchConfigApi.updateNotificationSetting({
        notificationType: data.notificationType!,
        isEnabled: data.isEnabled!,
        hoursBefore: data.hoursBefore,
        recipientType: data.recipientType!,
        emailSubjectTemplate: data.emailSubjectTemplate,
        emailBodyTemplate: data.emailBodyTemplate,
        description: data.description,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationSettings'] });
      toast.success('Configuración guardada');
      setEditingType(null);
    },
    onError: (error: any) => {
      toast.error(error.message || 'Error al guardar');
    },
  });

  // Abrir edición
  const handleEdit = (setting: PatchNotificationSettingDto) => {
    setEditingType(setting.notificationType);
    setEditForm(setting);
  };

  // Cancelar edición
  const handleCancel = () => {
    setEditingType(null);
    setEditForm({});
  };

  // Guardar
  const handleSave = () => {
    saveMutation.mutate(editForm);
  };

  // Toggle rápido de habilitado
  const handleToggle = (setting: PatchNotificationSettingDto) => {
    saveMutation.mutate({
      ...setting,
      isEnabled: !setting.isEnabled,
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-8 w-8 text-primary" />
            Configuración de Notificaciones
          </h1>
          <p className="text-muted-foreground mt-1">
            Configura las notificaciones de parcheo por email
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
      </div>

      {/* Configuración de notificaciones */}
      <div className="grid gap-4">
        {settings?.map(setting => {
          const typeInfo = NOTIFICATION_TYPES[setting.notificationType as keyof typeof NOTIFICATION_TYPES];
          const isEditing = editingType === setting.notificationType;
          const Icon = typeInfo?.icon || Bell;

          return (
            <Card key={setting.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={cn("h-5 w-5", typeInfo?.color)} />
                    <div>
                      <CardTitle className="text-lg">{typeInfo?.label}</CardTitle>
                      <CardDescription>{typeInfo?.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch 
                      checked={setting.isEnabled}
                      onCheckedChange={() => handleToggle(setting)}
                      disabled={saveMutation.isPending}
                    />
                    {!isEditing && (
                      <Button variant="outline" size="sm" onClick={() => handleEdit(setting)}>
                        Editar
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {isEditing ? (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Destinatarios</Label>
                      <Select 
                        value={editForm.recipientType} 
                        onValueChange={(v) => setEditForm({ ...editForm, recipientType: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(RECIPIENT_TYPES).map(([value, label]) => (
                            <SelectItem key={value} value={value}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Horas antes</Label>
                      <Input 
                        type="number"
                        value={editForm.hoursBefore || ''}
                        onChange={(e) => setEditForm({ ...editForm, hoursBefore: parseInt(e.target.value) || undefined })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Asunto del email</Label>
                    <Input 
                      value={editForm.emailSubjectTemplate || ''}
                      onChange={(e) => setEditForm({ ...editForm, emailSubjectTemplate: e.target.value })}
                      placeholder="[SQL Nova] Notificación - {ServerName}"
                    />
                    <p className="text-xs text-muted-foreground">
                      Variables: {'{ServerName}'}, {'{ScheduledDate}'}, {'{WindowStart}'}, {'{WindowEnd}'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Descripción</Label>
                    <Input 
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={handleCancel}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saveMutation.isPending}>
                      {saveMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Guardar
                    </Button>
                  </div>
                </CardContent>
              ) : (
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Destinatarios:</span>
                      <span className="ml-2 font-medium">
                        {RECIPIENT_TYPES[setting.recipientType as keyof typeof RECIPIENT_TYPES] || setting.recipientType}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Horas antes:</span>
                      <span className="ml-2 font-medium">{setting.hoursBefore || 0}h</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Estado:</span>
                      <Badge className="ml-2" variant={setting.isEnabled ? "default" : "secondary"}>
                        {setting.isEnabled ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Historial de notificaciones */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Notificaciones
          </CardTitle>
          <CardDescription>Últimas notificaciones enviadas</CardDescription>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Servidor</TableHead>
                    <TableHead>Destinatario</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {new Date(h.sentAt).toLocaleString('es-ES')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{h.notificationType}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{h.serverName}</TableCell>
                      <TableCell className="text-sm">{h.recipientEmail}</TableCell>
                      <TableCell>
                        {h.wasSuccessful ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay notificaciones enviadas aún</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
