import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Plus, 
  Trash2, 
  GripVertical, 
  ArrowLeft,
  RefreshCw,
  UserPlus,
  Save,
  Palette,
  Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
import { ColorPickerDialog, ColorPickerButton } from '@/components/ui/color-picker';
import { toast } from 'sonner';
import { onCallApi, OnCallOperatorDto, WhitelistUserDto } from '@/services/api';
import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

export default function OnCallOperators() {
  const navigate = useNavigate();
  const [operators, setOperators] = useState<OnCallOperatorDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#3b82f6');
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingPhoneId, setEditingPhoneId] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnCallOperatorDto | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingColorId, setUpdatingColorId] = useState<number | null>(null);
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<OnCallOperatorDto | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

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
      await onCallApi.addOperator(selectedUserId, selectedColor, selectedPhone || undefined);
      toast.success('Operador agregado');
      setSelectedUserId('');
      setSelectedColor('#3b82f6');
      setSelectedPhone('');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handlePhoneChange = async (operatorId: number, newPhone: string) => {
    try {
      await onCallApi.updateOperatorPhone(operatorId, newPhone || undefined);
      setOperators(prev => prev.map(op => 
        op.id === operatorId ? { ...op, phoneNumber: newPhone || undefined } : op
      ));
      toast.success('Teléfono actualizado');
      setEditingPhoneId(null);
    } catch (err: any) {
      toast.error('Error al actualizar teléfono: ' + err.message);
    }
  };

  const handleColorChange = async (operatorId: number, newColor: string) => {
    try {
      setUpdatingColorId(operatorId);
      await onCallApi.updateOperatorColor(operatorId, newColor);
      // Actualizar localmente sin recargar
      setOperators(prev => prev.map(op => 
        op.id === operatorId ? { ...op, colorCode: newColor } : op
      ));
      toast.success('Color actualizado');
    } catch (err: any) {
      toast.error('Error al actualizar color: ' + err.message);
    } finally {
      setUpdatingColorId(null);
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

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, operator: OnCallOperatorDto, index: number) => {
    setDraggedItem(operator);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    setTimeout(() => {
      (e.target as HTMLElement).style.opacity = '0.5';
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent) => {
    (e.target as HTMLElement).style.opacity = '1';
    setDraggedItem(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    
    if (dragIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }

    const newOperators = [...operators];
    const [removed] = newOperators.splice(dragIndex, 1);
    newOperators.splice(dropIndex, 0, removed);
    
    // Actualizar órdenes
    const updatedOperators = newOperators.map((op, idx) => ({
      ...op,
      rotationOrder: idx + 1
    }));
    
    setOperators(updatedOperators);
    setHasChanges(true);
    setDragOverIndex(null);
  };

  const handleCancelChanges = () => {
    loadData();
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

  const activeOperators = operators.filter(o => o.isActive).length;
  const inactiveOperators = operators.filter(o => !o.isActive).length;

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6 max-w-3xl">
        {/* Header Skeleton */}
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>

        {/* KPIs Skeleton */}
        <div className="grid gap-4 grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-12 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-10" />
            </div>
          </CardContent>
        </Card>

        {/* List Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Users className="h-8 w-8" />
              Operadores de Guardia
            </h1>
            <p className="text-muted-foreground">
              Gestiona los operadores y su orden de rotación
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleCancelChanges} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={saveOrder} disabled={saving}>
                {saving ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar Orden
              </Button>
            </>
          )}
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores Activos</CardTitle>
            <Users className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500">{activeOperators}</div>
            <p className="text-xs text-muted-foreground">en rotación</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Operadores Inactivos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-muted-foreground">{inactiveOperators}</div>
            <p className="text-xs text-muted-foreground">fuera de rotación</p>
          </CardContent>
        </Card>
      </div>

      {/* Agregar operador */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Agregar Operador
          </CardTitle>
          <CardDescription>
            Selecciona un usuario de la lista blanca y asignale un color para el calendario
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
          
          {/* Color y teléfono para nuevo operador */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Color picker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Palette className="h-4 w-4" />
                Color del operador
              </Label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowColorPicker(true)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border hover:border-primary transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  style={{ backgroundColor: selectedColor }}
                  title="Seleccionar color"
                />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-mono uppercase">{selectedColor}</p>
                </div>
              </div>
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4" />
                Teléfono
              </Label>
              <Input
                value={selectedPhone}
                onChange={(e) => setSelectedPhone(e.target.value)}
                placeholder="Ej: 11-2657-3198"
                className="font-mono"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialog de color picker para nuevo operador */}
      <ColorPickerDialog
        open={showColorPicker}
        onOpenChange={setShowColorPicker}
        color={selectedColor}
        onColorChange={setSelectedColor}
        title="Color del Nuevo Operador"
        description="Arrastrá el puntero sobre el cuadrado para seleccionar cualquier color de la gama RGB completa"
      />

      {/* Lista de operadores */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-cyan-500" />
                Orden de Rotación
              </CardTitle>
              <CardDescription>
                Arrastrá y soltá para reordenar. El orden determina la asignación de guardias.
              </CardDescription>
            </div>
            {hasChanges && (
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                Cambios sin guardar
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {operators.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2">Sin operadores</p>
              <p className="text-muted-foreground">No hay operadores configurados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {operators.map((operator, index) => (
                <div
                  key={operator.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, operator, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-all cursor-grab active:cursor-grabbing',
                    dragOverIndex === index && 'border-primary bg-primary/5 border-dashed',
                    draggedItem?.id === operator.id && 'opacity-50',
                    !dragOverIndex && !draggedItem && 'bg-card hover:bg-accent/50'
                  )}
                >
                  <div className="text-muted-foreground hover:text-foreground">
                    <GripVertical className="h-5 w-5" />
                  </div>
                  
                  <div 
                    className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm text-white"
                    style={{ backgroundColor: operator.colorCode || '#3b82f6' }}
                  >
                    {operator.rotationOrder}
                  </div>
                  
                  <UserAvatar
                    photoUrl={operator.profilePhotoUrl}
                    displayName={operator.displayName}
                    domainUser={operator.domainUser}
                    size="sm"
                  />
                  
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{operator.displayName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{operator.domainUser}</span>
                      {operator.phoneNumber && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{operator.phoneNumber}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edición de teléfono */}
                  {editingPhoneId === operator.id ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editingPhoneValue}
                        onChange={(e) => setEditingPhoneValue(e.target.value)}
                        placeholder="Teléfono"
                        className="h-8 w-28 font-mono text-xs"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handlePhoneChange(operator.id, editingPhoneValue);
                          if (e.key === 'Escape') setEditingPhoneId(null);
                        }}
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePhoneChange(operator.id, editingPhoneValue)}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditingPhoneId(operator.id);
                        setEditingPhoneValue(operator.phoneNumber || '');
                      }}
                      title="Editar teléfono"
                    >
                      <Phone className="h-4 w-4" />
                    </Button>
                  )}

                  {!operator.isActive && (
                    <Badge variant="secondary">Inactivo</Badge>
                  )}

                  {/* Color picker para operador existente */}
                  <ColorPickerButton
                    color={operator.colorCode || '#3b82f6'}
                    onChange={(newColor) => handleColorChange(operator.id, newColor)}
                    disabled={updatingColorId === operator.id}
                    className={updatingColorId === operator.id ? 'animate-pulse' : ''}
                    title={`Cambiar color de ${operator.displayName}`}
                    dialogTitle={`Color de ${operator.displayName}`}
                    dialogDescription="Arrastrá el puntero sobre el cuadrado para seleccionar cualquier color de la gama RGB completa"
                  />

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleteConfirm(operator)}
                    disabled={deletingId === operator.id}
                  >
                    {deletingId === operator.id ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
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
