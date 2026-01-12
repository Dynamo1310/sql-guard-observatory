import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  ArrowLeft,
  GripVertical,
  Save,
  AlertTriangle,
  RefreshCw,
  Users,
  Palette,
  Phone
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ColorPickerDialog, ColorPickerButton } from '@/components/ui/color-picker';
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
import { onCallApi, EscalationUserDto, WhitelistUserDto } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

export default function OnCallEscalation() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [escalationUsers, setEscalationUsers] = useState<EscalationUserDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedColor, setSelectedColor] = useState<string>('#f59e0b');
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EscalationUserDto | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEscalation, setIsEscalation] = useState(false);
  const [editingPhoneId, setEditingPhoneId] = useState<number | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState<string>('');
  const [updatingColorId, setUpdatingColorId] = useState<number | null>(null);
  
  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<EscalationUserDto | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [escalation, whitelist, currentOnCall] = await Promise.all([
        onCallApi.getEscalationUsers(),
        onCallApi.getWhitelistUsers(),
        onCallApi.getCurrentOnCall(),
      ]);
      
      setEscalationUsers(escalation);
      setWhitelistUsers(whitelist);
      
      const isUserEscalation = currentOnCall.escalationUsers?.some(
        e => e.userId === user?.id || e.domainUser?.toUpperCase() === user?.domainUser?.toUpperCase()
      );
      setIsEscalation(isUserEscalation || false);
      setHasChanges(false);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const canManage = isEscalation || isSuperAdmin;

  const availableUsers = whitelistUsers.filter(
    (user) => !escalationUsers.some((e) => e.userId === user.id)
  );

  const handleAdd = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    try {
      setAdding(true);
      await onCallApi.addEscalationUser(selectedUserId, selectedColor, selectedPhone || undefined);
      toast.success('Usuario agregado a escalamiento');
      setSelectedUserId('');
      setSelectedColor('#f59e0b');
      setSelectedPhone('');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleColorChange = async (escalationId: number, newColor: string) => {
    try {
      setUpdatingColorId(escalationId);
      await onCallApi.updateEscalationUser(escalationId, newColor, undefined);
      setEscalationUsers(prev => prev.map(u => 
        u.id === escalationId ? { ...u, colorCode: newColor } : u
      ));
      toast.success('Color actualizado');
    } catch (err: any) {
      toast.error('Error al actualizar color: ' + err.message);
    } finally {
      setUpdatingColorId(null);
    }
  };

  const handlePhoneChange = async (escalationId: number, newPhone: string) => {
    try {
      await onCallApi.updateEscalationUser(escalationId, undefined, newPhone || undefined);
      setEscalationUsers(prev => prev.map(u => 
        u.id === escalationId ? { ...u, phoneNumber: newPhone || undefined } : u
      ));
      toast.success('Teléfono actualizado');
      setEditingPhoneId(null);
    } catch (err: any) {
      toast.error('Error al actualizar teléfono: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      setDeletingId(deleteConfirm.userId);
      await onCallApi.removeEscalationUser(deleteConfirm.userId);
      toast.success('Usuario removido de escalamiento');
      setDeleteConfirm(null);
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (e: React.DragEvent, user: EscalationUserDto, index: number) => {
    setDraggedItem(user);
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

    const newUsers = [...escalationUsers];
    const [removed] = newUsers.splice(dragIndex, 1);
    newUsers.splice(dropIndex, 0, removed);
    
    const updatedUsers = newUsers.map((user, idx) => ({
      ...user,
      order: idx + 1
    }));
    
    setEscalationUsers(updatedUsers);
    setHasChanges(true);
    setDragOverIndex(null);
  };

  const handleSaveOrder = async () => {
    try {
      setSaving(true);
      const userIds = escalationUsers.map(u => u.userId);
      await onCallApi.updateEscalationOrder(userIds);
      toast.success('Orden guardado correctamente');
      setHasChanges(false);
    } catch (err: any) {
      toast.error('Error al guardar orden: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelChanges = () => {
    loadData();
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* Alert Skeleton */}
        <Skeleton className="h-16 w-full" />

        {/* KPI Skeleton */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-8 w-12 mb-1" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>

        {/* Add Card Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-80" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Skeleton className="h-10 w-[300px]" />
              <Skeleton className="h-10 w-24" />
            </div>
          </CardContent>
        </Card>

        {/* List Skeleton */}
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
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
              <ShieldAlert className="h-8 w-8" />
              Guardia de Escalamiento
            </h1>
            <p className="text-muted-foreground">
              Usuarios con permisos especiales para modificar guardias sin restricción de tiempo
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {hasChanges && (
            <>
              <Button variant="outline" onClick={handleCancelChanges} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOrder} disabled={saving}>
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

      {/* Info Alert */}
      <Alert className="border-warning/50 bg-warning/5">
        <AlertTriangle className="h-4 w-4 text-warning" />
        <AlertDescription className="text-foreground">
          Los usuarios de escalamiento pueden modificar cualquier guardia sin restricción de tiempo.
          {canManage ? ' Arrastrá y soltá para cambiar el orden de prioridad.' : ''}
        </AlertDescription>
      </Alert>

      {/* KPI Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Usuarios de Escalamiento</CardTitle>
          <ShieldAlert className="h-4 w-4 text-warning" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-warning">{escalationUsers.length}</div>
          <p className="text-xs text-muted-foreground">con permisos especiales</p>
        </CardContent>
      </Card>

      {/* Add User - Solo si puede gestionar */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Agregar Usuario de Escalamiento
            </CardTitle>
            <CardDescription>
              Selecciona un usuario de la lista blanca para agregarlo como escalamiento
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Seleccionar usuario..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      No hay usuarios disponibles
                    </SelectItem>
                  ) : (
                    availableUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.displayName} ({user.domainUser})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} disabled={adding || !selectedUserId}>
                {adding ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Agregar
              </Button>
            </div>
            
            {/* Color y teléfono para nuevo usuario */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Color picker */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Palette className="h-4 w-4" />
                  Color
                </Label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowColorPicker(true)}
                    className="w-10 h-10 rounded-lg cursor-pointer border-2 border-border hover:border-primary transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{ backgroundColor: selectedColor }}
                    title="Seleccionar color"
                  />
                  <span className="text-xs text-muted-foreground font-mono uppercase">{selectedColor}</span>
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
      )}

      {/* Dialog de color picker */}
      <ColorPickerDialog
        open={showColorPicker}
        onOpenChange={setShowColorPicker}
        color={selectedColor}
        onColorChange={setSelectedColor}
        title="Color del Usuario de Escalamiento"
        description="Arrastrá el puntero sobre el cuadrado para seleccionar cualquier color de la gama RGB completa"
      />

      {/* Escalation Users List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-warning" />
                Lista de Escalamiento
              </CardTitle>
              <CardDescription>
                {escalationUsers.length} usuario{escalationUsers.length !== 1 ? 's' : ''} con permisos de escalamiento
                {canManage && ' • Arrastrá para reordenar'}
              </CardDescription>
            </div>
            {hasChanges && (
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">
                Cambios sin guardar
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {escalationUsers.length === 0 ? (
            <div className="text-center py-12">
              <ShieldAlert className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold mb-2">Sin usuarios de escalamiento</p>
              <p className="text-muted-foreground">No hay usuarios de escalamiento configurados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {escalationUsers.map((escUser, index) => (
                <div
                  key={escUser.userId}
                  draggable={canManage}
                  onDragStart={(e) => canManage && handleDragStart(e, escUser, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => canManage && handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => canManage && handleDrop(e, index)}
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-lg border transition-all',
                    canManage && 'cursor-grab active:cursor-grabbing',
                    dragOverIndex === index && 'border-primary bg-primary/5 border-dashed',
                    draggedItem?.userId === escUser.userId && 'opacity-50',
                    !dragOverIndex && !draggedItem && 'bg-muted/30 hover:bg-accent/50'
                  )}
                >
                  {canManage && (
                    <div className="text-muted-foreground hover:text-foreground">
                      <GripVertical className="h-5 w-5" />
                    </div>
                  )}
                  
                  <div 
                    className="flex items-center justify-center w-8 h-8 rounded-full font-bold text-sm text-white"
                    style={{ backgroundColor: escUser.colorCode || '#f59e0b' }}
                  >
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{escUser.displayName}</div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{escUser.domainUser}</span>
                      {escUser.phoneNumber && (
                        <>
                          <span>•</span>
                          <span className="font-mono">{escUser.phoneNumber}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Edición de teléfono */}
                  {canManage && (
                    editingPhoneId === escUser.id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          value={editingPhoneValue}
                          onChange={(e) => setEditingPhoneValue(e.target.value)}
                          placeholder="Teléfono"
                          className="h-8 w-28 font-mono text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handlePhoneChange(escUser.id, editingPhoneValue);
                            if (e.key === 'Escape') setEditingPhoneId(null);
                          }}
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handlePhoneChange(escUser.id, editingPhoneValue)}
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
                          setEditingPhoneId(escUser.id);
                          setEditingPhoneValue(escUser.phoneNumber || '');
                        }}
                        title="Editar teléfono"
                      >
                        <Phone className="h-4 w-4" />
                      </Button>
                    )
                  )}
                  
                  {/* Color picker */}
                  {canManage && (
                    <ColorPickerButton
                      color={escUser.colorCode || '#f59e0b'}
                      onChange={(newColor) => handleColorChange(escUser.id, newColor)}
                      disabled={updatingColorId === escUser.id}
                      className={updatingColorId === escUser.id ? 'animate-pulse' : ''}
                      title={`Cambiar color de ${escUser.displayName}`}
                      dialogTitle={`Color de ${escUser.displayName}`}
                      dialogDescription="Arrastrá el puntero sobre el cuadrado para seleccionar cualquier color de la gama RGB completa"
                    />
                  )}
                  
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(escUser)}
                      disabled={deletingId === escUser.userId}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {deletingId === escUser.userId ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario de escalamiento?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de querer eliminar a <strong>{deleteConfirm?.displayName}</strong> ({deleteConfirm?.domainUser}) de la guardia de escalamiento?
              <br /><br />
              Este usuario ya no podrá modificar guardias sin restricción de tiempo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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
