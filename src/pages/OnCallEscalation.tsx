import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  ArrowLeft,
  Loader2,
  GripVertical,
  Save,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

export default function OnCallEscalation() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();
  const [escalationUsers, setEscalationUsers] = useState<EscalationUserDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<EscalationUserDto | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEscalation, setIsEscalation] = useState(false);
  
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
      
      // Ya viene ordenado del backend por EscalationOrder
      setEscalationUsers(escalation);
      setWhitelistUsers(whitelist);
      
      // Verificar si el usuario actual es escalamiento
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
      await onCallApi.addEscalationUser(selectedUserId);
      toast.success('Usuario agregado a escalamiento');
      setSelectedUserId('');
      await loadData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
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
    // Add a slight delay to show the dragging state
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
    
    // Update order numbers
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
      <div className="container py-6 flex items-center justify-center h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/oncall')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-amber-500" />
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar Orden
              </Button>
            </>
          )}
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </div>
      </div>

      {/* Info Alert */}
      <Alert className="border-amber-500/50 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-200">
          Los usuarios de escalamiento pueden modificar cualquier guardia sin restricción de tiempo.
          {canManage ? ' Arrastrá y soltá para cambiar el orden de prioridad.' : ''}
        </AlertDescription>
      </Alert>

      {/* Add User - Solo si puede gestionar */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agregar Usuario de Escalamiento</CardTitle>
            <CardDescription>
              Selecciona un usuario de la lista blanca para agregarlo como escalamiento
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-[300px]">
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
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Agregar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Escalation Users List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Usuarios de Escalamiento</CardTitle>
              <CardDescription>
                {escalationUsers.length} usuario{escalationUsers.length !== 1 ? 's' : ''} con permisos de escalamiento
                {canManage && ' • Arrastrá para reordenar'}
              </CardDescription>
            </div>
            {hasChanges && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                Cambios sin guardar
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {escalationUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay usuarios de escalamiento configurados</p>
            </div>
          ) : (
            <div className="space-y-2">
              {escalationUsers.map((user, index) => (
                <div
                  key={user.userId}
                  draggable={canManage}
                  onDragStart={(e) => canManage && handleDragStart(e, user, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => canManage && handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => canManage && handleDrop(e, index)}
                  className={`
                    flex items-center gap-4 p-4 rounded-lg border transition-all
                    ${canManage ? 'cursor-grab active:cursor-grabbing' : ''}
                    ${dragOverIndex === index ? 'border-primary bg-primary/5 border-dashed' : 'bg-muted/30'}
                    ${draggedItem?.userId === user.userId ? 'opacity-50' : ''}
                  `}
                >
                  {canManage && (
                    <div className="text-muted-foreground hover:text-foreground">
                      <GripVertical className="h-5 w-5" />
                    </div>
                  )}
                  
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/20 text-amber-600 font-bold text-sm">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1">
                    <div className="font-medium">{user.displayName}</div>
                    <div className="text-sm text-muted-foreground">{user.domainUser}</div>
                    {user.email && (
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    )}
                  </div>
                  
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                    Escalamiento #{index + 1}
                  </Badge>
                  
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(user)}
                      disabled={deletingId === user.userId}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      {deletingId === user.userId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
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
