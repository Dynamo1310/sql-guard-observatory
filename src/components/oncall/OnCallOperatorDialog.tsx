import { useState, useEffect } from 'react';
import { Plus, GripVertical, Trash2, Users, Loader2 } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { onCallApi, OnCallOperatorDto, WhitelistUserDto } from '@/services/api';

interface OnCallOperatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operators: OnCallOperatorDto[];
  onOperatorsChange: () => void;
}

export function OnCallOperatorDialog({
  open,
  onOpenChange,
  operators,
  onOperatorsChange,
}: OnCallOperatorDialogProps) {
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [addingOperator, setAddingOperator] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [localOperators, setLocalOperators] = useState<OnCallOperatorDto[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open) {
      fetchWhitelistUsers();
      setLocalOperators([...operators]);
    }
  }, [open, operators]);

  const fetchWhitelistUsers = async () => {
    try {
      setLoading(true);
      const users = await onCallApi.getWhitelistUsers();
      setWhitelistUsers(users);
    } catch (err: any) {
      toast.error('Error al cargar usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOperator = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    try {
      setAddingOperator(true);
      await onCallApi.addOperator(selectedUserId);
      toast.success('Operador agregado exitosamente');
      setSelectedUserId('');
      onOperatorsChange();
    } catch (err: any) {
      toast.error('Error al agregar operador: ' + err.message);
    } finally {
      setAddingOperator(false);
    }
  };

  const handleRemoveOperator = async (operatorId: number) => {
    try {
      await onCallApi.removeOperator(operatorId);
      toast.success('Operador eliminado');
      onOperatorsChange();
    } catch (err: any) {
      toast.error('Error al eliminar operador: ' + err.message);
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newOperators = [...localOperators];
    const [removed] = newOperators.splice(draggedIndex, 1);
    newOperators.splice(index, 0, removed);
    setLocalOperators(newOperators);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    
    // Check if order changed
    const orderChanged = localOperators.some(
      (op, index) => op.id !== operators[index]?.id
    );

    if (orderChanged) {
      try {
        setReordering(true);
        const orders = localOperators.map((op, index) => ({
          id: op.id,
          order: index + 1,
        }));
        await onCallApi.reorderOperators(orders);
        toast.success('Orden actualizado');
        onOperatorsChange();
      } catch (err: any) {
        toast.error('Error al reordenar: ' + err.message);
        setLocalOperators([...operators]); // Revert
      } finally {
        setReordering(false);
      }
    }
  };

  const availableUsers = whitelistUsers.filter(
    (user) => !operators.some((op) => op.userId === user.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Gestionar Operadores de Guardia
          </DialogTitle>
          <DialogDescription>
            Agrega, elimina o reordena los operadores de guardia DBA. 
            El orden determina la rotación automática de las guardias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add operator */}
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar usuario..." />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay usuarios disponibles
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <span>{user.displayName}</span>
                        <span className="text-xs text-muted-foreground">({user.domainUser})</span>
                        {user.isEscalation && (
                          <Badge variant="secondary" className="text-xs">Escalamiento</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            <Button onClick={handleAddOperator} disabled={!selectedUserId || addingOperator}>
              {addingOperator ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span className="ml-2">Agregar</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Los colores de los operadores se configuran desde la página "Operadores"
          </p>

          {/* Operators list */}
          <div className="border rounded-lg divide-y">
            {localOperators.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No hay operadores configurados</p>
                <p className="text-sm">Agrega operadores para poder generar el calendario de guardias</p>
              </div>
            ) : (
              localOperators.map((operator, index) => (
                <div
                  key={operator.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-3 p-3 bg-card hover:bg-accent/50 transition-colors cursor-move ${
                    draggedIndex === index ? 'opacity-50' : ''
                  }`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="w-8 justify-center">
                    {index + 1}
                  </Badge>
                  
                  {/* Color indicator (solo visual) */}
                  <div
                    className="w-6 h-6 rounded-full border-2 border-border"
                    style={{ backgroundColor: operator.colorCode || '#3B82F6' }}
                    title={`Color: ${operator.colorCode || '#3B82F6'}`}
                  />

                  <div className="flex-1">
                    <p className="font-medium">{operator.displayName}</p>
                    <p className="text-xs text-muted-foreground">{operator.domainUser}</p>
                  </div>
                  {!operator.isActive && (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveOperator(operator.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          {reordering && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando orden...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
