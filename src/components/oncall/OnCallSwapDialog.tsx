import { useState, useEffect } from 'react';
import { CalendarDays, ArrowRightLeft, Loader2, UserCog, Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { onCallApi, OnCallScheduleDto, OnCallOperatorDto } from '@/services/api';

interface OnCallSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: OnCallScheduleDto | null;
  operators: OnCallOperatorDto[];
  currentUserId?: string;
  currentDomainUser?: string;
  isEscalation?: boolean;
  onSwapCreated: () => void;
  /** Días mínimos de anticipación para solicitar intercambios (operadores) */
  minDaysForSwapRequest?: number;
  /** Días mínimos de anticipación para modificaciones de escalamiento */
  minDaysForEscalationModify?: number;
}

export function OnCallSwapDialog({
  open,
  onOpenChange,
  schedule,
  operators,
  currentUserId,
  currentDomainUser,
  isEscalation = false,
  onSwapCreated,
  minDaysForSwapRequest = 7,
  minDaysForEscalationModify = 0,
}: OnCallSwapDialogProps) {
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [swapScheduleId, setSwapScheduleId] = useState<string>('');
  const [targetUserSchedules, setTargetUserSchedules] = useState<OnCallScheduleDto[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('info');

  // Comparar por userId O por domainUser como fallback
  const isMySchedule = schedule?.userId === currentUserId || 
    (currentDomainUser && schedule?.domainUser?.toUpperCase() === currentDomainUser.toUpperCase());

  useEffect(() => {
    if (open) {
      setTargetUserId('');
      setSwapScheduleId('');
      setTargetUserSchedules([]);
      setNewAssigneeId('');
      setReason('');
      // Default tab based on ownership
      if (isMySchedule) {
        setActiveTab('swap');
      } else if (isEscalation) {
        setActiveTab('modify');
      } else {
        setActiveTab('info');
      }
    }
  }, [open, isMySchedule, isEscalation]);

  // Cargar guardias del usuario objetivo cuando se selecciona
  useEffect(() => {
    if (targetUserId) {
      loadTargetUserSchedules(targetUserId);
    } else {
      setTargetUserSchedules([]);
      setSwapScheduleId('');
    }
  }, [targetUserId]);

  const loadTargetUserSchedules = async (userId: string) => {
    try {
      setLoadingSchedules(true);
      const schedules = await onCallApi.getUserSchedules(userId);
      setTargetUserSchedules(schedules);
      setSwapScheduleId('');
    } catch (err: any) {
      console.error('Error cargando guardias del usuario:', err);
      setTargetUserSchedules([]);
    } finally {
      setLoadingSchedules(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const getDaysUntilStart = () => {
    if (!schedule) return 0;
    const start = new Date(schedule.weekStartDate);
    const now = new Date();
    return Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysUntilStart = getDaysUntilStart();
  const canRequestSwap = daysUntilStart >= minDaysForSwapRequest;
  const canEscalationModify = isEscalation && daysUntilStart >= minDaysForEscalationModify;

  const handleSwapRequest = async () => {
    if (!schedule || !targetUserId) {
      toast.error('Selecciona un operador para el intercambio');
      return;
    }

    if (!swapScheduleId) {
      toast.error('Selecciona qué semana del otro operador quieres a cambio (enroque)');
      return;
    }

    if (!canRequestSwap && !isEscalation) {
      toast.error(`Debes solicitar el intercambio con al menos ${minDaysForSwapRequest} días de anticipación`);
      return;
    }

    try {
      setSubmitting(true);
      await onCallApi.createSwapRequest({
        originalScheduleId: schedule.id,
        targetUserId,
        swapScheduleId: parseInt(swapScheduleId, 10),
        reason: reason || undefined,
      });
      toast.success('Solicitud de intercambio (enroque) enviada. Se ha notificado al operador por email.');
      onOpenChange(false);
      onSwapCreated();
    } catch (err: any) {
      toast.error('Error al crear solicitud: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectModify = async () => {
    if (!schedule || !newAssigneeId) {
      toast.error('Selecciona el nuevo operador asignado');
      return;
    }

    try {
      setSubmitting(true);
      await onCallApi.updateSchedule(schedule.id, newAssigneeId, reason || undefined);
      toast.success('Guardia modificada exitosamente');
      onOpenChange(false);
      onSwapCreated();
    } catch (err: any) {
      toast.error('Error al modificar guardia: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const availableOperators = operators.filter(
    (op) => op.userId !== schedule?.userId && op.isActive
  );

  const allActiveOperators = operators.filter((op) => op.isActive);

  const selectedTargetOperator = operators.find(op => op.userId === targetUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Guardia de {schedule?.displayName}
          </DialogTitle>
          <DialogDescription>
            Semana {schedule?.weekNumber} - {formatDate(schedule?.weekStartDate || '')}
          </DialogDescription>
        </DialogHeader>

        {schedule && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full ${isMySchedule && isEscalation ? 'grid-cols-3' : isMySchedule || isEscalation ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <TabsTrigger value="info">
                <Info className="h-4 w-4 mr-1" />
                Info
              </TabsTrigger>
              {isMySchedule && (
                <TabsTrigger value="swap">
                  <ArrowRightLeft className="h-4 w-4 mr-1" />
                  Intercambio
                </TabsTrigger>
              )}
              {isEscalation && (
                <TabsTrigger value="modify">
                  <UserCog className="h-4 w-4 mr-1" />
                  Modificar
                </TabsTrigger>
              )}
            </TabsList>

            {/* Info Tab */}
            <TabsContent value="info" className="space-y-4 pt-4">
              <div className="rounded-lg border p-4 bg-muted/50">
                <div className="space-y-2 text-sm">
                  <p><strong>Operador:</strong> {schedule.displayName} ({schedule.domainUser})</p>
                  <p><strong>Inicio:</strong> {formatDate(schedule.weekStartDate)}</p>
                  <p><strong>Fin:</strong> {formatDate(schedule.weekEndDate)}</p>
                  <p><strong>Semana:</strong> {schedule.weekNumber} de {schedule.year}</p>
                </div>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  {isMySchedule ? (
                    <>Esta es <strong>tu guardia</strong>. Puedes solicitar un intercambio o modificarla.</>
                  ) : isEscalation ? (
                    <>Eres <strong>guardia de escalamiento</strong>. Puedes modificar esta guardia directamente.</>
                  ) : (
                    <>Esta guardia pertenece a otro operador. Solo puedes ver la información.</>
                  )}
                </AlertDescription>
              </Alert>
            </TabsContent>

            {/* Swap Tab - Solo si es MI guardia */}
            {isMySchedule && (
              <TabsContent value="swap" className="space-y-4 pt-4">
                {!canRequestSwap && !isEscalation ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Solo quedan <strong>{daysUntilStart} días</strong> hasta el inicio. 
                      Los intercambios requieren {minDaysForSwapRequest} días de anticipación.
                      <br /><br />
                      Contacta al equipo de <strong>escalamiento</strong> para cambios urgentes.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <AlertDescription>
                        <strong>Intercambio (Enroque):</strong> Selecciona con quién quieres intercambiar 
                        y qué semana suya tomarás a cambio. Ambas guardias se intercambiarán cuando el operador apruebe.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label>Operador para el intercambio</Label>
                      <Select value={targetUserId} onValueChange={setTargetUserId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar operador..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableOperators.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No hay otros operadores disponibles
                            </div>
                          ) : (
                            availableOperators.map((op) => (
                              <SelectItem key={op.userId} value={op.userId}>
                                {op.displayName} ({op.domainUser})
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Selector de semana a intercambiar */}
                    {targetUserId && (
                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          Semana a recibir a cambio
                          {loadingSchedules && <RefreshCw className="h-3 w-3 animate-spin" />}
                        </Label>
                        {loadingSchedules ? (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-md">
                            Cargando guardias de {selectedTargetOperator?.displayName}...
                          </div>
                        ) : targetUserSchedules.length === 0 ? (
                          <div className="p-4 text-center text-sm text-muted-foreground border rounded-md bg-muted/50">
                            <p>{selectedTargetOperator?.displayName} no tiene guardias futuras disponibles para intercambiar.</p>
                            <p className="text-xs mt-1">(Se requieren al menos 7 días de anticipación)</p>
                          </div>
                        ) : (
                          <Select value={swapScheduleId} onValueChange={setSwapScheduleId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Seleccionar semana para enroque..." />
                            </SelectTrigger>
                            <SelectContent>
                              {targetUserSchedules.map((s) => (
                                <SelectItem key={s.id} value={s.id.toString()}>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="font-mono">
                                      Sem {s.weekNumber}
                                    </Badge>
                                    <span>
                                      {formatShortDate(s.weekStartDate)} - {formatShortDate(s.weekEndDate)}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    )}

                    {/* Resumen del intercambio */}
                    {targetUserId && swapScheduleId && (
                      <div className="rounded-lg border p-3 bg-primary/5 border-primary/20">
                        <p className="text-sm font-medium mb-2 text-primary">Resumen del Enroque:</p>
                        <div className="text-sm space-y-1">
                          <p>
                            <strong>Tú entregas:</strong> Semana {schedule.weekNumber} ({formatShortDate(schedule.weekStartDate)})
                          </p>
                          <p>
                            <strong>Tú recibes:</strong> Semana {targetUserSchedules.find(s => s.id.toString() === swapScheduleId)?.weekNumber} ({formatShortDate(targetUserSchedules.find(s => s.id.toString() === swapScheduleId)?.weekStartDate || '')})
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label>Motivo (opcional)</Label>
                      <Textarea
                        placeholder="Ej: Vacaciones, evento personal..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </TabsContent>
            )}

            {/* Modify Tab - Solo Escalamiento */}
            {isEscalation && (
              <TabsContent value="modify" className="space-y-4 pt-4">
                {!canEscalationModify ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      No puedes modificar esta guardia. Se requieren al menos {minDaysForEscalationModify} días de anticipación.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <AlertDescription>
                        Como <strong>escalamiento</strong>, puedes reasignar esta guardia directamente sin aprobación.
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-2">
                      <Label>Nuevo operador asignado</Label>
                      <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar nuevo operador..." />
                        </SelectTrigger>
                        <SelectContent>
                          {allActiveOperators.map((op) => (
                            <SelectItem key={op.userId} value={op.userId}>
                              {op.displayName} ({op.domainUser})
                              {op.userId === schedule.userId && ' (actual)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Motivo del cambio (opcional)</Label>
                      <Textarea
                        placeholder="Ej: Cobertura por enfermedad, emergencia..."
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={2}
                      />
                    </div>
                  </>
                )}
              </TabsContent>
            )}
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          
          {activeTab === 'swap' && isMySchedule && (canRequestSwap || isEscalation) && (
            <Button 
              onClick={handleSwapRequest} 
              disabled={!targetUserId || !swapScheduleId || submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Solicitar Enroque
            </Button>
          )}
          
          {activeTab === 'modify' && canEscalationModify && (
            <Button 
              onClick={handleDirectModify} 
              disabled={!newAssigneeId || newAssigneeId === schedule?.userId || submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UserCog className="mr-2 h-4 w-4" />
              )}
              Guardar Cambio
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
