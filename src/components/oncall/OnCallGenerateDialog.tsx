import { useState } from 'react';
import { Calendar, Wand2, Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { onCallApi, OnCallOperatorDto } from '@/services/api';

interface OnCallGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operators: OnCallOperatorDto[];
  onScheduleGenerated: () => void;
}

export function OnCallGenerateDialog({
  open,
  onOpenChange,
  operators,
  onScheduleGenerated,
}: OnCallGenerateDialogProps) {
  const [startDate, setStartDate] = useState(() => {
    // Find next Wednesday
    const today = new Date();
    const daysUntilWednesday = (3 - today.getDay() + 7) % 7 || 7;
    const nextWednesday = new Date(today);
    nextWednesday.setDate(today.getDate() + daysUntilWednesday);
    return nextWednesday.toISOString().split('T')[0];
  });
  const [weeksToGenerate, setWeeksToGenerate] = useState(52);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (operators.length === 0) {
      toast.error('Primero debes agregar operadores de guardia');
      return;
    }

    try {
      setGenerating(true);
      await onCallApi.generateSchedule(startDate, weeksToGenerate);
      toast.success(`Calendario generado: ${weeksToGenerate} semanas`);
      onOpenChange(false);
      onScheduleGenerated();
    } catch (err: any) {
      toast.error('Error al generar calendario: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const activeOperators = operators.filter((op) => op.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Generar Calendario de Guardias
          </DialogTitle>
          <DialogDescription>
            Genera automáticamente el calendario de guardias siguiendo el orden de rotación configurado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {operators.length === 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No hay operadores configurados. Primero debes agregar operadores de guardia.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {/* Rotation order preview */}
              <div className="rounded-lg border p-4 bg-muted/50">
                <p className="text-sm font-medium mb-2">Orden de rotación:</p>
                <div className="flex flex-wrap gap-2">
                  {activeOperators.map((op, index) => (
                    <span 
                      key={op.id} 
                      className="inline-flex items-center gap-1 text-sm bg-primary/10 text-primary px-2 py-1 rounded"
                    >
                      <span className="font-bold">{index + 1}.</span>
                      {op.displayName}
                    </span>
                  ))}
                </div>
              </div>

              {/* Start date */}
              <div className="space-y-2">
                <Label htmlFor="startDate">Fecha de inicio (debe ser miércoles)</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Las guardias inician los miércoles a las 19:00
                </p>
              </div>

              {/* Weeks to generate */}
              <div className="space-y-2">
                <Label htmlFor="weeks">Semanas a generar</Label>
                <Input
                  id="weeks"
                  type="number"
                  min={1}
                  max={104}
                  value={weeksToGenerate}
                  onChange={(e) => setWeeksToGenerate(parseInt(e.target.value) || 52)}
                />
                <p className="text-xs text-muted-foreground">
                  Recomendado: 52 semanas (1 año). Máximo: 104 semanas (2 años).
                </p>
              </div>

              {/* Summary */}
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription>
                  Se generarán <strong>{weeksToGenerate} semanas</strong> de guardias 
                  rotando entre <strong>{activeOperators.length} operadores</strong>.
                  <br />
                  Cada operador tendrá aproximadamente <strong>
                    {Math.floor(weeksToGenerate / activeOperators.length)} guardias
                  </strong>.
                </AlertDescription>
              </Alert>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <strong>Atención:</strong> Esto reemplazará todas las guardias futuras existentes 
                  desde la fecha de inicio seleccionada.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button 
            onClick={handleGenerate} 
            disabled={operators.length === 0 || generating}
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generando...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Generar Calendario
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

