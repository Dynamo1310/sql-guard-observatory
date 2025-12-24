/**
 * Botón para actualizar el secreto guardado (MANUAL)
 * Enterprise v2.1.1 - NO cambia la password en el servidor destino
 */
import { useState } from 'react';
import { KeyRound, AlertTriangle, Loader2 } from 'lucide-react';
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
import { vaultApi } from '@/services/vaultApi';
import { toast } from 'sonner';

interface UpdateSecretButtonProps {
  credentialId: number;
  credentialName?: string;
  onSuccess?: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function UpdateSecretButton({
  credentialId,
  credentialName,
  onSuccess,
  variant = 'outline',
  size = 'sm',
  showLabel = true
}: UpdateSecretButtonProps) {
  const [open, setOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = newPassword.length > 0 && passwordsMatch;

  const handleUpdate = async () => {
    if (!canSubmit) return;

    setLoading(true);
    try {
      const result = await vaultApi.updateSecret(credentialId, newPassword);
      
      if (result.success) {
        toast.success('Contraseña actualizada', {
          description: result.message
        });
        setOpen(false);
        setNewPassword('');
        setConfirmPassword('');
        onSuccess?.();
      } else {
        toast.error('Error', {
          description: result.message || 'No se pudo actualizar la contraseña'
        });
      }
    } catch (error: any) {
      toast.error('Error', {
        description: error.message || 'Error al actualizar la contraseña'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <KeyRound className="h-4 w-4" />
        {showLabel && <span className="ml-2">Actualizar contraseña</span>}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Actualizar contraseña guardada
            </DialogTitle>
            <DialogDescription>
              {credentialName && (
                <span className="font-medium">{credentialName}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-amber-500 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              <strong>IMPORTANTE:</strong> Esto NO cambia la contraseña en el servidor destino.
              Solo actualiza lo almacenado en el Vault.
              <br />
              <span className="text-sm">
                Usá esto cuando ya cambiaste la contraseña en el servidor y querés sincronizar el Vault.
              </span>
            </AlertDescription>
          </Alert>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ingresá la nueva contraseña"
                autoComplete="new-password"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar contraseña</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repetí la contraseña"
                autoComplete="new-password"
                className={confirmPassword && !passwordsMatch ? 'border-red-500' : ''}
              />
              {confirmPassword && !passwordsMatch && (
                <p className="text-sm text-red-500">Las contraseñas no coinciden</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={loading}>
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdate} 
              disabled={loading || !canSubmit}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                'Actualizar en Vault'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UpdateSecretButton;

