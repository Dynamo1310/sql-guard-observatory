import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Plus, 
  Trash2, 
  GripVertical, 
  ArrowLeft,
  Loader2,
  UserPlus,
  Save
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { onCallApi, OnCallOperatorDto, WhitelistUserDto } from '@/services/api';

export default function OnCallOperators() {
  const navigate = useNavigate();
  const [operators, setOperators] = useState<OnCallOperatorDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallOperatorDto | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ops, users] = await Promise.all([
        onCallApi.getOperators(),
        onCallApi.getWhitelistUsers(),
      ]);
      setOperators(ops.sort((a, b) => a.rotationOrder - b.rotationOrder));
      setWhitelistUsers(users);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const availableUsers = whitelistUsers.filter(
    (user) => !operators.some((op) => op.userId === user.id)
  );

  const handleAdd = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    try {
      setAdding(true);
      await onCallApi.addOperator(selectedUserId);
      toast.success('Operador agregado');
      setSelectedUserId('');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (operator: OnCallOperatorDto) => {
    try {
      setDeletingId(operator.id);
      await onCallApi.removeOperator(operator.id);
      toast.success('Operador eliminado');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const moveOperator = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= operators.length) return;

    const newOperators = [...operators];
    [newOperators[index], newOperators[newIndex]] = [newOperators[newIndex], newOperators[index]];
    
    // Actualizar órdenes
    newOperators.forEach((op, idx) => {
      op.rotationOrder = idx + 1;
    });

    setOperators(newOperators);
    setHasChanges(true);
  };

  const saveOrder = async () => {
    try {
      setSaving(true);
      await onCallApi.reorderOperators(
        operators.map(op => ({ operatorId: op.id, newOrder: op.rotationOrder }))
      );
      toast.success('Orden guardado');
      setHasChanges(false);
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-blue-500" />
            Operadores de Guardia
          </h1>
          <p className="text-muted-foreground">
            Gestiona los operadores y su orden de rotación
          </p>
        </div>
      </div>

      {/* Agregar operador */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Agregar Operador
          </CardTitle>
          <CardDescription>
            Selecciona un usuario de la lista blanca para agregarlo como operador
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Seleccionar usuario..." />
              </SelectTrigger>
              <SelectContent>
                {availableUsers.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No hay usuarios disponibles
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.displayName} ({user.domainUser})
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <Button onClick={handleAdd} disabled={!selectedUserId || adding}>
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de operadores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Orden de Rotación</CardTitle>
              <CardDescription>
                Arrastra para reordenar. El orden determina la asignación de guardias.
              </CardDescription>
            </div>
            {hasChanges && (
              <Button onClick={saveOrder} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar Orden
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay operadores configurados
            </div>
          ) : (
            <div className="space-y-2">
              {operators.map((operator, index) => (
                <div
                  key={operator.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveOperator(index, 'up')}
                      disabled={index === 0}
                    >
                      <GripVertical className="h-3 w-3 rotate-90" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => moveOperator(index, 'down')}
                      disabled={index === operators.length - 1}
                    >
                      <GripVertical className="h-3 w-3 rotate-90" />
                    </Button>
                  </div>
                  
                  <Badge variant="outline" className="w-8 justify-center">
                    {operator.rotationOrder}
                  </Badge>
                  
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
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteConfirm(operator)}
                    disabled={deletingId === operator.id}
                  >
                    {deletingId === operator.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de confirmación */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar operador?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar a{' '}
              <strong>{deleteConfirm?.displayName}</strong> de la lista de operadores?
              Las guardias asignadas no se verán afectadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}






