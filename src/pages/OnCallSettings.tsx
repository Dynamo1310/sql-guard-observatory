import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Settings, 
  ArrowLeft, 
  Shield, 
  Calendar, 
  Plus, 
  Edit, 
  Trash2, 
  Loader2,
  Check,
  X,
  CalendarDays,
  RefreshCcw,
  ArrowRightLeft,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { 
  onCallApi, 
  OnCallConfigDto, 
  OnCallHolidayDto,
  WhitelistUserDto
} from '@/services/api';
import { groupsApi, SecurityGroup } from '@/services/api';

export default function OnCallSettings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<OnCallConfigDto | null>(null);
  const [holidays, setHolidays] = useState<OnCallHolidayDto[]>([]);
  const [groups, setGroups] = useState<SecurityGroup[]>([]);
  const [groupUsers, setGroupUsers] = useState<WhitelistUserDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  
  // Config form state
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [approverGroupId, setApproverGroupId] = useState<string>('');
  const [approverId, setApproverId] = useState<string>('__none__');
  const [minDaysForSwapRequest, setMinDaysForSwapRequest] = useState<number>(7);
  const [minDaysForEscalationModify, setMinDaysForEscalationModify] = useState<number>(0);
  
  // Holiday dialog state
  const [showHolidayDialog, setShowHolidayDialog] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<OnCallHolidayDto | null>(null);
  const [holidayForm, setHolidayForm] = useState({
    date: '',
    name: '',
    isRecurring: false,
  });
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallHolidayDto | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (config) {
      setRequiresApproval(config.requiresApproval);
      setApproverGroupId(config.approverGroupId?.toString() || '');
      setApproverId(config.approverId || '__none__');
      setMinDaysForSwapRequest(config.minDaysForSwapRequest ?? 7);
      setMinDaysForEscalationModify(config.minDaysForEscalationModify ?? 0);
    }
  }, [config]);

  useEffect(() => {
    if (approverGroupId) {
      loadGroupUsers(parseInt(approverGroupId, 10));
    } else {
      setGroupUsers([]);
    }
  }, [approverGroupId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [configData, holidaysData, groupsData, usersData] = await Promise.all([
        onCallApi.getConfig(),
        onCallApi.getHolidays(),
        groupsApi.getGroups(),
        onCallApi.getWhitelistUsers(),
      ]);
      setConfig(configData);
      setHolidays(holidaysData);
      setGroups(groupsData);
      setWhitelistUsers(usersData);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupUsers = async (groupId: number) => {
    try {
      // Filtrar usuarios que pertenecen al grupo seleccionado
      // En este caso, usamos los usuarios de la whitelist
      // En producción, podrías tener un endpoint específico
      const usersInGroup = whitelistUsers.filter(u => u.isEscalation);
      setGroupUsers(usersInGroup);
    } catch (err: any) {
      console.error('Error loading group users:', err);
    }
  };

  const handleSaveConfig = async () => {
    try {
      setSaving(true);
      await onCallApi.updateConfig({
        requiresApproval,
        approverId: approverId && approverId !== '__none__' ? approverId : undefined,
        approverGroupId: approverGroupId ? parseInt(approverGroupId, 10) : undefined,
        minDaysForSwapRequest,
        minDaysForEscalationModify,
      });
      toast.success('Configuración guardada exitosamente');
      await loadData();
    } catch (err: any) {
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const openHolidayDialog = (holiday?: OnCallHolidayDto) => {
    if (holiday) {
      setEditingHoliday(holiday);
      setHolidayForm({
        date: new Date(holiday.date).toISOString().split('T')[0],
        name: holiday.name,
        isRecurring: holiday.isRecurring,
      });
    } else {
      setEditingHoliday(null);
      setHolidayForm({
        date: new Date().toISOString().split('T')[0],
        name: '',
        isRecurring: false,
      });
    }
    setShowHolidayDialog(true);
  };

  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayForm.name || !holidayForm.date) {
      toast.error('Completa todos los campos');
      return;
    }

    try {
      setSavingHoliday(true);
      if (editingHoliday) {
        await onCallApi.updateHoliday(editingHoliday.id, {
          date: holidayForm.date,
          name: holidayForm.name,
          isRecurring: holidayForm.isRecurring,
        });
        toast.success('Feriado actualizado');
      } else {
        await onCallApi.createHoliday({
          date: holidayForm.date,
          name: holidayForm.name,
          isRecurring: holidayForm.isRecurring,
        });
        toast.success('Feriado creado');
      }
      setShowHolidayDialog(false);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async () => {
    if (!deleteConfirm) return;
    try {
      await onCallApi.deleteHoliday(deleteConfirm.id);
      toast.success('Feriado eliminado');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Configuración de Guardias
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestiona la aprobación de calendarios y los feriados
          </p>
        </div>
      </div>

      <Tabs defaultValue="swaps" className="space-y-6">
        <TabsList>
          <TabsTrigger value="swaps" className="flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" />
            Intercambios
          </TabsTrigger>
          <TabsTrigger value="approval" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Aprobación
          </TabsTrigger>
          <TabsTrigger value="holidays" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Feriados
          </TabsTrigger>
        </TabsList>

        {/* Tab de Intercambios */}
        <TabsContent value="swaps" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Configuración de Intercambios
              </CardTitle>
              <CardDescription>
                Define los días mínimos de anticipación para solicitar intercambios y modificaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                {/* Días mínimos para operadores */}
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <Label className="text-base font-medium">Intercambios (Operadores)</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Días mínimos de anticipación para que los operadores soliciten intercambios de guardia
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      max="30"
                      value={minDaysForSwapRequest}
                      onChange={(e) => setMinDaysForSwapRequest(parseInt(e.target.value, 10) || 0)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">días</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    Los operadores no podrán solicitar intercambios si faltan menos de {minDaysForSwapRequest} días para el inicio de la guardia
                  </p>
                </div>

                {/* Días mínimos para escalamiento */}
                <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-orange-500" />
                    <Label className="text-base font-medium">Modificaciones (Escalamiento)</Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Días mínimos de anticipación para que el equipo de escalamiento modifique guardias
                  </p>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min="0"
                      max="30"
                      value={minDaysForEscalationModify}
                      onChange={(e) => setMinDaysForEscalationModify(parseInt(e.target.value, 10) || 0)}
                      className="w-24"
                    />
                    <span className="text-sm text-muted-foreground">días</span>
                  </div>
                  <p className="text-xs text-muted-foreground italic">
                    {minDaysForEscalationModify === 0 
                      ? 'El equipo de escalamiento puede modificar guardias en cualquier momento'
                      : `El equipo de escalamiento no podrá modificar guardias si faltan menos de ${minDaysForEscalationModify} días`
                    }
                  </p>
                </div>
              </div>

              {config?.updatedAt && (
                <div className="text-sm text-muted-foreground">
                  Última actualización: {formatDate(config.updatedAt)}
                  {config.updatedByDisplayName && ` por ${config.updatedByDisplayName}`}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Guardar Configuración
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Aprobación */}
        <TabsContent value="approval" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Aprobación de Calendario
              </CardTitle>
              <CardDescription>
                Configura si el calendario de guardias generado requiere aprobación de un líder antes de ser efectivo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-base font-medium">Requerir aprobación</Label>
                  <p className="text-sm text-muted-foreground">
                    Los calendarios generados deberán ser aprobados antes de entrar en vigor
                  </p>
                </div>
                <Switch
                  checked={requiresApproval}
                  onCheckedChange={setRequiresApproval}
                />
              </div>

              {requiresApproval && (
                <div className="space-y-4 p-4 rounded-lg border bg-primary/5 border-primary/20">
                  <div className="space-y-2">
                    <Label>Grupo de aprobadores</Label>
                    <Select value={approverGroupId} onValueChange={setApproverGroupId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar grupo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {groups.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Los usuarios de este grupo podrán aprobar calendarios
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Aprobador principal (opcional)</Label>
                    <Select value={approverId} onValueChange={setApproverId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar aprobador..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin aprobador específico</SelectItem>
                        {whitelistUsers.filter(u => u.isEscalation).map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.displayName} ({user.domainUser})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Si se selecciona, este usuario será notificado para aprobar
                    </p>
                  </div>
                </div>
              )}

              {config?.updatedAt && (
                <div className="text-sm text-muted-foreground">
                  Última actualización: {formatDate(config.updatedAt)}
                  {config.updatedByDisplayName && ` por ${config.updatedByDisplayName}`}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={saving}>
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Check className="mr-2 h-4 w-4" />
                      Guardar Configuración
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Feriados */}
        <TabsContent value="holidays" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Gestión de Feriados
                  </CardTitle>
                  <CardDescription>
                    Los feriados se muestran en el calendario y pueden afectar la planificación
                  </CardDescription>
                </div>
                <Button onClick={() => openHolidayDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nuevo Feriado
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {holidays.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No hay feriados configurados</p>
                  <p className="text-sm">Agrega feriados para que aparezcan en el calendario</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {holidays.map((holiday) => (
                      <TableRow key={holiday.id}>
                        <TableCell className="font-medium">
                          {new Date(holiday.date).toLocaleDateString('es-AR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </TableCell>
                        <TableCell>{holiday.name}</TableCell>
                        <TableCell>
                          {holiday.isRecurring ? (
                            <Badge variant="secondary" className="gap-1">
                              <RefreshCcw className="h-3 w-3" />
                              Anual
                            </Badge>
                          ) : (
                            <Badge variant="outline">Único</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openHolidayDialog(holiday)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteConfirm(holiday)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog para crear/editar feriado */}
      <Dialog open={showHolidayDialog} onOpenChange={setShowHolidayDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingHoliday ? 'Editar Feriado' : 'Nuevo Feriado'}
            </DialogTitle>
            <DialogDescription>
              {editingHoliday 
                ? 'Modifica los datos del feriado' 
                : 'Agrega un nuevo feriado al calendario'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveHoliday} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={holidayForm.date}
                onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                placeholder="Ej: Día de la Independencia"
                required
              />
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg border">
              <div className="space-y-0.5">
                <Label className="font-medium">Feriado anual</Label>
                <p className="text-xs text-muted-foreground">
                  Se repite cada año en la misma fecha
                </p>
              </div>
              <Switch
                checked={holidayForm.isRecurring}
                onCheckedChange={(v) => setHolidayForm({ ...holidayForm, isRecurring: v })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowHolidayDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={savingHoliday}>
                {savingHoliday ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar feriado?</AlertDialogTitle>
            <AlertDialogDescription>
              Estás a punto de eliminar el feriado "{deleteConfirm?.name}". 
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteHoliday} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

