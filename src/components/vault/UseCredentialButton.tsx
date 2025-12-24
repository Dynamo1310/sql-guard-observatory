/**
 * Botón para usar una credencial sin revelar el password
 * Enterprise v2.1.1 - El secreto nunca sale del backend
 */
import { useState } from 'react';
import { Plug, Server, Loader2, Check, AlertCircle } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { vaultApi, CredentialServerDto } from '@/services/vaultApi';
import { toast } from 'sonner';

interface UseCredentialButtonProps {
  credentialId: number;
  credentialName?: string;
  servers?: CredentialServerDto[];
  onSuccess?: (usageId: string) => void;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showLabel?: boolean;
}

export function UseCredentialButton({
  credentialId,
  credentialName,
  servers = [],
  onSuccess,
  variant = 'outline',
  size = 'sm',
  showLabel = true
}: UseCredentialButtonProps) {
  const [open, setOpen] = useState(false);
  const [targetServer, setTargetServer] = useState('');
  const [targetInstance, setTargetInstance] = useState('');
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message?: string } | null>(null);

  const canSubmit = targetServer.length > 0;

  const handleUse = async () => {
    if (!canSubmit) return;

    setLoading(true);
    setResult(null);
    
    try {
      const response = await vaultApi.useCredential(credentialId, {
        targetServer,
        targetInstance: targetInstance || undefined,
        purpose: purpose || undefined
      });
      
      if (response.success) {
        setResult({ success: true, message: response.message || 'Credencial usada exitosamente' });
        toast.success('Credencial usada', {
          description: 'La operación se completó sin revelar la contraseña.'
        });
        onSuccess?.(response.usageId);
      } else {
        setResult({ success: false, message: 'No se pudo usar la credencial' });
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message });
      toast.error('Error', {
        description: error.message || 'Error al usar la credencial'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setTargetServer('');
    setTargetInstance('');
    setPurpose('');
    setResult(null);
  };

  const handleServerSelect = (value: string) => {
    const server = servers.find(s => s.fullServerName === value);
    if (server) {
      setTargetServer(server.serverName);
      setTargetInstance(server.instanceName || '');
    } else {
      setTargetServer(value);
      setTargetInstance('');
    }
  };

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plug className="h-4 w-4" />
        {showLabel && <span className="ml-2">Usar sin revelar</span>}
      </Button>

      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="w-[95vw] max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Usar credencial sin revelar
            </DialogTitle>
            <DialogDescription>
              {credentialName && (
                <span className="font-medium">{credentialName}</span>
              )}
            </DialogDescription>
          </DialogHeader>

          <Alert className="border-blue-200 bg-blue-50">
            <Server className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              La contraseña será usada internamente sin revelarse.
              Esta acción quedará registrada en el historial de auditoría.
            </AlertDescription>
          </Alert>

          {result ? (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {result.success ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span>{result.message}</span>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="targetServer">Servidor destino</Label>
                {servers.length > 0 ? (
                  <Select onValueChange={handleServerSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar servidor" />
                    </SelectTrigger>
                    <SelectContent>
                      {servers.map((server) => (
                        <SelectItem key={server.id} value={server.fullServerName}>
                          <div className="flex items-center gap-2">
                            <Server className="h-4 w-4" />
                            {server.fullServerName}
                            {server.connectionPurpose && (
                              <span className="text-muted-foreground">
                                ({server.connectionPurpose})
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="targetServer"
                    value={targetServer}
                    onChange={(e) => setTargetServer(e.target.value)}
                    placeholder="Nombre del servidor"
                  />
                )}
              </div>

              {servers.length === 0 && (
                <div className="space-y-2">
                  <Label htmlFor="targetInstance">Instancia (opcional)</Label>
                  <Input
                    id="targetInstance"
                    value={targetInstance}
                    onChange={(e) => setTargetInstance(e.target.value)}
                    placeholder="Nombre de la instancia"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="purpose">Propósito (opcional)</Label>
                <Textarea
                  id="purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  placeholder="Describe para qué vas a usar esta credencial"
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {result ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!result && (
              <Button 
                onClick={handleUse} 
                disabled={loading || !canSubmit}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Usando...
                  </>
                ) : (
                  <>
                    <Plug className="h-4 w-4 mr-2" />
                    Usar credencial
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UseCredentialButton;

