import { useState, useEffect } from 'react';
import { ShieldAlert, Plus, Trash2, Loader2, AlertTriangle } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { onCallApi, EscalationUserDto, WhitelistUserDto } from '@/services/api';

interface OnCallEscalationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEscalationChange: () => void;
}

export function OnCallEscalationDialog({
  open,
  onOpenChange,
  onEscalationChange,
}: OnCallEscalationDialogProps) {
  const [escalationUsers, setEscalationUsers] = useState<EscalationUserDto[]>([]);
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUserDto[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [escalation, whitelist] = await Promise.all([
        onCallApi.getEscalationUsers(),
        onCallApi.getWhitelistUsers(),
      ]);
      setEscalationUsers(escalation);
      setWhitelistUsers(whitelist);
    } catch (err: any) {
      toast.error('Error al cargar datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEscalation = async () => {
    if (!selectedUserId) {
      toast.error('Selecciona un usuario');
      return;
    }

    try {
      setAdding(true);
      await onCallApi.addEscalationUser(selectedUserId);
      toast.success('Usuario agregado como guardia de escalamiento');
      setSelectedUserId('');
      await loadData();
      onEscalationChange();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveEscalation = async (userId: string) => {
    try {
      setRemovingId(userId);
      await onCallApi.removeEscalationUser(userId);
      toast.success('Usuario removido de guardia de escalamiento');
      await loadData();
      onEscalationChange();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setRemovingId(null);
    }
  };

  const availableUsers = whitelistUsers.filter(
    (user) => !escalationUsers.some((e) => e.userId === user.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-500" />
            Gestionar Guardias de Escalamiento
          </DialogTitle>
          <DialogDescription>
            Los guardias de escalamiento pueden modificar cualquier guardia sin límite de tiempo,
            incluso con menos de 7 días de anticipación.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Add escalation user */}
              <div className="flex gap-2">
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Seleccionar usuario para agregar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.length === 0 ? (
                      <div className="p-4 text-center text-sm text-muted-foreground">
                        No hay usuarios disponibles para agregar
                      </div>
                    ) : (
                      availableUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <span>{user.displayName}</span>
                            <span className="text-xs text-muted-foreground">({user.domainUser})</span>
                            {user.isOperator && (
                              <Badge variant="outline" className="text-xs">Operador</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button onClick={handleAddEscalation} disabled={!selectedUserId || adding}>
                  {adding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  <span className="ml-2">Agregar</span>
                </Button>
              </div>

              {/* Current escalation users */}
              <div className="border rounded-lg divide-y">
                {escalationUsers.length === 0 ? (
                  <Alert variant="destructive" className="m-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      No hay guardias de escalamiento configurados. 
                      Debe haber al menos uno para gestionar cambios urgentes.
                    </AlertDescription>
                  </Alert>
                ) : (
                  escalationUsers.map((user) => (
                    <div
                      key={user.userId}
                      className="flex items-center gap-3 p-3 bg-card"
                    >
                      <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <ShieldAlert className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{user.displayName}</p>
                        <p className="text-xs text-muted-foreground">{user.domainUser}</p>
                        {user.email && (
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveEscalation(user.userId)}
                        disabled={removingId === user.userId || escalationUsers.length <= 1}
                        className="text-destructive hover:text-destructive"
                        title={escalationUsers.length <= 1 ? 'Debe haber al menos un escalamiento' : 'Quitar de escalamiento'}
                      >
                        {removingId === user.userId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>

              {/* Info */}
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  <strong>Permisos de escalamiento:</strong>
                  <ul className="list-disc list-inside mt-1 text-sm">
                    <li>Modificar cualquier guardia sin límite de tiempo</li>
                    <li>Aprobar o rechazar intercambios de cualquier operador</li>
                    <li>Gestionar la lista de guardias de escalamiento</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </>
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

