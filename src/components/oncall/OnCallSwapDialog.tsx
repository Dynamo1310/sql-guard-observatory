import { useState, useEffect } from 'react';
import { CalendarDays, ArrowRightLeft, Loader2, UserCog, Info } from 'lucide-react';
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
}: OnCallSwapDialogProps) {
  const [targetUserId, setTargetUserId] = useState<string>('');
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

  const getDaysUntilStart = () => {
    if (!schedule) return 0;
    const start = new Date(schedule.weekStartDate);
    const now = new Date();
    return Math.ceil((start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const daysUntilStart = getDaysUntilStart();
  const canRequest = daysUntilStart >= 7;

  const handleSwapRequest = async () => {
    if (!schedule || !targetUserId) {
      toast.error('Selecciona un operador para el intercambio');
      return;
    }

    if (!canRequest && !isEscalation) {
      toast.error('Debes solicitar el intercambio con al menos 7 días de anticipación');
      return;
    }

    try {
      setSubmitting(true);
      await onCallApi.createSwapRequest({
        originalScheduleId: schedule.id,
        targetUserId,
        reason: reason || undefined,
      });
      toast.success('Solicitud de intercambio enviada. Se ha notificado al operador por email.');
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
            <TabsList className="grid w-full grid-cols-3">
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
              {(isEscalation || (isMySchedule && canRequest)) && (
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
                {!canRequest && !isEscalation ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Solo quedan <strong>{daysUntilStart} días</strong> hasta el inicio. 
                      Los intercambios requieren 7 días de anticipación.
                      <br /><br />
                      Usa la pestaña <strong>"Modificar"</strong> si eres escalamiento, 
                      o contacta a uno para cambios urgentes.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <AlertDescription>
                        Faltan <strong>{daysUntilStart} días</strong>. 
                        El operador seleccionado recibirá un email y deberá aprobar.
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

            {/* Modify Tab - Escalamiento o dueño con tiempo */}
            {(isEscalation || (isMySchedule && canRequest)) && (
              <TabsContent value="modify" className="space-y-4 pt-4">
                {!isEscalation && !canRequest ? (
                  <Alert variant="destructive">
                    <AlertDescription>
                      Solo los <strong>guardias de escalamiento</strong> pueden modificar 
                      guardias con menos de 7 días de anticipación.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Alert>
                      <AlertDescription>
                        {isEscalation ? (
                          <>Como <strong>escalamiento</strong>, puedes reasignar esta guardia directamente sin aprobación.</>
                        ) : (
                          <>Puedes reasignar esta guardia a otro operador. El cambio será inmediato.</>
                        )}
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
          
          {activeTab === 'swap' && isMySchedule && (canRequest || isEscalation) && (
            <Button 
              onClick={handleSwapRequest} 
              disabled={!targetUserId || submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Solicitar Intercambio
            </Button>
          )}
          
          {activeTab === 'modify' && (isEscalation || (isMySchedule && canRequest)) && (
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

