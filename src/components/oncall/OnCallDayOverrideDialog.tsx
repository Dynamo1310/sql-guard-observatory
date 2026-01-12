import { useState, useEffect } from 'react';
import { CalendarDays, UserCog, Loader2, ShieldAlert } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { onCallApi, OnCallOperatorDto } from '@/services/api';

interface OnCallDayOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: Date | null;
  originalOperator?: {
    userId: string;
    displayName: string;
  };
  operators: OnCallOperatorDto[];
  onOverrideCreated: () => void;
}

export function OnCallDayOverrideDialog({
  open,
  onOpenChange,
  selectedDate,
  originalOperator,
  operators,
  onOverrideCreated,
}: OnCallDayOverrideDialogProps) {
  const [coverUserId, setCoverUserId] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCoverUserId('');
      setReason('');
    }
  }, [open]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-AR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const handleSubmit = async () => {
    if (!selectedDate || !coverUserId) {
      toast.error('Selecciona un operador de cobertura');
      return;
    }

    try {
      setSubmitting(true);
      await onCallApi.createDayOverride({
        date: selectedDate.toISOString(),
        coverUserId,
        reason: reason || undefined,
      });
      toast.success('Cobertura de día creada exitosamente');
      onOpenChange(false);
      onOverrideCreated();
    } catch (err: any) {
      toast.error('Error al crear cobertura: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrar operadores (excluir el original si existe)
  const availableOperators = operators.filter(
    (op) => op.isActive && op.userId !== originalOperator?.userId
  );

  const selectedOperator = operators.find(op => op.userId === coverUserId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Cobertura de Día
          </DialogTitle>
          <DialogDescription>
            Asignar un operador diferente solo para este día específico
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Información del día */}
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="flex items-center gap-2 mb-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-medium">Fecha a cubrir</span>
            </div>
            <p className="text-sm">
              {selectedDate ? formatDate(selectedDate) : 'No seleccionada'}
            </p>
            {originalOperator && (
              <p className="text-sm text-muted-foreground mt-1">
                Operador original: <strong>{originalOperator.displayName}</strong>
              </p>
            )}
          </div>

          <Alert>
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              Esta acción es solo para <strong>Team Escalamiento</strong>. 
              El operador seleccionado cubrirá la guardia únicamente este día.
            </AlertDescription>
          </Alert>

          {/* Selector de operador de cobertura */}
          <div className="space-y-2">
            <Label>Operador de cobertura</Label>
            <Select value={coverUserId} onValueChange={setCoverUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar operador..." />
              </SelectTrigger>
              <SelectContent>
                {availableOperators.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay operadores disponibles
                  </div>
                ) : (
                  availableOperators.map((op) => (
                    <SelectItem key={op.userId} value={op.userId}>
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: op.colorCode || '#ccc' }}
                        />
                        {op.displayName}
                        {op.phoneNumber && (
                          <span className="text-xs text-muted-foreground">
                            ({op.phoneNumber})
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Vista previa del operador seleccionado */}
          {selectedOperator && (
            <div 
              className="rounded-lg border p-3"
              style={{ 
                borderColor: selectedOperator.colorCode || '#ccc',
                borderLeftWidth: '4px',
              }}
            >
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4" />
                <span className="font-medium">{selectedOperator.displayName}</span>
              </div>
              {selectedOperator.phoneNumber && (
                <p className="text-sm text-muted-foreground mt-1">
                  📞 {selectedOperator.phoneNumber}
                </p>
              )}
            </div>
          )}

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Textarea
              placeholder="Ej: Cobertura por evento personal, enfermedad..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!coverUserId || submitting}
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="mr-2 h-4 w-4" />
            )}
            Crear Cobertura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



